import { useEffect, useMemo, useState, useRef } from "react";
import "./App.css";
import { supabase } from "./supabase";
import Login from "./Login";
import { exportGanttReport, exportCalendarReport, exportExcelReport } from "./reportExports";
import VisionSPC from "./VisionSPC";
import IssueManagement from "./IssueManagement";
import Quotations from "./Quotations";
import ManpowerManagement, { ProjectManpowerModal } from "./ManpowerManagement";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as XLSX from "xlsx";
import { ErrorBoundary } from "./ErrorBoundary";
import { normalizeJVName } from "./utils";
import {
  isAccountDeleted,
  registerAccountDeletion,
  getActiveTestSession,
  clearTestSession,
  getTestProfiles,
  updateTestProfile,
  findTestAccount,
  ensureSupabaseAuth,
} from "./authService";
import {
  computeAutoStatus,
  parseExcelMasterPlan,
  parseTSVWithQuotes,
  isSameProjectIdentity,
  adjustProjectDates
} from "./masterPlanParser";

const DAY = 86400000;
const STATUSES = ["검토중", "PO대기중", "제작 및 운송중", "진행중", "완료"];
const DEPTS = ["PM", "설계", "설비기술", "기구", "기구 외주", "비전", "비전 외주", "제어", "제어 외주", "전장", "전장 외주", "Supervisor", "안전", "소장"];
const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#d946ef", "#f43f5e", "#14b8a6", "#84cc16", "#6366f1", "#a855f7", "#10b981", "#f59e0b"];

const iso = (d = new Date()) => d.toISOString().slice(0, 10);
const dt = s => new Date(`${s}T00:00:00`);
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const newMs = () => Array.from({ length: 5 }, () => ({ id: uid(), name: "", startDate: iso(), endDate: iso() }));

