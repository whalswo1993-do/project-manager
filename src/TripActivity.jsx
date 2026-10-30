import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { fetchActivity } from "./tripService";
import { TRIP_DEPT_LABEL } from "./tripLogic";

// 출장자 관리 작업 기록: 머리말 오른쪽 아래에 "마지막 작업" 카드, 누르면 타임라인이 펼쳐진다.
const ENTITY = { assignment: "배정", member: "인원", absence: "외부 일정", note: "특이사항" };
const ACTION = { insert: "추가", update: "수정", delete: "삭제" };
const FILTERS = [["all", "전체"], ["assignment", "배정"], ["member", "인원"], ["absence", "외부 일정"], ["note", "특이사항"]];
const PAGE = 40;

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const timeOf = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export function relativeTime(iso, now = Date.now()) {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  const x = new Date(iso);
  return `${x.getMonth() + 1}/${x.getDate()}`;
}

function dayTitle(key, todayKey) {
  if (key === todayKey) return "오늘";
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (key === dayKey(y.toISOString())) return "어제";
  return key.slice(5).replace("-", "/");
}

const who = (a) => a.actor_name || "알 수 없는 사용자";
const place = (a) => [a.project_name, a.dept ? TRIP_DEPT_LABEL[a.dept] || a.dept : ""].filter(Boolean).join(" · ");

export default function TripActivity({ refreshKey }) {
  const [latest, setLatest] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [rows, setRows] = useState([]);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const root = useRef(null);

  useEffect(() => {
    let live = true;
    fetchActivity({ limit: 1 }).then((res) => {
      if (!live) return;
      if (res.missing) { setHidden(true); return; }
      setHidden(false);
      setLatest(res.data[0] || null);
    });
    return () => { live = false; };
  }, [refreshKey]);

  const load = useCallback(async (reset) => {
    setBusy(true);
    const before = reset ? null : rows[rows.length - 1]?.at;
    const res = await fetchActivity({ limit: PAGE, before, entity: filter });
    setErr(res.error);
    setRows((prev) => (reset ? res.data : [...prev, ...res.data]));
    setMore(res.data.length === PAGE);
    setBusy(false);
  }, [filter, rows]);

  useEffect(() => {
    if (open) load(true);
    // 열 때, 필터를 바꿀 때, 데이터가 바뀔 때 다시 읽는다 (load 는 rows 에 의존하므로 제외)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filter, refreshKey]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (root.current && !root.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  if (hidden) return null;
  const todayKey = dayKey(new Date().toISOString());
  const groups = [];
  rows.forEach((a) => {
    const k = dayKey(a.at);
    if (!groups.length || groups[groups.length - 1].key !== k) groups.push({ key: k, items: [] });
    groups[groups.length - 1].items.push(a);
  });

  return (
    <div className="tr-act" ref={root}>
      <button type="button" className={`tr-act-card ${open ? "open" : ""}`} onClick={() => setOpen((v) => !v)} aria-expanded={open} title="작업 기록 펼치기">
        <Icon name="clock" size="1.1em" />
        {latest ? (
          <span className="tr-act-last">
            <span className="tr-act-who">{who(latest)}</span>
            <span className="tr-act-when">{relativeTime(latest.at)}</span>
            <span className="tr-act-what">{ENTITY[latest.entity]} {ACTION[latest.action]}{latest.summary ? ` · ${latest.summary}` : ""}</span>
          </span>
        ) : <span className="tr-act-last"><span className="tr-act-what">아직 기록된 작업이 없습니다</span></span>}
        <Icon name="chevron-down" size="1em" />
      </button>
      {open && (
        <div className="tr-act-pop" role="dialog" aria-label="작업 기록">
          <div className="tr-act-pophead">
            <strong>작업 기록</strong>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="종류">
              {FILTERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div className="tr-act-list">
            {err && <div className="tr-act-empty">{err}</div>}
            {!err && !rows.length && !busy && <div className="tr-act-empty">기록이 없습니다.</div>}
            {groups.map((g) => (
              <div key={g.key} className="tr-act-day">
                <div className="tr-act-dayhead">{dayTitle(g.key, todayKey)}<span>{g.key}</span></div>
                {g.items.map((a) => (
                  <div key={a.id} className="tr-act-item" data-action={a.action} title={[a.summary, place(a)].filter(Boolean).join(" · ")}>
                    <span className="tr-act-time">{timeOf(a.at)}</span>
                    <div className="tr-act-body">
                      <div className="tr-act-line"><b>{who(a)}</b>{a.actor_team ? <em>{a.actor_team}</em> : null}<span className="tr-act-tag">{ENTITY[a.entity]} {ACTION[a.action]}</span></div>
                      {a.summary && <div className="tr-act-sum">{a.summary}</div>}
                      {place(a) && <div className="tr-act-place">{place(a)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {more && <button type="button" className="tr-act-more" disabled={busy} onClick={() => load(false)}>{busy ? "불러오는 중..." : "더 보기"}</button>}
          </div>
        </div>
      )}
    </div>
  );
}
