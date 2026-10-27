import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import { PasteZone } from "./PasteZone";
import { confirmDialog } from "./confirmService";
import {
  TRIP_DEPTS, TRIP_DEPT_LABEL, ABSENCE_KINDS, isOutTrip, absenceText, overlaps, normalizeKind, assignableDepts,
  checkAssignment, worstLevel, isValidISO, rangeLabel, parseMemberPaste, memberKey, planMemberSync,
  addDays, dayCount, todayISO, shortDate,
} from "./tripLogic";

// ───────── 공통 ─────────

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function Modal({ title, subtitle, onClose, children, footer, wide = false, dept }) {
  const boxRef = useRef(null);
  // 열릴 때 창으로 포커스를 옮기고, 닫히면 눌렀던 버튼으로 돌려 준다 (키보드·보조기기 사용자가 길을 잃지 않게)
  useEffect(() => {
    const before = document.activeElement;
    boxRef.current?.focus();
    return () => { if (before && typeof before.focus === "function" && document.contains(before)) before.focus(); };
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      // 확인 창이 위에 떠 있을 때는 그 창이 키를 처리한다 (Esc 한 번에 두 창이 같이 닫히지 않게)
      if (document.querySelector(".confirm-back")) return;
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab" || !boxRef.current) return;
      const nodes = [...boxRef.current.querySelectorAll(FOCUSABLE)];
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === boxRef.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="tr-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={boxRef} tabIndex={-1} className={`tr-modal ${wide ? "wide" : ""}`} data-dept={dept} role="dialog" aria-modal="true" aria-label={title}>
        <div className="tr-modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="tr-icon-btn" onClick={onClose} aria-label="닫기"><Icon name="x" size={16} /></button>
        </div>
        <div className="tr-modal-body">{children}</div>
        {footer && <div className="tr-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

function Field({ label, hint, children, wide }) {
  return (
    <label className={`tr-field ${wide ? "wide" : ""}`}>
      <span className="tr-field-label">{label}</span>
      {children}
      {hint && <span className="tr-field-hint">{hint}</span>}
    </label>
  );
}

function IssueList({ issues }) {
  if (!issues.length) return null;
  return (
    <ul className="tr-issues">
      {issues.map((i, idx) => (
        <li key={idx} className={`lv-${i.level}`}><Icon name={i.level === "info" ? "info" : "alert"} size={14} /> {i.message}</li>
      ))}
    </ul>
  );
}

function ErrorLine({ error }) {
  return error ? <div className="tr-error" role="alert"><Icon name="alert" size={14} /> {error}</div> : null;
}

const datesOk = (start, end) => isValidISO(start) && isValidISO(end) && end >= start;

// ───────── 출장 가능자 고르기 ─────────

/** 부서 인원 중 그 기간에 출장 갈 수 있는지(가용/충돌/비자 없음)를 보여 주며 한 명을 고른다 */
function MemberPicker({ options, value, onChange, disabled, emptyText, dept }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const key = q.trim().toLowerCase();
    return key ? options.filter((o) => `${o.member.name} ${o.member.team || ""} ${o.member.rank || ""}`.toLowerCase().includes(key)) : options;
  }, [options, q]);
  const free = options.filter((o) => o.rank === 0).length;
  return (
    <div className="tr-picklist">
      <div className="tr-picklist-head">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·팀 검색" aria-label="출장자 검색" disabled={disabled} />
        <span className="tr-muted">출장 가능 {free}명 / 전체 {options.length}명</span>
      </div>
      <ul role="listbox" aria-label="출장자 목록">
        {options.length === 0 && <li className="tr-picklist-empty">{emptyText}</li>}
        {options.length > 0 && list.length === 0 && <li className="tr-picklist-empty">검색 결과가 없습니다.</li>}
        {list.map(({ member, tag, rank, reason }) => (
          <li key={member.id}>
            <button type="button" role="option" aria-selected={value === member.id} disabled={disabled}
              className={`tr-pick ${rank === 2 ? "bad" : rank === 1 ? "warn" : "ok"} ${value === member.id ? "on" : ""}`} onClick={() => onChange(member.id)}>
              <span className="who">
                <b>{member.name}</b>
                {dept && member.dept !== dept && <span className="tr-dept-tag" data-dept={member.dept}>{TRIP_DEPT_LABEL[member.dept]}</span>}
                <span className="sub">{[member.team, member.rank].filter(Boolean).join(" · ") || "-"}</span>
                {member.b1_visa && <span className="tr-b1 small">B1</span>}
                {!member.active && <span className="tr-chip">비활성</span>}
              </span>
              <span className="tag">{tag}</span>
              {reason && <span className="why">{reason}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const stripName = (message) => String(message || "").replace(/^[^:]+:\s*/, "");

function memberOptions(ctx, dept, candidate, validDates, keepId = "") {
  return ctx.members
    .filter((m) => assignableDepts(dept).includes(m.dept) && (m.active || m.id === keepId))
    .map((m) => {
      const issues = validDates ? checkAssignment(candidate(m.id), ctx) : [];
      const relevant = issues.filter((i) => i.type !== "outside");
      const worst = worstLevel(relevant);
      const rank = worst === "bad" ? 2 : worst === "warn" ? 1 : 0;
      const tag = !validDates ? "" : rank === 2 ? "충돌" : rank === 1 ? "비자 없음" : "가용";
      return { member: m, tag, rank, reason: relevant[0] ? stripName(relevant[0].message) : "" };
    })
    .sort((a, b) => a.rank - b.rank || (a.member.dept === dept ? 0 : 1) - (b.member.dept === dept ? 0 : 1) || String(a.member.team || "").localeCompare(String(b.member.team || ""), "ko") || a.member.name.localeCompare(b.member.name, "ko"));
}

// ───────── 출장자 배정 · 교대 ─────────

export function AssignmentModal({ plan, dept, assignment, defaults, ctx, canEdit, onSave, onDelete, onRotate, onClose }) {
  const editing = Boolean(assignment);
  const deptAssignments = useMemo(
    () => ctx.assignments.filter((a) => a.project_id === plan.id && a.dept === dept).sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [ctx.assignments, plan.id, dept],
  );
  const [mode, setMode] = useState(defaults?.rotateFrom ? "rotate" : assignment && !assignment.member_id ? "slot" : "member");
  const [memberId, setMemberId] = useState(assignment?.member_id || "");
  const [label, setLabel] = useState(assignment?.label || "");
  const [start, setStart] = useState(assignment?.start_date || defaults?.start || plan.start_date);
  const [end, setEnd] = useState(assignment?.end_date || defaults?.end || plan.end_date);
  const [note, setNote] = useState(assignment?.note || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // 교대: 나가는 사람, 마지막 근무일, 들어오는 사람
  const [outId, setOutId] = useState(defaults?.rotateFrom || assignment?.id || deptAssignments[deptAssignments.length - 1]?.id || "");
  const outgoing = deptAssignments.find((a) => a.id === outId) || null;
  const clampHandover = (a) => {
    if (!a) return "";
    const t = todayISO();
    const last = addDays(a.end_date, -1);
    return t < a.start_date ? a.start_date : t > last ? last : t;
  };
  const [handover, setHandover] = useState(() => defaults?.handover || clampHandover(deptAssignments.find((a) => a.id === (defaults?.rotateFrom || assignment?.id || deptAssignments[deptAssignments.length - 1]?.id))));
  const [inEnd, setInEnd] = useState("");
  const [inId, setInId] = useState("");
  const rotateEnd = inEnd || outgoing?.end_date || "";
  const rotateStart = handover && isValidISO(handover) ? addDays(handover, 1) : "";
  const rotateOk = Boolean(outgoing) && isValidISO(handover) && handover >= outgoing.start_date && handover < outgoing.end_date && isValidISO(rotateEnd) && rotateEnd >= rotateStart;

  const validDates = datesOk(start, end);
  const candidate = (mid) => ({ id: assignment?.id || "__new__", member_id: mid, project_id: plan.id, dept, start_date: start, end_date: end });
  const options = useMemo(
    () => memberOptions(ctx, dept, (mid) => ({ id: assignment?.id || "__new__", member_id: mid, project_id: plan.id, dept, start_date: start, end_date: end }), validDates, assignment?.member_id),
    [ctx, dept, start, end, validDates, assignment?.id, assignment?.member_id, plan.id],
  );
  const rotateOptions = useMemo(
    () => memberOptions(ctx, dept, (mid) => ({ id: "__rotate__", member_id: mid, project_id: plan.id, dept, start_date: rotateStart, end_date: rotateEnd }), rotateOk)
      .filter((o) => o.member.id !== outgoing?.member_id),
    [ctx, dept, rotateStart, rotateEnd, rotateOk, outgoing?.member_id, plan.id],
  );

  const issues = mode === "member" && memberId && validDates ? checkAssignment(candidate(memberId), ctx) : [];
  const rotateIssues = mode === "rotate" && inId && rotateOk ? checkAssignment({ id: "__rotate__", member_id: inId, project_id: plan.id, dept, start_date: rotateStart, end_date: rotateEnd }, ctx) : [];

  async function confirmRisky(list) {
    const risky = list.filter((i) => i.level !== "info");
    if (!risky.length) return true;
    return confirmDialog({ title: "경고가 있는 배정입니다", message: "그래도 이대로 저장할까요?", detail: risky.map((i) => i.message).join(" · "), confirmLabel: "그래도 저장", danger: false });
  }

  async function submit() {
    setError("");
    if (mode === "rotate") {
      if (!outgoing) return setError("교대할 출장자를 선택하세요.");
      if (!isValidISO(handover) || handover < outgoing.start_date || handover >= outgoing.end_date) return setError(`마지막 근무일은 ${rangeLabel(outgoing.start_date, addDays(outgoing.end_date, -1))} 안에서 정하세요.`);
      if (!inId) return setError("교대로 들어갈 출장자를 선택하세요.");
      if (!isValidISO(rotateEnd) || rotateEnd < rotateStart) return setError("교대 인원의 종료일을 확인하세요.");
      if (!(await confirmRisky(rotateIssues))) return;
      setBusy(true);
      const res = await onRotate({ outgoing, handover, incoming: { project_id: plan.id, dept, member_id: inId, start_date: rotateStart, end_date: rotateEnd, note } });
      setBusy(false);
      if (res?.error) setError(res.error);
      return;
    }
    if (mode === "member" && !memberId) return setError("출장자를 선택하세요.");
    if (mode === "slot" && !label.trim()) return setError("자리 이름(예: 외주1, 중국법인)을 입력하세요.");
    if (!validDates) return setError("시작일과 종료일을 확인하세요. (종료일은 시작일 이후여야 합니다)");
    if (!(await confirmRisky(issues))) return;
    setBusy(true);
    const res = await onSave({ id: assignment?.id, project_id: plan.id, dept, member_id: mode === "member" ? memberId : null, label: mode === "slot" ? label : null, start_date: start, end_date: end, note });
    setBusy(false);
    if (res?.error) setError(res.error);
  }

  async function remove() {
    const ok = await confirmDialog({ title: "배정 삭제", message: "이 배정을 삭제할까요?", detail: "삭제하면 복구할 수 없습니다." });
    if (!ok) return;
    setBusy(true);
    const res = await onDelete(assignment.id);
    setBusy(false);
    if (res?.error) setError(res.error);
  }

  function chooseOutgoing(id) {
    setOutId(id);
    setHandover(clampHandover(deptAssignments.find((a) => a.id === id)));
    setInEnd("");
    setInId("");
  }

  const deptName = TRIP_DEPT_LABEL[dept];
  const title = mode === "rotate" ? `${deptName} 출장자 교대` : editing ? `${deptName} 출장자 배정 수정` : `${deptName} 출장자 배정`;
  const person = (a) => (a.member_id ? ctx.members.find((m) => m.id === a.member_id)?.name : a.label) || "(이름 없음)";
  const canRotate = canEdit && deptAssignments.length > 0;

  return (
    <Modal
      dept={dept}
      title={title}
      subtitle={`${plan.name}${defaults?.slotNo ? ` · 칸 ${defaults.slotNo}` : ""} · 프로젝트 기간 ${rangeLabel(plan.start_date, plan.end_date)}`}
      onClose={onClose}
      wide
      footer={
        <>
          {editing && canEdit && mode !== "rotate" && <button type="button" className="tr-btn danger left" onClick={remove} disabled={busy}><Icon name="trash" size={14} /> 삭제</button>}
          {editing && canRotate && mode !== "rotate" && <button type="button" className="tr-btn" onClick={() => { chooseOutgoing(assignment.id); setMode("rotate"); }} disabled={busy}><Icon name="swap" size={14} /> 이 출장자 교대</button>}
          <button type="button" className="tr-btn" onClick={onClose} disabled={busy}>닫기</button>
          {canEdit && <button type="button" className="tr-btn primary" onClick={submit} disabled={busy}>{busy ? "저장 중..." : mode === "rotate" ? "교대 저장" : "저장"}</button>}
        </>
      }
    >
      {!editing && (
        <div className="tr-seg" role="tablist" aria-label="배정 방식">
          <button type="button" className={mode === "member" ? "on" : ""} onClick={() => setMode("member")} disabled={!canEdit}>명단의 인원</button>
          <button type="button" className={mode === "slot" ? "on" : ""} onClick={() => setMode("slot")} disabled={!canEdit}>외주·명단 외 인원</button>
          {canRotate && <button type="button" className={mode === "rotate" ? "on" : ""} onClick={() => { chooseOutgoing(outId || deptAssignments[deptAssignments.length - 1].id); setMode("rotate"); }}><Icon name="swap" size={13} /> 교대</button>}
        </div>
      )}
      {editing && mode === "rotate" && (
        <div className="tr-seg" role="tablist"><button type="button" onClick={() => setMode(assignment.member_id ? "member" : "slot")}><Icon name="chevLeft" size={13} /> 배정 수정으로 돌아가기</button></div>
      )}

      {mode === "rotate" ? (
        <>
          <div className="tr-form-grid">
            <Field label="교대할 출장자 (나가는 사람)" wide>
              <select value={outId} onChange={(e) => chooseOutgoing(e.target.value)} disabled={!canEdit}>
                {deptAssignments.map((a) => <option key={a.id} value={a.id}>{person(a)} · {rangeLabel(a.start_date, a.end_date)}</option>)}
              </select>
            </Field>
            <Field label="마지막 근무일" hint={outgoing ? `이 날까지 근무하고 다음 날(${rotateStart ? shortDate(rotateStart) : "-"})부터 교대 인원이 일합니다.` : ""}>
              <input type="date" value={handover} min={outgoing?.start_date} max={outgoing ? addDays(outgoing.end_date, -1) : undefined} onChange={(e) => { setHandover(e.target.value); setInId(""); }} disabled={!canEdit} />
            </Field>
            <Field label="교대 인원 종료일" hint="비우면 나가는 사람의 종료일까지입니다.">
              <input type="date" value={inEnd || outgoing?.end_date || ""} min={rotateStart} onChange={(e) => setInEnd(e.target.value)} disabled={!canEdit} />
            </Field>
          </div>
          <div className="tr-field wide">
            <span className="tr-field-label">교대로 들어갈 출장자 <em className="tr-muted">{rotateOk ? `${rangeLabel(rotateStart, rotateEnd)} (${dayCount(rotateStart, rotateEnd)}일)` : ""}</em></span>
            <MemberPicker dept={dept} options={rotateOptions} value={inId} onChange={setInId} disabled={!canEdit || !rotateOk} emptyText={`${deptName} 부서에 등록된 다른 인원이 없습니다.`} />
          </div>
          <Field label="메모" wide>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 1차 교대" maxLength={120} disabled={!canEdit} />
          </Field>
          <IssueList issues={rotateIssues} />
        </>
      ) : (
        <>
          <div className="tr-form-grid">
            <Field label="시작일">
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} disabled={!canEdit} />
            </Field>
            <Field label="종료일" hint={validDates ? `${dayCount(start, end)}일간` : ""}>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} disabled={!canEdit} />
            </Field>
            <div className="tr-quick wide">
              {defaults?.start && !editing && <button type="button" onClick={() => { setStart(defaults.start); setEnd(defaults.end); }} disabled={!canEdit}>비어 있는 구간 ({rangeLabel(defaults.start, defaults.end)})</button>}
              <button type="button" onClick={() => { setStart(plan.start_date); setEnd(plan.end_date); }} disabled={!canEdit}>프로젝트 전체 기간</button>
            </div>
          </div>

          {mode === "member" ? (
            <div className="tr-field wide">
              <span className="tr-field-label">{deptName} 출장자 선택</span>
              <MemberPicker dept={dept} options={options} value={memberId} onChange={setMemberId} disabled={!canEdit}
                emptyText={`${deptName} 부서에 등록된 인원이 없습니다. '팀원 관리'에서 먼저 등록하세요.`} />
              <span className="tr-field-hint">고른 기간에 충돌(기간 겹침·부재)이 없는 인원이 위에 나옵니다.{assignableDepts(dept).length > 1 ? ` ${deptName} 자리에는 ${assignableDepts(dept).map((k) => TRIP_DEPT_LABEL[k]).join('·')} 인원을 모두 넣을 수 있습니다.` : ""}</span>
            </div>
          ) : (
            <Field label="외주·명단 외 인원 이름" wide hint="인원 명단에 없는 외주·법인 인원입니다. 공수에는 1명으로 계산됩니다. 외주도 각 부서 팀이 이 자리에 기입합니다.">
              <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="예: 비전 외주 1, 중국법인" maxLength={40} disabled={!canEdit} />
            </Field>
          )}
          <Field label="메모" wide>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 3라인 대응 후 4라인 이동" maxLength={120} disabled={!canEdit} />
          </Field>
          <IssueList issues={issues} />
        </>
      )}
      <ErrorLine error={error} />
    </Modal>
  );
}

// ───────── 인원 ─────────

export function MemberModal({ member, defaultDept, editableDepts, absences, onSave, onDelete, onAddAbsence, onUpdateAbsence, onDeleteAbsence, onClose }) {
  const editing = Boolean(member);
  const canEdit = editableDepts.includes(member?.dept || defaultDept);
  const [form, setForm] = useState({
    name: member?.name || "", rank: member?.rank || "", dept: member?.dept || (editableDepts.includes(defaultDept) ? defaultDept : editableDepts[0]) || "mechanical",
    team: member?.team || "", grade: member?.grade || "", b1_visa: member?.b1_visa || false, active: member?.active !== false, note: member?.note || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const blankAbs = { kind: "customer", location: "", start_date: "", end_date: "", note: "" };
  const [abs, setAbs] = useState(blankAbs);
  const [absEditId, setAbsEditId] = useState(""); // 고치는 중인 일정 (비어 있으면 새로 추가)
  const [absErr, setAbsErr] = useState("");
  const set = (p) => setForm((f) => ({ ...f, ...p }));
  // 담당 부서가 하나뿐인 팀장은 자기 부서로 고정한다 (PM·관리자처럼 여러 부서를 맡을 때만 고른다)
  const lockedDept = editableDepts.length <= 1;
  const mine = absences.filter((a) => a.member_id === member?.id).sort((a, b) => a.start_date.localeCompare(b.start_date));

  async function submit() {
    setError("");
    if (!form.name.trim()) return setError("이름을 입력하세요.");
    setBusy(true);
    const res = await onSave(member?.id, form);
    setBusy(false);
    if (res?.error) setError(res.error);
  }
  async function remove() {
    const ok = await confirmDialog({ title: "인원 삭제", message: `'${member.name}' 님을 삭제할까요?`, detail: "배정 이력이 있으면 삭제되지 않습니다. 그 경우에는 '재직 중' 체크를 해제(퇴사 처리)하세요." });
    if (!ok) return;
    setBusy(true);
    const res = await onDelete(member.id);
    setBusy(false);
    if (res?.error) setError(res.error);
  }
  // 추가·수정 모두 이 줄에서 한다. 오류는 입력 줄 바로 아래에 보여 준다(창 아래쪽에 가려져 "안 되는 것처럼" 보이지 않게).
  async function saveAbsence() {
    setAbsErr("");
    if (isOutTrip(abs.kind) && !abs.location.trim()) return setAbsErr("어디에 가 있는지(장소·내용)를 적어 주세요. 예: SKO 서산 CS 대응");
    if (!isValidISO(abs.start_date)) return setAbsErr("시작일을 입력하세요.");
    if (abs.end_date && (!isValidISO(abs.end_date) || abs.end_date < abs.start_date)) return setAbsErr("종료일은 시작일 이후로 하세요. (비우면 '계속'입니다)");
    const row = { ...abs, member_id: member.id };
    const res = absEditId ? await onUpdateAbsence(absEditId, row) : await onAddAbsence(row);
    if (res?.error) return setAbsErr(res.error);
    if (!res?.cancelled) { setAbs(blankAbs); setAbsEditId(""); }
  }
  function startEditAbsence(a) {
    setAbsErr("");
    setAbsEditId(a.id);
    setAbs({ kind: normalizeKind(a.kind), location: a.location || "", start_date: a.start_date, end_date: a.end_date || "", note: a.note || "" });
  }
  function cancelEditAbsence() { setAbsErr(""); setAbsEditId(""); setAbs(blankAbs); }

  return (
    <Modal dept={form.dept} title={editing ? `${member.name} 인원 정보` : "인원 추가"} subtitle={editing ? `${TRIP_DEPT_LABEL[member.dept]} · ${member.team || "팀 미지정"}` : "출장자로 배정할 수 있는 인원을 등록합니다."} onClose={onClose} wide
      footer={
        <>
          {editing && canEdit && <button type="button" className="tr-btn danger left" onClick={remove} disabled={busy}><Icon name="trash" size={14} /> 삭제</button>}
          <button type="button" className="tr-btn" onClick={onClose} disabled={busy}>닫기</button>
          {canEdit && <button type="button" className="tr-btn primary" onClick={submit} disabled={busy}>{busy ? "저장 중..." : "저장"}</button>}
        </>
      }>
      {!canEdit && <p className="tr-readonly-note"><Icon name="lock" size={13} /> 다른 부서 인원은 조회만 할 수 있습니다.</p>}
      <div className="tr-form-grid">
        <Field label="이름"><input type="text" value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={30} disabled={!canEdit} /></Field>
        <Field label="직위 (선택)"><input type="text" value={form.rank} onChange={(e) => set({ rank: e.target.value })} placeholder="책임 · 선임 · 주임 · 사원" maxLength={20} disabled={!canEdit} /></Field>
        <Field label="부서" hint={lockedDept ? (editing ? "" : "내 담당 부서의 인원으로 등록됩니다.") : editing ? "배정이 있는 인원은 부서를 바꿀 수 없습니다." : ""}>
          {lockedDept || !canEdit ? (
            <span className="tr-dept-tag lg" data-dept={form.dept}>{TRIP_DEPT_LABEL[form.dept]}</span>
          ) : (
            <select value={form.dept} onChange={(e) => set({ dept: e.target.value })}>
              {TRIP_DEPTS.filter((d) => editableDepts.includes(d.key) || d.key === form.dept).map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          )}
        </Field>
        <Field label="팀 (선택)"><input type="text" value={form.team} onChange={(e) => set({ team: e.target.value })} placeholder="예: 설비기술 1팀" maxLength={30} disabled={!canEdit} /></Field>
        <Field label="등급 (선택)"><input type="text" value={form.grade} onChange={(e) => set({ grade: e.target.value })} placeholder="없으면 비워 두세요" maxLength={10} disabled={!canEdit} /></Field>
        <Field label="비고 (선택)"><input type="text" value={form.note} onChange={(e) => set({ note: e.target.value })} placeholder="예: 일병행, 병특" maxLength={60} disabled={!canEdit} /></Field>
        <label className="tr-check"><input type="checkbox" checked={form.b1_visa} onChange={(e) => set({ b1_visa: e.target.checked })} disabled={!canEdit} /><span>B1 비자 보유</span></label>
        <label className="tr-check"><input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} disabled={!canEdit} /><span>재직 중 (퇴사하면 해제 — 배정 후보에서 빠집니다)</span></label>
      </div>

      {editing && (
        <div className="tr-absences">
          <div className="tr-phases-head">
            <strong>미등록 프로젝트 대응 일정</strong>
            <span>아직 프로젝트로 등록되지 않은 고객사 대응·테스트 등으로 본사에 없는 기간(교육·휴직 포함). 이 기간에는 본사 대기가 아니라 적어 둔 곳에 가 있는 것으로 보이고, 프로젝트에 배정하면 경고가 뜹니다.</span>
          </div>
          {mine.length === 0 && <p className="tr-empty-line">등록된 일정이 없습니다.</p>}
          {mine.map((a) => (
            <div className={`tr-absence-item ${absEditId === a.id ? "editing" : ""}`} key={a.id}>
              <span className={`tr-chip ${isOutTrip(a.kind) ? "out" : ""}`}>{absenceText(a)}</span>
              <span>{rangeLabel(a.start_date, a.end_date)}</span>
              {a.note && <span className="tr-muted">{a.note}</span>}
              {canEdit && (
                <span className="tr-absence-actions">
                  <button type="button" className="tr-icon-btn" onClick={() => startEditAbsence(a)} aria-label="일정 수정" title="수정"><Icon name="pencil" size={14} /></button>
                  <button type="button" className="tr-icon-btn danger" onClick={() => onDeleteAbsence(a.id).then((r) => r?.error && setAbsErr(r.error))} aria-label="일정 삭제" title="삭제"><Icon name="trash" size={14} /></button>
                </span>
              )}
            </div>
          ))}
          {canEdit && (
            <>
              {absEditId && <p className="tr-edit-note"><Icon name="pencil" size={13} /> 위 일정을 고치는 중입니다. 내용을 바꾸고 ‘수정 저장’을 누르세요.</p>}
              <div className="tr-demand-row">
                <select value={abs.kind} onChange={(e) => setAbs({ ...abs, kind: e.target.value })} aria-label="종류">
                  {ABSENCE_KINDS.map((k) => <option key={k.key} value={k.key}>{k.optionLabel || k.label}</option>)}
                </select>
                <input type="text" value={abs.location} onChange={(e) => setAbs({ ...abs, location: e.target.value })} placeholder={isOutTrip(abs.kind) ? "어디에 (필수, 예: SKO 서산)" : "내용 (선택)"} maxLength={60} aria-label="장소·내용" />
                <input type="date" value={abs.start_date} onChange={(e) => setAbs({ ...abs, start_date: e.target.value })} aria-label="시작일" />
                <span className="tr-tilde">~</span>
                <input type="date" value={abs.end_date} onChange={(e) => setAbs({ ...abs, end_date: e.target.value })} aria-label="종료일 (비우면 계속)" />
                <input type="text" value={abs.note} onChange={(e) => setAbs({ ...abs, note: e.target.value })} placeholder="메모" maxLength={60} aria-label="메모" />
                <div className="tr-row-actions">
                  {absEditId && <button type="button" className="tr-btn small" onClick={cancelEditAbsence}>취소</button>}
                  <button type="button" className="tr-btn small primary" onClick={saveAbsence}><Icon name={absEditId ? "check" : "plus"} size={13} /> {absEditId ? "수정 저장" : "일정 추가"}</button>
                </div>
              </div>
              {absErr && <div className="tr-error" role="alert"><Icon name="alert" size={14} /> {absErr}</div>}
            </>
          )}
        </div>
      )}
      <ErrorLine error={error} />
    </Modal>
  );
}

// ───────── 명단 붙여넣기로 최신화 ─────────

const MAX_IMPORT_ROWS = 500;
const KIND_TEXT ={ new: "새로 추가", update: "갱신", same: "변경 없음", move: "팀 이동", skip: "퇴사 (등록 안 함)" };

export function ImportModal({ existing, editableDepts, defaultDept, onImport, onClose }) {
  const [rows, setRows] = useState(null);
  const [skipped, setSkipped] = useState([]);
  const [onlyNew, setOnlyNew] = useState(false);
  const [dropIds, setDropIds] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function handlePaste(e) {
    const text = e.clipboardData?.getData("text") || "";
    e.preventDefault();
    const parsed = parseMemberPaste(text);
    if (!parsed.rows.length) {
      setRows(null);
      return setError("읽을 수 있는 인원이 없습니다. 머리글(이름·부서(분야) 등)이 포함되도록 엑셀 표를 복사해 주세요.");
    }
    if (parsed.rows.length > MAX_IMPORT_ROWS) {
      setRows(null);
      return setError(`한 번에 ${MAX_IMPORT_ROWS}명까지 붙여넣을 수 있습니다. (${parsed.rows.length}명을 읽었습니다) 부서별로 나눠서 붙여넣어 주세요.`);
    }
    setError("");
    setDropIds(new Set());
    setSkipped(parsed.skipped);
    // 부서를 못 읽은 줄은 내 부서로 본다 (내 부서를 모르면 미리보기에서 고른다)
    const only = defaultDept || null;
    setRows(parsed.rows.map((r, i) => ({ ...r, dept: r.dept || only, _id: i, include: true })));
  }

  const setRow = (id, p) => setRows((prev) => prev.map((r) => (r._id === id ? { ...r, ...p } : r)));
  const allowedDept = (d) => Boolean(d) && editableDepts.includes(d);

  // 포함한 줄만으로 기존 명단과 맞춰 본다 (체크를 해제하면 그 줄은 없는 것으로 본다)
  const plan = useMemo(() => {
    if (!rows) return null;
    const used = rows.filter((r) => r.include);
    return planMemberSync(used, existing);
  }, [rows, existing]);
  const itemOf = useMemo(() => new Map((plan?.items || []).map((i) => [i.row._id, i])), [plan]);

  const dupKeys = new Set();
  if (rows) {
    const seen = new Set();
    rows.filter((r) => r.include && r.dept).forEach((r) => { const k = memberKey(r); if (seen.has(k)) dupKeys.add(k); seen.add(k); });
  }
  const missing = (plan?.missing || []).filter((m) => allowedDept(m.dept));

  const status = (r) => {
    if (!r.dept) return { text: "부서를 선택하세요", cls: "bad", ok: false };
    if (!allowedDept(r.dept)) return { text: "내 부서가 아님 (제외)", cls: "bad", ok: false };
    if (dupKeys.has(memberKey(r))) return { text: "표 안에서 중복", cls: "bad", ok: false };
    const it = itemOf.get(r._id);
    if (!it) return { text: "제외됨", cls: "muted", ok: false };
    const detail = it.changes.length ? ` (${it.changes.join("·")})` : it.kind === "move" ? ` (${it.match.team || "팀 없음"} → ${r.team || "팀 없음"})` : "";
    const cls = it.kind === "new" ? "ok" : it.kind === "same" || it.kind === "skip" ? "muted" : "warn";
    const retire = it.merged && it.merged.active === false && it.match.active !== false;
    const back = it.merged && it.merged.active !== false && it.match.active === false;
    return { text: `${retire ? "퇴사 처리" : back ? "복귀" : KIND_TEXT[it.kind]}${detail}`, cls, ok: true, it };
  };
  const views = (rows || []).map((r) => ({ r, st: status(r) }));
  const ready = views.filter(({ r, st }) => r.include && st.ok);
  const toCreate = ready.filter(({ st }) => st.it.kind === "new").map(({ r }) => ({ ...r, active: r.active !== false }));
  const toUpdate = onlyNew ? [] : ready.filter(({ st }) => st.it.kind === "update" || st.it.kind === "move").map(({ st }) => ({ id: st.it.match.id, base: st.it.match, merged: st.it.merged }));
  const toDrop = missing.filter((m) => dropIds.has(m.id)).map((m) => ({ id: m.id, base: m }));
  const counts = { same: ready.filter(({ st }) => st.it.kind === "same").length, skip: ready.filter(({ st }) => st.it.kind === "skip").length };

  const toggleDrop = (id) => setDropIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function submit() {
    setError("");
    if (dupKeys.size) return setError("붙여넣은 표 안에 같은 부서·팀·이름이 중복된 줄이 있습니다. 한 줄만 남기고 체크를 해제하세요.");
    if (views.some(({ r }) => r.include && !r.dept)) return setError("부서를 고르지 않은 줄이 있습니다. 부서를 고르거나 그 줄의 체크를 해제하세요.");
    if (!toCreate.length && !toUpdate.length && !toDrop.length) return setError("저장할 변경이 없습니다.");
    if (toDrop.length) {
      const ok = await confirmDialog({ title: "퇴사 처리", message: `${toDrop.length}명을 퇴사(배정 제외)로 바꿀까요?`, detail: `${toDrop.slice(0, 6).map((d) => d.base.name).join(", ")}${toDrop.length > 6 ? " 외" : ""} — 이전 배정 기록은 그대로 남고, 앞으로 배정 후보에서만 빠집니다.`, confirmLabel: "퇴사 처리", danger: false });
      if (!ok) return;
    }
    setBusy(true);
    const res = await onImport({ create: toCreate, update: toUpdate, deactivate: toDrop });
    setBusy(false);
    if (res?.error) setError(res.error);
  }

  const summary = [
    toCreate.length ? `새로 ${toCreate.length}` : "",
    toUpdate.length ? `갱신 ${toUpdate.length}` : "",
    toDrop.length ? `퇴사 처리 ${toDrop.length}` : "",
  ].filter(Boolean).join(" · ");

  return (
    <Modal title="표 붙여넣기로 팀원 명단 최신화" subtitle="'팀원 명단 양식' 또는 B1 비자 현황 같은 표를 복사해 붙여넣으면, 등록된 인원과 비교해 추가·갱신·퇴사 처리를 한 번에 합니다." onClose={onClose} wide
      footer={
        <>
          <button type="button" className="tr-btn" onClick={onClose} disabled={busy}>닫기</button>
          <button type="button" className="tr-btn primary" onClick={submit} disabled={busy || !rows}>
            {busy ? "저장 중..." : rows ? `저장${summary ? ` (${summary})` : ""}` : "저장"}
          </button>
        </>
      }>
      <p className="tr-readonly-note"><Icon name="info" size={13} /> 표에 나온 부서 안에서 등록된 인원과 비교합니다. 부서를 못 읽은 줄은{defaultDept ? ` 내 부서(${TRIP_DEPT_LABEL[defaultDept]})로` : ""} 처리되고, 미리보기에서 부서를 바꿀 수 있습니다.</p>
      <PasteZone label="팀원 표 붙여넣기" hint="엑셀에서 머리글 줄부터 복사(Ctrl+C) → 여기를 클릭 → 붙여넣기(Ctrl+V)" accent="sky" icon="users" onPaste={handlePaste} />
      <ErrorLine error={error} />
      {rows && (
        <>
          <div className="tr-import-opts">
            <label className="tr-check"><input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} /><span>이미 등록된 인원은 건드리지 않고 새 인원만 추가</span></label>
            <span className="tr-muted">변경 없음 {counts.same}명{counts.skip ? ` · 퇴사로 적힌 새 인원 ${counts.skip}명은 등록하지 않음` : ""}{skipped.length ? ` · 읽지 못한 ${skipped.length}줄은 건너뜀` : ""}</span>
          </div>
          <div className="tr-table-wrap">
            <table className="tr-table compact">
              <thead><tr><th></th><th>이름</th><th>팀</th><th>부서</th><th>직위</th><th>등급</th><th>B1</th><th>결과</th></tr></thead>
              <tbody>
                {views.map(({ r, st }) => (
                  <tr key={r._id} className={r.include ? "" : "dim"}>
                    <td><input type="checkbox" checked={r.include} onChange={(e) => setRow(r._id, { include: e.target.checked })} aria-label={`${r.name} 포함`} /></td>
                    <td>{r.name}</td>
                    <td>{r.team}</td>
                    <td>
                      <select value={r.dept || ""} onChange={(e) => setRow(r._id, { dept: e.target.value || null })} aria-label={`${r.name} 부서`}>
                        <option value="">선택</option>
                        {TRIP_DEPTS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                      </select>
                    </td>
                    <td>{r.rank}</td>
                    <td>{r.grade}</td>
                    <td>{r.b1_visa ? "O" : "-"}</td>
                    <td><span className={`tr-status ${st.cls}`}>{st.text}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {missing.length > 0 && (
            <div className="tr-drop-box">
              <div className="tr-drop-head">
                <strong>붙여넣은 표에 없는 재직 인원 {missing.length}명</strong>
                <span className="tr-muted">퇴사했거나 다른 부서로 옮겼다면 체크하세요. 체크한 인원은 퇴사(배정 제외)로 바뀌고 이전 배정 기록은 남습니다.</span>
                <button type="button" className="tr-btn tiny" onClick={() => setDropIds(dropIds.size === missing.length ? new Set() : new Set(missing.map((m) => m.id)))}>{dropIds.size === missing.length ? "모두 해제" : "모두 체크"}</button>
              </div>
              <ul>
                {missing.map((m) => (
                  <li key={m.id}>
                    <label className="tr-check"><input type="checkbox" checked={dropIds.has(m.id)} onChange={() => toggleDrop(m.id)} /><span><b>{m.name}</b> <span className="tr-muted">{TRIP_DEPT_LABEL[m.dept]}{m.team ? ` · ${m.team}` : ""}{m.rank ? ` · ${m.rank}` : ""}</span></span></label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

// ───────── 미등록 프로젝트 대응 일정 등록 (여러 명 한 번에) ─────────

export function OutingModal({ members, ctx, absence, onSave, onUpdate, onDelete, onClose }) {
  const editing = Boolean(absence);
  const [kind, setKind] = useState(absence ? normalizeKind(absence.kind) : "customer");
  const [location, setLocation] = useState(absence?.location || "");
  const [start, setStart] = useState(absence?.start_date || "");
  const [end, setEnd] = useState(absence?.end_date || "");
  const [note, setNote] = useState(absence?.note || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const depts = [...new Set(members.map((m) => m.dept))];
  const dateOk = isValidISO(start) && (!end || (isValidISO(end) && end >= start));

  // 같은 기간에 이미 프로젝트에 배정돼 있거나 다른 일정이 있는 사람
  const clashes = useMemo(() => {
    if (!dateOk) return [];
    const to = end || "9999-12-31";
    const list = [];
    members.forEach((m) => {
      ctx.assignments.filter((a) => a.member_id === m.id && overlaps(a.start_date, a.end_date, start, to)).forEach((a) => {
        list.push(`${m.name}: '${ctx.plans.find((p) => p.id === a.project_id)?.name || "프로젝트"}' 배정(${rangeLabel(a.start_date, a.end_date)})과 겹칩니다`);
      });
      ctx.absences.filter((x) => x.id !== absence?.id && x.member_id === m.id && overlaps(x.start_date, x.end_date, start, to)).forEach((x) => {
        list.push(`${m.name}: ${absenceText(x)} 일정(${rangeLabel(x.start_date, x.end_date)})과 겹칩니다`);
      });
    });
    return list;
  }, [members, ctx, start, end, dateOk, absence?.id]);

  async function submit() {
    setError("");
    if (isOutTrip(kind) && !location.trim()) return setError("어디에 가 있는지(장소·내용)를 적어 주세요. 예: SKO 서산 CS 대응");
    if (!dateOk) return setError("시작일을 입력하고, 종료일은 시작일 이후로 하세요. (종료일을 비우면 '계속'입니다)");
    if (clashes.length) {
      const ok = await confirmDialog({ title: "겹치는 일정이 있습니다", message: "그래도 등록할까요?", detail: clashes.slice(0, 5).join(" · ") + (clashes.length > 5 ? ` 외 ${clashes.length - 5}건` : ""), confirmLabel: "그래도 등록", danger: false });
      if (!ok) return;
    }
    setBusy(true);
    const rows = members.map((m) => ({ member_id: m.id, kind, location, start_date: start, end_date: end, note }));
    const res = editing ? await onUpdate(absence.id, rows[0]) : await onSave(rows);
    setBusy(false);
    if (res?.error) setError(res.error);
  }

  async function remove() {
    const ok = await confirmDialog({ title: "일정 삭제", message: "이 일정을 삭제할까요?", detail: "삭제하면 복구할 수 없습니다." });
    if (!ok) return;
    setBusy(true);
    const res = await onDelete(absence.id);
    setBusy(false);
    if (res?.error) setError(res.error);
  }

  return (
    <Modal dept={depts.length === 1 ? depts[0] : undefined} title={editing ? "미등록 프로젝트 대응 일정 수정" : `미등록 프로젝트 대응 일정 등록 (${members.length}명)`} onClose={onClose} wide
      subtitle={members.map((m) => m.name).join(", ")}
      footer={
        <>
          {editing && <button type="button" className="tr-btn danger left" onClick={remove} disabled={busy}><Icon name="trash" size={14} /> 삭제</button>}
          <button type="button" className="tr-btn" onClick={onClose} disabled={busy}>닫기</button>
          <button type="button" className="tr-btn primary" onClick={submit} disabled={busy}>{busy ? "저장 중..." : editing ? "수정 저장" : "등록"}</button>
        </>
      }>
      <p className="tr-readonly-note"><Icon name="info" size={13} /> 프로젝트에 배정되지 않았지만 본사에 있지 않은 인원(CS 대응·고객사 대응·테스트 등)이 어디에 가 있는지 적어 두면, 그 기간에 '본사 대기'가 아니라 그 장소에 있는 것으로 조회됩니다.</p>
      <div className="tr-form-grid">
        <Field label="종류">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {ABSENCE_KINDS.map((k) => <option key={k.key} value={k.key}>{k.optionLabel || k.label}</option>)}
          </select>
        </Field>
        <Field label={isOutTrip(kind) ? "어디에 (장소·내용)" : "내용 (선택)"} hint={isOutTrip(kind) ? "예: SKO 서산 / 고객사 미팅 / 설비 테스트" : ""}>
          <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={60} placeholder={isOutTrip(kind) ? "필수" : ""} />
        </Field>
        <Field label="시작일"><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="종료일" hint="비우면 '계속'으로 봅니다."><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        <Field label="메모 (선택)" wide><input type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={60} /></Field>
      </div>
      <IssueList issues={clashes.map((message) => ({ level: "warn", message }))} />
      <ErrorLine error={error} />
    </Modal>
  );
}
