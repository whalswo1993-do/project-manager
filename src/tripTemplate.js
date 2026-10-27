// 출장자 팀원 명단 엑셀 양식. 부서 팀장이 같은 양식으로 명단을 채우고, 표를 복사해 붙여넣어 최신화한다.
// 머리글이 첫 줄에 있고 칸마다 목록 선택이 걸려 있어서, 사람이 고르기만 하면 화면이 그대로 읽는다.
import { TRIP_DEPTS, TRIP_DEPT_LABEL, todayISO } from "./tripLogic";

export const TEMPLATE_HEADERS = ["부서(분야)", "소속 팀", "이름", "직위", "등급", "B1 비자", "상태", "비고"];
const REQUIRED = new Set(["부서(분야)", "이름"]);
const WIDTHS = [13, 20, 14, 11, 10, 11, 10, 30];
const DATA_ROWS = 300; // 목록 선택·테두리를 미리 걸어 둘 줄 수

const INK = "FF1F2937";
const BRAND = "FF0B57A4";
const MUTED = "FF6B7280";
const LINE = "FFD1D5DB";
const ZEBRA = "FFF8FAFC";

const solid = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const thin = { style: "thin", color: { argb: LINE } };
const box = { top: thin, left: thin, bottom: thin, right: thin };

// 예시 두 줄: "(예시)"로 시작하는 이름은 붙여넣을 때 자동으로 건너뛴다
const EXAMPLE_ROWS = [
  ["기구", "설비기술 1팀", "(예시) 홍길동", "책임", "PL", "O", "재직", "일병행"],
  ["비전", "비전 2팀", "(예시) 김철수", "선임", "", "", "재직", ""],
];

/** 인원 한 명 → 양식의 한 줄 */
export function memberToRow(m) {
  return [
    TRIP_DEPT_LABEL[m.dept] || "",
    m.team || "",
    m.name || "",
    m.rank || "",
    m.grade || "",
    m.b1_visa ? "O" : "",
    m.active === false ? "퇴사" : "재직",
    m.note || "",
  ];
}

function guideSheet(wb) {
  const ws = wb.addWorksheet("작성 안내", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 3 }, { width: 18 }, { width: 14 }, { width: 70 }];
  ws.getCell("B2").value = "출장자 관리 · 팀원 명단 양식";
  ws.getCell("B2").font = { name: "맑은 고딕", size: 18, bold: true, color: { argb: INK } };
  ws.getCell("B3").value = "부서 팀장이 팀원 명단을 같은 양식으로 정리하고, 표를 복사해 출장자 관리 화면에 붙여넣어 최신화합니다.";
  ws.getCell("B3").font = { name: "맑은 고딕", size: 10.5, color: { argb: MUTED } };

  ws.getCell("B5").value = "사용 순서";
  ws.getCell("B5").font = { name: "맑은 고딕", size: 12, bold: true, color: { argb: BRAND } };
  const steps = [
    "1.  '팀원 명단' 시트에 팀원을 한 줄에 한 명씩 입력합니다. (예시 두 줄은 지우거나 덮어쓰세요)",
    "2.  부서(분야)·B1 비자·상태 칸은 칸을 누르면 나오는 목록에서 고릅니다.",
    "3.  머리글 줄부터 입력한 곳까지 드래그해서 복사(Ctrl+C)합니다.",
    "4.  출장자 관리 → 팀원 관리 → '표 붙여넣기로 최신화'에서 붙여넣기(Ctrl+V)하고 미리보기를 확인한 뒤 저장합니다.",
    "5.  인사 변동이 있을 때마다 '현재 명단 내려받기'(부서별 시트로 나뉘어 있음)로 받은 파일을 고쳐서, 부서 시트별로 같은 방법으로 붙여넣으면 됩니다.",
  ];
  steps.forEach((t, i) => {
    const c = ws.getCell(`B${6 + i}`);
    c.value = t;
    c.font = { name: "맑은 고딕", size: 10.5, color: { argb: INK } };
  });

  const head = 12;
  ws.getCell(`B${head}`).value = "칸 설명";
  ws.getCell(`B${head}`).font = { name: "맑은 고딕", size: 12, bold: true, color: { argb: BRAND } };
  const rows = [
    ["항목", "필수", "설명"],
    ["부서(분야)", "필수", `${TRIP_DEPTS.map((d) => d.label).join(" · ")} 중 하나. 목록에서 고릅니다.`],
    ["소속 팀", "선택", "예: 설비기술 1팀. 같은 부서에서 이름이 같은 사람을 구분할 때 씁니다."],
    ["이름", "필수", "같은 부서·팀·이름이면 같은 사람으로 보고 내용만 갱신합니다."],
    ["직위", "선택", "책임 · 선임 · 주임 · 사원 등"],
    ["등급", "선택", "PL · QS 등 등급을 두는 부서만 입력하고, 없으면 비워 둡니다."],
    ["B1 비자", "선택", "보유하면 O, 없으면 비워 둡니다. 해외 프로젝트에 배정할 때 확인합니다."],
    ["상태", "선택", "재직 또는 퇴사. 퇴사로 바꾸면 이후 배정 후보에서 빠지고 기존 배정 기록은 남습니다."],
    ["비고", "선택", "자유롭게 적습니다. (예: 일병행, 병특)"],
  ];
  rows.forEach((r, i) => {
    const row = ws.getRow(head + 1 + i);
    r.forEach((v, j) => {
      const c = row.getCell(2 + j);
      c.value = v;
      c.border = box;
      c.alignment = { vertical: "middle", wrapText: true };
      c.font = { name: "맑은 고딕", size: 10.5, bold: i === 0, color: { argb: i === 0 ? "FFFFFFFF" : INK } };
      if (i === 0) c.fill = solid(INK);
      if (i > 0 && j === 1) c.font = { name: "맑은 고딕", size: 10.5, bold: true, color: { argb: v === "필수" ? "FFB91C1C" : MUTED } };
    });
    row.height = 22;
  });
  return ws;
}

