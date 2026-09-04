import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { supabase } from "./supabase";
import Login from "./Login";

const DAY = 86400000;
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (n) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);
const parseDate = (value) => new Date(`${value}T00:00:00`);
const dayDiff = (a, b) => Math.round((parseDate(b) - parseDate(a)) / DAY);
const clamp = (value) => Math.max(0, Math.min(100, Number(value) || 0));
const makeId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const emptyForm = () => ({
  name: "",
  manager: "",
  startDate: today(),
  endDate: addDays(7),
  status: "진행예정",
  progress: 0,
  autoProgress: true,
  milestones: [],
});

function getProgress(project) {
  if (project.status === "완료") return 100;
  if (!project.autoProgress) return clamp(project.progress);
  const start = parseDate(project.startDate);
  const end = parseDate(project.endDate);
  const now = parseDate(today());
  if (now <= start) return 0;
  if (now >= end) return 100;
  return clamp(Math.round(((now - start) / Math.max(DAY, end - start)) * 100));
}

function fromDatabase(row) {
  return {
    id: row.id,
    name: row.name || "",
    manager: row.manager || "",
    startDate: row.start_date || today(),
    endDate: row.end_date || today(),
    status: row.status || "진행예정",
    progress: row.progress || 0,
    autoProgress: row.auto_progress ?? true,
    milestones: Array.isArray(row.milestones) ? row.milestones : [],
  };
}

