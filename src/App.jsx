import { useEffect, useMemo, useState, useRef } from "react";
import "./App.css";
import { supabase } from "./supabase";
import Login from "./Login";
import { exportComprehensiveReport } from "./reportExports";
import IntegratedExportModal from "./IntegratedExportModal";
import VisionSPC from "./VisionSPC";
import IssueManagement from "./IssueManagement";
import IntegratedIssueCenter from "./IntegratedIssueCenter";
import Quotations from "./Quotations";
import { PasteZone, PasteEntry } from "./PasteZone";
import ManpowerManagement, { ProjectManpowerModal } from "./ManpowerManagement";
import PasswordChangeModal from "./PasswordChangeModal";
import HeaderUserMenu from "./HeaderUserMenu";
import { Icon } from "./icons";
import { generateAIText } from "./ai";
import * as XLSX from "xlsx";
import { ErrorBoundary } from "./ErrorBoundary";
import { normalizeJVName, getConstructionPeriod, getMonthDailyDeptMatrix, getDailyDepartmentManpower } from "./utils";
import { SkOnLogo, SamsungSdiLogo, HyundaiLogo } from "./CustomerLogos";
import {
  purgeLegacyLocalAuthData,
  importLegacyLocalProfiles,
  deleteUserAccount,
  getUserDisplayName,
  getUserTeam,
  recordUserAccess,
  formatLastAccessTime,
} from "./authService";
import {
  computeAutoStatus,
  parseExcelMasterPlan,
  parseTSVWithQuotes,
  isSameProjectIdentity,
  adjustProjectDates
} from "./masterPlanParser";

const DAY = 86400000;
const STATUSES = ["검토중", "PO대기중", "제작중", "진행중", "완료"];
const DEPTS = ["소장", "설계", "설비기술", "기구", "기구 외주", "비전", "비전 외주", "제어", "제어 외주", "전장", "전장 외주", "Supervisor", "안전"];
// 프로젝트 색: 테마마다 따로 고른 절제된 12색. 간트·달력·목록 띠에 같은 색을 쓴다.
// (라이트는 흰 글자가, 다크는 어두운 글자가 읽히도록 명도를 맞췄다)
const PROJECT_COLORS = {
  light: ["#0B57A4", "#2F7F7B", "#A9701A", "#2B7A58", "#B0476F", "#4A6FA5", "#C2583A", "#6B7A2A", "#7A5AA6", "#8A6D3B", "#5B6270", "#21798A"],
  dark: ["#CDAE72", "#8FA8BD", "#86B596", "#EB7A5D", "#B79BD0", "#6FB7B0", "#D9A441", "#7FA6D9", "#D98BA3", "#A7B86A", "#C9B8A0", "#E0705F"]
};

// 동시에 진행되는(기간이 겹치는) 프로젝트 간에 유사/중복 색상이 배정되지 않도록 하는 지능형 색상 분산 함수
function assignDistinctColors(projects, palette) {
  if (!projects || projects.length === 0) return [];
  const n = projects.length;
  const assigned = new Array(n).fill(-1);

  projects.forEach((p, idx) => {
    const pStart = p.startDate || "";
    const pEnd = p.endDate || "";
    const usedIndices = new Set();

    // 일정(startDate ~ endDate)이 겹치는 이전 프로젝트들이 사용한 색상 수집
    for (let prevIdx = 0; prevIdx < idx; prevIdx++) {
      const prevP = projects[prevIdx];
      const prevStart = prevP.startDate || "";
      const prevEnd = prevP.endDate || "";
      const isOverlapping = (pStart <= prevEnd && pEnd >= prevStart);
      if (isOverlapping && assigned[prevIdx] !== -1) {
        usedIndices.add(assigned[prevIdx]);
      }
    }

    // 겹치지 않는 색상 중, 앞선 프로젝트와 색조(Hue) 차이가 확실한 색상 우선 배정
    let chosen = -1;
    for (let c = 0; c < palette.length; c++) {
      // 3칸씩 건너뛰며 색상환 대비 극대화
      const candidate = (idx * 3 + c) % palette.length;
      if (!usedIndices.has(candidate)) {
        chosen = candidate;
        break;
      }
    }

    if (chosen === -1) {
      // 팔레트 수보다 동시 프로젝트가 많은 경우 가장 덜 겹치는 색상 배정
      chosen = idx % palette.length;
    }

    assigned[idx] = chosen;
  });

  return projects.map((p, idx) => ({
    ...p,
    projectColor: palette[assigned[idx]]
  }));
}

const iso = (d = new Date()) => d.toISOString().slice(0, 10);
const dt = s => new Date(`${s}T00:00:00`);
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
export const CUSTOMERS = [
  { id: "SK on", label: "SK on", sub: "배터리", color: "#ea580c", logo: <SkOnLogo height={15} />, cls: "tab-customer-sk" },
  { id: "Samsung SDI", label: "Samsung SDI", sub: "배터리", color: "#2563eb", logo: <SamsungSdiLogo height={12} />, cls: "tab-customer-sdi" },
  { id: "Hyundai", label: "Hyundai", sub: "완성차", color: "#10b981", logo: <HyundaiLogo height={15} />, cls: "tab-customer-hyundai" }
];
export const DEFAULT_CUSTOMER = "SK on";

const newMs = () => Array.from({ length: 5 }, () => ({ id: uid(), name: "", startDate: iso(), endDate: iso() }));

const blank = (defaultCustomer = "SK on") => ({
  customer: defaultCustomer,
  manufacturingNo: "",
  site: "",
  line: "",
  name: "",
  pm: "",
  design: "",
  facilityTechnology: "",
  control: "",
  vision: "",
  startDate: iso(),
  endDate: iso(new Date(Date.now() + 7 * DAY)),
  status: "검토중",
  autoStatus: true,
  isManualStatus: false,
  manualStatusBy: "",
  progress: 0,
  autoProgress: true,
  milestones: [],
  manpower: null
});

const norm = m => ({
  id: m.id || uid(),
  name: normalizeJVName(m.name || ""),
  startDate: m.startDate || m.date || iso(),
  endDate: m.endDate || m.date || iso()
});

const from = p => {
  const rawList = p.milestones || [];
  const meta = rawList.find(x => x && x.id === '__status_meta__');
  const manpowerMeta = rawList.find(x => x && x.id === '__manpower_meta__');
  const customerMeta = rawList.find(x => x && x.id === '__customer_meta__');
  const cleanMs = rawList.filter(x => x && x.id !== '__status_meta__' && x.id !== '__manpower_meta__' && x.id !== '__customer_meta__').map(norm);
  const isPOWaiting = (p.status === "PO대기중");
  const isManual = isPOWaiting || (meta ? Boolean(meta.isManual) : false);
  const manualBy = meta?.by || (isManual ? (p.pm || p.manager || "수동지정 담당자") : "");
  const manualAt = meta?.at || "";
  let effectiveStatus = isManual ? (p.status || "검토중") : computeAutoStatus({ startDate: p.start_date, endDate: p.end_date, milestones: cleanMs });
  if (effectiveStatus === "제작 및 운송중") effectiveStatus = "제작중";

  return {
    id: p.id,
    customer: p.customer || customerMeta?.customer || "SK on",
    manufacturingNo: normalizeJVName(p.manufacturing_no || ""),
    site: normalizeJVName(p.site || ""),
    line: normalizeJVName(p.line || ""),
    name: normalizeJVName(p.name || ""),
    pm: p.pm || p.manager || "",
    design: p.design || "",
    facilityTechnology: p.facility_technology || "",
    control: p.control || "",
    vision: p.vision || "",
    startDate: p.start_date,
    endDate: p.end_date,
    status: effectiveStatus,
    isManualStatus: isManual,
    autoStatus: !isManual,
    manualStatusBy: manualBy,
    manualStatusAt: manualAt,
    progress: p.progress || 0,
    autoProgress: p.auto_progress ?? true,
    milestones: cleanMs,
    manpower: manpowerMeta?.manpower || p.manpower || null
  };
};

const to = p => {
  const rawMs = p.milestones || [];
  const cleanMs = rawMs.filter(m => m && m.id !== '__status_meta__' && m.id !== '__manpower_meta__' && m.id !== '__customer_meta__');
  const existingMeta = rawMs.find(m => m && m.id === '__status_meta__');
  const existingManpowerMeta = rawMs.find(m => m && m.id === '__manpower_meta__');
  const existingCustomerMeta = rawMs.find(m => m && m.id === '__customer_meta__');
  const isPOWaiting = (p.status === "PO대기중");
  const isManual = isPOWaiting || (p.isManualStatus !== undefined ? Boolean(p.isManualStatus) : (existingMeta ? Boolean(existingMeta.isManual) : false));
  const manualBy = p.manualStatusBy !== undefined && p.manualStatusBy !== "" ? p.manualStatusBy : (existingMeta?.by || (isManual ? (p.pm || "수동지정 담당자") : ""));
  const statusMeta = { id: '__status_meta__', isManual, by: manualBy, at: existingMeta?.at || iso(), startDate: p.startDate, endDate: p.endDate };
  const manpowerMeta = p.manpower ? { id: '__manpower_meta__', manpower: p.manpower } : (existingManpowerMeta || null);
  const custVal = p.customer || existingCustomerMeta?.customer || "SK on";
  const customerMeta = { id: '__customer_meta__', customer: custVal };
  const finalMilestones = [...cleanMs, statusMeta, customerMeta];
  if (manpowerMeta) finalMilestones.push(manpowerMeta);

  return {
    id: p.id,
    customer: custVal,
    manufacturing_no: normalizeJVName((p.manufacturingNo || "").trim()) || null,
    site: normalizeJVName(p.site),
    line: normalizeJVName((p.line || "").trim()),
    name: normalizeJVName((p.name || "").trim()),
    manager: (p.pm || "").trim(),
    pm: (p.pm || "").trim(),
    design: (p.design || "").trim(),
    facility_technology: (p.facilityTechnology || "").trim(),
    control: (p.control || "").trim(),
    vision: (p.vision || "").trim(),
    start_date: p.startDate,
    end_date: p.endDate,
    status: p.status === "제작 및 운송중" ? "제작중" : p.status,
    progress: +p.progress || 0,
    auto_progress: p.autoProgress ?? true,
    milestones: finalMilestones
  };
};

const pct = (s, e) => {
  const n = dt(iso()), a = dt(s), b = dt(e);
  if (n <= a) return 0;
  if (n >= b) return 100;
  return Math.round((n - a) / Math.max(DAY, b - a) * 100);
};

const len = (s, e) => Math.max(1, Math.round((dt(e) - dt(s)) / DAY) + 1);

const progress = p => {
  if (p.status === "완료") return 100;
  if (!p.autoProgress) return +p.progress || 0;
  const m = p.milestones.filter(x => x.name && x.startDate && x.endDate);
  if (!m.length) return pct(p.startDate, p.endDate);
  const total = m.reduce((a, x) => a + len(x.startDate, x.endDate), 0);
  return Math.round(m.reduce((a, x) => a + pct(x.startDate, x.endDate) * len(x.startDate, x.endDate), 0) / total);
};

const monthKey = d => `${d.getFullYear()}-${d.getMonth()}`;
const monthCells = d => {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  x.setDate(x.getDate() - x.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const v = new Date(x);
    v.setDate(x.getDate() + i);
    return v;
  });
};

