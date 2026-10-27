import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import { rangeLabel } from "./tripLogic";

const STATE_LABEL = { none: "배정 필요", short: "인원 부족", ok: "배정 완료", nodemand: "공수 없음" };

/** 프로젝트 이름·Site·라인으로 검색하고 Site·배정 상태로 거르는 드롭다운 */
export default function ProjectPicker({ plans, states, selectedId, onSelect, showPast, setShowPast, pastCount }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [site, setSite] = useState("all");
  const [customer, setCustomer] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    inputRef.current?.focus();
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const sites = useMemo(() => [...new Set(plans.map((p) => p.site).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko")), [plans]);
  const customers = useMemo(() => [...new Set(plans.map((p) => p.customer).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko")), [plans]);
  const selected = plans.find((p) => p.id === selectedId);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return plans.filter((p) => {
      if (customer !== "all" && p.customer !== customer) return false;
      if (site !== "all" && p.site !== site) return false;
      if (stateFilter !== "all" && states.get(p.id)?.state !== stateFilter) return false;
      if (!q) return true;
      return [p.name, p.site, p.line, p.manufacturingNo, p.customer].some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [plans, states, query, customer, site, stateFilter]);

  return (
    <div className="tr-picker" ref={boxRef}>
      <button type="button" className={`tr-picker-btn ${open ? "open" : ""}`} onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open}>
        <Icon name="search" size={15} />
        <span className="txt">{selected ? <><b>{selected.name}</b><em>{selected.site}</em></> : "프로젝트 선택 (이름·Site 검색)"}</span>
        <Icon name="chevDown" size={15} />
      </button>
      {open && (
        <div className="tr-picker-panel" role="listbox" aria-label="프로젝트 목록">
          <div className="tr-picker-filters">
            <input ref={inputRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="프로젝트 이름, Site, 라인 검색" aria-label="프로젝트 검색" />
            <select value={customer} onChange={(e) => setCustomer(e.target.value)} aria-label="고객사 필터">
              <option value="all">모든 고객사</option>
              {customers.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={site} onChange={(e) => setSite(e.target.value)} aria-label="Site 필터">
              <option value="all">모든 Site</option>
              {sites.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} aria-label="배정 상태 필터">
              <option value="all">모든 상태</option>
              <option value="none">배정 필요</option>
              <option value="short">인원 부족</option>
              <option value="ok">배정 완료</option>
              <option value="nodemand">공수 없음</option>
            </select>
          </div>
          <label className="tr-check inline tr-picker-past">
            <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
            <span>완료 시점이 지난 프로젝트도 보기{pastCount ? ` (${pastCount})` : ""}</span>
          </label>
          <ul className="tr-picker-list">
            {list.length === 0 && <li className="tr-picker-empty">조건에 맞는 프로젝트가 없습니다.</li>}
            {list.map((p) => {
              const st = states.get(p.id)?.state || "ok";
              return (
                <li key={p.id}>
                  <button type="button" role="option" aria-selected={p.id === selectedId} className={`tr-picker-item ${p.id === selectedId ? "on" : ""}`} onClick={() => { onSelect(p.id); setOpen(false); }}>
                    <span className="main">
                      <b>{p.name}</b>
                      <span className="sub">{[p.customer, p.site, p.line, rangeLabel(p.start_date, p.end_date)].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className={`tr-state ${st}`}>{STATE_LABEL[st]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