/**
 * 양식 통합문서를 만든다. members 가 있으면 그 명단을 채워 넣고(수정용), 없으면 예시 두 줄만 넣는다.
 * ExcelJS 모듈은 부르는 쪽에서 넘긴다(화면은 필요할 때만 불러온다).
 */
const TAB_COLOR = { mechanical: "FF2563A8", vision: "FF7048C2", control: "FF0F8A80", electrical: "FFB83A76", manager: "FF566478" };

// 명단 시트 하나: 머리글 + 줄 + 목록 선택. examples = 안내용 예시 줄(회색 이탤릭)인지
function addMemberSheet(wb, name, rows, { deptLabels, examples = false, tabColor }) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }], properties: tabColor ? { tabColor: { argb: tabColor } } : undefined });
  ws.columns = TEMPLATE_HEADERS.map((h, i) => ({ header: h, width: WIDTHS[i] }));

  const headRow = ws.getRow(1);
  headRow.height = 28;
  TEMPLATE_HEADERS.forEach((h, i) => {
    const c = headRow.getCell(i + 1);
    c.fill = solid(REQUIRED.has(h) ? BRAND : INK);
    c.font = { name: "맑은 고딕", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    c.alignment = { vertical: "middle", horizontal: "center" };
    c.border = box;
  });

  const total = Math.max(DATA_ROWS, rows.length + 50);
  for (let i = 0; i < total; i += 1) {
    const row = ws.getRow(i + 2);
    const values = rows[i];
    const sample = examples && i < rows.length;
    TEMPLATE_HEADERS.forEach((h, j) => {
      const c = row.getCell(j + 1);
      if (values) c.value = values[j];
      c.border = box;
      c.alignment = { vertical: "middle", horizontal: j >= 3 && j <= 6 ? "center" : "left" };
      c.font = { name: "맑은 고딕", size: 10.5, italic: sample, color: { argb: sample ? MUTED : INK } };
      if (i % 2 === 1) c.fill = solid(ZEBRA);
    });
    row.height = 20;
    ws.getCell(`A${i + 2}`).dataValidation = { type: "list", allowBlank: true, formulae: [`"${deptLabels.join(",")}"`], showErrorMessage: true, errorTitle: "부서(분야)", error: `목록에서 선택하세요. (${deptLabels.join("·")})` };
    ws.getCell(`F${i + 2}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"O,X"'], showErrorMessage: true, errorTitle: "B1 비자", error: "보유하면 O, 없으면 비워 두세요." };
    ws.getCell(`G${i + 2}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"재직,퇴사"'], showErrorMessage: true, errorTitle: "상태", error: "재직 또는 퇴사 중에서 고르세요." };
  }
  ws.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + TEMPLATE_HEADERS.length)}1` };
  return ws;
}

const byTeamName = (a, b) => String(a.team || "").localeCompare(String(b.team || ""), "ko") || String(a.name).localeCompare(String(b.name), "ko");

/**
 * 양식 통합문서를 만든다.
 *  - members 가 없으면: "팀원 명단" 시트 하나에 예시 두 줄(빈 양식).
 *  - members 가 있으면: 부서마다 시트를 나눠(기구·비전·제어·전장·소장) 그 부서 인원을 같은 양식으로 채운다(수정해서 다시 붙여넣기용).
 * depts = 보여 줄 부서 키(없으면 전체). ExcelJS 모듈은 부르는 쪽에서 넘긴다(화면은 필요할 때만 불러온다).
 */
export function buildMemberWorkbook(ExcelJS, members = null, depts = null) {
  const deptKeys = depts?.length ? depts : TRIP_DEPTS.map((d) => d.key);
  const deptLabels = deptKeys.map((k) => TRIP_DEPT_LABEL[k]);
  const wb = new ExcelJS.Workbook();
  wb.creator = "TW Project Manager";
  wb.created = new Date();

  if (!members) {
    const rows = EXAMPLE_ROWS.map((r, i) => [deptLabels[i % deptLabels.length], ...r.slice(1)]);
    addMemberSheet(wb, "팀원 명단", rows, { deptLabels, examples: true });
  } else {
    const sheets = deptKeys.filter((k) => members.some((m) => m.dept === k));
    if (sheets.length === 0) addMemberSheet(wb, "팀원 명단", [], { deptLabels });
    sheets.forEach((k) => {
      const rows = members.filter((m) => m.dept === k).sort(byTeamName).map(memberToRow);
      addMemberSheet(wb, TRIP_DEPT_LABEL[k], rows, { deptLabels, tabColor: TAB_COLOR[k] });
    });
  }

  guideSheet(wb);
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

/** 빈 양식 내려받기 */
export async function downloadMemberTemplate(depts = null) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = buildMemberWorkbook(ExcelJS, null, depts);
  saveBuffer(await wb.xlsx.writeBuffer(), "TW_출장자_팀원명단_양식.xlsx");
}

/** 지금 등록된 명단을 부서별 시트로 내려받기 (같은 양식이라 고쳐서 시트별로 다시 붙여넣으면 최신화) */
export async function downloadMemberRoster(members, depts = null) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = buildMemberWorkbook(ExcelJS, members, depts);
  saveBuffer(await wb.xlsx.writeBuffer(), `TW_출장자_팀원명단_${todayISO().replaceAll("-", "")}.xlsx`);
}