// 접기/펼치기 버튼 글자: 방향 기호 대신 선 아이콘
function FoldLabel({ collapsed, closed = "펼치기", open = "접기" }) {
  return (
    <>
      <Icon name={collapsed ? "chevDown" : "chevUp"} size={13} />
      {collapsed ? closed : open}
    </>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const isSuperAdminEmail = (session?.user?.email?.toLowerCase() === "cmj1012@twgroup.co.kr") || (profile?.email?.toLowerCase() === "cmj1012@twgroup.co.kr");
  const role = isSuperAdminEmail ? "admin" : (profile?.role || "grade1");
  const create = ["admin", "grade3"].includes(role);
  const edit = ["admin", "grade3"].includes(role);
  const del = ["admin", "grade3"].includes(role);
  const canAccessQuotations = ["admin", "grade3"].includes(role);
  const canExportAnalysis = ["admin", "grade3", "grade2"].includes(role);
  const canViewManpowerDetail = ["admin", "grade3", "grade2"].includes(role);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('pm_theme_mode') || 'dark';
    } catch (e) {
      return 'dark';
    }
  });

  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', theme);
      document.body.className = `theme-${theme}`;
      localStorage.setItem('pm_theme_mode', theme);
    } catch (e) {}
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // 고객사별 독립 시스템 운영 상태 (SK on / Samsung SDI / Hyundai)
  const [currentCustomer, setCurrentCustomer] = useState(() => {
    try {
      const saved = localStorage.getItem("pm_current_customer");
      if (saved && ["SK on", "Samsung SDI", "Hyundai"].includes(saved)) {
        return saved;
      }
    } catch (e) {}
    return "SK on";
  });

  useEffect(() => {
    try {
      localStorage.setItem("pm_current_customer", currentCustomer);
    } catch (e) {}
  }, [currentCustomer]);

  const [users, setUsers] = useState([]);
  const [newRegisteredUsers, setNewRegisteredUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [people, setPeople] = useState([]);
  const [form, setForm] = useState(() => blank("SK on"));

  // 고객사별 등록 건수 집계
  const customerCounts = useMemo(() => {
    const counts = { "SK on": 0, "Samsung SDI": 0, "Hyundai": 0 };
    (projects || []).forEach(p => {
      const c = p.customer || "SK on";
      if (counts[c] !== undefined) counts[c]++;
      else counts["SK on"]++;
    });
    return counts;
  }, [projects]);

  // 현재 선택된 고객사의 프로젝트 목록만 격리 추출
  const currentCustomerProjects = useMemo(() => {
    return (projects || []).filter(p => (p.customer || "SK on") === currentCustomer);
  }, [projects, currentCustomer]);

  const [editing, setEditing] = useState(null);
  const [milestones, setMilestones] = useState(newMs());
  const [modal, setModal] = useState(null);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editTeam, setEditTeam] = useState("");
  const [permissionModal, setPermissionModal] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [ganttExpanded, setGanttExpanded] = useState({});
  const [month, setMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);
  const [calendarMode, setCalendarMode] = useState(() => {
    return localStorage.getItem("pm_calendar_mode") || "construction"; // 기본값: 공사/셋업/공수 일정
  });
  const [showDailyDeptMatrix, setShowDailyDeptMatrix] = useState(() => {
    return localStorage.getItem("pm_show_daily_dept_matrix") !== "false"; // 기본값: 펼침
  });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("전체");
  const [siteFilter, setSiteFilter] = useState("전체");
  const [personFilter, setPersonFilter] = useState("전체");
  
  // 복수 연간 단위 프로젝트 조회 시스템 (Multi-Year Filter: 1년, 2년치, 3년치, 전체 등 복수 선택 가능)
  // 매년 1월 1일이 되면 new Date().getFullYear()에 의해 시스템 현재 연도가 자동으로 변경됩니다.
  const currentYearStr = String(new Date().getFullYear());
  const [selectedYears, setSelectedYears] = useState(() => {
    try {
      // 1. 프리셋 상태(당해년도, 최근 2개년, 최근 3개년, 전체)로 저장되어 있다면 매년 1월 1일 접속 시 자동으로 새 연도로 계산
      const savedPreset = localStorage.getItem("pm_year_preset");
      const curY = parseInt(currentYearStr, 10);
      if (savedPreset === "current") {
        return [currentYearStr];
      } else if (savedPreset === "2years") {
        return [String(curY - 1), currentYearStr];
      } else if (savedPreset === "3years") {
        return [String(curY - 2), String(curY - 1), currentYearStr];
      } else if (savedPreset === "all") {
        return ["ALL"];
      }

      // 2. 수동 선택된 연도 목록이 있는 경우
      const saved = localStorage.getItem("pm_selected_years");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // 마지막 접속 연도와 현재 연도가 다르고(해가 바뀜), 이전 단일 당해년도만 저장되어 있던 경우 새 연도로 자동 갱신
          const lastYear = localStorage.getItem("pm_app_last_year");
          if (lastYear && lastYear !== currentYearStr && parsed.length === 1 && parsed[0] === lastYear) {
            return [currentYearStr];
          }
          return parsed;
        }
      }
      const oldSingle = localStorage.getItem("pm_year_filter");
      if (oldSingle) return oldSingle === "전체" ? ["ALL"] : [oldSingle];
    } catch (e) {}
    return [currentYearStr]; // 기본값: 현재 연도 (매년 1월 1일 자동 변경)
  });

  // 접속 시 현재 연도를 로컬스토리지에 기록 (연도 변경 감지용)
  useEffect(() => {
    try {
      localStorage.setItem("pm_app_last_year", currentYearStr);
    } catch (e) {}
  }, [currentYearStr]);

  const isAllYears = selectedYears.includes("ALL");

  // 개별 연도 토글 (다중 선택/해제 - 수동 커스텀 모드)
  const handleToggleYear = (yr) => {
    let next;
    if (yr === "ALL") {
      next = ["ALL"];
      try { localStorage.setItem("pm_year_preset", "all"); } catch (e) {}
    } else {
      try { localStorage.removeItem("pm_year_preset"); } catch (e) {} // 개별 조작 시 프리셋 해제
      if (isAllYears) {
        next = [yr];
      } else if (selectedYears.includes(yr)) {
        if (selectedYears.length === 1) {
          next = ["ALL"]; // 마지막 선택 해제 시 전체 연도로 전환
          try { localStorage.setItem("pm_year_preset", "all"); } catch (e) {}
        } else {
          next = selectedYears.filter(y => y !== yr);
        }
      } else {
        next = [...selectedYears, yr].sort((a, b) => b.localeCompare(a));
      }
    }
    setSelectedYears(next);
    try {
      localStorage.setItem("pm_selected_years", JSON.stringify(next));
    } catch (e) {}

    // 달력 연도 동기화
    if (yr !== "ALL") {
      const targetYearNum = parseInt(yr, 10);
      if (!isNaN(targetYearNum) && month.getFullYear() !== targetYearNum) {
        setMonth(new Date(targetYearNum, month.getMonth(), 1));
      }
    }
  };

  // 원클릭 프리셋 핸들러 (당해년도, 최근 2개년, 최근 3개년, 전체 연도)
  // 프리셋 모드를 localStorage에 기억하여 매년 1월 1일 새해가 되면 자동으로 새 연도로 전환됩니다.
  const handlePresetYears = (presetType) => {
    const curY = parseInt(currentYearStr, 10);
    let next;
    if (presetType === "current") {
      next = [currentYearStr];
    } else if (presetType === "2years") {
      next = [String(curY - 1), currentYearStr];
    } else if (presetType === "3years") {
      next = [String(curY - 2), String(curY - 1), currentYearStr];
    } else {
      next = ["ALL"];
    }
    setSelectedYears(next);
    try {
      localStorage.setItem("pm_year_preset", presetType);
      localStorage.setItem("pm_selected_years", JSON.stringify(next));
    } catch (e) {}
  };

  // 연도 표시용 친절한 레이블 (예: "2026년", "2025, 2026년", "전체 연도")
  const selectedYearsLabel = isAllYears
    ? "전체 연도"
    : selectedYears.length === 1
      ? `${selectedYears[0]}년`
      : `${selectedYears.slice().sort().join(', ')}년 (${selectedYears.length}개년)`;

  // 최고 관리자를 위한 신규 가입자 알림 로직 (마지막 확인 시점 이후 새로 가입한 인원 자동 감지)
  const checkNewRegisteredUsers = (userList) => {
    if (!userList || userList.length === 0) return;
    try {
      const savedRaw = localStorage.getItem("pm_last_known_user_emails");
      if (!savedRaw) {
        // 최초 접속 시점: 기존에 이미 등록된 유저들을 기준선(Baseline)으로 저장하여 불필요한 일괄 알림 방지
        const initialEmails = userList.map(u => (u.email || "").toLowerCase()).filter(Boolean);
        localStorage.setItem("pm_last_known_user_emails", JSON.stringify(initialEmails));
        localStorage.setItem("pm_last_users_check_time", new Date().toISOString());
        return;
      }

      const knownEmails = new Set(JSON.parse(savedRaw));
      const newlyAdded = userList.filter(u => {
        const mail = (u.email || "").toLowerCase();
        return mail && !knownEmails.has(mail);
      });

      setNewRegisteredUsers(newlyAdded);
    } catch (e) {
      console.warn("신규 가입자 감지 오류:", e);
    }
  };

  // 관리자가 확인 완료 시 (모달 열기 또는 배너 닫기)
  const markUsersAsChecked = () => {
    try {
      const allEmails = users.map(u => (u.email || "").toLowerCase()).filter(Boolean);
      localStorage.setItem("pm_last_known_user_emails", JSON.stringify(allEmails));
      localStorage.setItem("pm_last_users_check_time", new Date().toISOString());
    } catch (e) {}
    setNewRegisteredUsers([]);
  };

  // 최고 관리자일 때 60초 폴링 및 화면 복귀(focus) 시 최신 가입자 백그라운드 자동 조회
  useEffect(() => {
    if (role !== "admin") return;

    const handleFocus = () => {
      load("profiles");
    };
    window.addEventListener("focus", handleFocus);

    const interval = setInterval(() => {
      load("profiles");
    }, 60000);

    return () => {
      window.removeEventListener("focus", handleFocus);
      clearInterval(interval);
    };
  }, [role]);

  const [msg, setMsg] = useState("");
  const [newSite, setNewSite] = useState("");
  const [newPerson, setNewPerson] = useState("");
  const [newDept, setNewDept] = useState("소장");
  const VALID_VIEWS = ["projects", "manpower", "issues", "daily-reports", "quotations", "vision-spc"];
  const [externalNewIssueData, setExternalNewIssueData] = useState(null);

  const [currentView, setCurrentView] = useState(() => {
    try {
      const saved = localStorage.getItem("pm_current_view");
      if (saved && VALID_VIEWS.includes(saved)) {
        return saved;
      }
    } catch (e) {}
    return "projects";
  });

  // currentView 변경 시 localStorage 동기화
  useEffect(() => {
    try {
      localStorage.setItem("pm_current_view", currentView);
    } catch (e) {}
  }, [currentView]);

  // 스크롤 위치 저장 (스크롤 이벤트 및 페이지 새로고침/이탈 시)
  useEffect(() => {
    if (typeof window === "undefined") return;

    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    const saveScroll = () => {
      try {
        sessionStorage.setItem(`pm_scroll_${currentView}`, window.scrollY.toString());
      } catch (e) {}
    };

    window.addEventListener("scroll", saveScroll, { passive: true });
    window.addEventListener("beforeunload", saveScroll);

    return () => {
      window.removeEventListener("scroll", saveScroll);
      window.removeEventListener("beforeunload", saveScroll);
    };
  }, [currentView]);

  // 페이지 로드 및 렌더링 완료 시 이전 스크롤 위치 복원
  useEffect(() => {
    if (loading) return;

    const restoreScroll = () => {
      try {
        const saved = sessionStorage.getItem(`pm_scroll_${currentView}`);
        if (saved !== null) {
          const top = parseInt(saved, 10);
          if (!isNaN(top) && top > 0) {
            window.scrollTo({ top, behavior: "instant" });
          }
        }
      } catch (e) {}
    };

    // DOM 및 비동기 데이터 렌더링 타이밍을 고려해 다단계 스크롤 복원
    restoreScroll();
    const t1 = setTimeout(restoreScroll, 50);
    const t2 = setTimeout(restoreScroll, 150);
    const t3 = setTimeout(restoreScroll, 350);
    const t4 = setTimeout(restoreScroll, 700);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [currentView, loading]);

  const switchView = (targetView) => {
    try {
      sessionStorage.setItem(`pm_scroll_${targetView}`, "0");
    } catch (e) {}
    setCurrentView(targetView);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const [isExtracting, setIsExtracting] = useState(false);
  const [selectedManpowerProject, setSelectedManpowerProject] = useState(null);
  const [selectedProjects, setSelectedProjects] = useState(new Set());
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const masterPlanInput = useRef(null);

  // 간트차트 기간 필터 상태 관리 (localStorage 연동)
  const [ganttStartDate, setGanttStartDate] = useState(() => {
    try { return localStorage.getItem('pm_gantt_start_date') || ""; } catch (e) { return ""; }
  });
  const [ganttEndDate, setGanttEndDate] = useState(() => {
    try { return localStorage.getItem('pm_gantt_end_date') || ""; } catch (e) { return ""; }
  });

  useEffect(() => {
    try { localStorage.setItem('pm_gantt_start_date', ganttStartDate); } catch (e) {}
  }, [ganttStartDate]);

  useEffect(() => {
    try { localStorage.setItem('pm_gantt_end_date', ganttEndDate); } catch (e) {}
  }, [ganttEndDate]);

  // 간트차트 일정 기준 모드 상태 관리 ('construction': 공사 일정 기준, 'project': 전체 프로젝트 일정 기준)
  const [ganttMode, setGanttMode] = useState(() => {
    try { return localStorage.getItem('pm_gantt_mode') || 'construction'; } catch (e) { return 'construction'; }
  });

  useEffect(() => {
    try { localStorage.setItem('pm_gantt_mode', ganttMode); } catch (e) {}
  }, [ganttMode]);

  // 통합 PPT 종합 보고서 내보내기 모달 상태
  const [showIntegratedExportModal, setShowIntegratedExportModal] = useState(false);
  const [integratedModalSource, setIntegratedModalSource] = useState('gantt');

  const openIntegratedExportModal = (source = 'gantt') => {
    if (!canExportAnalysis) return showPermissionModal("종합 보고서 PPT 내보내기");
    setIntegratedModalSource(source);
    setShowIntegratedExportModal(true);
  };

  const handleIntegratedExportSubmit = async (options) => {
    setMsg("종합 PPT 보고서 생성 중... (Office 네이티브 표/도형)");
    await exportComprehensiveReport(view, { ...options, customer: currentCustomer });
    setMsg("종합 PPT 보고서 생성을 완료했습니다. (PowerPoint에서 직접 수정 가능)");
  };

  const setQuickRange = (type) => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth(); // 0-indexed

    if (type === 'thisMonth') {
      const first = new Date(y, m, 1);
      const last = new Date(y, m + 1, 0);
      setGanttStartDate(first.toISOString().slice(0, 10));
      setGanttEndDate(last.toISOString().slice(0, 10));
    } else if (type === 'nextMonth') {
      const first = new Date(y, m + 1, 1);
      const last = new Date(y, m + 2, 0);
      setGanttStartDate(first.toISOString().slice(0, 10));
      setGanttEndDate(last.toISOString().slice(0, 10));
    } else if (type === 'thisQuarter') {
      const qStartMonth = Math.floor(m / 3) * 3;
      const first = new Date(y, qStartMonth, 1);
      const last = new Date(y, qStartMonth + 3, 0);
      setGanttStartDate(first.toISOString().slice(0, 10));
      setGanttEndDate(last.toISOString().slice(0, 10));
    } else if (type === 'thisYear') {
      setGanttStartDate(`${y}-01-01`);
      setGanttEndDate(`${y}-12-31`);
    }
  };

  // 프로젝트 일정 소항목 접기/펼치기 상태 관리 (localStorage 연동)
  const [collapsedSections, setCollapsedSections] = useState(() => {
    try {
      const saved = localStorage.getItem('pm_app_collapsed_sections');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  const toggleSection = (key) => {
    setCollapsedSections(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem('pm_app_collapsed_sections', JSON.stringify(next)); } catch (e) {}
      return next;
    });
  };

  const setAllSections = (expand) => {
    const next = {
      form: !expand,
      filter: !expand,
      gantt: !expand,
      calendar: !expand,
      list: !expand
    };
    setCollapsedSections(next);
    try { localStorage.setItem('pm_app_collapsed_sections', JSON.stringify(next)); } catch (e) {}
  };

  // 프로젝트 일정 소항목 선택 필터 ('all' | 'form' | 'filter' | 'gantt' | 'calendar' | 'list')
  const [activeProjectSection, setActiveProjectSection] = useState(() => {
    try {
      return localStorage.getItem('pm_project_active_section') || 'all';
    } catch (e) {
      return 'all';
    }
  });

  const handleSelectProjectSection = (secId) => {
    setActiveProjectSection(secId);
    try { localStorage.setItem('pm_project_active_section', secId); } catch (e) {}
    if (secId !== 'all') {
      setCollapsedSections(prev => {
        const next = { ...prev, [secId]: false };
        try { localStorage.setItem('pm_app_collapsed_sections', JSON.stringify(next)); } catch (e) {}
        return next;
      });
    }
  };

  // 틀고정(Sticky) 상단 헤더 높이 측정 및 CSS 변수 동기화
  useEffect(() => {
    const updateHeaderHeight = () => {
      const el = document.getElementById('app-fixed-top');
      if (el) {
        document.documentElement.style.setProperty('--app-fixed-top-height', `${el.offsetHeight}px`);
      }
    };
    updateHeaderHeight();
    const el = document.getElementById('app-fixed-top');
    let ro;
    if (el && window.ResizeObserver) {
      ro = new ResizeObserver(updateHeaderHeight);
      ro.observe(el);
    }
    window.addEventListener('resize', updateHeaderHeight);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', updateHeaderHeight);
    };
  }, [currentView, role, session]);

  // 시스템 업데이트 실시간 감지 상태 및 핸들러
  const [hasUpdate, setHasUpdate] = useState(false);
  const [dismissUpdateNotice, setDismissUpdateNotice] = useState(() => {
    try {
      return sessionStorage.getItem("pm_update_dismissed") === "true";
    } catch (e) {
      return false;
    }
  });

  const handlePerformUpdate = () => {
    try {
      localStorage.setItem("pm_current_view", currentView);
      sessionStorage.setItem(`pm_scroll_${currentView}`, window.scrollY.toString());
      sessionStorage.removeItem("pm_update_dismissed");
    } catch (e) {}
    if ("caches" in window) {
      caches.keys().then(ks => ks.forEach(k => caches.delete(k)));
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
    }
    window.location.reload(true);
  };

  const handleDismissUpdate = () => {
    setDismissUpdateNotice(true);
    try {
      sessionStorage.setItem("pm_update_dismissed", "true");
    } catch (e) {}
  };

  useEffect(() => {
    // 1. PWA 서비스워커 이벤트 리스너
    const handleSWUpdate = () => {
      setHasUpdate(true);
    };
    window.addEventListener("app-update-available", handleSWUpdate);

    // 2. 디버깅 및 사용자 수동 테스트용 함수 노출
    window.__triggerUpdateNotice = () => {
      setHasUpdate(true);
      setDismissUpdateNotice(false);
      try { sessionStorage.removeItem("pm_update_dismissed"); } catch (e) {}
      console.log("[TW Project] 업데이트 알림 테스트가 활성화되었습니다.");
    };

    // 3. 배포된 version.json 확인 (주기적 폴링 및 탭 복귀 시 확인)
    const currentBuildTime = typeof __APP_BUILD_TIME__ !== "undefined" ? __APP_BUILD_TIME__ : null;

    const checkRemoteVersion = async () => {
      if (!currentBuildTime) return;
      try {
        const baseUrl = import.meta.env.BASE_URL || '/';
        const targetUrl = `${baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'}version.json?t=${Date.now()}`;
        const res = await fetch(targetUrl, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" }
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.version && Number(data.version) > Number(currentBuildTime)) {
            setHasUpdate(true);
          }
        }
      } catch (err) {
        // 네트워크 일시 오류 등은 조용히 무시
      }
    };

    const initialTimer = setTimeout(checkRemoteVersion, 3000);
    const intervalTimer = setInterval(checkRemoteVersion, 60 * 1000); // 1분 주기 확인

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkRemoteVersion();
        if ("serviceWorker" in navigator) {
          navigator.serviceWorker.getRegistration().then(reg => {
            if (reg) reg.update();
          }).catch(() => {});
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("app-update-available", handleSWUpdate);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    };
  }, []);

  const currentUserName = useMemo(() => {
    if (!session) return "담당자";
    return profile?.name ||
      session?.user?.user_metadata?.name ||
      session?.user?.user_metadata?.full_name ||
      (people.find(p => p.name && session?.user?.email?.toLowerCase().includes(p.name.toLowerCase()))?.name) ||
      (session?.user?.email ? session.user.email.split("@")[0] : "담당자");
  }, [profile, session, people]);

  const computedCurrentStatus = useMemo(() => {
    const validMs = milestones.filter(m => m.name.trim() && m.startDate && m.endDate && m.id !== '__status_meta__');
    return computeAutoStatus({ startDate: form.startDate, endDate: form.endDate, milestones: validMs });
  }, [form.startDate, form.endDate, milestones]);

  function handleStatusChange(val) {
    setForm(f => ({ ...f, status: val, autoStatus: false, isManualStatus: true, manualStatusBy: f.manualStatusBy || currentUserName }));
  }

  function handleAutoStatusToggle(checked) {
    if (checked) {
      const validMs = milestones.filter(m => m.name.trim() && m.startDate && m.endDate && m.id !== '__status_meta__');
      const calculated = computeAutoStatus({ startDate: form.startDate, endDate: form.endDate, milestones: validMs });
      setForm(f => ({ ...f, autoStatus: true, isManualStatus: false, manualStatusBy: "", status: calculated }));
    } else {
      setForm(f => ({ ...f, autoStatus: false, isManualStatus: true, manualStatusBy: f.manualStatusBy || currentUserName }));
    }
  }

  function handleAutoProgressToggle(checked) {
    setForm(f => ({ ...f, autoProgress: checked }));
  }

  async function switchToAutoStatus(p) {
    const cleanMs = (p.milestones || []).filter(m => m && m.id !== '__status_meta__');
    const autoStat = computeAutoStatus({ startDate: p.startDate, endDate: p.endDate, milestones: cleanMs });
    const statusMeta = { id: '__status_meta__', isManual: false, by: "", at: iso(), startDate: p.startDate, endDate: p.endDate };
    const finalMilestones = [...cleanMs, statusMeta];
    const { error } = await supabase.from("projects").update({ status: autoStat, milestones: finalMilestones }).eq("id", p.id);
    if (error) {
      setMsg("자동 상태 전환 실패: " + error.message);
    } else {
      setMsg(`'${p.name}' 프로젝트가 마일스톤 기준 자동 상태(${autoStat})로 전환되었습니다.`);
      load("projects");
    }
  }

  async function load(t, { isAdmin = role === "admin" } = {}) {
    if (t === "profiles") {
      // 사용자 목록·이름·팀·권한·접속 기록은 모두 서버(profiles)가 정본이다 → 어느 컴퓨터에서 접속해도 같다.
      try {
        let { data: list, error } = await supabase.from("profiles").select("*").order("email");
        if (error) throw error;
        list = list || [];

        if (isAdmin) {
          // 예전에 이 브라우저에만 저장해 둔 이름/팀을 서버로 한 번 이관 (서버에 이미 있는 값은 덮어쓰지 않음)
          const imported = await importLegacyLocalProfiles(list);
          if (imported > 0) {
            const refreshed = await supabase.from("profiles").select("*").order("email");
            if (!refreshed.error && refreshed.data) list = refreshed.data;
            setMsg(`이 컴퓨터에 저장돼 있던 ${imported}명의 이름·팀을 서버로 이관했습니다. 이제 어느 컴퓨터에서든 확인할 수 있습니다.`);
          }
        }

        setUsers(list);
        if (isAdmin) checkNewRegisteredUsers(list);
      } catch (err) {
        console.error("profiles load error:", err);
        setMsg("사용자 목록을 불러오지 못했습니다: " + (err.message || err));
      }
      return;
    }

    const order = t === "projects" ? "created_at" : t === "personnel" ? "department" : "name";
    const { data, error } = await supabase.from(t).select("*").order(order, { ascending: t !== "projects" });
    if (error) return setMsg(error.message);
    if (t === "projects") setProjects((data || []).map(from));
    if (t === "sites") {
      const seen = new Set();
      const normalizedSites = (data || []).map(s => ({ ...s, name: normalizeJVName(s.name) })).filter(s => {
        const k = s.name.trim().toLowerCase();
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      setSites(normalizedSites);
    }
    if (t === "personnel") setPeople(data || []);
  }

  async function boot(activeSession) {
    const sess = activeSession || session;
    if (!sess?.user?.email) return;

    // 서버(profiles)에서 내 프로필(권한·이름·팀·활성 여부)을 읽는다. 프로필은 가입 시 DB 트리거가 만든다.
    let p;
    try {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", sess.user.id).maybeSingle();
      if (error) throw error;
      p = data;
    } catch (e) {
      // 네트워크 오류 등 일시적인 문제는 로그아웃시키지 않고 안내만 한다.
      console.warn("Failed to fetch profile row:", e);
      setMsg("계정 정보를 불러오지 못했습니다. 새로고침해 주세요.");
      return;
    }

    if (!p) {
      // 관리자가 계정을 삭제했거나 프로필이 없는 경우
      await supabase.auth.signOut();
      setSession(null);
      setProfile(null);
      return alert("계정 정보를 찾을 수 없습니다. 관리자에게 문의하세요.");
    }

    if (p.active === false) {
      await supabase.auth.signOut();
      setSession(null);
      setProfile(null);
      return alert("비활성화된 계정입니다. 관리자에게 문의하세요.");
    }

    // 접속 기록은 서버에 남긴다 (관리자가 어느 컴퓨터에서든 확인 가능)
    recordUserAccess(false);

    setProfile(p);
    const isAdmin = p.role === "admin" || sess.user.email.toLowerCase() === "cmj1012@twgroup.co.kr";
    await Promise.all([load("projects"), load("sites"), load("personnel")]);
    if (isAdmin) load("profiles", { isAdmin: true });
  }

  useEffect(() => {
    // URL 해시에서 복구 모드 감지 (#access_token=...&type=recovery)
    if (typeof window !== "undefined") {
      const hash = window.location.hash || "";
      if (hash.includes("type=recovery") || (hash.includes("access_token") && hash.includes("recovery"))) {
        setIsPasswordRecovery(true);
      }
    }

    // 예전 방식(가짜 테스트 세션, 별도 저장된 리프레시 토큰 등)이 브라우저에 남긴 값 정리
    purgeLegacyLocalAuthData();

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (data.session) boot(data.session);
    });

    const { data: authSub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsPasswordRecovery(true);
        setSession(s);
        return;
      }
      setSession(s);
      if (s) boot(s);
      else setProfile(null);
    });

    return () => {
      authSub?.subscription?.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showPermissionModal(feature) {
    setPermissionModal({ feature, role });
  }

  const peopleNames = [...new Set(people.map(p => p.name))].sort();

  const view = useMemo(() => {
    const list = currentCustomerProjects.map(p => {
      const cleanMs = (p.milestones || [])
        .filter(x => x && x.id !== '__status_meta__')
        .sort((a, b) => {
          const sA = a.startDate || "";
          const sB = b.startDate || "";
          if (sA !== sB) return sA.localeCompare(sB);
          return (a.endDate || "").localeCompare(b.endDate || "");
        });

      const isPOWaiting = (p.status === "PO대기중");
      const effectiveManual = isPOWaiting || Boolean(p.isManualStatus);
      const rawCurrentStatus = effectiveManual ? p.status : computeAutoStatus({ ...p, milestones: cleanMs });
      const currentStatus = rawCurrentStatus === "제작 및 운송중" ? "제작중" : rawCurrentStatus;
      return {
        ...p,
        milestones: cleanMs,
        status: currentStatus,
        isManualStatus: effectiveManual,
        manualStatusBy: p.manualStatusBy || (effectiveManual ? (p.pm || "담당자") : ""),
        value: progress({ ...p, status: currentStatus, milestones: cleanMs }),
        overdue: currentStatus !== "완료" && dt(p.endDate) < dt(iso())
      };
    }).filter(p => {
      // 1. 복수 연도 필터링: 프로젝트 진행 기간(startDate ~ endDate)이 선택한 복수 연도(selectedYears)에 걸치는지 검사
      let yearMatch = true;
      if (!isAllYears && selectedYears.length > 0) {
        const pStart = p.startDate || "";
        const pEnd = p.endDate || "";
        const sYr = pStart && pStart.length >= 4 ? parseInt(pStart.slice(0, 4), 10) : null;
        const eYr = pEnd && pEnd.length >= 4 ? parseInt(pEnd.slice(0, 4), 10) : null;

        yearMatch = selectedYears.some(yrStr => {
          const targetYr = parseInt(yrStr, 10);
          if (isNaN(targetYr)) return true;
          if (sYr && eYr) {
            return targetYr >= sYr && targetYr <= eYr;
          } else if (sYr) {
            return targetYr >= sYr;
          } else if (eYr) {
            return targetYr <= eYr;
          }
          return true;
        });
      }

      const text = [p.manufacturingNo, p.site, p.line, p.name, p.pm, p.design, p.facilityTechnology, p.control, p.vision].join(" ").toLowerCase();
      const status = filter === "전체" || (filter === "완료" && p.status === "완료") || (filter === "진행중" && p.status !== "완료") || (filter === "지연" && p.overdue) || (p.status === filter);
      const site = siteFilter === "전체" || p.site === siteFilter;
      const person = personFilter === "전체" || [p.pm, p.design, p.facilityTechnology, p.control, p.vision].includes(personFilter);
      return yearMatch && text.includes(search.toLowerCase()) && status && site && person;
    });

    // 프로젝트 시작일(startDate) 기준 오름차순 정렬 (빠른 시작일 순서대로 나열)
    list.sort((a, b) => {
      const sA = a.startDate || "";
      const sB = b.startDate || "";
      if (!sA && !sB) return 0;
      if (!sA) return 1;
      if (!sB) return -1;
      const cmpStart = sA.localeCompare(sB);
      if (cmpStart !== 0) return cmpStart;
      const eA = a.endDate || "";
      const eB = b.endDate || "";
      const cmpEnd = eA.localeCompare(eB);
      if (cmpEnd !== 0) return cmpEnd;
      return (a.name || "").localeCompare(b.name || "");
    });

    // 동시 진행 프로젝트 간 중복 및 유사 색상을 방지하는 지능형 색상 분산 적용
    return assignDistinctColors(list, PROJECT_COLORS[theme] || PROJECT_COLORS.dark);
  }, [currentCustomerProjects, search, filter, siteFilter, personFilter, selectedYears, isAllYears, theme]);

  // 등록된 프로젝트들의 기간에서 추출한 고유 연도 목록 (최신순)
  const availableYears = useMemo(() => {
    const yearsSet = new Set();
    const currentYear = new Date().getFullYear();
    yearsSet.add(String(currentYear)); // 현재 연도 기본 포함

    currentCustomerProjects.forEach(p => {
      if (p.startDate && p.startDate.length >= 4) {
        const yStart = parseInt(p.startDate.slice(0, 4), 10);
        if (!isNaN(yStart)) yearsSet.add(String(yStart));
      }
      if (p.endDate && p.endDate.length >= 4) {
        const yEnd = parseInt(p.endDate.slice(0, 4), 10);
        if (!isNaN(yEnd)) yearsSet.add(String(yEnd));
      }
    });

    return Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
  }, [projects]);

  // 선택된 복수 연도(또는 전체)에 대한 연간 프로젝트 현황 통계
  const yearStats = useMemo(() => {
    let ongoing = 0;
    let completed = 0;
    let delayed = 0;
    let totalManpower = 0;

    view.forEach(p => {
      if (p.status === "완료") completed++;
      else if (p.overdue) delayed++;
      else ongoing++;

      if (p.manpower?.totalManday) {
        totalManpower += Number(p.manpower.totalManday) || 0;
      } else if (p.manpower?.dailyTotal) {
        Object.entries(p.manpower.dailyTotal).forEach(([dStr, val]) => {
          const dYr = dStr.slice(0, 4);
          if (isAllYears || selectedYears.includes(dYr)) {
            totalManpower += Number(val) || 0;
          }
        });
      }
    });

    return {
      total: view.length,
      ongoing,
      completed,
      delayed,
      totalManpower
    };
  }, [view, selectedYears, isAllYears]);

  // 간트차트 기간 필터가 적용된 프로젝트 목록
  const ganttView = useMemo(() => {
    if (!ganttStartDate && !ganttEndDate) {
      return view;
    }
    const isConstruction = ganttMode === 'construction';
    return view.filter(p => {
      let pStart = p.startDate || "";
      let pEnd = p.endDate || "";
      if (isConstruction) {
        const cp = getConstructionPeriod(p);
        pStart = cp.startDate || p.startDate || "";
        pEnd = cp.endDate || p.endDate || "";
      }
      if (ganttStartDate && ganttEndDate) {
        return (!pStart || pStart <= ganttEndDate) && (!pEnd || pEnd >= ganttStartDate);
      }
      if (ganttStartDate) {
        return !pEnd || pEnd >= ganttStartDate;
      }
      if (ganttEndDate) {
        return !pStart || pStart <= ganttEndDate;
      }
      return true;
    });
  }, [view, ganttStartDate, ganttEndDate, ganttMode]);

  async function save() {
    if (!editing && !create) return showPermissionModal("새 프로젝트 생성");
    if (editing && !edit) return showPermissionModal("프로젝트 수정");
    if (!form.site || !form.name.trim()) return setMsg("Site, 프로젝트명은 필수입니다.");
    if (dt(form.endDate) < dt(form.startDate)) return setMsg("프로젝트 종료일을 확인하세요.");
    const m = milestones.filter(x => x.name.trim() && x.startDate && x.endDate && x.id !== '__status_meta__' && x.id !== '__manpower_meta__' && x.id !== '__customer_meta__');
    if (m.some(x => dt(x.endDate) < dt(x.startDate))) return setMsg("마일스톤 종료일은 시작일 이후여야 합니다.");

    const isPOWaiting = (form.status === "PO대기중");
    const isManual = isPOWaiting || Boolean(form.isManualStatus) || !form.autoStatus;
    const manualBy = isManual ? (form.manualStatusBy || currentUserName) : "";
    const calculatedStatus = isManual ? form.status : computeAutoStatus({ ...form, milestones: m });
    const statusMeta = { id: '__status_meta__', isManual, by: manualBy, at: iso(), startDate: form.startDate, endDate: form.endDate };
    const targetCustomer = form.customer || currentCustomer || "SK on";
    const customerMeta = { id: '__customer_meta__', customer: targetCustomer };
    const finalMilestones = [...m, statusMeta, customerMeta];
    if (form.manpower) finalMilestones.push({ id: '__manpower_meta__', manpower: form.manpower });

    let error;
    if (editing && role === "grade2") {
      ({ error } = await supabase.from("projects").update({
        status: calculatedStatus,
        progress: +form.progress || 0,
        auto_progress: form.autoProgress,
        milestones: finalMilestones
      }).eq("id", editing));
    } else {
      const row = {
        ...form,
        customer: targetCustomer,
        status: calculatedStatus,
        isManualStatus: isManual,
        manualStatusBy: manualBy,
        id: editing || uid(),
        milestones: finalMilestones,
        manpower: form.manpower || null
      };
      let payload = to(row);
      let res = editing
        ? await supabase.from("projects").update(payload).eq("id", editing)
        : await supabase.from("projects").insert(payload);
      error = res.error;

      // DB에 customer 컬럼이 없는 경우 milestones 메타데이터로 안전하게 재시도
      if (error && String(error.message || "").toLowerCase().includes("customer")) {
        const fallback = { ...payload };
        delete fallback.customer;
        const retry = editing
          ? await supabase.from("projects").update(fallback).eq("id", editing)
          : await supabase.from("projects").insert(fallback);
        error = retry.error;
      }
    }

    if (error) {
      console.error(error);
      return setMsg(
        error.code === "23505"
          ? "이미 사용 중인 제조번호입니다."
          : error.message.includes("project_history")
            ? "프로젝트 저장 실패: 데이터베이스에 'project_history' 테이블이 없습니다. Supabase에서 해당 테이블을 만들거나 관련 트리거를 삭제해주세요."
            : "오류 발생: " + error.message
      );
    }

    setForm(blank());
    setEditing(null);
    setMilestones(newMs());
    setMsg("저장했습니다.");
    load("projects");
  }

  function addMilestoneRow() {
    setMilestones([...milestones, { id: uid(), name: "", startDate: iso(), endDate: iso() }]);
  }

  function removeMilestoneRow(index) {
    if (milestones.length <= 1) return setMsg("마일스톤 입력란은 최소 1개 유지됩니다.");
    setMilestones(milestones.filter((_, i) => i !== index));
  }

  function editProject(p) {
    if (!edit) return showPermissionModal("프로젝트 수정");
    setEditing(p.id);
    setCollapsedSections(prev => ({ ...prev, form: false }));
    const cleanMs = (p.milestones || []).filter(x => x && x.id !== '__status_meta__' && x.id !== '__manpower_meta__');
    const isPOWaiting = (p.status === "PO대기중");
    const isManual = isPOWaiting || Boolean(p.isManualStatus);
    setForm({
      ...p,
      status: p.status,
      autoStatus: !isManual,
      isManualStatus: isManual,
      manualStatusBy: p.manualStatusBy || (isManual ? (p.pm || currentUserName) : ""),
      progress: p.value,
      milestones: cleanMs,
      manpower: p.manpower || null
    });
    setMilestones(cleanMs.length >= 5 ? cleanMs : [...cleanMs, ...newMs().slice(0, 5 - cleanMs.length)]);
    scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(id) {
    if (del && confirm("삭제할까요?")) {
      await supabase.from("projects").delete().eq("id", id);
      load("projects");
      setSelectedProjects(new Set(Array.from(selectedProjects).filter(x => x !== id)));
    }
  }

  async function removeSelected() {
    if (del && selectedProjects.size > 0 && confirm(`선택한 ${selectedProjects.size}개의 프로젝트를 삭제할까요?`)) {
      await supabase.from("projects").delete().in("id", Array.from(selectedProjects));
      setSelectedProjects(new Set());
      load("projects");
    }
  }

  function toggleSelect(id) {
    const next = new Set(selectedProjects);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedProjects(next);
  }

  function toggleSelectAll() {
    if (selectedProjects.size === view.length) setSelectedProjects(new Set());
    else setSelectedProjects(new Set(view.map(p => p.id)));
  }

  async function updateUser(id, v) {
    // 서버(profiles)에 저장되는 항목만 보낸다. (예전에는 없는 컬럼까지 보내 저장이 조용히 실패했다)
    const patch = {};
    if (v.name !== undefined) patch.name = String(v.name).trim();
    if (v.team !== undefined) patch.team = String(v.team).trim();
    if (v.role !== undefined) patch.role = v.role;
    if (v.active !== undefined) patch.active = v.active;

    if ((patch.name !== undefined && !patch.name) || (patch.team !== undefined && !patch.team)) {
      return setMsg("이름과 소속팀은 비워둘 수 없습니다.");
    }

    const { data, error } = await supabase.from("profiles").update(patch).eq("id", id).select("id");
    if (error) {
      return setMsg("저장에 실패했습니다: " + error.message);
    }
    if (!data || data.length === 0) {
      return setMsg("저장되지 않았습니다. 최고 관리자 권한이 필요합니다.");
    }

    setMsg("사용자 정보 및 권한이 성공적으로 저장되었습니다. (서버에 저장되어 모든 컴퓨터에서 동일하게 보입니다)");
    await load("profiles");
  }

  async function deleteUser(id, email) {
    if (!email) return;
    const normalized = email.trim().toLowerCase();

    // 1. 최고 관리자 보호
    if (normalized === "cmj1012@twgroup.co.kr") {
      return alert("최고 관리자 계정은 삭제할 수 없습니다.");
    }

    // 2. 현재 로그인된 본인 계정 보호
    if (session?.user?.email?.toLowerCase() === normalized) {
      return alert("현재 로그인된 본인 계정은 삭제할 수 없습니다.");
    }

    if (!confirm(`'${email}' 사용자를 영구 삭제하시겠습니까?\n\n※ 삭제 시 계정 목록에서 제거되며 해당 계정으로는 다시 로그인할 수 없습니다.`)) {
      return;
    }

    const result = await deleteUserAccount(id);
    if (!result.success) {
      return alert("사용자 삭제 중 오류가 발생했습니다: " + result.error);
    }
    setMsg(`'${email}' 사용자가 영구 삭제되었습니다.`);
    load("profiles");
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }

  async function add(t) {
    if (t === "sites") {
      if (!newSite.trim()) return;
      await supabase.from(t).insert({ name: normalizeJVName(newSite.trim()), created_by: session.user.id });
      setNewSite("");
    } else {
      if (!newPerson.trim()) return;
      await supabase.from(t).insert({ name: newPerson.trim(), department: newDept, created_by: session.user.id });
      setNewPerson("");
    }
    load(t);
  }

  async function trash(t, r) {
    if (confirm(`${r.name} 삭제?`)){
      await supabase.from(t).delete().eq("id", r.id);
      load(t);
    }
  }

  async function saveDirectProjects(directProjects, sourceLabel = "엑셀") {
    if (!directProjects || directProjects.length === 0) return false;

    // A. Single project upload while in edit mode: update currently editing project
    if (directProjects.length === 1 && editing) {
      const curP = projects.find(pr => pr.id === editing) || form;
      const targetP = directProjects[0];

      const cleanMs = targetP.milestones.map(m => ({ ...m, name: normalizeJVName(m.name), id: uid() }));
      const autoStat = computeAutoStatus({
        startDate: targetP.startDate || form.startDate || iso(),
        endDate: targetP.endDate || form.endDate || iso(),
        milestones: cleanMs
      });

      let siteVal = targetP.site || form.site || curP.site;
      const projName = normalizeJVName(targetP.projectName || form.name || curP.name);
      if (!siteVal && projName && sites.length) {
        const matchedSite = sites.find(s => projName.toLowerCase().includes(s.name.toLowerCase()));
        if (matchedSite) siteVal = matchedSite.name;
      }

      const updatedRow = {
        ...curP, ...form, id: editing,
        name: form.name || projName,
        startDate: targetP.startDate || form.startDate,
        endDate: targetP.endDate || form.endDate,
        manufacturingNo: normalizeJVName(targetP.manufacturingNo || form.manufacturingNo || curP.manufacturingNo || ""),
        line: normalizeJVName(targetP.line || form.line || curP.line || ""),
        site: normalizeJVName(siteVal || form.site || curP.site || "선택 안됨"),
        status: autoStat, autoStatus: true, isManualStatus: false, manualStatusBy: "",
        milestones: cleanMs, manpower: targetP.manpower || curP.manpower || null
      };

      setForm(updatedRow);
      setMilestones(cleanMs.length >= 5 ? cleanMs : [...cleanMs, ...newMs().slice(0, 5 - cleanMs.length)]);
      const { error } = await supabase.from("projects").update(to(updatedRow)).eq("id", editing);

      if (error) {
        console.error("Master plan update error:", error);
        setMsg(`마스터 플랜 최신화 실패: ${error.message}`);
        return false;
      }

      const mpText = targetP.manpower ? ` (총 공수 ${targetP.manpower.totalManday} M/D 최신화)` : "";
      setMsg(`'${updatedRow.name}' 프로젝트의 마스터 스케줄 및 공수가 최신 버전으로 업데이트되었습니다!${mpText}`);
      load("projects");
      return true;
    }

    // B. Multi-project (e.g. 4 equipments) OR new registration mode:
    // Process ALL projects in directProjects sequentially with duplicate resolution
    const processedProjects = [...projects];
    let createdCount = 0;
    let updatedCount = 0;
    const projectResults = [];
    const errorLogs = [];

    for (const p of directProjects) {
      let siteVal = p.site || form.site;
      const projName = normalizeJVName(p.projectName);
      if (!siteVal && projName && sites.length) {
        const matchedSite = sites.find(s => projName.toLowerCase().includes(s.name.toLowerCase()));
        if (matchedSite) siteVal = matchedSite.name;
      }

      // Check against current DB list for same customer + already processed in this batch
      const existing = processedProjects.find(ep => (ep.customer || 'SK on') === currentCustomer && isSameProjectIdentity(ep, p, sites));
      const cleanMs = p.milestones.map(m => ({ ...m, name: normalizeJVName(m.name), id: uid() }));
      const autoStat = computeAutoStatus({ startDate: p.startDate || iso(), endDate: p.endDate || iso(), milestones: cleanMs });

      if (existing) {
        const updatedExisting = {
          ...existing,
          customer: currentCustomer,
          startDate: p.startDate || existing.startDate,
          endDate: p.endDate || existing.endDate,
          manufacturingNo: normalizeJVName(p.manufacturingNo || existing.manufacturingNo || ""),
          line: normalizeJVName(p.line || existing.line || ""),
          site: normalizeJVName(siteVal || existing.site || "선택 안됨"),
          status: autoStat, autoStatus: true, isManualStatus: false, manualStatusBy: "",
          milestones: cleanMs, manpower: p.manpower || existing.manpower || null
        };
        let payload = to(updatedExisting);
        let { error } = await supabase.from("projects").update(payload).eq("id", existing.id);
        if (error && String(error.message || "").toLowerCase().includes("customer")) {
          const fallback = { ...payload };
          delete fallback.customer;
          const retry = await supabase.from("projects").update(fallback).eq("id", existing.id);
          error = retry.error;
        }

        if (error) {
          console.error("Auto-update error for", p.projectName, error);
          errorLogs.push(`${p.projectName}: ${error.message}`);
        } else {
          updatedCount++;
          projectResults.push({ name: projName, status: "최신화", manday: p.manpower?.totalManday || 0, line: p.line });
          const idx = processedProjects.findIndex(x => x.id === existing.id);
          if (idx !== -1) processedProjects[idx] = updatedExisting;
        }
      } else {
        const newRow = {
          ...blank(currentCustomer),
          customer: currentCustomer,
          id: uid(),
          name: projName,
          startDate: p.startDate || iso(),
          endDate: p.endDate || iso(),
          manufacturingNo: normalizeJVName(p.manufacturingNo || form.manufacturingNo || ""),
          line: normalizeJVName(p.line || form.line || ""),
          site: normalizeJVName(siteVal || form.site || "선택 안됨"),
          status: autoStat, autoStatus: true, isManualStatus: false, manualStatusBy: "",
          milestones: cleanMs,
          manpower: p.manpower || null
        };

        let insertData = to(newRow);
        let { error } = await supabase.from("projects").insert(insertData);
        if (error && String(error.message || "").toLowerCase().includes("customer")) {
          const fallback = { ...insertData };
          delete fallback.customer;
          const retry = await supabase.from("projects").insert(fallback);
          error = retry.error;
          insertData = fallback;
        }

        // If duplicate key error (manufacturing_no collision), append equipment suffix or random tag and retry
        if (error && (error.code === "23505" || String(error.message).includes("unique") || String(error.message).includes("duplicate"))) {
          const eqTag = /notcher|노칭/i.test(projName) ? "NC" : (/stacker|스택/i.test(projName) ? "ST" : "EQ");
          insertData.manufacturing_no = `${insertData.manufacturing_no || 'MFG'}-${eqTag}-${uid().slice(-3)}`;
          const retry = await supabase.from("projects").insert(insertData);
          error = retry.error;
        }

        if (error) {
          console.error("Auto-insert error for", p.projectName, error);
          errorLogs.push(`${p.projectName}: ${error.message}`);
        } else {
          createdCount++;
          projectResults.push({ name: projName, status: "신규 등록", manday: p.manpower?.totalManday || 0, line: p.line });
          processedProjects.push(newRow);
        }
      }
    }

    // Reset editing state so user is not stuck on a single project view
    if (editing) {
      setEditing(null);
      setForm(blank());
      setMilestones(newMs());
    }

    const totalMpSum = directProjects.reduce((acc, p) => acc + (p.manpower?.totalManday || 0), 0);
    const summaryHeader = `[${sourceLabel} 완료] 총 ${directProjects.length}개 설비 프로젝트 중 ${createdCount > 0 ? `${createdCount}개 신규 등록` : ""}${createdCount > 0 && updatedCount > 0 ? ", " : ""}${updatedCount > 0 ? `${updatedCount}개 최신화` : ""} (총 공수 ${totalMpSum} M/D)`;

    if (createdCount === 0 && updatedCount === 0 && errorLogs.length > 0) {
      setMsg(`저장 실패: 데이터베이스 오류 발생 (${errorLogs[0]})`);
    } else {
      const detailLines = projectResults.map(r => `• ${r.name} (${r.status}, 공수: ${r.manday} M/D)`).join('\n');
      setMsg(
        <div>
          <b>{summaryHeader}</b>
          <div style={{ fontSize: '12px', marginTop: '4px', lineHeight: '1.5', whiteSpace: 'pre-line', color: 'var(--text-secondary)' }}>
            {detailLines}
          </div>
        </div>
      );
    }

    load("projects");
    return true;
  }

  async function handleMasterPlanUpload(input) {
    if (!editing && !create) return showPermissionModal("마스터 플랜 등록");
    if (editing && !edit) return showPermissionModal("프로젝트 수정");
    if (!input) return;

    setMsg("마스터 플랜 분석 중...");
    setIsExtracting(true);

    try {
      let directProjects = null;
      let sourceLabel = "엑셀 파일";
      const curEditingP = editing ? projects.find(p => p.id === editing) : null;
      const parseContext = {
        formName: form.name || curEditingP?.name || "",
        formLine: form.line || curEditingP?.line || "",
        formSite: form.site || curEditingP?.site || "",
        formMfg: form.manufacturingNo || curEditingP?.manufacturing_no || "",
        formStartDate: form.startDate || curEditingP?.startDate || "",
        editingProjectName: curEditingP?.name || "",
        fileName: (input && input.name) ? input.name.replace(/\.[^/.]+$/, "") : ""
      };

      const isFile = (typeof File !== "undefined" && input instanceof File) ||
                     (typeof Blob !== "undefined" && input instanceof Blob) ||
                     (input && typeof input === "object" && typeof input.arrayBuffer === "function" && Boolean(input.name));

      if (isFile && input.name && input.name.match(/\.(xlsx|xls|xlsm|csv)$/i)) {
        const data = await input.arrayBuffer();
        const wb = XLSX.read(data, { cellDates: false, cellStyles: true });
        directProjects = parseExcelMasterPlan(wb, parseContext);
        sourceLabel = "엑셀 파일";
      } else if (!isFile && (typeof input === "string" || (input && typeof input === "object" && (typeof input.text === "string" || typeof input.html === "string")))) {
        sourceLabel = "엑셀 표 붙여넣기";
        const pasteText = typeof input === "string" ? input : (typeof input.text === "string" ? input.text : "");
        const pasteHtml = (typeof input === "object" && typeof input.html === "string") ? input.html : "";

        let tsvProjects = null;
        let htmlProjects = null;

        // 1. Primary: TSV text parsing (Excel copies continuous full 2D grid in text/plain)
        if (pasteText && typeof pasteText === "string" && pasteText.trim().length > 5) {
          try {
            const cleanText = pasteText.replace(/^\uFEFF/, '').replace(/\0/g, '');
            const lines = parseTSVWithQuotes(cleanText);
            if (lines.length > 0 && (cleanText.includes('\t') || lines.some(l => l.length > 1))) {
              const ws = XLSX.utils.aoa_to_sheet(lines);
              const wb = { SheetNames: ['Sheet1'], Sheets: { Sheet1: ws } };
              tsvProjects = parseExcelMasterPlan(wb, parseContext);
            }
          } catch (e) {
            console.warn("TSV parse failed:", e);
          }
        }

        // 2. Secondary: HTML table parsing
        if (pasteHtml && typeof pasteHtml === "string" && pasteHtml.includes("<table")) {
          try {
            const startIdx = pasteHtml.indexOf('<html');
            const cleanHtml = startIdx !== -1 ? pasteHtml.slice(startIdx) : pasteHtml;
            const htmlWb = XLSX.read(cleanHtml, { type: "string" });
            if (htmlWb && htmlWb.SheetNames && htmlWb.SheetNames.length > 0) {
              htmlProjects = parseExcelMasterPlan(htmlWb, parseContext);
            }
          } catch (e) {
            console.warn("HTML table parse failed:", e);
          }
        }

        // 3. Quality comparison & Best selection:
        // Priority 1: Total projects count (Multi-equipment extraction completeness is paramount)
        // Priority 2: Milestone completeness, total manday, and daily manpower dates count
        const score = (pList) => {
          if (!pList || !pList.length) return -1;
          const countWeight = (pList.length || 0) * 10000;
          return countWeight + pList.reduce((acc, p) => {
            const msScore = (p.milestones?.length || 0) * 10;
            const mpScore = (p.manpower?.totalManday || 0) > 0 ? 50 : 0;
            const dailyScore = Object.keys(p.manpower?.dailyTotal || {}).length * 2;
            return acc + msScore + mpScore + dailyScore;
          }, 0);
        };

        const tsvScore = score(tsvProjects);
        const htmlScore = score(htmlProjects);

        if (tsvScore >= htmlScore && tsvScore > 0) {
          directProjects = tsvProjects;
        } else if (htmlScore > 0) {
          directProjects = htmlProjects;
        } else {
          directProjects = tsvProjects || htmlProjects;
        }
      }

      if (directProjects && directProjects.length > 0) {
        await saveDirectProjects(directProjects, sourceLabel);
        return;
      }

      let parts = [];

      if (typeof input === "string") {
        parts = [{ text: `이것은 마스터 플랜의 클립보드 텍스트입니다:\n\n${input}` }];
      } else if (!isFile && input && typeof input === "object" && typeof input.text === "string") {
        parts = [{ text: `이것은 마스터 플랜의 클립보드 텍스트입니다:\n\n${input.text}` }];
      } else if (isFile && input.name && input.name.match(/\.(xlsx|xls|xlsm|csv)$/i)) {
        const data = await input.arrayBuffer();
        const wb = XLSX.read(data, { cellDates: false, cellStyles: true });
        let sheetName = wb.SheetNames.find(n => /planning|schedule|master|일정/i.test(n)) || wb.SheetNames.find(n => !/edit|설정|양식/i.test(n)) || wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const rawJson = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        const compactCsv = (rawJson || []).slice(0, 80).map(r => (r || []).slice(0, 10).join(",")).filter(l => l.replace(/,/g, "").trim().length > 0).join("\n");
        parts = [{ text: `이것은 마스터 플랜 엑셀(${sheetName} 시트)의 데이터입니다:\n\n${compactCsv}` }];
      } else if (isFile && input.type && input.type.startsWith("image/")) {
        const reader = new FileReader();
        const p = new Promise(res => reader.onload = () => res(reader.result));
        reader.readAsDataURL(input);
        const b64 = await p;
        const b64d = b64.split(",")[1];
        parts = [{ inlineData: { data: b64d, mimeType: input.type } }];
      } else {
        throw new Error("지원하지 않는 데이터 형식입니다. (Excel, 이미지, 또는 텍스트 복사)");
      }

      const prompt = `당신은 프로젝트 일정표(Master Plan) 및 공수(Manpower) 데이터를 분석하는 전문가입니다. 첨부된 데이터(이미지 또는 엑셀 텍스트)를 분석하여 아래 JSON 구조로만 데이터를 추출하세요.
데이터에 여러 장비(Equipment) 또는 라인(Line)별 공정이 포함되어 있다면, 각각 개별 프로젝트로 분할하여 "projects" 배열에 넣어 반환하세요.
각 장비 바로 아래에 위치한 공수(Mechanical, Vision, Vision Sub(비전 외주), Control, Electrical, Electrical Sub(전장 외주), Supervisor(슈퍼바이저), Safety(안전), 소장/Manager/PM 등 시트에 기재된 모든 부서) 표는 해당 장비 프로젝트의 "manpower"에 각각 1:1로 정확히 할당해야 합니다. 특히 "비전 외주", "전장 외주", "Supervisor(슈퍼바이저)"는 일반 비전/전장과 합치지 말고 반드시 별도 부서로 독립 추출해야 하며, PM 및 소장은 "소장"으로 부서명을 통일하여 추출해야 합니다.

★ 마일스톤 날짜 및 연도 전환(Cross-year) 필수 규칙:
1. 시트 상단에 기재된 'Project Start Date'(예: 2026-07-20)를 기준으로 마일스톤 일정을 결정합니다.
2. 모든 마일스톤(Activity)의 시작일자는 자동으로 'Project Start Date' 이후여야 합니다.
3. 마일스톤 표의 Start, End 날짜에 연도가 생략되어 있거나(예: '07월 28일', '01월 13일' 등), 마일스톤이 순서대로 진행되면서 연말에서 연초(10~12월 -> 1~2월)로 넘어가는 경우, 반드시 연도가 +1년 바뀐 것으로 인식해야 합니다. (예: Project Start Date가 2026-07-20일 때, 10월 24일 ~ 01월 13일 공정의 시작일은 2026-10-24, 종료일은 2027-01-13이며, 이후 01월 06일 공정은 2027-01-06입니다.)
4. 동일 공정(Activity)의 종료일(endDate)은 시작일(startDate)보다 항상 같거나 뒤여야 합니다.

JSON 출력 예시:
{
 "projects": [
  {
   "projectName": "SKOH 10Line - Stacker 1호기",
   "equipment": "Stacker 1호기",
   "line": "10Line",
   "manufacturingNo": "91144",
   "startDate": "2026-02-10",
   "endDate": "2026-08-30",
   "milestones": [
    { "name": "기구 셋팅", "startDate": "2026-07-06", "endDate": "2026-07-19" }
   ],
   "manpower": {
    "totalManday": 507,
    "dailyPeak": 21,
    "departments": {
     "Mechanical": { "total": 240, "peak": 11, "daily": { "2026-05-15": 6 } },
     "Vision": { "total": 94, "peak": 4, "daily": { "2026-05-15": 2 } },
     "Vision Sub": { "total": 25, "peak": 2, "daily": { "2026-05-15": 2 } },
     "Control": { "total": 47, "peak": 2, "daily": { "2026-05-15": 2 } },
     "Electrical": { "total": 61, "peak": 5, "daily": { "2026-05-15": 3 } },
     "Electrical Sub": { "total": 20, "peak": 2, "daily": { "2026-05-15": 2 } },
     "Supervisor": { "total": 11, "peak": 1, "daily": { "2026-05-15": 1 } },
     "Safety": { "total": 54, "peak": 2, "daily": { "2026-05-15": 2 } }
    },
    "dailyTotal": { "2026-05-15": 9 }
   }
  }
 ]
}

주의: JSON 이외의 어떠한 설명이나 마크다운 백틱(\`\`\`)을 포함하지 말고 순수 JSON만 응답하세요.`;

      let responseText = (await generateAIText([...parts, prompt], {
        notConfiguredMessage: "엑셀 표 서식을 자동으로 판독하지 못했거나, AI 분석용 API 키(Gemini 또는 Claude)가 설정되지 않았습니다.",
      })).trim();
      if (responseText.startsWith("```json")) responseText = responseText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      else if (responseText.startsWith("```")) responseText = responseText.replace(/^```\s*/, "").replace(/\s*```$/, "");
      const rawJson = JSON.parse(responseText);
      let rawList = [];
      if (rawJson.projects && Array.isArray(rawJson.projects) && rawJson.projects.length > 0) {
        rawList = rawJson.projects;
      } else {
        rawList = [rawJson];
      }
      const aiProjects = rawList.map(adjustProjectDates);
      await saveDirectProjects(aiProjects, "AI 분석");
    } catch (err) {
      let userFriendlyMsg = "분석 중 알 수 없는 오류가 발생했습니다. 지속되면 담당자에게 문의해주세요.";
      if (err.message.includes("429") || err.message.includes("quota")) {
        userFriendlyMsg = "AI 분석 요청량이 폭주하여 일시적으로 제한되었습니다. 약 1~2분 뒤에 다시 시도해주시고, 계속 안 될 경우 담당자에게 문의해주세요.";
      } else if (err.message.includes("403") || err.message.includes("API_KEY_INVALID")) {
        userFriendlyMsg = "API Key가 유효하지 않습니다. 환경설정에서 Gemini API Key를 확인해주세요.";
      }
      
      setMsg(
        <span style={{ color: 'var(--bad)' }}>
          분석 실패: {userFriendlyMsg}
          <div style={{ fontSize: '11px', color: 'var(--brand)', fontWeight: 'normal', marginTop: '4px' }}>
            원인파악용 기술 정보: {err.message}
          </div>
        </span>
      );
    } finally {
      setIsExtracting(false);
      if (masterPlanInput.current) masterPlanInput.current.value = "";
    }
  }

  const ganttBase = ganttView;
  const isGanttConstruction = ganttMode === 'construction';

  // 프로젝트별 간트차트 데이터(시작/종료일, 공사진행률, 마일스톤) 추출 헬퍼
  const getProjectGanttData = (p) => {
    if (isGanttConstruction) {
      const cp = getConstructionPeriod(p);
      return {
        startDate: cp.startDate || p.startDate,
        endDate: cp.endDate || p.endDate,
        progress: cp.progress !== undefined ? cp.progress : (p.value ?? 0),
        hasConstructionData: cp.hasConstructionData,
        reason: cp.reason,
        milestones: (cp.constrMilestones && cp.constrMilestones.length > 0) ? cp.constrMilestones : (p.milestones || []),
        constrMilestones: cp.constrMilestones || []
      };
    }
    return {
      startDate: p.startDate,
      endDate: p.endDate,
      progress: p.value ?? (p.status === '완료' ? 100 : 0),
      hasConstructionData: false,
      reason: '프로젝트 전체 기간',
      milestones: p.milestones || [],
      constrMilestones: []
    };
  };

  const gs = ganttBase.length
    ? new Date(Math.min(
        ...(ganttStartDate ? [dt(ganttStartDate).getTime()] : []),
        ...ganttBase.flatMap(p => {
          const gd = getProjectGanttData(p);
          return [dt(gd.startDate).getTime(), ...gd.milestones.map(m => dt(m.startDate).getTime())];
        })
      ))
    : (ganttStartDate ? dt(ganttStartDate) : dt(iso()));

  const ge = ganttBase.length
    ? new Date(Math.max(
        ...(ganttEndDate ? [dt(ganttEndDate).getTime()] : []),
        ...ganttBase.flatMap(p => {
          const gd = getProjectGanttData(p);
          return [dt(gd.endDate).getTime(), ...gd.milestones.map(m => dt(m.endDate).getTime())];
        })
      ))
    : (ganttEndDate ? dt(ganttEndDate) : new Date(gs.getTime() + DAY));

  const span = Math.max(DAY, ge - gs + DAY);
  const pos = d => Math.max(0, Math.min(100, (dt(d) - gs) / span * 100));
  const barW = (s, e) => Math.max(1, (dt(e) - dt(s) + DAY) / span * 100);
  const cells = monthCells(month);

  const monthMatrixData = useMemo(() => {
    const mat = getMonthDailyDeptMatrix(view, month.getFullYear(), month.getMonth());
    const totalMonthManday = mat.days.reduce((acc, dStr) => acc + (mat.dayDataMap[dStr]?.total || 0), 0);
    return { ...mat, totalMonthManday };
  }, [view, month]);

  if (isPasswordRecovery) {
    return (
      <main className="login-page">
        <PasswordChangeModal
          isOpen={true}
          mode="recovery"
          userEmail={session?.user?.email || ""}
          onClose={() => {
            setIsPasswordRecovery(false);
            window.history.replaceState(null, "", window.location.pathname);
          }}
          onSuccess={(m) => {
            alert(m + "\n새 비밀번호로 로그인해 주세요.");
            setIsPasswordRecovery(false);
            window.history.replaceState(null, "", window.location.pathname);
            supabase.auth.signOut();
            setSession(null);
          }}
        />
      </main>
    );
  }

  if (loading) return <div className="center">확인 중...</div>;
  if (!session) return <Login />;
  if (!profile) return <div className="center">권한 확인 중... {msg}</div>;


  return (
    <main>
      {/* 고정 최상단 헤더 래퍼 (틀고정 / Freeze Pane) */}
      <div id="app-fixed-top" className="system-fixed-top-bar">
        <header className="system-main-header">
          <div className="system-brand-left">
            <img
              src={theme === 'dark' ? `${import.meta.env.BASE_URL || '/'}tw-logo-dark.png`.replace('//', '/') : `${import.meta.env.BASE_URL || '/'}tw-logo.png`.replace('//', '/')}
              alt="TW Logo"
              className="system-brand-logo"
            />
            <span className="system-brand-sep" aria-hidden="true" />
            <span className="system-brand-prod">Project Management</span>
          </div>

          <nav className="system-nav-bar-row" aria-label="시스템 메뉴">
            <button
              type="button"
              className={`nav-tab-btn tab-projects ${currentView === "projects" ? "active" : ""}`}
              onClick={() => switchView("projects")}
            >
              <Icon name="calendar" size={16} />
              <span className="nav-tab-label">프로젝트 일정</span>
            </button>
            <button
              type="button"
              className={`nav-tab-btn tab-manpower ${currentView === "manpower" ? "active" : ""}`}
              onClick={() => switchView("manpower")}
            >
              <Icon name="users" size={16} />
              <span className="nav-tab-label">공수 통합 관리</span>
            </button>
            <button
              type="button"
              className={`nav-tab-btn tab-issues ${currentView === "issues" ? "active" : ""}`}
              onClick={() => switchView("issues")}
            >
              <Icon name="alert" size={16} />
              <span className="nav-tab-label">이슈 통합 관리</span>
            </button>
            <button
              type="button"
              className={`nav-tab-btn tab-daily-reports ${currentView === "daily-reports" ? "active" : ""}`}
              onClick={() => switchView("daily-reports")}
            >
              <Icon name="file" size={16} />
              <span className="nav-tab-label">공사일보 통합 관리</span>
            </button>
            <button
              type="button"
              className={`nav-tab-btn tab-quotations ${currentView === "quotations" ? "active" : ""} ${!canAccessQuotations ? "restricted" : ""}`}
              onClick={() => {
                if (!canAccessQuotations) return showPermissionModal("견적 조회");
                switchView("quotations");
              }}
              title={!canAccessQuotations ? "견적 기능은 Grade 3(PM/소장) 이상만 이용할 수 있습니다 (클릭 시 권한 안내)" : ""}
            >
              <Icon name="receipt" size={16} />
              <span className="nav-tab-label">견적 조회</span>
              {!canAccessQuotations && <Icon name="lock" size={13} className="nav-tab-lock" />}
            </button>
            <button
              type="button"
              className={`nav-tab-btn tab-vision-spc ${currentView === "vision-spc" ? "active" : ""}`}
              onClick={() => switchView("vision-spc")}
              title="Cp·Cpk 분석"
            >
              <Icon name="activity" size={16} />
              <span className="nav-tab-label">Vision SPC</span>
            </button>
          </nav>

          <div className="system-user-and-tools">
            <button
              type="button"
              onClick={toggleTheme}
              className="theme-toggle-btn"
              title={theme === 'dark' ? '밝은 화면(화이트 모드)으로 전환' : '편안한 화면(다크 모드)으로 전환'}
              aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
            </button>
            <HeaderUserMenu
              name={getUserDisplayName(session?.user?.email, profile || session?.user?.user_metadata)}
              roleLabel={role === "admin" ? "최고 관리자" : (role || 'GRADE 1').toUpperCase()}
              hasUpdate={hasUpdate}
              isAdmin={role === "admin"}
              newUserCount={newRegisteredUsers.length}
              onUpdate={handlePerformUpdate}
              onPassword={() => setShowPasswordModal(true)}
              onSignOut={handleSignOut}
              onUsers={() => {
                setModal("users");
                markUsersAsChecked();
                load("profiles");
              }}
            />
          </div>
        </header>

        {/* 업데이트 감지 안내 배너 */}
        {hasUpdate && !dismissUpdateNotice && (
          <div className="app-update-notice-banner" role="alert">
            <Icon name="bell" size={15} />
            <div className="app-update-notice-text">
              <b>새로운 업데이트가 있습니다</b>
              <span className="app-update-subtext">진행 중인 업무를 마무리하신 후 천천히 새로고침하셔도 됩니다</span>
            </div>
            <div className="app-update-actions">
              <button
                type="button"
                onClick={handlePerformUpdate}
                className="app-update-btn-refresh"
                title="최신 코드를 반영하여 페이지를 새로고침합니다"
              >
                지금 새로고침
              </button>
              <button
                type="button"
                onClick={handleDismissUpdate}
                className="app-update-btn-later"
                title="알림을 닫고 현재 작업을 계속합니다"
              >
                나중에
              </button>
            </div>
          </div>
        )}

        {/* ========================================================
            고객사별 독립 시스템 선택 바 (Customer Selection Bar)
            ======================================================== */}
        <div className="system-customer-bar-row">
          <span className="system-context-label">고객사</span>
          <div className="system-customer-capsule">
            {CUSTOMERS.map(cust => {
              const isSelected = currentCustomer === cust.id;
              const count = customerCounts[cust.id] || 0;
              return (
                <button
                  key={cust.id}
                  type="button"
                  onClick={() => {
                    setCurrentCustomer(cust.id);
                    setForm(f => ({ ...f, customer: cust.id }));
                  }}
                  className={`customer-tab-btn ${cust.cls} ${isSelected ? 'active' : ''}`}
                  title={`${cust.label} 독립 시스템으로 전환합니다 (${count}건 등록됨)`}
                >
                  <span className="customer-logo-badge">{cust.logo}</span>
                  <span className="customer-label">{cust.label}</span>
                  <span className="customer-count-badge">{count}건</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 최고 관리자 전용 신규 가입자 알림 배너 */}
      {role === "admin" && newRegisteredUsers.length > 0 && (
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1.5px solid var(--primary-blue)',
            borderRadius: 'var(--radius-lg)',
            padding: '12px 18px',
            margin: '8px 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: 'var(--shadow-sm)',
            flexWrap: 'wrap',
            gap: '10px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Icon name="bell" size={22} />
            <div>
              <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>신규 가입자가 있습니다!</span>
                <span style={{ background: 'var(--brand)', color: 'var(--on-brand)', fontSize: '11px', padding: '1px 8px', borderRadius: 'var(--radius-lg)', fontWeight: 'bold' }}>
                  {newRegisteredUsers.length}명 대기중
                </span>
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                가입자 메일주소: <b style={{ color: 'var(--text-primary)' }}>{newRegisteredUsers.map(u => u.email).join(', ')}</b>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => {
                setModal("users");
                markUsersAsChecked();
              }}
              style={{
                background: 'var(--brand)',
                color: 'var(--on-brand)',
                border: 'none',
                padding: '7px 14px',
                borderRadius: 'var(--radius-md)',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: 'none'
              }}
            >
              권한 설정 바로가기
            </button>
            <button
              type="button"
              onClick={markUsersAsChecked}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-medium)',
                color: 'var(--text-secondary)',
                padding: '7px 12px',
                borderRadius: 'var(--radius-md)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
              title="알림을 닫고 확인 완료 처리합니다"
            >
              확인 (닫기)
            </button>
          </div>
        </div>
      )}

      {/* ========================================================
          PINTEL / PREVAX FLOATING YEAR SELECTOR TOOLBAR
          ======================================================== */}
      <div className="prevax-year-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'nowrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)', marginRight: '2px', whiteSpace: 'nowrap' }}>
            <Icon name="calendar" size={15} />
            <span>조회 연도:</span>
          </div>

          {/* 1. 빠른 프리셋 캡슐 버튼 */}
          <div className="prevax-year-pill-group" style={{ flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => handlePresetYears('current')}
              className={`prevax-year-pill-btn ${(!isAllYears && selectedYears.length === 1 && selectedYears[0] === currentYearStr) ? 'active' : ''}`}
              title="현재 진행 중인 당해 연도 프로젝트만 조회합니다"
            >
              당해년도 ({currentYearStr})
            </button>
            <button
              type="button"
              onClick={() => handlePresetYears('2years')}
              className={`prevax-year-pill-btn ${(!isAllYears && selectedYears.length === 2 && selectedYears.includes(currentYearStr)) ? 'active' : ''}`}
              title="최근 2년간(작년+올해)의 프로젝트를 묶어서 조회합니다"
            >
              최근 2개년
            </button>
            <button
              type="button"
              onClick={() => handlePresetYears('3years')}
              className={`prevax-year-pill-btn ${(!isAllYears && selectedYears.length === 3 && selectedYears.includes(currentYearStr)) ? 'active' : ''}`}
              title="최근 3년간의 프로젝트를 묶어서 조회합니다"
            >
              최근 3개년
            </button>
            <button
              type="button"
              onClick={() => handlePresetYears('all')}
              className={`prevax-year-pill-btn ${isAllYears ? 'active' : ''}`}
              title="전체 연도의 모든 프로젝트를 조회합니다"
            >
              전체 연도
            </button>
          </div>

          <span style={{ color: 'var(--border-medium)', margin: '0 2px' }}>|</span>

          {/* 2. 개별 연도 복수 토글 알약 태그 */}
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'nowrap', alignItems: 'center', flexShrink: 0 }}>
            {availableYears.map(yr => {
              const isSelected = !isAllYears && selectedYears.includes(yr);
              const isCurrent = (yr === currentYearStr);
              return (
                <button
                  key={yr}
                  type="button"
                  onClick={() => handleToggleYear(yr)}
                  className={`prevax-tag-btn ${isSelected ? 'active' : ''}`}
                  title={`클릭하여 ${yr}년도를 다중 선택/해제합니다`}
                >
                  <span>{yr}년</span>
                  {isSelected && <Icon name="check" size={12} stroke={2.2} />}
                  {isCurrent && !isSelected && (
                    <span style={{ fontSize: '9px', background: 'color-mix(in srgb, var(--teal) 15%, transparent)', color: 'var(--neon-cyan)', padding: '0 4px', borderRadius: 'var(--radius-md)' }}>
                      당해
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 현재 조회 범위 칩 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
          <span style={{ color: 'var(--text-muted)' }}>현재 범위:</span>
          <span style={{ 
            background: 'var(--bg-card-subtle)', 
            border: '1px solid var(--border-medium)', 
            padding: '3px 10px', 
            borderRadius: 'var(--radius-lg)', 
            fontWeight: 700, 
            color: 'var(--text-primary)',
            fontSize: '11.5px'
          }}>
            {isAllYears ? "전체 연도" : selectedYears.length === 1 ? `${selectedYears[0]}년` : `${selectedYears.slice().sort().join(', ')}년 (${selectedYears.length}개년)`}
            <span style={{ color: 'var(--neon-cyan)', marginLeft: '6px' }}>({yearStats.total}건)</span>
          </span>
        </div>
      </div>

      {currentView === "vision-spc" ? (
        <ErrorBoundary><VisionSPC currentCustomer={currentCustomer} /></ErrorBoundary>
      ) : currentView === "issues" ? (
        <ErrorBoundary>
          <IntegratedIssueCenter
            projects={currentCustomerProjects}
            sites={sites}
            role={role}
            currentCustomer={currentCustomer}
            onPermissionDenied={showPermissionModal}
            externalNewIssueData={externalNewIssueData}
            onClearExternalData={() => setExternalNewIssueData(null)}
          />
        </ErrorBoundary>
      ) : currentView === "daily-reports" ? (
        <ErrorBoundary>
          <IssueManagement
            projects={currentCustomerProjects}
            sites={sites}
            role={role}
            onPermissionDenied={showPermissionModal}
            selectedYears={selectedYears}
            currentCustomer={currentCustomer}
            onNavigateToIssueCenter={(issueData) => {
              setExternalNewIssueData(issueData);
              switchView("issues");
            }}
          />
        </ErrorBoundary>
      ) : currentView === "quotations" ? (
        <Quotations projects={currentCustomerProjects} session={session} role={role} onPermissionDenied={showPermissionModal} currentCustomer={currentCustomer} />
      ) : currentView === "manpower" ? (
        <ManpowerManagement
          projects={view}
          allProjects={currentCustomerProjects}
          sites={sites}
          onSelectProject={(p) => {
            if (!canViewManpowerDetail) return showPermissionModal("공수 상세 조회");
            setSelectedManpowerProject(p);
          }}
          selectedYears={selectedYears}
          availableYears={availableYears}
          onToggleYear={handleToggleYear}
          onPresetYears={handlePresetYears}
          role={role}
          onPermissionDenied={showPermissionModal}
          currentCustomer={currentCustomer}
        />
      ) : (
        <>
          {/* 프로젝트 일정 관리 시스템 메인 헤더 카드 (틀고정) */}
          <div className="system-sticky-header">
            <div className="system-header-row">
              <div className="system-title-group">
                <div className="system-title-text">
                  <span className="eyebrow">Project Schedule</span>
                  <h2>
                    {currentCustomer} · 프로젝트 일정 관리 시스템
                  </h2>
                  <p>
                    [{currentCustomer}] 마스터 스케줄 일정 계획, 마일스톤 Gantt 차트 및 종합 공수 모니터링
                  </p>
                </div>
              </div>

              <div className="system-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="ppt-btn"
                  onClick={() => openIntegratedExportModal('system')}
                  title="간트차트, 공사일정 달력, 부서별 공수표가 통합된 종합 PPT 보고서를 내보냅니다 (Office 네이티브 수정 가능)"
                >
                  <Icon name="download" size={15} /> PPT 종합 보고서 내보내기 {!canExportAnalysis && <Icon name="lock" size={13} />}
                </button>
                <button
                  type="button"
                  onClick={() => setAllSections(true)}
                  className="system-toggle-all-btn"
                  title="프로젝트 일정의 모든 소항목 펼치기"
                >
                  <Icon name="chevDown" size={14} /> 전체 펼치기
                </button>
                <button
                  type="button"
                  onClick={() => setAllSections(false)}
                  className="system-toggle-all-btn"
                  title="프로젝트 일정의 모든 소항목 접기"
                >
                  <Icon name="chevUp" size={14} /> 전체 접기
                </button>
              </div>
            </div>


            {/* 소항목 필터 버튼 그룹 */}
            <div className="system-sub-nav">
              {[
                { id: 'all', icon: 'layers', label: '전체 표시' },
                ...(edit ? [{ id: 'form', icon: 'pencil', label: '프로젝트 등록/수정' }] : []),
                { id: 'filter', icon: 'filter', label: '일정 조회 필터' },
                { id: 'gantt', icon: 'barChart', label: '프로젝트 간트차트' },
                { id: 'calendar', icon: 'calendar', label: '프로젝트 일정 달력' },
                { id: 'list', icon: 'list', label: '프로젝트 목록' }
              ].map(sec => (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => handleSelectProjectSection(sec.id)}
                  className={`system-sub-btn ${activeProjectSection === sec.id ? 'active' : ''}`}
                >
                  <Icon name={sec.icon} size={15} />
                  {sec.label}
                </button>
              ))}
            </div>
          </div>
          {edit && (activeProjectSection === 'all' || activeProjectSection === 'form') && (
            <section style={{ transition: 'all 0.2s ease' }}>
              <div 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  marginBottom: collapsedSections.form ? 0 : '14px', 
                  flexWrap: 'wrap', 
                  gap: '12px',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}
                onClick={() => toggleSection('form')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{editing ? "프로젝트 수정" : "프로젝트 등록"}</span>
                    <span style={{ fontSize: '13px', fontWeight: 'bold', color: collapsedSections.form ? 'var(--brand)' : 'var(--brand)' }}>
                      <FoldLabel collapsed={collapsedSections.form} />
                    </span>
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={e => e.stopPropagation()}>
                    <span style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: 'var(--radius-md)',
                      background: (form.customer || currentCustomer) === 'SK on' ? 'color-mix(in srgb, var(--signal) 14%, transparent)' : (form.customer || currentCustomer) === 'Samsung SDI' ? 'color-mix(in srgb, var(--brand) 14%, transparent)' : 'color-mix(in srgb, var(--ok) 14%, transparent)',
                      color: (form.customer || currentCustomer) === 'SK on' ? 'var(--signal)' : (form.customer || currentCustomer) === 'Samsung SDI' ? 'var(--brand)' : 'var(--ok)',
                      border: `1px solid ${(form.customer || currentCustomer) === 'SK on' ? 'color-mix(in srgb, var(--signal) 30%, transparent)' : (form.customer || currentCustomer) === 'Samsung SDI' ? 'color-mix(in srgb, var(--brand) 30%, transparent)' : 'color-mix(in srgb, var(--ok) 30%, transparent)'}`
                    }}>
                      소속 고객사: <b>{form.customer || currentCustomer}</b>
                    </span>
                  </div>
                  {editing && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={e => e.stopPropagation()}>
                      <span style={{ fontSize: '13px', color: 'var(--brand)', fontWeight: 'bold', background: 'var(--brand-wash)', padding: '3px 9px', borderRadius: 'var(--radius-md)', border: '1px solid color-mix(in srgb, var(--brand) 40%, transparent)' }}>
                        수정 대상: {form.name || "선택됨"}
                      </span>
                      <button
                        type="button"
                        onClick={() => { setEditing(null); setForm(blank(currentCustomer)); setMilestones(newMs()); setMsg(""); }}
                        style={{ fontSize: '12px', padding: '4px 10px', background: 'var(--bg-card-subtle)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
                      >
                        수정 취소
                      </button>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => toggleSection('form')}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                      background: 'var(--bg-card)',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      cursor: 'pointer'
                    }}
                  >
                    <FoldLabel collapsed={collapsedSections.form} closed="입력란 펼치기" open="입력란 접기" />
                  </button>
                  <a
                    href={`${import.meta.env.BASE_URL || '/'}master-schedule-template.xlsx`.replace('//', '/')}
                    download="Master Schedule 양식.xlsx"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 14px',
                      height: '66px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--line-2)',
                      borderRadius: 'var(--radius-lg)',
                      color: 'var(--text-primary)',
                      textDecoration: 'none',
                      cursor: 'pointer',
                      boxShadow: 'none',
                      boxSizing: 'border-box',
                      transition: 'all 0.2s ease',
                      flexShrink: 0
                    }}
                    onMouseOver={e => {
                      e.currentTarget.style.background = 'var(--bg-hover)';
                      e.currentTarget.style.borderColor = 'var(--border-strong)';
                    }}
                    onMouseOut={e => {
                      e.currentTarget.style.background = 'var(--bg-card)';
                      e.currentTarget.style.borderColor = 'var(--line-2)';
                    }}
                    title="클릭 시 'Master Schedule 양식.xlsx' 파일이 다운로드됩니다."
                  >
                    <div style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--line-2)',
                      color: 'var(--ink-2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '20px',
                      boxShadow: 'none'
                    }}>
                      <Icon name="download" size={20} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <b style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Master Schedule 양식</b>
                        <span style={{ fontSize: '10px', fontWeight: 600, fontFamily: 'var(--font-mono)', letterSpacing: '.04em', background: 'var(--ok-wash)', color: 'var(--ok)', padding: '1px 6px', borderRadius: 'var(--radius-xs)' }}>EXCEL</span>
                      </div>
                      <span style={{ fontSize: '11.5px', color: 'var(--ink-3)', fontWeight: '500', marginTop: '3px' }}>
                        양식 다운로드 받기
                      </span>
                    </div>
                  </a>
                  <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)', padding: '8px 12px 10px', background: 'var(--surface-2)' }}>
                    <div style={{ textAlign: 'center', marginBottom: '8px', fontSize: '13px' }}>
                      <b style={{ color: 'var(--text-primary)' }}>{editing ? "최신 Master Schedule 등록 (최신화)" : "Master Schedule 등록"}</b>{" "}
                      <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '12px' }}>
                        {editing ? "※마스터 스케줄 첨부 시 일정 및 공수 데이터가 최신 버전으로 즉시 갱신됩니다" : "※공수 포함 등록시 공수 통합 관리 자동 반영"}
                      </span>
                    </div>
                    <input type="file" ref={masterPlanInput} onChange={e => handleMasterPlanUpload(e.target.files[0])} accept=".xlsx, .xls" style={{ display: 'none' }} />
                    {/* 표 붙여넣기(주)를 색이 있는 칸으로, 파일 첨부(보조)는 옆 버튼으로 — DRM 문서는 붙여넣기만 가능하다 */}
                    <PasteEntry
                      wrap={false}
                      file={{
                        label: '파일 첨부 (Excel)',
                        busy: isExtracting,
                        busyLabel: 'AI 분석 중...',
                        disabled: isExtracting,
                        onClick: () => masterPlanInput.current.click(),
                      }}
                    >
                      <PasteZone
                        label="엑셀 표 붙여넣기"
                        hint="표 복사(Ctrl+C) → 클릭 → Ctrl+V"
                        busy={isExtracting}
                        busyLabel="AI 분석 중..."
                        onPaste={(e) => {
                          const html = e.clipboardData?.getData("text/html") || "";
                          const text = e.clipboardData?.getData("text/plain") || e.clipboardData?.getData("text") || "";
                          
                          // 1. If tabular text or HTML table exists in clipboard (Excel copy always contains text/plain with tabs or HTML table)
                          if ((text && text.includes('\t')) || (html && html.includes('<table'))) {
                            e.preventDefault();
                            e.target.value = "";
                            handleMasterPlanUpload({ text, html });
                            return;
                          }

                          // 2. Only if NO tabular text/html, check for standalone image paste
                          const items = e.clipboardData?.items;
                          if (items) {
                            for (let i = 0; i < items.length; i++) {
                              const item = items[i];
                              if (item.type.indexOf("image") !== -1) {
                                e.preventDefault();
                                const file = item.getAsFile();
                                if (file) {
                                  handleMasterPlanUpload(file);
                                  return;
                                }
                              }
                            }
                          }

                          // 3. Fallback for general text
                          if (text && text.trim().length > 5) {
                            e.preventDefault();
                            e.target.value = "";
                            handleMasterPlanUpload({ text, html });
                          }
                        }}
                      />
                    </PasteEntry>
                  </div>
                </div>
              </div>

              {!collapsedSections.form ? (
                <>
                  <div className="grid">
                    <label>고객사 *
                      <select value={form.customer || currentCustomer} disabled={role === "grade2"} onChange={e => setForm({ ...form, customer: e.target.value })}>
                        {CUSTOMERS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                    </label>
                    <label>제조번호<input value={form.manufacturingNo} disabled={role === "grade2"} onChange={e => setForm({ ...form, manufacturingNo: e.target.value })} /></label>
                    <label>Site *
                      <select value={form.site} disabled={role === "grade2"} onChange={e => setForm({ ...form, site: e.target.value })}>
                        <option value="">선택</option>
                        {sites.map(s => <option key={s.id}>{s.name}</option>)}
                      </select>
                    </label>
                    <label>Line<input value={form.line} disabled={role === "grade2"} onChange={e => setForm({ ...form, line: e.target.value })} /></label>
                    <label className="wide">프로젝트명 *<input value={form.name} disabled={role === "grade2"} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
                    <label>시작일<input type="date" value={form.startDate} disabled={role === "grade2"} onChange={e => setForm({ ...form, startDate: e.target.value })} /></label>
                    <label>종료일<input type="date" value={form.endDate} disabled={role === "grade2"} onChange={e => setForm({ ...form, endDate: e.target.value })} /></label>
                    <label>상태
                      <select value={form.status} onChange={e => handleStatusChange(e.target.value)}>
                        {STATUSES.map(s => <option key={s} value={s}>{s}{s === "PO대기중" ? " (수동 전용)" : ""}</option>)}
                      </select>
                    </label>
                  </div>

                  <div className="people">
                    <PersonField label="소장(Manager) 담당자" value={form.pm} disabled={role === "grade2"} onChange={v => setForm({ ...form, pm: v })} dept="소장" people={people} />
                    <PersonField label="설계 담당자" value={form.design} disabled={role === "grade2"} onChange={v => setForm({ ...form, design: v })} dept="설계" people={people} />
                    <PersonField label="설비기술 담당자" value={form.facilityTechnology} disabled={role === "grade2"} onChange={v => setForm({ ...form, facilityTechnology: v })} dept="설비기술" people={people} />
                    <PersonField label="제어 담당자" value={form.control} disabled={role === "grade2"} onChange={v => setForm({ ...form, control: v })} dept="제어" people={people} />
                    <PersonField label="비전 담당자" value={form.vision} disabled={role === "grade2"} onChange={v => setForm({ ...form, vision: v })} dept="비전" people={people} />
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', margin: '10px 0 6px' }}>
                    <button
                      type="button"
                      onClick={() => { if (!del) return showPermissionModal("Site 관리"); setModal("sites"); }}
                      style={{
                        padding: '6px 14px',
                        fontSize: '12px',
                        fontWeight: 600,
                        background: 'var(--bg-card-subtle)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        boxShadow: 'var(--shadow-xs)'
                      }}
                      title="Site 관리 (Site 목록 추가, 수정, 삭제)"
                    >
                      <Icon name="building" size={14} /> Site 관리 {!del && <Icon name="lock" size={12} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => { if (!del) return showPermissionModal("담당자 관리"); setModal("personnel"); }}
                      style={{
                        padding: '6px 14px',
                        fontSize: '12px',
                        fontWeight: 600,
                        background: 'var(--bg-card-subtle)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        boxShadow: 'var(--shadow-xs)'
                      }}
                      title="담당자 관리 (부서별 인원 추가, 수정, 삭제)"
                    >
                      <Icon name="users" size={14} /> 담당자 관리 {!del && <Icon name="lock" size={12} />}
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', margin: '8px 0' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', whiteSpace: 'nowrap' }}>
                      <input type="checkbox" style={{ width: 'auto', margin: 0, cursor: 'pointer' }} checked={form.autoStatus} onChange={e => handleAutoStatusToggle(e.target.checked)} />
                      <span>마일스톤 기준 상태 자동 계산</span>
                    </label>
                    {form.autoStatus && (
                      <span style={{ fontSize: '12px', color: 'var(--ok)', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                        (현재 계산: {computedCurrentStatus})
                      </span>
                    )}
                    {form.isManualStatus && (
                      <span style={{ fontSize: '12px', color: 'var(--signal)', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                        <Icon name="alert" size={14} /> 수동 수정 상태 (수정자: {form.manualStatusBy || currentUserName})
                      </span>
                    )}
                  </div>

                  {form.isManualStatus && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--warning-muted)', border: '1px solid color-mix(in srgb, var(--signal) 30%, transparent)', padding: '6px 12px', borderRadius: 'var(--radius-md)', margin: '4px 0 8px', fontSize: '12px', color: 'var(--warning)', flexWrap: 'wrap' }}>
                      <span>수동 수정한 인원 이름:</span>
                      <input style={{ width: '140px', padding: '4px 8px', fontSize: '12px' }} value={form.manualStatusBy} onChange={e => setForm({ ...form, manualStatusBy: e.target.value })} placeholder="이름 입력" list="people-status-list" />
                      <datalist id="people-status-list">{peopleNames.map(n => <option key={n} value={n} />)}</datalist>
                      <span style={{ fontSize: '11px', color: 'var(--warning)' }}>* 프로젝트 목록에 '상태 확인 후 상태 변경을 해주세요' 문구와 함께 표시됩니다.</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', margin: '8px 0' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', whiteSpace: 'nowrap' }}>
                      <input type="checkbox" style={{ width: 'auto', margin: 0, cursor: 'pointer' }} checked={form.autoProgress} onChange={e => handleAutoProgressToggle(e.target.checked)} />
                      <span>일정 기준 진행률 자동 계산</span>
                    </label>
                    {!form.autoProgress && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginLeft: '4px' }}>
                        <input type="range" min="0" max="100" value={form.progress} onChange={e => setForm({ ...form, progress: e.target.value })} style={{ width: '150px', cursor: 'pointer' }} />
                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--brand)' }}>{form.progress}%</span>
                      </div>
                    )}
                  </div>

                  {create && (
                    <div className="milestones">
                      <div className="milestone-title-row">
                        <div>
                          <h3>마일스톤</h3>
                          <p>프로젝트의 주요 단계와 기간을 입력하세요.</p>
                        </div>
                        <button type="button" className="milestone-add" onClick={addMilestoneRow}>+ 마일스톤 추가</button>
                      </div>
                      <div className="mh">
                        <span>번호</span>
                        <b>마일스톤명</b>
                        <b>시작일</b>
                        <b>종료일</b>
                        <span>삭제</span>
                      </div>
                      {milestones.map((m, i) => (
                        <div className="mr" key={m.id}>
                          <span>{i + 1}</span>
                          <input value={m.name} placeholder="마일스톤명" onChange={e => setMilestones(milestones.map((x, n) => n === i ? { ...x, name: e.target.value } : x))} />
                          <input type="date" value={m.startDate} onChange={e => setMilestones(milestones.map((x, n) => n === i ? { ...x, startDate: e.target.value } : x))} />
                          <input type="date" value={m.endDate} onChange={e => setMilestones(milestones.map((x, n) => n === i ? { ...x, endDate: e.target.value } : x))} />
                          <button type="button" className="milestone-remove" onClick={() => removeMilestoneRow(i)} aria-label={`${i + 1}번 마일스톤 삭제`}>×</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {msg && <p className="notice" style={{ marginTop: '10px', fontWeight: 'bold', color: 'var(--ok)' }}>{msg}</p>}

                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '15px', flexWrap: 'wrap' }}>
                    <button className="primary" onClick={save}>{editing ? "수정 저장" : "프로젝트 추가"}</button>
                    {editing && (
                      <button
                        type="button"
                        onClick={() => { setEditing(null); setForm(blank()); setMilestones(newMs()); setMsg(""); }}
                        style={{ background: 'var(--brand)', color: 'var(--on-brand)', padding: '10px 18px', borderRadius: 'var(--radius-md)', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
                      >
                        수정 취소
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div 
                  onClick={() => toggleSection('form')}
                  className="section-collapsed-placeholder"
                >
                  프로젝트 {editing ? "수정" : "등록"} 입력란이 접혀 있습니다. (클릭하여 입력란 펼치기)
                </div>
              )}
            </section>
          )}

          {(activeProjectSection === 'all' || activeProjectSection === 'filter') && (
          <section>
            <div 
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none', marginBottom: collapsedSections.filter ? 0 : '10px' }}
              onClick={() => toggleSection('filter')}
            >
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>일정 조회 필터</span>
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: collapsedSections.filter ? 'var(--brand)' : 'var(--brand)' }}>
                  <FoldLabel collapsed={collapsedSections.filter} />
                </span>
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={e => e.stopPropagation()}>
                {!collapsedSections.filter && (
                  <button 
                    type="button"
                    onClick={() => { handlePresetYears('current'); setSiteFilter("전체"); setPersonFilter("전체"); }}
                    className="filter-reset-btn"
                    title="조회 연도, Site, 담당자 필터를 초기화합니다"
                  >
                    <Icon name="refresh" size={14} /> 필터 초기화
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => toggleSection('filter')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-card)',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  <FoldLabel collapsed={collapsedSections.filter} closed="필터 펼치기" open="필터 접기" />
                </button>
              </div>
            </div>
            {!collapsedSections.filter ? (
              <div className="filterbar" style={{ marginTop: '6px' }}>
                <select
                  value={isAllYears ? "전체" : (selectedYears.length === 1 ? selectedYears[0] : "복수선택")}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === "전체") handlePresetYears('all');
                    else handleToggleYear(val);
                  }}
                  style={{ fontWeight: 600 }}
                >
                  <option value="전체">연도: 전체 ({availableYears.length}개년)</option>
                  {!isAllYears && selectedYears.length > 1 && (
                    <option value="복수선택" disabled>연도: {selectedYearsLabel} (복수 선택중)</option>
                  )}
                  {availableYears.map(yr => (
                    <option key={yr} value={yr}>연도: {yr}년 {yr === currentYearStr ? '(현재)' : ''}</option>
                  ))}
                </select>
                <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)}>
                  <option>전체</option>
                  {sites.map(s => <option key={s.id}>{s.name}</option>)}
                </select>
                <select value={personFilter} onChange={e => setPersonFilter(e.target.value)}>
                  <option>전체</option>
                  {peopleNames.map(p => <option key={p}>{p}</option>)}
                </select>
                <button 
                  type="button"
                  className="filter-reset-btn"
                  onClick={() => { handlePresetYears('current'); setSiteFilter("전체"); setPersonFilter("전체"); }}
                >
                  <Icon name="refresh" size={14} /> 필터 초기화
                </button>
              </div>
            ) : (
              <div 
                onClick={() => toggleSection('filter')}
                style={{
                  padding: '10px 14px',
                  background: 'var(--bg-card-subtle)',
                  border: '1px dashed var(--border-medium)',
                  borderRadius: 'var(--radius-md)',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: '13px',
                  cursor: 'pointer',
                  marginTop: '8px'
                }}
              >
                <Icon name="filter" size={14} /> 연도: <b>{selectedYearsLabel}</b> · Site: <b>{siteFilter}</b> · 담당자: <b>{personFilter}</b> (클릭하여 필터 변경)
              </div>
            )}
          </section>
          )}

          {(activeProjectSection === 'all' || activeProjectSection === 'gantt') && (
          <section id="gantt-export">
            <div className="title" style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }} onClick={(e) => {
              if (e.target.tagName !== 'BUTTON') toggleSection('gantt');
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <h2>프로젝트 간트차트 {ganttView.length > 0 && <span style={{ fontSize: '14px', color: 'var(--brand)', fontWeight: 'normal' }}>({ganttView.length}건)</span>}</h2>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleSection('gantt'); }}
                  style={{
                    background: collapsedSections.gantt ? 'var(--accent)' : 'var(--bg-card-subtle)',
                    color: collapsedSections.gantt ? 'var(--on-brand)' : 'var(--text-secondary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '2px 8px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0
                  }}
                >
                  <FoldLabel collapsed={collapsedSections.gantt} />
                </button>
              </div>
              <div className="view-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, whiteSpace: 'nowrap', flexWrap: 'wrap' }}>
                {/* 간트 일정 기준 모드 선택 토글 버튼 */}
                <div style={{ display: 'inline-flex', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)', padding: '2px' }}>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setGanttMode('construction'); }}
                    style={{
                      padding: '4px 9px',
                      fontSize: '11px',
                      fontWeight: ganttMode === 'construction' ? 700 : 500,
                      background: ganttMode === 'construction' ? 'var(--brand)' : 'transparent',
                      color: ganttMode === 'construction' ? 'var(--on-brand)' : 'var(--text-secondary)',
                      border: 'none',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.2s'
                    }}
                    title="공수 투입 시점 및 현장 공사 일정을 기준으로 간트차트 막대와 진행률(%)을 표시합니다"
                  >
                    <Icon name="wrench" size={14} /> 공사 일정 기준
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setGanttMode('project'); }}
                    style={{
                      padding: '4px 9px',
                      fontSize: '11px',
                      fontWeight: ganttMode === 'project' ? 700 : 500,
                      background: ganttMode === 'project' ? 'var(--brand)' : 'transparent',
                      color: ganttMode === 'project' ? 'var(--on-brand)' : 'var(--text-secondary)',
                      border: 'none',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.2s'
                    }}
                    title="프로젝트 전체 계약 및 전 기간을 기준으로 간트차트 막대와 전체 진행률(%)을 표시합니다"
                  >
                    <Icon name="list" size={14} /> 전체 프로젝트 일정 기준
                  </button>
                </div>
              </div>
            </div>

            {!collapsedSections.gantt ? (
              <>
                {/* 간트차트 기간 필터 툴바 */}
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  alignItems: 'center',
                  background: 'var(--bg-card-subtle)',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  marginBottom: '10px'
                }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Icon name="calendar" size={14} /> <b>진행 기간 설정:</b>
                  </span>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="date"
                      value={ganttStartDate}
                      onChange={e => setGanttStartDate(e.target.value)}
                      style={{ padding: '3px 8px', fontSize: '12px', border: '1px solid var(--input-border)', borderRadius: 'var(--radius-md)', height: '28px', background: 'var(--input-bg)', color: 'var(--input-text)' }}
                      title="간트차트 조회 시작일"
                    />
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>~</span>
                    <input
                      type="date"
                      value={ganttEndDate}
                      onChange={e => setGanttEndDate(e.target.value)}
                      style={{ padding: '3px 8px', fontSize: '12px', border: '1px solid var(--input-border)', borderRadius: 'var(--radius-md)', height: '28px', background: 'var(--input-bg)', color: 'var(--input-text)' }}
                      title="간트차트 조회 종료일"
                    />
                  </div>

                  <div style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => setQuickRange('thisMonth')}
                      style={{ padding: '3px 8px', fontSize: '11px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--text-secondary)' }}
                    >
                      이번 달
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickRange('nextMonth')}
                      style={{ padding: '3px 8px', fontSize: '11px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--text-secondary)' }}
                    >
                      다음 달
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickRange('thisQuarter')}
                      style={{ padding: '3px 8px', fontSize: '11px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--text-secondary)' }}
                    >
                      이번 분기
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickRange('thisYear')}
                      style={{ padding: '3px 8px', fontSize: '11px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--text-secondary)' }}
                    >
                      올해 전체
                    </button>
                    {(ganttStartDate || ganttEndDate) && (
                      <button
                        type="button"
                        onClick={() => { setGanttStartDate(''); setGanttEndDate(''); }}
                        style={{ padding: '3px 8px', fontSize: '11px', background: 'var(--danger-muted)', color: 'var(--danger)', border: '1px solid var(--danger-muted)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600 }}
                      >
                        <Icon name="x" size={12} /> 기간 초기화
                      </button>
                    )}
                  </div>

                  <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--brand)' }}>
                    {ganttStartDate || ganttEndDate ? (
                      <span>
                        기간 내 진행: <b style={{ color: 'var(--brand)' }}>{ganttView.length}</b>건
                        <span style={{ fontSize: '11px', color: 'var(--brand)', marginLeft: '4px' }}>(전체 {view.length}건 중)</span>
                      </span>
                    ) : (
                      <span>전체 프로젝트: <b>{view.length}</b>건</span>
                    )}
                  </span>
                </div>

                <div className="gantt">
                  <div className="axis">
                    <span>{iso(gs)}</span>
                    {(ganttStartDate || ganttEndDate) && (
                      <span style={{ fontSize: '11px', color: 'var(--brand)', fontWeight: 'bold' }}>
                        조회기간: {ganttStartDate || '시작'} ~ {ganttEndDate || '종료'}
                      </span>
                    )}
                    <span>{iso(ge)}</span>
                    <span className="g-today-chip" style={{ left: pos(iso()) + "%" }}>TODAY</span>
                  </div>

                  {ganttView.length === 0 ? (
                    <div style={{
                      padding: '36px 16px',
                      textAlign: 'center',
                      color: 'var(--text-secondary)',
                      background: 'var(--bg-card-subtle)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px dashed var(--border-medium)',
                      margin: '12px 0'
                    }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                        설정하신 기간 동안 진행되는 프로젝트가 없습니다.
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        설정 기간: <b>{ganttStartDate || '처음'}</b> ~ <b>{ganttEndDate || '끝'}</b>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setGanttStartDate(''); setGanttEndDate(''); }}
                        style={{
                          marginTop: '10px',
                          padding: '5px 12px',
                          fontSize: '12px',
                          background: 'var(--brand)',
                          color: 'var(--on-brand)',
                          border: 'none',
                          borderRadius: 'var(--radius-md)',
                          cursor: 'pointer',
                          fontWeight: 600
                        }}
                      >
                        기간 필터 초기화 (전체 보기)
                      </button>
                    </div>
                  ) : (
                    ganttView.map(p => {
                      const gd = getProjectGanttData(p);
                      return (
                      <div className="gblock" key={p.id}>
                        <div className="grow">
                          <button className="toggle" onClick={() => setGanttExpanded({ ...ganttExpanded, [p.id]: !ganttExpanded[p.id] })}>
                            <Icon name={ganttExpanded[p.id] ? "chevDown" : "chevRight"} size={15} />
                          </button>
                          <div className="glabel">
                            {p.manufacturingNo ? (
                              <span className="g-no">
                                {p.manufacturingNo.replace(/-[a-f0-9]{4}$/i, '')}
                                {isGanttConstruction && gd.hasConstructionData && (
                                  <span className="g-tag">공사</span>
                                )}
                              </span>
                            ) : null}
                            <span className="g-nm" title={p.name}>
                              {p.name}
                            </span>
                            <span className="g-mt">
                              {p.site} · {p.line || "-"} · <span className="mono" style={isGanttConstruction ? { color: 'var(--brand)', fontWeight: 600 } : undefined}>{gd.startDate ? gd.startDate.slice(5) : ''} ~ {gd.endDate ? gd.endDate.slice(5) : ''}</span>
                            </span>
                          </div>
                          <div className="track">
                            {(ganttStartDate || ganttEndDate) && (
                              <div
                                style={{
                                  position: 'absolute',
                                  left: `${ganttStartDate ? pos(ganttStartDate) : 0}%`,
                                  width: `${Math.max(0, (ganttEndDate ? pos(ganttEndDate) : 100) - (ganttStartDate ? pos(ganttStartDate) : 0))}%`,
                                  top: 0,
                                  bottom: 0,
                                  backgroundColor: 'color-mix(in srgb, var(--brand) 6%, transparent)',
                                  borderLeft: ganttStartDate ? '1px dashed var(--brand)' : 'none',
                                  borderRight: ganttEndDate ? '1px dashed var(--brand)' : 'none',
                                  pointerEvents: 'none',
                                  zIndex: 0
                                }}
                              />
                            )}
                            <div
                              className="projectbar"
                              style={{ left: pos(gd.startDate) + "%", width: Math.min(barW(gd.startDate, gd.endDate), 100 - pos(gd.startDate)) + "%", '--c': p.projectColor }}
                              title={`${p.name} | ${isGanttConstruction ? '공사 일정' : '전체 일정'}: ${gd.startDate} ~ ${gd.endDate} | 진행률: ${gd.progress}% (${gd.reason})`}
                            >
                              <i style={{ width: gd.progress + "%" }} />
                              <span>{isGanttConstruction ? (gd.hasConstructionData ? `공사 ${gd.progress}%` : `${gd.progress}%`) : `${gd.progress}%`}</span>
                            </div>
                            <div className="today" style={{ left: pos(iso()) + "%" }} />
                          </div>
                        </div>
                        {ganttExpanded[p.id] && gd.milestones.map(m => (
                          <div className="grow sub" key={m.id || m.name}>
                            <span />
                            <div className="glabel">
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {m.name}
                              </span>
                              <small>{m.startDate} ~ {m.endDate}</small>
                            </div>
                            <div className="track">
                              {(ganttStartDate || ganttEndDate) && (
                                <div
                                  style={{
                                    position: 'absolute',
                                    left: `${ganttStartDate ? pos(ganttStartDate) : 0}%`,
                                    width: `${Math.max(0, (ganttEndDate ? pos(ganttEndDate) : 100) - (ganttStartDate ? pos(ganttStartDate) : 0))}%`,
                                    top: 0,
                                    bottom: 0,
                                    backgroundColor: 'color-mix(in srgb, var(--brand) 6%, transparent)',
                                    borderLeft: ganttStartDate ? '1px dashed var(--brand)' : 'none',
                                    borderRight: ganttEndDate ? '1px dashed var(--brand)' : 'none',
                                    pointerEvents: 'none',
                                    zIndex: 0
                                  }}
                                />
                              )}
                              <div className="msbar" style={{ left: pos(m.startDate) + "%", width: Math.min(barW(m.startDate, m.endDate), 100 - pos(m.startDate)) + "%", '--c': p.projectColor }}>
                                <i style={{ width: pct(m.startDate, m.endDate) + "%" }} />
                              </div>
                              <div className="today" style={{ left: pos(iso()) + "%" }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })
                  )}
                </div>
              </>
            ) : (
              <div 
                onClick={() => toggleSection('gantt')}
                className="section-collapsed-placeholder"
              >
                프로젝트 간트차트가 접혀 있습니다.
                {ganttStartDate || ganttEndDate ? (
                  <span style={{ color: 'var(--brand)', fontWeight: 600 }}>
                    {' '}(설정 기간: {ganttStartDate || '처음'} ~ {ganttEndDate || '끝'}, {ganttView.length}건 진행)
                  </span>
                ) : (
                  <span> ({view.length}건)</span>
                )} (클릭하여 펼치기)
              </div>
            )}
          </section>
          )}

          {(activeProjectSection === 'all' || activeProjectSection === 'calendar') && (
          <section id="calendar-export">
            <div className="calhead" style={{ cursor: 'pointer' }} onClick={(e) => {
              if (e.target.tagName !== 'BUTTON') toggleSection('calendar');
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <h2>{calendarMode === 'construction' ? '공사일정 달력' : '프로젝트 일정 달력'}</h2>
                  <div className="cal-mode-toggle" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      className={`cal-mode-btn ${calendarMode === 'construction' ? 'active' : ''}`}
                      onClick={() => {
                        setCalendarMode('construction');
                        try { localStorage.setItem('pm_calendar_mode', 'construction'); } catch (err) {}
                      }}
                      title="공수가 처음 반영되는 시점 또는 현장 공사 시작 시점부터 실제 현장 작업 기간만 표시합니다"
                    >
                      공사일정
                    </button>
                    <button
                      type="button"
                      className={`cal-mode-btn ${calendarMode === 'project' ? 'active' : ''}`}
                      onClick={() => {
                        setCalendarMode('project');
                        try { localStorage.setItem('pm_calendar_mode', 'project'); } catch (err) {}
                      }}
                      title="프로젝트 시작일부터 종료일까지 전체 일정을 표시합니다"
                    >
                      전체 프로젝트 일정
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleSection('calendar'); }}
                    style={{
                      background: collapsedSections.calendar ? 'var(--brand)' : 'var(--brand-wash)',
                      color: collapsedSections.calendar ? 'var(--on-brand)' : 'var(--brand)',
                      border: '1px solid color-mix(in srgb, var(--brand) 40%, transparent)',
                      borderRadius: 'var(--radius-md)',
                      padding: '2px 8px',
                      fontSize: '11px',
                      cursor: 'pointer'
                    }}
                  >
                    <FoldLabel collapsed={collapsedSections.calendar} />
                  </button>
                </div>
                <p>
                  {calendarMode === 'construction'
                    ? '공수가 처음 반영되거나 마일스톤이 시작되는 실제 현장 공사 기간을 연속 막대로 표시합니다. 막대를 누르면 상세 정보가 열립니다.'
                    : '프로젝트 전체 기간을 얇은 연속 막대로 표시합니다. 막대를 누르면 상세 정보가 열립니다.'}
                </p>
              </div>
              <div className="cal-actions">
                <button
                  type="button"
                  className={`cal-mode-btn ${showDailyDeptMatrix ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = !showDailyDeptMatrix;
                    setShowDailyDeptMatrix(next);
                    try { localStorage.setItem('pm_show_daily_dept_matrix', String(next)); } catch (err) {}
                  }}
                  style={{
                    background: showDailyDeptMatrix ? 'color-mix(in srgb, var(--brand) 12%, transparent)' : 'var(--bg-card)',
                    color: showDailyDeptMatrix ? 'var(--brand)' : 'var(--text-secondary)',
                    border: '1px solid var(--border-medium)',
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-md)',
                    fontWeight: '700'
                  }}
                  title="일일단위 부서별 인원 수 및 총합을 볼 수 있는 매트릭스 표를 펼치거나 접습니다"
                >
                  <Icon name="table" size={14} /> 일일 부서별 공수표 {showDailyDeptMatrix ? '접기' : '보기'}
                </button>
                <button onClick={(e) => { e.stopPropagation(); setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1)); }}>‹</button>
                <b>{month.getFullYear()}년 {month.getMonth() + 1}월</b>
                <button onClick={(e) => { e.stopPropagation(); setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1)); }}>›</button>
              </div>
            </div>
            {!collapsedSections.calendar ? (
              <>
                <div className="week">
                  {["일", "월", "화", "수", "목", "금", "토"].map(x => <b key={x}>{x}</b>)}
                </div>
                <div className="calendar-weeks">
                  {Array.from({ length: 6 }, (_, weekIndex) => {
                    const weekDays = cells.slice(weekIndex * 7, weekIndex * 7 + 7);
                    const weekStart = iso(weekDays[0]);
                    const weekEnd = iso(weekDays[6]);

                    const getProjectEffectiveDates = (p) => {
                      if (calendarMode === 'construction') {
                        return getConstructionPeriod(p);
                      }
                      return { startDate: p.startDate, endDate: p.endDate, hasConstructionData: true };
                    };

                    const weekProjects = view.filter(p => {
                      const eff = getProjectEffectiveDates(p);
                      return eff.startDate <= weekEnd && eff.endDate >= weekStart;
                    });

                    const lanes = weekProjects.map((p, lane) => {
                      const eff = getProjectEffectiveDates(p);
                      return {
                        p,
                        eff,
                        lane,
                        start: Math.max(0, Math.round((dt(eff.startDate) - dt(weekStart)) / DAY)),
                        end: Math.min(6, Math.round((dt(eff.endDate) - dt(weekStart)) / DAY))
                      };
                    });
                    const rowHeight = Math.max(82, lanes.length * 21 + 32);

                    return (
                      <div className="calendar-week-row" key={weekStart} style={{ minHeight: `${rowHeight}px`, height: `${rowHeight}px` }}>
                        <div className="date-cells" style={{ height: '100%' }}>
                          {weekDays.map(d => {
                            const dStr = iso(d);
                            const dayDeptStat = getDailyDepartmentManpower(view, dStr);
                            const dayManpower = dayDeptStat.total;
                            const deptEntries = Object.entries(dayDeptStat.depts);
                            const deptSummaryStr = deptEntries.map(([k, v]) => `${k} ${v}명`).join(', ');

                            return (
                              <div
                                className={monthKey(d) === monthKey(month) ? "date-cell" : "date-cell other"}
                                key={dStr}
                                style={{ cursor: 'pointer' }}
                                onClick={() => {
                                  const activeProjectsOnDay = view.filter(p => {
                                    const eff = getProjectEffectiveDates(p);
                                    return eff.startDate <= dStr && eff.endDate >= dStr;
                                  });
                                  setSelectedDay({
                                    date: dStr,
                                    isSingleDay: true,
                                    totalManpower: dayManpower,
                                    dayDeptStat: dayDeptStat,
                                    active: activeProjectsOnDay,
                                    starts: view.filter(p => getProjectEffectiveDates(p).startDate === dStr),
                                    ends: view.filter(p => getProjectEffectiveDates(p).endDate === dStr)
                                  });
                                }}
                                title={dayManpower > 0 ? `당일 투입 공수: 총 ${dayManpower}명 (${deptSummaryStr}) - 클릭하여 상세 보기` : `${dStr} - 클릭하여 일정 보기`}
                              >
                                <b>{d.getDate()}</b>
                                {dayManpower > 0 && (
                                  <span
                                    style={{
                                      display: 'inline-block',
                                      fontSize: '9.5px',
                                      background: dayManpower >= 20 ? 'color-mix(in srgb, var(--bad) 15%, transparent)' : dayManpower >= 10 ? 'color-mix(in srgb, var(--signal) 15%, transparent)' : 'color-mix(in srgb, var(--teal) 15%, transparent)',
                                      color: dayManpower >= 20 ? 'var(--bad)' : dayManpower >= 10 ? 'var(--signal)' : 'var(--teal)',
                                      border: dayManpower >= 20 ? '1px solid color-mix(in srgb, var(--bad) 30%, transparent)' : dayManpower >= 10 ? '1px solid color-mix(in srgb, var(--signal) 30%, transparent)' : '1px solid color-mix(in srgb, var(--teal) 30%, transparent)',
                                      padding: '1px 5px',
                                      borderRadius: 'var(--radius-lg)',
                                      fontWeight: '700',
                                      marginTop: '2px',
                                      marginLeft: '3px'
                                    }}
                                  >
                                    <Icon name="users" size={12} /> {dayManpower}명
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="event-lanes" style={{ height: `${lanes.length * 21}px` }}>
                          {lanes.map(({ p, eff, lane, start, end }) => (
                            <button
                              key={p.id}
                              className="calendar-bar"
                              style={{ left: `${(start / 7) * 100}%`, width: `${((end - start + 1) / 7) * 100}%`, top: `${lane * 21 + 2}px`, '--c': p.projectColor }}
                              onClick={() => setSelectedDay({
                                date: `${weekStart} ~ ${weekEnd}`,
                                active: [p],
                                starts: eff.startDate >= weekStart && eff.startDate <= weekEnd ? [p] : [],
                                ends: eff.endDate >= weekStart && eff.endDate <= weekEnd ? [p] : []
                              })}
                              title={`${p.manufacturingNo ? `${p.manufacturingNo.replace(/-[a-f0-9]{4}$/i, '')} · ` : ""}${p.name} · ${calendarMode === 'construction' ? '공사기간' : '프로젝트기간'}: ${eff.startDate}~${eff.endDate}`}
                            >
                              <span>
                                {p.manufacturingNo ? `${p.manufacturingNo.replace(/-[a-f0-9]{4}$/i, '')} · ` : ""}
                                {p.name}
                                {calendarMode === 'construction' && eff.hasConstructionData && (
                                  <small style={{ opacity: 0.9, marginLeft: '4px', fontSize: '9px', fontWeight: 600 }}>
                                    ({eff.startDate.slice(5)}~{eff.endDate.slice(5)})
                                  </small>
                                )}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 일일 부서별 투입 공수 현황 매트릭스 테이블 */}
                {showDailyDeptMatrix && (
                  <div className="cal-matrix-section">
                    <div className="cal-matrix-header">
                      <h3>
                        <Icon name="table" size={16} />
                        <span>{month.getFullYear()}년 {month.getMonth() + 1}월 일일 부서별 공수 투입 현황 (Daily Department Matrix)</span>
                      </h3>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        당월 누적 총 공수: <b style={{ color: 'var(--signal)', fontSize: '13.5px' }}>{monthMatrixData.totalMonthManday}</b> M/D
                      </span>
                    </div>
                    <div className="cal-matrix-table-wrap">
                      <table className="cal-matrix-table">
                        <thead>
                          <tr>
                            <th className="th-dept">구분 (부서)</th>
                            {monthMatrixData.days.map(dStr => {
                              const dNum = parseInt(dStr.slice(8), 10);
                              const dow = new Date(dStr).getDay();
                              const wkndClass = dow === 0 ? 'th-weekend-sun' : dow === 6 ? 'th-weekend-sat' : '';
                              return (
                                <th key={dStr} className={wkndClass} title={dStr}>
                                  {dNum}
                                </th>
                              );
                            })}
                            <th style={{ background: 'var(--signal)', color: 'var(--on-brand)' }}>월간 합계</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthMatrixData.sortedDepts.map(dept => {
                            let deptSum = 0;
                            return (
                              <tr key={dept}>
                                <td className="td-dept">{dept}</td>
                                {monthMatrixData.days.map(dStr => {
                                  const val = monthMatrixData.dayDataMap[dStr]?.depts?.[dept] || 0;
                                  deptSum += val;
                                  return (
                                    <td key={dStr} className={val > 0 ? "td-val-active" : ""}>
                                      {val > 0 ? val : "-"}
                                    </td>
                                  );
                                })}
                                <td className="td-total-sum">{deptSum > 0 ? `${deptSum}명` : "-"}</td>
                              </tr>
                            );
                          })}
                          <tr className="row-total">
                            <td className="td-dept" style={{ color: 'var(--signal)' }}>당일 총합 (명)</td>
                            {monthMatrixData.days.map(dStr => {
                              const val = monthMatrixData.dayDataMap[dStr]?.total || 0;
                              return (
                                <td key={dStr} className={val > 0 ? "td-total-cell-active" : ""}>
                                  {val > 0 ? <b>{val}</b> : "0"}
                                </td>
                              );
                            })}
                            <td style={{ background: 'var(--signal)', color: 'var(--on-brand)', fontSize: '12px' }}>
                              <b>{monthMatrixData.totalMonthManday} M/D</b>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div 
                onClick={() => toggleSection('calendar')}
                className="section-collapsed-placeholder"
              >
                프로젝트 일정 달력 ({month.getFullYear()}년 {month.getMonth() + 1}월)이 접혀 있습니다. (클릭하여 펼치기)
              </div>
            )}
          </section>
          )}

          {(activeProjectSection === 'all' || activeProjectSection === 'list') && (
          <section>
            <div className="tools">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2>
                  {isAllYears ? "전체 프로젝트 목록" : `${selectedYearsLabel} 프로젝트 목록`} ({view.length}건)
                </h2>
                <button
                  type="button"
                  onClick={() => toggleSection('list')}
                  style={{
                    background: collapsedSections.list ? 'var(--brand)' : 'var(--brand-wash)',
                    color: collapsedSections.list ? 'var(--on-brand)' : 'var(--brand)',
                    border: '1px solid color-mix(in srgb, var(--brand) 40%, transparent)',
                    borderRadius: 'var(--radius-md)',
                    padding: '2px 8px',
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                >
                  <FoldLabel collapsed={collapsedSections.list} />
                </button>
              </div>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="제조번호, Site, Line, 프로젝트, 담당자 검색" />
              {["전체", "진행중", "완료", "지연"].map(x => {
                const activeClass = filter === x
                  ? (x === "진행중" ? "active-ongoing" : x === "완료" ? "active-completed" : x === "지연" ? "active-delayed" : "active-all")
                  : "";
                return (
                  <button key={x} className={activeClass} onClick={() => setFilter(x)}>{x}</button>
                );
              })}
            </div>
            {!collapsedSections.list ? (
              <>
                {view.length === 0 ? (
                  <div style={{ padding: '36px 20px', textAlign: 'center', background: 'var(--bg-card-subtle)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--border-medium)', margin: '10px 14px' }}>
                    <div style={{ marginBottom: '10px', color: 'var(--ink-4)' }}><Icon name="folder" size={28} stroke={1.4} /></div>
                    <div style={{ fontSize: '15px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                      {isAllYears ? "조회 조건에 일치하는 프로젝트가 없습니다." : `선택하신 ${selectedYearsLabel}에 일치하는 프로젝트가 없습니다.`}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      다른 연도를 선택하시거나, 검색어 및 필터를 초기화해 보세요.
                    </div>
                    {!isAllYears && (
                      <button
                        type="button"
                        onClick={() => handlePresetYears('all')}
                        style={{ marginTop: '12px', padding: '6px 14px', borderRadius: 'var(--radius-md)', background: 'var(--brand-wash)', color: 'var(--brand)', border: '1px solid color-mix(in srgb, var(--brand) 40%, transparent)', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        전체 누적 프로젝트 보기
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '0 14px 10px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                        <input type="checkbox" checked={view.length > 0 && selectedProjects.size === view.length} onChange={toggleSelectAll} style={{ width: 'auto', margin: 0, cursor: 'pointer' }} />
                        전체 선택
                      </label>
                      {selectedProjects.size > 0 && (
                        <button
                          onClick={() => { if (!del) return showPermissionModal("프로젝트 다중 삭제"); removeSelected(); }}
                          style={{ background: 'var(--bad)', color: 'var(--on-brand)', border: 'none', padding: '4px 10px', borderRadius: 'var(--radius-md)', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          선택 항목 삭제 ({selectedProjects.size}) {!del && <Icon name="lock" size={12} />}
                        </button>
                      )}
                    </div>
                  </>
                )}
                {view.map(p => (
                  <article key={p.id} style={{ borderLeft: `3px solid ${p.projectColor}` }}>
                    <div>
                      <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input type="checkbox" checked={selectedProjects.has(p.id)} onChange={() => toggleSelect(p.id)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                        {p.manufacturingNo ? `${p.manufacturingNo.replace(/-[a-f0-9]{4}$/i, '')} · ` : ""}{p.name}
                      </h3>
                      <p>
                        {p.site || "-"} · {p.line ? `Line ${p.line}` : "-"} &nbsp;|&nbsp; 소장 {p.pm || p.manager || "-"} · 설계 {p.design || "-"} · 설비 {p.facilityTechnology || "-"} · 제어 {p.control || "-"} · 비전 {p.vision || "-"} &nbsp;|&nbsp; {p.startDate} ~ {p.endDate} · <b style={{ color: p.isManualStatus ? (p.status === "PO대기중" ? 'var(--bad)' : 'var(--signal)') : 'inherit' }}>{p.status}</b>
                      </p>
                      {p.isManualStatus && (
                        <div style={{ marginTop: '6px', display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: 'var(--warning-muted)', border: '1px solid color-mix(in srgb, var(--signal) 28%, transparent)', padding: '4px 9px', borderRadius: 'var(--radius-md)', fontSize: '11px', color: 'var(--warning)', fontWeight: '600' }}>
                          <span><Icon name="alert" size={13} /> <b>수동 설정 ({p.manualStatusBy || "담당자"})</b> : 상태 확인 후 상태 변경을 해주세요</span>
                          {edit && p.status !== "PO대기중" && (
                            <button
                              type="button"
                              onClick={() => switchToAutoStatus(p)}
                              style={{ background: 'var(--warn)', border: '1px solid var(--warn)', color: 'var(--on-brand)', padding: '2px 7px', borderRadius: 'var(--radius-md)', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}
                              title="마일스톤 기반 자동 상태 계산으로 복귀"
                            >
                              자동 상태 전환
                            </button>
                          )}
                        </div>
                      )}
                      {expanded[p.id] && (
                        <div className="detail">
                          {p.milestones.length ? p.milestones.map(m => (
                            <div key={m.id}>
                              <b>{m.name}</b>
                              <span>{m.startDate} ~ {m.endDate}</span>
                              <span>{pct(m.startDate, m.endDate)}%</span>
                              <span>{dt(m.startDate) < dt(p.startDate) ? "선행 일정" : dt(m.endDate) > dt(p.endDate) ? "후행 일정" : "프로젝트 기간 내"}</span>
                            </div>
                          )) : <p>등록된 마일스톤이 없습니다.</p>}
                        </div>
                      )}
                    </div>
                    <div className="bar">
                      <i style={{ width: p.value + "%", background: p.projectColor }} />
                      <b>{p.value}%</b>
                    </div>
                    <aside>
                      <button onClick={() => setExpanded({ ...expanded, [p.id]: !expanded[p.id] })}>
                        {expanded[p.id] ? "마일스톤 닫기" : "마일스톤 보기"}
                      </button>
                      <button
                        onClick={() => {
                          if (!canViewManpowerDetail) return showPermissionModal("공수 상세 확인");
                          setSelectedManpowerProject(p);
                        }}
                        style={{
                          background: p.manpower ? 'var(--brand-wash)' : 'var(--brand-wash)',
                          color: !canViewManpowerDetail ? 'var(--ink-3)' : (p.manpower ? 'var(--brand)' : 'var(--ink-2)'),
                          border: p.manpower ? '1px solid color-mix(in srgb, var(--brand) 40%, transparent)' : '1px solid var(--line-2)',
                          fontWeight: 'bold',
                          cursor: 'pointer'
                        }}
                        title={!canViewManpowerDetail ? "공수 상세 확인은 Grade 2 이상 권한이 필요합니다" : "프로젝트 공수 상세 내역을 확인합니다"}
                      >
                        공수 확인 {p.manpower?.totalManday ? `(${p.manpower.totalManday}M/D)` : ''} {!canViewManpowerDetail && <Icon name="lock" size={12} />}
                      </button>
                      <button
                        onClick={() => {
                          if (!edit) return showPermissionModal("프로젝트 수정");
                          editProject(p);
                        }}
                        style={{ color: edit ? 'inherit' : 'var(--ink-3)' }}
                        title={!edit ? "프로젝트 수정 권한이 없습니다 (Grade 3 이상 가능)" : ""}
                      >
                        수정 {!edit && <Icon name="lock" size={12} />}
                      </button>
                      <button onClick={() => { if (!del) return showPermissionModal("프로젝트 삭제"); remove(p.id); }} style={{ color: del ? 'inherit' : 'var(--ink-3)' }}>
                        삭제 {!del && <Icon name="lock" size={12} />}
                      </button>
                    </aside>
                  </article>
                ))}
              </>
            ) : (
              <div 
                onClick={() => toggleSection('list')}
                style={{
                  padding: '12px 16px',
                  background: 'var(--bg-card-subtle)',
                  border: '1px dashed var(--border-medium)',
                  borderRadius: 'var(--radius-md)',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: '13px',
                  cursor: 'pointer',
                  margin: '8px 14px 14px'
                }}
              >
                프로젝트 목록 ({view.length}건, 필터: {filter})이 접혀 있습니다. (클릭하여 펼치기)
              </div>
            )}
          </section>
          )}

          {selectedDay && (
            <div className="back" onMouseDown={() => setSelectedDay(null)} style={{ zIndex: 99999 }}>
              <div className="modal" onMouseDown={e => e.stopPropagation()}>
                <button className="close" onClick={() => setSelectedDay(null)}>×</button>
                <h2>{selectedDay.date} {selectedDay.isSingleDay ? '일정 및 투입 공수' : '프로젝트'}</h2>

                {/* 당일 부서별 공수 투입 카드 */}
                {selectedDay.dayDeptStat && selectedDay.dayDeptStat.total > 0 && (
                  <div style={{ margin: '14px 0 16px', background: 'var(--bg-card-subtle)', padding: '14px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '13.5px', fontWeight: '800', color: 'var(--text-primary)' }}>
                        <Icon name="users" size={15} /> 당일 부서별 공수 투입 현황
                      </span>
                      <span style={{ fontSize: '14px', fontWeight: '800', color: 'var(--accent)' }}>
                        총합 {selectedDay.dayDeptStat.total}명
                      </span>
                    </div>
                    <div className="selected-day-dept-cards" style={{ margin: 0, padding: 0, background: 'transparent', border: 'none' }}>
                      {Object.entries(selectedDay.dayDeptStat.depts).map(([deptName, val]) => (
                        <div className="selected-day-dept-card" key={deptName}>
                          <div className="dept-name">{deptName}</div>
                          <div className="dept-val">{val}명</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="day-summary">진행 {selectedDay.active.length} · 착수 {selectedDay.starts.length} · 종료 {selectedDay.ends.length}</div>
                {selectedDay.active.map(p => {
                  const cp = getConstructionPeriod(p);
                  return (
                    <div className="dayevent" key={p.id}>
                      <i style={{ background: p.projectColor }} />
                      <b>{p.manufacturingNo ? `${p.manufacturingNo.replace(/-[a-f0-9]{4}$/i, '')} · ` : ""}{p.name}</b>
                      <span>{p.site} · {p.line || "Line 미입력"}</span>
                      <span>
                        {calendarMode === 'construction' && cp.hasConstructionData
                          ? `공사기간: ${cp.startDate} ~ ${cp.endDate} (전체: ${p.startDate}~${p.endDate})`
                          : `${p.startDate} ~ ${p.endDate}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {modal && (
        <div className="back" onMouseDown={() => setModal(null)} style={{ zIndex: 99999 }}>
          <div className="modal" onMouseDown={e => e.stopPropagation()}>
            <button className="close" onClick={() => setModal(null)}>×</button>
            {modal === "users" && role === "admin" && (
              <div style={{ maxWidth: "800px", margin: "0 auto" }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <h2 style={{ margin: 0, fontSize: "20px", color: "var(--text-primary)" }}>사용자 계정·권한 및 프로필 관리</h2>
                    <span style={{
                      fontSize: "11px",
                      padding: "3px 8px",
                      borderRadius: "var(--radius-lg)",
                      background: "color-mix(in srgb, var(--signal) 15%, transparent)",
                      color: "var(--signal)",
                      fontWeight: "bold",
                      border: "1px solid color-mix(in srgb, var(--signal) 35%, transparent)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px"
                    }}>
                      <Icon name="lock" size={12} /> 최고관리자 전용
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "12px", color: "var(--text-secondary)" }}>
                      <span>전체 <b>{users.length}</b>명</span>
                      <span style={{ color: "var(--border-medium)" }}>•</span>
                      <span style={{ color: "var(--ok)", fontWeight: "600" }}>
                        <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--ok)', marginRight: 6 }} />활동 중 <b>{users.filter(u => formatLastAccessTime(u.last_sign_in_at || u.last_active_at).isOnline || session?.user?.email?.toLowerCase() === u.email?.toLowerCase()).length}</b>명
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => load("profiles")}
                      style={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-subtle)",
                        color: "var(--text-secondary)",
                        borderRadius: "var(--radius-md)",
                        padding: "4px 9px",
                        fontSize: "11.5px",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        fontWeight: "500",
                        transition: "all 0.15s"
                      }}
                      title="사용자 목록 및 최근 접속 시간 새로고침"
                    >
                      <Icon name="refresh" size={14} /> 새로고침
                    </button>
                  </div>
                </div>
                <div style={{
                  padding: "10px 14px",
                  background: "var(--accent-muted)",
                  border: "1px solid var(--accent-border)",
                  borderRadius: "var(--radius-md)",
                  fontSize: "12px",
                  color: "var(--text-primary)",
                  marginBottom: "16px",
                  lineHeight: "1.5"
                }}>
                  <b>계정 및 팀원 프로필 가이드</b><br />
                  • <b>팀명 및 이름 확인</b>: 각 사용자의 성명 및 소속팀을 확인하고 [수정] 버튼으로 언제든 직접 변경할 수 있습니다.<br />
                  • <b>마지막 접속 시간</b>: 각 사용자의 시스템 마지막 로그인 및 접속 일시를 실시간으로 확인합니다. (최고관리자 전용 비공개)<br />
                  • <b>활성 해제</b>: 계정 로그인이 일시 차단됩니다. (언제든지 다시 활성화 가능)<br />
                  • <b>사용자 삭제</b>: 계정을 영구 제거하며, <b>해당 계정으로는 다시 로그인할 수 없습니다.</b>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {users.map(u => {
                    const isSuperAdmin = u.email === "cmj1012@twgroup.co.kr";
                    const isSelf = session?.user?.email?.toLowerCase() === u.email?.toLowerCase();
                    const cannotDelete = isSuperAdmin || isSelf;
                    const isEditing = editingUserId === u.id;
                    const displayName = getUserDisplayName(u.email, u);
                    const userTeam = getUserTeam(u.email, u);
                    const accessInfo = formatLastAccessTime(u.last_sign_in_at || u.last_active_at);

                    return (
                      <div
                        className="user-row"
                        key={u.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 140px 75px 65px",
                          alignItems: "center",
                          gap: "10px",
                          padding: "12px 14px",
                          background: u.active ? "var(--bg-card-subtle)" : "var(--bg-card)",
                          border: `1px solid ${u.active ? "var(--border-subtle)" : "var(--border-faint)"}`,
                          borderRadius: "var(--radius-lg)",
                          opacity: u.active ? 1 : 0.75,
                          transition: "all 0.2s",
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          {isEditing ? (
                            <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                              <input
                                type="text"
                                value={editName}
                                onChange={e => setEditName(e.target.value)}
                                placeholder="이름 (예: 홍길동)"
                                style={{ width: "160px", padding: "4px 8px", fontSize: "12px", background: "var(--input-bg)", color: "var(--text-primary)", border: "1px solid var(--border-medium)", borderRadius: "var(--radius-md)" }}
                              />
                              <input
                                type="text"
                                value={editTeam}
                                onChange={e => setEditTeam(e.target.value)}
                                placeholder="소속팀 (예: PM팀)"
                                style={{ width: "120px", padding: "4px 8px", fontSize: "12px", background: "var(--input-bg)", color: "var(--text-primary)", border: "1px solid var(--border-medium)", borderRadius: "var(--radius-md)" }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  updateUser(u.id, {
                                    name: editName.trim(),
                                    team: editTeam.trim()
                                  });
                                  setEditingUserId(null);
                                }}
                                style={{ padding: "4px 8px", fontSize: "11px", fontWeight: "bold", background: "var(--accent)", color: "var(--on-brand)", border: "none", borderRadius: "var(--radius-md)", cursor: "pointer" }}
                              >
                                저장
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingUserId(null)}
                                style={{ padding: "4px 8px", fontSize: "11px", background: "var(--bg-card)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", cursor: "pointer" }}
                              >
                                취소
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                              <span style={{ fontWeight: "700", fontSize: "14.5px", color: "var(--text-primary)" }}>
                                {displayName}
                              </span>
                              {isSuperAdmin && (
                                <span style={{ fontSize: "10px", background: "color-mix(in srgb, var(--signal) 18%, transparent)", color: "var(--signal)", border: "1px solid color-mix(in srgb, var(--signal) 40%, transparent)", padding: "1px 7px", borderRadius: "var(--radius-md)", fontWeight: "bold" }}>
                                  최고관리자
                                </span>
                              )}
                              {isSelf && !isSuperAdmin && (
                                <span style={{ fontSize: "10px", background: "color-mix(in srgb, var(--teal) 18%, transparent)", color: "var(--teal)", border: "1px solid color-mix(in srgb, var(--teal) 40%, transparent)", padding: "1px 6px", borderRadius: "var(--radius-md)", fontWeight: "bold" }}>
                                  현재 접속
                                </span>
                              )}
                              {newRegisteredUsers.some(nu => nu.email?.toLowerCase() === u.email?.toLowerCase()) && (
                                <span style={{ fontSize: "10px", background: "color-mix(in srgb, var(--ok) 18%, transparent)", color: "var(--ok)", border: "1px solid color-mix(in srgb, var(--ok) 40%, transparent)", padding: "1px 6px", borderRadius: "var(--radius-md)", fontWeight: "bold" }}>
                                  신규 가입
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingUserId(u.id);
                                  setEditName(u.name || "");
                                  setEditTeam(userTeam || "");
                                }}
                                style={{
                                  background: "transparent",
                                  border: "1px solid var(--border-subtle)",
                                  color: "var(--text-secondary)",
                                  borderRadius: "var(--radius-md)",
                                  padding: "1px 6px",
                                  fontSize: "10.5px",
                                  cursor: "pointer",
                                  lineHeight: 1.3
                                }}
                                title="이름 및 소속팀 수정"
                              >
                                <Icon name="pencil" size={12} /> 수정
                              </button>
                            </div>
                          )}
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--text-secondary)" }}>
                            <span>{u.email}</span>
                            {userTeam && <span style={{ color: "var(--text-muted)" }}>• {userTeam}</span>}
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", marginTop: "2px", flexWrap: "wrap" }}>
                            <span style={{ color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                              <Icon name="clock" size={12} /> 마지막 접속:
                            </span>
                            {(accessInfo.raw || isSelf) ? (
                              <span style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "5px",
                                color: (accessInfo.isOnline || isSelf) ? "var(--ok)" : "var(--text-secondary)",
                                fontWeight: "500",
                                background: (accessInfo.isOnline || isSelf) ? "color-mix(in srgb, var(--ok) 10%, transparent)" : "var(--bg-card)",
                                padding: "1px 7px",
                                borderRadius: "var(--radius-md)",
                                border: `1px solid ${(accessInfo.isOnline || isSelf) ? "color-mix(in srgb, var(--ok) 30%, transparent)" : "var(--border-subtle)"}`
                              }}>
                                {(accessInfo.isOnline || isSelf) && (
                                  <span style={{
                                    width: "6px",
                                    height: "6px",
                                    borderRadius: "50%",
                                    backgroundColor: "var(--ok)",
                                    boxShadow: "none",
                                    display: "inline-block"
                                  }} />
                                )}
                                <span>{isSelf && !accessInfo.raw ? "방금 전 접속" : accessInfo.fullDateTime}</span>
                                <span style={{ fontSize: "10.5px", opacity: 0.85 }}>({isSelf ? "현재 접속 중" : accessInfo.relative})</span>
                              </span>
                            ) : (
                              <span style={{ color: "var(--text-muted)", fontStyle: "italic", fontSize: "11px" }}>
                                접속 기록 없음
                              </span>
                            )}
                          </div>
                        </div>

                        <select
                          value={u.role}
                          disabled={isSuperAdmin}
                          onChange={e => updateUser(u.id, { role: e.target.value })}
                          style={{
                            padding: "6px 8px",
                            fontSize: "12.5px",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--border-medium)",
                            background: "var(--input-bg)",
                            color: "var(--text-primary)",
                            fontWeight: "500"
                          }}
                        >
                          <option value="admin">관리자</option>
                          <option value="grade3">Grade3 (PM)</option>
                          <option value="grade2">Grade2 (각 부서 담당자)</option>
                          <option value="grade1">Grade1 (일반)</option>
                        </select>

                        <label style={{ display: "flex", alignItems: "center", gap: "5px", cursor: isSuperAdmin ? "default" : "pointer", fontSize: "12.5px", fontWeight: "600", color: u.active ? "var(--success)" : "var(--text-muted)" }}>
                          <input
                            type="checkbox"
                            checked={Boolean(u.active)}
                            disabled={isSuperAdmin}
                            onChange={e => updateUser(u.id, { active: e.target.checked })}
                            style={{ width: "16px", height: "16px", cursor: isSuperAdmin ? "default" : "pointer" }}
                          />
                          {u.active ? "활성" : "비활성"}
                        </label>

                        <button
                          type="button"
                          disabled={cannotDelete}
                          onClick={() => deleteUser(u.id, u.email)}
                          title={cannotDelete ? "최고 관리자 또는 본인 계정은 삭제할 수 없습니다." : "사용자 영구 삭제"}
                          style={{
                            padding: "6px 8px",
                            fontSize: "11.5px",
                            fontWeight: "bold",
                            color: cannotDelete ? "var(--text-muted)" : "var(--bad)",
                            background: cannotDelete ? "var(--bg-card)" : "color-mix(in srgb, var(--bad) 12%, transparent)",
                            border: `1px solid ${cannotDelete ? "var(--border-subtle)" : "color-mix(in srgb, var(--bad) 30%, transparent)"}`,
                            borderRadius: "var(--radius-md)",
                            cursor: cannotDelete ? "not-allowed" : "pointer",
                            transition: "all 0.15s ease",
                          }}
                          onMouseEnter={e => {
                            if (!cannotDelete) {
                              e.currentTarget.style.background = "var(--bad)";
                              e.currentTarget.style.color = "var(--on-brand)";
                            }
                          }}
                          onMouseLeave={e => {
                            if (!cannotDelete) {
                              e.currentTarget.style.background = "color-mix(in srgb, var(--bad) 12%, transparent)";
                              e.currentTarget.style.color = "var(--bad)";
                            }
                          }}
                        >
                          삭제
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {modal === "sites" && (
              <Manage title="Site" rows={sites} value={newSite} setValue={setNewSite} add={() => add("sites")} trash={r => trash("sites", r)} />
            )}
            {modal === "personnel" && (
              <>
                <h2>담당자 관리</h2>
                <div className="add">
                  <select value={newDept} onChange={e => setNewDept(e.target.value)}>
                    {DEPTS.map(d => <option key={d}>{d}</option>)}
                  </select>
                  <input value={newPerson} onChange={e => setNewPerson(e.target.value)} />
                  <button onClick={() => add("personnel")}>추가</button>
                </div>
                {DEPTS.map(d => {
                  const isMgr = (d === "소장");
                  return (
                    <div key={d}>
                      <b>{d === "소장" ? "소장 (Manager)" : d}</b>
                      <div className="tags">
                        {people.filter(p => isMgr ? (p.department === "소장" || p.department === "PM") : p.department === d).map(p => (
                          <button key={p.id} onContextMenu={e => { e.preventDefault(); trash("personnel", p); }}>
                            {p.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}

      {permissionModal && (
        <div className="back" onMouseDown={() => setPermissionModal(null)} style={{ zIndex: 99999 }}>
          <div
            className="permission-modal-card"
            onMouseDown={e => e.stopPropagation()}
            style={{
              maxWidth: '430px',
              width: '92%',
              background: 'var(--bg-card, var(--surface))',
              borderRadius: 'var(--radius-xl)',
              padding: '36px 28px 28px',
              textAlign: 'center',
              boxShadow: 'var(--shadow-xl)',
              border: '1px solid var(--border-subtle, color-mix(in srgb, var(--brand) 40%, transparent))',
              animation: 'modalFadeIn 0.2s ease-out'
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'color-mix(in srgb, var(--bad) 12%, transparent)',
                border: '1px solid color-mix(in srgb, var(--bad) 25%, transparent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
                fontSize: '28px',
                boxShadow: 'none'
              }}
            >
              <Icon name="lock" size={28} />
            </div>

            <h3
              style={{
                margin: '0 0 14px',
                fontSize: '22px',
                fontWeight: 800,
                color: 'var(--text-primary, var(--brand))',
                letterSpacing: '-0.02em'
              }}
            >
              접근 권한 제한 안내
            </h3>

            <p
              style={{
                margin: '0 0 24px',
                fontSize: '14.5px',
                color: 'var(--text-secondary, var(--brand))',
                lineHeight: 1.65,
                wordBreak: 'keep-all'
              }}
            >
              [{permissionModal.feature}] 은 현재 등급에서 이용할 수 없습니다.<br />
              해당 기능을 이용하시려면 운영자에게 권한을 부여받으시기 바랍니다.
            </p>

            <div
              style={{
                background: 'var(--bg-card-subtle, var(--brand-wash))',
                border: '1px solid var(--border-medium, color-mix(in srgb, var(--brand) 40%, transparent))',
                borderRadius: 'var(--radius-xl)',
                padding: '16px 20px',
                marginBottom: '24px',
                textAlign: 'left'
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  color: 'var(--text-primary, var(--brand))',
                  fontSize: '14.5px',
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Icon name="info" size={14} />
                <span>권한 부여 및 시스템 문의</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  fontSize: '13.5px',
                  color: 'var(--text-secondary, var(--brand))',
                  lineHeight: 1.6
                }}
              >
                <div>• 담당자: 조민재 선임 (PM팀)</div>
                <div>• E-mail: cmj1012@twgroup.co.kr</div>
                <div>• Tel: +82 10 5506 8739</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setPermissionModal(null)}
              style={{
                width: '100%',
                padding: '13px 0',
                background: 'var(--brand)',
                color: 'var(--on-brand)',
                fontSize: '15px',
                fontWeight: 700,
                border: 'none',
                borderRadius: 'var(--radius-lg)',
                cursor: 'pointer',
                boxShadow: 'none',
                transition: 'all 0.15s ease'
              }}
              onMouseOver={e => { e.currentTarget.style.opacity = '0.88'; }}
              onMouseOut={e => { e.currentTarget.style.opacity = '1'; }}
            >
              확인 (닫기)
            </button>
          </div>
        </div>
      )}

      {selectedManpowerProject && (
        <ProjectManpowerModal project={selectedManpowerProject} onClose={() => setSelectedManpowerProject(null)} />
      )}

      <PasswordChangeModal
        isOpen={showPasswordModal}
        mode="change"
        userEmail={session?.user?.email || ""}
        onClose={() => setShowPasswordModal(false)}
        onSuccess={(m) => {
          setMsg(m);
          setShowPasswordModal(false);
        }}
      />

      <IntegratedExportModal
        isOpen={showIntegratedExportModal}
        onClose={() => setShowIntegratedExportModal(false)}
        projects={view}
        defaultMode={integratedModalSource === 'calendar' ? calendarMode : ganttMode}
        defaultStartDate={integratedModalSource === 'calendar' ? new Date(month.getFullYear(), month.getMonth(), 1).toISOString().slice(0, 10) : (ganttStartDate || `${new Date().toISOString().slice(0, 7)}-01`)}
        defaultEndDate={integratedModalSource === 'calendar' ? new Date(month.getFullYear(), month.getMonth() + 1, 0).toISOString().slice(0, 10) : (ganttEndDate || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10))}
        customer={currentCustomer}
        filters={{ filter, siteFilter, personFilter, search }}
        onExport={handleIntegratedExportSubmit}
      />
    </main>
  );
}

function Manage({ title, rows, value, setValue, add, trash }) {
  return (
    <>
      <h2>{title} 관리</h2>
      <div className="add">
        <input value={value} onChange={e => setValue(e.target.value)} />
        <button onClick={add}>추가</button>
      </div>
      <p>항목을 우클릭하여 삭제하세요.</p>
      <div className="tags">
        {rows.map(r => (
          <button key={r.id} onContextMenu={e => { e.preventDefault(); trash(r); }}>
            {r.name}
          </button>
        ))}
      </div>
    </>
  );
}

function PersonField({ label, value, disabled, onChange, dept, people }) {
  const isMgr = (dept === "소장" || dept === "PM");
  return (
    <label>
      {label}
      <input list={dept} value={value} disabled={disabled} onChange={e => onChange(e.target.value)} />
      <datalist id={dept}>
        {people.filter(x => isMgr ? (x.department === "소장" || x.department === "PM") : x.department === dept).map(x => <option key={x.id} value={x.name} />)}
      </datalist>
    </label>
  );
}
