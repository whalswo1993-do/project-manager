// 출장자 종합 엑셀: 기존 관리장표("PJT 출장자" 시트)와 같은 모양으로 프로젝트별 출장자 배정을 한 파일에 모은다.
// 이 파일은 값만 박아 넣은 그림이 아니라 수식으로 이어져 있다 — 엑셀에서 이름을 적거나 칸·프로젝트를 복사해 붙이면
// 프로젝트별 TOTAL, 취합 공수, 종합 현황, 인원별 현황이 같이 바뀐다. (행 번호가 아니라 "표시 열(A)"과 부서 이름으로 모으기 때문)
//
// 시트: PJT 출장자(관리장표) · 종합 현황 · 인원별 현황 · 프로젝트 목차 · 인원 명단 · 외부 일정 · 작성 안내
// 계산 결과(result)를 같이 적어 두어서 미리보기 화면에서도 숫자가 보이고, 엑셀에서 열면 다시 계산한다.
import {
  TRIP_DEPTS, TRIP_DEPT_LABEL, ABSENCE_KIND_LABEL, buildColumns, mondayOf, addDays, overlaps, weeksBetween, shortDate, rangeLabel,
  needForWeek, peakNeed, layoutLanes, phaseColors, phaseRows, isPastProject, todayISO, isOutTrip, normalizeKind,
} from "./tripLogic";

export const MAIN = "PJT 출장자";
const FONT = "맑은 고딕";
const C = {
  ink: "FF1F2937", muted: "FF6B7280", line: "FFD1D5DB", head: "FF1F2937", brand: "FF0B57A4", zebra: "FFF8FAFC", wash: "FFEAF1FB",
  open: "FFFDE2E2", openInk: "FFB91C1C", ok: "FFE7F5EC", warn: "FFFFF1D6", away: "FFDDF3F1", awayInk: "FF0F766E",
};
const DEPT_COLOR = { mechanical: "FF2563A8", vision: "FF7048C2", control: "FF0F8A80", electrical: "FFB83A76", manager: "FF566478" };
const MS_COLOR = ["FF1D5FD1", "FFC2570C", "FF15803D", "FF7C3AED", "FFBE185D", "FF0E7490", "FFA16207", "FFB91C1C"];
const STATUS_LIST = '"지속,검토 중,공수 확정,공수 협의 전,진행중,제작중,검토중,완료"';
const FIRST_DATA_ROW = 8; // 머리글(5~7줄) 다음
const WEEK_COL0 = 5; // E 열부터 주 단위 칸
const EXTRA_ROWS = 500; // 수식이 보는 범위를 마지막 줄보다 넉넉히 잡아, 나중에 프로젝트·줄을 더해도 같이 계산되게 한다

export const colLetter = (n) => { let s = ""; let x = n; while (x > 0) { const m = (x - 1) % 26; s = String.fromCharCode(65 + m) + s; x = Math.floor((x - 1) / 26); } return s; };
const serial = (iso) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse("1899-12-30T00:00:00Z")) / 86400000);
const asDate = (iso) => new Date(`${iso}T00:00:00Z`);
const solid = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const thin = { style: "thin", color: { argb: C.line } };
const box = { top: thin, left: thin, bottom: thin, right: thin };
const font = (extra = {}) => ({ name: FONT, size: 10, color: { argb: C.ink }, ...extra });

// 행의 "접힘(collapsed)" 표시: ExcelJS 기본 동작은 그룹 안의 모든 행에 붙여서, 엑셀이 그룹 상태를 잘못 읽는다 → 직접 정한다.
function setCollapsed(row, value) {
  Object.defineProperty(row, "collapsed", { get: () => Boolean(value), configurable: true });
}

/**
 * input = { plans, demands, assignments, members, absences, notes } (화면이 쓰는 것과 같은 모양)
 * options = { startWeek, weeks, includePast, collapsed, today }
 */
