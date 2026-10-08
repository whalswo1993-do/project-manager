import React, { useState, useMemo, useEffect } from "react";
import "./ManpowerManagement.css";
import ExcelJS from "exceljs";
import PptxGenJS from "pptxgenjs";
import { normalizeJVName, getMonthDailyDeptMatrix } from "./utils";
import { supabase } from "./supabase";
import SmartProjectSelector from "./SmartProjectSelector";

const BASE_DEPT_ORDER = [
  "mechanical",
  "mechanical_sub",
  "vision",
  "vision_sub",
  "control",
  "control_sub",
  "electrical",
  "electrical_sub",
  "supervisor",
  "safety",
  "manager"
];

const DEPT_LABELS = {
  mechanical: "기구 (Mechanical)",
  mechanical_sub: "기구 외주 (Mech Sub)",
  vision: "비전 (Vision)",
  vision_sub: "비전 외주 (Vision Sub)",
  control: "제어 (Control)",
  control_sub: "제어 외주 (Control Sub)",
  electrical: "전장 (Electrical)",
  electrical_sub: "전장 외주 (Elec Sub)",
  supervisor: "슈퍼바이저 (Supervisor)",
  safety: "안전 (Safety)",
  manager: "소장 (Manager)"
};

const DEPT_SHORT = {
  mechanical: "기구",
  mechanical_sub: "기구외주",
  vision: "비전",
  vision_sub: "비전외주",
  control: "제어",
  control_sub: "제어외주",
  electrical: "전장",
  electrical_sub: "전장외주",
  supervisor: "SV",
  safety: "안전",
  manager: "소장"
};

const DEPT_COLORS = {
  mechanical: "#38bdf8",     // Bright Sky Blue
  mechanical_sub: "#7dd3fc", // Light Sky
  vision: "#fbbf24",         // Warm Golden Yellow
  vision_sub: "#fde047",     // Light Gold
  control: "#10b981",        // Emerald Green
  control_sub: "#34d399",    // Mint
  electrical: "#f97316",     // Vibrant Orange
  electrical_sub: "#fb923c", // Warm Tangerine
  supervisor: "#f59e0b",     // Amber
  safety: "#f43f5e",         // Rose Red
  manager: "#06b6d4"         // Cyan
};

function getDeptLabel(key) {
  const norm = normalizeDeptKey(key);
  if (DEPT_LABELS[norm]) return DEPT_LABELS[norm];
  return key;
}

function getDeptShort(key) {
  const norm = normalizeDeptKey(key);
  if (DEPT_SHORT[norm]) return DEPT_SHORT[norm];
  return key.slice(0, 2);
}

const DYNAMIC_PALETTE = ["#ec4899", "#38bdf8", "#14b8a6", "#84cc16", "#f43f5e", "#f97316", "#c084fc", "#06b6d4"];
function getDeptColor(key) {
  const norm = normalizeDeptKey(key);
  if (DEPT_COLORS[norm]) return DEPT_COLORS[norm];
  let hash = 0;
  for (let i = 0; i < norm.length; i++) hash = norm.charCodeAt(i) + ((hash << 5) - hash);
  return DYNAMIC_PALETTE[Math.abs(hash) % DYNAMIC_PALETTE.length];
}

function normalizeDeptKey(key) {
  if (!key) return "other";
  const s = String(key).toLowerCase().trim();

  // 1. Check if it's an outsourced (외주) department
  const isSub = /외주|sub|협력|outsourc|엘라이트/i.test(s);
  if (isSub) {
    if (/vision|비전|비젼|vis|엘라이트/i.test(s)) return "vision_sub";
    if (/electrical|electronical|전장|전기|elec/i.test(s)) return "electrical_sub";
    if (/mechanical|기구|mech/i.test(s)) return "mechanical_sub";
    if (/control|제어|cont/i.test(s)) return "control_sub";
    return "other_sub";
  }

  // 2. Pure internal departments (No 외주 keyword)
  // Mechanical / 설비기술 must be checked BEFORE generic manager/소장 because strings often have "(소장포함)"
  if (/설비기술/i.test(s)) return "mechanical";
  if (/mechanical|기구|mech/i.test(s)) return "mechanical";

  // Supervisor
  if (/supervis|슈퍼바이저|\bsv\b|해체\s*검수|장착\s*검수|해체\/장착\s*검수/i.test(s)) return "supervisor";

  // ★ Safety vs 소장(Manager) 구분:
  // "Safety Manager", "안전관리자", "Safety", "안전", "HSE Manager" 등 안전 관련 키워드는 반드시 "safety"로 매핑합니다.
  // 이 검사를 manager/소장보다 항상 먼저 수행하여 "Safety Manager"가 "manager(소장)"로 오인식되는 혼선을 원천 차단합니다.
  if (/safety|안전|safe|hse|ehs/i.test(s)) return "safety";

  // 소장 / Site Manager / Project Manager / PM:
  // safety 키워드가 없는 순수 소장/관리자 명칭만 "manager"로 매핑합니다.
  if (/manager|소장|현장대리인|site mgr|field mgr|\bpm\b|project\s*manager/i.test(s)) return "manager";

  if (/vision|비전|비젼|vis/i.test(s)) return "vision";
  if (/control|제어|cont/i.test(s)) return "control";
  if (/electrical|electronical|전장|전기|elec/i.test(s)) return "electrical";
  if (/설계|design/i.test(s)) return "design";

  return s;
}

/**
 * 공사일보 작업내용 텍스트에서 부서별([기구작업], [제어작업], [비전작업] 등) 섹션을 분리/취출하는 헬퍼 함수
 */
export function parseDeptWorkSections(text) {
  if (!text) return {};
  const cleaned = text.replace(/\r\n/g, '\n').trim();

  // 부서별 섹션 헤더 매칭: [기구작업], [기구], 기구작업:, 기구: 등
  const regex = /(?:\[(기구|설비기술|설비|제어|비전|비젼|소장|pm|전장|전기|안전)(?:작업)?\]|(?:\n|^)\s*(기구|설비기술|설비|제어|비전|비젼|소장|pm|전장|전기|안전)(?:작업)?[:\s\n])/gi;

  const matches = [];
  let m;
  while ((m = regex.exec(cleaned)) !== null) {
    const rawDept = (m[1] || m[2]).toLowerCase();
    let norm = '기구';
    if (/기구|설비/i.test(rawDept)) norm = '기구';
    else if (/제어/i.test(rawDept)) norm = '제어';
    else if (/비전|비젼/i.test(rawDept)) norm = '비전';
    else if (/소장|pm/i.test(rawDept)) norm = '소장';
    else if (/전장|전기/i.test(rawDept)) norm = '전장';
    else if (/안전/i.test(rawDept)) norm = '안전';

    matches.push({
      dept: norm,
      index: m.index,
      headerLen: m[0].length
    });
  }

  if (matches.length === 0) {
    return { '전체': cleaned };
  }

  const result = {};
  for (let i = 0; i < matches.length; i++) {
    const curr = matches[i];
    const next = matches[i + 1];
    const start = curr.index + curr.headerLen;
    const end = next ? next.index : cleaned.length;
    const content = cleaned.slice(start, end).trim();
    if (content) {
      if (result[curr.dept]) {
        result[curr.dept] += '\n' + content;
      } else {
        result[curr.dept] = content;
      }
    }
  }
  return result;
}

/**
 * 일보 작업내용 텍스트에서 1, 2, 3 번호 표기 또는 줄바꿈/구분자 기반으로 개별 작업 항목을 스마트 분리
 */
export function splitWorkItems(text) {
  if (!text) return [];
  const cleaned = text.trim();

  // 1. 번호 패턴 (1-, 2-, 1., 2., 1), [1], ① 등)
  const numRegex = /(?:^|\s+|[\n\r]+)(?:\(?\d{1,2}[-.)\]]\s*|[①-⑳]\s*)/g;
  const matches = [...cleaned.matchAll(numRegex)];
  if (matches.length > 1 || (matches.length === 1 && matches[0].index === 0)) {
    const parts = [];
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index + matches[i][0].length;
      const end = matches[i + 1] ? matches[i + 1].index : cleaned.length;
      const item = cleaned.slice(start, end).trim();
      if (item) parts.push(item);
    }
    if (parts.length > 0) return parts;
  }

  // 2. 줄바꿈으로 구분된 복수 항목
  const lines = cleaned.split(/\r?\n/).map(l => l.trim().replace(/^[-*•]\s*/, '')).filter(Boolean);
  if (lines.length > 1) return lines;

  // 3. 쉼표(,) 또는 세미콜론(;) 구분 항목
  if (cleaned.includes(';') || (cleaned.split(',').length >= 3)) {
    const sep = cleaned.includes(';') ? ';' : ',';
    return cleaned.split(sep).map(s => s.trim()).filter(Boolean);
  }

  return [cleaned];
}

function getProjectTotalManday(p) {
  const mp = p.manpower;
  if (!mp) return 0;
  if (mp.totalManday && Number(mp.totalManday) > 0) return Number(mp.totalManday);
  if (mp.departments) {
    let sum = 0;
    Object.values(mp.departments).forEach(d => {
      if (d?.total && Number(d.total) > 0) sum += Number(d.total);
      else if (d?.daily) {
        Object.values(d.daily).forEach(v => sum += Number(v) || 0);
      }
    });
    if (sum > 0) return sum;
  }
  if (mp.dailyTotal) {
    const sum = Object.values(mp.dailyTotal).reduce((a, b) => a + (Number(b) || 0), 0);
    if (sum > 0) return sum;
  }
  return 0;
}

// Helper to render Project Detail Card on PPT
function renderProjectDetailCard(slide, p, yTop, C, activeDeptKeys = BASE_DEPT_ORDER) {
  const cardW = 12.13;
  const cardH = 2.76;

  // Background Box
  slide.addShape("roundRect", {
    x: 0.6,
    y: yTop,
    w: cardW,
    h: cardH,
    fill: { color: C.white },
    line: { color: C.borderLight, width: 1 },
    rectRadius: 0.08
  });

  // Header Banner
  slide.addShape("roundRect", {
    x: 0.6,
    y: yTop,
    w: cardW,
    h: 0.42,
    fill: { color: "0F172A" },
    line: { color: "0F172A", width: 1 },
    rectRadius: 0.08
  });

  // Project Header Text
  slide.addText(
    [
      { text: `[${normalizeJVName(p.manufacturingNo) || "제조번호 없음"}]  `, options: { bold: true, color: "93C5FD", fontSize: 11 } },
      { text: `${normalizeJVName(p.name)}  `, options: { bold: true, color: C.white, fontSize: 12 } },
      { text: `(Site: ${normalizeJVName(p.site) || "-"} | Line: ${normalizeJVName(p.line) || "-"} | 소장: ${p.pm || p.manager || "-"})`, options: { color: "CBD5E1", fontSize: 9 } }
    ],
    { x: 0.8, y: yTop + 0.08, w: 7.2, h: 0.3, margin: 0 }
  );

  // Header Right Badges
  slide.addText(
    `기간 계획 공수: ${p.pRangeTotal.toLocaleString()} M/D  |  마스터플랜 총공수: ${p.pTotalManday > 0 ? p.pTotalManday.toLocaleString() + " M/D" : "-"}  |  편성 비중: ${p.ratio !== "-" ? p.ratio + "%" : "-"}`,
    { x: 6.8, y: yTop + 0.08, w: 5.7, h: 0.3, align: "right", color: "F8FAFC", bold: true, fontSize: 9.5, margin: 0 }
  );

  // Left Section: Mini KPI Stats
  const stats = [
    { lbl: "공수 편성 일정", val: `${p.firstActiveDate} ~ ${p.lastActiveDate}` },
    { lbl: "공수 편성 일수", val: `${p.activeDaysCount}일간 편성` },
    { lbl: "일일 최대 계획", val: `${p.pPeak}명 (${p.pPeakDate || "-"})` },
    { lbl: "주력 편성 부서", val: `${p.dominantDept} (${p.maxDeptVal} M/D, 비중 ${p.pRangeTotal > 0 ? ((p.maxDeptVal / p.pRangeTotal) * 100).toFixed(1) : 0}%)` }
  ];

  stats.forEach((st, i) => {
    const sy = yTop + 0.52 + i * 0.48;
    slide.addText(st.lbl, { x: 0.8, y: sy, w: 1.15, h: 0.38, fontSize: 8, color: C.gray, bold: true, margin: 0 });
    slide.addText(st.val, { x: 2.0, y: sy, w: 2.2, h: 0.38, fontSize: 8.5, color: C.navy, bold: true, margin: 0 });
  });

  // Middle Section: Dept Breakdown Mini Table (Dynamic across all active depts)
  const deptCols = (activeDeptKeys && activeDeptKeys.length > 0 ? activeDeptKeys : BASE_DEPT_ORDER);
  const deptHeader = ["부서", ...deptCols.map(k => getDeptShort(k))];
  const deptVals = [
    "공수",
    ...deptCols.map(k => `${p.pDepts?.[k] || 0}`)
  ];
  const deptPcts = [
    "비중",
    ...deptCols.map(k => p.pRangeTotal > 0 ? `${(((p.pDepts?.[k] || 0) / p.pRangeTotal) * 100).toFixed(0)}%` : "0%")
  ];

  const colCount = deptHeader.length;
  const colWFirst = 0.65;
  const colWRemaining = Math.max(0.35, (4.5 - colWFirst) / Math.max(1, colCount - 1));
  const colW = [colWFirst, ...Array(colCount - 1).fill(colWRemaining)];

  const deptTable = [
    deptHeader.map((t, idx) => ({
      text: t,
      options: { bold: true, color: C.white, fill: { color: idx === 0 ? C.navy : C.blue }, align: "center" }
    })),
    deptVals.map((t, idx) => ({
      text: t,
      options: { bold: idx > 0, color: idx === 0 ? C.slate : C.navy, align: "center" }
    })),
    deptPcts.map((t) => ({
      text: t,
      options: { color: C.gray, align: "center", fontSize: 7.5 }
    }))
  ];

  slide.addTable(deptTable, {
    x: 4.35,
    y: yTop + 0.54,
    w: 4.3,
    h: 1.85,
    colW: colW,
    border: { type: "solid", pt: 0.5, color: C.borderLight },
    fontSize: 8,
    margin: 0.02,
    rowH: 0.52,
    valign: "middle"
  });

  // Right Section: Analysis Insight Comment Box
  slide.addShape("roundRect", {
    x: 8.8,
    y: yTop + 0.54,
    w: 3.75,
    h: 2.0,
    fill: { color: "F1F5F9" },
    line: { color: "CBD5E1", width: 1 },
    rectRadius: 0.06
  });

  slide.addText("💡 마스터 플랜 공수 분석 코멘트", {
    x: 8.95,
    y: yTop + 0.64,
    w: 3.45,
    h: 0.22,
    fontSize: 9,
    bold: true,
    color: C.navy,
    margin: 0
  });

  let insight1;
  if (p.pTotalManday > 0 && p.pRangeTotal >= p.pTotalManday) {
    insight1 = `• 마스터 플랜 계획 공수(${p.pTotalManday} M/D) 기준 기간 내 전량(100%) 편성`;
  } else if (p.pTotalManday > 0) {
    insight1 = `• 마스터 플랜 전체 공수(${p.pTotalManday} M/D) 중 본 기간에 ${p.ratio}% 편성`;
  } else {
    insight1 = `• 마스터 플랜 기준 본 기간 총 ${p.pRangeTotal} M/D 공수 계획 편성 완료`;
  }

  let insight2 = `• 주력 공정: ${p.dominantDept} 기술 인력 집중 편성 (${p.maxDeptVal} M/D)`;
  let insight3 = p.pPeak > 0 ? `• 일일 최대 계획 인원은 ${p.pPeakDate}에 ${p.pPeak}명 편성` : "• 일일 공수 균등 편성 구간 유지";

  slide.addText(
    `${insight1}\n${insight2}\n${insight3}\n• 마스터 플랜 일정 기준 공수 계획 반영 완료`,
    {
      x: 8.95,
      y: yTop + 0.92,
      w: 3.45,
      h: 1.5,
      fontSize: 8,
      color: C.slate,
      margin: 0,
      lineSpacing: 15
    }
  );
}

// Reusable Synchronized Month Navigator Component
export function MonthNavigator({ currentDate, onPrev, onNext, onToday }) {
  const y = currentDate.getFullYear();
  const m = currentDate.getMonth() + 1;
  return (
    <div className="mp-month-navigator">
      <button className="mp-nav-btn" onClick={onPrev} title="이전 달">‹</button>
      <span className="mp-month-text">{y}년 {m}월</span>
      <button className="mp-nav-btn" onClick={onNext} title="다음 달">›</button>
      <button className="mp-today-btn" onClick={onToday}>이번달</button>
    </div>
  );
}

