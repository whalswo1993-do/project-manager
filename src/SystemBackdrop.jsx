import "./SystemBackdrop.css";

// 시스템(화면)마다 머리말 뒤에 깔리는 장식 그림. 색은 전부 테마 토큰이라 라이트/다크를 따로 만들 필요가 없다.
// 순수 장식이므로 보조기기에서는 숨기고(aria-hidden), 값이 필요한 곳(날짜 등)은 화면을 열 때 계산한다.
// 일정 = 타임라인(간트) · 공수 = 투입 매트릭스 · 이슈 = 공정 흐름 · 공사일보 = 일지(일력) · 견적 = 원장 표 · SPC = 분포 곡선
// 그림 높이는 170 안쪽으로 맞춘다: 머리말만 있는 화면(이슈 등)에서도 아래 내용 상자에 가려지지 않는 높이.
const VB = "0 0 820 170";

// 일정: 시간축 + 달 구분선 + 진행 중인 막대들 + 오늘선
function ScheduleArt() {
  const bars = [
    [30, 440, 330],
    [110, 400, 240],
    [200, 340, 120],
    [290, 380, 60],
    [410, 330, 0],
  ];
  return (
    <svg viewBox={VB} focusable="false">
      <line className="ln-s" x1="0" y1="16" x2="820" y2="16" />
      {Array.from({ length: 42 }, (_, i) => (
        <line key={i} className={i % 5 === 0 ? "ln-s" : "ln"} x1={i * 20} y1="16" x2={i * 20} y2={i % 5 === 0 ? 8 : 12} />
      ))}
      {[0, 164, 328, 492, 656, 820].map((x) => (
        <line key={x} className="ln-d" x1={x} y1="16" x2={x} y2="166" />
      ))}
      {bars.map(([x, w, p], i) => {
        const y = 36 + i * 27;
        return (
          <g key={i}>
            <rect className="fl-2" x={x - 60} y={y + 3} width="46" height="4" />
            <rect className="fl-2" x={x} y={y} width={w} height="10" />
            {p > 0 && <rect className="brand" x={x} y={y} width={p} height="10" />}
          </g>
        );
      })}
      <line className="today" x1="476" y1="10" x2="476" y2="166" />
      <polygon className="today-fill" points="470,3 482,3 476,12" />
    </svg>
  );
}

// 공수: 부서(행) × 일(열) 투입 매트릭스 + 일별 합계 막대. 주말은 비고 평일은 파도처럼 오르내린다
function ManpowerArt() {
  const DEPTS = ["MECH", "VIS", "CTRL", "ELEC", "SUP", "SAFE"];
  const amp = [1, 0.8, 0.7, 0.9, 0.35, 0.5];
  const cols = 31;
  const x0 = 88;
  const y0 = 28;
  const px = 22;
  const py = 15;
  const cell = (r, c) => {
    const weekend = c % 7 === 5 || c % 7 === 6;
    const wave = 0.5 + 0.5 * Math.sin(c * 0.45 + r * 1.1);
    return weekend ? 0.04 : amp[r] * wave;
  };
  const sums = Array.from({ length: cols }, (_, c) => DEPTS.reduce((a, _, r) => a + cell(r, c), 0));
  const peak = sums.indexOf(Math.max(...sums));
  return (
    <svg viewBox={VB} focusable="false">
      {DEPTS.map((d, r) => (
        <text key={d} className="tx" x="0" y={y0 + r * py + 10}>{d}</text>
      ))}
      {[0, 4, 9, 14, 19, 24, 30].map((c) => (
        <g key={c}>
          <line className="ln-s" x1={x0 + c * px + 8} y1="16" x2={x0 + c * px + 8} y2="22" />
          <text className="tx" x={x0 + c * px + 8} y="11" textAnchor="middle">{String(c + 1).padStart(2, "0")}</text>
        </g>
      ))}
      {DEPTS.map((_, r) =>
        Array.from({ length: cols }, (__, c) => (
          <rect key={`${r}-${c}`} className="heat" x={x0 + c * px} y={y0 + r * py} width="16" height="11" fillOpacity={0.03 + 0.2 * cell(r, c)} />
        ))
      )}
      <line className="ln-d" x1={x0 + peak * px + 8} y1="22" x2={x0 + peak * px + 8} y2="166" />
      {sums.map((s, c) => {
        const h = 5 + s * 5;
        return <rect key={c} className={c === peak ? "brand" : "fl-2"} x={x0 + c * px} y={166 - h} width="16" height={h} />;
      })}
      <text className="tx" x="0" y="164">TOTAL</text>
      <text className="tx" x={x0 + peak * px + 8} y="130" textAnchor="middle">PEAK</text>
    </svg>
  );
}