export function buildTripWorkbook(ExcelJS, input, options = {}) {
  const today = options.today || todayISO();
  const startWeek = mondayOf(options.startWeek || today);
  const plans = (input.plans || []).filter((p) => options.includePast || !isPastProject(p, today));
  const members = (input.members || []).slice().sort((a, b) => TRIP_DEPTS.findIndex((d) => d.key === a.dept) - TRIP_DEPTS.findIndex((d) => d.key === b.dept)
    || String(a.team || "").localeCompare(String(b.team || ""), "ko") || a.name.localeCompare(b.name, "ko"));
  const maxEnd = plans.reduce((m, p) => (p.end_date > m ? p.end_date : m), startWeek);
  const weeks = options.weeks || Math.max(12, Math.min(78, weeksBetween(startWeek, maxEnd)));
  const cols = buildColumns("week", startWeek, weeks);
  const LAST_COL = WEEK_COL0 + weeks - 1;
  const AJ = LAST_COL + 1; // 프로젝트 표시(자동) 열
  const lastColL = colLetter(LAST_COL);
  const ajL = colLetter(AJ);

  const wb = new ExcelJS.Workbook();
  wb.creator = "TW Project Manager";
  wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };

  const ws = wb.addWorksheet(MAIN, {
    views: [{ state: "frozen", xSplit: 4, ySplit: 7, zoomScale: 80, showGridLines: false }],
    properties: { tabColor: { argb: "FF0B57A4" }, outlineLevelRow: 1 },
    pageSetup: { orientation: "landscape", paperSize: 8, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "5:7", printTitlesColumn: "A:D" },
  });
  // (outlineProperties 는 쓰지 않는다: 엑셀 기본값이 "요약 줄이 아래"이고, ExcelJS 가 fitToPage 와 같이 쓰면 XML 순서가 어긋나 엑셀이 파일을 못 연다)
  ws.columns = [
    { width: 2.2 }, { width: 10 }, { width: 38 }, { width: 10 },
    ...Array.from({ length: weeks }, () => ({ width: 7.6 })),
    { width: 20 },
  ];

  // ── 머리글(1~7줄) ──
  ws.mergeCells(1, 2, 1, LAST_COL);
  ws.getCell(1, 2).value = "출장자 종합 현황 — 프로젝트별 출장자 배정";
  ws.getCell(1, 2).font = font({ size: 18, bold: true });
  ws.getRow(1).height = 30;
  ws.mergeCells(2, 2, 2, LAST_COL);
  ws.getCell(2, 2).value = `${today} 기준으로 내려받음 · 주 단위(월요일 시작) · 파란 칸 = 출장자 이름, 분홍 "1" = 아직 정해지지 않은 자리, 주황 = 미국 사이트에서 B1 비자 확인이 안 됨, 빨강 = 같은 주에 두 곳에 배정됨`;
  ws.getCell(2, 2).font = font({ size: 9, color: { argb: C.muted } });
  ws.mergeCells(3, 2, 3, LAST_COL);
  ws.getCell(3, 2).value = "※ 이름 칸을 눌러 목록에서 고르거나 직접 입력하세요. 분홍 \"1\"은 이름으로 바꾸면 되고, 칸이 모자라면 프로젝트 아래의 여유 줄에 부서를 고르고 이름을 적으세요. 합계·종합 시트는 자동으로 바뀝니다.";
  ws.getCell(3, 2).font = font({ size: 9, color: { argb: C.muted } });
  ws.mergeCells(4, 2, 4, LAST_COL);
  ws.getCell(4, 2).value = "※ 왼쪽 위 숫자 1·2 버튼으로 전체 접기/펼치기, 프로젝트 아래쪽 +/− 버튼으로 그 프로젝트만 접고 펼칩니다.";
  ws.getCell(4, 2).font = font({ size: 9, bold: true, color: { argb: C.brand } });

  const headLabels = [["YEAR", 5], ["MONTH", 6], ["DAY", 7]];
  headLabels.forEach(([label, r]) => {
    ws.getRow(r).height = 20;
    ws.getCell(r, 2).value = label;
    ws.mergeCells(r, 2, r, 3);
    for (let c = 2; c <= LAST_COL; c += 1) {
      const cell = ws.getCell(r, c);
      cell.fill = solid(C.head);
      cell.font = font({ bold: true, color: { argb: "FFFFFFFF" }, size: r === 7 ? 9.5 : 10 });
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = box;
    }
  });
  ws.mergeCells(5, 4, 7, 4);
  ws.getCell(5, 4).value = "현 상황";
  cols.forEach((col, i) => {
    const c = WEEK_COL0 + i;
    const L = colLetter(c);
    const prev = colLetter(c - 1);
    const year = Number(col.start.slice(0, 4));
    const month = Number(col.start.slice(5, 7));
    ws.getCell(7, c).value = i === 0 ? { formula: undefined, result: undefined } : null; // 아래에서 채운다
    if (i === 0) {
      ws.getCell(7, c).value = asDate(col.start);
      ws.getCell(5, c).value = { formula: `YEAR(${L}7)`, result: year };
    } else {
      ws.getCell(7, c).value = { formula: `${prev}7+7`, result: serial(col.start) };
      const prevYear = Number(cols[i - 1].start.slice(0, 4));
      ws.getCell(5, c).value = { formula: `IF(YEAR(${L}7)<>YEAR(${prev}7),YEAR(${L}7),"")`, result: year !== prevYear ? year : "" };
    }
    ws.getCell(6, c).value = { formula: `MONTH(${L}7)&"월"`, result: `${month}월` };
    ws.getCell(7, c).numFmt = "m/d";
  });
  const weekHead = `E5:${lastColL}7`;
  ws.addConditionalFormatting({
    ref: weekHead,
    rules: [{ type: "expression", formulae: [`AND(E$7<=TODAY(),E$7+7>TODAY())`], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FF2563EB" } }, font: { bold: true, color: { argb: "FFFFFFFF" } } } }],
  });
  ws.getCell(1, AJ).value = null;
  ws.getCell(5, AJ).value = "프로젝트 표시";
  ws.mergeCells(5, AJ, 7, AJ);
  ws.getCell(5, AJ).fill = solid(C.head);
  ws.getCell(5, AJ).font = font({ bold: true, color: { argb: "FFFFFFFF" }, size: 9 });
  ws.getCell(5, AJ).alignment = { horizontal: "center", vertical: "middle", wrapText: true };

  // ── 프로젝트 블록 ──
  let r = FIRST_DATA_ROW;
  const blocks = []; // 목차·검증용 { plan, headerRow, slotFirst, slotLast, totalRows, firstRow, lastRow }
  const demandsOf = (id) => (input.demands || []).filter((d) => d.project_id === id);
  const assignmentsOf = (id) => (input.assignments || []).filter((a) => a.project_id === id);
  const memberById = new Map((input.members || []).map((m) => [m.id, m]));
  const nameOf = (a) => (a.member_id ? memberById.get(a.member_id)?.name : a.label) || "(이름 없음)";
  const planWeekly = {}; // 부서 → 주별 계획 공수 합 (종합 현황의 "계획")
  TRIP_DEPTS.forEach((d) => { planWeekly[d.key] = cols.map(() => 0); });
  const assignedByWeek = {}; // 검증용: 부서 → 주별 배정 수(이름 칸 수), 외주 수, 빈 칸 수
  const grandCount = {}; // 부서별·주별 전체 프로젝트 TOTAL 합 (맨 아래 취합 줄의 캐시 값)
  TRIP_DEPTS.forEach((d) => { assignedByWeek[d.key] = cols.map(() => ({ filled: 0, sub: 0, open: 0 })); grandCount[d.key] = cols.map(() => 0); });
  const nameWeek = new Map(); // 이름 → 주 index → [프로젝트 표시]

  plans.forEach((plan) => {
    const pDemands = demandsOf(plan.id);
    const pAsg = assignmentsOf(plan.id);
    const phases = Array.isArray(plan.phases) ? plan.phases : [];
    const colorIdx = phaseColors(phases);
    const phaseLanes = phases.length ? phaseRows(cols, phases, colorIdx) : [];
    const shortLabel = [plan.site, plan.line].filter(Boolean).join(" ") || plan.name;
    const blockFirst = r;
    const projCount = {}; // 이 프로젝트의 부서별·주별 비어 있지 않은 칸 수 (TOTAL 줄의 캐시 값)
    TRIP_DEPTS.forEach((d) => { projCount[d.key] = cols.map(() => 0); });

    // 머리글 줄 (표시 열 A = "H")
    const headerRow = r;
    const hr = ws.getRow(r);
    hr.height = 24;
    ws.getCell(r, 1).value = "H";
    ws.getCell(r, 2).value = plan.site || "";
    ws.getCell(r, 3).value = plan.name;
    ws.getCell(r, 4).value = plan.status || "지속";
    ws.getCell(r, 4).dataValidation = { type: "list", allowBlank: true, formulae: [STATUS_LIST], showErrorMessage: true, errorStyle: "warning", errorTitle: "상태", error: "목록에 없는 상태입니다. 그대로 쓰려면 ‘예’를 누르세요." };
    ws.mergeCells(r, 5, r, LAST_COL);
    const peaks = TRIP_DEPTS.filter((d) => peakNeed(pDemands, d.key) > 0).map((d) => `${d.label} ${peakNeed(pDemands, d.key)}`);
    ws.getCell(r, 5).value = `${rangeLabel(plan.start_date, plan.end_date)} (${weeksBetween(plan.start_date, plan.end_date)}주)${peaks.length ? ` · 계획 공수 최대 ${peaks.join(" · ")}` : " · 계획 공수 없음"}${plan.overseas ? " · 미국 사이트(B1 확인)" : ""}`;
    ws.getCell(r, AJ).value = shortLabel;
    for (let c = 2; c <= AJ; c += 1) {
      const cell = ws.getCell(r, c);
      cell.fill = solid(c <= 4 ? C.head : "FFF1F5F9");
      cell.font = c <= 4 ? font({ bold: true, color: { argb: "FFFFFFFF" }, size: c === 3 ? 11 : 10 }) : font({ size: 9.5, color: { argb: C.muted } });
      cell.alignment = { vertical: "middle", horizontal: c === 3 || c === 5 ? "left" : "center", wrapText: c === 3 };
      cell.border = box;
    }
    ws.getCell(r, 2).alignment = { vertical: "middle", horizontal: "center" };
    ws.getCell(r, 4).font = font({ bold: true, size: 9, color: { argb: "FFFFFFFF" } });
    ws.getCell(r, 1).font = font({ size: 6, color: { argb: "FFE5E7EB" } });
    r += 1;

    // 마일스톤(작업 단계) 띠: 겹치는 단계는 줄을 나눈다
    phaseLanes.forEach((lane, li) => {
      ws.getRow(r).height = 14;
      ws.getCell(r, 1).value = "M";
      ws.getCell(r, 1).font = font({ size: 6, color: { argb: "FFE5E7EB" } });
      if (li === 0) { ws.getCell(r, 3).value = "작업 단계"; ws.getCell(r, 3).font = font({ size: 9, color: { argb: C.muted } }); ws.getCell(r, 3).alignment = { horizontal: "right" }; }
      lane.forEach((it) => {
        const c1 = WEEK_COL0 + it.from;
        const c2 = WEEK_COL0 + it.to;
        if (c2 > c1) ws.mergeCells(r, c1, r, c2);
        const cell = ws.getCell(r, c1);
        cell.value = it.label;
        cell.fill = solid(MS_COLOR[it.color % MS_COLOR.length]);
        cell.font = font({ size: 9, bold: true, color: { argb: "FFFFFFFF" } });
        cell.alignment = { horizontal: "center", vertical: "middle", shrinkToFit: true };
        for (let c = c1; c <= c2; c += 1) ws.getCell(r, c).border = { top: thin, bottom: thin, left: c === c1 ? thin : undefined, right: c === c2 ? thin : undefined };
      });
      r += 1;
    });

    // 부서별 칸(슬롯) 줄
    const slotFirst = r;
    TRIP_DEPTS.forEach((d) => {
      const deptDemands = pDemands.filter((x) => x.dept === d.key);
      const lanes = layoutLanes(pAsg.filter((a) => a.dept === d.key));
      const slots = Math.max(peakNeed(deptDemands, d.key), lanes.length);
      const needBy = cols.map((col) => needForWeek(deptDemands, d.key, col));
      cols.forEach((col, i) => { planWeekly[d.key][i] += needBy[i]; });
      const addSlotRow = (k, lane, spare) => {
        const row = ws.getRow(r);
        row.outlineLevel = 1;
        setCollapsed(row, false);
        row.height = 16.5;
        ws.getCell(r, 1).value = "S";
        ws.getCell(r, 1).font = font({ size: 6, color: { argb: "FFE5E7EB" } });
        ws.getCell(r, 2).value = k + 1;
        ws.getCell(r, 3).value = d.label;
        ws.getCell(r, AJ).value = { formula: `LOOKUP(2,1/($A$${FIRST_DATA_ROW}:$A${r - 1}="H"),$${ajL}$${FIRST_DATA_ROW}:$${ajL}${r - 1})`, result: shortLabel };
        ws.getCell(r, AJ).font = font({ size: 9, color: { argb: C.muted } });
        for (let c = 2; c <= AJ; c += 1) { const cell = ws.getCell(r, c); cell.border = box; if (c <= 4) { cell.alignment = { horizontal: c === 3 ? "left" : "center", vertical: "middle" }; } }
        ws.getCell(r, 2).font = font({ size: 9, color: { argb: C.muted } });
        ws.getCell(r, 3).font = font({ bold: true, color: { argb: DEPT_COLOR[d.key] } });
        ws.getCell(r, 3).alignment = { indent: 1, vertical: "middle" };
        cols.forEach((col, i) => {
          const c = WEEK_COL0 + i;
          const cell = ws.getCell(r, c);
          cell.alignment = { horizontal: "center", vertical: "middle", shrinkToFit: true };
          cell.font = font({ size: 9.5 });
          if (spare) return;
          const hits = (lane || []).filter((a) => overlaps(a.start_date, a.end_date, col.start, col.end));
          if (hits.length) {
            const days = (a) => (a.end_date < col.end ? a.end_date : col.end) >= (a.start_date > col.start ? a.start_date : col.start)
              ? Math.round((Date.parse(`${a.end_date < col.end ? a.end_date : col.end}T00:00:00Z`) - Date.parse(`${a.start_date > col.start ? a.start_date : col.start}T00:00:00Z`)) / 86400000) + 1 : 0;
            const best = hits.slice().sort((x, y) => days(y) - days(x) || y.start_date.localeCompare(x.start_date))[0];
            const nm = nameOf(best);
            cell.value = nm;
            cell.fill = solid(C.wash);
            cell.font = font({ size: 9.5, bold: true, color: { argb: C.brand } });
            const sub = /외주/.test(nm);
            assignedByWeek[d.key][i].filled += 1;
            projCount[d.key][i] += 1;
            if (sub) assignedByWeek[d.key][i].sub += 1;
            if (!nameWeek.has(nm)) nameWeek.set(nm, new Map());
            nameWeek.get(nm).set(i, [...(nameWeek.get(nm).get(i) || []), shortLabel]);
            if (hits.length > 1) {
              cell.note = hits.slice().sort((x, y) => x.start_date.localeCompare(y.start_date)).map((a) => `${shortDate(a.start_date)}~${shortDate(a.end_date)} ${nameOf(a)}`).join("\n") + "\n(한 주 안에서 교대 — 가장 오래 근무하는 사람을 표시)";
            } else if (best.note && col.start <= best.start_date && best.start_date <= col.end) {
              cell.note = `${nameOf(best)} · ${rangeLabel(best.start_date, best.end_date)}\n${best.note}`;
            }
          } else if (needBy[i] >= k + 1) {
            cell.value = 1;
            cell.fill = solid(C.open);
            cell.font = font({ size: 9.5, bold: true, color: { argb: C.openInk } });
            assignedByWeek[d.key][i].open += 1;
            projCount[d.key][i] += 1;
          }
        });
        r += 1;
      };
      for (let k = 0; k < slots; k += 1) addSlotRow(k, lanes[k], false);
      if (slots > 0) addSlotRow(slots, null, true); // 여유 줄: 칸이 모자랄 때 여기에 이름을 적는다
    });
    // 어느 부서든 고를 수 있는 여유 줄 하나
    {
      const row = ws.getRow(r);
      row.outlineLevel = 1;
      setCollapsed(row, false);
      row.height = 16.5;
      ws.getCell(r, 1).value = "S";
      ws.getCell(r, 1).font = font({ size: 6, color: { argb: "FFE5E7EB" } });
      ws.getCell(r, 2).value = "+";
      ws.getCell(r, 3).value = "";
      ws.getCell(r, 3).dataValidation = { type: "list", allowBlank: true, formulae: ['"기구,비전,제어,전장,PM"'], showErrorMessage: true, errorStyle: "warning", errorTitle: "부서", error: "기구·비전·제어·전장·PM 중 하나를 고르세요." };
      ws.getCell(r, AJ).value = { formula: `LOOKUP(2,1/($A$${FIRST_DATA_ROW}:$A${r - 1}="H"),$${ajL}$${FIRST_DATA_ROW}:$${ajL}${r - 1})`, result: shortLabel };
      for (let c = 2; c <= AJ; c += 1) { const cell = ws.getCell(r, c); cell.border = box; cell.font = font({ size: 9, color: { argb: C.muted } }); cell.alignment = { horizontal: c === 3 ? "left" : "center", vertical: "middle", shrinkToFit: c > 4 }; }
      ws.getCell(r, 3).font = font({ bold: true });
      r += 1;
    }
    const slotLast = r - 1;

    // 이름 칸 선택 목록 (명단에 없는 이름은 경고만 하고 입력 가능: 외주·신규)
    ws.dataValidations.add(`E${slotFirst}:${lastColL}${slotLast}`, {
      type: "list", allowBlank: true,
      formulae: ["OFFSET('인원 명단'!$C$6,0,0,MAX(1,COUNTA('인원 명단'!$C$6:$C$900)),1)"],
      showErrorMessage: true, errorStyle: "warning", errorTitle: "명단에 없는 이름", error: "인원 명단에 없는 이름입니다. 외주·신규 인원이면 ‘예’를 눌러 그대로 입력하세요.",
    });
    // 미국 사이트: 명단에서 B1 보유로 확인되지 않은 이름은 주황
    if (plan.overseas) {
      ws.addConditionalFormatting({
        ref: `E${slotFirst}:${lastColL}${slotLast}`,
        rules: [{ type: "expression", formulae: [`AND(ISTEXT(E${slotFirst}),ISERROR(SEARCH("외주",E${slotFirst})),COUNTIFS('인원 명단'!$C$6:$C$900,E${slotFirst},'인원 명단'!$F$6:$F$900,"O")=0)`], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFD8A8" } }, font: { color: { argb: "FF9A3412" }, bold: true } } }],
      });
    }

    // 부서별 TOTAL (표시 열 A = "T"): 그 프로젝트 칸에서 비어 있지 않은 칸 수 (이름 + 분홍 "1")
    const spacerBefore = r;
    ws.getRow(r).outlineLevel = 1; setCollapsed(ws.getRow(r), false); ws.getRow(r).height = 6;
    r += 1;
    const totalRows = [];
    TRIP_DEPTS.forEach((d) => {
      const row = ws.getRow(r);
      row.outlineLevel = 1; setCollapsed(row, false); row.height = 16.5;
      ws.getCell(r, 1).value = "T";
      ws.getCell(r, 1).font = font({ size: 6, color: { argb: "FFE5E7EB" } });
      ws.mergeCells(r, 2, r, 3);
      ws.getCell(r, 2).value = "TOTAL";
      ws.getCell(r, 4).value = d.label;
      for (let c = 2; c <= AJ; c += 1) { const cell = ws.getCell(r, c); cell.fill = solid("FFF1F5F9"); cell.border = box; cell.font = font({ bold: true, size: 9.5 }); cell.alignment = { horizontal: "center", vertical: "middle" }; }
      ws.getCell(r, 2).font = font({ bold: true, size: 9, color: { argb: C.muted } });
      ws.getCell(r, 4).font = font({ bold: true, color: { argb: DEPT_COLOR[d.key] } });
      cols.forEach((col, i) => {
        const c = WEEK_COL0 + i;
        const L = colLetter(c);
        const total = projCount[d.key][i];
        grandCount[d.key][i] += total;
        ws.getCell(r, c).value = { formula: `COUNTIFS($C$${slotFirst}:$C$${slotLast},"${d.label}*",${L}$${slotFirst}:${L}$${slotLast},"<>")`, result: total };
      });
      totalRows.push(r);
      r += 1;
    });

    // 부서별 특이사항 (직접 쓰는 칸)
    ws.getRow(r).outlineLevel = 1; setCollapsed(ws.getRow(r), false); ws.getRow(r).height = 6;
    r += 1;
    ws.getCell(r, 2).value = "※부서별 특이사항";
    ws.getCell(r, 2).font = font({ bold: true, size: 9.5, color: { argb: C.muted } });
    ws.getRow(r).outlineLevel = 1; setCollapsed(ws.getRow(r), false);
    r += 1;
    TRIP_DEPTS.forEach((d) => {
      const row = ws.getRow(r);
      row.outlineLevel = 1; setCollapsed(row, false); row.height = 16.5;
      ws.getCell(r, 2).value = d.label;
      ws.getCell(r, 2).font = font({ bold: true, size: 9.5, color: { argb: DEPT_COLOR[d.key] } });
      ws.getCell(r, 2).alignment = { horizontal: "center" };
      ws.mergeCells(r, 3, r, LAST_COL);
      ws.getCell(r, 3).value = (input.notes || []).find((n) => n.project_id === plan.id && n.dept === d.key)?.note || "";
      ws.getCell(r, 3).font = font({ size: 9.5 });
      ws.getCell(r, 3).alignment = { vertical: "middle", wrapText: false };
      for (let c = 2; c <= LAST_COL; c += 1) ws.getCell(r, c).border = box;
      r += 1;
    });
    const groupLast = r - 1;
    // 블록 사이 빈 줄 = 위 그룹의 "요약 줄": 이 줄의 +/− 버튼으로 프로젝트 하나를 접고 편다
    const spacer = ws.getRow(r);
    spacer.height = 10;
    setCollapsed(spacer, Boolean(options.collapsed));
    if (options.collapsed) for (let rr = slotFirst - 0; rr <= groupLast; rr += 1) ws.getRow(rr).hidden = true;
    r += 1;
    blocks.push({ plan, headerRow, slotFirst, slotLast, totalRows, firstRow: blockFirst, lastRow: groupLast, shortLabel, spacerBefore });
  });

  // ── 맨 아래: 프로젝트별 취합 공수 (TOTAL 줄을 부서 이름으로 모아 더한다 → 프로젝트를 더해도 자동 반영) ──
  const sumTitle = r;
  const rangeEnd = sumTitle - 1;
  const grand = {};
  TRIP_DEPTS.forEach((d) => {
    const row = ws.getRow(r);
    row.height = 18;
    ws.mergeCells(r, 2, r, 3);
    ws.getCell(r, 2).value = "PJT 별 취합 공수";
    ws.getCell(r, 4).value = d.label;
    for (let c = 2; c <= AJ; c += 1) { const cell = ws.getCell(r, c); cell.border = box; cell.font = font({ bold: true }); cell.alignment = { horizontal: "center", vertical: "middle" }; cell.fill = solid("FFEEF2F7"); }
    ws.getCell(r, 4).font = font({ bold: true, color: { argb: DEPT_COLOR[d.key] } });
    cols.forEach((col, i) => {
      const c = WEEK_COL0 + i;
      const L = colLetter(c);
      const v = grandCount[d.key][i];
      ws.getCell(r, c).value = { formula: `SUMIFS(${L}$${FIRST_DATA_ROW}:${L}$${rangeEnd},$A$${FIRST_DATA_ROW}:$A$${rangeEnd},"T",$D$${FIRST_DATA_ROW}:$D$${rangeEnd},$D${r})`, result: v };
      grand[d.key] = grand[d.key] || [];
    });
    r += 1;
  });
  const sumFirst = sumTitle;
  const sumLast = r - 1;
  ws.addConditionalFormatting({ ref: `E${sumFirst}:${lastColL}${sumLast}`, rules: [{ type: "colorScale", cfvo: [{ type: "min" }, { type: "max" }], color: [{ argb: "FFFFFFFF" }, { argb: "FF7FC8A0" }] }] });

  // 같은 주에 두 곳에 배정된 이름(외주 제외)은 빨강 — 전체 데이터 범위에서 센다
  if (blocks.length) {
    ws.addConditionalFormatting({
      ref: `E${FIRST_DATA_ROW}:${lastColL}${rangeEnd}`,
      rules: [{ type: "expression", formulae: [`AND($A${FIRST_DATA_ROW}="S",ISTEXT(E${FIRST_DATA_ROW}),ISERROR(SEARCH("외주",E${FIRST_DATA_ROW})),COUNTIFS($A$${FIRST_DATA_ROW}:$A$${rangeEnd},"S",E$${FIRST_DATA_ROW}:E$${rangeEnd},E${FIRST_DATA_ROW})>1)`], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFEF4444" } }, font: { color: { argb: "FFFFFFFF" }, bold: true } } }],
    });
  }
  ws.autoFilter = undefined;

  // ── 종합 현황 ──
  const sm = wb.addWorksheet("종합 현황", { views: [{ state: "frozen", xSplit: 4, ySplit: 7, zoomScale: 85, showGridLines: false }], properties: { tabColor: { argb: "FF15803D" } }, pageSetup: { orientation: "landscape", paperSize: 8, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  sm.columns = [{ width: 2.2 }, { width: 10 }, { width: 38 }, { width: 10 }, ...Array.from({ length: weeks }, () => ({ width: 7.6 }))];
  sm.mergeCells(1, 2, 1, LAST_COL);
  sm.getCell(1, 2).value = "부서별 종합 현황 — 계획 공수 대비 출장자 배정";
  sm.getCell(1, 2).font = font({ size: 18, bold: true });
  sm.getRow(1).height = 30;
  sm.mergeCells(2, 2, 2, LAST_COL);
  sm.getCell(2, 2).value = "계획 공수 = 내려받은 시점의 마스터 플랜 값(고정), 나머지는 ‘PJT 출장자’·‘인원별 현황’ 시트에서 자동 계산됩니다. 과부족 = 배정 − 계획 (빨강 = 모자람, 주황 = 계획보다 많음)";
  sm.getCell(2, 2).font = font({ size: 9, color: { argb: C.muted } });
  [["YEAR", 5], ["MONTH", 6], ["DAY", 7]].forEach(([label, rr]) => {
    sm.getRow(rr).height = 20;
    sm.getCell(rr, 2).value = label;
    sm.mergeCells(rr, 2, rr, 4);
    for (let c = 2; c <= LAST_COL; c += 1) { const cell = sm.getCell(rr, c); cell.fill = solid(C.head); cell.font = font({ bold: true, color: { argb: "FFFFFFFF" }, size: 9.5 }); cell.alignment = { horizontal: "center", vertical: "middle" }; cell.border = box; }
  });
  cols.forEach((col, i) => {
    const c = WEEK_COL0 + i;
    const L = colLetter(c);
    sm.getCell(5, c).value = { formula: `'${MAIN}'!${L}5`, result: ws.getCell(5, c).value.result };
    sm.getCell(6, c).value = { formula: `'${MAIN}'!${L}6`, result: ws.getCell(6, c).value.result };
    sm.getCell(7, c).value = { formula: `'${MAIN}'!${L}7`, result: serial(col.start) };
    sm.getCell(7, c).numFmt = "m/d";
  });
  const M = `'${MAIN}'`;
  const matrixRows = Math.max(members.length + 40, 60);
  const ROS = 6; // 인원 명단 첫 데이터 줄
  const MX0 = 8; // 인원별 현황 첫 데이터 줄
  const MXL = MX0 + matrixRows - 1;
  const mainLast = rangeEnd + EXTRA_ROWS;
  // 인원별 현황 계산 결과(본사/프로젝트/외부)를 미리 구한다
  const weekLabel = (m, i) => {
    const col = cols[i];
    const hit = nameWeek.get(m.name)?.get(i);
    if (hit) return { label: hit[hit.length - 1], count: hit.length };
    const ab = (input.absences || []).filter((a) => a.member_id === m.id && overlaps(a.start_date, a.end_date, col.start, col.end));
    const x = ab[ab.length - 1];
    if (x) return { label: isOutTrip(x.kind) ? `외부:${x.location || ABSENCE_KIND_LABEL[normalizeKind(x.kind)] || ABSENCE_KIND_LABEL[x.kind]}` : `부재:${ABSENCE_KIND_LABEL[x.kind] || x.kind}${x.location ? ` ${x.location}` : ""}`, count: 1 };
    return { label: "본사", count: 0 };
  };

  let sr = 8;
  const blockRows = {};
  TRIP_DEPTS.forEach((d) => {
    const labels = [
      ["계획 공수", "마스터 플랜 기준 (고정값)"],
      ["배정 인원", "이름이 적힌 칸 (외주 포함)"],
      ["외주", "이름에 ‘외주’가 들어간 칸"],
      ["과부족", "배정 − 계획"],
      ["미배정 칸", "분홍 ‘1’이 남은 칸"],
      ["본사 가용", "인원별 현황에서 ‘본사’인 인원"],
      ["외부 일정", "미등록 프로젝트 대응 등으로 외부"],
    ];
    const rowOf = {};
    labels.forEach(([label, hint], li) => {
      sm.getRow(sr).height = 17;
      sm.mergeCells(sr, 2, sr, 3);
      sm.getCell(sr, 2).value = `${d.label} · ${label}`;
      sm.getCell(sr, 4).value = d.label;
      sm.getCell(sr, 1).value = label;
      sm.getCell(sr, 1).font = font({ size: 6, color: { argb: "FFE5E7EB" } });
      for (let c = 2; c <= LAST_COL; c += 1) { const cell = sm.getCell(sr, c); cell.border = box; cell.font = font({ size: 9.5, bold: li === 3 }); cell.alignment = { horizontal: c <= 3 ? "left" : "center", vertical: "middle", indent: c === 2 ? 1 : 0 }; if (li === 0) cell.fill = solid(C.zebra); }
      sm.getCell(sr, 2).font = font({ bold: li === 0 || li === 3, size: 9.5, color: { argb: li === 0 ? DEPT_COLOR[d.key] : C.ink } });
      sm.getCell(sr, 2).note = hint;
      rowOf[label] = sr;
      sr += 1;
    });
    sm.getRow(sr).height = 6;
    sr += 1;
    blockRows[d.key] = rowOf;
    cols.forEach((col, i) => {
      const c = WEEK_COL0 + i;
      const L = colLetter(c);
      const a = assignedByWeek[d.key][i];
      const plan = planWeekly[d.key][i];
      const crit = `${M}!$A:$A,"S",${M}!$C:$C,$D${rowOf["계획 공수"]}&"*"`;
      const members_ = members.filter((m) => m.dept === d.key && m.active !== false);
      let home = 0;
      let away = 0;
      members_.forEach((m) => { const w = weekLabel(m, i); if (w.label === "본사") home += 1; else if (w.label.startsWith("외부:")) away += 1; });
      sm.getCell(rowOf["계획 공수"], c).value = plan;
      sm.getCell(rowOf["배정 인원"], c).value = { formula: `COUNTIFS(${crit},${M}!${L}:${L},"<>")-COUNTIFS(${crit},${M}!${L}:${L},1)`, result: a.filled };
      sm.getCell(rowOf["외주"], c).value = { formula: `COUNTIFS(${crit},${M}!${L}:${L},"*외주*")`, result: a.sub };
      sm.getCell(rowOf["과부족"], c).value = { formula: `${L}${rowOf["배정 인원"]}-${L}${rowOf["계획 공수"]}`, result: a.filled - plan };
      sm.getCell(rowOf["미배정 칸"], c).value = { formula: `COUNTIFS(${crit},${M}!${L}:${L},1)`, result: a.open };
      sm.getCell(rowOf["본사 가용"], c).value = { formula: `COUNTIFS('인원별 현황'!$B$${MX0}:$B$${MXL},$D${rowOf["계획 공수"]},'인원별 현황'!${L}$${MX0}:${L}$${MXL},"본사")`, result: home };
      sm.getCell(rowOf["외부 일정"], c).value = { formula: `COUNTIFS('인원별 현황'!$B$${MX0}:$B$${MXL},$D${rowOf["계획 공수"]},'인원별 현황'!${L}$${MX0}:${L}$${MXL},"외부:*")`, result: away };
    });
    sm.addConditionalFormatting({ ref: `E${rowOf["과부족"]}:${lastColL}${rowOf["과부족"]}`, rules: [
      { type: "cellIs", operator: "lessThan", formulae: [0], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFDE2E2" } }, font: { color: { argb: "FFB91C1C" }, bold: true } } },
      { type: "cellIs", operator: "greaterThan", formulae: [0], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFF1D6" } }, font: { color: { argb: "FF9A3412" }, bold: true } } },
    ] });
    sm.addConditionalFormatting({ ref: `E${rowOf["미배정 칸"]}:${lastColL}${rowOf["미배정 칸"]}`, rules: [{ type: "cellIs", operator: "greaterThan", formulae: [0], style: { font: { color: { argb: "FFB91C1C" }, bold: true } } }] });
  });
  // 합계(부서 전체)
  sm.mergeCells(sr, 2, sr, 4);
  sm.getCell(sr, 2).value = "전 부서 합계";
  const totalRowsDef = [["계획 공수", "계획 공수"], ["배정 인원", "배정 인원"], ["과부족", "과부족"], ["미배정 칸", "미배정 칸"]];
  totalRowsDef.forEach(([label, key], ti) => {
    const rowN = sr + ti;
    if (ti > 0) { sm.mergeCells(rowN, 2, rowN, 4); }
    sm.getCell(rowN, 2).value = `전 부서 · ${label}`;
    for (let c = 2; c <= LAST_COL; c += 1) { const cell = sm.getCell(rowN, c); cell.fill = solid("FFEEF2F7"); cell.border = box; cell.font = font({ bold: true }); cell.alignment = { horizontal: c <= 4 ? "left" : "center", vertical: "middle", indent: c === 2 ? 1 : 0 }; }
    sm.getRow(rowN).height = 18;
    cols.forEach((col, i) => {
      const c = WEEK_COL0 + i;
      const L = colLetter(c);
      const parts = TRIP_DEPTS.map((d) => `${L}${blockRows[d.key][key]}`).join("+");
      const calc = TRIP_DEPTS.reduce((s, d) => {
        const a = assignedByWeek[d.key][i];
        const plan = planWeekly[d.key][i];
        return s + (key === "계획 공수" ? plan : key === "배정 인원" ? a.filled : key === "과부족" ? a.filled - plan : a.open);
      }, 0);
      sm.getCell(rowN, c).value = { formula: parts, result: calc };
    });
  });
  sm.addConditionalFormatting({ ref: `E${sr + 2}:${lastColL}${sr + 2}`, rules: [
    { type: "cellIs", operator: "lessThan", formulae: [0], style: { font: { color: { argb: "FFB91C1C" }, bold: true } } },
  ] });

  // ── 인원별 현황 (사람 × 주) ──
  const mx = wb.addWorksheet("인원별 현황", { views: [{ state: "frozen", xSplit: 4, ySplit: 7, zoomScale: 85, showGridLines: false }], properties: { tabColor: { argb: "FF7048C2" } }, pageSetup: { orientation: "landscape", paperSize: 8, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  mx.columns = [{ width: 2.2 }, { width: 9 }, { width: 14 }, { width: 18 }, ...Array.from({ length: weeks }, () => ({ width: 11 }))];
  mx.mergeCells(1, 2, 1, 4 + Math.min(weeks, 12));
  mx.getCell(1, 2).value = "인원별 현황 — 누가 어느 주에 어디에 있는지";
  mx.getCell(1, 2).font = font({ size: 18, bold: true });
  mx.getRow(1).height = 30;
  mx.mergeCells(2, 2, 2, 4 + Math.min(weeks, 12));
  mx.getCell(2, 2).value = "‘PJT 출장자’ 시트에 적힌 이름과 ‘외부 일정’ 시트를 읽어 자동으로 채웁니다. 본사 = 대기 중, 빨강 = 같은 주에 두 곳 이상 배정, 청록 = 미등록 프로젝트 대응 등 외부 일정";
  mx.getCell(2, 2).font = font({ size: 9, color: { argb: C.muted } });
  [["YEAR", 5], ["MONTH", 6], ["DAY", 7]].forEach(([label, rr]) => {
    mx.getRow(rr).height = 20;
    mx.getCell(rr, 2).value = label;
    mx.mergeCells(rr, 2, rr, 4);
    for (let c = 2; c <= LAST_COL; c += 1) { const cell = mx.getCell(rr, c); cell.fill = solid(C.head); cell.font = font({ bold: true, color: { argb: "FFFFFFFF" }, size: 9.5 }); cell.alignment = { horizontal: "center", vertical: "middle" }; cell.border = box; }
  });
  cols.forEach((col, i) => {
    const c = WEEK_COL0 + i;
    const L = colLetter(c);
    mx.getCell(5, c).value = { formula: `'${MAIN}'!${L}5`, result: ws.getCell(5, c).value.result };
    mx.getCell(6, c).value = { formula: `'${MAIN}'!${L}6`, result: ws.getCell(6, c).value.result };
    mx.getCell(7, c).value = { formula: `'${MAIN}'!${L}7`, result: serial(col.start) };
    mx.getCell(7, c).numFmt = "m/d";
  });
  mx.getCell(7, 2).value = "부서";
  mx.getCell(7, 3).value = "이름";
  mx.getCell(7, 4).value = "소속 팀";
  mx.unprotect?.();
  for (let k = 0; k < matrixRows; k += 1) {
    const rr = MX0 + k;
    const ro = ROS + k;
    const m = members[k];
    mx.getRow(rr).height = 17;
    const deptLabel = m ? TRIP_DEPT_LABEL[m.dept] : "";
    mx.getCell(rr, 2).value = { formula: `IF('인원 명단'!$C${ro}="","",'인원 명단'!$A${ro})`, result: deptLabel };
    mx.getCell(rr, 3).value = { formula: `IF('인원 명단'!$C${ro}="","",'인원 명단'!$C${ro})`, result: m ? m.name : "" };
    mx.getCell(rr, 4).value = { formula: `IF('인원 명단'!$C${ro}="","",'인원 명단'!$B${ro}&"")`, result: m ? m.team || "" : "" };
    for (let c = 2; c <= LAST_COL; c += 1) { const cell = mx.getCell(rr, c); cell.border = box; cell.font = font({ size: c <= 4 ? 10 : 9 }); cell.alignment = { horizontal: c <= 4 ? "left" : "center", vertical: "middle", shrinkToFit: c > 4, indent: c <= 4 ? 1 : 0 }; }
    mx.getCell(rr, 3).font = font({ bold: true });
    if (m) mx.getCell(rr, 2).font = font({ bold: true, color: { argb: DEPT_COLOR[m.dept] } });
    cols.forEach((col, i) => {
      const c = WEEK_COL0 + i;
      const L = colLetter(c);
      const proj = `LOOKUP(2,1/(${M}!${L}$${FIRST_DATA_ROW}:${L}$${mainLast}=$C${rr}),${M}!$${ajL}$${FIRST_DATA_ROW}:$${ajL}$${mainLast})`;
      const ext = `LOOKUP(2,1/(('외부 일정'!$B$6:$B$400=$C${rr})*('외부 일정'!$E$6:$E$400<=${L}$7+6)*((('외부 일정'!$F$6:$F$400="")+('외부 일정'!$F$6:$F$400>=${L}$7))>0)),'외부 일정'!$H$6:$H$400)`;
      const inactive = `'인원 명단'!$G${ro}="퇴사"`;
      const w = m ? (m.active === false ? { label: "퇴사" } : weekLabel(m, i)) : { label: "" };
      mx.getCell(rr, c).value = { formula: `IF($C${rr}="","",IF(${inactive},"퇴사",IFERROR(${proj},IFERROR(${ext},"본사"))))`, result: w.label };
    });
  }
  const mxRef = `E${MX0}:${lastColL}${MXL}`;
  mx.addConditionalFormatting({ ref: mxRef, rules: [
    { type: "expression", priority: 1, formulae: [`AND($C${MX0}<>"",COUNTIF(${M}!E$${FIRST_DATA_ROW}:E$${mainLast},$C${MX0})>1)`], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFEF4444" } }, font: { color: { argb: "FFFFFFFF" }, bold: true } } },
    { type: "expression", priority: 2, formulae: [`LEFT(E${MX0},3)="외부:"`], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFDDF3F1" } }, font: { color: { argb: "FF0F766E" }, bold: true } } },
    { type: "expression", priority: 3, formulae: [`LEFT(E${MX0},3)="부재:"`], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFE5E7EB" } }, font: { color: { argb: "FF6B7280" } } } },
    { type: "expression", priority: 4, formulae: [`E${MX0}="본사"`], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFE7F5EC" } }, font: { color: { argb: "FF15803D" } } } },
    { type: "expression", priority: 5, formulae: [`E${MX0}="퇴사"`], style: { font: { color: { argb: "FF9CA3AF" } } } },
    { type: "expression", priority: 6, formulae: [`AND(E${MX0}<>"",E${MX0}<>"본사")`], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFEAF1FB" } }, font: { color: { argb: "FF0B57A4" }, bold: true } } },
  ] });
  mx.autoFilter = { from: { row: 7, column: 2 }, to: { row: 7, column: 4 } };

  // ── 프로젝트 목차 ──
  const ix = wb.addWorksheet("프로젝트 목차", { views: [{ state: "frozen", ySplit: 4, showGridLines: false }], properties: { tabColor: { argb: "FFC2570C" } } });
  ix.columns = [{ width: 2.2 }, { width: 6 }, { width: 14 }, { width: 52 }, { width: 14 }, { width: 18 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 14 }];
  ix.mergeCells(1, 2, 1, 10);
  ix.getCell(1, 2).value = "프로젝트 목차 — 눌러서 해당 프로젝트로 이동";
  ix.getCell(1, 2).font = font({ size: 18, bold: true });
  ix.getRow(1).height = 30;
  ["No.", "Site", "프로젝트", "상태", "기간", "이름 입력 칸", "미배정(분홍 1)", "계획 최대", "미국 SITE"].forEach((h, i) => {
    const cell = ix.getCell(4, 2 + i);
    cell.value = h;
    cell.fill = solid(C.head);
    cell.font = font({ bold: true, color: { argb: "FFFFFFFF" }, size: 10 });
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = box;
  });
  ix.getRow(4).height = 22;
  blocks.forEach((b, i) => {
    const rr = 5 + i;
    const range = `${M}!$E$${b.slotFirst}:$${lastColL}$${b.slotLast}`;
    const own = { filled: 0, open: 0 };
    // 이 프로젝트의 이름·분홍 칸 수는 시트에서 바로 센다 (수식)
    ix.getRow(rr).height = 18;
    ix.getCell(rr, 2).value = i + 1;
    ix.getCell(rr, 3).value = b.plan.site || "";
    ix.getCell(rr, 4).value = { text: b.plan.name, hyperlink: `#'${MAIN}'!B${b.headerRow}` };
    ix.getCell(rr, 5).value = b.plan.status || "";
    ix.getCell(rr, 6).value = rangeLabel(b.plan.start_date, b.plan.end_date);
    ix.getCell(rr, 7).value = { formula: `COUNTA(${range})-COUNTIF(${range},1)`, result: 0 };
    ix.getCell(rr, 8).value = { formula: `COUNTIF(${range},1)`, result: 0 };
    ix.getCell(rr, 9).value = TRIP_DEPTS.reduce((s, d) => s + peakNeed((input.demands || []).filter((x) => x.project_id === b.plan.id && x.dept === d.key), d.key), 0);
    ix.getCell(rr, 10).value = b.plan.overseas ? "B1 확인" : "";
    for (let c = 2; c <= 10; c += 1) { const cell = ix.getCell(rr, c); cell.border = box; cell.font = font({ size: 10 }); cell.alignment = { horizontal: c === 4 ? "left" : "center", vertical: "middle", indent: c === 4 ? 1 : 0 }; }
    ix.getCell(rr, 4).font = font({ size: 10, color: { argb: C.brand }, underline: true, bold: true });
    ix.getCell(rr, 8).font = font({ size: 10, bold: true });
    void own;
  });
  ix.addConditionalFormatting({ ref: `H5:H${4 + blocks.length}`, rules: [{ type: "cellIs", operator: "greaterThan", formulae: [0], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFDE2E2" } }, font: { color: { argb: "FFB91C1C" }, bold: true } } }] });
  ix.autoFilter = { from: { row: 4, column: 2 }, to: { row: 4 + Math.max(1, blocks.length), column: 10 } };

  // ── 인원 명단 ──
  const ro = wb.addWorksheet("인원 명단", { views: [{ state: "frozen", ySplit: 5, showGridLines: false }], properties: { tabColor: { argb: "FF0F8A80" } } });
  ro.columns = [{ width: 10 }, { width: 18 }, { width: 14 }, { width: 10 }, { width: 10 }, { width: 8 }, { width: 10 }, { width: 28 }];
  ro.mergeCells(1, 1, 1, 8);
  ro.getCell(1, 1).value = "인원 명단 — 이름 선택 목록과 B1 확인에 쓰입니다";
  ro.getCell(1, 1).font = font({ size: 18, bold: true });
  ro.getRow(1).height = 30;
  ro.mergeCells(3, 1, 3, 8);
  ro.getCell(3, 1).value = "※ 새 인원은 맨 아래 빈 줄에 이어서 적으면 목록·인원별 현황에 바로 들어갑니다. 중간에 빈 줄을 두지 마세요. B1은 보유하면 O.";
  ro.getCell(3, 1).font = font({ size: 9, color: { argb: C.muted } });
  ["부서", "소속 팀", "이름", "직위", "등급", "B1", "상태", "비고"].forEach((h, i) => {
    const cell = ro.getCell(5, 1 + i);
    cell.value = h;
    cell.fill = solid(i === 0 || i === 2 ? C.brand : C.head);
    cell.font = font({ bold: true, color: { argb: "FFFFFFFF" } });
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = box;
  });
  ro.getRow(5).height = 24;
  members.forEach((m, k) => {
    const rr = ROS + k;
    const vals = [TRIP_DEPT_LABEL[m.dept], m.team || "", m.name, m.rank || "", m.grade || "", m.b1_visa ? "O" : "", m.active === false ? "퇴사" : "재직", m.note || ""];
    vals.forEach((v, i) => {
      const cell = ro.getCell(rr, 1 + i);
      cell.value = v;
      cell.border = box;
      cell.font = font({ size: 10, color: { argb: m.active === false ? "FF9CA3AF" : C.ink }, bold: i === 2 });
      cell.alignment = { horizontal: i === 7 || i === 1 ? "left" : "center", vertical: "middle" };
    });
    ro.getCell(rr, 1).font = font({ bold: true, color: { argb: DEPT_COLOR[m.dept] } });
  });
  const rosterEnd = ROS + Math.max(members.length, 1) + 60;
  ro.dataValidations.add(`A${ROS}:A${rosterEnd}`, { type: "list", allowBlank: true, formulae: ['"기구,비전,제어,전장,PM"'], showErrorMessage: true, errorStyle: "warning", errorTitle: "부서", error: "기구·비전·제어·전장·PM 중 하나를 고르세요." });
  ro.dataValidations.add(`F${ROS}:F${rosterEnd}`, { type: "list", allowBlank: true, formulae: ['"O"'], showErrorMessage: true, errorStyle: "warning", errorTitle: "B1", error: "보유하면 O, 없으면 비워 두세요." });
  ro.dataValidations.add(`G${ROS}:G${rosterEnd}`, { type: "list", allowBlank: true, formulae: ['"재직,퇴사"'], showErrorMessage: true, errorStyle: "warning", errorTitle: "상태", error: "재직 또는 퇴사" });
  ro.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5 + Math.max(1, members.length), column: 8 } };

  // ── 외부 일정 (미등록 프로젝트 대응 등) ──
  const ev = wb.addWorksheet("외부 일정", { views: [{ state: "frozen", ySplit: 5, showGridLines: false }], properties: { tabColor: { argb: "FF0F766E" } } });
  ev.columns = [{ width: 10 }, { width: 14 }, { width: 14 }, { width: 26 }, { width: 12 }, { width: 12 }, { width: 22 }, { width: 34 }];
  ev.mergeCells(1, 1, 1, 8);
  ev.getCell(1, 1).value = "외부 일정 — 미등록 프로젝트 대응(고객사 대응·테스트 등)·교육·휴직";
  ev.getCell(1, 1).font = font({ size: 18, bold: true });
  ev.getRow(1).height = 30;
  ev.mergeCells(3, 1, 3, 8);
  ev.getCell(3, 1).value = "※ 프로젝트에 배정되지 않았지만 본사에 있지 않은 기간을 적으면 ‘인원별 현황’에 간 곳이 표시됩니다. 종료일을 비우면 ‘계속’입니다. H열은 자동입니다.";
  ev.getCell(3, 1).font = font({ size: 9, color: { argb: C.muted } });
  ["부서", "이름", "종류", "간 곳(장소·내용)", "시작일", "종료일", "메모", "표시(자동)"].forEach((h, i) => {
    const cell = ev.getCell(5, 1 + i);
    cell.value = h;
    cell.fill = solid(i === 1 || i === 4 ? C.brand : C.head);
    cell.font = font({ bold: true, color: { argb: "FFFFFFFF" } });
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = box;
  });
  ev.getRow(5).height = 24;
  const absRows = (input.absences || []).slice().sort((a, b) => a.start_date.localeCompare(b.start_date));
  const EVN = Math.max(absRows.length + 40, 60);
  for (let k = 0; k < EVN; k += 1) {
    const rr = 6 + k;
    const a = absRows[k];
    const m = a ? members.find((x) => x.id === a.member_id) : null;
    const kind = a ? ABSENCE_KIND_LABEL[normalizeKind(a.kind)] || ABSENCE_KIND_LABEL[a.kind] || "기타" : "";
    ev.getCell(rr, 1).value = m ? TRIP_DEPT_LABEL[m.dept] : "";
    ev.getCell(rr, 2).value = m ? m.name : "";
    ev.getCell(rr, 3).value = kind;
    ev.getCell(rr, 4).value = a ? a.location || "" : "";
    if (a) { ev.getCell(rr, 5).value = asDate(a.start_date); if (a.end_date) ev.getCell(rr, 6).value = asDate(a.end_date); }
    ev.getCell(rr, 7).value = a ? a.note || "" : "";
    const label = a ? (isOutTrip(a.kind) ? `외부:${a.location || kind}` : `부재:${kind}${a.location ? ` ${a.location}` : ""}`) : "";
    ev.getCell(rr, 8).value = { formula: `IF(B${rr}="","",IF(OR(C${rr}="교육",C${rr}="휴직·휴가",C${rr}="기타"),"부재:"&C${rr}&IF(D${rr}="",""," "&D${rr}),"외부:"&IF(D${rr}="",C${rr},D${rr})))`, result: label.replace(/(부재:[^ ]+) $/, "$1") };
    for (let c = 1; c <= 8; c += 1) { const cell = ev.getCell(rr, c); cell.border = box; cell.font = font({ size: 10, color: { argb: c === 8 ? C.muted : C.ink } }); cell.alignment = { horizontal: c === 4 || c === 7 || c === 8 ? "left" : "center", vertical: "middle" }; }
    ev.getCell(rr, 5).numFmt = "yyyy-mm-dd";
    ev.getCell(rr, 6).numFmt = "yyyy-mm-dd";
  }
  ev.dataValidations.add(`C6:C${5 + EVN}`, { type: "list", allowBlank: true, formulae: ['"고객사 대응,테스트,기타 출장,교육,휴직·휴가,기타"'], showErrorMessage: true, errorStyle: "warning", errorTitle: "종류", error: "목록에서 고르세요." });
  ev.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5 + Math.max(1, absRows.length), column: 8 } };

  // ── 작성 안내 ──
  const gd = wb.addWorksheet("작성 안내", { views: [{ showGridLines: false }], properties: { tabColor: { argb: "FF6B7280" } } });
  gd.columns = [{ width: 3 }, { width: 24 }, { width: 100 }];
  gd.getCell(2, 2).value = "출장자 종합 파일 사용법";
  gd.getCell(2, 2).font = font({ size: 18, bold: true });
  const lines = [
    ["파일의 성격", "TW Project Manager의 출장자 배정을 내려받은 시점 그대로 담은 종합 장표입니다. 이 파일에서 고친 내용은 프로그램으로 다시 올라가지 않으니, 정식 변경은 프로그램에서 하고 이 파일은 취합·보고·검토용으로 쓰세요."],
    ["PJT 출장자", "프로젝트마다 부서별 칸(줄)이 있고 주 단위(월요일 시작)로 이름이 들어 있습니다. 분홍 ‘1’은 필요하지만 아직 정해지지 않은 자리입니다 — 이름으로 바꾸면 합계가 자동으로 바뀝니다."],
    ["칸이 모자랄 때", "프로젝트 블록 아래쪽의 흐린 여유 줄(부서 이름이 적힌 줄 또는 부서를 고르는 마지막 줄)에 이름을 적으세요. 줄을 더 넣을 때는 블록 안쪽에 행을 삽입해야 TOTAL에 포함됩니다."],
    ["프로젝트 추가", "프로젝트 블록(머리글 줄부터 특이사항 줄까지)을 통째로 복사해서 맨 아래 ‘PJT 별 취합 공수’ 줄 위에 붙여넣으세요. A열의 H·M·S·T 표시를 지우지 않으면 취합 공수, 종합 현황, 인원별 현황에 자동으로 들어갑니다."],
    ["접기 / 펼치기", "왼쪽 위의 숫자 1·2 버튼은 전체, 각 프로젝트 아래 줄의 +/− 버튼은 그 프로젝트만 접고 폅니다. 접어 두면 프로젝트 이름과 취합 공수만 한눈에 볼 수 있습니다."],
    ["색 표시", "파랑 = 배정된 출장자 · 분홍 1 = 미정 · 주황 = 미국 사이트(HSBMA·SKBA·SKOT)인데 인원 명단에서 B1 보유가 확인되지 않은 이름 · 빨강 = 같은 주에 두 곳에 배정(외주 이름은 제외) · 맨 위 파란 주 = 이번 주."],
    ["종합 현황", "부서별로 계획 공수(내려받은 시점 고정값) 대비 배정, 외주, 과부족, 미배정 칸, 본사 가용, 외부 일정을 주별로 보여 줍니다. 모두 수식입니다."],
    ["인원별 현황", "인원 명단의 모든 사람이 주마다 어디에 있는지(프로젝트 / 본사 / 외부:간 곳 / 부재) 자동으로 나옵니다. 같은 주에 두 곳이면 빨강으로 표시됩니다."],
    ["인원 명단 · 외부 일정", "새 인원이나 외부 일정은 두 시트의 맨 아래 빈 줄에 이어서 적으면 됩니다. 이름 선택 목록과 B1 확인, 인원별 현황이 그 값을 씁니다."],
    ["주의", "A열(작은 회색 글자)과 AJ열(프로젝트 표시)은 계산에 쓰이니 지우지 마세요. 열이 거슬리면 숨기기만 하세요."],
  ];
  lines.forEach(([k, v], i) => {
    const rr = 4 + i;
    gd.getRow(rr).height = 44;
    gd.getCell(rr, 2).value = k;
    gd.getCell(rr, 3).value = v;
    gd.getCell(rr, 2).font = font({ bold: true, color: { argb: "FFFFFFFF" } });
    gd.getCell(rr, 2).fill = solid(C.head);
    gd.getCell(rr, 3).font = font({ size: 10.5 });
    gd.getCell(rr, 3).alignment = { wrapText: true, vertical: "middle", indent: 1 };
    gd.getCell(rr, 2).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    gd.getCell(rr, 2).border = box;
    gd.getCell(rr, 3).border = box;
  });

  // 결과값 보정: 프로젝트 목차의 숫자 (이름 입력 칸 / 미배정)
  blocks.forEach((b, i) => {
    const rr = 5 + i;
    let filled = 0;
    let open = 0;
    TRIP_DEPTS.forEach(() => {});
    // 그 프로젝트의 칸을 다시 센다
    for (let row = b.slotFirst; row <= b.slotLast; row += 1) {
      for (let c = WEEK_COL0; c <= LAST_COL; c += 1) {
        const v = ws.getCell(row, c).value;
        if (v === 1) open += 1;
        else if (v !== null && v !== undefined && v !== "") filled += 1;
      }
    }
    ix.getCell(rr, 7).value = { formula: ix.getCell(rr, 7).value.formula, result: filled };
    ix.getCell(rr, 8).value = { formula: ix.getCell(rr, 8).value.formula, result: open };
  });

  wb.__trip = { blocks, weeks, cols, FIRST_DATA_ROW, sumTitle, rangeEnd, MX0, MXL, matrixRows, LAST_COL, blockRows };
  return wb;
}

function saveBuffer(buffer, fileName) {
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

/** 출장자 종합 엑셀 내려받기 */
export async function downloadTripWorkbook(input, options = {}) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = buildTripWorkbook(ExcelJS, input, options);
  saveBuffer(await wb.xlsx.writeBuffer(), `TW_출장자_종합현황_${todayISO().replaceAll("-", "")}.xlsx`);
}

export { addDays };
