import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import "./TripManagement.css";
import {
  fetchTripData, createMember, updateMember, deleteMember, insertMembers,
  createAssignment, updateAssignment, deleteAssignment, createAbsence, deleteAbsence,
  saveDeptNote,
} from "./tripService";
import {
  TRIP_DEPTS, TRIP_DEPT_LABEL, ABSENCE_KIND_LABEL, DOW_LABEL,
  buildColumns, mondayOf, todayISO, addDays, overlaps, weeksBetween, monthSpans, shortDate, rangeLabel,
  needForWeek, haveForWeek, planCoverage, shortageRuns, analyzeAssignments, worstLevel,
  memberWeekState, deptWeekStats, projectsToPlans, buildDemands, assignmentState, isPastProject, guessDept,
  peakNeed, layoutLanes, laneCellState, laneGapRange, phaseColors,
} from "./tripLogic";
import { normalizeDeptKey } from "./manpowerDepts";
import { confirmDialog } from "./confirmService";
import { downloadMemberTemplate, downloadMemberRoster } from "./tripTemplate";
import ProjectPicker from "./TripProjectPicker";
import { AssignmentModal, MemberModal, ImportModal } from "./TripModals";

const TABS = [
  { id: "board", label: "출장자 배정", icon: "calendar" },
  { id: "roster", label: "부서 인원 현황", icon: "users" },
  { id: "members", label: "팀원 관리", icon: "list" },
  { id: "summary", label: "종합·확인 사항", icon: "barChart" },
];
const MAX_BOARD_WEEKS = 78;
const WEEK_COUNTS = [8, 12, 16, 26, 40]; // 주 단위 보기에서 보여 줄 주 수
const DAY_WEEKS = [2, 4, 8, 12]; // 일 단위 보기에서 보여 줄 주 수 (칸 수는 ×7)
const ABSENCE_MARK = { trip: "출", leave: "휴", training: "교", other: "기" };

const safeGet = (key, fallback) => {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
};
const safeSet = (key, value) => {
  try { localStorage.setItem(key, value); } catch { /* 저장소를 못 써도 화면은 동작한다 */ }
};

