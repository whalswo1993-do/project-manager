import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { supabase } from "./supabase";
import Login from "./Login";

const DAY = 86400000;
const STATUSES = ["검토중", "PO대기중", "제작 및 운송중", "진행중", "완료"];
const DEPARTMENTS = ["PM", "설계", "설비기술", "제어", "비전"];
const iso = (date = new Date()) => date.toISOString().slice(0, 10);
const parseDate = (value) => new Date(`${value}T00:00:00`);
const makeId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const newMilestones = () => Array.from({ length: 5 }, () => ({ id: makeId(), name: "", date: iso() }));
const emptyProject = () => ({
  manufacturingNo: "", site: "", line: "", name: "", pm: "", design: "",
  facilityTechnology: "", control: "", vision: "", startDate: iso(),
  endDate: iso(new Date(Date.now() + 7 * DAY)), status: "검토중", progress: 0,
  autoProgress: true, milestones: [],
});

function fromDatabase(row) {
  return {
    id: row.id, manufacturingNo: row.manufacturing_no || "", site: row.site || "",
    line: row.line || "", name: row.name || "", pm: row.pm || row.manager || "",
    design: row.design || "", facilityTechnology: row.facility_technology || "",
    control: row.control || "", vision: row.vision || "", startDate: row.start_date,
    endDate: row.end_date, status: row.status || "검토중", progress: row.progress || 0,
    autoProgress: row.auto_progress ?? true, milestones: row.milestones || [],
  };
}

function toDatabase(project) {
  return {
    id: project.id, manufacturing_no: project.manufacturingNo.trim(), site: project.site,
    line: project.line.trim(), name: project.name.trim(), manager: project.pm.trim(),
    pm: project.pm.trim(), design: project.design.trim(),
    facility_technology: project.facilityTechnology.trim(), control: project.control.trim(),
    vision: project.vision.trim(), start_date: project.startDate, end_date: project.endDate,
    status: project.status, progress: Number(project.progress) || 0,
    auto_progress: project.autoProgress, milestones: project.milestones || [],
  };
}