export default function ManpowerManagement({
  projects = [],
  allProjects = [],
  sites = [],
  onSelectProject,
  selectedYears = ['ALL'],
  availableYears = [],
  onToggleYear,
  onPresetYears,
  role = 'grade1',
  onPermissionDenied
}) {
  const isGrade1 = role === 'grade1';
  const canViewDetail = ['admin', 'grade3', 'grade2'].includes(role);
  const canExportPPT = ['admin', 'grade3', 'grade2'].includes(role);

  const notifyPermission = (feature) => {
    if (onPermissionDenied) {
      onPermissionDenied(feature);
    } else {
      alert(`[${feature}] 권한이 없습니다. 운영자에게 권한을 부여받으시기 바랍니다.`);
    }
  };

  const [currentDate, setCurrentDate] = useState(() => {
    for (const p of projects) {
      if (p.manpower?.dailyTotal) {
        const dates = Object.keys(p.manpower.dailyTotal).sort();
        if (dates.length > 0) {
          const [y, m] = dates[0].split("-");
          return new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
        }
      }
    }
    return new Date();
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  // View mode: 'month' (월간 단위) vs 'range' (기간 지정)
  const [viewMode, setViewMode] = useState("month");

  // Custom date range
  const [customStart, setCustomStart] = useState(() => `${year}-${String(month + 1).padStart(2, "0")}-01`);
  const [customEnd, setCustomEnd] = useState(() => {
    const endDt = new Date(year, month + 3, 0);
    return endDt.toISOString().slice(0, 10);
  });

  const [siteFilter, setSiteFilter] = useState("전체");
  const [deptFilter, setDeptFilter] = useState("전체");
  const [search, setSearch] = useState("");
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedProjectForDetail, setSelectedProjectForDetail] = useState(null);

  // 프로젝트별 계획공수 현황 표에서 "설정한 월(기간)에 공수가 투입되는 프로젝트만 보기" 필터 상태 (기본값: true)
  const [onlyActiveProjectsInMonth, setOnlyActiveProjectsInMonth] = useState(() => {
    try {
      const saved = localStorage.getItem('pm_manpower_only_active_table');
      if (saved !== null) return JSON.parse(saved);
    } catch (e) {}
    return true; // 기본값: 당월 공수 들어가는 프로젝트만 보기
  });

  const setOnlyActiveProjectsAndSave = (val) => {
    setOnlyActiveProjectsInMonth(val);
    try {
      localStorage.setItem('pm_manpower_only_active_table', JSON.stringify(val));
    } catch (e) {}
  };

  // 계획공수 투입 달력 하단 일일 부서별 공수 매트릭스 표 표시 상태 (기본값: true)
  const [showDailyDeptMatrixInMM, setShowDailyDeptMatrixInMM] = useState(() => {
    try {
      const saved = localStorage.getItem('pm_manpower_show_daily_matrix');
      if (saved !== null) return JSON.parse(saved);
    } catch (e) {}
    return true;
  });

  const [collapsedSections, setCollapsedSections] = useState(() => {
    try {
      const saved = localStorage.getItem('pm_manpower_collapsed_sections');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn(e);
    }
    return { controls: false, summary: false, calendar: false, table: false, comparison: false };
  });

  const toggleSection = (key) => {
    setCollapsedSections(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem('pm_manpower_collapsed_sections', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const setAllSections = (collapsed) => {
    const next = { controls: collapsed, summary: collapsed, calendar: collapsed, table: collapsed, comparison: collapsed };
    setCollapsedSections(next);
    try {
      localStorage.setItem('pm_manpower_collapsed_sections', JSON.stringify(next));
    } catch (e) {}
  };

  // 공수 통합 관리 소항목 선택 필터 ('all' | 'controls' | 'summary' | 'calendar' | 'table' | 'comparison')
  const [activeSection, setActiveSection] = useState(() => {
    try {
      return localStorage.getItem('pm_manpower_active_section') || 'all';
    } catch (e) {
      return 'all';
    }
  });

  const handleSelectSection = (secId) => {
    setActiveSection(secId);
    try { localStorage.setItem('pm_manpower_active_section', secId); } catch (e) {}
    if (secId !== 'all') {
      setCollapsedSections(prev => {
        const next = { ...prev, [secId]: false };
        try { localStorage.setItem('pm_manpower_collapsed_sections', JSON.stringify(next)); } catch (e) {}
        return next;
      });
    }
  };

  // -------------------------------------------------------------
  // 계획공수 vs 실투입공수 (일보 연동) 상태 관리
  // -------------------------------------------------------------
  const [dailyReports, setDailyReports] = useState([]);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [selectedCompProject, setSelectedCompProject] = useState("");
  const [compSearch, setCompSearch] = useState("");
  const [compYearFilter, setCompYearFilter] = useState("ALL");
  const [onlyReported, setOnlyReported] = useState(true);
  const [compSort, setCompSort] = useState("diffDesc");
  const [expandedDailyDetails, setExpandedDailyDetails] = useState({});
  // 일자별 실투입 내역에서 작업내용 개별 접기/펼치기 상태 (기본값: 모두 접힘)
  const [expandedCompReports, setExpandedCompReports] = useState({});

  const loadDailyReports = async () => {
    setIsLoadingReports(true);
    try {
      const { data, error } = await supabase
        .from('daily_reports')
        .select('*')
        .order('report_date', { ascending: false });
      if (!error && data) {
        const parsed = (data || []).map(r => {
          let extra = {};
          if (r.content && typeof r.content === 'string' && r.content.trim().startsWith('{')) {
            try { extra = JSON.parse(r.content); } catch (e) {}
          }
          return {
            ...r,
            electrical_count: Number(r.electrical_count ?? extra.electrical_count ?? 0),
            facility_outsource: Number(r.facility_outsource ?? extra.facility_outsource ?? 0),
            control_outsource: Number(r.control_outsource ?? extra.control_outsource ?? 0),
            electrical_outsource: Number(r.electrical_outsource ?? extra.electrical_outsource ?? 0),
            vision_outsource: Number(r.vision_outsource ?? extra.vision_outsource ?? 0),
            custom_depts: extra.custom_depts || {}
          };
        });
        setDailyReports(parsed);
      }
    } catch (e) {
      console.error("일보 로딩 오류:", e);
    } finally {
      setIsLoadingReports(false);
    }
  };

  useEffect(() => {
    loadDailyReports();
  }, []);

  // Dynamic active departments computation: includes standard departments + any newly introduced departments from projects
  const activeDeptKeys = useMemo(() => {
    const presentDepts = new Set();
    projects.forEach(p => {
      if (p.manpower?.departments) {
        Object.keys(p.manpower.departments).forEach(rawD => {
          const norm = normalizeDeptKey(rawD);
          if (norm && norm !== "other") presentDepts.add(norm);
        });
      }
    });

    const ordered = [];
    BASE_DEPT_ORDER.forEach(k => {
      // Always include core departments (including vision_sub, electrical_sub, supervisor, safety, manager) or any present department
      if (presentDepts.has(k) || ["mechanical", "vision", "vision_sub", "control", "electrical", "electrical_sub", "supervisor", "safety", "manager"].includes(k)) {
        ordered.push(k);
      }
    });
    // Append any other dynamic departments that might not be in BASE_DEPT_ORDER
    presentDepts.forEach(k => {
      if (!ordered.includes(k)) {
        ordered.push(k);
      }
    });

    return ordered.length > 0 ? ordered : BASE_DEPT_ORDER;
  }, [projects]);

  // Synchronized month navigation handlers (affect all 3 navigators)
  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToToday = () => setCurrentDate(new Date());

  // Extract all dates present across all projects' manpower
  const allManpowerDates = useMemo(() => {
    const set = new Set();
    projects.forEach(p => {
      if (p.manpower?.dailyTotal) Object.keys(p.manpower.dailyTotal).forEach(d => set.add(d));
      if (p.manpower?.departments) {
        Object.values(p.manpower.departments).forEach(d => {
          if (d?.daily) Object.keys(d.daily).forEach(dt => set.add(dt));
        });
      }
    });
    return Array.from(set).sort();
  }, [projects]);

  // Determine effective query date range
  const { effectiveStartDate, effectiveEndDate, effectiveLabel } = useMemo(() => {
    if (viewMode === "month") {
      const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const end = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      return {
        effectiveStartDate: start,
        effectiveEndDate: end,
        effectiveLabel: `${year}년 ${month + 1}월`
      };
    } else {
      const start = customStart || `${year}-01-01`;
      const end = customEnd >= start ? customEnd : start;
      return {
        effectiveStartDate: start,
        effectiveEndDate: end,
        effectiveLabel: `${start} ~ ${end}`
      };
    }
  }, [viewMode, year, month, customStart, customEnd]);

  // Quick preset ranges
  const handleQuickPreset = (monthsCount) => {
    const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const endDt = new Date(year, month + monthsCount, 0);
    setCustomStart(start);
    setCustomEnd(endDt.toISOString().slice(0, 10));
    setViewMode("range");
  };

  const handleAllRange = () => {
    if (allManpowerDates.length > 0) {
      setCustomStart(allManpowerDates[0]);
      setCustomEnd(allManpowerDates[allManpowerDates.length - 1]);
    } else {
      setCustomStart(`${year}-01-01`);
      setCustomEnd(`${year}-12-31`);
    }
    setViewMode("range");
  };

  // Filter projects by site and search
  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const pSiteNorm = normalizeJVName(p.site);
      const siteFilterNorm = normalizeJVName(siteFilter);
      if (siteFilter !== "전체" && pSiteNorm !== siteFilterNorm && p.site !== siteFilter) return false;
      if (search.trim()) {
        const q = normalizeJVName(search.toLowerCase().trim()).toLowerCase();
        const rawQ = search.toLowerCase().trim();
        const match =
          (p.name && (p.name.toLowerCase().includes(q) || p.name.toLowerCase().includes(rawQ) || normalizeJVName(p.name).toLowerCase().includes(q))) ||
          (p.manufacturingNo && (p.manufacturingNo.toLowerCase().includes(q) || p.manufacturingNo.toLowerCase().includes(rawQ))) ||
          (p.line && (p.line.toLowerCase().includes(q) || p.line.toLowerCase().includes(rawQ))) ||
          (p.site && (p.site.toLowerCase().includes(q) || p.site.toLowerCase().includes(rawQ) || pSiteNorm.toLowerCase().includes(q)));
        if (!match) return false;
      }
      return true;
    });
  }, [projects, siteFilter, search]);

  // Aggregate daily manpower across filtered projects for effective range AND current visible month
  const { dailyData, periodTotalManday, periodDailyPeak, peakDates, deptTotals, projectsWithManpower } = useMemo(() => {
    const daily = {};
    let totalM = 0;
    let peakVal = 0;
    const peakD = [];
    const depts = {};
    activeDeptKeys.forEach(k => { depts[k] = 0; });
    const pList = [];

    const initDepts = () => {
      const obj = {};
      activeDeptKeys.forEach(k => { obj[k] = 0; });
      return obj;
    };

    // Ensure all days of the current visible month exist for the calendar
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= lastDayOfMonth; d++) {
      const dStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      daily[dStr] = {
        dateStr: dStr,
        dayNum: d,
        total: 0,
        departments: initDepts(),
        projectBreakdown: []
      };
    }

    // Also ensure all days in effectiveStartDate ~ effectiveEndDate exist
    const sDt = new Date(effectiveStartDate);
    const eDt = new Date(effectiveEndDate);
    for (let cur = new Date(sDt); cur <= eDt; cur.setDate(cur.getDate() + 1)) {
      const dStr = cur.toISOString().slice(0, 10);
      if (!daily[dStr]) {
        daily[dStr] = {
          dateStr: dStr,
          dayNum: cur.getDate(),
          total: 0,
          departments: initDepts(),
          projectBreakdown: []
        };
      }
    }

    filteredProjects.forEach(p => {
      const mp = p.manpower;
      if (!mp) return;
      let hasDataInRange = false;

      if (mp.departments) {
        Object.entries(mp.departments).forEach(([deptRaw, dData]) => {
          const normDept = normalizeDeptKey(deptRaw);
          if (deptFilter !== "전체" && normDept !== deptFilter) return;

          if (dData?.daily) {
            Object.entries(dData.daily).forEach(([dateStr, count]) => {
              const num = Number(count) || 0;
              if (num > 0 && daily[dateStr]) {
                daily[dateStr].departments[normDept] = (daily[dateStr].departments[normDept] || 0) + num;
                daily[dateStr].total += num;

                // Accumulate totals only within effective range
                if (dateStr >= effectiveStartDate && dateStr <= effectiveEndDate) {
                  hasDataInRange = true;
                  depts[normDept] = (depts[normDept] || 0) + num;
                  totalM += num;
                }

                let pb = daily[dateStr].projectBreakdown.find(x => x.projectId === p.id);
                if (!pb) {
                  pb = {
                    projectId: p.id,
                    manufacturingNo: normalizeJVName(p.manufacturingNo),
                    name: normalizeJVName(p.name),
                    site: normalizeJVName(p.site),
                    line: normalizeJVName(p.line),
                    total: 0,
                    departments: {}
                  };
                  daily[dateStr].projectBreakdown.push(pb);
                }
                pb.departments[normDept] = (pb.departments[normDept] || 0) + num;
                pb.total += num;
              }
            });
          }
        });
      } else if (mp.dailyTotal) {
        if (deptFilter === "전체") {
          Object.entries(mp.dailyTotal).forEach(([dateStr, count]) => {
            const num = Number(count) || 0;
            if (num > 0 && daily[dateStr]) {
              daily[dateStr].total += num;
              if (dateStr >= effectiveStartDate && dateStr <= effectiveEndDate) {
                hasDataInRange = true;
                totalM += num;
              }
              daily[dateStr].projectBreakdown.push({
                projectId: p.id,
                manufacturingNo: normalizeJVName(p.manufacturingNo),
                name: normalizeJVName(p.name),
                site: normalizeJVName(p.site),
                line: normalizeJVName(p.line),
                total: num,
                departments: {}
              });
            }
          });
        }
      }

      if (hasDataInRange) pList.push(p);
    });

    // Calculate peak within effective date range
    Object.entries(daily).forEach(([dStr, d]) => {
      if (dStr >= effectiveStartDate && dStr <= effectiveEndDate) {
        if (d.total > peakVal) {
          peakVal = d.total;
          peakD.length = 0;
          peakD.push(d.dateStr);
        } else if (d.total === peakVal && d.total > 0) {
          peakD.push(d.dateStr);
        }
      }
    });

    return {
      dailyData: daily,
      periodTotalManday: totalM,
      periodDailyPeak: peakVal,
      peakDates: peakD,
      deptTotals: depts,
      projectsWithManpower: pList
    };
  }, [filteredProjects, effectiveStartDate, effectiveEndDate, year, month, deptFilter, activeDeptKeys]);

  // Helper: compute manpower breakdown for each project within effective range
  const getProjectRangeData = (p) => {
    const mp = p.manpower;
    const pDepts = {};
    activeDeptKeys.forEach(k => { pDepts[k] = 0; });
    let pRangeTotal = 0;

    if (mp?.departments) {
      Object.entries(mp.departments).forEach(([rawD, dData]) => {
        const k = normalizeDeptKey(rawD);
        if (pDepts[k] === undefined) pDepts[k] = 0;
        if (dData?.daily) {
          Object.entries(dData.daily).forEach(([dateStr, count]) => {
            if (dateStr >= effectiveStartDate && dateStr <= effectiveEndDate) {
              const n = Number(count) || 0;
              pDepts[k] = (pDepts[k] || 0) + n;
              pRangeTotal += n;
            }
          });
        }
      });
    } else if (mp?.dailyTotal) {
      Object.entries(mp.dailyTotal).forEach(([dateStr, count]) => {
        if (dateStr >= effectiveStartDate && dateStr <= effectiveEndDate) {
          pRangeTotal += (Number(count) || 0);
        }
      });
    }
    return { pDepts, pRangeTotal };
  };

  // 프로젝트별 계획공수 현황 표에 표시할 프로젝트 목록 (설정한 월/기간에 공수 편성된 프로젝트 필터링)
  const tableProjects = useMemo(() => {
    if (!onlyActiveProjectsInMonth) {
      return filteredProjects;
    }
    return filteredProjects.filter(p => {
      const { pRangeTotal } = getProjectRangeData(p);
      return pRangeTotal > 0;
    });
  }, [filteredProjects, onlyActiveProjectsInMonth, effectiveStartDate, effectiveEndDate, deptFilter, activeDeptKeys]);

  // 계획공수 투입 달력 하단 일일 부서별 공수 매트릭스 데이터 (Daily Department Matrix)
  const calMatrixData = useMemo(() => {
    const mat = getMonthDailyDeptMatrix(filteredProjects, year, month);
    const totalMonthManday = mat.days.reduce((acc, dStr) => acc + (mat.dayDataMap[dStr]?.total || 0), 0);
    return { ...mat, totalMonthManday };
  }, [filteredProjects, year, month]);

  // Calendar cells generation (42 cells: 6 weeks x 7 days) for the visible month
  const calendarCells = useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sunday
    const lastDate = new Date(year, month + 1, 0).getDate();
    const prevLastDate = new Date(year, month, 0).getDate();

    const cells = [];

    // Prev month padding
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const prevDateNum = prevLastDate - i;
      const prevDate = new Date(year, month - 1, prevDateNum);
      const dStr = prevDate.toISOString().slice(0, 10);
      cells.push({
        dateStr: dStr,
        dayNum: prevDateNum,
        isCurrentMonth: false,
        data: null
      });
    }

    // Current month days
    for (let d = 1; d <= lastDate; d++) {
      const dStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({
        dateStr: dStr,
        dayNum: d,
        isCurrentMonth: true,
        data: dailyData[dStr] || null
      });
    }

    // Next month padding
    const remaining = 42 - cells.length;
    for (let i = 1; i <= remaining; i++) {
      const nextDate = new Date(year, month + 1, i);
      const dStr = nextDate.toISOString().slice(0, 10);
      cells.push({
        dateStr: dStr,
        dayNum: i,
        isCurrentMonth: false,
        data: null
      });
    }

    return cells;
  }, [year, month, dailyData]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const [isExportingPPT, setIsExportingPPT] = useState(false);

  // PPT Export Function for Executive Reporting
  const exportManpowerPPT = async () => {
    if (!canExportPPT) return notifyPermission("공수 보고서 PPT 다운로드");
    if (isExportingPPT) return;
    setIsExportingPPT(true);

    try {
      const pptx = new PptxGenJS();
      pptx.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 inch
      pptx.author = "TW Project";
      pptx.company = "TW";
      pptx.title = `공수 통합 관리 보고서 (${effectiveLabel})`;
      pptx.subject = "마스터 플랜 기반 부서별 일일 투입 인원 및 전사 공수 모니터링";

      const C = {
        navy: "0F172A",
        navyDark: "020617",
        blue: "0969DA",
        blueLight: "EFF6FF",
        blueSoft: "DBEAFE",
        slate: "334155",
        gray: "64748B",
        lightGray: "F8FAFC",
        white: "FFFFFF",
        border: "CBD5E1",
        borderLight: "E2E8F0",
        red: "DC2626",
        redLight: "FEE2E2",
        green: "16A34A",
        greenLight: "DCFCE7",
        amber: "D97706",
        purple: "7C3AED"
      };

      // Helper to add Slide Header and Footer
      const addSlideHeader = (slide, title, subtitle, pageNum, totalPages) => {
        slide.background = { color: C.lightGray };
        // Title
        slide.addText(title, {
          x: 0.6,
          y: 0.3,
          w: 9.8,
          h: 0.42,
          fontSize: 18,
          bold: true,
          color: C.navy,
          margin: 0
        });
        // Subtitle
        slide.addText(subtitle, {
          x: 0.6,
          y: 0.74,
          w: 10.5,
          h: 0.22,
          fontSize: 9,
          color: C.gray,
          margin: 0
        });
        // Blue line divider
        slide.addShape("line", {
          x: 0.6,
          y: 1.02,
          w: 12.13,
          h: 0,
          line: { color: C.blue, width: 1.5 }
        });
        // Footer
        slide.addText(
          `TW 공수 통합 관리 시스템  |  보고서 생성일: ${new Date().toLocaleDateString("ko-KR")}  |  Page ${pageNum} / ${totalPages}`,
          {
            x: 0.6,
            y: 7.15,
            w: 12.13,
            h: 0.2,
            fontSize: 8,
            color: "94A3B8",
            align: "right",
            margin: 0
          }
        );
      };

      // 1. Calculate Target Months for Calendars
      let targetMonths = [];
      if (viewMode === "month") {
        targetMonths = [{ y: year, m: month }];
      } else {
        const sD = new Date(effectiveStartDate);
        const eD = new Date(effectiveEndDate);
        let cur = new Date(sD.getFullYear(), sD.getMonth(), 1);
        const endCur = new Date(eD.getFullYear(), eD.getMonth(), 1);
        while (cur <= endCur) {
          targetMonths.push({ y: cur.getFullYear(), m: cur.getMonth() });
          cur.setMonth(cur.getMonth() + 1);
        }
      }

      // 2. Project Analysis Data Preparation
      const analyzedProjects = filteredProjects.map(p => {
        const { pDepts, pRangeTotal } = getProjectRangeData(p);
        const pTotalManday = getProjectTotalManday(p);
        const ratio = pTotalManday > 0 ? ((pRangeTotal / pTotalManday) * 100).toFixed(1) : "-";

        // Find peak and active days in this project
        let pPeak = 0;
        let pPeakDate = "-";
        let activeDaysCount = 0;
        let activeDates = [];
        const mp = p.manpower;

        if (mp?.departments) {
          const datesSet = new Set();
          Object.values(mp.departments).forEach(d => {
            if (d?.daily) {
              Object.keys(d.daily).forEach(dt => {
                if (dt >= effectiveStartDate && dt <= effectiveEndDate) datesSet.add(dt);
              });
            }
          });
          datesSet.forEach(dt => {
            let daySum = 0;
            Object.values(mp.departments).forEach(d => {
              if (d?.daily?.[dt]) daySum += Number(d.daily[dt]) || 0;
            });
            if (daySum > 0) {
              activeDaysCount++;
              activeDates.push(dt);
              if (daySum > pPeak) {
                pPeak = daySum;
                pPeakDate = dt;
              }
            }
          });
        } else if (mp?.dailyTotal) {
          Object.entries(mp.dailyTotal).forEach(([dt, val]) => {
            const num = Number(val) || 0;
            if (dt >= effectiveStartDate && dt <= effectiveEndDate && num > 0) {
              activeDaysCount++;
              activeDates.push(dt);
              if (num > pPeak) {
                pPeak = num;
                pPeakDate = dt;
              }
            }
          });
        }

        activeDates.sort();
        const firstActiveDate = activeDates[0] || "-";
        const lastActiveDate = activeDates[activeDates.length - 1] || "-";

        // Dominant department
        let dominantDept = "-";
        let maxDeptVal = 0;
        Object.entries(pDepts).forEach(([k, v]) => {
          if (v > maxDeptVal) {
            maxDeptVal = v;
            dominantDept = DEPT_SHORT[k] || k;
          }
        });

        return {
          ...p,
          pDepts,
          pRangeTotal,
          pTotalManday,
          ratio,
          pPeak,
          pPeakDate,
          activeDaysCount,
          firstActiveDate,
          lastActiveDate,
          dominantDept,
          maxDeptVal
        };
      });

      // Active projects sorted by range total descending
      const activeProjects = analyzedProjects
        .filter(p => p.pRangeTotal > 0)
        .sort((a, b) => b.pRangeTotal - a.pRangeTotal);

      const displayActiveProjects = activeProjects.length > 0 ? activeProjects : analyzedProjects.slice(0, 6);

      // Pagination for Table Slide
      const PJT_PER_PAGE = 10;
      const exportTableProjects = (onlyActiveProjectsInMonth && activeProjects.length > 0) ? activeProjects : filteredProjects;
      const tablePagesCount = Math.max(1, Math.ceil(exportTableProjects.length / PJT_PER_PAGE));

      // Detailed Analysis Projects: up to 6 top projects (2 per slide)
      const detailPjtList = displayActiveProjects.slice(0, 6);
      const detailSlidesCount = Math.max(1, Math.ceil(detailPjtList.length / 2));

      // Total Slide Count Estimation
      const totalSlides = 1 + targetMonths.length + tablePagesCount + detailSlidesCount;
      let curPage = 1;

      // ==========================================
      // SLIDE 1: Executive Summary (종합 요약)
      // ==========================================
      const s1 = pptx.addSlide();
      addSlideHeader(
        s1,
        "공수 통합 관리 종합 현황 (Executive Summary)",
        `조회 대상: ${effectiveLabel}  |  Site 필터: ${siteFilter}  |  부서 필터: ${deptFilter}`,
        curPage++,
        totalSlides
      );

      // 4 KPI Cards
      const daysDiff = Math.max(1, Math.round((new Date(effectiveEndDate) - new Date(effectiveStartDate)) / 86400000) + 1);
      const dailyAvg = (periodTotalManday / daysDiff).toFixed(1);

      const kpis = [
        { title: "총 투입 공수", val: `${periodTotalManday.toLocaleString()} M/D`, desc: `조회 기간 누적 투입량`, color: C.blue },
        { title: "일일 Peak 인원", val: `${periodDailyPeak} 명`, desc: peakDates.length > 0 ? peakDates.slice(0, 2).join(", ") : "피크 없음", color: C.red },
        { title: "투입 프로젝트", val: `${projectsWithManpower.length} 개 PJT`, desc: `전체 ${filteredProjects.length}개 대상 프로젝트`, color: C.green },
        { title: "일일 평균 투입", val: `${dailyAvg} M/D`, desc: `총 ${daysDiff}일간 일평균 인원`, color: C.purple }
      ];

      kpis.forEach((k, i) => {
        const x = 0.6 + i * 3.12;
        s1.addShape("roundRect", {
          x,
          y: 1.2,
          w: 2.9,
          h: 1.12,
          fill: { color: C.white },
          line: { color: C.borderLight, width: 1 },
          rectRadius: 0.08
        });
        s1.addText(k.title, {
          x: x + 0.18,
          y: 1.32,
          w: 2.54,
          h: 0.22,
          fontSize: 9.5,
          color: C.gray,
          bold: true,
          margin: 0
        });
        s1.addText(k.val, {
          x: x + 0.18,
          y: 1.56,
          w: 2.54,
          h: 0.42,
          fontSize: 19,
          color: k.color,
          bold: true,
          margin: 0
        });
        s1.addText(k.desc, {
          x: x + 0.18,
          y: 2.02,
          w: 2.54,
          h: 0.2,
          fontSize: 7.5,
          color: "94A3B8",
          margin: 0
        });
      });

      // Split Section: Left - Department Breakdown Table
      s1.addText("부서별 공수 투입 현황 및 비중", {
        x: 0.6,
        y: 2.52,
        w: 5.85,
        h: 0.28,
        fontSize: 12,
        bold: true,
        color: C.navy,
        margin: 0
      });

      const deptTableRows = [
        [
          { text: "부서명", options: { bold: true, color: C.white, fill: { color: C.navy }, align: "center" } },
          { text: "투입 공수 (M/D)", options: { bold: true, color: C.white, fill: { color: C.navy }, align: "center" } },
          { text: "비중 (%)", options: { bold: true, color: C.white, fill: { color: C.navy }, align: "center" } }
        ]
      ];

      activeDeptKeys.forEach(k => {
        const val = deptTotals[k] || 0;
        const pct = periodTotalManday > 0 ? ((val / periodTotalManday) * 100).toFixed(1) : "0.0";
        deptTableRows.push([
          { text: getDeptLabel(k), options: { bold: true, color: C.navy, align: "left" } },
          { text: `${val.toLocaleString()} M/D`, options: { bold: true, color: C.blue, align: "right" } },
          { text: `${pct}%`, options: { align: "right", color: C.gray } }
        ]);
      });

      deptTableRows.push([
        { text: "전체 합계", options: { bold: true, color: C.navy, fill: { color: "E2E8F0" }, align: "left" } },
        { text: `${periodTotalManday.toLocaleString()} M/D`, options: { bold: true, color: C.blue, fill: { color: "E2E8F0" }, align: "right" } },
        { text: "100.0%", options: { bold: true, color: C.navy, fill: { color: "E2E8F0" }, align: "right" } }
      ]);

      s1.addTable(deptTableRows, {
        x: 0.6,
        y: 2.88,
        w: 5.85,
        h: 4.0,
        colW: [2.65, 1.8, 1.4],
        border: { type: "solid", pt: 0.5, color: C.borderLight },
        fontSize: 8.5,
        margin: 0.04,
        rowH: 0.35,
        valign: "middle"
      });

      // Split Section: Right - Top Projects Overview
      s1.addText("주요 투입 프로젝트 현황 (TOP 5)", {
        x: 6.88,
        y: 2.52,
        w: 5.85,
        h: 0.28,
        fontSize: 12,
        bold: true,
        color: C.navy,
        margin: 0
      });

      const topPjtRows = [
        [
          { text: "제조번호", options: { bold: true, color: C.white, fill: { color: C.blue }, align: "center" } },
          { text: "프로젝트명", options: { bold: true, color: C.white, fill: { color: C.blue }, align: "center" } },
          { text: "Site", options: { bold: true, color: C.white, fill: { color: C.blue }, align: "center" } },
          { text: "기간 계획", options: { bold: true, color: C.white, fill: { color: C.blue }, align: "center" } },
          { text: "편성 비중", options: { bold: true, color: C.white, fill: { color: C.blue }, align: "center" } }
        ]
      ];

      displayActiveProjects.slice(0, 5).forEach(p => {
        topPjtRows.push([
          { text: normalizeJVName(p.manufacturingNo) || "-", options: { align: "center", bold: true, color: C.slate } },
          { text: normalizeJVName(p.name) || "-", options: { align: "left", bold: true, color: C.navy } },
          { text: normalizeJVName(p.site) || "-", options: { align: "center", color: C.gray } },
          { text: `${p.pRangeTotal.toLocaleString()} M/D`, options: { align: "right", bold: true, color: C.blue } },
          { text: p.ratio !== "-" ? `${p.ratio}%` : "-", options: { align: "right", bold: true, color: C.green } }
        ]);
      });

      if (displayActiveProjects.length === 0) {
        topPjtRows.push([
          { text: "해당 기간 공수 편성된 프로젝트가 없습니다.", options: { colspan: 5, align: "center", color: C.gray } }
        ]);
      }

      s1.addTable(topPjtRows, {
        x: 6.88,
        y: 2.88,
        w: 5.85,
        h: 4.0,
        colW: [1.2, 2.25, 0.8, 1.0, 0.6],
        border: { type: "solid", pt: 0.5, color: C.borderLight },
        fontSize: 8.5,
        margin: 0.04,
        rowH: 0.45,
        valign: "middle"
      });

      // ==========================================
      // SLIDE 2+: Monthly Calendar Slides (월별 달력)
      // ==========================================
      targetMonths.forEach(({ y: curY, m: curM }) => {
        const sCal = pptx.addSlide();

        const daysInCurMonth = new Date(curY, curM + 1, 0).getDate();
        let mTotal = 0;
        let mPeak = 0;
        let mPeakDate = "-";

        for (let d = 1; d <= daysInCurMonth; d++) {
          const dStr = `${curY}-${String(curM + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const dData = dailyData[dStr];
          if (dData && dData.total > 0) {
            mTotal += dData.total;
            if (dData.total > mPeak) {
              mPeak = dData.total;
              mPeakDate = dStr;
            }
          }
        }

        addSlideHeader(
          sCal,
          `${curY}년 ${curM + 1}월 공수 투입 달력`,
          `월간 투입 공수: ${mTotal.toLocaleString()} M/D  |  일일 Peak: ${mPeak}명 (${mPeakDate || "-"})  |  전체 조회 기간: ${effectiveLabel}`,
          curPage++,
          totalSlides
        );

        const firstDayOfWeek = new Date(curY, curM, 1).getDay();
        const totalWeeks = Math.ceil((firstDayOfWeek + daysInCurMonth) / 7);

        const calRows = [];

        // Weekday Header (기존 대비 약 1/3 수준으로 슬림하게 축소)
        const weekdays = ["일 (Sun)", "월 (Mon)", "화 (Tue)", "수 (Wed)", "목 (Thu)", "금 (Fri)", "토 (Sat)"];
        calRows.push(
          weekdays.map((w, idx) => ({
            text: w,
            options: {
              bold: true,
              color: idx === 0 ? "FCA5A5" : idx === 6 ? "93C5FD" : C.white,
              fill: { color: C.navy },
              align: "center",
              valign: "middle",
              fontSize: 7.5,
              margin: 0
            }
          }))
        );

        // Week Rows
        let dayCounter = 1;
        for (let w = 0; w < totalWeeks; w++) {
          const rowCells = [];
          for (let col = 0; col < 7; col++) {
            const cellIndex = w * 7 + col;
            if (cellIndex < firstDayOfWeek || dayCounter > daysInCurMonth) {
              rowCells.push({
                text: "",
                options: {
                  fill: { color: "F8FAFC" },
                  border: { type: "solid", pt: 0.5, color: "E2E8F0" }
                }
              });
            } else {
              const dNum = dayCounter;
              const dStr = `${curY}-${String(curM + 1).padStart(2, "0")}-${String(dNum).padStart(2, "0")}`;
              const dData = dailyData[dStr];
              const isInRange = dStr >= effectiveStartDate && dStr <= effectiveEndDate;

              let cellFill = C.white;
              let textRuns = [];

              if (dData && dData.total > 0) {
                const isPeak = dData.total === mPeak && mPeak > 0;
                if (isPeak) cellFill = C.redLight;
                else if (dData.total >= 5) cellFill = C.blueSoft;
                else cellFill = C.blueLight;

                // 1. Date & M/D: Text 7.5, M/D 8
                textRuns.push({
                  text: `${dNum}일 `,
                  options: { fontSize: 7.5, bold: true, color: col === 0 ? C.red : col === 6 ? C.blue : C.navy }
                });
                textRuns.push({
                  text: `[${dData.total} M/D]\n`,
                  options: { fontSize: 8, bold: true, color: isPeak ? C.red : C.blue }
                });

                // 2. Department summary: Text 7.5
                const deptsActive = [];
                Object.entries(dData.departments || {}).forEach(([dk, val]) => {
                  if (val > 0) deptsActive.push(`${getDeptShort(dk)}${val}`);
                });

                if (deptsActive.length > 0) {
                  textRuns.push({
                    text: `${deptsActive.slice(0, 3).join(" ")}\n`,
                    options: { fontSize: 7.5, color: C.gray }
                  });
                }

                // 3. Project name summary: Text 7.5
                const pList = dData.projectBreakdown || [];
                if (pList.length > 0) {
                  const pName = normalizeJVName(pList[0].manufacturingNo || pList[0].name);
                  const pExtra = pList.length > 1 ? ` 외 ${pList.length - 1}건` : "";
                  textRuns.push({
                    text: `${pName}${pExtra}`,
                    options: { fontSize: 7.5, color: C.slate }
                  });
                }
              } else {
                textRuns.push({
                  text: `${dNum}`,
                  options: {
                    fontSize: 7.5,
                    bold: true,
                    color: !isInRange ? "CBD5E1" : col === 0 ? C.red : col === 6 ? C.blue : C.gray
                  }
                });
              }

              rowCells.push({
                text: textRuns,
                options: {
                  fill: { color: cellFill },
                  valign: "top",
                  align: "left",
                  margin: 0.02,
                  border: { type: "solid", pt: 0.5, color: C.borderLight }
                }
              });

              dayCounter++;
            }
          }
          calRows.push(rowCells);
        }

        const colWidth = 12.13 / 7;
        const totalHeight = 5.45;
        const headerH = 0.22; // 기존 0.8~1.0 대비 약 1/3 수준으로 축소
        const weekRowH = (totalHeight - headerH) / totalWeeks;
        const rowHeights = [headerH, ...Array(totalWeeks).fill(weekRowH)];

        sCal.addTable(calRows, {
          x: 0.6,
          y: 1.25,
          w: 12.13,
          h: totalHeight,
          colW: [colWidth, colWidth, colWidth, colWidth, colWidth, colWidth, colWidth],
          margin: 0.02,
          rowH: rowHeights,
          border: { type: "solid", pt: 0.5, color: C.borderLight },
          autoFit: false
        });
      });

      // ==========================================
      // SLIDE: Project Overview Tables (프로젝트별 현황 표)
      // ==========================================
      for (let pIdx = 0; pIdx < tablePagesCount; pIdx++) {
        const sTbl = pptx.addSlide();
        const start = pIdx * PJT_PER_PAGE;
        const pagePjtSlice = exportTableProjects.slice(start, start + PJT_PER_PAGE);

        addSlideHeader(
          sTbl,
          `프로젝트별 마스터 플랜 공수 편성 현황 (${pIdx + 1}/${tablePagesCount})`,
          `조회 대상: ${effectiveLabel}  |  투입 단위: Man-Day (M/D)`,
          curPage++,
          totalSlides
        );

        const tableRows = [
          [
            { text: "제조번호", options: { bold: true, color: C.white, fill: { color: C.navy }, align: "center" } },
            { text: "Site", options: { bold: true, color: C.white, fill: { color: C.navy }, align: "center" } },
            { text: "Line", options: { bold: true, color: C.white, fill: { color: C.navy }, align: "center" } },
            { text: "프로젝트명", options: { bold: true, color: C.white, fill: { color: C.navy }, align: "center" } },
            ...activeDeptKeys.map(k => ({
              text: getDeptShort(k),
              options: { bold: true, color: C.white, fill: { color: C.navy }, align: "center" }
            })),
            { text: "기간 계획 공수", options: { bold: true, color: C.white, fill: { color: C.blue }, align: "center" } },
            { text: "마스터플랜 총공수", options: { bold: true, color: C.white, fill: { color: C.navy }, align: "center" } },
            { text: "편성 비중", options: { bold: true, color: C.white, fill: { color: C.green }, align: "center" } }
          ]
        ];

        pagePjtSlice.forEach(p => {
          const { pDepts, pRangeTotal } = getProjectRangeData(p);
          const pTotalManday = getProjectTotalManday(p);
          const ratio = pTotalManday > 0 ? ((pRangeTotal / pTotalManday) * 100).toFixed(1) + "%" : "-";

          tableRows.push([
            { text: normalizeJVName(p.manufacturingNo) || "-", options: { align: "center", bold: true, color: C.slate } },
            { text: normalizeJVName(p.site) || "-", options: { align: "center", color: C.gray } },
            { text: normalizeJVName(p.line) || "-", options: { align: "center", color: C.gray } },
            { text: normalizeJVName(p.name) || "-", options: { align: "left", bold: true, color: C.navy } },
            ...activeDeptKeys.map(k => ({
              text: pDepts[k] > 0 ? String(pDepts[k]) : "-",
              options: { align: "right" }
            })),
            { text: pRangeTotal > 0 ? `${pRangeTotal} M/D` : "-", options: { align: "right", bold: true, color: C.blue } },
            { text: pTotalManday > 0 ? `${pTotalManday} M/D` : "-", options: { align: "right", color: C.slate } },
            { text: ratio, options: { align: "right", bold: true, color: ratio !== "-" ? C.green : C.gray } }
          ]);
        });

        // Add summary row on the last page
        if (pIdx === tablePagesCount - 1) {
          const allTotalMandaySum = filteredProjects.reduce((acc, p) => acc + getProjectTotalManday(p), 0);
          tableRows.push([
            { text: "합계 (Total)", options: { colspan: 4, bold: true, color: C.navy, fill: { color: "E2E8F0" }, align: "center" } },
            ...activeDeptKeys.map(k => ({
              text: String(deptTotals[k] || 0),
              options: { bold: true, color: C.navy, fill: { color: "E2E8F0" }, align: "right" }
            })),
            { text: `${periodTotalManday} M/D`, options: { bold: true, color: C.blue, fill: { color: "E2E8F0" }, align: "right" } },
            { text: `${allTotalMandaySum} M/D`, options: { bold: true, color: C.navy, fill: { color: "E2E8F0" }, align: "right" } },
            { text: allTotalMandaySum > 0 ? `${((periodTotalManday / allTotalMandaySum) * 100).toFixed(1)}%` : "-", options: { bold: true, color: C.green, fill: { color: "E2E8F0" }, align: "right" } }
          ]);
        }

        const baseW = [1.2, 0.7, 0.7, 2.2];
        const endW = [1.1, 1.1, 0.8];
        const remainingW = 12.13 - (1.2 + 0.7 + 0.7 + 2.2 + 1.1 + 1.1 + 0.8);
        const deptW = Math.max(0.4, remainingW / Math.max(1, activeDeptKeys.length));
        const colW = [...baseW, ...Array(activeDeptKeys.length).fill(deptW), ...endW];

        sTbl.addTable(tableRows, {
          x: 0.6,
          y: 1.25,
          w: 12.13,
          h: 5.6,
          colW: colW,
          border: { type: "solid", pt: 0.5, color: C.borderLight },
          fontSize: 8,
          margin: 0.04,
          rowH: 0.35,
          valign: "middle"
        });
      }

      // ==========================================
      // SLIDE: Project Deep Dive / Detailed Analysis (프로젝트별 상세 분석)
      // ==========================================
      for (let dIdx = 0; dIdx < detailSlidesCount; dIdx++) {
        const sDtl = pptx.addSlide();
        const p1 = detailPjtList[dIdx * 2];
        const p2 = detailPjtList[dIdx * 2 + 1];

        addSlideHeader(
          sDtl,
          `주요 프로젝트별 마스터 플랜 공수 상세 분석 (${dIdx + 1}/${detailSlidesCount})`,
          `마스터 플랜 기준 부서별 공수 편성 비중, 일정 계획, 일일 최대 편성 인원 상세 분석`,
          curPage++,
          totalSlides
        );

        // Render Project 1 (Top Card)
        if (p1) renderProjectDetailCard(sDtl, p1, 1.2, C, activeDeptKeys);

        // Render Project 2 (Bottom Card)
        if (p2) renderProjectDetailCard(sDtl, p2, 4.2, C, activeDeptKeys);
      }

      // Save PPT File
      const fileLabel = viewMode === "month" ? `${year}년_${month + 1}월` : `${effectiveStartDate}_${effectiveEndDate}`;
      await pptx.writeFile({ fileName: `TW_공수보고서_${fileLabel}.pptx` });
    } catch (err) {
      console.error("PPT 생성 실패:", err);
      alert("PPT 생성 실패: " + err.message);
    } finally {
      setIsExportingPPT(false);
    }
  };

  // -------------------------------------------------------------
  // 계획공수 vs 실투입공수 비교분석 연산
  // -------------------------------------------------------------
  // 1. 일보를 project_id별로 그룹화
  const reportsByProject = useMemo(() => {
    const map = {};
    (dailyReports || []).forEach(r => {
      if (!map[r.project_id]) map[r.project_id] = [];
      map[r.project_id].push(r);
    });
    // 날짜 역순 정렬 (최신 일보 먼저)
    Object.keys(map).forEach(pid => {
      map[pid].sort((a, b) => (b.report_date || "").localeCompare(a.report_date || ""));
    });
    return map;
  }, [dailyReports]);

  // 일보기반 및 마일스톤 연동 인력 변동 사유 분석 헬퍼
  const getManpowerChangeReason = (r, allReports, idx, project) => {
    const prevReport = allReports && allReports[idx + 1];

    const currMech = Number(r.facility_count) || 0;
    const currMechSub = Number(r.facility_outsource) || 0;
    const currCtrl = Number(r.control_count) || 0;
    const currCtrlSub = Number(r.control_outsource) || 0;
    const currElec = Number(r.electrical_count) || 0;
    const currElecSub = Number(r.electrical_outsource) || 0;
    const currVis = Number(r.vision_count) || 0;
    const currVisSub = Number(r.vision_outsource) || 0;
    const currMgr = Number(r.pm_count) || 0;
    const currSafety = Number(r.personnel_count) || 0;
    const currCustomSum = Object.values(r.custom_depts || {}).reduce((a, b) => a + (Number(b) || 0), 0);

    const currTotal = currMech + currMechSub + currCtrl + currCtrlSub + currElec + currElecSub + currVis + currVisSub + currMgr + currSafety + currCustomSum;

    let deltaBadge = null;
    const deptChanges = [];

    if (prevReport) {
      const prevMech = Number(prevReport.facility_count) || 0;
      const prevMechSub = Number(prevReport.facility_outsource) || 0;
      const prevCtrl = Number(prevReport.control_count) || 0;
      const prevCtrlSub = Number(prevReport.control_outsource) || 0;
      const prevElec = Number(prevReport.electrical_count) || 0;
      const prevElecSub = Number(prevReport.electrical_outsource) || 0;
      const prevVis = Number(prevReport.vision_count) || 0;
      const prevVisSub = Number(prevReport.vision_outsource) || 0;
      const prevMgr = Number(prevReport.pm_count) || 0;
      const prevSafety = Number(prevReport.personnel_count) || 0;
      const prevCustomSum = Object.values(prevReport.custom_depts || {}).reduce((a, b) => a + (Number(b) || 0), 0);

      const prevTotal = prevMech + prevMechSub + prevCtrl + prevCtrlSub + prevElec + prevElecSub + prevVis + prevVisSub + prevMgr + prevSafety + prevCustomSum;
      const diff = currTotal - prevTotal;

      const mechDiff = currMech - prevMech;
      const mechSubDiff = currMechSub - prevMechSub;
      const ctrlDiff = currCtrl - prevCtrl;
      const ctrlSubDiff = currCtrlSub - prevCtrlSub;
      const elecDiff = currElec - prevElec;
      const elecSubDiff = currElecSub - prevElecSub;
      const visDiff = currVis - prevVis;
      const visSubDiff = currVisSub - prevVisSub;
      const mgrDiff = currMgr - prevMgr;
      const safetyDiff = currSafety - prevSafety;

      if (mechDiff !== 0) deptChanges.push(`기구 ${mechDiff > 0 ? `+${mechDiff}` : mechDiff}`);
      if (mechSubDiff !== 0) deptChanges.push(`기구외주 ${mechSubDiff > 0 ? `+${mechSubDiff}` : mechSubDiff}`);
      if (ctrlDiff !== 0) deptChanges.push(`제어 ${ctrlDiff > 0 ? `+${ctrlDiff}` : ctrlDiff}`);
      if (ctrlSubDiff !== 0) deptChanges.push(`제어외주 ${ctrlSubDiff > 0 ? `+${ctrlSubDiff}` : ctrlSubDiff}`);
      if (elecDiff !== 0) deptChanges.push(`전장 ${elecDiff > 0 ? `+${elecDiff}` : elecDiff}`);
      if (elecSubDiff !== 0) deptChanges.push(`전장외주 ${elecSubDiff > 0 ? `+${elecSubDiff}` : elecSubDiff}`);
      if (visDiff !== 0) deptChanges.push(`비전 ${visDiff > 0 ? `+${visDiff}` : visDiff}`);
      if (visSubDiff !== 0) deptChanges.push(`비전외주 ${visSubDiff > 0 ? `+${visSubDiff}` : visSubDiff}`);
      if (mgrDiff !== 0) deptChanges.push(`소장 ${mgrDiff > 0 ? `+${mgrDiff}` : mgrDiff}`);
      if (safetyDiff !== 0) deptChanges.push(`안전 ${safetyDiff > 0 ? `+${safetyDiff}` : safetyDiff}`);

      const allCustomKeys = new Set([...Object.keys(r.custom_depts || {}), ...Object.keys(prevReport.custom_depts || {})]);
      allCustomKeys.forEach(k => {
        const cDiff = (Number(r.custom_depts?.[k]) || 0) - (Number(prevReport.custom_depts?.[k]) || 0);
        if (cDiff !== 0) deptChanges.push(`${k} ${cDiff > 0 ? `+${cDiff}` : cDiff}`);
      });

      if (diff > 0) {
        deltaBadge = { type: 'inc', text: `▲ +${diff}명 증원`, color: '#dc2626', bg: '#fee2e2' };
      } else if (diff < 0) {
        deltaBadge = { type: 'dec', text: `▼ ${Math.abs(diff)}명 감원`, color: '#2563eb', bg: '#dbeafe' };
      } else {
        deltaBadge = { type: 'same', text: `유지 (${currTotal}명)`, color: '#64748b', bg: 'var(--bg-card-subtle)' };
      }
    } else {
      deltaBadge = { type: 'init', text: `● 현 투입 (${currTotal}명)`, color: '#059669', bg: '#dcfce7' };
    }

    let activeMilestone = "";
    if (project?.milestones && r.report_date) {
      const ms = project.milestones.find(m => {
        const s = m.startDate || m.start;
        const e = m.endDate || m.end;
        return s && e && r.report_date >= s && r.report_date <= e && m.name;
      });
      if (ms) activeMilestone = ms.name;
    }

    const incDeptKeys = [];
    if (prevReport) {
      if (currMech > (Number(prevReport.facility_count) || 0)) incDeptKeys.push('기구');
      if (currCtrl > (Number(prevReport.control_count) || 0)) incDeptKeys.push('제어');
      if (currElec > (Number(prevReport.electrical_count) || 0)) incDeptKeys.push('전장');
      if (currVis > (Number(prevReport.vision_count) || 0)) incDeptKeys.push('비전');
      if (currMgr > (Number(prevReport.pm_count) || 0)) incDeptKeys.push('소장');
    }

    const parsedWorks = parseDeptWorkSections(r.work_details || "");
    const deptWorkItems = [];

    if (incDeptKeys.length > 0) {
      incDeptKeys.forEach(dKey => {
        if (parsedWorks[dKey]) {
          const items = splitWorkItems(parsedWorks[dKey]);
          deptWorkItems.push({ dept: `${dKey}작업`, items });
        } else {
          const allLines = (r.work_details || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          const matchedLines = allLines.filter(l => new RegExp(dKey, 'i').test(l));
          if (matchedLines.length > 0) {
            deptWorkItems.push({ dept: `${dKey}작업`, items: matchedLines });
          } else {
            deptWorkItems.push({ dept: `${dKey}작업`, items: ['(일보 내 해당 부서 작업내용 미기재)'] });
          }
        }
      });
    }

    const specialNote = (r.special_notes || "").trim();
    const hasWorkContent = deptWorkItems.length > 0 || Boolean(specialNote);

    let noteSnippet = "";
    if (deptWorkItems.length > 0) {
      noteSnippet = deptWorkItems.map(dw => `[${dw.dept}]\n${dw.items.map((it, idx) => `${idx + 1}. ${it}`).join('\n')}`).join('\n\n');
    } else if (specialNote) {
      noteSnippet = `[특이사항] ${specialNote}`;
    }

    return {
      deltaBadge,
      deptChanges,
      milestone: activeMilestone,
      deptWorkItems,
      hasWorkContent,
      specialNote,
      noteSnippet,
      fullWorkDetails: (r.work_details || "").trim()
    };
  };

  // 2. 개별 프로젝트의 계획 vs 실투입 비교 계산 함수 (설계 제외, PM -> 소장, 모든 부서 분리)
  const computeCompData = (p) => {
    const pReports = reportsByProject[p.id] || [];
    const mp = p.manpower || {};

    // 1. 계획 공수 집계 (마스터플랜 부서 키 정규화 반영, 설계 제외)
    const deptPlanMap = {};
    if (mp.departments) {
      Object.entries(mp.departments).forEach(([rawD, dData]) => {
        const norm = normalizeDeptKey(rawD);
        let sum = 0;
        if (dData?.total && Number(dData.total) > 0) {
          sum = Number(dData.total);
        } else if (dData?.daily) {
          sum = Object.values(dData.daily).reduce((a, b) => a + (Number(b) || 0), 0);
        }
        deptPlanMap[norm] = (deptPlanMap[norm] || 0) + sum;
      });
    }

    // 1. 계획 공수 집계 (마스터플랜 부서 키 정규화 반영, 설계 제외)
    const planMech = deptPlanMap["mechanical"] || 0;
    const planMechSub = deptPlanMap["mechanical_sub"] || 0;
    const planControl = deptPlanMap["control"] || 0;
    const planControlSub = deptPlanMap["control_sub"] || 0;
    const planVision = deptPlanMap["vision"] || 0;
    const planVisionSub = deptPlanMap["vision_sub"] || 0;
    const planElectrical = deptPlanMap["electrical"] || 0;
    const planElectricalSub = deptPlanMap["electrical_sub"] || 0;
    const planSafety = deptPlanMap["safety"] || 0;
    const planManager = (deptPlanMap["manager"] || 0) + (deptPlanMap["pm"] || 0);
    const planSV = deptPlanMap["supervisor"] || 0;

    // 2. 실투입 공수 (일보 합산 - 설계 제외, PM은 소장으로 매핑, 전장/외주/안전CS/커스텀 완벽 집계)
    let actualTotal = 0;
    let actualManager = 0;
    let actualMech = 0;
    let actualMechSub = 0;
    let actualControl = 0;
    let actualControlSub = 0;
    let actualElectrical = 0;
    let actualElectricalSub = 0;
    let actualVision = 0;
    let actualVisionSub = 0;
    let actualSafety = 0;
    const actualCustom = {};

    pReports.forEach(r => {
      const mgr = Number(r.pm_count) || 0;
      const fac = Number(r.facility_count) || 0;
      const facSub = Number(r.facility_outsource) || 0;
      const ctrl = Number(r.control_count) || 0;
      const ctrlSub = Number(r.control_outsource) || 0;
      const elec = Number(r.electrical_count) || 0;
      const elecSub = Number(r.electrical_outsource) || 0;
      const vis = Number(r.vision_count) || 0;
      const visSub = Number(r.vision_outsource) || 0;
      const safety = Number(r.personnel_count) || 0;

      let customDaySum = 0;
      if (r.custom_depts) {
        Object.entries(r.custom_depts).forEach(([k, v]) => {
          const num = Number(v) || 0;
          if (num > 0) {
            actualCustom[k] = (actualCustom[k] || 0) + num;
            customDaySum += num;
          }
        });
      }

      const dayTotal = mgr + fac + facSub + ctrl + ctrlSub + elec + elecSub + vis + visSub + safety + customDaySum;

      actualManager += mgr;
      actualMech += fac;
      actualMechSub += facSub;
      actualControl += ctrl;
      actualControlSub += ctrlSub;
      actualElectrical += elec;
      actualElectricalSub += elecSub;
      actualVision += vis;
      actualVisionSub += visSub;
      actualSafety += safety;
      actualTotal += dayTotal;
    });

    // 3. 부서별 개별 목록 (기타 제거, 외주 분리, PM -> 소장, 설계 제외)
    // 기본 부서 (프로젝트 공통 표준 부서 6종)
    const baseDepts = [
      { key: 'mechanical', name: '기구 (Mechanical)', plan: planMech, actual: actualMech, color: '#3b82f6' },
      { key: 'control', name: '제어 (Control)', plan: planControl, actual: actualControl, color: '#10b981' },
      { key: 'electrical', name: '전장 (Electrical)', plan: planElectrical, actual: actualElectrical, color: '#f59e0b' },
      { key: 'vision', name: '비전 (Vision)', plan: planVision, actual: actualVision, color: '#c084fc' },
      { key: 'safety', name: '안전 (Safety)', plan: planSafety, actual: actualSafety, color: '#f43f5e' },
      { key: 'manager', name: '소장 (Manager)', plan: planManager, actual: actualManager, color: '#0284c7' },
    ];

    // 외주 및 특수 부서 (외주인력을 사용하는 프로젝트의 경우 계획 또는 실투입이 있으면 개별 카드로 분리 노출)
    const subDepts = [];
    if (planMechSub > 0 || actualMechSub > 0) {
      subDepts.push({ key: 'mechanical_sub', name: '기구 외주 (Mech Sub)', plan: planMechSub, actual: actualMechSub, color: '#60a5fa' });
    }
    if (planControlSub > 0 || actualControlSub > 0) {
      subDepts.push({ key: 'control_sub', name: '제어 외주 (Control Sub)', plan: planControlSub, actual: actualControlSub, color: '#34d399' });
    }
    if (planElectricalSub > 0 || actualElectricalSub > 0) {
      subDepts.push({ key: 'electrical_sub', name: '전장 외주 (Elec Sub)', plan: planElectricalSub, actual: actualElectricalSub, color: '#fb923c' });
    }
    if (planVisionSub > 0 || actualVisionSub > 0) {
      subDepts.push({ key: 'vision_sub', name: '비전 외주 (Vision Sub)', plan: planVisionSub, actual: actualVisionSub, color: '#e879f9' });
    }
    if (planSV > 0) {
      subDepts.push({ key: 'supervisor', name: 'SV (Supervisor)', plan: planSV, actual: 0, color: '#06b6d4' });
    }

    // 동적 특수 부서 (도비, 레이저용접 등)
    Object.entries(actualCustom).forEach(([k, v]) => {
      subDepts.push({
        key: 'custom_' + k,
        name: `${k} (특수부서)`,
        plan: deptPlanMap[k] || 0,
        actual: v,
        color: '#38bdf8'
      });
    });

    // 그 외 deptPlanMap에 등록된 다른 동적 부서들 (설계 제외, 이미 등록된 부서 제외)
    const standardKeys = new Set(['mechanical', 'mechanical_sub', 'control', 'control_sub', 'vision', 'vision_sub', 'electrical', 'electrical_sub', 'safety', 'manager', 'pm', 'supervisor', 'design', 'other']);
    Object.entries(deptPlanMap).forEach(([k, v]) => {
      if (!standardKeys.has(k) && v > 0) {
        subDepts.push({
          key: k,
          name: getDeptLabel(k),
          plan: v,
          actual: 0,
          color: getDeptColor(k)
        });
      }
    });

    const rawDeptList = [...baseDepts, ...subDepts];

    // 총 계획공수: 부서별 실제 계획공수의 순수 합산 (임의 기타/잔여 차액 방지)
    const planTotal = rawDeptList.reduce((acc, d) => acc + (d.plan || 0), 0);

    const deptList = rawDeptList.map(d => {
      const diff = d.actual - d.plan;
      const rate = d.plan > 0 ? (d.actual / d.plan) * 100 : (d.actual > 0 ? 100 : 0);
      return { ...d, diff, rate };
    });

    const totalDiff = actualTotal - planTotal;
    const totalRate = planTotal > 0 ? (actualTotal / planTotal) * 100 : (actualTotal > 0 ? 100 : 0);

    return {
      projectId: p.id,
      project: p,
      projectName: p.name,
      manufacturingNo: p.manufacturingNo,
      site: p.site,
      line: p.line,
      planTotal,
      actualTotal,
      totalDiff,
      totalRate,
      deptList,
      reportCount: pReports.length,
      reports: pReports
    };
  };

  // 3. 전체 프로젝트 비교 목록 (전체 프로젝트 풀 대상)
  const compProjectPool = useMemo(() => {
    return (allProjects && allProjects.length > 0) ? allProjects : projects;
  }, [allProjects, projects]);

  const allComparisonData = useMemo(() => {
    return compProjectPool.map(p => computeCompData(p));
  }, [compProjectPool, reportsByProject]);

  // 첫 진입 시 일보 등록 프로젝트 우선 선택
  useEffect(() => {
    if (!selectedCompProject && compProjectPool.length > 0) {
      const withRep = compProjectPool.find(p => reportsByProject[p.id]?.length > 0);
      setSelectedCompProject(withRep ? withRep.id : compProjectPool[0].id);
    }
  }, [compProjectPool, reportsByProject, selectedCompProject]);

  // 4. 필터링 및 정렬된 비교 목록
  const filteredCompData = useMemo(() => {
    let list = [...allComparisonData];

    // 연도 필터링
    if (compYearFilter !== "ALL") {
      const targetY = parseInt(compYearFilter, 10);
      if (!isNaN(targetY)) {
        list = list.filter(item => {
          const p = item.project;
          const s = p?.startDate || p?.start_date || '';
          const e = p?.endDate || p?.end_date || '';
          const sYr = s.length >= 4 ? parseInt(s.slice(0, 4), 10) : null;
          const eYr = e.length >= 4 ? parseInt(e.slice(0, 4), 10) : null;
          if (sYr && eYr) return targetY >= sYr && targetY <= eYr;
          if (sYr) return targetY >= sYr;
          if (eYr) return targetY <= eYr;
          return true;
        });
      }
    }

    if (onlyReported) {
      list = list.filter(item => item.reportCount > 0 || item.planTotal > 0);
    }

    if (siteFilter !== "전체") {
      list = list.filter(item => item.site === siteFilter);
    }

    if (compSearch.trim()) {
      const q = compSearch.trim().toLowerCase();
      list = list.filter(item =>
        (item.projectName || "").toLowerCase().includes(q) ||
        (item.manufacturingNo || "").toLowerCase().includes(q) ||
        (item.site || "").toLowerCase().includes(q)
      );
    }

    // 정렬
    list.sort((a, b) => {
      if (compSort === "diffDesc") return b.totalDiff - a.totalDiff; // 초과 많은 순
      if (compSort === "diffAsc") return a.totalDiff - b.totalDiff;  // 잔여 많은 순
      if (compSort === "actualDesc") return b.actualTotal - a.actualTotal; // 실투입 많은 순
      if (compSort === "planDesc") return b.planTotal - a.planTotal;     // 계획 많은 순
      if (compSort === "rateDesc") return b.totalRate - a.totalRate;     // 소진율 높은 순
      if (compSort === "reportsDesc") return b.reportCount - a.reportCount; // 일보 많은 순
      return (a.projectName || "").localeCompare(b.projectName || "");
    });

    return list;
  }, [allComparisonData, onlyReported, siteFilter, compSearch, compSort]);

  // 5. 선택된 단일 프로젝트 비교 데이터
  const selectedProjectComp = useMemo(() => {
    if (!selectedCompProject) {
      return allComparisonData[0] || null;
    }
    return allComparisonData.find(item => item.projectId === selectedCompProject) || allComparisonData[0] || null;
  }, [allComparisonData, selectedCompProject]);

  // 6. 요약 지표 (선택된 프로젝트 기준)
  const activeCompSummary = useMemo(() => {
    if (selectedProjectComp) {
      return {
        title: `${selectedProjectComp.projectName} 공수 분석`,
        planTotal: selectedProjectComp.planTotal,
        actualTotal: selectedProjectComp.actualTotal,
        totalDiff: selectedProjectComp.totalDiff,
        totalRate: selectedProjectComp.totalRate,
        reportCount: selectedProjectComp.reportCount,
        deptList: selectedProjectComp.deptList
      };
    }
    return {
      title: "",
      planTotal: 0,
      actualTotal: 0,
      totalDiff: 0,
      totalRate: 0,
      reportCount: 0,
      deptList: []
    };
  }, [selectedProjectComp]);

  // 7. 엑셀 다운로드 함수
  const exportComparisonExcel = async () => {
    try {
      const wb = new ExcelJS.Workbook();
      const today = new Date().toISOString().slice(0, 10);

      // Sheet 1: 프로젝트별 계획 vs 실투입 비교
      const ws1 = wb.addWorksheet("계획_실투입_비교분석", {
        views: [{ state: "frozen", ySplit: 4 }]
      });

      ws1.mergeCells("A1:O1");
      const titleCell = ws1.getCell("A1");
      titleCell.value = "TW Project - 프로젝트 계획공수 vs 실투입공수 비교분석 보고서";
      titleCell.font = { name: "Malgun Gothic", size: 14, bold: true, color: { argb: "FF0F172A" } };
      titleCell.alignment = { vertical: "middle" };
      ws1.getRow(1).height = 30;

      ws1.getCell("A2").value = `기준일: ${today} | 공수 통합관리 & 이슈 통합관리(일보) 연동 분석`;
      ws1.getCell("A2").font = { name: "Malgun Gothic", size: 9, color: { argb: "FF64748B" } };

      const headers = [
        "제조번호", "Site", "Line", "프로젝트명",
        "총 계획공수 (M/D)", "총 실투입공수 (M/D)", "가감/차이 (M/D)", "소진율 (%)",
        "기구 (실/계)", "제어 (실/계)", "비전 (실/계)", "전장 (실/계)", "안전 (실/계)", "소장 (실/계)", "등록 일보수"
      ];
      ws1.addRow([]);
      const headerRow = ws1.addRow(headers);
      headerRow.height = 24;
      headerRow.eachCell(cell => {
        cell.font = { name: "Malgun Gothic", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      });

      filteredCompData.forEach(item => {
        const getDeptStr = (key) => {
          const d = item.deptList.find(x => x.key === key);
          return d ? `${d.actual} / ${d.plan}` : "-";
        };

        const row = ws1.addRow([
          normalizeJVName(item.manufacturingNo) || "-",
          normalizeJVName(item.site) || "-",
          normalizeJVName(item.line) || "-",
          normalizeJVName(item.projectName) || "-",
          item.planTotal,
          item.actualTotal,
          item.totalDiff,
          item.planTotal > 0 ? (item.totalRate / 100) : 0,
          getDeptStr('mechanical'),
          getDeptStr('control'),
          getDeptStr('vision'),
          getDeptStr('electrical'),
          getDeptStr('safety'),
          getDeptStr('manager'),
          `${item.reportCount}건`
        ]);

        row.getCell(5).numFmt = "#,##0";
        row.getCell(6).numFmt = "#,##0";
        row.getCell(7).numFmt = "+#,##0;-#,##0;0";
        row.getCell(8).numFmt = "0.0%";

        if (item.totalDiff > 0) {
          row.getCell(7).font = { color: { argb: "FFDC2626" }, bold: true };
        } else if (item.totalDiff < 0) {
          row.getCell(7).font = { color: { argb: "FF16A34A" }, bold: true };
        }
      });

      ws1.columns = [
        { width: 14 }, { width: 10 }, { width: 8 }, { width: 28 },
        { width: 16 }, { width: 16 }, { width: 15 }, { width: 12 },
        { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 11 }
      ];

      // Sheet 2: 일자별 실투입 상세 내역
      const ws2 = wb.addWorksheet("일자별_실투입_상세내역", {
        views: [{ state: "frozen", ySplit: 4 }]
      });

      ws2.mergeCells("A1:I1");
      const titleCell2 = ws2.getCell("A1");
      titleCell2.value = "일자별 실투입 공수 상세 내역 (공수 분석)";
      titleCell2.font = { name: "Malgun Gothic", size: 14, bold: true, color: { argb: "FF0F172A" } };
      ws2.getRow(1).height = 28;

      const targetReports = selectedProjectComp
        ? (selectedProjectComp.reports || []).map(r => ({ ...r, projectName: selectedProjectComp.projectName, manufacturingNo: selectedProjectComp.manufacturingNo }))
        : filteredCompData.flatMap(p => (p.reports || []).map(r => ({ ...r, projectName: p.projectName, manufacturingNo: p.manufacturingNo })));

      ws2.getCell("A2").value = `대상: ${selectedProjectComp ? selectedProjectComp.projectName : "전체 프로젝트"} (총 ${targetReports.length}건)`;

      const headers2 = [
        "보고일자", "프로젝트명", "제조번호", "당일 총원 (명)",
        "소장 (명)", "기구 (명)", "제어 (명)", "전장 (명)", "비전 (명)", "외주/특수 (명)", "비고 (인력 변동 및 주요 사유)"
      ];
      ws2.addRow([]);
      const headerRow2 = ws2.addRow(headers2);
      headerRow2.height = 24;
      headerRow2.eachCell(cell => {
        cell.font = { name: "Malgun Gothic", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0369A1" } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      });

      targetReports.sort((a, b) => (b.report_date || "").localeCompare(a.report_date || ""));

      targetReports.forEach((r, rIdx) => {
        const pm = Number(r.pm_count) || 0;
        const fac = Number(r.facility_count) || 0;
        const facSub = Number(r.facility_outsource) || 0;
        const ctrl = Number(r.control_count) || 0;
        const ctrlSub = Number(r.control_outsource) || 0;
        const elec = Number(r.electrical_count) || 0;
        const elecSub = Number(r.electrical_outsource) || 0;
        const vis = Number(r.vision_count) || 0;
        const visSub = Number(r.vision_outsource) || 0;
        const safety = Number(r.personnel_count) || 0;
        const customSum = Object.values(r.custom_depts || {}).reduce((a, b) => a + (Number(b) || 0), 0);
        const subSum = facSub + ctrlSub + elecSub + visSub + customSum;
        const dayTotal = pm + fac + ctrl + elec + vis + safety + subSum;

        const reason = getManpowerChangeReason(r, targetReports, rIdx, selectedProjectComp?.project);
        const reasonText = [
          reason.milestone ? `[${reason.milestone}]` : "",
          reason.deltaBadge ? reason.deltaBadge.text : "",
          reason.deptChanges.length ? `(${reason.deptChanges.join(', ')})` : "",
          reason.noteSnippet || ""
        ].filter(Boolean).join(" · ") || "-";

        ws2.addRow([
          r.report_date,
          normalizeJVName(r.projectName) || "-",
          normalizeJVName(r.manufacturingNo) || "-",
          dayTotal,
          pm,
          fac,
          ctrl,
          elec,
          vis,
          subSum > 0 ? subSum : "-",
          reasonText
        ]);
      });

      ws2.columns = [
        { width: 13 }, { width: 28 }, { width: 16 }, { width: 14 },
        { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 45 }
      ];

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `TW_계획vs실투입_공수비교_${today}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("엑셀 다운로드 오류:", err);
      alert("엑셀 다운로드 실패: " + err.message);
    }
  };

  return (
    <div className="manpower-dashboard">
      {/* Top Header Card (틀고정) */}
      <div className="system-sticky-header">
        <div className="system-header-row">
          <div className="system-title-group">
            <div className="system-logo-icon theme-manpower">📊</div>
            <div className="system-title-text">
              <h2>공수 통합 관리 시스템 (Manpower Management)</h2>
              <p>마스터 플랜 기반 부서별 일일 투입 인원 및 전사 공수 종합 모니터링</p>
            </div>
          </div>
          <div className="system-header-actions">
            <button
              type="button"
              onClick={() => setAllSections(false)}
              className="system-toggle-all-btn"
              title="공수 통합 관리의 모든 소항목 펼치기"
            >
              ▾ 전체 펼치기
            </button>
            <button
              type="button"
              onClick={() => setAllSections(true)}
              className="system-toggle-all-btn"
              title="공수 통합 관리의 모든 소항목 접기"
            >
              ▴ 전체 접기
            </button>
          </div>
        </div>

        {/* 소항목 필터 버튼 그룹 */}
        <div className="system-sub-nav">
          {[
            { id: 'all', label: '🌐 전체 표시' },
            { id: 'controls', label: '🔍 계획공수 조회 조건 및 필터' },
            { id: 'summary', label: '📈 전사 요약 및 부서별 현황' },
            { id: 'calendar', label: '📅 일별 전사 투입 달력' },
            { id: 'table', label: '👥 프로젝트별 계획공수 현황' },
            { id: 'comparison', label: '⚖️ 계획공수 vs 실투입공수 비교분석' }
          ].map(sec => (
            <button
              key={sec.id}
              type="button"
              onClick={() => handleSelectSection(sec.id)}
              className={`system-sub-btn ${activeSection === sec.id ? 'active' : ''}`}
            >
              {sec.label}
            </button>
          ))}
        </div>
      </div>

      {/* 1. 조회 조건 및 필터 */}
      {(activeSection === 'all' || activeSection === 'controls') && (
      <div className="mp-table-section" style={{ marginBottom: "20px" }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: collapsedSections.controls ? 0 : '14px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🔍</span> 계획공수 조회 조건 및 필터
            </h3>
            <button
              type="button"
              onClick={() => toggleSection('controls')}
              style={{
                background: collapsedSections.controls ? 'var(--accent)' : 'var(--bg-card-subtle)',
                color: collapsedSections.controls ? '#fff' : 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '4px',
                padding: '2px 8px',
                fontSize: '11px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              {collapsedSections.controls ? '▸ 펼치기' : '▾ 접기'}
            </button>
          </div>
        </div>
        {!collapsedSections.controls ? (
          <div className="mp-controls-bar" style={{ border: 'none', padding: 0, background: 'transparent' }}>
            {/* Row 1: View Mode & Date Range Picker */}
            <div className="mp-controls-row">
              <div className="mp-mode-toggle">
                <button
                  className={`mp-mode-btn ${viewMode === "month" ? "active" : ""}`}
                  onClick={() => setViewMode("month")}
                >
                  🗓️ 월간 단위 조회
                </button>
                <button
                  className={`mp-mode-btn ${viewMode === "range" ? "active" : ""}`}
                  onClick={() => setViewMode("range")}
                >
                  📆 기간 지정 조회
                </button>
              </div>

              {viewMode === "range" ? (
                <div className="mp-date-range-group">
                  <span className="mp-date-range-label">조회 기간:</span>
                  <input
                    type="date"
                    className="mp-date-input"
                    value={customStart}
                    onChange={e => setCustomStart(e.target.value)}
                  />
                  <span className="mp-date-sep">~</span>
                  <input
                    type="date"
                    className="mp-date-input"
                    value={customEnd}
                    onChange={e => setCustomEnd(e.target.value)}
                  />
                  <div className="mp-quick-btns">
                    <button className="mp-quick-btn" onClick={() => handleQuickPreset(1)}>1개월</button>
                    <button className="mp-quick-btn" onClick={() => handleQuickPreset(3)}>3개월</button>
                    <button className="mp-quick-btn" onClick={() => handleQuickPreset(6)}>6개월</button>
                    <button className="mp-quick-btn" onClick={handleAllRange}>전체 기간</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                    조회 기준월:
                  </span>
                  <MonthNavigator currentDate={currentDate} onPrev={prevMonth} onNext={nextMonth} onToday={goToToday} />
                </div>
              )}
            </div>

            {/* Row 2: Filters & PPT Export Button */}
            <div className="mp-controls-row">
              <div className="mp-filter-group">
                <label style={{ fontSize: "12px", fontWeight: "bold", color: "var(--text-secondary)" }}>Site 필터:</label>
                <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)}>
                  <option value="전체">전체 Site</option>
                  {sites.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>

                <label style={{ fontSize: "12px", fontWeight: "bold", color: "var(--text-secondary)" }}>부서 필터:</label>
                <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
                  <option value="전체">전체 부서</option>
                  {activeDeptKeys.map(k => (
                    <option key={k} value={k}>{getDeptLabel(k)}</option>
                  ))}
                </select>

                <input
                  type="text"
                  placeholder="프로젝트, 제조번호 검색..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              <button
                className="mp-ppt-btn"
                onClick={exportManpowerPPT}
                disabled={isExportingPPT}
                title={!canExportPPT ? "Grade 1은 권한이 제한됩니다 (클릭 시 권한 안내)" : "공수 현황 및 프로젝트 상세 분석 보고서 PPT 다운로드"}
                style={!canExportPPT ? { opacity: 0.85 } : {}}
              >
                {isExportingPPT ? "⏳ PPT 보고서 생성 중..." : `📊 공수 보고서 PPT 다운로드 (${viewMode === "month" ? `${month + 1}월` : "지정기간"})`} {!canExportPPT && "🔒"}
              </button>
            </div>
          </div>
        ) : (
          <div 
            onClick={() => toggleSection('controls')}
            style={{
              padding: '10px 14px',
              background: 'var(--bg-card-subtle)',
              border: '1px dashed var(--border-subtle)',
              borderRadius: '8px',
              textAlign: 'center',
              color: '#64748b',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            🔍 조회 조건: <b>{viewMode === "month" ? `${year}년 ${month + 1}월` : `${customStart} ~ ${customEnd}`}</b> · Site: <b>{siteFilter}</b> · 부서: <b>{deptFilter === "전체" ? "전체" : getDeptLabel(deptFilter)}</b> (클릭하여 조건 변경 ▾)
          </div>
        )}
      </div>
      )}

      {/* 2. 전사 계획공수 요약 및 부서별 편성 현황 */}
      {(activeSection === 'all' || activeSection === 'summary') && (
      <div className="mp-table-section" style={{ marginBottom: "20px" }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: collapsedSections.summary ? 0 : '14px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📈</span> 전사 계획공수 요약 및 부서별 편성 현황 ({effectiveLabel})
            </h3>
            <button
              type="button"
              onClick={() => toggleSection('summary')}
              style={{
                background: collapsedSections.summary ? 'var(--accent)' : 'var(--bg-card-subtle)',
                color: collapsedSections.summary ? '#fff' : 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '4px',
                padding: '2px 8px',
                fontSize: '11px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              {collapsedSections.summary ? '▸ 펼치기' : '▾ 접기'}
            </button>
          </div>
        </div>
        {!collapsedSections.summary ? (
          <>
            <div className="mp-kpi-grid">
              <div className="mp-kpi-card total">
                <div className="mp-kpi-label"><span>📌</span> 총 계획공수 ({effectiveLabel})</div>
                <div className="mp-kpi-val">{periodTotalManday.toLocaleString()} <span style={{ fontSize: "16px" }}>M/D</span></div>
                <div className="mp-kpi-sub">{effectiveLabel} 마스터플랜 기준 편성 합산</div>
              </div>

              <div className="mp-kpi-card peak">
                <div className="mp-kpi-label"><span>⚡</span> 일일 계획 피크 (최대 인원)</div>
                <div className="mp-kpi-val" style={{ color: "#dc2626" }}>{periodDailyPeak} <span style={{ fontSize: "16px" }}>명</span></div>
                <div className="mp-kpi-sub">
                  {peakDates.length > 0 ? `최대 투입일: ${peakDates.slice(0, 3).map(d => d.slice(5)).join(", ")}${peakDates.length > 3 ? ` 외 ${peakDates.length - 3}일` : ""}` : "계획 편성 없음"}
                </div>
              </div>

              <div className="mp-kpi-card projects">
                <div className="mp-kpi-label"><span>🏢</span> 계획공수 편성 프로젝트</div>
                <div className="mp-kpi-val">{projectsWithManpower.length} <span style={{ fontSize: "16px" }}>개</span></div>
                <div className="mp-kpi-sub">조회 대상 {filteredProjects.length}개 프로젝트 중</div>
              </div>

              <div className="mp-kpi-card depts">
                <div className="mp-kpi-label"><span>👥</span> 최다 계획 부서</div>
                <div className="mp-kpi-val" style={{ fontSize: "20px", marginTop: "4px" }}>
                  {(() => {
                    const entries = Object.entries(deptTotals).sort((a, b) => b[1] - a[1]);
                    if (entries[0] && entries[0][1] > 0) {
                      return `${DEPT_SHORT[entries[0][0]]} (${entries[0][1]} M/D)`;
                    }
                    return "-";
                  })()}
                </div>
                <div className="mp-kpi-sub">부서별 계획 인력 배분 현황</div>
              </div>
            </div>

            <div className="mp-dept-banner" style={{ marginTop: '16px' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 'bold', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📈</span> 부서별 계획공수 편성 현황 ({effectiveLabel})
              </h4>
              <div className="mp-dept-tags">
                {activeDeptKeys.map(deptKey => {
                  const count = deptTotals[deptKey] || 0;
                  const pct = periodTotalManday > 0 ? Math.round((count / periodTotalManday) * 100) : 0;
                  return (
                    <div className="mp-dept-tag" key={deptKey} style={{ borderLeft: `4px solid ${getDeptColor(deptKey)}` }}>
                      <div className="mp-dept-tag-name">{getDeptLabel(deptKey)}</div>
                      <div className="mp-dept-tag-val">
                        {count.toLocaleString()} M/D <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "normal" }}>({pct}%)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div
            onClick={() => toggleSection('summary')}
            style={{
              padding: '12px 16px',
              background: 'var(--bg-card-subtle)',
              border: '1px dashed var(--border-subtle)',
              borderRadius: '8px',
              textAlign: 'center',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            📈 총 계획공수: <b>{periodTotalManday.toLocaleString()} M/D</b> · 일일 계획 피크: <b>{periodDailyPeak}명</b> · 편성 프로젝트: <b>{projectsWithManpower.length}개</b> (클릭하여 상세 지표 펼치기 ▾)
          </div>
        )}
      </div>
      )}

      {/* Manpower Calendar View */}
      {(activeSection === 'all' || activeSection === 'calendar') && (
      <div className="mp-calendar-section" style={{ marginBottom: "16px" }}>
        <div className="mp-cal-head" style={{ cursor: 'pointer' }} onClick={(e) => {
          if (e.target.tagName !== 'BUTTON') toggleSection('calendar');
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📅</span> 일별 전사 계획공수 투입 달력 ({year}년 {month + 1}월)
              </h3>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleSection('calendar'); }}
                style={{
                  background: collapsedSections.calendar ? 'var(--accent)' : 'var(--bg-card-subtle)',
                  color: collapsedSections.calendar ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '4px',
                  padding: '2px 8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {collapsedSections.calendar ? '▸ 펼치기' : '▾ 접기'}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const next = !showDailyDeptMatrixInMM;
                  setShowDailyDeptMatrixInMM(next);
                  try { localStorage.setItem('pm_manpower_show_daily_matrix', JSON.stringify(next)); } catch (err) {}
                }}
                style={{
                  background: showDailyDeptMatrixInMM ? 'var(--accent)' : 'var(--bg-card-subtle)',
                  color: showDailyDeptMatrixInMM ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '4px',
                  padding: '2px 8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
                title="당월 일일 부서별 공수 투입 현황 매트릭스 표 보기/접기"
              >
                📊 일일 부서별 공수표 {showDailyDeptMatrixInMM ? '접기' : '보기'}
              </button>
            </div>
            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              * 날짜를 클릭하면 해당 일자의 프로젝트별 세부 투입 명단을 볼 수 있습니다.
              {viewMode === "range" && ` (전체 지정 기간: ${effectiveStartDate} ~ ${effectiveEndDate})`}
            </span>
          </div>
          <MonthNavigator currentDate={currentDate} onPrev={prevMonth} onNext={nextMonth} onToday={goToToday} />
        </div>

        {!collapsedSections.calendar ? (
          <>
            <div className="mp-cal-weekdays">
              <span>일</span>
              <span>월</span>
              <span>화</span>
              <span>수</span>
              <span>목</span>
              <span>금</span>
              <span>토</span>
            </div>

            <div className="mp-cal-grid">
              {calendarCells.map((cell, idx) => {
                const isToday = cell.dateStr === todayStr;
                const hasData = cell.data && cell.data.total > 0;
                const isPeak = hasData && cell.data.total === periodDailyPeak && periodDailyPeak > 0;

                let badgeClass = "mp-headcount-badge";
                if (cell.data && cell.data.total >= 10) badgeClass += " high";
                else if (cell.data && cell.data.total >= 5) badgeClass += " mid";

                return (
                  <div
                    key={idx}
                    className={`mp-cal-day ${!cell.isCurrentMonth ? "other-month" : ""} ${isToday ? "is-today" : ""} ${isPeak ? "has-peak" : ""}`}
                    onClick={() => cell.data && setSelectedDay(cell.data)}
                  >
                    <div className="mp-day-top">
                      <span className="mp-day-num">{cell.dayNum}</span>
                      {hasData && (
                        <span className={badgeClass} title="당일 총 투입 인원">
                          👥 {cell.data.total}명
                        </span>
                      )}
                    </div>

                    {hasData && (
                      <>
                        <div className="mp-day-depts">
                          {Object.entries(cell.data.departments).map(([dKey, cnt]) => {
                            if (cnt <= 0) return null;
                            return (
                              <span key={dKey} style={{ borderLeft: `2px solid ${getDeptColor(dKey)}` }}>
                                {getDeptShort(dKey)} {cnt}
                              </span>
                            );
                          })}
                        </div>
                        <div className="mp-day-projs" title={cell.data.projectBreakdown.map(p => normalizeJVName(p.name)).join(", ")}>
                          {cell.data.projectBreakdown.length}개 프로젝트 진행중
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 📊 일일 부서별 공수 투입 현황 매트릭스 테이블 */}
            {showDailyDeptMatrixInMM && (
              <div className="cal-matrix-section" style={{ marginTop: '14px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                <div className="cal-matrix-header">
                  <h3>
                    <span>📊</span>
                    <span>{year}년 {month + 1}월 일일 부서별 공수 투입 현황 (Daily Department Matrix)</span>
                  </h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    당월 누적 총 계획공수: <b style={{ color: '#ea580c', fontSize: '13.5px' }}>{calMatrixData.totalMonthManday}</b> M/D
                  </span>
                </div>
                <div className="cal-matrix-table-wrap">
                  <table className="cal-matrix-table">
                    <thead>
                      <tr>
                        <th className="th-dept">구분 (부서)</th>
                        {calMatrixData.days.map(dStr => {
                          const dNum = parseInt(dStr.slice(8), 10);
                          const dow = new Date(dStr).getDay();
                          const wkndClass = dow === 0 ? 'th-weekend-sun' : dow === 6 ? 'th-weekend-sat' : '';
                          return (
                            <th key={dStr} className={wkndClass} title={dStr}>
                              {dNum}
                            </th>
                          );
                        })}
                        <th style={{ background: '#ea580c', color: '#fff' }}>월간 합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calMatrixData.sortedDepts.map(dept => {
                        let deptSum = 0;
                        return (
                          <tr key={dept}>
                            <td className="td-dept">{dept}</td>
                            {calMatrixData.days.map(dStr => {
                              const val = calMatrixData.dayDataMap[dStr]?.depts?.[dept] || 0;
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
                        <td className="td-dept" style={{ color: '#ea580c' }}>당일 총합 (명)</td>
                        {calMatrixData.days.map(dStr => {
                          const val = calMatrixData.dayDataMap[dStr]?.total || 0;
                          return (
                            <td key={dStr} className={val > 0 ? "td-total-cell-active" : ""}>
                              {val > 0 ? <b>{val}</b> : "0"}
                            </td>
                          );
                        })}
                        <td style={{ background: '#ea580c', color: '#fff', fontSize: '12px' }}>
                          <b>{calMatrixData.totalMonthManday} M/D</b>
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
            style={{
              padding: '12px 16px',
              background: 'var(--bg-card-subtle)',
              border: '1px dashed var(--border-subtle)',
              borderRadius: '8px',
              textAlign: 'center',
              color: '#64748b',
              fontSize: '13px',
              cursor: 'pointer',
              marginTop: '10px'
            }}
          >
            📅 {year}년 {month + 1}월 일별 전사 계획공수 투입 달력이 접혀 있습니다. (클릭하여 펼치기 ▾)
          </div>
        )}
      </div>
      )}

      {/* Project Breakdown Table */}
      {(activeSection === 'all' || activeSection === 'table') && (
      <div className="mp-table-section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px", cursor: 'pointer' }} onClick={(e) => {
          if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT' && !e.target.closest('label')) toggleSection('table');
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🏢</span> 프로젝트별 계획공수 현황 ({effectiveLabel})
              </h3>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleSection('table'); }}
                style={{
                  background: collapsedSections.table ? 'var(--accent)' : 'var(--bg-card-subtle)',
                  color: collapsedSections.table ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '4px',
                  padding: '2px 8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {collapsedSections.table ? '▸ 펼치기' : '▾ 접기'}
              </button>
            </div>
            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              * {viewMode === "range" ? `지정 기간(${effectiveStartDate} ~ ${effectiveEndDate})` : `상단 달력의 기준월(${year}년 ${month + 1}월)`}에 {onlyActiveProjectsInMonth ? "계획공수가 투입되는 프로젝트 목록입니다." : "편성된 프로젝트별 계획공수 데이터입니다."} (<b>{tableProjects.length}개 프로젝트</b>{onlyActiveProjectsInMonth && ` / 전체 ${filteredProjects.length}개 대상`})
            </span>
          </div>
          {/* Synchronized Month Navigator & Active Projects Only Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: onlyActiveProjectsInMonth ? 'var(--accent-muted)' : 'var(--bg-card-subtle)',
                border: onlyActiveProjectsInMonth ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
                borderRadius: '20px',
                padding: '5px 13px',
                fontSize: '12px',
                fontWeight: 600,
                color: onlyActiveProjectsInMonth ? 'var(--text-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                userSelect: 'none',
                boxShadow: onlyActiveProjectsInMonth ? '0 1px 3px rgba(59, 130, 246, 0.15)' : 'none',
                transition: 'all 0.15s ease'
              }}
              title="설정한 월/기간에 실제 공수가 투입되는 프로젝트만 필터링하여 확인합니다."
            >
              <input
                type="checkbox"
                checked={onlyActiveProjectsInMonth}
                onChange={(e) => setOnlyActiveProjectsAndSave(e.target.checked)}
                style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: 'var(--accent)' }}
              />
              <span>{viewMode === "range" ? "기간" : "당월"} 투입 프로젝트만 보기 ({tableProjects.length}건 / 전체 {filteredProjects.length}건)</span>
            </label>
            <MonthNavigator currentDate={currentDate} onPrev={prevMonth} onNext={nextMonth} onToday={goToToday} />
          </div>
        </div>
        {!collapsedSections.table ? (
          <div className="mp-table-wrapper">
            <table className="mp-table">
              <thead>
                <tr>
                  <th>제조번호</th>
                  <th>Site · Line</th>
                  <th>프로젝트명</th>
                  {activeDeptKeys.map(k => (
                    <th key={k} style={{ textAlign: "center" }}>{getDeptShort(k)}</th>
                  ))}
                  <th style={{ textAlign: "center", color: "var(--accent)" }}>
                    {viewMode === "range" ? "기간 계획공수" : `${month + 1}월 계획공수`}
                  </th>
                  <th style={{ textAlign: "center", background: "var(--bg-card-subtle)", color: "var(--text-primary)" }}>프로젝트 총 계획공수</th>
                  <th style={{ textAlign: "center" }}>상세</th>
                </tr>
              </thead>
              <tbody>
                {tableProjects.length === 0 ? (
                  <tr>
                    <td colSpan={6 + activeDeptKeys.length} style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)" }}>
                      <div style={{ fontSize: "28px", marginBottom: "8px" }}>📭</div>
                      <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-primary)" }}>
                        선택하신 {viewMode === "range" ? "기간" : `${year}년 ${month + 1}월`}에 계획공수가 편성된 프로젝트가 없습니다.
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                        다른 월을 선택하시거나, 아래 버튼을 눌러 전체 프로젝트 목록을 확인하세요.
                      </div>
                      <button
                        type="button"
                        onClick={() => setOnlyActiveProjectsAndSave(false)}
                        style={{
                          marginTop: "12px",
                          background: "var(--accent-muted)",
                          border: "1px solid var(--accent-border)",
                          borderRadius: "6px",
                          padding: "6px 14px",
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "var(--accent)",
                          cursor: "pointer"
                        }}
                      >
                        전체 프로젝트 보기 ({filteredProjects.length}개)
                      </button>
                    </td>
                  </tr>
                ) : (
                  tableProjects.map(p => {
                    const mp = p.manpower;
                    const { pDepts, pRangeTotal } = getProjectRangeData(p);
                    const pTotalManday = getProjectTotalManday(p);

                    const effectiveTotal = pTotalManday > 0 ? pTotalManday : (pRangeTotal > 0 ? pRangeTotal : 0);
                    const progressRate = effectiveTotal > 0 && pRangeTotal > 0 ? Math.round((pRangeTotal / effectiveTotal) * 100) : 0;

                    return (
                      <tr key={p.id}>
                        <td><b>{normalizeJVName(p.manufacturingNo) || "-"}</b></td>
                        <td>{normalizeJVName(p.site) || "-"} {p.line ? `· Line ${normalizeJVName(p.line)}` : ""}</td>
                        <td>
                          <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{normalizeJVName(p.name)}</div>
                          {effectiveTotal > 0 ? (
                            <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
                              프로젝트 총 계획공수: <b style={{ color: "var(--success)" }}>{effectiveTotal.toLocaleString()} M/D</b>
                            </div>
                          ) : (
                            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                              계획공수 미등록
                            </div>
                          )}
                        </td>
                        {activeDeptKeys.map(k => (
                          <td key={k} style={{ textAlign: "center" }}>{pDepts[k] ? `${pDepts[k]}명` : "-"}</td>
                        ))}
                        <td style={{ textAlign: "center" }}>
                          <span style={{ fontWeight: "bold", color: pRangeTotal > 0 ? "var(--text-primary)" : "var(--text-muted)", fontSize: "14px" }}>
                            {pRangeTotal > 0 ? `${pRangeTotal.toLocaleString()} M/D` : "-"}
                          </span>
                        </td>
                        <td style={{ textAlign: "center", background: "var(--bg-card-subtle)" }}>
                          {effectiveTotal > 0 ? (
                            <div>
                              <span style={{ fontWeight: "800", color: "var(--text-primary)", fontSize: "14px" }}>
                                {effectiveTotal.toLocaleString()} M/D
                              </span>
                              {pRangeTotal > 0 && (
                                <div style={{ fontSize: "11px", color: "var(--success)", fontWeight: 600, marginTop: "1px" }}>
                                  {viewMode === "range" ? "기간" : "당월"} {progressRate}%
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>-</span>
                          )}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <button
                            onClick={() => {
                              if (!canViewDetail) return notifyPermission("공수 상세 조회");
                              if (onSelectProject) onSelectProject(p);
                              setSelectedProjectForDetail(p);
                            }}
                            style={{
                              background: !canViewDetail ? "var(--bg-card-subtle)" : (mp ? "var(--accent-muted)" : "var(--bg-card-subtle)"),
                              color: !canViewDetail ? "var(--text-muted)" : (mp ? "var(--accent)" : "var(--text-secondary)"),
                              border: !canViewDetail ? "1px solid var(--border-subtle)" : (mp ? "1px solid var(--accent-border)" : "1px solid var(--border-subtle)"),
                              borderRadius: "6px",
                              padding: "4px 8px",
                              fontSize: "11px",
                              fontWeight: "bold",
                              cursor: "pointer"
                            }}
                            title={!canViewDetail ? "공수 상세 확인은 Grade 2 이상 권한이 필요합니다 (클릭 시 권한 안내)" : "프로젝트 공수 상세 내역을 확인합니다"}
                          >
                            {mp ? "공수 상세" : "공수 조회"} {!canViewDetail && "🔒"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {tableProjects.length > 0 && (
                <tfoot>
                  <tr style={{ background: "var(--bg-card-subtle)", fontWeight: "bold", borderTop: "2px solid var(--border-subtle)" }}>
                    <td colSpan={3} style={{ textAlign: "center", padding: "10px" }}>
                      {viewMode === "range" ? "지정 기간 합산" : "당월 합산"}
                    </td>
                    {activeDeptKeys.map(k => (
                      <td key={k} style={{ textAlign: "center" }}>{deptTotals[k] > 0 ? `${deptTotals[k]} M/D` : "-"}</td>
                    ))}
                    <td style={{ textAlign: "center", color: "var(--accent)", fontSize: "14px" }}>
                      {periodTotalManday > 0 ? `${periodTotalManday.toLocaleString()} M/D` : "-"}
                    </td>
                    <td style={{ textAlign: "center", color: "var(--text-primary)", fontSize: "14px", background: "var(--border-faint)" }}>
                      {tableProjects.reduce((sum, p) => sum + getProjectTotalManday(p), 0).toLocaleString()} M/D
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        ) : (
          <div
            onClick={() => toggleSection('table')}
            style={{
              padding: '12px 16px',
              background: 'var(--bg-card-subtle)',
              border: '1px dashed var(--border-subtle)',
              borderRadius: '8px',
              textAlign: 'center',
              color: '#64748b',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            🏢 프로젝트별 계획공수 현황 표 ({tableProjects.length}건{onlyActiveProjectsInMonth && ` / 전체 ${filteredProjects.length}건`})가 접혀 있습니다. (클릭하여 펼치기 ▾)
          </div>
        )}
      </div>
      )}

      {/* Comparison Section: 계획공수 vs 실투입공수 비교분석 (일보 연동) */}
      {(activeSection === 'all' || activeSection === 'comparison') && (
      <div className="mp-table-section" style={{ marginTop: "24px" }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⚖️</span> 계획공수 vs 실투입공수 비교분석
                <span style={{ fontSize: '12px', background: 'var(--accent-muted)', color: 'var(--accent)', padding: '3px 10px', borderRadius: '12px', fontWeight: 600, border: '1px solid var(--accent-border)' }}>
                  일보 연동
                </span>
              </h3>
              <button
                type="button"
                onClick={() => toggleSection('comparison')}
                style={{
                  background: collapsedSections.comparison ? 'var(--accent)' : 'var(--bg-card-subtle)',
                  color: collapsedSections.comparison ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '4px',
                  padding: '3px 10px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                {collapsedSections.comparison ? '▸ 펼치기' : '▾ 접기'}
              </button>
            </div>
            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              * 프로젝트 마스터플랜의 계획 공수와 [이슈 통합관리]에 등록된 일자별 공사일보 실투입 공수를 비교 분석합니다.
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={loadDailyReports}
              disabled={isLoadingReports}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'var(--text-primary)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontWeight: 500
              }}
              title="이슈 통합관리의 최신 일보 데이터를 다시 불러옵니다"
            >
              {isLoadingReports ? "⏳ 로딩 중..." : "🔄 일보 새로고침"}
            </button>
            <button
              type="button"
              className="excel-export-btn"
              onClick={exportComparisonExcel}
              title="비교분석 요약 및 일자별 상세 내역을 엑셀로 다운로드합니다"
            >
              📥 비교분석 엑셀 다운로드
            </button>
          </div>
        </div>

        {!collapsedSections.comparison ? (
          <div>
            {/* 1. 🏢 프로젝트별 계획 vs 실투입 비교 목록 */}
            <div style={{ marginBottom: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>🏢</span> 프로젝트별 계획 vs 실투입 비교 목록
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'normal' }}>({filteredCompData.length}건)</span>
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                  {/* 연도 탭 필터 바 */}
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: 'var(--bg-card-subtle)', padding: '2px 4px', borderRadius: '14px', border: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)', marginLeft: '4px', marginRight: '2px' }}>📅 연도:</span>
                    <button
                      type="button"
                      onClick={() => setCompYearFilter("ALL")}
                      style={{
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontSize: '11px',
                        fontWeight: compYearFilter === "ALL" ? 'bold' : 'normal',
                        background: compYearFilter === "ALL" ? 'var(--accent)' : 'transparent',
                        color: compYearFilter === "ALL" ? '#fff' : 'var(--text-secondary)',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      전체
                    </button>
                    {(availableYears && availableYears.length > 0 ? availableYears : [String(new Date().getFullYear())]).map(yr => (
                      <button
                        key={yr}
                        type="button"
                        onClick={() => setCompYearFilter(yr)}
                        style={{
                          padding: '2px 8px',
                          borderRadius: '10px',
                          fontSize: '11px',
                          fontWeight: compYearFilter === yr ? 'bold' : 'normal',
                          background: compYearFilter === yr ? 'var(--accent)' : 'transparent',
                          color: compYearFilter === yr ? '#fff' : 'var(--text-secondary)',
                          border: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        {yr}년
                      </button>
                    ))}
                  </div>

                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={onlyReported}
                      onChange={e => setOnlyReported(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    공수/일보 등록된 건만 보기
                  </label>
                  <select
                    value={compSort}
                    onChange={e => setCompSort(e.target.value)}
                    style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid var(--border-subtle)', borderRadius: '6px', background: 'var(--input-bg)', color: 'var(--input-text)' }}
                  >
                    <option value="diffDesc">초과 공수 많은 순 (가감 ▲)</option>
                    <option value="diffAsc">잔여 공수 많은 순 (가감 ▼)</option>
                    <option value="actualDesc">실투입 공수 많은 순</option>
                    <option value="planDesc">계획 공수 많은 순</option>
                    <option value="rateDesc">소진율 높은 순 (%)</option>
                    <option value="reportsDesc">등록 일보 많은 순</option>
                    <option value="nameAsc">프로젝트명 순</option>
                  </select>
                  <input
                    type="text"
                    placeholder="프로젝트, 제조번호 검색..."
                    value={compSearch}
                    onChange={e => setCompSearch(e.target.value)}
                    style={{ padding: '4px 10px', fontSize: '12px', border: '1px solid var(--border-subtle)', borderRadius: '6px', width: '160px' }}
                  />
                </div>
              </div>

              <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '8px', background: 'var(--bg-card)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-card-subtle)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>
                      <th style={{ padding: '9px 12px', textAlign: 'left', whiteSpace: 'nowrap' }}>제조번호</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', whiteSpace: 'nowrap' }}>Site · Line</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left' }}>프로젝트명</th>
                      <th style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>계획 공수</th>
                      <th style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--success)' }}>실투입 공수</th>
                      <th style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>가감 / 차이</th>
                      <th style={{ padding: '9px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>소진율</th>
                      <th style={{ padding: '9px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>일보 건수</th>
                      <th style={{ padding: '9px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>분석 선택</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCompData.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          조건에 일치하는 프로젝트가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      filteredCompData.map(item => {
                        const isOver = item.totalDiff > 0;
                        const isUnder = item.totalDiff < 0;
                        const isSelected = selectedProjectComp?.projectId === item.projectId;

                        return (
                          <tr
                            key={item.projectId}
                            onClick={() => setSelectedCompProject(item.projectId)}
                            style={{
                              borderBottom: '1px solid var(--border-faint)',
                              background: isSelected 
                                ? 'var(--accent-muted)' 
                                : (isOver ? 'rgba(239, 68, 68, 0.06)' : 'var(--bg-card)'),
                              cursor: 'pointer',
                              transition: 'background 0.15s'
                            }}
                          >
                            <td style={{ padding: '9px 12px', fontWeight: 'bold', color: isSelected ? 'var(--accent)' : 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                              {normalizeJVName(item.manufacturingNo) || "-"}
                            </td>
                            <td style={{ padding: '9px 12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                              {normalizeJVName(item.site) || "-"} {item.line ? `· ${normalizeJVName(item.line)}` : ""}
                            </td>
                            <td style={{ padding: '9px 12px' }}>
                              <span style={{ fontWeight: 600, color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}>
                                {normalizeJVName(item.projectName)}
                              </span>
                            </td>
                            <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                              {item.planTotal > 0 ? `${item.planTotal.toLocaleString()} M/D` : "-"}
                            </td>
                            <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 'bold', color: item.actualTotal > 0 ? 'var(--success)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                              {item.actualTotal > 0 ? `${item.actualTotal.toLocaleString()} M/D` : "-"}
                            </td>
                            <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <span style={{
                                fontSize: '11px',
                                fontWeight: 'bold',
                                color: isOver ? 'var(--danger)' : isUnder ? 'var(--success)' : 'var(--text-secondary)',
                                background: isOver ? 'var(--danger-muted)' : isUnder ? 'var(--success-muted)' : 'var(--bg-card-subtle)',
                                border: `1px solid ${isOver ? 'rgba(239,68,68,0.25)' : isUnder ? 'rgba(16,185,129,0.25)' : 'var(--border-subtle)'}`,
                                padding: '2px 6px',
                                borderRadius: '4px'
                              }}>
                                {isOver ? `+${item.totalDiff}` : item.totalDiff} M/D
                              </span>
                            </td>
                            <td style={{ padding: '9px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                              {item.planTotal > 0 ? (
                                <div style={{ display: 'inline-block', width: '80px' }}>
                                  <div style={{ fontSize: '11px', fontWeight: 'bold', color: item.totalRate > 100 ? 'var(--danger)' : 'var(--text-primary)', marginBottom: '2px' }}>
                                    {item.totalRate.toFixed(1)}%
                                  </div>
                                  <div style={{ background: 'var(--border-subtle)', borderRadius: '3px', height: '4px', overflow: 'hidden' }}>
                                    <div style={{
                                      width: `${Math.min(100, item.totalRate)}%`,
                                      height: '100%',
                                      background: item.totalRate > 100 ? 'var(--danger)' : item.totalRate > 80 ? 'var(--warning)' : 'var(--success)'
                                    }} />
                                  </div>
                                </div>
                              ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>-</span>
                              )}
                            </td>
                            <td style={{ padding: '9px 12px', textAlign: 'center', color: item.reportCount > 0 ? 'var(--text-primary)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                              {item.reportCount > 0 ? `${item.reportCount}건` : "-"}
                            </td>
                            <td style={{ padding: '9px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setSelectedCompProject(item.projectId); }}
                                style={{
                                  padding: '3px 8px',
                                  fontSize: '11px',
                                  background: isSelected ? 'var(--accent)' : 'var(--bg-card-subtle)',
                                  color: isSelected ? '#fff' : 'var(--text-secondary)',
                                  border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontWeight: 600
                                }}
                              >
                                {isSelected ? "✓ 선택됨" : "상세 분석"}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 2. 선택된 프로젝트 상세 공수 분석 영역 */}
            {selectedProjectComp && (
              <div style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '16px', marginTop: '10px' }}>
                {/* 프로젝트 선택 및 제목 바 */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '14px',
                  flexWrap: 'wrap',
                  gap: '10px',
                  background: 'var(--bg-card)',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-faint)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                      🔍 프로젝트 공수 상세 분석:
                    </span>
                    <SmartProjectSelector
                      projects={compProjectPool}
                      selectedProjectId={selectedCompProject}
                      onSelectProject={(id) => setSelectedCompProject(id)}
                      compact={true}
                      placeholder="분석할 프로젝트를 검색하세요..."
                      style={{ minWidth: '280px', maxWidth: '420px' }}
                    />
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Site: <b>{selectedProjectComp.site || "-"}</b> | Line: <b>{selectedProjectComp.line || "-"}</b> | 등록 일보: <b style={{ color: 'var(--success)' }}>{selectedProjectComp.reportCount}건</b>
                  </div>
                </div>

                {/* 4 KPI Cards */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '12px',
                  marginBottom: '16px'
                }}>
                  {/* 총 계획 공수 */}
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderLeft: '4px solid #0284c7', borderRadius: '8px', padding: '12px 16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>📌</span> 총 계획 공수
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: '4px 0' }}>
                      {selectedProjectComp.planTotal.toLocaleString()} <span style={{ fontSize: '13px', fontWeight: 'normal', color: 'var(--text-tertiary)' }}>M/D</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      프로젝트 마스터플랜 기준
                    </div>
                  </div>

                  {/* 총 실투입 공수 */}
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderLeft: '4px solid #10b981', borderRadius: '8px', padding: '12px 16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>⏱️</span> 총 실투입 공수
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--success)', margin: '4px 0' }}>
                      {selectedProjectComp.actualTotal.toLocaleString()} <span style={{ fontSize: '13px', fontWeight: 'normal', color: 'var(--text-tertiary)' }}>M/D</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      이슈 통합관리 등록 일보 <b>{selectedProjectComp.reportCount}건</b> 합산
                    </div>
                  </div>

                  {/* 가감 / 차이 */}
                  <div style={{
                    background: selectedProjectComp.totalDiff > 0 ? 'var(--danger-muted)' : selectedProjectComp.totalDiff < 0 ? 'var(--success-muted)' : 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    borderLeft: `4px solid ${selectedProjectComp.totalDiff > 0 ? 'var(--danger)' : selectedProjectComp.totalDiff < 0 ? 'var(--success)' : 'var(--text-muted)'}`,
                    borderRadius: '8px',
                    padding: '12px 16px'
                  }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>⚖️</span> 가감 / 차이 (실투입 - 계획)
                    </div>
                    <div style={{
                      fontSize: '22px',
                      fontWeight: 800,
                      color: selectedProjectComp.totalDiff > 0 ? 'var(--danger)' : selectedProjectComp.totalDiff < 0 ? 'var(--success)' : 'var(--text-primary)',
                      margin: '4px 0'
                    }}>
                      {selectedProjectComp.totalDiff > 0 ? `+${selectedProjectComp.totalDiff.toLocaleString()}` : selectedProjectComp.totalDiff.toLocaleString()} <span style={{ fontSize: '13px', fontWeight: 'normal' }}>M/D</span>
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: selectedProjectComp.totalDiff > 0 ? 'var(--danger)' : selectedProjectComp.totalDiff < 0 ? 'var(--success)' : 'var(--text-secondary)' }}>
                      {selectedProjectComp.totalDiff > 0
                        ? `⚠️ 계획 대비 ${selectedProjectComp.totalDiff.toLocaleString()} M/D 초과 투입`
                        : selectedProjectComp.totalDiff < 0
                          ? `✨ 계획 대비 ${Math.abs(selectedProjectComp.totalDiff).toLocaleString()} M/D 절감 (잔여)`
                          : "계획 공수와 정확히 일치"}
                    </div>
                  </div>

                  {/* 소진율 */}
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderLeft: '4px solid #f59e0b', borderRadius: '8px', padding: '12px 16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>📊</span> 공수 소진율
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: selectedProjectComp.totalRate > 100 ? 'var(--danger)' : 'var(--warning)', margin: '4px 0' }}>
                      {selectedProjectComp.planTotal > 0 ? `${selectedProjectComp.totalRate.toFixed(1)}%` : "-"}
                    </div>
                    <div style={{ background: 'var(--border-faint)', borderRadius: '4px', height: '6px', overflow: 'hidden', margin: '6px 0 2px' }}>
                      <div style={{
                        width: `${Math.min(100, selectedProjectComp.totalRate)}%`,
                        height: '100%',
                        background: selectedProjectComp.totalRate > 100 ? 'var(--danger)' : selectedProjectComp.totalRate > 80 ? 'var(--warning)' : 'var(--success)'
                      }} />
                    </div>
                  </div>
                </div>

                {/* 👥 부서별 계획공수 vs 실투입공수 비교 */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '14px 16px', marginBottom: '16px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 'bold', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>👥</span> 부서별 계획공수 vs 실투입공수 비교
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
                    {selectedProjectComp.deptList.map(dept => {
                      const isOver = dept.diff > 0;
                      const isUnder = dept.diff < 0;
                      return (
                        <div key={dept.key} style={{
                          background: 'var(--bg-card-subtle)',
                          border: '1px solid var(--border-subtle)',
                          borderLeft: `4px solid ${dept.color}`,
                          borderRadius: '6px',
                          padding: '10px 12px'
                        }}>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
                            {dept.name}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-secondary)' }}>
                            <span>계획: <b style={{ color: 'var(--text-primary)' }}>{dept.plan.toLocaleString()}</b></span>
                            <span>실투입: <b style={{ color: dept.actual > 0 ? 'var(--success)' : 'var(--text-muted)' }}>{dept.actual.toLocaleString()}</b></span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed var(--border-subtle)' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>가감:</span>
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 'bold',
                              color: isOver ? 'var(--danger)' : isUnder ? 'var(--success)' : 'var(--text-secondary)'
                            }}>
                              {isOver ? `+${dept.diff}` : dept.diff} M/D
                              {dept.plan > 0 && ` (${dept.rate.toFixed(0)}%)`}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 📅 일자별 실투입 내역 테이블 */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 'bold', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>📅</span> [{normalizeJVName(selectedProjectComp.projectName)}] 일자별 실투입 내역 ({selectedProjectComp.reports.length}일치 일보)
                    </h4>
                    {selectedProjectComp.reports.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const allOpen = selectedProjectComp.reports.every((r, idx) => expandedCompReports[r.id || r.report_date || idx]);
                          const next = {};
                          if (!allOpen) {
                            selectedProjectComp.reports.forEach((r, idx) => {
                              next[r.id || r.report_date || idx] = true;
                            });
                          }
                          setExpandedCompReports(next);
                        }}
                        style={{
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '6px',
                          padding: '4px 10px',
                          fontSize: '11px',
                          fontWeight: 600,
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                        title="전체 일자의 작업내용을 한꺼번에 펼치거나 접습니다"
                      >
                        {selectedProjectComp.reports.every((r, idx) => expandedCompReports[r.id || r.report_date || idx])
                          ? '증원 부서 작업내용 전체 접기 ▴'
                          : '증원 부서 작업내용 전체 펼치기 ▾'}
                      </button>
                    )}
                  </div>

                  {selectedProjectComp.reports.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', background: 'var(--bg-card)', borderRadius: '8px', border: '1px dashed var(--border-subtle)' }}>
                      등록된 공사일보가 없습니다. [이슈 통합관리] 메뉴에서 일보를 등록하면 실투입 공수가 자동으로 집계됩니다.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto', border: '1px solid var(--border-faint)', borderRadius: '8px', background: 'var(--bg-card)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg-card-subtle)', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)' }}>
                            <th style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap', width: '95px' }}>보고일자</th>
                            <th style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap', width: '85px', color: '#10b981' }}>당일 총원</th>
                            <th style={{ padding: '10px 8px', textAlign: 'center', whiteSpace: 'nowrap', width: '65px', minWidth: '65px', maxWidth: '65px' }}>소장</th>
                            <th style={{ padding: '10px 8px', textAlign: 'center', whiteSpace: 'nowrap', width: '65px', minWidth: '65px', maxWidth: '65px' }}>기구</th>
                            <th style={{ padding: '10px 8px', textAlign: 'center', whiteSpace: 'nowrap', width: '65px', minWidth: '65px', maxWidth: '65px' }}>제어</th>
                            <th style={{ padding: '10px 8px', textAlign: 'center', whiteSpace: 'nowrap', width: '65px', minWidth: '65px', maxWidth: '65px' }}>전장</th>
                            <th style={{ padding: '10px 8px', textAlign: 'center', whiteSpace: 'nowrap', width: '65px', minWidth: '65px', maxWidth: '65px' }}>비전</th>
                            <th style={{ padding: '10px 12px', textAlign: 'left', minWidth: '320px' }}>비고 (인력 변동 및 주요 사유)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedProjectComp.reports.map((r, rIdx) => {
                            const pm = Number(r.pm_count) || 0;
                            const fac = Number(r.facility_count) || 0;
                            const facSub = Number(r.facility_outsource) || 0;
                            const ctrl = Number(r.control_count) || 0;
                            const ctrlSub = Number(r.control_outsource) || 0;
                            const elec = Number(r.electrical_count) || 0;
                            const elecSub = Number(r.electrical_outsource) || 0;
                            const vis = Number(r.vision_count) || 0;
                            const visSub = Number(r.vision_outsource) || 0;
                            const safety = Number(r.personnel_count) || 0;
                            const customSum = Object.values(r.custom_depts || {}).reduce((a, b) => a + (Number(b) || 0), 0);
                            const dayTotal = pm + fac + facSub + ctrl + ctrlSub + elec + elecSub + vis + visSub + safety + customSum;

                            const reasonInfo = getManpowerChangeReason(r, selectedProjectComp.reports, rIdx, selectedProjectComp.project);
                            const { deltaBadge, deptChanges, milestone } = reasonInfo;
                            const rowKey = r.id || r.report_date || rIdx;
                            const isExpanded = Boolean(expandedCompReports[rowKey]);

                            return (
                              <tr key={rowKey} style={{ borderBottom: '1px solid var(--bg-card-subtle)' }}>
                                <td style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 'bold', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                  {r.report_date}
                                </td>
                                <td style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 'bold', color: '#10b981', background: 'var(--success-muted)', whiteSpace: 'nowrap' }}>
                                  {dayTotal}명
                                </td>
                                <td style={{ padding: '9px 8px', textAlign: 'center', color: pm > 0 ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: pm > 0 ? 600 : 'normal', whiteSpace: 'nowrap', width: '70px' }}>
                                  {pm > 0 ? `${pm}명` : "-"}
                                </td>
                                <td style={{ padding: '9px 8px', textAlign: 'center', color: fac > 0 ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: fac > 0 ? 600 : 'normal', whiteSpace: 'nowrap', width: '70px' }}>
                                  {fac > 0 ? `${fac}명` : "-"}
                                </td>
                                <td style={{ padding: '9px 8px', textAlign: 'center', color: ctrl > 0 ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: ctrl > 0 ? 600 : 'normal', whiteSpace: 'nowrap', width: '65px' }}>
                                  {ctrl > 0 ? `${ctrl}명` : "-"}
                                </td>
                                <td style={{ padding: '9px 8px', textAlign: 'center', color: elec > 0 ? '#f59e0b' : 'var(--text-muted)', fontWeight: elec > 0 ? 600 : 'normal', whiteSpace: 'nowrap', width: '65px' }}>
                                  {elec > 0 ? `${elec}명` : "-"}
                                </td>
                                <td style={{ padding: '9px 8px', textAlign: 'center', color: vis > 0 ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: vis > 0 ? 600 : 'normal', whiteSpace: 'nowrap', width: '65px' }}>
                                  {vis > 0 ? `${vis}명` : "-"}
                                </td>
                                <td style={{ padding: '8px 12px', textAlign: 'left', verticalAlign: 'middle' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                    {/* 1. 상단 라인: 마일스톤 -> 증감인원 -> 부서별 증감인원 (+작업내용 토글 버튼) */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                      {milestone && (
                                        <span style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '3px',
                                          padding: '2px 7px',
                                          borderRadius: '4px',
                                          fontSize: '11px',
                                          fontWeight: 700,
                                          color: '#0369a1',
                                          background: '#e0f2fe',
                                          border: '1px solid #bae6fd',
                                          whiteSpace: 'nowrap'
                                        }} title="마스터플랜 마일스톤">
                                          🚩 {milestone}
                                        </span>
                                      )}
                                      {deltaBadge && (
                                        <span style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '3px',
                                          padding: '2px 7px',
                                          borderRadius: '4px',
                                          fontSize: '11px',
                                          fontWeight: 700,
                                          color: deltaBadge.color,
                                          background: deltaBadge.bg,
                                          border: `1px solid ${deltaBadge.color}33`,
                                          whiteSpace: 'nowrap'
                                        }}>
                                          {deltaBadge.text}
                                        </span>
                                      )}
                                      {deptChanges && deptChanges.length > 0 && (
                                        <span style={{
                                          fontSize: '11px',
                                          color: 'var(--text-primary)',
                                          fontWeight: 700,
                                          background: 'var(--bg-card-subtle)',
                                          border: '1px solid var(--border-subtle)',
                                          padding: '2px 6px',
                                          borderRadius: '4px',
                                          whiteSpace: 'nowrap'
                                        }}>
                                          ({deptChanges.join(', ')})
                                        </span>
                                      )}

                                      {/* 증원 사유 등 표시할 작업내용이 있는 경우 접기/펼치기 버튼 노출 (기본: 접힘) */}
                                      {reasonInfo.hasWorkContent && (
                                        <button
                                          type="button"
                                          onClick={() => setExpandedCompReports(prev => ({ ...prev, [rowKey]: !prev[rowKey] }))}
                                          style={{
                                            background: isExpanded ? 'var(--accent-muted)' : 'var(--bg-card-subtle)',
                                            border: isExpanded ? '1px solid var(--accent-border)' : '1px solid var(--border-subtle)',
                                            borderRadius: '4px',
                                            padding: '1px 7px',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            color: isExpanded ? 'var(--accent)' : 'var(--text-secondary)',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '3px',
                                            whiteSpace: 'nowrap'
                                          }}
                                          title="클릭하여 상세 작업내용 펼치기/접기"
                                        >
                                          <span>📝 증원 부서 작업내용 {isExpanded ? '접기 ▴' : '보기 ▾'}</span>
                                        </button>
                                      )}
                                    </div>

                                    {/* 2. 하단 라인: 펼쳐졌을 때만 증원된 해당 부서 작업내용을 번호별/항목별로 깔끔하게 아래 배치 */}
                                    {isExpanded && reasonInfo.hasWorkContent && (
                                      <div style={{
                                        marginTop: '3px',
                                        background: 'var(--bg-card-subtle)',
                                        border: '1px solid var(--border-faint)',
                                        borderRadius: '6px',
                                        padding: '8px 10px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '6px'
                                      }}>
                                        {/* 증원된 부서별 작업내용 리스트 (라벨 아래에 항목 배치) */}
                                        {reasonInfo.deptWorkItems && reasonInfo.deptWorkItems.length > 0 && reasonInfo.deptWorkItems.map((dw, dwIdx) => (
                                          <div key={dwIdx} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                              <span style={{ background: 'var(--border-faint)', padding: '1px 6px', borderRadius: '3px' }}>
                                                [{dw.dept}]
                                              </span>
                                            </div>
                                            <div style={{ paddingLeft: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                              {dw.items.map((it, itIdx) => (
                                                <div key={itIdx} style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                                                  {dw.items.length > 1 && (
                                                    <span style={{ fontWeight: 600, color: 'var(--text-muted)', marginRight: '4px' }}>
                                                      {itIdx + 1}.
                                                    </span>
                                                  )}
                                                  {it}
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        ))}

                                        {/* 특이사항이 있는 경우 */}
                                        {reasonInfo.specialNote && (
                                          <div style={{ fontSize: '11.5px', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.12)', padding: '4px 8px', borderRadius: '4px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                                            <b>[특이사항]</b> {reasonInfo.specialNote}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            onClick={() => toggleSection('comparison')}
            style={{
              padding: '12px 16px',
              background: 'var(--bg-card-subtle)',
              border: '1px dashed var(--border-subtle)',
              borderRadius: '8px',
              textAlign: 'center',
              color: '#64748b',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            ⚖️ 계획공수 vs 실투입공수 비교분석 표 및 프로젝트별 상세 분석이 접혀 있습니다. (클릭하여 펼치기 ▾)
          </div>
        )}
      </div>
      )}

      {/* Day Detail Modal */}
      {selectedDay && (
        <div className="mp-modal-backdrop" onMouseDown={() => setSelectedDay(null)}>
          <div className="mp-modal-card" onMouseDown={e => e.stopPropagation()}>
            <div className="mp-modal-head">
              <div>
                <h3>📅 {selectedDay.dateStr} 일일 전사 공수 현황</h3>
                <p>당일 총 투입 인원: <b style={{ color: "#dc2626", fontSize: "16px" }}>{selectedDay.total}명</b> (진행 프로젝트 {selectedDay.projectBreakdown.length}개)</p>
              </div>
              <button className="mp-close-btn" onClick={() => setSelectedDay(null)}>×</button>
            </div>

            {/* Department mini cards for the day */}
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {Object.entries(selectedDay.departments).map(([dKey, cnt]) => (
                <div key={dKey} style={{ background: "var(--bg-card-subtle)", border: `1px solid var(--border-faint)`, borderLeft: `4px solid ${getDeptColor(dKey)}`, borderRadius: "8px", padding: "8px 14px", minWidth: "120px" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: "bold" }}>{getDeptLabel(dKey)}</div>
                  <div style={{ fontSize: "16px", fontWeight: "bold", color: "var(--text-primary)" }}>{cnt}명</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: "10px" }}>
              <h4 style={{ margin: "0 0 10px 0", fontSize: "14px", color: "var(--text-primary)" }}>당일 프로젝트별 인력 투입 상세</h4>
              <table className="mp-table">
                <thead>
                  <tr>
                    <th>제조번호</th>
                    <th>Site / Line</th>
                    <th>프로젝트명</th>
                    {activeDeptKeys.map(k => (
                      <th key={k} style={{ textAlign: "center" }}>{getDeptShort(k)}</th>
                    ))}
                    <th style={{ textAlign: "center" }}>당일 총원</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedDay.projectBreakdown.length === 0 ? (
                    <tr><td colSpan={4 + activeDeptKeys.length} style={{ textAlign: "center", padding: "20px", color: "#94a3b8" }}>당일 투입된 프로젝트 공수가 없습니다.</td></tr>
                  ) : (
                    selectedDay.projectBreakdown.map((pb, pIdx) => (
                      <tr key={pIdx}>
                        <td><b>{normalizeJVName(pb.manufacturingNo) || "-"}</b></td>
                        <td>{normalizeJVName(pb.site) || "-"} · {normalizeJVName(pb.line) || "-"}</td>
                        <td><b style={{ color: "var(--text-primary)" }}>{normalizeJVName(pb.name)}</b></td>
                        {activeDeptKeys.map(k => (
                          <td key={k} style={{ textAlign: "center" }}>{pb.departments?.[k] || "-"}</td>
                        ))}
                        <td style={{ textAlign: "center", fontWeight: "bold", color: "#dc2626" }}>{pb.total}명</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <button
              onClick={() => setSelectedDay(null)}
              style={{ padding: "10px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", marginTop: "10px" }}
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* Project Detail Modal */}
      {selectedProjectForDetail && canViewDetail && (
        <ProjectManpowerModal
          project={selectedProjectForDetail}
          onClose={() => setSelectedProjectForDetail(null)}
        />
      )}
    </div>
  );
}

// Individual Project Manpower Modal component (also exported for use in Project List!)
export function ProjectManpowerModal({ project, onClose }) {
  const mp = project.manpower;

  // Calculate full continuous date range for the project & active manpower days
  const { fullDates, activeDaysCount } = useMemo(() => {
    let start = project.startDate || "";
    let end = project.endDate || "";

    // Include milestone dates if they extend the project range
    (project.milestones || []).forEach(m => {
      if (m.startDate && (!start || m.startDate < start)) start = m.startDate;
      if (m.endDate && (!end || m.endDate > end)) end = m.endDate;
    });

    // Check manpower dates
    const mpDateSet = new Set();
    if (mp) {
      if (mp.dailyTotal) {
        Object.entries(mp.dailyTotal).forEach(([d, v]) => {
          if (Number(v) > 0) mpDateSet.add(d);
          if (!start || d < start) start = d;
          if (!end || d > end) end = d;
        });
      }
      if (mp.departments) {
        Object.values(mp.departments).forEach(dData => {
          if (dData?.daily) {
            Object.entries(dData.daily).forEach(([d, v]) => {
              if (Number(v) > 0) mpDateSet.add(d);
              if (!start || d < start) start = d;
              if (!end || d > end) end = d;
            });
          }
        });
      }
    }

    const activeDays = mpDateSet.size;

    if (!start || !end) {
      const dates = Array.from(mpDateSet).sort();
      return { fullDates: dates, activeDaysCount: activeDays };
    }

    const dates = [];
    const cur = new Date(start + "T00:00:00");
    const last = new Date(end + "T00:00:00");

    if (isNaN(cur.getTime()) || isNaN(last.getTime()) || cur > last) {
      return { fullDates: Array.from(mpDateSet).sort(), activeDaysCount: activeDays };
    }

    let count = 0;
    while (cur <= last && count < 1000) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, "0");
      const d = String(cur.getDate()).padStart(2, "0");
      dates.push(`${y}-${m}-${d}`);
      cur.setDate(cur.getDate() + 1);
      count++;
    }

    return { fullDates: dates, activeDaysCount: activeDays };
  }, [project.startDate, project.endDate, project.milestones, mp]);

  // Sorted department list matching company standard order
  const sortedDepts = useMemo(() => {
    if (!mp?.departments) return [];
    return Object.entries(mp.departments).sort(([a], [b]) => {
      const idxA = BASE_DEPT_ORDER.indexOf(normalizeDeptKey(a));
      const idxB = BASE_DEPT_ORDER.indexOf(normalizeDeptKey(b));
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });
  }, [mp]);

  // Export clean formatted Excel sheet matching the UI layout
  const handleExportExcel = async () => {
    if (!mp) return;

    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = "TW Project Manager";
      wb.created = new Date();

      const mfgNo = project.manufacturingNo ? normalizeJVName(project.manufacturingNo) : "";
      const projName = normalizeJVName(project.name || project.equipment || "Project");
      const sheetTitle = (mfgNo ? `${mfgNo}_` : "") + projName.slice(0, 20);

      const ws = wb.addWorksheet(sheetTitle.replace(/[\\/*?:[\]]/g, "_"), {
        views: [{ showGridLines: true }]
      });

      const totalCols = Math.max(8, sortedDepts.length + 2);

      // 1. Title
      ws.mergeCells(1, 1, 1, totalCols);
      const titleCell = ws.getCell("A1");
      titleCell.value = `📊 ${mfgNo ? `${mfgNo} · ` : ""}${projName} 공수 투입 현황`;
      titleCell.font = { name: "Malgun Gothic", size: 15, bold: true, color: { argb: "FF0F172A" } };
      titleCell.alignment = { vertical: "middle", horizontal: "left" };
      ws.getRow(1).height = 32;

      // 2. Subtitle
      ws.mergeCells(2, 1, 2, totalCols);
      const subCell = ws.getCell("A2");
      const siteStr = normalizeJVName(project.site) || "-";
      const lineStr = normalizeJVName(project.line) || "-";
      const pStart = fullDates[0] || project.startDate || "-";
      const pEnd = fullDates[fullDates.length - 1] || project.endDate || "-";
      subCell.value = `${siteStr} · Line ${lineStr}  |  기간: ${pStart} ~ ${pEnd}`;
      subCell.font = { name: "Malgun Gothic", size: 10, color: { argb: "FF64748B" } };
      subCell.alignment = { vertical: "middle", horizontal: "left" };
      ws.getRow(2).height = 20;

      // Spacing
      ws.getRow(3).height = 10;

      const thinBorder = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } }
      };

      // 3. KPI Cards Section
      // Card 1: 총 투입 공수 (Total Manday) - Cols A..B
      ws.mergeCells(4, 1, 4, 2);
      const k1Head = ws.getCell(4, 1);
      k1Head.value = "총 투입 공수 (Total Manday)";
      k1Head.font = { name: "Malgun Gothic", size: 9.5, bold: true, color: { argb: "FF166534" } };
      k1Head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
      k1Head.alignment = { vertical: "middle", horizontal: "center" };

      ws.mergeCells(5, 1, 5, 2);
      const k1Val = ws.getCell(5, 1);
      k1Val.value = `${mp.totalManday || 0} M/D`;
      k1Val.font = { name: "Malgun Gothic", size: 15, bold: true, color: { argb: "FF15803D" } };
      k1Val.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
      k1Val.alignment = { vertical: "middle", horizontal: "center" };

      // Card 2: 일일 피크 인원 (Daily Peak) - Cols C..D
      ws.mergeCells(4, 3, 4, 4);
      const k2Head = ws.getCell(4, 3);
      k2Head.value = "일일 피크 인원 (Daily Peak)";
      k2Head.font = { name: "Malgun Gothic", size: 9.5, bold: true, color: { argb: "FF991B1B" } };
      k2Head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF2F2" } };
      k2Head.alignment = { vertical: "middle", horizontal: "center" };

      ws.mergeCells(5, 3, 5, 4);
      const k2Val = ws.getCell(5, 3);
      k2Val.value = `${mp.dailyPeak || 0} 명`;
      k2Val.font = { name: "Malgun Gothic", size: 15, bold: true, color: { argb: "FFDC2626" } };
      k2Val.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF2F2" } };
      k2Val.alignment = { vertical: "middle", horizontal: "center" };

      // Card 3: 공수 투입 일수 - Cols E..F
      ws.mergeCells(4, 5, 4, 6);
      const k3Head = ws.getCell(4, 5);
      k3Head.value = "공수 투입 일수";
      k3Head.font = { name: "Malgun Gothic", size: 9.5, bold: true, color: { argb: "FF1E40AF" } };
      k3Head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
      k3Head.alignment = { vertical: "middle", horizontal: "center" };

      ws.mergeCells(5, 5, 5, 6);
      const k3Val = ws.getCell(5, 5);
      k3Val.value = `${activeDaysCount} 일`;
      k3Val.font = { name: "Malgun Gothic", size: 15, bold: true, color: { argb: "FF2563EB" } };
      k3Val.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
      k3Val.alignment = { vertical: "middle", horizontal: "center" };

      for (let r = 4; r <= 5; r++) {
        for (let c = 1; c <= 6; c++) {
          ws.getCell(r, c).border = thinBorder;
        }
      }
      ws.getRow(4).height = 22;
      ws.getRow(5).height = 28;

      // Spacing
      ws.getRow(6).height = 12;

      // 4. Department Summary
      let curRow = 7;
      ws.getCell(curRow, 1).value = "■ 부서별 투입 요약";
      ws.getCell(curRow, 1).font = { name: "Malgun Gothic", size: 11, bold: true, color: { argb: "FF334155" } };
      ws.getRow(curRow).height = 22;

      curRow++;
      const dHeaders = ["부서명 (Department)", "총 투입 공수 (Total)", "일일 피크 (Peak)"];
      const dHeadRow = ws.getRow(curRow);
      dHeaders.forEach((h, i) => {
        const c = dHeadRow.getCell(i + 1);
        c.value = h;
        c.font = { name: "Malgun Gothic", size: 10, bold: true, color: { argb: "FF1E293B" } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
        c.alignment = { vertical: "middle", horizontal: "center" };
        c.border = thinBorder;
      });
      dHeadRow.height = 22;

      sortedDepts.forEach(([rawD, dData]) => {
        curRow++;
        const norm = normalizeDeptKey(rawD);
        const r = ws.getRow(curRow);

        const c1 = r.getCell(1);
        c1.value = getDeptLabel(norm);
        c1.font = { name: "Malgun Gothic", size: 9.5, color: { argb: "FF0F172A" } };
        c1.alignment = { vertical: "middle", horizontal: "left" };
        c1.border = thinBorder;

        const c2 = r.getCell(2);
        c2.value = `${dData.total || 0} M/D`;
        c2.font = { name: "Malgun Gothic", size: 9.5, color: { argb: "FF0F172A" } };
        c2.alignment = { vertical: "middle", horizontal: "center" };
        c2.border = thinBorder;

        const c3 = r.getCell(3);
        c3.value = `${dData.peak || 0}명`;
        c3.font = { name: "Malgun Gothic", size: 9.5, color: { argb: "FFDC2626" } };
        c3.alignment = { vertical: "middle", horizontal: "center" };
        c3.border = thinBorder;
        r.height = 20;
      });

      // Summary Total Row
      curRow++;
      const totDRow = ws.getRow(curRow);
      totDRow.getCell(1).value = "합계 (Total)";
      totDRow.getCell(1).font = { name: "Malgun Gothic", size: 10, bold: true, color: { argb: "FF0F172A" } };
      totDRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      totDRow.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
      totDRow.getCell(1).border = thinBorder;

      totDRow.getCell(2).value = `${mp.totalManday || 0} M/D`;
      totDRow.getCell(2).font = { name: "Malgun Gothic", size: 10, bold: true, color: { argb: "FF15803D" } };
      totDRow.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      totDRow.getCell(2).alignment = { vertical: "middle", horizontal: "center" };
      totDRow.getCell(2).border = thinBorder;

      totDRow.getCell(3).value = `${mp.dailyPeak || 0}명`;
      totDRow.getCell(3).font = { name: "Malgun Gothic", size: 10, bold: true, color: { argb: "FFDC2626" } };
      totDRow.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      totDRow.getCell(3).alignment = { vertical: "middle", horizontal: "center" };
      totDRow.getCell(3).border = thinBorder;
      totDRow.height = 22;

      // Spacing
      curRow++;
      ws.getRow(curRow).height = 14;

      // 5. Daily Timeline Section
      curRow++;
      ws.getCell(curRow, 1).value = `■ 일자별 인력 투입 타임라인 (${pStart} ~ ${pEnd})`;
      ws.getCell(curRow, 1).font = { name: "Malgun Gothic", size: 11, bold: true, color: { argb: "FF334155" } };
      ws.getRow(curRow).height = 22;

      curRow++;
      const tHeadRow = ws.getRow(curRow);
      const timelineHeaders = ["날짜", ...sortedDepts.map(([dName]) => getDeptShort(normalizeDeptKey(dName))), "당일 합계"];
      timelineHeaders.forEach((th, cIdx) => {
        const c = tHeadRow.getCell(cIdx + 1);
        c.value = th;
        c.font = { name: "Malgun Gothic", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
        c.alignment = { vertical: "middle", horizontal: "center" };
        c.border = thinBorder;
      });
      tHeadRow.height = 24;

      fullDates.forEach(dateStr => {
        curRow++;
        const r = ws.getRow(curRow);

        const cDate = r.getCell(1);
        cDate.value = dateStr;
        cDate.font = { name: "Malgun Gothic", size: 9.5, color: { argb: "FF1E293B" } };
        cDate.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
        cDate.alignment = { vertical: "middle", horizontal: "center" };
        cDate.border = thinBorder;

        let daySum = 0;
        sortedDepts.forEach(([dName], dIdx) => {
          const v = mp.departments?.[dName]?.daily?.[dateStr] || 0;
          daySum += Number(v) || 0;
          const c = r.getCell(dIdx + 2);
          c.value = v > 0 ? v : "-";
          c.font = { name: "Malgun Gothic", size: 9.5, color: { argb: v > 0 ? "FF0F172A" : "FF94A3B8" } };
          c.alignment = { vertical: "middle", horizontal: "center" };
          c.border = thinBorder;
        });

        const total = mp.dailyTotal?.[dateStr] !== undefined ? mp.dailyTotal[dateStr] : daySum;
        const isPeak = total === mp.dailyPeak && mp.dailyPeak > 0;
        const totCell = r.getCell(sortedDepts.length + 2);

        if (total > 0) {
          totCell.value = `${total}명${isPeak ? " (Peak)" : ""}`;
          totCell.font = { name: "Malgun Gothic", size: 9.5, bold: true, color: { argb: isPeak ? "FFDC2626" : "FF0F172A" } };
          if (isPeak) {
            totCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF2F2" } };
          }
        } else {
          totCell.value = "-";
          totCell.font = { name: "Malgun Gothic", size: 9.5, color: { argb: "FF94A3B8" } };
        }
        totCell.alignment = { vertical: "middle", horizontal: "center" };
        totCell.border = thinBorder;
        r.height = 20;
      });

      // Bottom Total Row for Timeline
      curRow++;
      const bRow = ws.getRow(curRow);
      const bDate = bRow.getCell(1);
      bDate.value = "총 합계";
      bDate.font = { name: "Malgun Gothic", size: 10, bold: true, color: { argb: "FF0F172A" } };
      bDate.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
      bDate.alignment = { vertical: "middle", horizontal: "center" };
      bDate.border = thinBorder;

      sortedDepts.forEach(([, dData], dIdx) => {
        const c = bRow.getCell(dIdx + 2);
        c.value = `${dData.total || 0} M/D`;
        c.font = { name: "Malgun Gothic", size: 9.5, bold: true, color: { argb: "FF0F172A" } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
        c.alignment = { vertical: "middle", horizontal: "center" };
        c.border = thinBorder;
      });

      const bTot = bRow.getCell(sortedDepts.length + 2);
      bTot.value = `${mp.totalManday || 0} M/D`;
      bTot.font = { name: "Malgun Gothic", size: 10, bold: true, color: { argb: "FF15803D" } };
      bTot.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCFCE7" } };
      bTot.alignment = { vertical: "middle", horizontal: "center" };
      bTot.border = thinBorder;
      bRow.height = 24;

      // Set Column Widths
      const colWidths = [
        { width: 16 }, // A: 날짜 / 부서명
        ...sortedDepts.map(() => ({ width: 13 })),
        { width: 16 }  // 당일 합계
      ];
      ws.columns = colWidths;

      // Download file
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cleanFileName = `${mfgNo ? `${mfgNo}_` : ""}${projName}_공수투입현황.xlsx`.replace(/[\\/:*?"<>|]/g, "_");
      a.download = cleanFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 500);
    } catch (err) {
      console.error("Excel export error:", err);
      alert("Excel 파일 생성 중 오류가 발생했습니다: " + (err.message || err));
    }
  };

  return (
    <div className="mp-modal-backdrop" onMouseDown={onClose}>
      <div className="mp-modal-card" onMouseDown={e => e.stopPropagation()}>
        <div className="mp-modal-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3>📊 {project.manufacturingNo ? `${normalizeJVName(project.manufacturingNo)} · ` : ""}{normalizeJVName(project.name)} 공수 투입 현황</h3>
            <p>{normalizeJVName(project.site) || "-"} · Line {normalizeJVName(project.line) || "-"} &nbsp;|&nbsp; 기간: {fullDates[0] || project.startDate || "-"} ~ {fullDates[fullDates.length - 1] || project.endDate || "-"}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "5px", flexShrink: 0 }}>
            {mp && (
              <button
                className="excel-export-btn"
                onClick={handleExportExcel}
                style={{ padding: "5px 12px", fontSize: "12px", gap: "5px" }}
                title="화면과 동일한 서식의 Excel 파일 다운로드"
              >
                <span>📥</span> Excel 다운로드
              </button>
            )}
            <button className="mp-close-btn" onClick={onClose}>×</button>
          </div>
        </div>

        {!mp ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)" }}>
            <div style={{ fontSize: "36px", marginBottom: "12px" }}>📋</div>
            <h4 style={{ margin: "0 0 8px 0", color: "var(--text-primary)" }}>등록된 마스터 플랜 공수 데이터가 없습니다.</h4>
            <p style={{ margin: 0, fontSize: "13px" }}>새 프로젝트 등록 시 <b>마스터 플랜 엑셀(Manpower 표 포함)</b>을 첨부하시면 자동으로 공수 데이터가 추출되어 이곳에 표시됩니다.</p>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
              <div style={{ background: "var(--bg-card-subtle)", border: "1px solid var(--border-subtle)", borderRadius: "10px", padding: "14px" }}>
                <div style={{ fontSize: "12px", color: "var(--success)", fontWeight: "bold" }}>총 투입 공수 (Total Manday)</div>
                <div style={{ fontSize: "24px", fontWeight: "800", color: "var(--text-primary)", marginTop: "4px" }}>{mp.totalManday || 0} M/D</div>
              </div>
              <div style={{ background: "var(--bg-card-subtle)", border: "1px solid var(--border-subtle)", borderRadius: "10px", padding: "14px" }}>
                <div style={{ fontSize: "12px", color: "var(--danger)", fontWeight: "bold" }}>일일 피크 인원 (Daily Peak)</div>
                <div style={{ fontSize: "24px", fontWeight: "800", color: "#dc2626", marginTop: "4px" }}>{mp.dailyPeak || 0} 명</div>
              </div>
              <div style={{ background: "var(--bg-card-subtle)", border: "1px solid var(--border-subtle)", borderRadius: "10px", padding: "14px" }}>
                <div style={{ fontSize: "12px", color: "#f59e0b", fontWeight: "bold" }}>공수 투입 일수</div>
                <div style={{ fontSize: "24px", fontWeight: "800", color: "#f59e0b", marginTop: "4px" }}>{activeDaysCount} 일</div>
              </div>
            </div>

            {/* Department Breakdown */}
            {sortedDepts.length > 0 && (
              <div>
                <h4 style={{ margin: "0 0 10px 0", fontSize: "14px", color: "var(--text-primary)" }}>부서별 투입 요약</h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px" }}>
                  {sortedDepts.map(([rawD, dData]) => {
                    const norm = normalizeDeptKey(rawD);
                    return (
                      <div key={rawD} style={{ background: "var(--bg-card-subtle)", border: "1px solid var(--border-faint)", borderLeft: `4px solid ${getDeptColor(norm)}`, borderRadius: "8px", padding: "10px 14px" }}>
                        <div style={{ fontSize: "11px", fontWeight: "bold", color: "var(--text-secondary)" }}>{getDeptLabel(norm)}</div>
                        <div style={{ fontSize: "18px", fontWeight: "bold", color: "var(--text-primary)", marginTop: "4px" }}>
                          {dData.total || 0} <span style={{ fontSize: "12px", fontWeight: "normal" }}>M/D</span>
                        </div>
                        <div style={{ fontSize: "11px", color: "#dc2626" }}>Peak: {dData.peak || 0}명</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Timeline Table */}
            {fullDates.length > 0 && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "0 0 10px 0" }}>
                  <h4 style={{ margin: 0, fontSize: "14px", color: "var(--text-primary)" }}>
                    일자별 인력 투입 타임라인 ({fullDates[0]} ~ {fullDates[fullDates.length - 1]})
                  </h4>
                  <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>전체 {fullDates.length}일 (투입 {activeDaysCount}일)</span>
                </div>
                <div style={{ overflowX: "auto", maxHeight: "320px", border: "1px solid var(--border-faint)", borderRadius: "8px" }}>
                  <table className="mp-timeline-table">
                    <thead>
                      <tr>
                        <th>날짜</th>
                        {sortedDepts.map(([dName]) => {
                          const norm = normalizeDeptKey(dName);
                          return <th key={dName}>{getDeptShort(norm)}</th>;
                        })}
                        <th>당일 합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fullDates.map(dateStr => {
                        let daySum = 0;
                        const cells = sortedDepts.map(([dName]) => {
                          const v = mp.departments?.[dName]?.daily?.[dateStr] || 0;
                          daySum += Number(v) || 0;
                          return v;
                        });
                        const total = mp.dailyTotal?.[dateStr] !== undefined ? mp.dailyTotal[dateStr] : daySum;
                        const isPeak = total === mp.dailyPeak && mp.dailyPeak > 0;
                        const hasManpower = total > 0;

                        return (
                          <tr key={dateStr}>
                            <td style={{ fontWeight: 600, background: "var(--bg-card-subtle)" }}>{dateStr}</td>
                            {cells.map((v, cIdx) => (
                              <td key={cIdx} style={{ color: v > 0 ? "var(--text-primary)" : "var(--text-muted)" }}>
                                {v > 0 ? v : "-"}
                              </td>
                            ))}
                            <td
                              className={isPeak ? "mp-peak-cell" : ""}
                              style={{
                                fontWeight: hasManpower ? "bold" : "normal",
                                color: hasManpower ? (isPeak ? "#dc2626" : "var(--text-primary)") : "var(--text-muted)"
                              }}
                            >
                              {hasManpower ? `${total}명 ${isPeak ? "🔥" : ""}` : "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
          {mp && (
            <button
              className="excel-export-btn"
              onClick={handleExportExcel}
              style={{ flex: 1, padding: "12px", fontSize: "14px" }}
            >
              <span>📥</span> Excel 서식 다운로드
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "12px",
              background: "linear-gradient(135deg, #1f6feb, #1152b3)",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              fontWeight: "bold",
              cursor: "pointer",
              fontSize: "14px"
            }}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
