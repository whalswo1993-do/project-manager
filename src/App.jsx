import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { supabase } from "./supabase";
import Login from "./Login";

const DAY = 86400000;
const DEPARTMENTS = ["PM", "설계", "설비기술", "제어", "비전", "기타"];
const STATUSES = ["검토중", "PO대기중", "제작 및 운송중", "진행중", "완료"];
const iso = (d = new Date()) => d.toISOString().slice(0, 10);
const parse = (s) => new Date(`${s}T00:00:00`);
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const milestoneRows = () => Array.from({ length: 5 }, () => ({ id: uid(), name: "", date: iso() }));
const blank = () => ({
  manufacturingNo: "", site: "", name: "", pm: "", design: "",
  facilityTechnology: "", control: "", vision: "", startDate: iso(),
  endDate: iso(new Date(Date.now() + 7 * DAY)), status: "검토중",
  progress: 0, autoProgress: true, milestones: []
});
const toDb = (p) => ({
  id: p.id, manufacturing_no: p.manufacturingNo.trim(), site: p.site,
  name: p.name.trim(), manager: p.pm.trim(), pm: p.pm.trim(),
  design: p.design.trim(), facility_technology: p.facilityTechnology.trim(),
  control: p.control.trim(), vision: p.vision.trim(), start_date: p.startDate,
  end_date: p.endDate, status: p.status, progress: Number(p.progress) || 0,
  auto_progress: p.autoProgress, milestones: p.milestones || []
});
const fromDb = (p) => ({
  id: p.id, manufacturingNo: p.manufacturing_no || "", site: p.site || "",
  name: p.name || "", pm: p.pm || p.manager || "", design: p.design || "",
  facilityTechnology: p.facility_technology || "", control: p.control || "",
  vision: p.vision || "", startDate: p.start_date, endDate: p.end_date,
  status: p.status || "검토중", progress: p.progress || 0,
  autoProgress: p.auto_progress ?? true, milestones: p.milestones || []
});
const progressOf = (p) => p.status === "완료" ? 100 : !p.autoProgress
  ? Number(p.progress) || 0
  : Math.max(0, Math.min(100, Math.round(
      (parse(iso()) - parse(p.startDate)) / Math.max(DAY, parse(p.endDate) - parse(p.startDate)) * 100
    )));

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [form, setForm] = useState(blank());
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("전체");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [managerPanel, setManagerPanel] = useState(null);
  const [newSite, setNewSite] = useState("");
  const [newPerson, setNewPerson] = useState("");
  const [newDepartment, setNewDepartment] = useState("PM");
  const [milestones, setMilestones] = useState(milestoneRows());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) boot();
    else { setProfile(null); setProjects([]); }
  }, [session]);

  async function boot() {
    const { data: p, error } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
    if (error) return setMessage(error.message);
    setProfile(p);
    await Promise.all([loadProjects(), loadSites(), loadPersonnel()]);
    if (p.role === "admin") await loadUsers();
  }

  async function loadProjects() {
    const { data, error } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
    if (error) setMessage(error.message); else setProjects((data || []).map(fromDb));
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

  const role = profile?.role;
  const canCreate = ["admin", "grade3"].includes(role);
  const canEdit = ["admin", "grade3", "grade2"].includes(role);
  const canDelete = ["admin", "grade3"].includes(role);
  const enriched = useMemo(() => projects.map((p) => ({
    ...p, value: progressOf(p), overdue: p.status !== "완료" && parse(p.endDate) < parse(iso())
  })), [projects]);
  const visible = enriched.filter((p) => {
    const text = [p.manufacturingNo, p.site, p.name, p.pm, p.design, p.facilityTechnology, p.control, p.vision].join(" ").toLowerCase();
    const statusMatch = filter === "전체" || (filter === "완료" && p.status === "완료") ||
      (filter === "진행중" && p.status !== "완료") || (filter === "지연" && p.overdue);
    return text.includes(search.toLowerCase()) && statusMatch;
  });

  const peopleFor = (department) => personnel.filter((p) => p.department === department || p.department === "기타");

  async function addSite() {
    const name = newSite.trim();
    if (!name) return setMessage("추가할 Site명을 입력하세요.");
    const { data, error } = await supabase.from("sites").insert({ name, created_by: session.user.id }).select().single();
    if (error) return setMessage(error.code === "23505" ? "이미 등록된 Site입니다." : error.message);
    await loadSites();
    setForm({ ...form, site: data.name });
    setNewSite(""); setManagerPanel(null); setMessage("Site를 추가했습니다.");
  }

  async function addPerson() {
    const name = newPerson.trim();
    if (!name) return setMessage("추가할 담당자 이름을 입력하세요.");
    const existing = personnel.find((p) => p.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      if (existing.department !== newDepartment) {
        const { error } = await supabase.from("personnel").update({ department: newDepartment }).eq("id", existing.id);
        if (error) return setMessage(error.message);
      } else return setMessage("이미 등록된 담당자입니다.");
    } else {
      const { error } = await supabase.from("personnel").insert({ name, department: newDepartment, created_by: session.user.id });
      if (error) return setMessage(error.message);
    }
    await loadPersonnel();
    setNewPerson(""); setManagerPanel(null); setMessage("담당자를 추가했습니다.");
  }

  async function rememberTypedPeople() {
    if (!canCreate) return;
    const entries = [
      [form.pm, "PM"], [form.design, "설계"], [form.facilityTechnology, "설비기술"],
      [form.control, "제어"], [form.vision, "비전"]
    ];
    for (const [rawName, department] of entries) {
      const name = rawName.trim();
      if (!name || personnel.some((p) => p.name.trim().toLowerCase() === name.toLowerCase())) continue;
      await supabase.from("personnel").insert({ name, department, created_by: session.user.id });
    }
    await loadPersonnel();
  }

  function updateMilestone(index, field, value) {
    setMilestones((rows) => rows.map((row, i) => i === index ? { ...row, [field]: value } : row));
  }

  async function save() {
    if (!canEdit) return;
    if (!editing && !canCreate) return setMessage("Grade2는 새 프로젝트를 만들 수 없습니다.");
    if (!form.manufacturingNo.trim() || !form.site || !form.name.trim()) return setMessage("제조번호, Site, 프로젝트명은 필수입니다.");
    if (parse(form.endDate) < parse(form.startDate)) return setMessage("종료일을 확인하세요.");
    const enteredMilestones = milestones.filter((m) => m.name.trim() && m.date).map((m) => ({ ...m, name: m.name.trim() }));
    let error;
    if (editing && role === "grade2") {
      ({ error } = await supabase.from("projects").update({ status: form.status, progress: Number(form.progress) || 0, auto_progress: form.autoProgress }).eq("id", editing));
    } else {
      const row = { ...form, milestones: enteredMilestones.length ? enteredMilestones : form.milestones, id: editing || uid() };
      ({ error } = editing
        ? await supabase.from("projects").update(toDb(row)).eq("id", editing)
        : await supabase.from("projects").insert(toDb(row)));
    }
    if (error) return setMessage(error.code === "23505" ? "이미 사용 중인 제조번호입니다." : error.message);
    await rememberTypedPeople();
    setForm(blank()); setEditing(null); setMilestones(milestoneRows()); setMessage("저장했습니다.");
    await loadProjects();
  }

  function edit(p) {
    if (!canEdit) return;
    setEditing(p.id); setForm({ ...p, progress: p.value });
    const existing = (p.milestones || []).slice(0, 5);
    setMilestones([...existing, ...milestoneRows().slice(0, 5 - existing.length)]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(id) {
    if (!canDelete || !confirm("삭제할까요?")) return;
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) setMessage(error.message); else loadProjects();
  }
  async function setRole(id, nextRole) {
    const { error } = await supabase.from("profiles").update({ role: nextRole }).eq("id", id);
    if (error) setMessage(error.message); else loadUsers();
  }

  function exportExcel() {
    const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const rows = [["제조번호", "Site", "프로젝트명", "PM 담당자", "설계 담당자", "설비기술 담당자", "제어 담당자", "비전 담당자", "시작일", "종료일", "상태", "진행률"],
      ...visible.map((p) => [p.manufacturingNo, p.site, p.name, p.pm, p.design, p.facilityTechnology, p.control, p.vision, p.startDate, p.endDate, p.status, `${p.value}%`])];
    const url = URL.createObjectURL(new Blob(["\ufeff" + rows.map((r) => r.map(esc).join(",")).join("\r\n")], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `프로젝트_${iso()}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  if (loading) return <div className="center">로그인 확인 중...</div>;
  if (!session) return <Login />;
  if (!profile) return <div className="center">사용자 권한 확인 중... {message}</div>;

  const PersonInput = ({ label, field, department }) => (
    <label>{label}
      <input list={`people-${department}`} value={form[field]} disabled={role === "grade2"}
        onChange={(e) => setForm({ ...form, [field]: e.target.value })} placeholder="선택 또는 직접 입력" />
      <datalist id={`people-${department}`}>{peopleFor(department).map((p) => <option key={p.id} value={p.name} />)}</datalist>
    </label>
  );

  return <main>
    <header className="main-header">
      <div className="header-center"><b>TW Project</b><h1>Project Management</h1><p>{session.user.email} · {role}</p></div>
      <div className="header-actions"><button onClick={exportExcel}>Excel 내보내기</button><button onClick={() => supabase.auth.signOut()}>로그아웃</button></div>
    </header>

    {canCreate && <div className="quick-manage">
      <button onClick={() => setManagerPanel(managerPanel === "site" ? null : "site")}>+ Site</button>
      <button onClick={() => setManagerPanel(managerPanel === "person" ? null : "person")}>+ 담당자</button>
      {managerPanel === "site" && <div className="mini-panel"><input placeholder="새 Site명" value={newSite} onChange={(e) => setNewSite(e.target.value)} /><button onClick={addSite}>저장</button></div>}
      {managerPanel === "person" && <div className="mini-panel"><select value={newDepartment} onChange={(e) => setNewDepartment(e.target.value)}>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</select><input placeholder="담당자 이름" value={newPerson} onChange={(e) => setNewPerson(e.target.value)} /><button onClick={addPerson}>저장</button></div>}
    </div>}

    {role === "admin" && <section><h2>사용자 권한 관리</h2><div className="users">{users.map((u) => <div key={u.id}><span>{u.email}</span><select value={u.role} disabled={u.email === "cmj1012@twgroup.co.kr"} onChange={(e) => setRole(u.id, e.target.value)}><option value="admin">관리자</option><option value="grade3">Grade3</option><option value="grade2">Grade2</option><option value="grade1">Grade1</option></select></div>)}</div></section>}

    {canEdit && <section><h2>{editing ? "프로젝트 수정" : "새 프로젝트"}</h2>
      <div className="project-grid">
        <label>제조번호 *<input value={form.manufacturingNo} disabled={role === "grade2"} onChange={(e) => setForm({ ...form, manufacturingNo: e.target.value })} /></label>
        <label>Site *<select value={form.site} disabled={role === "grade2"} onChange={(e) => setForm({ ...form, site: e.target.value })}><option value="">선택</option>{sites.map((s) => <option key={s.id}>{s.name}</option>)}</select></label>
        <label className="wide">프로젝트명 *<input value={form.name} disabled={role === "grade2"} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <PersonInput label="PM 담당자" field="pm" department="PM" />
        <PersonInput label="설계 담당자" field="design" department="설계" />
        <PersonInput label="설비기술 담당자" field="facilityTechnology" department="설비기술" />
        <PersonInput label="제어 담당자" field="control" department="제어" />
        <PersonInput label="비전 담당자" field="vision" department="비전" />
        <label>시작일<input type="date" value={form.startDate} disabled={role === "grade2"} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
        <label>종료일<input type="date" value={form.endDate} disabled={role === "grade2"} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>
        <label>상태<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
      </div>
      <label className="check"><input type="checkbox" checked={form.autoProgress} onChange={(e) => setForm({ ...form, autoProgress: e.target.checked })} /> 자동 진행률</label>
      {!form.autoProgress && <input type="range" min="0" max="100" value={form.progress} onChange={(e) => setForm({ ...form, progress: e.target.value })} />}
      {canCreate && <div className="milestone-box"><h3>마일스톤 일괄 입력</h3>{milestones.map((m, index) => <div className="milestone-row" key={m.id}><span>{index + 1}</span><input placeholder="마일스톤 이름" value={m.name} onChange={(e) => updateMilestone(index, "name", e.target.value)} /><input type="date" value={m.date} onChange={(e) => updateMilestone(index, "date", e.target.value)} /></div>)}</div>}
      {message && <p className="notice">{message}</p>}
      <button className="primary" onClick={save}>{editing ? "수정 저장" : "프로젝트 추가"}</button>
    </section>}

    <section><div className="tools"><h2>프로젝트 목록</h2><input placeholder="제조번호, Site, 프로젝트명, 담당자 검색" value={search} onChange={(e) => setSearch(e.target.value)} />{["전체", "진행중", "완료", "지연"].map((x) => <button className={filter === x ? "active" : ""} onClick={() => setFilter(x)} key={x}>{x}</button>)}</div>
      <div className="cards">{visible.map((p) => <article key={p.id}><div><h3>{p.manufacturingNo || "제조번호 미등록"} · {p.name}</h3><p><b>Site</b> {p.site || "-"}</p><p><b>PM 담당자</b> {p.pm || "-"} · <b>설계 담당자</b> {p.design || "-"} · <b>설비기술 담당자</b> {p.facilityTechnology || "-"} · <b>제어 담당자</b> {p.control || "-"} · <b>비전 담당자</b> {p.vision || "-"}</p><p>{p.startDate} ~ {p.endDate} · {p.status}</p></div><div className="progress"><i style={{ width: `${p.value}%` }} /><b>{p.value}%</b></div><div>{canEdit && <button onClick={() => edit(p)}>수정</button>}{canDelete && <button className="danger" onClick={() => remove(p.id)}>삭제</button>}</div></article>)}</div>
    </section>
  </main>;
}