function calculatedProgress(project) {
  if (project.status === "완료") return 100;
  if (!project.autoProgress) return Number(project.progress) || 0;
  const duration = Math.max(DAY, parseDate(project.endDate) - parseDate(project.startDate));
  return Math.max(0, Math.min(100, Math.round(((parseDate(iso()) - parseDate(project.startDate)) / duration) * 100)));
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState(emptyProject());
  const [editingId, setEditingId] = useState(null);
  const [milestones, setMilestones] = useState(newMilestones());
  const [filter, setFilter] = useState("전체");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [modal, setModal] = useState(null);
  const [newSite, setNewSite] = useState("");
  const [newPerson, setNewPerson] = useState("");
  const [newDepartment, setNewDepartment] = useState("PM");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
      setAuthLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession || null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) initialize();
    else setProfile(null);
  }, [session]);

  async function initialize() {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
    if (error) return setMessage(error.message);
    if (!data.active) {
      await supabase.auth.signOut();
      window.alert("비활성화된 계정입니다. 관리자에게 문의하세요.");
      return;
    }
    setProfile(data);
    await Promise.all([loadProjects(), loadSites(), loadPersonnel()]);
    if (data.role === "admin") await loadUsers();
  }

  async function loadProjects() {
    const { data, error } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
    if (error) setMessage(error.message); else setProjects((data || []).map(fromDatabase));
  }
  async function loadSites() {
    const { data, error } = await supabase.from("sites").select("*").order("name");
    if (error) setMessage(error.message); else setSites(data || []);
  }
  async function loadPersonnel() {
    const { data, error } = await supabase.from("personnel").select("*").order("department").order("name");
    if (error) setMessage(error.message); else setPersonnel(data || []);
  }
  async function loadUsers() {
    const { data, error } = await supabase.from("profiles").select("*").order("email");
    if (error) setMessage(error.message); else setUsers(data || []);
  }
  async function loadHistory() {
    const { data, error } = await supabase.from("project_history").select("*").order("changed_at", { ascending: false }).limit(200);
    if (error) setMessage(error.message); else setHistory(data || []);
  }

  const role = profile?.role;
  const canCreate = ["admin", "grade3"].includes(role);
  const canEdit = ["admin", "grade3", "grade2"].includes(role);
  const canDelete = ["admin", "grade3"].includes(role);
  const visibleProjects = useMemo(() => projects.map((project) => ({
    ...project,
    currentProgress: calculatedProgress(project),
    overdue: project.status !== "완료" && parseDate(project.endDate) < parseDate(iso()),
  })).filter((project) => {
    const searchable = [project.manufacturingNo, project.site, project.line, project.name,
      project.pm, project.design, project.facilityTechnology, project.control, project.vision]
      .join(" ").toLowerCase();
    const filterMatch = filter === "전체" ||
      (filter === "완료" && project.status === "완료") ||
      (filter === "진행중" && project.status !== "완료") ||
      (filter === "지연" && project.overdue);
    return searchable.includes(search.toLowerCase()) && filterMatch;
  }), [projects, search, filter]);

  async function saveProject() {
    if (!form.manufacturingNo.trim() || !form.site || !form.name.trim()) return setMessage("제조번호, Site, 프로젝트명은 필수입니다.");
    if (parseDate(form.endDate) < parseDate(form.startDate)) return setMessage("종료일을 확인하세요.");
    let error;
    if (editingId && role === "grade2") {
      ({ error } = await supabase.from("projects").update({
        status: form.status, progress: Number(form.progress) || 0, auto_progress: form.autoProgress,
      }).eq("id", editingId));
    } else {
      const entered = milestones.filter((item) => item.name.trim() && item.date);
      const row = { ...form, id: editingId || makeId(), milestones: entered.length ? entered : form.milestones };
      ({ error } = editingId
        ? await supabase.from("projects").update(toDatabase(row)).eq("id", editingId)
        : await supabase.from("projects").insert(toDatabase(row)));
    }
    if (error) return setMessage(error.code === "23505" ? "이미 사용 중인 제조번호입니다." : error.message);
    setForm(emptyProject());
    setEditingId(null);
    setMilestones(newMilestones());
    setMessage("저장했습니다.");
    await loadProjects();
  }

  function editProject(project) {
    setEditingId(project.id);
    setForm({ ...project, progress: project.currentProgress });
    const stored = (project.milestones || []).slice(0, 5);
    setMilestones([...stored, ...newMilestones().slice(0, 5 - stored.length)]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteProject(id) {
    if (!canDelete || !window.confirm("프로젝트를 삭제할까요?")) return;
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) setMessage(error.message); else await loadProjects();
  }
  async function updateUser(id, values) {
    const { error } = await supabase.from("profiles").update(values).eq("id", id);
    if (error) setMessage(error.message); else await loadUsers();
  }
  async function addSite() {
    const name = newSite.trim();
    if (!name) return;
    const { error } = await supabase.from("sites").insert({ name, created_by: session.user.id });
    if (error) setMessage(error.message); else { setNewSite(""); await loadSites(); }
  }
  async function addPerson() {
    const name = newPerson.trim();
    if (!name) return;
    const { error } = await supabase.from("personnel").insert({ name, department: newDepartment, created_by: session.user.id });
    if (error) setMessage(error.message); else { setNewPerson(""); await loadPersonnel(); }
  }
  async function deleteManaged(table, row) {
    if (!window.confirm(`${row.name}을(를) 삭제할까요?`)) return;
    const { error } = await supabase.from(table).delete().eq("id", row.id);
    if (error) setMessage(error.message); else table === "sites" ? await loadSites() : await loadPersonnel();
  }

  function exportExcel() {
    const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [["제조번호", "Site", "Line", "프로젝트명", "PM", "설계", "설비기술", "제어", "비전", "시작일", "종료일", "상태", "진행률"],
      ...visibleProjects.map((p) => [p.manufacturingNo, p.site, p.line, p.name, p.pm, p.design,
        p.facilityTechnology, p.control, p.vision, p.startDate, p.endDate, p.status, `${p.currentProgress}%`])];
    const url = URL.createObjectURL(new Blob(["\ufeff" + rows.map((r) => r.map(quote).join(",")).join("\r\n")], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url; link.download = `프로젝트_${iso()}.csv`; link.click(); URL.revokeObjectURL(url);
  }

  if (authLoading) return <div className="center">확인 중...</div>;
  if (!session) return <Login />;
  if (!profile) return <div className="center">권한 확인 중... {message}</div>;

  const PersonInput = ({ label, field, department }) => (
    <label>{label}
      <input list={`people-${department}`} value={form[field]} disabled={role === "grade2"}
        onChange={(event) => setForm({ ...form, [field]: event.target.value })} placeholder="선택 또는 직접 입력" />
      <datalist id={`people-${department}`}>
        {personnel.filter((person) => person.department === department).map((person) => <option key={person.id} value={person.name} />)}
      </datalist>
    </label>
  );

  return <main>
    <header><img src="/tw-logo.png" alt="TW 로고" /><div><b>TW Project</b><h1>Project Management</h1><small>{session.user.email} · {role}</small></div><nav><button onClick={exportExcel}>Excel 내보내기</button><button onClick={() => supabase.auth.signOut()}>로그아웃</button></nav></header>
    <div className="top">{role === "admin" && <button onClick={() => setModal("users")}>사용자 권한 관리</button>}{canDelete && <><button onClick={() => setModal("sites")}>Site 관리</button><button onClick={() => setModal("personnel")}>담당자 관리</button><button onClick={() => { loadHistory(); setModal("history"); }}>수정 이력</button></>}</div>
    {canEdit && <section><h2>{editingId ? "프로젝트 수정" : "새 프로젝트"}</h2><div className="grid">
      <label>제조번호 *<input value={form.manufacturingNo} disabled={role === "grade2"} onChange={(e) => setForm({ ...form, manufacturingNo: e.target.value })} /></label>
      <label>Site *<select value={form.site} disabled={role === "grade2"} onChange={(e) => setForm({ ...form, site: e.target.value })}><option value="">선택</option>{sites.map((site) => <option key={site.id}>{site.name}</option>)}</select></label>
      <label>Line<input value={form.line} disabled={role === "grade2"} onChange={(e) => setForm({ ...form, line: e.target.value })} /></label>
      <label className="wide">프로젝트명 *<input value={form.name} disabled={role === "grade2"} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
      <label>시작일<input type="date" value={form.startDate} disabled={role === "grade2"} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
      <label>종료일<input type="date" value={form.endDate} disabled={role === "grade2"} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>
      <label>상태<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
    </div><div className="people"><PersonInput label="PM 담당자" field="pm" department="PM" /><PersonInput label="설계 담당자" field="design" department="설계" /><PersonInput label="설비기술 담당자" field="facilityTechnology" department="설비기술" /><PersonInput label="제어 담당자" field="control" department="제어" /><PersonInput label="비전 담당자" field="vision" department="비전" /></div>
    <label><input type="checkbox" checked={form.autoProgress} onChange={(e) => setForm({ ...form, autoProgress: e.target.checked })} /> 자동 진행률</label>{!form.autoProgress && <input type="range" min="0" max="100" value={form.progress} onChange={(e) => setForm({ ...form, progress: e.target.value })} />}
    {canCreate && <div className="milestones"><h3>마일스톤</h3>{milestones.map((item, index) => <div key={item.id}><span>{index + 1}</span><input value={item.name} placeholder="마일스톤" onChange={(e) => setMilestones(milestones.map((m, i) => i === index ? { ...m, name: e.target.value } : m))} /><input type="date" value={item.date} onChange={(e) => setMilestones(milestones.map((m, i) => i === index ? { ...m, date: e.target.value } : m))} /></div>)}</div>}
    {message && <p className="notice">{message}</p>}<button className="primary" onClick={saveProject}>{editingId ? "수정 저장" : "프로젝트 추가"}</button></section>}
    <section><div className="tools"><h2>프로젝트 목록</h2><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="제조번호, Site, Line, 프로젝트, 담당자 검색" />{["전체", "진행중", "완료", "지연"].map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div>{visibleProjects.map((project) => <article key={project.id}><div><h3>{project.manufacturingNo} · {project.name}</h3><p>Site {project.site || "-"} · Line {project.line || "-"}</p><p>PM {project.pm || "-"} · 설계 {project.design || "-"} · 설비기술 {project.facilityTechnology || "-"} · 제어 {project.control || "-"} · 비전 {project.vision || "-"}</p><p>{project.startDate} ~ {project.endDate} · {project.status}</p></div><div className="bar"><i style={{ width: `${project.currentProgress}%` }} /><b>{project.currentProgress}%</b></div><aside>{canEdit && <button onClick={() => editProject(project)}>수정</button>}{canDelete && <button onClick={() => deleteProject(project.id)}>삭제</button>}</aside></article>)}</section>
    {modal && <div className="back" onMouseDown={() => setModal(null)}><div className="modal" onMouseDown={(e) => e.stopPropagation()}><button className="close" onClick={() => setModal(null)}>×</button>
      {modal === "users" && <><h2>사용자 계정·권한 관리</h2>{users.map((user) => <div className="user" key={user.id}><span>{user.email}</span><select value={user.role} disabled={user.email === "cmj1012@twgroup.co.kr"} onChange={(e) => updateUser(user.id, { role: e.target.value })}><option value="admin">관리자</option><option value="grade3">Grade3</option><option value="grade2">Grade2</option><option value="grade1">Grade1</option></select><label><input type="checkbox" checked={user.active} disabled={user.email === "cmj1012@twgroup.co.kr"} onChange={(e) => updateUser(user.id, { active: e.target.checked })} /> 활성</label></div>)}</>}
      {modal === "sites" && <><h2>Site 관리</h2><div className="add"><input value={newSite} onChange={(e) => setNewSite(e.target.value)} /><button onClick={addSite}>추가</button></div><p>항목을 우클릭하여 삭제하세요.</p><div className="tags">{sites.map((site) => <button key={site.id} onContextMenu={(e) => { e.preventDefault(); deleteManaged("sites", site); }}>{site.name}</button>)}</div></>}
      {modal === "personnel" && <><h2>담당자 관리</h2><div className="add"><select value={newDepartment} onChange={(e) => setNewDepartment(e.target.value)}>{DEPARTMENTS.map((department) => <option key={department}>{department}</option>)}</select><input value={newPerson} onChange={(e) => setNewPerson(e.target.value)} /><button onClick={addPerson}>추가</button></div>{DEPARTMENTS.map((department) => <div key={department}><b>{department}</b><div className="tags">{personnel.filter((person) => person.department === department).map((person) => <button key={person.id} onContextMenu={(e) => { e.preventDefault(); deleteManaged("personnel", person); }}>{person.name}</button>)}</div></div>)}</>}
      {modal === "history" && <><h2>프로젝트 수정 이력</h2>{history.map((item) => <div className="hist" key={item.id}><b>{item.action}</b> · {item.changed_email || "알 수 없음"} · {new Date(item.changed_at).toLocaleString("ko-KR")}<small>{item.project_id}</small></div>)}</>}
    </div></div>}
  </main>;
}
