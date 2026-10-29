import { Icon } from "./icons";
import { MANUAL_DEPTS, buildManualManpower, emptyManualRow, hasMasterManpower } from "./manualManpower";
import "./ManualManpowerEditor.css";

// 마스터 스케줄이 없는 프로젝트에 부서별 계획 공수를 기간·인원으로 직접 적는 칸.
// 마스터 스케줄 공수가 있으면 그쪽이 우선이라 안내만 보인다(마스터를 붙여넣으면 수동 값은 대체된다).
// rows: 입력 중인 구간(비어 있으면 저장된 수동 공수에서 읽는다), onChange(다음 구간 목록, 변환된 manpower)
export default function ManualManpowerEditor({ manpower, rows: draft, onChange, disabled }) {
  const rows = draft || (manpower?.source === "manual" ? manpower.manualRows || [] : []);

  if (hasMasterManpower(manpower)) {
    return (
      <div className="mmp">
        <div className="mmp-head"><h3>부서별 공수 직접 등록</h3></div>
        <p className="mmp-note">이 프로젝트에는 마스터 스케줄 공수가 등록되어 있어 직접 등록은 쓰지 않습니다. 마스터 스케줄이 없는 프로젝트에서만 직접 등록한 공수가 반영됩니다.</p>
      </div>
    );
  }

  const apply = (next) => onChange(next, buildManualManpower(next));
  const patch = (i, part) => apply(rows.map((r, n) => (n === i ? { ...r, ...part } : r)));
  const total = buildManualManpower(rows)?.totalManday || 0;

  return (
    <div className="mmp">
      <div className="mmp-head">
        <div>
          <h3>부서별 공수 직접 등록</h3>
          <p className="mmp-note">마스터 스케줄 없이 기간별로 부서 계획 인원을 적습니다. 일요일은 제외하고 계산하며, 공수 관리·출장자 관리·내보내기에 그대로 반영됩니다.</p>
        </div>
        <button type="button" className="mmp-add" disabled={disabled} onClick={() => apply([...rows, emptyManualRow()])}>
          <Icon name="plus" size={13} /> 구간 추가
        </button>
      </div>
      {rows.length > 0 && (
        <div className="mmp-rows">
          <div className="mmp-row mmp-labels"><span>부서</span><span>시작일</span><span>종료일</span><span>인원</span><span /></div>
          {rows.map((r, i) => (
            <div className="mmp-row" key={i}>
              <select value={r.dept} disabled={disabled} onChange={(e) => patch(i, { dept: e.target.value })}>
                {MANUAL_DEPTS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
              <input type="date" value={r.start} disabled={disabled} onChange={(e) => patch(i, { start: e.target.value })} />
              <input type="date" value={r.end} disabled={disabled} onChange={(e) => patch(i, { end: e.target.value })} />
              <input type="number" min="1" step="1" value={r.count} disabled={disabled} onChange={(e) => patch(i, { count: e.target.value })} />
              <button type="button" className="mmp-del" disabled={disabled} title="구간 삭제" onClick={() => apply(rows.filter((_, n) => n !== i))}>
                <Icon name="trash" size={14} />
              </button>
            </div>
          ))}
          <p className="mmp-total">합계 {total.toLocaleString()} M/D</p>
        </div>
      )}
    </div>
  );
}