const blank = () => ({
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
  const cleanMs = rawList.filter(x => x && x.id !== '__status_meta__' && x.id !== '__manpower_meta__').map(norm);
  const isPOWaiting = (p.status === "PO대기중");
  const isManual = isPOWaiting || (meta ? Boolean(meta.isManual) : false);
  const manualBy = meta?.by || (isManual ? (p.pm || p.manager || "수동지정 담당자") : "");
  const manualAt = meta?.at || "";
  const effectiveStatus = isManual ? (p.status || "검토중") : computeAutoStatus({ startDate: p.start_date, endDate: p.end_date, milestones: cleanMs });

  return {
    id: p.id,
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
  const cleanMs = rawMs.filter(m => m && m.id !== '__status_meta__' && m.id !== '__manpower_meta__');
  const existingMeta = rawMs.find(m => m && m.id === '__status_meta__');
  const existingManpowerMeta = rawMs.find(m => m && m.id === '__manpower_meta__');
  const isPOWaiting = (p.status === "PO대기중");
  const isManual = isPOWaiting || (p.isManualStatus !== undefined ? Boolean(p.isManualStatus) : (existingMeta ? Boolean(existingMeta.isManual) : false));
  const manualBy = p.manualStatusBy !== undefined && p.manualStatusBy !== "" ? p.manualStatusBy : (existingMeta?.by || (isManual ? (p.pm || "수동지정 담당자") : ""));
  const statusMeta = { id: '__status_meta__', isManual, by: manualBy, at: existingMeta?.at || iso(), startDate: p.startDate, endDate: p.endDate };
  const manpowerMeta = p.manpower ? { id: '__manpower_meta__', manpower: p.manpower } : (existingManpowerMeta || null);
  const finalMilestones = [...cleanMs, statusMeta];
  if (manpowerMeta) finalMilestones.push(manpowerMeta);

  return {
    id: p.id,
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
    status: p.status,
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

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [people, setPeople] = useState([]);
  const [form, setForm] = useState(blank());
  const [editing, setEditing] = useState(null);
  const [milestones, setMilestones] = useState(newMs());
  const [modal, setModal] = useState(null);
  const [permissionModal, setPermissionModal] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [ganttExpanded, setGanttExpanded] = useState({});
  const [month, setMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("전체");
  const [siteFilter, setSiteFilter] = useState("전체");
  const [personFilter, setPersonFilter] = useState("전체");
  const [msg, setMsg] = useState("");
  const [newSite, setNewSite] = useState("");
  const [newPerson, setNewPerson] = useState("");
  const [newDept, setNewDept] = useState("PM");
  const [currentView, setCurrentView] = useState("projects");
  const [isExtracting, setIsExtracting] = useState(false);
  const [selectedManpowerProject, setSelectedManpowerProject] = useState(null);
  const [selectedProjects, setSelectedProjects] = useState(new Set());
  const masterPlanInput = useRef(null);

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

  async function load(t) {
    if (t === "profiles") {
      try {
        const { data: supaProfiles } = await supabase.from("profiles").select("*").order("email");
        const testProfs = getTestProfiles();
        const combined = [];
        const seenEmails = new Set();

        // 1. Supabase profiles (삭제된 계정 제외)
        (supaProfiles || []).forEach(p => {
          const lower = p.email?.toLowerCase();
          if (lower && !isAccountDeleted(lower) && !seenEmails.has(lower)) {
            seenEmails.add(lower);
            const testOverride = testProfs.find(tp => tp.email?.toLowerCase() === lower);
            combined.push(testOverride ? { ...p, ...testOverride } : p);
          }
        });

        // 2. Test accounts (Supabase에 없는 경우 추가)
        testProfs.forEach(tp => {
          const lower = tp.email?.toLowerCase();
          if (lower && !isAccountDeleted(lower) && !tp.deleted && !seenEmails.has(lower)) {
            seenEmails.add(lower);
            combined.push(tp);
          }
        });

        setUsers(combined);
      } catch (err) {
        console.error("profiles load error:", err);
        setUsers(getTestProfiles().filter(tp => !isAccountDeleted(tp.email) && !tp.deleted));
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
    const sess = activeSession || session || getActiveTestSession();
    if (!sess?.user?.email) return;

    const email = sess.user.email.toLowerCase();

    // 1. 삭제 여부 검사 -> 삭제 시 강제 로그아웃
    if (isAccountDeleted(email)) {
      await supabase.auth.signOut();
      clearTestSession();
      setSession(null);
      setProfile(null);
      return alert("삭제된 계정입니다. 해당 계정으로는 다시 로그인할 수 없습니다.");
    }

    // 2. 테스트 계정인지 확인
    const testAcc = findTestAccount(email);
    if (sess.isTestAccount || testAcc) {
      if (testAcc?.deleted) {
        await supabase.auth.signOut();
        clearTestSession();
        setSession(null);
        setProfile(null);
        return alert("삭제된 계정입니다. 해당 계정으로는 다시 로그인할 수 없습니다.");
      }
      if (testAcc?.active === false) {
        await supabase.auth.signOut();
        clearTestSession();
        setSession(null);
        setProfile(null);
        return alert("비활성화된 계정입니다. 관리자에게 문의하세요.");
      }

      const testProfile = testAcc || {
        id: sess.user.id,
        email: sess.user.email,
        role: "admin",
        active: true,
      };

      setProfile(testProfile);
      await ensureSupabaseAuth();
      await Promise.all([load("projects"), load("sites"), load("personnel")]);
      if (testProfile.role === "admin") load("profiles");
      return;
    }

    // 3. 일반 Supabase 계정 확인
    const { data: p, error } = await supabase.from("profiles").select("*").eq("id", sess.user.id).single();
    if (error || !p) {
      // profiles 레코드가 없거나 삭제된 경우
      await supabase.auth.signOut();
      clearTestSession();
      setSession(null);
      setProfile(null);
      return alert("등록되지 않았거나 삭제된 계정입니다.");
    }

    if (p.active === false) {
      await supabase.auth.signOut();
      clearTestSession();
      setSession(null);
      setProfile(null);
      return alert("비활성화된 계정입니다.");
    }

    setProfile(p);
    await Promise.all([load("projects"), load("sites"), load("personnel")]);
    if (p.role === "admin") load("profiles");
  }

  useEffect(() => {
    // 1. 테스트 세션 우선 확인
    const testSess = getActiveTestSession();
    if (testSess) {
      setSession(testSess);
      setLoading(false);
      boot(testSess);
    } else {
      supabase.auth.getSession().then(({ data }) => {
        setSession(data.session);
        setLoading(false);
        if (data.session) boot(data.session);
      });
    }

    const { data: authSub } = supabase.auth.onAuthStateChange((_, s) => {
      const currentTest = getActiveTestSession();
      if (currentTest) {
        setSession(currentTest);
        boot(currentTest);
      } else {
        setSession(s);
        if (s) boot(s);
        else setProfile(null);
      }
    });

    const handleAuthChange = () => {
      const activeTest = getActiveTestSession();
      if (activeTest) {
        setSession(activeTest);
        setLoading(false);
        boot(activeTest);
      } else {
        supabase.auth.getSession().then(({ data }) => {
          setSession(data.session);
          setLoading(false);
          if (data.session) boot(data.session);
          else {
            setSession(null);
            setProfile(null);
          }
        });
      }
    };

    const handleAccountDeleted = (e) => {
      const deletedEmail = e.detail?.email;
      const myEmail = session?.user?.email?.toLowerCase();
      if (deletedEmail && myEmail === deletedEmail) {
        supabase.auth.signOut();
        clearTestSession();
        setSession(null);
        setProfile(null);
        alert("현재 계정이 관리자에 의해 영구 삭제되었습니다. 로그아웃됩니다.");
      }
    };

    window.addEventListener("auth-changed", handleAuthChange);
    window.addEventListener("user-account-deleted", handleAccountDeleted);

    return () => {
      authSub?.subscription?.unsubscribe();
      window.removeEventListener("auth-changed", handleAuthChange);
      window.removeEventListener("user-account-deleted", handleAccountDeleted);
    };
  }, []);

  const role = profile?.role || "grade1";
  const isGrade1 = role === "grade1";
  const create = ["admin", "grade3"].includes(role);
  const edit = ["admin", "grade3", "grade2"].includes(role);
  const del = ["admin", "grade3"].includes(role);

  function showPermissionModal(feature) {
    setPermissionModal({ feature, role });
  }

  const peopleNames = [...new Set(people.map(p => p.name))].sort();

  const view = useMemo(() => projects.map((p, i) => {
    const cleanMs = (p.milestones || []).filter(x => x && x.id !== '__status_meta__');
    const isPOWaiting = (p.status === "PO대기중");
    const effectiveManual = isPOWaiting || Boolean(p.isManualStatus);
    const currentStatus = effectiveManual ? p.status : computeAutoStatus({ ...p, milestones: cleanMs });
    return {
      ...p,
      status: currentStatus,
      isManualStatus: effectiveManual,
      manualStatusBy: p.manualStatusBy || (effectiveManual ? (p.pm || "담당자") : ""),
      value: progress({ ...p, status: currentStatus, milestones: cleanMs }),
      overdue: currentStatus !== "완료" && dt(p.endDate) < dt(iso()),
      projectColor: COLORS[i % COLORS.length]
    };
  }).filter(p => {
    const text = [p.manufacturingNo, p.site, p.line, p.name, p.pm, p.design, p.facilityTechnology, p.control, p.vision].join(" ").toLowerCase();
    const status = filter === "전체" || (filter === "완료" && p.status === "완료") || (filter === "진행중" && p.status !== "완료") || (filter === "지연" && p.overdue) || (p.status === filter);
    const site = siteFilter === "전체" || p.site === siteFilter;
    const person = personFilter === "전체" || [p.pm, p.design, p.facilityTechnology, p.control, p.vision].includes(personFilter);
    return text.includes(search.toLowerCase()) && status && site && person;
  }), [projects, search, filter, siteFilter, personFilter]);

  async function save() {
    if (!editing && !create) return showPermissionModal("새 프로젝트 생성");
    if (!form.site || !form.name.trim()) return setMsg("Site, 프로젝트명은 필수입니다.");
    if (dt(form.endDate) < dt(form.startDate)) return setMsg("프로젝트 종료일을 확인하세요.");
    const m = milestones.filter(x => x.name.trim() && x.startDate && x.endDate && x.id !== '__status_meta__' && x.id !== '__manpower_meta__');
    if (m.some(x => dt(x.endDate) < dt(x.startDate))) return setMsg("마일스톤 종료일은 시작일 이후여야 합니다.");

    const isPOWaiting = (form.status === "PO대기중");
    const isManual = isPOWaiting || Boolean(form.isManualStatus) || !form.autoStatus;
    const manualBy = isManual ? (form.manualStatusBy || currentUserName) : "";
    const calculatedStatus = isManual ? form.status : computeAutoStatus({ ...form, milestones: m });
    const statusMeta = { id: '__status_meta__', isManual, by: manualBy, at: iso(), startDate: form.startDate, endDate: form.endDate };
    const finalMilestones = [...m, statusMeta];
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
        status: calculatedStatus,
        isManualStatus: isManual,
        manualStatusBy: manualBy,
        id: editing || uid(),
        milestones: finalMilestones,
        manpower: form.manpower || null
      };
      ({ error } = editing
        ? await supabase.from("projects").update(to(row)).eq("id", editing)
        : await supabase.from("projects").insert(to(row)));
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
    setEditing(p.id);
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
    const userObj = users.find(u => u.id === id);
    const email = userObj?.email;
    const testAcc = findTestAccount(email) || (id.startsWith("test-user-") ? { id } : null);

    if (testAcc) {
      updateTestProfile(id, v);
      if (email) updateTestProfile(email, v);
    }

    try {
      if (!id.startsWith("test-user-")) {
        await supabase.from("profiles").update(v).eq("id", id);
      } else if (email) {
        await supabase.from("profiles").update(v).eq("email", email.trim().toLowerCase());
      }
    } catch (e) {
      console.warn("Supabase update skipped/failed:", e);
    }

    setMsg("사용자 권한/상태가 성공적으로 변경되었습니다.");
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

    try {
      await registerAccountDeletion(normalized, id);
      setMsg(`'${email}' 사용자가 영구 삭제되었습니다.`);
      load("profiles");
    } catch (err) {
      alert("사용자 삭제 중 오류가 발생했습니다: " + err.message);
    }
  }

  async function handleSignOut() {
    clearTestSession();
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

      // Check against current DB list + already processed in this batch
      const existing = processedProjects.find(ep => isSameProjectIdentity(ep, p, sites));
      const cleanMs = p.milestones.map(m => ({ ...m, name: normalizeJVName(m.name), id: uid() }));
      const autoStat = computeAutoStatus({ startDate: p.startDate || iso(), endDate: p.endDate || iso(), milestones: cleanMs });

      if (existing) {
        const updatedExisting = {
          ...existing,
          startDate: p.startDate || existing.startDate,
          endDate: p.endDate || existing.endDate,
          manufacturingNo: normalizeJVName(p.manufacturingNo || existing.manufacturingNo || ""),
          line: normalizeJVName(p.line || existing.line || ""),
          site: normalizeJVName(siteVal || existing.site || "선택 안됨"),
          status: autoStat, autoStatus: true, isManualStatus: false, manualStatusBy: "",
          milestones: cleanMs, manpower: p.manpower || existing.manpower || null
        };
        const { error } = await supabase.from("projects").update(to(updatedExisting)).eq("id", existing.id);
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
          ...blank(), id: uid(), name: projName,
          startDate: p.startDate || iso(), endDate: p.endDate || iso(),
          manufacturingNo: normalizeJVName(p.manufacturingNo || form.manufacturingNo || ""),
          line: normalizeJVName(p.line || form.line || ""),
          site: normalizeJVName(siteVal || form.site || "선택 안됨"),
          status: autoStat, autoStatus: true, isManualStatus: false, manualStatusBy: "",
          milestones: cleanMs, manpower: p.manpower || null
        };

        let insertData = to(newRow);
        let { error } = await supabase.from("projects").insert(insertData);

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
          <div style={{ fontSize: '12px', marginTop: '4px', lineHeight: '1.5', whiteSpace: 'pre-line', color: '#1e293b' }}>
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

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("엑셀 표 서식을 자동으로 판독하지 못했거나, AI 분석용 Gemini API 키가 설정되지 않았습니다.");
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-3.8-flash" });
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
각 장비 바로 아래에 위치한 공수(Mechanical, Vision, Vision Sub(비전 외주), Control, Electrical, Electrical Sub(전장 외주), Supervisor(슈퍼바이저), Safety(안전) 등 시트에 기재된 모든 부서) 표는 해당 장비 프로젝트의 "manpower"에 각각 1:1로 정확히 할당해야 합니다. 특히 "비전 외주", "전장 외주", "Supervisor(슈퍼바이저)"는 일반 비전/전장과 합치지 말고 반드시 별도 부서로 독립 추출해야 합니다.

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

      const result = await model.generateContent([...parts, prompt]);
      let responseText = result.response.text().trim();
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
        <span style={{ color: '#ef4444' }}>
          분석 실패: {userFriendlyMsg}
          <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'normal', marginTop: '4px' }}>
            원인파악용 기술 정보: {err.message}
          </div>
        </span>
      );
    } finally {
      setIsExtracting(false);
      if (masterPlanInput.current) masterPlanInput.current.value = "";
    }
  }

  async function excel() {
    setMsg("Excel 보고서 생성 중...");
    try {
      await exportExcelReport(view, { filter, siteFilter, personFilter, search });
      setMsg("Excel 보고서를 완료했습니다.");
    } catch (error) {
      setMsg("Excel 생성 실패: " + error.message);
    }
  }

  const gs = view.length ? new Date(Math.min(...view.flatMap(p => [dt(p.startDate).getTime(), ...(p.milestones || []).map(m => dt(m.startDate).getTime())]))) : dt(iso());
  const ge = view.length ? new Date(Math.max(...view.flatMap(p => [dt(p.endDate).getTime(), ...(p.milestones || []).map(m => dt(m.endDate).getTime())]))) : new Date(gs.getTime() + DAY);
  const span = Math.max(DAY, ge - gs + DAY);
  const pos = d => Math.max(0, Math.min(100, (dt(d) - gs) / span * 100));
  const barW = (s, e) => Math.max(1, (dt(e) - dt(s) + DAY) / span * 100);
  const cells = monthCells(month);

  if (loading) return <div className="center">확인 중...</div>;
  if (!session) return <Login />;
  if (!profile) return <div className="center">권한 확인 중... {msg}</div>;


  return (
    <main>
      <header>
        <img src="/tw-logo.png" alt="TW Logo" />
        <div>
          <b>TW Project</b>
          <h1>Project Management</h1>
          <small>{session.user.email} · {role}</small>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={() => {
                if ('caches' in window) {
                  caches.keys().then(ks => ks.forEach(k => caches.delete(k)));
                }
                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
                }
                window.location.reload(true);
              }}
              style={{ background: '#d97706', color: '#fff', fontSize: '11px', fontWeight: 'bold' }}
              title="브라우저 캐시를 완전히 비우고 최신 화면으로 새로고침합니다"
            >
              ⚡ 캐시 새로고침
            </button>
            <button onClick={() => { if (isGrade1) return showPermissionModal("Excel 보고서 출력"); excel(); }}>
              Excel 보고서
            </button>
            <button onClick={handleSignOut}>로그아웃</button>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {role === "admin" && <button onClick={() => setModal("users")}>사용자 권한 관리</button>}
          </div>
        </nav>
      </header>

      <div className="top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            onClick={() => setCurrentView("projects")}
            style={{
              background: currentView === "projects" ? "linear-gradient(135deg, #1f6feb, #1152b3)" : "#e1e4e8",
              color: currentView === "projects" ? "#fff" : "#24292e",
              border: currentView === "projects" ? "1px solid #388bfd" : "1px solid #d1d5da",
              padding: "0.45rem 1.15rem",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: 600,
              height: "44px",
              display: "inline-flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              boxSizing: "border-box",
              fontSize: "13px"
            }}
          >
            <span>프로젝트 일정 📅</span>
          </button>
          <button
            onClick={() => setCurrentView("manpower")}
            style={{
              background: currentView === "manpower" ? "linear-gradient(135deg, #1f6feb, #1152b3)" : "#e1e4e8",
              color: currentView === "manpower" ? "#fff" : "#24292e",
              border: currentView === "manpower" ? "1px solid #388bfd" : "1px solid #d1d5da",
              padding: "0.45rem 1.15rem",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: 600,
              height: "44px",
              display: "inline-flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              boxSizing: "border-box",
              fontSize: "13px"
            }}
          >
            <span>공수 통합 관리 📊</span>
          </button>
          <button
            onClick={() => setCurrentView("issues")}
            style={{
              background: currentView === "issues" ? "linear-gradient(135deg, #1f6feb, #1152b3)" : "#e1e4e8",
              color: currentView === "issues" ? "#fff" : "#24292e",
              border: currentView === "issues" ? "1px solid #388bfd" : "1px solid #d1d5da",
              padding: "0.45rem 1.15rem",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: 600,
              height: "44px",
              display: "inline-flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              boxSizing: "border-box",
              fontSize: "13px"
            }}
          >
            <span>프로젝트 이슈 관리 📋</span>
          </button>
          <button
            onClick={() => {
              if (isGrade1) return showPermissionModal("견적 조회");
              setCurrentView("quotations");
            }}
            style={{
              background: currentView === "quotations" ? "linear-gradient(135deg, #1f6feb, #1152b3)" : "#e1e4e8",
              color: currentView === "quotations" ? "#fff" : "#24292e",
              border: currentView === "quotations" ? "1px solid #388bfd" : "1px solid #d1d5da",
              padding: "0.45rem 1.15rem",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: 600,
              height: "44px",
              display: "inline-flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              boxSizing: "border-box",
              fontSize: "13px",
              opacity: isGrade1 ? 0.85 : 1
            }}
            title={isGrade1 ? "Grade 1은 권한이 제한됩니다 (클릭 시 권한 안내)" : ""}
          >
            <span>견적 조회 💰 {isGrade1 && "🔒"}</span>
          </button>
          <button
            onClick={() => setCurrentView("vision-spc")}
            style={{
              background: currentView === "vision-spc" ? "linear-gradient(135deg, #1f6feb, #1152b3)" : "#e1e4e8",
              color: currentView === "vision-spc" ? "#fff" : "#24292e",
              border: currentView === "vision-spc" ? "1px solid #388bfd" : "1px solid #d1d5da",
              padding: "0.35rem 1.15rem",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: 600,
              height: "44px",
              display: "inline-flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              boxSizing: "border-box",
              fontSize: "13px",
              lineHeight: 1.15
            }}
          >
            <span>Vision SPC 📈</span>
            <span style={{ fontSize: "10px", fontWeight: 500, opacity: currentView === "vision-spc" ? 0.9 : 0.75, marginTop: "2px" }}>
              (Cp,Cpk분석)
            </span>
          </button>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {currentView === "projects" && (
            <>
              <button onClick={() => { if (!del) return showPermissionModal("Site 관리"); setModal("sites"); }} style={{ height: "44px", display: "inline-flex", alignItems: "center" }}>
                Site 관리 {!del && "🔒"}
              </button>
              <button onClick={() => { if (!del) return showPermissionModal("담당자 관리"); setModal("personnel"); }} style={{ height: "44px", display: "inline-flex", alignItems: "center" }}>
                담당자 관리 {!del && "🔒"}
              </button>
            </>
          )}
        </div>
      </div>

      {currentView === "vision-spc" ? (
        <ErrorBoundary><VisionSPC /></ErrorBoundary>
      ) : currentView === "issues" ? (
        <IssueManagement projects={projects} role={role} onPermissionDenied={showPermissionModal} />
      ) : currentView === "quotations" ? (
        <Quotations projects={projects} session={session} role={role} onPermissionDenied={showPermissionModal} />
      ) : currentView === "manpower" ? (
        <ManpowerManagement projects={projects} sites={sites} onSelectProject={setSelectedManpowerProject} />
      ) : (
        <>
          {edit && (
            <section>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0 }}>{editing ? "프로젝트 수정" : "프로젝트 등록"}</h2>
                  {editing && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '13px', color: '#1d4ed8', fontWeight: 'bold', background: '#eff6ff', padding: '3px 9px', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                        수정 대상: {form.name || "선택됨"}
                      </span>
                      <button
                        type="button"
                        onClick={() => { setEditing(null); setForm(blank()); setMilestones(newMs()); setMsg(""); }}
                        style={{ fontSize: '12px', padding: '4px 10px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer' }}
                      >
                        수정 취소
                      </button>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <a
                    href={`${import.meta.env.BASE_URL || '/'}master-schedule-template.xlsx`.replace('//', '/')}
                    download="Master Schedule 양식.xlsx"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 14px',
                      height: '66px',
                      background: '#ffffff',
                      border: '2px solid #10b981',
                      borderRadius: '12px',
                      color: '#065f46',
                      textDecoration: 'none',
                      cursor: 'pointer',
                      boxShadow: '0 2px 5px rgba(16, 185, 129, 0.15)',
                      boxSizing: 'border-box',
                      transition: 'all 0.2s ease',
                      flexShrink: 0
                    }}
                    onMouseOver={e => {
                      e.currentTarget.style.background = '#f0fdf4';
                      e.currentTarget.style.borderColor = '#059669';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 4px 8px rgba(16, 185, 129, 0.25)';
                    }}
                    onMouseOut={e => {
                      e.currentTarget.style.background = '#ffffff';
                      e.currentTarget.style.borderColor = '#10b981';
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.boxShadow = '0 2px 5px rgba(16, 185, 129, 0.15)';
                    }}
                    title="클릭 시 'Master Schedule 양식.xlsx' 파일이 다운로드됩니다."
                  >
                    <div style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '20px',
                      boxShadow: '0 2px 4px rgba(5, 150, 105, 0.3)'
                    }}>
                      📥
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <b style={{ fontSize: '13px', color: '#0f172a' }}>Master Schedule 양식</b>
                        <span style={{ fontSize: '10px', fontWeight: 'bold', background: '#dcfce7', color: '#15803d', padding: '1px 5px', borderRadius: '4px', border: '1px solid #bbf7d0' }}>Excel</span>
                      </div>
                      <span style={{ fontSize: '11px', color: '#059669', fontWeight: '600', marginTop: '3px' }}>
                        양식 다운로드 받기 ⇩
                      </span>
                    </div>
                  </a>
                  <div style={{ border: '2px solid #38bdf8', borderRadius: '12px', padding: '6px 12px', background: '#f0f9ff', boxShadow: '0 1px 4px rgba(56, 189, 248, 0.15)' }}>
                    <div style={{ textAlign: 'center', marginBottom: '6px', fontSize: '13px' }}>
                      <b style={{ color: '#0f172a' }}>{editing ? "최신 Master Schedule 등록 (최신화)" : "Master Schedule 등록"}</b>{" "}
                      <span style={{ color: '#2563eb', fontWeight: 600, fontSize: '12px' }}>
                        {editing ? "※마스터 스케줄 첨부 시 일정 및 공수 데이터가 최신 버전으로 즉시 갱신됩니다" : "※공수 포함 등록시 공수 통합 관리 자동 반영"}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input type="file" ref={masterPlanInput} onChange={e => handleMasterPlanUpload(e.target.files[0])} accept=".xlsx, .xls, image/*" style={{ display: 'none' }} />
                      <textarea
                        placeholder="엑셀 표 붙여넣기 (Ctrl+V)"
                        disabled={isExtracting}
                        style={{
                          height: '35px',
                          width: '180px',
                          padding: '8px 14px',
                          borderRadius: '8px',
                          border: '1.5px solid #10b981',
                          outline: 'none',
                          resize: 'none',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          boxSizing: 'border-box',
                          fontSize: '13px',
                          fontFamily: 'inherit',
                          background: '#fff'
                        }}
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
                      <button
                        onClick={() => masterPlanInput.current.click()}
                        disabled={isExtracting}
                        style={{
                          background: isExtracting ? '#94a3b8' : 'linear-gradient(135deg, #10b981, #059669)',
                          color: '#fff',
                          padding: '8px 16px',
                          borderRadius: '8px',
                          fontWeight: 'bold',
                          border: 'none',
                          boxShadow: '0 2px 5px rgba(16, 185, 129, 0.25)',
                          height: '35px',
                          whiteSpace: 'nowrap',
                          cursor: 'pointer'
                        }}
                      >
                        {isExtracting ? "✨ AI 분석 중..." : "✨ 파일 첨부 (Excel/이미지)"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid">
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
                <PersonField label="PM 담당자" value={form.pm} disabled={role === "grade2"} onChange={v => setForm({ ...form, pm: v })} dept="PM" people={people} />
                <PersonField label="설계 담당자" value={form.design} disabled={role === "grade2"} onChange={v => setForm({ ...form, design: v })} dept="설계" people={people} />
                <PersonField label="설비기술 담당자" value={form.facilityTechnology} disabled={role === "grade2"} onChange={v => setForm({ ...form, facilityTechnology: v })} dept="설비기술" people={people} />
                <PersonField label="제어 담당자" value={form.control} disabled={role === "grade2"} onChange={v => setForm({ ...form, control: v })} dept="제어" people={people} />
                <PersonField label="비전 담당자" value={form.vision} disabled={role === "grade2"} onChange={v => setForm({ ...form, vision: v })} dept="비전" people={people} />
              </div>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', margin: '8px 0' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" style={{ width: 'auto', margin: 0, cursor: 'pointer' }} checked={form.autoStatus} onChange={e => handleAutoStatusToggle(e.target.checked)} />
                  <span>마일스톤 기준 상태 자동 계산</span>
                </label>
                {form.autoStatus && (
                  <span style={{ fontSize: '12px', color: '#059669', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                    (현재 계산: {computedCurrentStatus})
                  </span>
                )}
                {form.isManualStatus && (
                  <span style={{ fontSize: '12px', color: '#d97706', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                    ⚠️ 수동 수정 상태 (수정자: {form.manualStatusBy || currentUserName})
                  </span>
                )}
              </div>

              {form.isManualStatus && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fffbeb', border: '1px solid #fde68a', padding: '6px 12px', borderRadius: '6px', margin: '4px 0 8px', fontSize: '12px', color: '#b45309', flexWrap: 'wrap' }}>
                  <span>수동 수정한 인원 이름:</span>
                  <input style={{ width: '140px', padding: '4px 8px', fontSize: '12px' }} value={form.manualStatusBy} onChange={e => setForm({ ...form, manualStatusBy: e.target.value })} placeholder="이름 입력" list="people-status-list" />
                  <datalist id="people-status-list">{peopleNames.map(n => <option key={n} value={n} />)}</datalist>
                  <span style={{ fontSize: '11px', color: '#92400e' }}>* 프로젝트 목록에 '상태 확인 후 상태 변경을 해주세요' 문구와 함께 표시됩니다.</span>
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
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#0b68b5' }}>{form.progress}%</span>
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

              {msg && <p className="notice" style={{ marginTop: '10px', fontWeight: 'bold', color: '#059669' }}>{msg}</p>}

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '15px', flexWrap: 'wrap' }}>
                <button className="primary" onClick={save}>{editing ? "수정 저장" : "프로젝트 추가"}</button>
                {editing && (
                  <button
                    type="button"
                    onClick={() => { setEditing(null); setForm(blank()); setMilestones(newMs()); setMsg(""); }}
                    style={{ background: '#64748b', color: '#fff', padding: '10px 18px', borderRadius: '6px', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
                  >
                    수정 취소
                  </button>
                )}
              </div>
            </section>
          )}

          <section>
            <div className="filterbar">
              <h2>일정 조회</h2>
              <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)}>
                <option>전체</option>
                {sites.map(s => <option key={s.id}>{s.name}</option>)}
              </select>
              <select value={personFilter} onChange={e => setPersonFilter(e.target.value)}>
                <option>전체</option>
                {peopleNames.map(p => <option key={p}>{p}</option>)}
              </select>
              <button onClick={() => { setSiteFilter("전체"); setPersonFilter("전체"); }}>필터 초기화</button>
            </div>
          </section>

          <section id="gantt-export">
            <div className="title">
              <h2>프로젝트 간트차트</h2>
              <div className="view-actions">
                <span>프로젝트 상위 · 마일스톤 하위 · 오늘선</span>
                <button
                  className="ppt-btn"
                  onClick={async () => {
                    if (isGrade1) return showPermissionModal("간트차트 PPT 내보내기");
                    setMsg("간트차트 PPT 생성 중...");
                    try {
                      await exportGanttReport(view, { filter, siteFilter, personFilter, search });
                      setMsg("간트차트 PPT를 완료했습니다.");
                    } catch (error) {
                      setMsg("PPT 생성 실패: " + error.message);
                    }
                  }}
                >
                  PPT 내보내기 {isGrade1 && "🔒"}
                </button>
              </div>
            </div>
            <div className="gantt">
              <div className="axis">
                <span>{iso(gs)}</span>
                <span>{iso(ge)}</span>
              </div>
              {view.map(p => (
                <div className="gblock" key={p.id}>
                  <div className="grow">
                    <button className="toggle" onClick={() => setGanttExpanded({ ...ganttExpanded, [p.id]: !ganttExpanded[p.id] })}>
                      {ganttExpanded[p.id] ? "▾" : "▸"}
                    </button>
                    <div className="glabel">
                      {p.manufacturingNo ? (
                        <b style={{ fontSize: '9px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }}>
                          {p.manufacturingNo.replace(/-[a-f0-9]{4}$/i, '')}
                        </b>
                      ) : null}
                      <b style={{ marginTop: '1px', fontSize: '9px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }}>
                        {p.name}
                      </b>
                      <small style={{ marginTop: '1px', fontSize: '8px' }}>{p.site} · {p.line || "-"}</small>
                    </div>
                    <div className="track">
                      <div className="projectbar" style={{ left: pos(p.startDate) + "%", width: Math.min(barW(p.startDate, p.endDate), 100 - pos(p.startDate)) + "%", background: p.projectColor }}>
                        <i style={{ width: p.value + "%" }} />
                        <span>{p.value}%</span>
                      </div>
                      <div className="today" style={{ left: pos(iso()) + "%" }} />
                    </div>
                  </div>
                  {ganttExpanded[p.id] && p.milestones.map(m => (
                    <div className="grow sub" key={m.id}>
                      <span />
                      <div className="glabel">
                        <span style={{ fontSize: '9px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>{m.name}</span>
                        <small style={{ fontSize: '8px' }}>{m.startDate} ~ {m.endDate}</small>
                      </div>
                      <div className="track">
                        <div className="msbar" style={{ left: pos(m.startDate) + "%", width: Math.min(barW(m.startDate, m.endDate), 100 - pos(m.startDate)) + "%", borderColor: p.projectColor, background: p.projectColor + "38" }}>
                          <i style={{ width: pct(m.startDate, m.endDate) + "%", background: p.projectColor }} />
                        </div>
                        <div className="today" style={{ left: pos(iso()) + "%" }} />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>

          <section id="calendar-export">
            <div className="calhead">
              <div>
                <h2>프로젝트 일정 달력</h2>
                <p>프로젝트 기간을 얇은 연속 막대로 표시합니다. 막대를 누르면 상세 정보가 열립니다.</p>
              </div>
              <div className="cal-actions">
                <button
                  className="ppt-btn"
                  onClick={async () => {
                    if (isGrade1) return showPermissionModal("일정 달력 PPT 내보내기");
                    setMsg("일정 달력 PPT 생성 중...");
                    try {
                      await exportCalendarReport(view, month, { filter, siteFilter, personFilter, search });
                      setMsg("일정 달력 PPT를 완료했습니다.");
                    } catch (error) {
                      setMsg("PPT 생성 실패: " + error.message);
                    }
                  }}
                >
                  PPT 내보내기 {isGrade1 && "🔒"}
                </button>
                <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
                <b>{month.getFullYear()}년 {month.getMonth() + 1}월</b>
                <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
              </div>
            </div>
            <div className="week">
              {["일", "월", "화", "수", "목", "금", "토"].map(x => <b key={x}>{x}</b>)}
            </div>
            <div className="calendar-weeks">
              {Array.from({ length: 6 }, (_, weekIndex) => {
                const weekDays = cells.slice(weekIndex * 7, weekIndex * 7 + 7);
                const weekStart = iso(weekDays[0]);
                const weekEnd = iso(weekDays[6]);
                const weekProjects = view.filter(p => p.startDate <= weekEnd && p.endDate >= weekStart);
                const lanes = weekProjects.map((p, lane) => ({
                  p,
                  lane,
                  start: Math.max(0, Math.round((dt(p.startDate) - dt(weekStart)) / DAY)),
                  end: Math.min(6, Math.round((dt(p.endDate) - dt(weekStart)) / DAY))
                }));
                const rowHeight = Math.max(75, lanes.length * 18 + 25);

                return (
                  <div className="calendar-week-row" key={weekStart} style={{ height: rowHeight + 'px' }}>
                    <div className="date-cells" style={{ height: rowHeight + 'px' }}>
                      {weekDays.map(d => {
                        const dStr = iso(d);
                        let dayManpower = 0;
                        view.forEach(p => {
                          if (p.manpower?.dailyTotal?.[dStr]) dayManpower += Number(p.manpower.dailyTotal[dStr]) || 0;
                        });
                        return (
                          <div className={monthKey(d) === monthKey(month) ? "date-cell" : "date-cell other"} key={dStr}>
                            <b>{d.getDate()}</b>
                            {dayManpower > 0 && (
                              <span
                                style={{
                                  display: 'inline-block',
                                  fontSize: '10px',
                                  background: dayManpower >= 10 ? '#fee2e2' : '#dbeafe',
                                  color: dayManpower >= 10 ? '#b91c1c' : '#1e40af',
                                  padding: '1px 5px',
                                  borderRadius: '10px',
                                  fontWeight: 'bold',
                                  marginTop: '2px'
                                }}
                                title={`당일 프로젝트 투입 공수: ${dayManpower}명`}
                              >
                                👥 {dayManpower}명
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="event-lanes" style={{ height: Math.max(24, lanes.length * 18 + 4) }}>
                      {lanes.map(({ p, lane, start, end }) => (
                        <button
                          key={p.id}
                          className="calendar-bar"
                          style={{ left: `${start / 7 * 100}%`, width: `${(end - start + 1) / 7 * 100}%`, top: `${lane * 18 + 2}px`, background: p.projectColor }}
                          onClick={() => setSelectedDay({
                            date: `${weekStart} ~ ${weekEnd}`,
                            active: [p],
                            starts: p.startDate >= weekStart && p.startDate <= weekEnd ? [p] : [],
                            ends: p.endDate >= weekStart && p.endDate <= weekEnd ? [p] : []
                          })}
                          title={`${p.manufacturingNo ? `${p.manufacturingNo.replace(/-[a-f0-9]{4}$/i, '')} · ` : ""}${p.name} · ${p.startDate}~${p.endDate}`}
                        >
                          <span>{p.manufacturingNo ? `${p.manufacturingNo.replace(/-[a-f0-9]{4}$/i, '')} · ` : ""}{p.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <div className="tools">
              <h2>프로젝트 목록</h2>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="제조번호, Site, Line, 프로젝트, 담당자 검색" />
              {["전체", "진행중", "완료", "지연"].map(x => (
                <button key={x} className={filter === x ? "active" : ""} onClick={() => setFilter(x)}>{x}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '0 14px 10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                <input type="checkbox" checked={view.length > 0 && selectedProjects.size === view.length} onChange={toggleSelectAll} style={{ width: 'auto', margin: 0, cursor: 'pointer' }} />
                전체 선택
              </label>
              {selectedProjects.size > 0 && (
                <button
                  onClick={() => { if (!del) return showPermissionModal("프로젝트 다중 삭제"); removeSelected(); }}
                  style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  선택 항목 삭제 ({selectedProjects.size}) {!del && "🔒"}
                </button>
              )}
            </div>
            {view.map(p => (
              <article key={p.id} style={{ borderLeft: `7px solid ${p.projectColor}` }}>
                <div>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input type="checkbox" checked={selectedProjects.has(p.id)} onChange={() => toggleSelect(p.id)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                    {p.manufacturingNo ? `${p.manufacturingNo.replace(/-[a-f0-9]{4}$/i, '')} · ` : ""}{p.name}
                  </h3>
                  <p>
                    {p.site || "-"} · {p.line ? `Line ${p.line}` : "-"} &nbsp;|&nbsp; PM {p.pm || "-"} · 설계 {p.design || "-"} · 설비 {p.facilityTechnology || "-"} · 제어 {p.control || "-"} · 비전 {p.vision || "-"} &nbsp;|&nbsp; {p.startDate} ~ {p.endDate} · <b style={{ color: p.isManualStatus ? (p.status === "PO대기중" ? '#dc2626' : '#d97706') : 'inherit' }}>{p.status}</b>
                  </p>
                  {p.isManualStatus && (
                    <div style={{ marginTop: '6px', display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: '#fffbeb', border: '1px solid #f59e0b', padding: '4px 9px', borderRadius: '6px', fontSize: '11px', color: '#b45309', fontWeight: '600' }}>
                      <span>⚠️ <b>수동 설정 ({p.manualStatusBy || "담당자"})</b> : 상태 확인 후 상태 변경을 해주세요</span>
                      {edit && p.status !== "PO대기중" && (
                        <button
                          type="button"
                          onClick={() => switchToAutoStatus(p)}
                          style={{ background: '#fef08a', border: '1px solid #fde047', color: '#854d0e', padding: '2px 7px', borderRadius: '4px', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}
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
                    onClick={() => setSelectedManpowerProject(p)}
                    style={{ background: p.manpower ? '#eff6ff' : '#f8fafc', color: p.manpower ? '#1d4ed8' : '#4b5563', border: p.manpower ? '1px solid #bfdbfe' : '1px solid #d1d5db', fontWeight: 'bold' }}
                  >
                    공수 확인 {p.manpower?.totalManday ? `(${p.manpower.totalManday}M/D)` : ''}
                  </button>
                  <button onClick={() => { if (isGrade1) return showPermissionModal("프로젝트 수정"); editProject(p); }}>
                    수정 {isGrade1 && "🔒"}
                  </button>
                  <button onClick={() => { if (!del) return showPermissionModal("프로젝트 삭제"); remove(p.id); }} style={{ color: del ? 'inherit' : '#9ca3af' }}>
                    삭제 {!del && "🔒"}
                  </button>
                </aside>
              </article>
            ))}
          </section>

          {selectedDay && (
            <div className="back" onMouseDown={() => setSelectedDay(null)}>
              <div className="modal" onMouseDown={e => e.stopPropagation()}>
                <button className="close" onClick={() => setSelectedDay(null)}>×</button>
                <h2>{selectedDay.date} 프로젝트</h2>
                <div className="day-summary">진행 {selectedDay.active.length} · 착수 {selectedDay.starts.length} · 종료 {selectedDay.ends.length}</div>
                {selectedDay.active.map(p => (
                  <div className="dayevent" key={p.id}>
                    <i style={{ background: p.projectColor }} />
                    <b>{p.manufacturingNo ? `${p.manufacturingNo.replace(/-[a-f0-9]{4}$/i, '')} · ` : ""}{p.name}</b>
                    <span>{p.site} · {p.line || "Line 미입력"}</span>
                    <span>{p.startDate} ~ {p.endDate}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {modal && (
        <div className="back" onMouseDown={() => setModal(null)}>
          <div className="modal" onMouseDown={e => e.stopPropagation()}>
            <button className="close" onClick={() => setModal(null)}>×</button>
            {modal === "users" && (
              <div style={{ maxWidth: "720px", margin: "0 auto" }}>
                <h2 style={{ margin: "0 0 8px", fontSize: "20px", color: "#0f172a" }}>사용자 계정·권한 관리</h2>
                <div style={{
                  padding: "10px 14px",
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "#166534",
                  marginBottom: "16px",
                  lineHeight: "1.5"
                }}>
                  <b>💡 계정 관리 가이드</b><br />
                  • <b>활성 해제</b>: 계정 로그인이 일시 차단됩니다. (언제든지 다시 활성화 가능)<br />
                  • <b>사용자 삭제</b>: 계정을 영구 제거하며, <b>해당 계정으로는 다시 로그인할 수 없습니다.</b>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {users.map(u => {
                    const isSuperAdmin = u.email === "cmj1012@twgroup.co.kr";
                    const isSelf = session?.user?.email?.toLowerCase() === u.email?.toLowerCase();
                    const cannotDelete = isSuperAdmin || isSelf;

                    return (
                      <div
                        className="user-row"
                        key={u.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 140px 80px 70px",
                          alignItems: "center",
                          gap: "10px",
                          padding: "10px 14px",
                          background: u.active ? "#ffffff" : "#f8fafc",
                          border: `1px solid ${u.active ? "#e2e8f0" : "#cbd5e1"}`,
                          borderRadius: "10px",
                          opacity: u.active ? 1 : 0.75,
                          transition: "background 0.2s",
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ fontWeight: "600", fontSize: "14px", color: "#1e293b" }}>{u.email}</span>
                            {isSuperAdmin && (
                              <span style={{ fontSize: "10px", background: "#fef3c7", color: "#b45309", padding: "1px 6px", borderRadius: "8px", fontWeight: "bold" }}>
                                최고관리자
                              </span>
                            )}
                            {isSelf && !isSuperAdmin && (
                              <span style={{ fontSize: "10px", background: "#e0e7ff", color: "#4338ca", padding: "1px 6px", borderRadius: "8px", fontWeight: "bold" }}>
                                현재접속
                              </span>
                            )}
                          </div>
                          {u.name && (
                            <span style={{ fontSize: "11px", color: "#64748b" }}>
                              {u.name} {u.department ? `(${u.department})` : ""}
                            </span>
                          )}
                        </div>

                        <select
                          value={u.role}
                          disabled={isSuperAdmin}
                          onChange={e => updateUser(u.id, { role: e.target.value })}
                          style={{ padding: "6px 8px", fontSize: "13px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                        >
                          <option value="admin">관리자</option>
                          <option value="grade3">Grade3 (PM)</option>
                          <option value="grade2">Grade2 (각 부서 담당자)</option>
                          <option value="grade1">Grade1 (일반)</option>
                        </select>

                        <label style={{ display: "flex", alignItems: "center", gap: "5px", cursor: isSuperAdmin ? "default" : "pointer", fontSize: "13px", fontWeight: "500", color: u.active ? "#15803d" : "#64748b" }}>
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
                            padding: "6px 10px",
                            fontSize: "12px",
                            fontWeight: "bold",
                            color: cannotDelete ? "#94a3b8" : "#dc2626",
                            background: cannotDelete ? "#f1f5f9" : "#fee2e2",
                            border: `1px solid ${cannotDelete ? "#e2e8f0" : "#fca5a5"}`,
                            borderRadius: "6px",
                            cursor: cannotDelete ? "not-allowed" : "pointer",
                            transition: "all 0.15s ease",
                          }}
                          onMouseEnter={e => {
                            if (!cannotDelete) {
                              e.currentTarget.style.background = "#dc2626";
                              e.currentTarget.style.color = "#ffffff";
                            }
                          }}
                          onMouseLeave={e => {
                            if (!cannotDelete) {
                              e.currentTarget.style.background = "#fee2e2";
                              e.currentTarget.style.color = "#dc2626";
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
                {DEPTS.map(d => (
                  <div key={d}>
                    <b>{d}</b>
                    <div className="tags">
                      {people.filter(p => p.department === d).map(p => (
                        <button key={p.id} onContextMenu={e => { e.preventDefault(); trash("personnel", p); }}>
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {permissionModal && (
        <div className="back" onMouseDown={() => setPermissionModal(null)} style={{ zIndex: 9999 }}>
          <div className="modal" onMouseDown={e => e.stopPropagation()} style={{ maxWidth: '440px', textAlign: 'center', padding: '28px 24px', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '28px', background: '#fef2f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '26px' }}>🔒</div>
            <h3 style={{ margin: '0 0 10px', fontSize: '19px', color: '#111827', fontWeight: 'bold' }}>접근 권한 제한 안내</h3>
            <p style={{ margin: '0 0 14px', fontSize: '14px', color: '#4b5563', lineHeight: '1.6' }}>
              <b style={{ color: '#dc2626' }}>[{permissionModal.feature}]</b> 기능은 현재 등급에서 이용할 수 없습니다.<br />
              해당 기능을 이용하시려면 <b>운영자에게 권한을 부여</b>받으시기 바랍니다.
            </p>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 16px', marginBottom: '14px', textAlign: 'left', fontSize: '13px', color: '#334155' }}>
              <div style={{ fontWeight: 'bold', color: '#0f172a', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                <span>📌</span><span>권한 부여 및 시스템 문의</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', lineHeight: '1.5' }}>
                <div>• <b>담당자</b>: 조민재 선임</div>
                <div>• <b>E-mail</b>: cmj1012@twgroup.co.kr</div>
                <div>• <b>Tel</b>: +82 10 5506 8739</div>
              </div>
            </div>
            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '9px 14px', marginBottom: '18px', fontSize: '12px', color: '#6b7280', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>로그인: <b>{session?.user?.email}</b></span>
              <span style={{ background: '#e0e7ff', color: '#4338ca', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold', fontSize: '11px' }}>{(role || 'grade1').toUpperCase()}</span>
            </div>
            <button onClick={() => setPermissionModal(null)} style={{ width: '100%', padding: '11px', background: 'linear-gradient(135deg, #1f6feb, #1152b3)', color: '#fff', fontSize: '14px', fontWeight: 'bold', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
              확인
            </button>
          </div>
        </div>
      )}

      {selectedManpowerProject && (
        <ProjectManpowerModal project={selectedManpowerProject} onClose={() => setSelectedManpowerProject(null)} />
      )}
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
  return (
    <label>
      {label}
      <input list={dept} value={value} disabled={disabled} onChange={e => onChange(e.target.value)} />
      <datalist id={dept}>
        {people.filter(x => x.department === dept).map(x => <option key={x.id} value={x.name} />)}
      </datalist>
    </label>
  );
}
