import { useMemo, useState } from "react";
import { Icon } from "./icons";
import { buildGanttColumns, downloadProjectGanttWorkbook, projectBlocks, scheduleRange } from "./projectGanttWorkbook";
import "./ProjectGanttExportModal.css";

/** 프로젝트 일정 종합 엑셀(간트) 내려받기: 일/주 단위, 기간, 마일스톤 접기 여부를 고른다 */
export default function ProjectGanttExportModal({ projects, customer, label, onClose }) {
  const blocks = useMemo(() => projectBlocks(projects), [projects]);
  const auto = useMemo(() => scheduleRange(blocks), [blocks]);
  const [unit, setUnit] = useState("week");
  const [startDate, setStartDate] = useState(auto?.start || "");
  const [endDate, setEndDate] = useState(auto?.end || "");
  const [collapsed, setCollapsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const colCount = useMemo(() => {
    if (!startDate || !endDate || endDate < startDate) return 0;
    return buildGanttColumns(unit, startDate, endDate).cols.length;
  }, [unit, startDate, endDate]);
  const msCount = blocks.reduce((n, b) => n + b.milestones.length, 0);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await downloadProjectGanttWorkbook(projects, { unit, startDate, endDate, collapsed, customer, label });
      onClose();
    } catch (e) {
      setError(e?.message || "엑셀을 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pgx-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="pgx-modal" role="dialog" aria-modal="true" aria-label="프로젝트 일정 간트 엑셀">
        <div className="pgx-head">
          <div>
            <div className="eyebrow">GANTT EXCEL</div>
            <h3>프로젝트 일정 간트 엑셀</h3>
          </div>
          <button type="button" className="pgx-x" onClick={onClose} disabled={busy} aria-label="닫기"><Icon name="x" size={16} /></button>
        </div>
        <p className="pgx-note">
          <Icon name="info" size={13} /> 프로젝트 {projects.length}건 · 마일스톤 {msCount}개를 프로젝트별 간트로 만듭니다. 프로젝트 줄의 +/− 로 마일스톤을 접고 펼치며, 시작일·종료일을 엑셀에서 고치면 막대가 같이 움직입니다.
        </p>
        <div className="pgx-grid">
          <div className="pgx-field wide">
            <span className="pgx-label">칸 단위</span>
            <div className="pgx-seg" role="group" aria-label="칸 단위">
              <button type="button" className={unit === "week" ? "on" : ""} onClick={() => setUnit("week")}>주 단위</button>
              <button type="button" className={unit === "day" ? "on" : ""} onClick={() => setUnit("day")}>일 단위</button>
            </div>
          </div>
          <label className="pgx-field">
            <span className="pgx-label">시작일</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="pgx-field">
            <span className="pgx-label">종료일</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
          <div className="pgx-field wide">
            <label className="pgx-check"><input type="checkbox" checked={collapsed} onChange={(e) => setCollapsed(e.target.checked)} /> 마일스톤을 접은 상태로 시작 (프로젝트 줄만 보이고 + 로 펼침)</label>
            {auto && (startDate !== auto.start || endDate !== auto.end) && (
              <button type="button" className="pgx-link" onClick={() => { setStartDate(auto.start); setEndDate(auto.end); }}>전체 일정 기간으로 되돌리기 ({auto.start} ~ {auto.end})</button>
            )}
          </div>
        </div>
        <div className="pgx-foot-info">{colCount > 0 ? `${unit === "day" ? "일" : "주"} 단위 ${colCount}칸` : "기간을 확인해 주세요"}{unit === "day" && colCount > 400 ? " · 칸이 많아 주 단위가 보기 편합니다" : ""}</div>
        {error && <div className="pgx-error" role="alert">{error}</div>}
        <div className="pgx-actions">
          <button type="button" className="pgx-btn" onClick={onClose} disabled={busy}>닫기</button>
          <button type="button" className="pgx-btn primary" onClick={submit} disabled={busy || !auto || colCount === 0}>
            <Icon name="download" size={14} /> {busy ? "만드는 중..." : "엑셀 내려받기"}
          </button>
        </div>
      </div>
    </div>
  );
}