function toDatabase(project) {
  return {
    id: project.id,
    name: project.name,
    manager: project.manager,
    start_date: project.startDate,
    end_date: project.endDate,
    status: project.status,
    progress: clamp(project.progress),
    auto_progress: project.autoProgress,
    milestones: project.milestones || [],
  };
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState("전체");
  const [search, setSearch] = useState("");
  const [milestoneName, setMilestoneName] = useState("");
  const [milestoneDate, setMilestoneDate] = useState(today());
  const [message, setMessage] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setAuthLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setAuthLoading(false);
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setProjects([]);
      return;
    }

    loadProjects();

    const channel = supabase
      .channel("projects-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects" },
        () => loadProjects()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session]);

  async function loadProjects() {
    setDataLoading(true);
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) setMessage(`불러오기 실패: ${error.message}`);
    else setProjects((data || []).map(fromDatabase));
    setDataLoading(false);
  }

  const enrichedProjects = useMemo(
    () => projects.map((project) => ({
      ...project,
      calculatedProgress: getProgress(project),
      overdue: project.status !== "완료" && parseDate(project.endDate) < parseDate(today()),
    })),
    [projects]
  );

  const visibleProjects = enrichedProjects.filter((project) => {
    const keyword = `${project.name} ${project.manager}`.toLowerCase();
    if (!keyword.includes(search.toLowerCase())) return false;
    if (filter === "진행중") return project.status !== "완료";
    if (filter === "완료") return project.status === "완료";
    if (filter === "지연") return project.overdue;
    return true;
  });

  const completedCount = enrichedProjects.filter((p) => p.status === "완료").length;
  const overdueCount = enrichedProjects.filter((p) => p.overdue).length;
  const averageProgress = enrichedProjects.length
    ? Math.round(enrichedProjects.reduce((sum, p) => sum + p.calculatedProgress, 0) / enrichedProjects.length)
    : 0;

  const timelineStart = enrichedProjects.length
    ? new Date(Math.min(...enrichedProjects.map((p) => parseDate(p.startDate).getTime())))
    : parseDate(today());
  const timelineEnd = enrichedProjects.length
    ? new Date(Math.max(...enrichedProjects.map((p) => parseDate(p.endDate).getTime())))
    : parseDate(addDays(7));
  const timelineStartKey = timelineStart.toISOString().slice(0, 10);
  const timelineEndKey = timelineEnd.toISOString().slice(0, 10);
  const timelineDays = Math.max(1, dayDiff(timelineStartKey, timelineEndKey) + 1);
  const positionFor = (date) => Math.max(0, Math.min(100, (dayDiff(timelineStartKey, date) / timelineDays) * 100));

  function addMilestone() {
    if (!milestoneName.trim() || !milestoneDate) {
      setMessage("마일스톤 이름과 날짜를 입력하세요.");
      return;
    }
    if (parseDate(milestoneDate) < parseDate(form.startDate) || parseDate(milestoneDate) > parseDate(form.endDate)) {
      setMessage("마일스톤은 프로젝트 기간 안에 있어야 합니다.");
      return;
    }
    setForm((current) => ({
      ...current,
      milestones: [...current.milestones, { id: makeId(), name: milestoneName.trim(), date: milestoneDate }]
        .sort((a, b) => a.date.localeCompare(b.date)),
    }));
    setMilestoneName("");
    setMessage("");
  }

  async function saveProject() {
    if (!form.name.trim()) return setMessage("프로젝트명을 입력하세요.");
    if (!form.startDate || !form.endDate || parseDate(form.endDate) < parseDate(form.startDate)) {
      return setMessage("종료일은 시작일과 같거나 이후여야 합니다.");
    }

    setMessage("저장 중...");
    const project = {
      ...form,
      id: editingId || makeId(),
      name: form.name.trim(),
      manager: form.manager.trim(),
      progress: clamp(form.progress),
    };

    const query = editingId
      ? supabase.from("projects").update(toDatabase(project)).eq("id", editingId)
      : supabase.from("projects").insert(toDatabase(project));

    const { error } = await query;
    if (error) {
      setMessage(`저장 실패: ${error.message}`);
      return;
    }

    setForm(emptyForm());
    setEditingId(null);
    setMilestoneName("");
    setMilestoneDate(today());
    setMessage(editingId ? "프로젝트를 수정했습니다." : "프로젝트를 추가했습니다.");
    await loadProjects();
  }

  function editProject(project) {
    setForm({
      name: project.name,
      manager: project.manager,
      startDate: project.startDate,
      endDate: project.endDate,
      status: project.status,
      progress: project.progress,
      autoProgress: project.autoProgress,
      milestones: project.milestones || [],
    });
    setEditingId(project.id);
    setMilestoneDate(project.startDate);
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteProject(id) {
    if (!window.confirm("이 프로젝트를 삭제할까요?")) return;
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) setMessage(`삭제 실패: ${error.message}`);
    else {
      setMessage("프로젝트를 삭제했습니다.");
      await loadProjects();
    }
  }

  function exportCsv() {
    const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["프로젝트명", "담당자", "시작일", "종료일", "상태", "진행률", "계산방식", "마일스톤"],
      ...enrichedProjects.map((p) => [
        p.name, p.manager, p.startDate, p.endDate, p.status, `${p.calculatedProgress}%`,
        p.autoProgress ? "자동" : "수동",
        (p.milestones || []).map((m) => `${m.name}(${m.date})`).join(" / "),
      ]),
    ];
    const csv = "\ufeff" + rows.map((row) => row.map(escape).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `프로젝트일정_${today()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (authLoading) return <div className="center-message">로그인 상태 확인 중...</div>;
  if (!session) return <Login />;

  return (
    <main className="app-shell">
      <div className="container">
        <header className="hero">
          <div>
            <span className="eyebrow">TEAM PROJECT HUB</span>
            <h1>프로젝트 일정 관리</h1>
            <p>일정, 진행률, 마일스톤을 팀원들과 함께 관리하세요.</p>
          </div>
          <div className="header-actions">
            <span className="user-email">{session.user.email}</span>
            <button className="logout-button" onClick={() => supabase.auth.signOut()}>로그아웃</button>
            <button className="export-button" onClick={exportCsv} disabled={!projects.length}>Excel용 CSV</button>
          </div>
        </header>

        <section className="stats">
          <div className="stat"><span>전체 프로젝트</span><strong>{projects.length}</strong></div>
          <div className="stat"><span>완료 프로젝트</span><strong>{completedCount}</strong></div>
          <div className="stat"><span>지연 프로젝트</span><strong className="danger-text">{overdueCount}</strong></div>
          <div className="stat"><span>평균 진행률</span><strong>{averageProgress}%</strong></div>
        </section>

        <section className="panel">
          <h2>{editingId ? "프로젝트 수정" : "새 프로젝트"}</h2>
          <div className="form-grid">
            <label><span>프로젝트명 *</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: 신규 서비스 출시" /></label>
            <label><span>담당자</span><input value={form.manager} onChange={(e) => setForm({ ...form, manager: e.target.value })} placeholder="담당자 이름" /></label>
            <label><span>시작일</span><input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
            <label><span>종료일</span><input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>
            <label><span>상태</span><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option>진행예정</option><option>진행중</option><option>보류</option><option>완료</option></select></label>
          </div>

          <div className="progress-box">
            <label className="check-line"><input type="checkbox" checked={form.autoProgress} onChange={(e) => setForm({ ...form, autoProgress: e.target.checked })} /> 기간 기준 진행률 자동 계산</label>
            <small>오늘 날짜를 기준으로 시작 전 0%, 종료일 100%로 계산합니다.</small>
            {!form.autoProgress && <label className="range-line"><span>수동 진행률: {form.progress}%</span><input type="range" min="0" max="100" value={form.progress} onChange={(e) => setForm({ ...form, progress: Number(e.target.value) })} /></label>}
          </div>

          <div className="milestone-box">
            <h3>마일스톤</h3>
            <div className="milestone-entry">
              <input value={milestoneName} onChange={(e) => setMilestoneName(e.target.value)} placeholder="예: 디자인 확정" />
              <input type="date" value={milestoneDate} onChange={(e) => setMilestoneDate(e.target.value)} />
              <button onClick={addMilestone}>추가</button>
            </div>
            <div className="chips">{form.milestones.map((m) => <span className="chip" key={m.id}>◆ {m.name} · {m.date}<button onClick={() => setForm({ ...form, milestones: form.milestones.filter((x) => x.id !== m.id) })}>×</button></span>)}</div>
          </div>

          {message && <p className="message">{message}</p>}
          <div className="actions">
            <button className="primary" onClick={saveProject}>{editingId ? "수정 저장" : "프로젝트 추가"}</button>
            {editingId && <button className="secondary" onClick={() => { setEditingId(null); setForm(emptyForm()); setMessage(""); }}>취소</button>}
          </div>
        </section>

        <section className="panel">
          <div className="toolbar">
            <div><h2>간트 차트 및 프로젝트 목록</h2><p>지연 프로젝트는 빨간색으로 표시됩니다.</p></div>
            <input className="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="프로젝트 또는 담당자 검색" />
          </div>
          <div className="filters">{["전체", "진행중", "완료", "지연"].map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div>

          {dataLoading ? <div className="empty">프로젝트를 불러오는 중...</div> : (
            <div className="project-list">
              {visibleProjects.map((project) => {
                const barLeft = positionFor(project.startDate);
                const barWidth = Math.max(2, ((dayDiff(project.startDate, project.endDate) + 1) / timelineDays) * 100);
                return <article className="project-card" key={project.id}>
                  <div className="project-top"><div><h3>{project.name}</h3><p>{project.manager || "담당자 미지정"} · {project.status}</p></div><span className={project.overdue ? "badge overdue" : "badge"}>{project.overdue ? "지연" : `${project.calculatedProgress}%`}</span></div>
                  <p className="dates">{project.startDate} ~ {project.endDate}</p>
                  <div className="gantt">
                    <div className={project.overdue ? "gantt-bar overdue-bar" : "gantt-bar"} style={{ left: `${barLeft}%`, width: `${Math.min(barWidth, 100 - barLeft)}%` }}><div style={{ width: `${project.calculatedProgress}%` }} /><span>{project.calculatedProgress}%</span></div>
                    {(project.milestones || []).map((m) => <span key={m.id} className="diamond" title={`${m.name} · ${m.date}`} style={{ left: `${positionFor(m.date)}%` }}>◆</span>)}
                  </div>
                  <div className="card-actions"><button onClick={() => editProject(project)}>수정</button><button className="delete" onClick={() => deleteProject(project.id)}>삭제</button></div>
                </article>;
              })}
              {!visibleProjects.length && <div className="empty">조건에 맞는 프로젝트가 없습니다.</div>}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