// 이슈: 공정(STK/NCH) 두 줄의 흐름과 이슈 표식(마름모)
function IssuesArt() {
  const xs = [70, 196, 322, 448, 574, 700, 800];
  const lanes = [
    { y: 66, label: "STK", done: 3, marks: [[1, "ok"], [3, "bad"]] },
    { y: 128, label: "NCH", done: 4, marks: [[2, "warn"], [4, "bad"]] },
  ];
  return (
    <svg viewBox={VB} focusable="false">
      {lanes.map(({ y, label, done, marks }) => (
        <g key={label}>
          <text className="tx" x="0" y={y + 4}>{label}</text>
          <line className="ln-s" x1="46" y1={y} x2="810" y2={y} />
          {xs.map((x, i) =>
            i < done ? (
              <circle key={i} className="node-done" cx={x} cy={y} r="4.5" />
            ) : i === done ? (
              <g key={i}>
                <circle className="node-now" cx={x} cy={y} r="8" />
                <circle className="node-done" cx={x} cy={y} r="3" />
              </g>
            ) : (
              <circle key={i} className="node-todo" cx={x} cy={y} r="4.5" />
            )
          )}
          {marks.map(([i, tone]) => (
            <g key={i}>
              <line className="ln" x1={xs[i]} y1={y - 8} x2={xs[i]} y2={y - 22} />
              <polygon className={`diamond ${tone}`} points={`${xs[i]},${y - 36} ${xs[i] + 7},${y - 29} ${xs[i]},${y - 22} ${xs[i] - 7},${y - 29}`} />
            </g>
          ))}
        </g>
      ))}
      <line className="ln-d" x1="512" y1="14" x2="512" y2="150" />
      <text className="tx" x="512" y="9" textAnchor="middle">NOW</text>
      {[["bad", "OPEN", 470], ["warn", "IN PROGRESS", 562], ["ok", "RESOLVED", 702]].map(([tone, t, dx]) => (
        <g key={t}>
          <polygon className={`diamond ${tone}`} points={`${5 + dx},157 ${10 + dx},162 ${5 + dx},167 ${dx},162`} />
          <text className="tx" x={18 + dx} y="166">{t}</text>
        </g>
      ))}
    </svg>
  );
}

// 공사일보: 장부 줄 + 오늘 날짜가 찍힌 일력(찢어 쓰는 달력)
function DailyArt() {
  const d = new Date();
  const wk = d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  const mon = d.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  return (
    <svg viewBox={VB} focusable="false">
      {Array.from({ length: 9 }, (_, i) => (
        <line key={i} className="ln" x1="0" y1={14 + i * 18} x2="820" y2={14 + i * 18} />
      ))}
      <g transform="translate(610,6)">
        <rect className="paper" x="0" y="0" width="180" height="160" />
        <line className="ln-s" x1="0" y1="30" x2="180" y2="30" />
        <circle className="ring" cx="48" cy="15" r="5" />
        <circle className="ring" cx="132" cy="15" r="5" />
        <text className="day" x="90" y="112" textAnchor="middle">{d.getDate()}</text>
        <text className="tx" x="90" y="146" textAnchor="middle">{wk} · {mon} {d.getFullYear()}</text>
      </g>
    </svg>
  );
}