export default function TripManagement({ role, myTeam = "", projects = [], onPermissionDenied }) {
  // 조회·수정은 PM 이상과 모든 부서 팀장(grade2_5)이 할 수 있다. 자기 부서가 아닌 것을 고칠 때는 확인만 받는다.
  const canView = ["admin", "grade3", "grade2_5"].includes(role);
  const canWrite = canView;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(canView);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState(() => (TABS.some((t) => t.id === safeGet("pm_trip_tab", "")) ? safeGet("pm_trip_tab", "board") : "board"));
  const [viewMode, setViewMode] = useState(() => (safeGet("pm_trip_view", "week") === "day" ? "day" : "week"));
  const [planId, setPlanId] = useState(() => safeGet("pm_trip_plan", ""));
  const [showPast, setShowPast] = useState(false);
  const [winStart, setWinStart] = useState(() => mondayOf(todayISO()));
  const [winCount, setWinCount] = useState(12);
  const [dayWeeks, setDayWeeks] = useState(4);
  const [myDeptSaved, setMyDeptSaved] = useState(() => safeGet("pm_trip_mydept", ""));
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState(null);
  const noticeTimer = useRef(null);
  const loadedAt = useRef(0);

  const flash = useCallback((type, text) => {
    setNotice({ type, text });
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), type === "err" ? 8000 : 3500);
  }, []);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const applyResult = useCallback((res) => {
    loadedAt.current = Date.now();
    if (res.error) setLoadError(res.error);
    else { setLoadError(""); setData(res.data); }
    setLoading(false);
  }, []);
  const reload = useCallback(async () => { applyResult(await fetchTripData()); }, [applyResult]);
  // 사용자가 직접 누른 새로고침: 읽는 동안 "불러오는 중"을 보여 준다
  const refresh = () => { setLoading(true); reload(); };

  // 처음 열 때 한 번 읽는다 (화면을 떠난 뒤에 도착한 응답은 버린다)
  useEffect(() => {
    if (!canView) return undefined;
    let alive = true;
    fetchTripData().then((res) => { if (alive) applyResult(res); });
    return () => { alive = false; };
  }, [canView, applyResult]);

  // 다른 사람이 고친 내용을 보려고: 창으로 돌아왔을 때 1분 이상 지났으면 조용히 다시 읽는다 (열려 있는 입력창이 없을 때만)
  useEffect(() => {
    if (!canView) return undefined;
    const onVisible = () => {
      if (document.visibilityState === "visible" && !modal && Date.now() - loadedAt.current > 60000) reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [canView, modal, reload]);

  useEffect(() => { safeSet("pm_trip_tab", tab); }, [tab]);
  useEffect(() => { safeSet("pm_trip_view", viewMode); }, [viewMode]);
  useEffect(() => { if (planId) safeSet("pm_trip_plan", planId); }, [planId]);

  const members = useMemo(() => data?.members || [], [data]);
  // 프로젝트는 프로젝트 일정에 등록된 것을 그대로 쓴다 (완료 시점이 지난 것도 포함, 화면에서 숨긴다)
  const plans = useMemo(() => projectsToPlans(projects), [projects]);
  // 계획 공수 = 프로젝트 마스터 플랜 공수 (화면에서 고치지 않는다)
  const demands = useMemo(() => buildDemands(plans, [], (name) => {
    const k = normalizeDeptKey(name);
    return TRIP_DEPT_LABEL[k] ? k : null;
  }), [plans]);
  const assignments = useMemo(() => data?.assignments || [], [data]);
  const absences = useMemo(() => data?.absences || [], [data]);
  const notes = useMemo(() => data?.notes || [], [data]);

  const ctx = useMemo(() => ({ assignments, absences, members, plans }), [assignments, absences, members, plans]);
  const issuesByAssignment = useMemo(() => analyzeAssignments(ctx), [ctx]);

  // 팀장(grade2_5)의 "내 부서": 직접 고른 값, 없으면 계정의 소속 팀 이름에서 추정한 값. 다른 부서를 수정할 때 확인 창을 띄우는 기준이다.
  const myDept = role === "grade2_5"
    ? (myDeptSaved === "none" ? "" : TRIP_DEPT_LABEL[myDeptSaved] ? myDeptSaved : guessDept(myTeam) || "")
    : "";
  const chooseMyDept = (value) => { setMyDeptSaved(value || "none"); safeSet("pm_trip_mydept", value || "none"); };
  const canEditDept = useCallback(() => canWrite, [canWrite]);
  const editableDepts = useMemo(() => (canWrite ? TRIP_DEPTS.map((d) => d.key) : []), [canWrite]);

  const planIndex = useMemo(() => new Map(plans.map((p, i) => [p.id, i])), [plans]);
  const today = todayISO();
  // 프로젝트마다 배정 상태: none(아직 아무도 없음) / short(일부 부족) / ok
  const planStates = useMemo(() => new Map(plans.map((p) => [p.id, assignmentState(p, demands, assignments, today)])), [plans, demands, assignments, today]);

  // ── 쓰기 공통 ──
  async function run(task, okText, { close = true } = {}) {
    const res = await task;
    if (res?.error) return { error: res.error };
    await reload();
    if (okText) flash("ok", okText);
    if (close) setModal(null);
    return {};
  }

  // 내 부서가 아닌 부서의 것을 바꾸려 할 때 한 번 묻는다. 취소하면 아무것도 저장하지 않는다.
  const guard = useCallback(async (depts, what) => {
    if (!myDept) return true;
    const other = [...new Set(depts.filter(Boolean))].filter((x) => x !== myDept);
    if (other.length === 0) return true;
    return confirmDialog({
      title: "내 부서가 아닙니다",
      message: `${other.map((x) => TRIP_DEPT_LABEL[x]).join("·")} 부서의 ${what}입니다. 내 부서(${TRIP_DEPT_LABEL[myDept]})의 인원이 아닙니다. 그래도 수정할까요?`,
      detail: "그 부서 팀장이 정리해 둔 내용을 바꾸게 됩니다.",
      confirmLabel: "그래도 수정",
      danger: false,
    });
  }, [myDept]);
  const deptOfMember = (id) => members.find((m) => m.id === id)?.dept;
  const cancelled = { cancelled: true };

  const actions = {
    saveAssignment: async (a) => ((await guard([a.dept], "출장자 배정")) ? run(a.id ? updateAssignment(a.id, a) : createAssignment(a), a.id ? "배정을 수정했습니다." : "출장자를 배정했습니다.") : cancelled),
    deleteAssignment: async (id) => ((await guard([assignments.find((x) => x.id === id)?.dept], "출장자 배정")) ? run(deleteAssignment(id), "배정을 삭제했습니다.") : cancelled),
    saveMember: async (id, m) => ((await guard([m.dept, id ? deptOfMember(id) : null], "인원")) ? run(id ? updateMember(id, m) : createMember(m), id ? "인원 정보를 저장했습니다." : "인원을 추가했습니다.") : cancelled),
    deleteMember: async (id) => ((await guard([deptOfMember(id)], "인원")) ? run(deleteMember(id), "인원을 삭제했습니다.") : cancelled),
    addAbsence: async (a) => ((await guard([deptOfMember(a.member_id)], "인원")) ? run(createAbsence(a), "출장 불가 기간을 추가했습니다.", { close: false }) : cancelled),
    deleteAbsence: async (id) => ((await guard([deptOfMember(absences.find((x) => x.id === id)?.member_id)], "인원")) ? run(deleteAbsence(id), "출장 불가 기간을 삭제했습니다.", { close: false }) : cancelled),
    saveNote: async (n) => ((await guard([n.dept], "특이사항")) ? run(saveDeptNote(n), "", { close: false }) : cancelled),
  };

  // 교대: 들어오는 사람을 먼저 넣고, 나가는 사람의 종료일을 마지막 근무일로 줄인다. 두 번째가 실패하면 첫 번째를 되돌린다.
  async function rotate({ outgoing, handover, incoming }) {
    if (!(await guard([outgoing.dept], "출장자 교대"))) return cancelled;
    const created = await createAssignment(incoming);
    if (created.error) return { error: created.error };
    const shortened = await updateAssignment(outgoing.id, { ...outgoing, end_date: handover });
    if (shortened.error) {
      await deleteAssignment(created.data.id);
      await reload();
      return { error: `${shortened.error} (교대는 반영되지 않았습니다)` };
    }
    await reload();
    flash("ok", `교대를 저장했습니다. (${shortDate(handover)}까지 근무 → ${shortDate(incoming.start_date)}부터 교대 인원)`);
    setModal(null);
    return {};
  }

  async function importMembers({ create, update, deactivate }) {
    if (!(await guard([...create.map((r) => r.dept), ...update.map((u) => u.base.dept), ...deactivate.map((x) => x.base.dept)], "인원"))) return cancelled;
    if (create.length) {
      const res = await insertMembers(create);
      if (res.error) return { error: res.error };
    }
    const changes = [
      ...update.map((u) => ({ id: u.id, name: u.base.name, next: u.merged })),
      ...deactivate.map((d) => ({ id: d.id, name: d.base.name, next: { ...d.base, active: false } })),
    ];
    for (const c of changes) {
      const res = await updateMember(c.id, c.next);
      if (res.error) {
        await reload();
        return { error: `${c.name}: ${res.error} (앞의 항목은 이미 반영되었습니다)` };
      }
    }
    await reload();
    flash("ok", [create.length ? `${create.length}명 추가` : "", update.length ? `${update.length}명 갱신` : "", deactivate.length ? `${deactivate.length}명 퇴사 처리` : ""].filter(Boolean).join(", ") + "했습니다.");
    setModal(null);
    return {};
  }

  if (!canView) {
    return (
      <div className="tr-gate">
        <Icon name="lock" size={28} />
        <h3>출장자 관리는 PM(Grade 3) 이상 또는 팀장(Grade 2.5)만 이용할 수 있습니다</h3>
        <p>인사 정보(비자 등)가 포함되어 있어 조회 권한을 제한합니다.</p>
        <button type="button" className="tr-btn" onClick={() => onPermissionDenied?.("출장자 관리")}>권한 안내 보기</button>
      </div>
    );
  }

  // 완료 시점이 지난 프로젝트는 기본으로 숨긴다 (지금 보고 있는 것은 예외)
  const visiblePlans = plans.filter((p) => showPast || !isPastProject(p, today) || p.id === planId);
  const pastCount = plans.filter((p) => isPastProject(p, today)).length;
  // 처음에는 "배정이 필요한" 프로젝트를 먼저 보여 준다
  const firstNeed = visiblePlans.find((p) => planStates.get(p.id)?.state === "none");
  const plan = plans.find((p) => p.id === planId) || firstNeed || visiblePlans[0] || null;

  const goBoard = (id) => { setPlanId(id); setTab("board"); };

  const timeProps = { viewMode, winStart, setWinStart, winCount, setWinCount, dayWeeks, setDayWeeks };

  return (
    <>
      <div className="system-sticky-header">
        <div className="system-header-row">
          <div className="system-title-group">
            <div className="system-title-text">
              <span className="eyebrow">Business Trip</span>
              <h2>출장자 관리 시스템</h2>
              <p>모든 고객사 프로젝트의 계획 공수에 맞춘 출장자 배정과 부서 인원 현황</p>
            </div>
          </div>
          <div className="system-header-actions tr-header-actions">
            <div className="tr-mode" role="group" aria-label="보기 단위">
              <button type="button" className={viewMode === "day" ? "on" : ""} onClick={() => setViewMode("day")}>일 단위</button>
              <button type="button" className={viewMode === "week" ? "on" : ""} onClick={() => setViewMode("week")}>주 단위</button>
            </div>
            <button type="button" className="system-toggle-all-btn" onClick={refresh} title="최신 내용으로 다시 불러오기">
              <Icon name="refresh" size="1.1em" /> 새로고침
            </button>
            {role === "grade2_5" && (
              <label className="tr-mydept" title="다른 부서의 것을 수정하려 할 때 확인 창을 띄우는 기준입니다">
                내 부서
                <select value={myDept} onChange={(e) => chooseMyDept(e.target.value)} data-dept={myDept || undefined}>
                  <option value="">선택 안 함</option>
                  {TRIP_DEPTS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select>
              </label>
            )}
          </div>
        </div>
        <div className="system-sub-nav">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={`system-sub-btn ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              <Icon name={t.icon} size={15} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="tr-root">
        {notice && <div className={`tr-notice ${notice.type}`} role="status">{notice.text}</div>}

        {loading && !data && <div className="tr-loading">출장자 데이터를 불러오는 중...</div>}
        {loadError && (
          <div className="tr-load-error" role="alert">
            <Icon name="alert" size={18} />
            <div>
              <strong>출장자 데이터를 불러오지 못했습니다</strong>
              <p>{loadError}</p>
            </div>
            <button type="button" className="tr-btn" onClick={refresh}>다시 시도</button>
          </div>
        )}

        {data && tab === "board" && (
          <Board
            plans={plans} visiblePlans={visiblePlans} plan={plan} planStates={planStates}
            showPast={showPast} setShowPast={setShowPast} pastCount={pastCount} setPlanId={setPlanId}
            demands={demands} assignments={assignments} members={members} notes={notes}
            issuesByAssignment={issuesByAssignment} viewMode={viewMode}
            canWrite={canWrite} canEditDept={canEditDept} today={today}
            setModal={setModal} saveNote={actions.saveNote}
          />
        )}
        {data && tab === "roster" && (
          <Roster
            members={members} demands={demands} defaultDept={myDept || "all"} ctx={ctx} planIndex={planIndex} today={today}
            {...timeProps} editableDepts={editableDepts} setModal={setModal}
          />
        )}
        {data && tab === "members" && (
          <Members
            members={members} ctx={ctx} today={today} editableDepts={editableDepts} defaultDept={myDept || "all"} myDept={myDept}
            setModal={setModal} flash={flash} reload={reload} guard={guard}
          />
        )}
        {data && tab === "summary" && (
          <Summary
            plans={plans} members={members} demands={demands} assignments={assignments} ctx={ctx}
            issuesByAssignment={issuesByAssignment} today={today} {...timeProps} goBoard={goBoard}
          />
        )}
      </div>

      {modal?.type === "assignment" && (
        <AssignmentModal plan={modal.plan} dept={modal.dept} assignment={modal.assignment} defaults={modal.defaults} ctx={ctx}
          canEdit={canEditDept(modal.dept)} onSave={actions.saveAssignment} onDelete={actions.deleteAssignment} onRotate={rotate} onClose={() => setModal(null)} />
      )}
      {modal?.type === "member" && (
        <MemberModal member={modal.member} defaultDept={modal.defaultDept || myDept} editableDepts={editableDepts} absences={absences}
          onSave={actions.saveMember} onDelete={actions.deleteMember}
          onAddAbsence={actions.addAbsence} onDeleteAbsence={actions.deleteAbsence} onClose={() => setModal(null)} />
      )}
      {modal?.type === "import" && (
        <ImportModal existing={members} editableDepts={editableDepts} defaultDept={myDept} onImport={importMembers} onClose={() => setModal(null)} />
      )}
    </>
  );
}

// ───────────────────────────── 시간 칸 머리글 (일/주 공통) ─────────────────────────────

function TimeHead({ cols, today, phases, phaseIdx = [], leftHead, extraLeft = [], mode }) {
  const spans = monthSpans(cols);
  const phaseCells = [];
  if (phases?.length) {
    const idxOf = (c) => phases.findIndex((p) => overlaps(p.start, p.end, c.start, c.end));
    let i = 0;
    while (i < cols.length) {
      const idx = idxOf(cols[i]);
      let j = i + 1;
      while (j < cols.length && idxOf(cols[j]) === idx) j += 1;
      phaseCells.push({ span: j - i, label: idx >= 0 ? phases[idx].label : "", color: idx >= 0 ? phaseIdx[idx] : -1 });
      i = j;
    }
  }
  const rowSpan = (mode === "day" ? 3 : 2) + (phases?.length ? 1 : 0);
  return (
    <thead>
      <tr>
        <th className="tr-col-name" rowSpan={rowSpan}>{leftHead}</th>
        {extraLeft.map((x) => <th key={x.key} className={x.className} rowSpan={rowSpan}>{x.label}</th>)}
        {spans.map((s) => <th key={s.key} colSpan={s.span} className="month">{s.span < 3 ? s.shortLabel : s.label}</th>)}
      </tr>
      {mode === "day" ? (
        <>
          <tr>
            {cols.map((c) => (
              <th key={c.key} className={`dy ${c.weekend ? "we" : ""} ${c.weekStart ? "ws" : ""} ${c.start === today ? "now" : ""}`} title={c.start}>{Number(c.start.slice(8))}</th>
            ))}
          </tr>
          <tr>
            {cols.map((c) => (
              <th key={c.key} className={`dw ${c.weekend ? "we" : ""} ${c.weekStart ? "ws" : ""} ${c.start === today ? "now" : ""}`}>{DOW_LABEL[c.dow]}</th>
            ))}
          </tr>
        </>
      ) : (
        <tr>
          {cols.map((c) => (
            <th key={c.key} className={`wk ${c.start <= today && today <= c.end ? "now" : ""}`} title={`${c.start} ~ ${c.end}`}>{shortDate(c.start)}</th>
          ))}
        </tr>
      )}
      {phases?.length > 0 && (
        <tr>
          {phaseCells.map((c, i) => <th key={i} colSpan={c.span} className={`phase ${c.label ? `has ms-${c.color}` : ""}`} title={c.label}>{c.label}</th>)}
        </tr>
      )}
    </thead>
  );
}

const colClass = (c, today) => `${c.weekend ? "we" : ""} ${c.weekStart ? "ws" : ""} ${c.day && c.start === today ? "today" : !c.day && c.start <= today && today <= c.end ? "today" : ""}`;

// ───────────────────────────── 기간 창 조절 ─────────────────────────────

function WindowBar({ viewMode, winStart, setWinStart, winCount, setWinCount, dayWeeks, setDayWeeks, today }) {
  const step = viewMode === "day" ? 7 : 28;
  const stepLabel = viewMode === "day" ? "1주" : "4주";
  return (
    <div className="tr-window-bar">
      <button type="button" className="tr-btn small" onClick={() => setWinStart(addDays(winStart, -step))} aria-label={`${stepLabel} 이전`}><Icon name="chevLeft" size={14} /> {stepLabel}</button>
      <button type="button" className="tr-btn small" onClick={() => setWinStart(mondayOf(today))}>이번 주</button>
      <button type="button" className="tr-btn small" onClick={() => setWinStart(addDays(winStart, step))} aria-label={`${stepLabel} 이후`}>{stepLabel} <Icon name="chevRight" size={14} /></button>
      <label className="tr-inline-field">시작 주
        <input type="date" value={winStart} onChange={(e) => e.target.value && setWinStart(mondayOf(e.target.value))} />
      </label>
      <label className="tr-inline-field">표시
        {viewMode === "day" ? (
          <select value={dayWeeks} onChange={(e) => setDayWeeks(Number(e.target.value))}>
            {DAY_WEEKS.map((n) => <option key={n} value={n}>{n}주 ({n * 7}일)</option>)}
          </select>
        ) : (
          <select value={winCount} onChange={(e) => setWinCount(Number(e.target.value))}>
            {WEEK_COUNTS.map((n) => <option key={n} value={n}>{n}주</option>)}
          </select>
        )}
      </label>
    </div>
  );
}

// ───────────────────────────── 출장자 배정 보드 ─────────────────────────────

function DeptNote({ value, editable, onSave }) {
  const [text, setText] = useState(value);
  const [saving, setSaving] = useState(false);
  if (!editable) return <span className="tr-note-text">{value || "-"}</span>;
  return (
    <input
      type="text" className="tr-note-input" value={text} maxLength={200} disabled={saving}
      placeholder="부서 특이사항 (예: 1인 1/4~17 3라인 대응 후 4라인)"
      onChange={(e) => setText(e.target.value)}
      onBlur={async () => {
        if (text.trim() === (value || "").trim()) return;
        setSaving(true);
        const res = await onSave(text);
        setSaving(false);
        if (res?.error || res?.cancelled) setText(value);
      }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      aria-label="부서 특이사항"
    />
  );
}

function Board(props) {
  const { plans, visiblePlans, plan, planStates, showPast, setShowPast, pastCount, setPlanId, today } = props;
  const [showAllNeed, setShowAllNeed] = useState(false);
  // 배정이 필요한 프로젝트: 지나지 않은 것 중 아무도 배정 안 된 것(앞), 일부 부족한 것(뒤)
  const needList = useMemo(() => {
    const open = plans.filter((p) => !isPastProject(p, today));
    return [...open.filter((p) => planStates.get(p.id)?.state === "none"), ...open.filter((p) => planStates.get(p.id)?.state === "short")];
  }, [plans, planStates, today]);

  if (plans.length === 0) {
    return (
      <div className="tr-empty">
        <Icon name="briefcase" size={30} />
        <h3>프로젝트 일정에 등록된 프로젝트가 없습니다</h3>
        <p>프로젝트 일정에서 프로젝트를 등록하면 이곳에 자동으로 나타나고, 프로젝트의 계획 공수에 맞춰 출장자를 배정할 수 있습니다.</p>
      </div>
    );
  }

  const noneCount = needList.filter((p) => planStates.get(p.id).state === "none").length;
  const shortCount = needList.length - noneCount;
  return (
    <div className="tr-board">
      {needList.length > 0 && (
        <div className="tr-need" role="region" aria-label="배정이 필요한 프로젝트">
          <div className="tr-need-head">
            <Icon name="alert" size={16} />
            <strong>출장자 배정이 필요한 프로젝트 {noneCount}건</strong>
            {shortCount > 0 && <span className="tr-muted">· 인원 부족 {shortCount}건</span>}
          </div>
          <div className="tr-need-list">
            {(showAllNeed ? needList : needList.slice(0, 6)).map((p) => {
              const st = planStates.get(p.id);
              return (
                <button key={p.id} type="button" className={`tr-need-item ${st.state} ${plan?.id === p.id ? "on" : ""}`} onClick={() => setPlanId(p.id)}>
                  <span className={`tr-state ${st.state}`}>{st.state === "none" ? "미배정" : `${st.shortDepts.map((d) => TRIP_DEPT_LABEL[d]).join("·")} 부족`}</span>
                  <b>{p.name}</b>
                  <span className="sub">{[p.site, rangeLabel(p.start_date, p.end_date)].filter(Boolean).join(" · ")}</span>
                </button>
              );
            })}
            {needList.length > 6 && <button type="button" className="tr-btn small" onClick={() => setShowAllNeed((v) => !v)}>{showAllNeed ? "접기" : `${needList.length - 6}건 더 보기`}</button>}
          </div>
        </div>
      )}

      <div className="tr-panel tr-plan-bar">
        <ProjectPicker plans={visiblePlans} states={planStates} selectedId={plan?.id} onSelect={setPlanId} showPast={showPast} setShowPast={setShowPast} pastCount={pastCount} />
        <span className="tr-muted">전체 고객사 {visiblePlans.length}개 프로젝트{pastCount && !showPast ? ` · 완료 시점이 지난 ${pastCount}개는 숨김` : ""}</span>
      </div>

      {plan ? <PlanBoard key={plan.id} {...props} /> : <p className="tr-empty-line">표시할 프로젝트가 없습니다.</p>}
    </div>
  );
}

// 프로젝트 하나의 배정판: 부서마다 계획 공수만큼 칸(줄)을 만들고, 칸을 눌러 출장 가능자를 넣는다
function PlanBoard({ plan, planStates, demands, assignments, members, notes, issuesByAssignment, viewMode, canEditDept, today, setModal, saveNote }) {
  const planDemands = useMemo(() => demands.filter((d) => d.project_id === plan.id), [demands, plan.id]);
  const planAssignments = useMemo(() => assignments.filter((a) => a.project_id === plan.id), [assignments, plan.id]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  // 일 단위 보기의 시작 주: 프로젝트 기간 안의 이번 주(기간 밖이면 시작 주)
  const initialStart = () => {
    const t = mondayOf(today);
    if (t < mondayOf(plan.start_date)) return mondayOf(plan.start_date);
    if (t > plan.end_date) return mondayOf(plan.start_date);
    return t;
  };
  const [dayStart, setDayStart] = useState(initialStart);
  // 일 단위 표시 범위: "all" = 프로젝트 전체를 한 줄로(좁은 칸, 옆으로 넘기며 봄), 숫자 = 그 주 수만큼
  const [range, setRange] = useState(() => (DAY_WEEKS.includes(Number(safeGet("pm_trip_dayrange", ""))) ? Number(safeGet("pm_trip_dayrange", "")) : "all"));
  const chooseRange = (v) => { const next = v === "all" ? "all" : Number(v); setRange(next); safeSet("pm_trip_dayrange", String(next)); };
  const lastMon = mondayOf(plan.end_date);
  const wrapRef = useRef(null);

  const totalWeeks = Math.min(MAX_BOARD_WEEKS, weeksBetween(plan.start_date, plan.end_date));
  const dayAll = viewMode === "day" && range === "all";
  const cols = useMemo(() => {
    if (viewMode !== "day") return buildColumns("week", plan.start_date, totalWeeks);
    if (range === "all") return buildColumns("day", plan.start_date, totalWeeks * 7);
    return buildColumns("day", dayStart, range * 7);
  }, [viewMode, dayStart, range, plan.start_date, totalWeeks]);
  const phaseIdx = useMemo(() => phaseColors(plan.phases), [plan.phases]);

  // 긴 프로젝트: 열 때 오늘 칸이 보이도록 옆으로 옮겨 둔다 (프로젝트 기간 밖이면 처음부터)
  const scrollToToday = useCallback((smooth = false) => {
    const wrap = wrapRef.current;
    const mark = wrap?.querySelector("thead th.now");
    if (!wrap || !mark) return;
    const w = wrap.getBoundingClientRect();
    const t = mark.getBoundingClientRect();
    wrap.scrollTo({ left: Math.max(0, wrap.scrollLeft + t.left - w.left - 300), behavior: smooth ? "smooth" : "auto" });
  }, []);
  useEffect(() => { scrollToToday(false); }, [scrollToToday, viewMode, range, plan.id]);
  const coverage = useMemo(() => planCoverage(planDemands, planAssignments, cols), [planDemands, planAssignments, cols]);
  const st = planStates.get(plan.id)?.state || "ok";
  const outside = (c) => c.end < plan.start_date || c.start > plan.end_date;

  function openAssign(dept, assignment, defaults) {
    if (!canEditDept(dept) && !assignment) return;
    setModal({ type: "assignment", plan, dept, assignment, defaults });
  }

  const goDay = (delta) => setDayStart((d) => addDays(d, delta));
  const rangeSelect = (
    <label className="tr-inline-field">표시
      <select value={range} onChange={(e) => chooseRange(e.target.value)}>
        <option value="all">프로젝트 전체 ({weeksBetween(plan.start_date, plan.end_date)}주)</option>
        {DAY_WEEKS.map((n) => <option key={n} value={n}>{n}주 ({n * 7}일)</option>)}
      </select>
    </label>
  );
  const dayNavigator = viewMode === "day" && (
    <div className="tr-window-bar">
      {range !== "all" && (
        <>
          <button type="button" className="tr-btn small" onClick={() => goDay(-7)} disabled={dayStart <= mondayOf(plan.start_date)}><Icon name="chevLeft" size={14} /> 1주</button>
          <button type="button" className="tr-btn small" onClick={() => setDayStart(initialStart())}>이번 주</button>
          <button type="button" className="tr-btn small" onClick={() => goDay(7)} disabled={addDays(dayStart, range * 7) > lastMon}>1주 <Icon name="chevRight" size={14} /></button>
          <label className="tr-inline-field">시작 주
            <input type="date" value={dayStart} min={plan.start_date} max={plan.end_date} onChange={(e) => e.target.value && setDayStart(mondayOf(e.target.value))} />
          </label>
        </>
      )}
      {range === "all" && <button type="button" className="tr-btn small" onClick={() => scrollToToday(true)}>오늘로 이동</button>}
      {rangeSelect}
    </div>
  );

  // 부서별 요약 (KPI 띠): 프로젝트 전체 기간을 주 단위로 보고, 교대로 이어진 사람은 한 명으로 센다
  const kpiWeeks = useMemo(() => buildColumns("week", plan.start_date, totalWeeks), [plan.start_date, totalWeeks]);
  const kpiCov = useMemo(() => planCoverage(planDemands, planAssignments, kpiWeeks), [planDemands, planAssignments, kpiWeeks]);
  const kpis = TRIP_DEPTS.map((d) => {
    const peak = peakNeed(planDemands, d.key);
    const cov = kpiCov[d.key];
    const placed = cov ? Math.max(0, ...cov.map((c) => c.have)) : 0;
    const gapWeeks = cov ? cov.filter((c, i) => c.gap > 0 && kpiWeeks[i].end >= today).length : 0;
    return { dept: d, peak, placed, gapWeeks, hasAny: Boolean(cov) };
  });

  return (
    <>
      <div className="tr-panel tr-plan-head">
        <div className="tr-plan-title">
          <h3>{plan.name}</h3>
          <p>
            {[plan.customer, plan.site, plan.line].filter(Boolean).join(" · ")}{plan.site || plan.line || plan.customer ? " · " : ""}{rangeLabel(plan.start_date, plan.end_date)} ({weeksBetween(plan.start_date, plan.end_date)}주)
            {plan.status && <span className="tr-chip">{plan.status}</span>}
            <span className={`tr-state ${st}`}>{{ none: "배정 필요", short: "인원 부족", ok: "배정 완료", nodemand: "공수 없음" }[st]}</span>
          </p>
        </div>
        <div className="tr-plan-tools">
          {plan.overseas && <span className="tr-chip us" title="미국 사이트(HSBMA·SKBA·SKOT) 프로젝트라 B1 비자 보유를 확인합니다"><Icon name="globe" size={12} /> 미국 사이트 · B1 확인</span>}
        </div>
      </div>

      <div className="tr-kpis" aria-label="부서별 계획 공수와 배정 현황">
        {kpis.map(({ dept, peak, placed, gapWeeks, hasAny }) => (
          <div key={dept.key} data-dept={dept.key} className={`tr-kpi ${hasAny ? "" : "none"} ${gapWeeks ? "short" : peak ? "ok" : ""}`}>
            <span className="tr-kpi-label">{dept.label}</span>
            <span className="tr-kpi-val">{hasAny ? <>{placed}<em>/ {peak || "-"}명</em></> : <em>공수 없음</em>}</span>
            <span className="tr-kpi-sub">{!hasAny ? "계획 공수가 없습니다" : gapWeeks ? `앞으로 ${gapWeeks}주 부족` : peak ? "필요 인원 충족" : "공수 외 배정"}</span>
          </div>
        ))}
      </div>

      <div className="tr-panel tr-grid-panel">
        <div className="tr-grid-bar">
          <span className="tr-muted">{dayAll ? "프로젝트 전체를 일 단위로 보는 중 — 옆으로 밀어서 넘겨 보세요. 칸을 눌러 출장자를 넣고, 막대를 눌러 수정·교대합니다." : viewMode === "day" ? "일 단위로 보는 중 — 칸을 눌러 출장자를 넣고, 막대를 눌러 수정·교대합니다." : "주 단위로 보는 중 — 칸을 눌러 출장자를 넣고, 막대를 눌러 수정·교대합니다."}</span>
          <span className="tr-spacer" />
          {dayNavigator}
        </div>
        {viewMode === "week" && weeksBetween(plan.start_date, plan.end_date) > MAX_BOARD_WEEKS && (
          <p className="tr-readonly-note"><Icon name="info" size={13} /> 프로젝트 기간이 길어 처음 {MAX_BOARD_WEEKS}주만 표시합니다.</p>
        )}

        {plan.phases?.length > 0 && (
          <div className="tr-phase-legend" aria-label="마일스톤(작업 단계) 범례">
            <span className="tr-muted">작업 단계</span>
            {plan.phases.map((ph, i) => (
              <span key={`${ph.label}-${i}`} className={`tr-phase-chip ms-${phaseIdx[i]}`} title={`${ph.label}: ${rangeLabel(ph.start, ph.end)}`}>
                <b>{ph.label}</b><em>{rangeLabel(ph.start, ph.end)}</em>
              </span>
            ))}
          </div>
        )}

        <div className="tr-table-wrap tall" ref={wrapRef}>
          <table className={`tr-grid tr-board-grid tr-by-${viewMode}${dayAll ? " tr-compact" : ""}`}>
            <TimeHead cols={cols} today={today} mode={viewMode} leftHead="부서 / 출장자 칸" phases={plan.phases} phaseIdx={phaseIdx} />
            <tbody>
              {TRIP_DEPTS.map((d) => {
                const dept = d.key;
                const cov = coverage[dept];
                const deptDemands = planDemands.filter((x) => x.dept === dept);
                const deptAsg = planAssignments.filter((a) => a.dept === dept);
                const lanes = layoutLanes(deptAsg);
                const slots = Math.max(peakNeed(planDemands, dept), lanes.length);
                const editable = canEditDept(dept);
                const noteRow = notes.find((n) => n.project_id === plan.id && n.dept === dept);
                const needBy = cols.map((c) => needForWeek(deptDemands, dept, c));
                return (
                  <Fragment key={dept}>
                    <tr className="tr-dept-row" data-dept={dept}>
                      <th className="tr-col-name">
                        <div className="tr-dept-title">
                          <span className="tr-dept-name"><strong>{d.label}</strong><span className="tr-muted">{slots ? `칸 ${slots}개` : "칸 없음"}</span></span>
                          <span className="tr-dept-actions">
                            {editable && <button type="button" className="tr-btn tiny" onClick={() => openAssign(dept, null, {})} title="추가 인원을 넣거나, 인원을 교대합니다"><Icon name="plus" size={12} /> 출장자</button>}
                          </span>
                        </div>
                      </th>
                      {cols.map((c, i) => {
                        const cc = cov?.[i];
                        const out = outside(c);
                        if (!cc || (cc.need === 0 && cc.have === 0)) return <td key={c.key} className={`tr-cov ${out ? "out" : ""} ${colClass(c, today)}`} />;
                        const kind = cc.gap > 0 ? "short" : cc.gap < 0 ? "over" : "full";
                        const title = `${shortDate(c.start)}${c.day ? "" : " 주"} · 필요 ${cc.need}명 · 배정 ${cc.have}명${cc.gap > 0 ? ` → ${cc.gap}명 부족` : cc.gap < 0 ? ` → ${-cc.gap}명 초과` : ""}`;
                        return <td key={c.key} className={`tr-cov ${kind} ${colClass(c, today)}`} title={title}><span>{cc.need ? `${cc.have}/${cc.need}` : cc.have}</span></td>;
                      })}
                    </tr>

                    {slots === 0 && (
                      <tr className="tr-asg-row empty">
                        <th className="tr-col-name"><span className="tr-muted">계획 공수 없음{editable ? " — 필요하면 ‘출장자’로 추가" : ""}</span></th>
                        <td colSpan={cols.length} />
                      </tr>
                    )}

                    {Array.from({ length: slots }, (_, k) => {
                      const lane = lanes[k] || [];
                      const people = lane.map((a) => memberById.get(a.member_id)?.name || a.label || "?");
                      // 시간 칸을 상태가 같은 것끼리 묶어 한 덩어리로 그린다
                      const segs = [];
                      cols.forEach((c, i) => {
                        const cell = laneCellState(lane, k, c, needBy[i]);
                        const key = cell.state === "filled" ? `f:${cell.items.map((a) => a.id).join("+")}` : cell.state;
                        const last = segs[segs.length - 1];
                        if (last && last.key === key) last.span += 1;
                        else segs.push({ key, state: cell.state, items: cell.items, span: 1, first: c });
                      });
                      const lastA = lane[lane.length - 1];
                      return (
                        <tr key={`${dept}-${k}`} className="tr-slot-row" data-dept={dept}>
                          <th className="tr-col-name">
                            <div className="tr-slot-label">
                              <span className="no">{k + 1}</span>
                              <span className="who" title={people.join(" → ")}>{people.length ? people.map((n, i) => <Fragment key={i}>{i > 0 && <Icon name="arrowRight" size={11} />}{n}</Fragment>) : <span className="tr-muted">비어 있음</span>}</span>
                              {editable && lastA && <button type="button" className="tr-icon-btn tiny" onClick={() => openAssign(dept, null, { rotateFrom: lastA.id })} title={`${people[people.length - 1]} 교대`} aria-label={`${k + 1}번 칸 교대`}><Icon name="swap" size={13} /></button>}
                            </div>
                          </th>
                          {segs.map((sg, si) => {
                            if (sg.state === "idle") return <td key={si} colSpan={sg.span} className="tr-cell idle" />;
                            if (sg.state === "gap") {
                              const label = sg.span * (viewMode === "day" ? 1 : 7) >= 4 ? "비어 있음 · 눌러서 출장자 선택" : "+";
                              const range = laneGapRange(lane, k, deptDemands, dept, sg.first, plan);
                              return (
                                <td key={si} colSpan={sg.span} className="tr-cell gap">
                                  {editable
                                    ? <button type="button" onClick={() => openAssign(dept, null, { start: range.start, end: range.end, slotNo: k + 1 })} title={`${k + 1}번 칸 ${rangeLabel(range.start, range.end)} 비어 있음 — 눌러서 출장자 선택`}>{label}</button>
                                    : <span title={`${k + 1}번 칸 비어 있음`}>{sg.span >= 2 ? "미배정" : ""}</span>}
                                </td>
                              );
                            }
                            const names = sg.items.map((a) => memberById.get(a.member_id)?.name || a.label || "?");
                            const worst = worstLevel(sg.items.flatMap((a) => issuesByAssignment[a.id] || []));
                            const first = sg.items[0];
                            const m = memberById.get(first.member_id);
                            const tip = sg.items.map((a) => `${memberById.get(a.member_id)?.name || a.label}: ${rangeLabel(a.start_date, a.end_date)}${a.note ? ` · ${a.note}` : ""}`).concat((issuesByAssignment[first.id] || []).map((i) => i.message)).join("\n");
                            return (
                              <td key={si} colSpan={sg.span} className={`tr-cell filled lv-${worst || "ok"}`}>
                                <button type="button" onClick={() => openAssign(dept, first)} title={tip}>
                                  <span className="nm">{names.join(" → ")}</span>
                                  {sg.span >= 3 && m && <span className="sub">{[m.team, m.rank].filter(Boolean).join(" · ")}{m.b1_visa ? " · B1" : ""}</span>}
                                  {worst && worst !== "info" && <Icon name="alert" size={12} className="tr-seg-ico" />}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}

                    <tr className="tr-note-row">
                      <th className="tr-col-name"><span className="tr-muted">특이사항</span></th>
                      <td colSpan={cols.length}>
                        <DeptNote key={noteRow?.note || ""} value={noteRow?.note || ""} editable={editable} onSave={(text) => saveNote({ project_id: plan.id, dept, note: text })} />
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="tr-legend">
          <span><i className="sw gap" /> 비어 있는 칸 (눌러서 배정)</span>
          <span><i className="sw bar" /> 배정된 출장자</span>
          <span><i className="sw warn" /> 경고 (비자 등)</span>
          <span><i className="sw bad" /> 충돌 (기간 겹침·부재)</span>
          <span><i className="sw short" /> 공수 부족</span>
          <span><i className="sw full" /> 공수 충족</span>
        </div>
      </div>
    </>
  );
}

// ───────────────────────────── 부서 인원 현황 ─────────────────────────────

function Roster({ members, demands, defaultDept, ctx, planIndex, today, viewMode, winStart, setWinStart, winCount, setWinCount, dayWeeks, setDayWeeks, editableDepts, setModal }) {
  const [deptFilter, setDeptFilter] = useState(defaultDept || "all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const cols = useMemo(() => buildColumns(viewMode, winStart, viewMode === "day" ? dayWeeks * 7 : winCount), [viewMode, winStart, winCount, dayWeeks]);
  const [baseDate, setBaseDate] = useState(today);
  const statCol = useMemo(() => buildColumns("week", baseDate, 1)[0], [baseDate]);
  const statDay = viewMode === "day" ? { start: baseDate, end: baseDate } : statCol;
  const step = viewMode === "day" ? 1 : 7;

  const teams = useMemo(() => {
    const set = new Set(members.filter((m) => deptFilter === "all" || m.dept === deptFilter).map((m) => m.team).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b, "ko"));
  }, [members, deptFilter]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members
      .filter((m) => (showInactive || m.active)
        && (deptFilter === "all" || m.dept === deptFilter)
        && (teamFilter === "all" || m.team === teamFilter)
        && (!q || m.name.toLowerCase().includes(q) || String(m.team || "").toLowerCase().includes(q)))
      .sort((a, b) => TRIP_DEPTS.findIndex((d) => d.key === a.dept) - TRIP_DEPTS.findIndex((d) => d.key === b.dept)
        || String(a.team || "").localeCompare(String(b.team || ""), "ko") || a.name.localeCompare(b.name, "ko"));
  }, [members, deptFilter, teamFilter, query, showInactive]);

  if (members.length === 0) {
    return (
      <div className="tr-empty">
        <Icon name="users" size={30} />
        <h3>등록된 인원이 없습니다</h3>
        <p>{editableDepts.length ? "‘팀원 관리’ 탭에서 엑셀 양식을 내려받아 팀원을 채운 뒤 표를 붙여넣으면 한 번에 등록할 수 있습니다." : "관리 부서가 지정된 팀장 또는 PM이 인원을 등록합니다."}</p>
      </div>
    );
  }

  return (
    <div className="tr-roster">
      <div className="tr-kpis five" aria-label={`${shortDate(statDay.start)} ${viewMode === "day" ? "" : "주 "}기준 부서별 현황`}>
        {TRIP_DEPTS.map((d) => {
          const list = members.filter((m) => m.dept === d.key);
          const s = deptWeekStats(list, statDay, ctx);
          return (
            <button type="button" key={d.key} data-dept={d.key} className={`tr-kpi btn ${deptFilter === d.key ? "sel" : ""}`} onClick={() => { setDeptFilter(deptFilter === d.key ? "all" : d.key); setTeamFilter("all"); }}>
              <span className="tr-kpi-label">{d.label}</span>
              <span className="tr-kpi-val">{s.free}<em>명 본사 / 총 {s.total}</em></span>
              <span className="tr-kpi-sub">출장 {s.assigned} · 부재 {s.absent} · B1 보유 {s.b1}</span>
            </button>
          );
        })}
      </div>

      <div className="tr-panel tr-place">
        <div className="tr-place-head">
          <h3 className="tr-h">부서 상황판</h3>
          <div className="tr-window-bar">
            <button type="button" className="tr-btn small" onClick={() => setBaseDate(addDays(baseDate, -step))} aria-label={viewMode === "day" ? "전날" : "이전 주"}><Icon name="chevLeft" size={14} /></button>
            <label className="tr-inline-field">{viewMode === "day" ? "기준일" : "기준 주"}
              <input type="date" value={baseDate} onChange={(e) => e.target.value && setBaseDate(e.target.value)} />
            </label>
            <span className="tr-muted">{viewMode === "day" ? `${shortDate(baseDate)} (${DOW_LABEL[(new Date(`${baseDate}T00:00:00Z`).getUTCDay() + 6) % 7]})` : `${shortDate(statCol.start)} ~ ${shortDate(statCol.end)}`}</span>
            <button type="button" className="tr-btn small" onClick={() => setBaseDate(addDays(baseDate, step))} aria-label={viewMode === "day" ? "다음날" : "다음 주"}><Icon name="chevRight" size={14} /></button>
            <button type="button" className="tr-btn small" onClick={() => setBaseDate(today)}>{viewMode === "day" ? "오늘" : "이번 주"}</button>
          </div>
        </div>
        {TRIP_DEPTS.filter((d) => deptFilter === "all" || d.key === deptFilter).map((d) => (
          <DeptBoard key={d.key} dept={d} members={members} ctx={ctx} demands={demands} week={statDay} planIndex={planIndex} showTitle={deptFilter === "all"} setModal={setModal} />
        ))}
      </div>

      <div className="tr-panel tr-grid-panel">
        <div className="tr-toolbar">
          <div className="tr-chipset" role="group" aria-label="부서 필터">
            <button type="button" className={deptFilter === "all" ? "on" : ""} onClick={() => { setDeptFilter("all"); setTeamFilter("all"); }}>전체</button>
            {TRIP_DEPTS.map((d) => <button key={d.key} type="button" data-dept={d.key} className={deptFilter === d.key ? "on" : ""} onClick={() => { setDeptFilter(d.key); setTeamFilter("all"); }}>{d.label}</button>)}
          </div>
          <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} aria-label="팀 필터">
            <option value="all">모든 팀</option>
            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="search" className="tr-search" placeholder="이름·팀 검색" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="이름 또는 팀 검색" />
          <label className="tr-check inline"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /><span>퇴사·제외 포함</span></label>
          <span className="tr-spacer" />
          <WindowBar viewMode={viewMode} winStart={winStart} setWinStart={setWinStart} winCount={winCount} setWinCount={setWinCount} dayWeeks={dayWeeks} setDayWeeks={setDayWeeks} today={today} />
        </div>

        <div className="tr-table-wrap tall">
          <table className={`tr-grid tr-roster-grid tr-by-${viewMode}`}>
            <TimeHead cols={cols} today={today} mode={viewMode} leftHead="이름"
              extraLeft={[{ key: "meta", className: "tr-col-meta", label: "부서 · 팀" }, { key: "b1", className: "tr-col-mini", label: "B1" }]} />
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className={m.active ? "" : "inactive"}>
                  <th className="tr-col-name">
                    <button type="button" className="tr-member-btn" onClick={() => setModal({ type: "member", member: m })} title="눌러서 정보 보기·수정">
                      <span className="nm">{m.name}</span>
                      <span className="sub">{[m.rank, m.grade].filter(Boolean).join(" · ")}{m.note ? ` · ${m.note}` : ""}</span>
                    </button>
                  </th>
                  <td className="tr-col-meta"><span className="tr-dept-tag" data-dept={m.dept}>{TRIP_DEPT_LABEL[m.dept]}</span><span className="sub"> {m.team}</span></td>
                  <td className="tr-col-mini">{m.b1_visa ? <span className="tr-b1">O</span> : <span className="tr-muted">-</span>}</td>
                  {cols.map((c) => {
                    const stt = memberWeekState(m, c, ctx);
                    const cls = colClass(c, today);
                    if (stt.state === "free") return <td key={c.key} className={`tr-mcell free ${cls}`} />;
                    if (stt.state === "absent") {
                      return <td key={c.key} className={`tr-mcell absent ${cls}`} title={`${ABSENCE_KIND_LABEL[stt.absence.kind]} (${rangeLabel(stt.absence.start_date, stt.absence.end_date)})${stt.absence.note ? ` · ${stt.absence.note}` : ""}`}>{c.day ? "" : ABSENCE_MARK[stt.absence.kind]}</td>;
                    }
                    const names = stt.assigned.map((x) => x.plan?.name).filter(Boolean).join(" + ");
                    const first = stt.assigned[0]?.plan;
                    const pcIdx = (planIndex.get(first?.id) ?? 0) % 6;
                    const bad = stt.state === "double" || stt.state === "conflict";
                    return (
                      <td key={c.key} className={`tr-mcell on pc-${pcIdx} ${bad ? "bad" : ""} ${cls}`} title={`${bad ? "충돌: " : ""}${names}${stt.absence ? ` / ${ABSENCE_KIND_LABEL[stt.absence.kind]}` : ""}`}>
                        {bad ? "!" : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {rows.length === 0 && <tr><td className="tr-empty-cell" colSpan={3 + cols.length}>조건에 맞는 인원이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="tr-legend">
          <span><i className="sw free" /> 가용</span>
          <span><i className="sw bar" /> 프로젝트 배정 (칸에 마우스를 올리면 프로젝트 이름)</span>
          <span><i className="sw bad" /> 충돌 (!)</span>
          <span><i className="sw absent" /> 부재 (출=타 출장 · 휴=휴직 · 교=교육)</span>
        </div>
      </div>
    </div>
  );
}

// 한 부서의 상황판: 본사 잔류 / PJT별 출장 / 부재 를 칸(열)으로 나누고, 그 안에 사람 카드를 둔다
function DeptBoard({ dept, members, ctx, demands, week, planIndex, showTitle, setModal }) {
  const list = members.filter((m) => m.dept === dept.key && m.active);
  const home = [];
  const absent = [];
  const byPlan = new Map();
  list.forEach((m) => {
    const st = memberWeekState(m, week, ctx);
    if (st.state === "free") {
      const next = ctx.assignments
        .filter((a) => a.member_id === m.id && a.start_date > week.end)
        .sort((x, y) => x.start_date.localeCompare(y.start_date))[0];
      home.push({ m, next, nextPlan: next ? ctx.plans.find((p) => p.id === next.project_id) : null });
    } else if (st.state === "absent") {
      absent.push({ m, ab: st.absence });
    } else {
      st.assigned.forEach(({ assignment, plan }) => {
        const key = plan?.id || "none";
        if (!byPlan.has(key)) byPlan.set(key, []);
        byPlan.get(key).push({ m, a: assignment, dup: st.state !== "assigned" });
      });
    }
  });
  // 인원이 없어도 이 부서 공수가 잡힌 PJT 는 칸을 보여 준다 (부족 확인용)
  ctx.plans.forEach((p) => {
    if (!isPastProject(p, week.start) && needForWeek(demands.filter((d) => d.project_id === p.id), dept.key, week) > 0 && !byPlan.has(p.id)) byPlan.set(p.id, []);
  });
  const cols = [...byPlan.entries()]
    .map(([id, cards]) => ({ id, plan: ctx.plans.find((p) => p.id === id), cards }))
    .sort((a, b) => (planIndex.get(a.id) ?? 99) - (planIndex.get(b.id) ?? 99));

  const open = (m) => setModal({ type: "member", member: m });
  const card = (m, meta, cls = "", badge = null) => (
    <button type="button" key={`${m.id}-${cls}`} className={`tr-card ${cls}`} onClick={() => open(m)} title={`${m.name} · 눌러서 정보 보기`}>
      <span className="top"><span className="nm">{m.name}</span>{m.b1_visa && <span className="tr-b1 small">B1</span>}{badge}</span>
      <span className="sub">{[m.team, m.rank].filter(Boolean).join(" · ") || "-"}</span>
      {meta && <span className="meta">{meta}</span>}
    </button>
  );

  return (
    <div className="tr-dept-board" data-dept={dept.key}>
      {showTitle && <h4 className="tr-dept-board-title">{dept.label} <span className="tr-muted">총 {list.length}명</span></h4>}
      <div className="tr-lanes">
        <div className="tr-lane home">
          <div className="tr-lane-head"><strong>본사 잔류</strong><b>{home.length}</b></div>
          <div className="tr-lane-body">
            {home.length === 0 && <span className="tr-muted">모두 출장 중</span>}
            {home.map(({ m, next, nextPlan }) => card(m, next ? `다음: ${nextPlan?.name || "프로젝트"} ${shortDate(next.start_date)}~` : "예정 없음"))}
          </div>
        </div>
        {cols.map(({ id, plan, cards }) => {
          const need = plan ? needForWeek(demands.filter((d) => d.project_id === plan.id), dept.key, week) : 0;
          const have = new Set(cards.map((c) => c.m.id)).size;
          const idx = (planIndex.get(id) ?? 0) % 6;
          return (
            <div className={`tr-lane pc-${idx}`} key={id}>
              <div className="tr-lane-head">
                <strong title={plan?.name}>{plan?.name || "(프로젝트 없음)"}</strong>
                <b className={need && have < need ? "short" : ""}>{need ? `${have}/${need}` : have}</b>
              </div>
              <div className="tr-lane-body">
                {cards.length === 0 && <span className="tr-muted">{need}명 필요 · 배정 없음</span>}
                {cards.map(({ m, a, dup }) => card(m, `${shortDate(a.start_date)}~${shortDate(a.end_date)}${a.note ? ` · ${a.note}` : ""}`, dup ? "bad" : "", dup ? <span className="tr-dupmark">중복</span> : null))}
              </div>
            </div>
          );
        })}
        {absent.length > 0 && (
          <div className="tr-lane absent">
            <div className="tr-lane-head"><strong>부재</strong><b>{absent.length}</b></div>
            <div className="tr-lane-body">
              {absent.map(({ m, ab }) => card(m, `${ABSENCE_KIND_LABEL[ab.kind]} ${rangeLabel(ab.start_date, ab.end_date)}${ab.note ? ` · ${ab.note}` : ""}`))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────── 팀원 관리 (목록·수정·퇴사·삭제·엑셀) ─────────────────────────────

function Members({ members, ctx, today, editableDepts, defaultDept, myDept, setModal, flash, reload, guard }) {
  const [deptFilter, setDeptFilter] = useState(defaultDept || "all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const canEdit = (m) => editableDepts.includes(m.dept);

  const teams = useMemo(() => {
    const set = new Set(members.filter((m) => deptFilter === "all" || m.dept === deptFilter).map((m) => m.team).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b, "ko"));
  }, [members, deptFilter]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members
      .filter((m) => (statusFilter === "all" || (statusFilter === "active" ? m.active : !m.active))
        && (deptFilter === "all" || m.dept === deptFilter)
        && (teamFilter === "all" || m.team === teamFilter)
        && (!q || `${m.name} ${m.team || ""} ${m.rank || ""} ${m.note || ""}`.toLowerCase().includes(q)))
      .sort((a, b) => TRIP_DEPTS.findIndex((d) => d.key === a.dept) - TRIP_DEPTS.findIndex((d) => d.key === b.dept)
        || String(a.team || "").localeCompare(String(b.team || ""), "ko") || a.name.localeCompare(b.name, "ko"));
  }, [members, deptFilter, teamFilter, statusFilter, query]);

  // 화면에서 사라진 사람은 선택에서도 뺀다
  const pickedRows = rows.filter((m) => picked.has(m.id) && canEdit(m));
  const selectable = rows.filter(canEdit);
  const allPicked = selectable.length > 0 && selectable.every((m) => picked.has(m.id));
  const toggle = (id) => setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // 오늘 기준 상황
  const today1 = { start: today, end: today };
  const nowOf = (m) => {
    if (!m.active) return { text: "퇴사·제외", cls: "off" };
    const s = memberWeekState(m, today1, ctx);
    if (s.state === "free") return { text: "본사 대기", cls: "home" };
    if (s.state === "absent") return { text: ABSENCE_KIND_LABEL[s.absence.kind], cls: "abs" };
    return { text: `출장 · ${s.assigned.map((x) => x.plan?.name).filter(Boolean).join(" + ") || "배정"}`, cls: s.state === "assigned" ? "trip" : "bad" };
  };

  // 퇴사 처리하는 사람에게 앞으로 남은 배정이 있으면 미리 알려 준다 (배정은 남고 경고로 표시되므로 교대가 필요하다)
  const upcomingText = (list) => {
    const ids = new Set(list.map((m) => m.id));
    const n = ctx.assignments.filter((a) => ids.has(a.member_id) && a.end_date >= today).length;
    return n ? ` 단, 앞으로 남은 배정이 ${n}건 있습니다. 배정은 그대로 남아 경고로 표시되니 다른 사람으로 교대해 주세요.` : "";
  };

  async function setActive(list, active) {
    if (list.length === 0) return;
    if (!(await guard(list.map((m) => m.dept), "인원"))) return;
    const ok = await confirmDialog({
      title: active ? "복귀 처리" : "퇴사 처리",
      message: `${list.length}명을 ${active ? "재직(배정 가능)으로 되돌릴까요?" : "퇴사(배정 제외)로 바꿀까요?"}`,
      detail: `${list.slice(0, 6).map((m) => m.name).join(", ")}${list.length > 6 ? " 외" : ""}${active ? "" : ` — 이전 배정 기록은 그대로 남고, 앞으로 배정 후보에서만 빠집니다.${upcomingText(list)}`}`,
      confirmLabel: active ? "복귀" : "퇴사 처리", danger: false,
    });
    if (!ok) return;
    setBusy(true);
    let done = 0;
    let failure = "";
    for (const m of list) {
      const res = await updateMember(m.id, { ...m, active });
      if (res.error) { failure = `${m.name}: ${res.error}`; break; }
      done += 1;
    }
    await reload();
    setBusy(false);
    setPicked(new Set());
    if (failure) flash("err", `${failure} (${done}명만 처리했습니다)`);
    else flash("ok", `${done}명을 ${active ? "복귀" : "퇴사"} 처리했습니다.`);
  }

  async function remove(list) {
    if (list.length === 0) return;
    if (!(await guard(list.map((m) => m.dept), "인원"))) return;
    const ok = await confirmDialog({
      title: "팀원 삭제",
      message: `${list.length}명을 삭제할까요?`,
      detail: `${list.slice(0, 6).map((m) => m.name).join(", ")}${list.length > 6 ? " 외" : ""} — 배정 기록이 있는 사람은 삭제되지 않으니 그때는 퇴사 처리를 쓰세요. 삭제하면 복구할 수 없습니다.`,
      confirmLabel: "삭제",
    });
    if (!ok) return;
    setBusy(true);
    const failed = [];
    for (const m of list) {
      const res = await deleteMember(m.id);
      if (res.error) failed.push(m.name);
    }
    await reload();
    setBusy(false);
    setPicked(new Set());
    if (failed.length) flash("err", `${failed.join(", ")}: 삭제하지 못했습니다. 배정 기록이 있거나 권한이 없을 수 있습니다. 배정 기록이 있으면 퇴사 처리를 쓰세요.`);
    else flash("ok", `${list.length}명을 삭제했습니다.`);
  }

  async function download(kind) {
    try {
      if (kind === "template") await downloadMemberTemplate();
      else await downloadMemberRoster(members.filter((m) => !myDept || m.dept === myDept));
    } catch (e) {
      flash("err", `엑셀 파일을 만들지 못했습니다: ${e?.message || e}`);
    }
  }

  const counts = TRIP_DEPTS.map((d) => {
    const list = members.filter((m) => m.dept === d.key);
    return { d, active: list.filter((m) => m.active).length, off: list.filter((m) => !m.active).length, b1: list.filter((m) => m.active && m.b1_visa).length };
  });

  return (
    <div className="tr-members">
      <div className="tr-kpis five" aria-label="부서별 팀원 수">
        {counts.map(({ d, active, off, b1 }) => (
          <button type="button" key={d.key} data-dept={d.key} className={`tr-kpi btn ${deptFilter === d.key ? "sel" : ""}`} onClick={() => { setDeptFilter(deptFilter === d.key ? "all" : d.key); setTeamFilter("all"); }}>
            <span className="tr-kpi-label">{d.label}</span>
            <span className="tr-kpi-val">{active}<em>명 재직</em></span>
            <span className="tr-kpi-sub">B1 보유 {b1}{off ? ` · 퇴사·제외 ${off}` : ""}</span>
          </button>
        ))}
      </div>

      <p className="tr-role-note" role="note">
        <Icon name="info" size={14} />
        {myDept
          ? <>내 부서: <span className="tr-dept-tag" data-dept={myDept} style={{ marginLeft: 6 }}>{TRIP_DEPT_LABEL[myDept]}</span> — 다른 부서의 인원도 볼 수 있고, 수정·퇴사·삭제할 때는 “내 부서가 아닙니다” 확인 창이 뜹니다.</>
          : "모든 부서의 인원을 보고 수정할 수 있습니다. 팀장 계정은 화면 위의 ‘내 부서’를 고르면 다른 부서를 수정할 때 확인 창이 뜹니다."}
      </p>

      <div className="tr-panel tr-excel-box">
        <div className="tr-excel-text">
          <strong>엑셀로 팀원 명단 정리하기</strong>
          <span>양식을 내려받아 채운 뒤 표를 복사해 붙여넣으면, 등록된 인원과 비교해 추가·갱신·퇴사 처리를 한 번에 합니다.</span>
        </div>
        <div className="tr-excel-actions">
          <button type="button" className="tr-btn" onClick={() => download("template")}><Icon name="download" size={14} /> 빈 양식 내려받기</button>
          <button type="button" className="tr-btn" onClick={() => download("roster")} disabled={members.length === 0} title={myDept ? "내 부서의 현재 명단을 같은 양식으로 내려받습니다" : "현재 명단을 같은 양식으로 내려받습니다"}><Icon name="download" size={14} /> 현재 명단 내려받기</button>
          <button type="button" className="tr-btn primary" onClick={() => setModal({ type: "import" })} disabled={editableDepts.length === 0}><Icon name="clipboard" size={14} /> 표 붙여넣기로 최신화</button>
        </div>
      </div>

      <div className="tr-panel tr-grid-panel">
        <div className="tr-toolbar">
          <div className="tr-chipset" role="group" aria-label="부서 필터">
            <button type="button" className={deptFilter === "all" ? "on" : ""} onClick={() => { setDeptFilter("all"); setTeamFilter("all"); }}>전체</button>
            {TRIP_DEPTS.map((d) => <button key={d.key} type="button" data-dept={d.key} className={deptFilter === d.key ? "on" : ""} onClick={() => { setDeptFilter(d.key); setTeamFilter("all"); }}>{d.label}</button>)}
          </div>
          <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} aria-label="팀 필터">
            <option value="all">모든 팀</option>
            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="tr-chipset" role="group" aria-label="상태 필터">
            {[["active", "재직"], ["off", "퇴사·제외"], ["all", "전체"]].map(([k, l]) => <button key={k} type="button" className={statusFilter === k ? "on" : ""} onClick={() => setStatusFilter(k)}>{l}</button>)}
          </div>
          <input type="search" className="tr-search" placeholder="이름·팀·직위 검색" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="이름·팀·직위 검색" />
          <span className="tr-spacer" />
          <span className="tr-muted">{rows.length}명</span>
          {editableDepts.length > 0 && (
            <button type="button" className="tr-btn small primary" onClick={() => setModal({ type: "member", member: null, defaultDept: deptFilter !== "all" && editableDepts.includes(deptFilter) ? deptFilter : editableDepts[0] })}><Icon name="plus" size={13} /> 인원 추가</button>
          )}
        </div>

        {pickedRows.length > 0 && (
          <div className="tr-bulkbar" role="region" aria-label="선택한 인원 일괄 처리">
            <strong>{pickedRows.length}명 선택</strong>
            <button type="button" className="tr-btn small" disabled={busy} onClick={() => setActive(pickedRows.filter((m) => m.active), false)}>퇴사 처리</button>
            <button type="button" className="tr-btn small" disabled={busy} onClick={() => setActive(pickedRows.filter((m) => !m.active), true)}>복귀 처리</button>
            <button type="button" className="tr-btn small danger" disabled={busy} onClick={() => remove(pickedRows)}><Icon name="trash" size={13} /> 삭제</button>
            <button type="button" className="tr-btn small" disabled={busy} onClick={() => setPicked(new Set())}>선택 해제</button>
          </div>
        )}

        {members.length === 0 ? (
          <div className="tr-empty slim">
            <Icon name="users" size={26} />
            <h3>등록된 인원이 없습니다</h3>
            <p>위의 ‘빈 양식 내려받기’로 양식을 받아 팀원을 채우고, ‘표 붙여넣기로 최신화’에서 붙여넣으면 한 번에 등록됩니다.</p>
          </div>
        ) : (
          <div className="tr-table-wrap tall">
            <table className="tr-table members">
              <thead>
                <tr>
                  <th className="chk"><input type="checkbox" checked={allPicked} disabled={selectable.length === 0} onChange={() => setPicked(allPicked ? new Set() : new Set(selectable.map((m) => m.id)))} aria-label="전체 선택" /></th>
                  <th>이름</th><th>부서</th><th>팀</th><th>직위</th><th>등급</th><th>B1</th><th>오늘 상황</th><th>비고</th><th className="act">관리</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const now = nowOf(m);
                  const editable = canEdit(m);
                  return (
                    <tr key={m.id} data-dept={m.dept} className={m.active ? "" : "off"}>
                      <td className="chk">{editable && <input type="checkbox" checked={picked.has(m.id)} onChange={() => toggle(m.id)} aria-label={`${m.name} 선택`} />}</td>
                      <td><button type="button" className="tr-link" onClick={() => setModal({ type: "member", member: m })}>{m.name}</button></td>
                      <td><span className="tr-dept-tag" data-dept={m.dept}>{TRIP_DEPT_LABEL[m.dept]}</span></td>
                      <td>{m.team || <span className="tr-muted">-</span>}</td>
                      <td>{m.rank || <span className="tr-muted">-</span>}</td>
                      <td>{m.grade || <span className="tr-muted">-</span>}</td>
                      <td>{m.b1_visa ? <span className="tr-b1">O</span> : <span className="tr-muted">-</span>}</td>
                      <td><span className={`tr-now ${now.cls}`}>{now.text}</span></td>
                      <td className="note">{m.note || <span className="tr-muted">-</span>}</td>
                      <td className="act">
                        {editable ? (
                          <span className="tr-row-btns">
                            <button type="button" className="tr-icon-btn" onClick={() => setModal({ type: "member", member: m })} aria-label={`${m.name} 수정`} title="수정"><Icon name="pencil" size={14} /></button>
                            <button type="button" className="tr-btn tiny" disabled={busy} onClick={() => setActive([m], !m.active)}>{m.active ? "퇴사" : "복귀"}</button>
                            <button type="button" className="tr-icon-btn danger" disabled={busy} onClick={() => remove([m])} aria-label={`${m.name} 삭제`} title="삭제"><Icon name="trash" size={14} /></button>
                          </span>
                        ) : <span className="tr-muted">조회만</span>}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td className="tr-empty-cell" colSpan={10}>조건에 맞는 인원이 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────── 종합·확인 사항 ─────────────────────────────

function Summary({ plans, members, demands, assignments, ctx, issuesByAssignment, today, viewMode, winStart, setWinStart, winCount, setWinCount, dayWeeks, setDayWeeks, goBoard }) {
  const activePlans = useMemo(() => plans.filter((p) => !isPastProject(p, today)), [plans, today]);
  const activeIds = useMemo(() => new Set(activePlans.map((p) => p.id)), [activePlans]);
  const cols = useMemo(() => buildColumns(viewMode, winStart, viewMode === "day" ? dayWeeks * 7 : winCount), [viewMode, winStart, winCount, dayWeeks]);
  const actDemands = useMemo(() => demands.filter((d) => activeIds.has(d.project_id)), [demands, activeIds]);
  const actAssign = useMemo(() => assignments.filter((a) => activeIds.has(a.project_id)), [assignments, activeIds]);

  const shortages = useMemo(() => {
    const list = [];
    activePlans.forEach((p) => {
      const pw = buildColumns("week", p.start_date, Math.min(MAX_BOARD_WEEKS, weeksBetween(p.start_date, p.end_date)));
      shortageRuns(demands.filter((d) => d.project_id === p.id), assignments.filter((a) => a.project_id === p.id), pw, today)
        .forEach((r) => list.push({ plan: p, ...r }));
    });
    return list.sort((a, b) => a.start.localeCompare(b.start));
  }, [activePlans, demands, assignments, today]);

  const warnings = useMemo(() => {
    const rank = { bad: 0, warn: 1, info: 2 };
    const out = [];
    actAssign.forEach((a) => {
      (issuesByAssignment[a.id] || []).forEach((i) => {
        if (i.level === "info") return;
        const plan = plans.find((p) => p.id === a.project_id);
        out.push({ key: `${a.id}-${i.type}-${i.otherAssignmentId || i.absenceId || ""}`, plan, dept: a.dept, level: i.level, message: i.message, range: rangeLabel(a.start_date, a.end_date) });
      });
    });
    return out.sort((x, y) => rank[x.level] - rank[y.level]);
  }, [actAssign, issuesByAssignment, plans]);

  return (
    <div className="tr-summary">
      <div className="tr-panel tr-block">
        <h3 className="tr-h">확인이 필요한 항목</h3>
        <div className="tr-todo-grid">
          <div className="tr-todo">
            <h4>공수 부족 구간 <span className={`tr-count ${shortages.length ? "bad" : "ok"}`}>{shortages.length}</span></h4>
            {shortages.length === 0 ? <p className="tr-empty-line">지금부터 계획 공수보다 모자란 구간이 없습니다.</p> : (
              <ul>
                {shortages.map((s, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => goBoard(s.plan.id)}>
                      <b>{s.plan.name}</b> · {TRIP_DEPT_LABEL[s.dept]} · {rangeLabel(s.start, s.end)} <span className="tr-short-n">최대 {s.gap}명 부족</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="tr-todo">
            <h4>배정 경고 <span className={`tr-count ${warnings.length ? "bad" : "ok"}`}>{warnings.length}</span></h4>
            {warnings.length === 0 ? <p className="tr-empty-line">충돌·비자 경고가 없습니다.</p> : (
              <ul>
                {warnings.map((w) => (
                  <li key={w.key} className={`lv-${w.level}`}>
                    <button type="button" onClick={() => goBoard(w.plan.id)}>
                      <Icon name="alert" size={13} /> <b>{w.plan?.name}</b> · {TRIP_DEPT_LABEL[w.dept]} · {w.range}<br /><span>{w.message}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="tr-panel tr-block">
        <h3 className="tr-h">부서별 {viewMode === "day" ? "일자" : "주차"} 종합 <span className="tr-muted">진행 중인 모든 프로젝트 합계</span></h3>
        <WindowBar viewMode={viewMode} winStart={winStart} setWinStart={setWinStart} winCount={winCount} setWinCount={setWinCount} dayWeeks={dayWeeks} setDayWeeks={setDayWeeks} today={today} />
        <div className="tr-table-wrap tall">
          <table className={`tr-grid tr-summary-grid tr-by-${viewMode}`}>
            <TimeHead cols={cols} today={today} mode={viewMode} leftHead="부서" extraLeft={[{ key: "kind", className: "tr-col-meta", label: "구분" }]} />
            <tbody>
              {TRIP_DEPTS.map((d) => {
                const list = members.filter((m) => m.dept === d.key);
                const cells = cols.map((w) => {
                  const need = needForWeek(actDemands, d.key, w);
                  const have = haveForWeek(actAssign, d.key, w);
                  const stats = deptWeekStats(list, w, ctx);
                  return { need, have, gap: need - have, free: stats.free, total: stats.total };
                });
                return [
                  { label: "필요", get: (c) => c.need || "", cls: () => "" },
                  { label: "배정", get: (c) => c.have || "", cls: () => "" },
                  { label: "부족(-)/초과(+)", get: (c) => (c.need || c.have ? (c.gap > 0 ? -c.gap : c.gap < 0 ? `+${-c.gap}` : "0") : ""), cls: (c) => (c.gap > 0 ? "short" : c.gap < 0 ? "over" : "") },
                  { label: "가용 인원", get: (c) => (c.total ? c.free : ""), cls: (c) => (c.total && c.free === 0 ? "short" : "") },
                ].map((row, ri) => (
                  <tr key={`${d.key}-${ri}`} className={ri === 0 ? "tr-sum-first" : ""}>
                    {ri === 0 && <th className="tr-col-name tr-dept-th" data-dept={d.key} rowSpan={4}>{d.label}</th>}
                    <td className="tr-col-meta">{row.label}</td>
                    {cells.map((c, i) => <td key={cols[i].key} className={`tr-num ${row.cls(c)} ${colClass(cols[i], today)}`}>{row.get(c)}</td>)}
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
