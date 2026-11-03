import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import "./MultiSiteSelect.css";

/**
 * Site를 여러 개 골라 거르는 드롭다운.
 * value = 선택한 Site 이름 배열(빈 배열 = 전체), options = [{ value, label?, count? }] 또는 문자열 배열.
 * 걸러내는 쪽은 `siteFilter.js`의 `matchesSites`를 쓴다.
 */
export default function MultiSiteSelect({ options, value, onChange, allLabel = "전체 Site", title, className = "", ariaLabel = "Site 필터" }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const items = options.map((o) => (typeof o === "string" ? { value: o } : o));
  const selected = value.filter((v) => items.some((o) => o.value === v));

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const toggle = (v) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  const labelOf = (v) => items.find((o) => o.value === v)?.label || v;
  const summary = selected.length === 0 ? allLabel : selected.length === 1 ? labelOf(selected[0]) : `${labelOf(selected[0])} 외 ${selected.length - 1}`;

  return (
    <div className={`msite ${className}`} ref={boxRef}>
      <button type="button" className={`msite-btn ${open ? "open" : ""} ${selected.length ? "on" : ""}`} onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel} title={title}>
        <span className="txt">{summary}</span>
        {selected.length > 1 && <span className="cnt">{selected.length}</span>}
        <Icon name="chevDown" size={14} />
      </button>
      {open && (
        <div className="msite-panel" role="listbox" aria-multiselectable="true" aria-label={ariaLabel}>
          <button type="button" className={`msite-all ${selected.length === 0 ? "on" : ""}`} onClick={() => onChange([])}>{allLabel}</button>
          <ul>
            {items.length === 0 && <li className="msite-empty">선택할 Site가 없습니다.</li>}
            {items.map((o) => (
              <li key={o.value}>
                <label className="msite-opt">
                  <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
                  <span>{o.label || o.value}</span>
                  {o.count != null && <em>{o.count}</em>}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