// 견적: 원장(가격표) 모양의 빈 표 + 합계 아래 겹줄
function QuotationsArt() {
  const cols = [0, 170, 360, 500, 650, 820];
  const heads = ["ITEM", "SPEC", "QTY", "UNIT ₩", "AMOUNT ₩"];
  const rowH = 20;
  const y0 = 20;
  const rows = 6;
  const widths = [96, 70, 108, 84, 120, 76];
  return (
    <svg viewBox={VB} focusable="false">
      <rect className="head" x="0" y={y0} width="820" height={rowH} />
      {Array.from({ length: rows + 1 }, (_, i) => (
        <line key={i} className="ln" x1="0" y1={y0 + i * rowH} x2="820" y2={y0 + i * rowH} />
      ))}
      {cols.map((x) => (
        <line key={x} className="ln" x1={x} y1={y0} x2={x} y2={y0 + rows * rowH} />
      ))}
      {heads.map((h, i) => (
        <text key={h} className="tx" x={i >= 2 ? cols[i + 1] - 12 : cols[i] + 12} y={y0 + 14} textAnchor={i >= 2 ? "end" : "start"}>{h}</text>
      ))}
      {Array.from({ length: rows - 1 }, (_, r) =>
        [0, 1, 2, 3, 4].map((c) => {
          const w = widths[(r * 3 + c * 2) % widths.length] * (c === 1 ? 1.2 : c >= 2 ? 0.55 : 1);
          const y = y0 + (r + 1) * rowH + 8;
          return <rect key={`${r}-${c}`} className="fl-2" x={c >= 2 ? cols[c + 1] - 12 - w : cols[c] + 12} y={y} width={w} height="4" />;
        })
      )}
      <line className="ln-s" x1="500" y1={y0 + rows * rowH + 8} x2="820" y2={y0 + rows * rowH + 8} />
      <line className="ln-s" x1="500" y1={y0 + rows * rowH + 12} x2="820" y2={y0 + rows * rowH + 12} />
    </svg>
  );
}

// SPC: 히스토그램 + 정규분포 곡선 + 규격 한계(LSL/USL)와 σ 눈금
function SpcArt() {
  const mu = 410;
  const s = 66;
  const base = 138;
  const peak = 96;
  const g = (x) => peak * Math.exp(-0.5 * ((x - mu) / s) ** 2);
  const pts = [];
  for (let x = mu - 230; x <= mu + 230; x += 6) pts.push(`${x},${(base - g(x)).toFixed(1)}`);
  return (
    <svg viewBox={VB} focusable="false">
      <line className="ln-s" x1="40" y1={base} x2="790" y2={base} />
      {Array.from({ length: 21 }, (_, k) => {
        const i = k - 10;
        const x = mu + i * 18;
        const h = g(x);
        return <rect key={k} className={Math.abs(i) <= 2 ? "brand" : "fl-2"} x={x - 7} y={base - h} width="14" height={h} />;
      })}
      <polyline className="curve" points={pts.join(" ")} />
      {[-2, -1, 1, 2].map((k) => (
        <line key={k} className="ln-d" x1={mu + k * s} y1="34" x2={mu + k * s} y2={base} />
      ))}
      <line className="ln-d" x1={mu} y1="22" x2={mu} y2={base} />
      {[-3, 3].map((k) => (
        <g key={k}>
          <line className="limit" x1={mu + k * s} y1="30" x2={mu + k * s} y2={base} />
          <text className="tx" x={mu + k * s} y="22" textAnchor="middle">{k < 0 ? "LSL" : "USL"}</text>
        </g>
      ))}
      <text className="tx" x={mu} y="14" textAnchor="middle">TARGET</text>
      {[-3, -2, -1, 0, 1, 2, 3].map((k) => (
        <g key={k}>
          <line className="ln-s" x1={mu + k * s} y1={base} x2={mu + k * s} y2={base + 5} />
          <text className="tx" x={mu + k * s} y={base + 19} textAnchor="middle">{k === 0 ? "μ" : `${k > 0 ? "+" : "−"}${Math.abs(k)}σ`}</text>
        </g>
      ))}
    </svg>
  );
}

const ARTS = {
  projects: ScheduleArt,
  manpower: ManpowerArt,
  issues: IssuesArt,
  "daily-reports": DailyArt,
  quotations: QuotationsArt,
  "vision-spc": SpcArt,
};

export default function SystemBackdrop({ kind }) {
  const Art = ARTS[kind];
  return (
    <div className={`sys-backdrop sys-${kind}`} aria-hidden="true">
      <div className="sys-ruler" />
      {Art && (
        <div className="sys-art">
          <Art />
        </div>
      )}
    </div>
  );
}
