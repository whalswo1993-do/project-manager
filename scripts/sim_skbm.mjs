import fs from 'fs';
import XLSX from 'xlsx';
import { excelDateToISO, normalizeJVName, normalizeDeptName, parseNum } from '../src/masterPlanParser.js';

const path = 'C:\\Users\\minja\\OneDrive\\바탕 화면\\SKBM 11, 13 Line E1111, E2222 JC.xlsx';
const buf = fs.readFileSync(path);
const wb = XLSX.read(buf, { cellDates: false, cellStyles: true });
const sheet = wb.Sheets['Planning'];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });

// Check what headerRowIdx and colMap were computed
let headerRowIdx = -1, colMap = {};
for (let r = 0; r < Math.min(25, rows.length); r++) {
  const row = rows[r] || [];
  const rowStr = row.map(x => String(x || "").trim().toLowerCase()).join(" ");
  if ((rowStr.includes("activity") || rowStr.includes("공정") || rowStr.includes("작업") || rowStr.includes("task")) &&
      (rowStr.includes("start") || rowStr.includes("end") || rowStr.includes("시작") || rowStr.includes("종료") || rowStr.includes("equipment") || rowStr.includes("설비") || rowStr.includes("장비"))) {
    headerRowIdx = r; break;
  }
}
console.log('headerRowIdx:', headerRowIdx);

if (headerRowIdx !== -1) {
  const headerRow = rows[headerRowIdx] || [];
  headerRow.forEach((h, colIdx) => {
    const colName = String(h || "").trim().toLowerCase();
    if (/activity|작업|공정|task|내용|항목|업무|마일스톤|milestone/i.test(colName)) {
      if (colMap.activity === undefined) colMap.activity = colIdx;
    } else if (/equipment|설비|장비|호기|machine/i.test(colName)) {
      if (colMap.equipment === undefined) colMap.equipment = colIdx;
    } else if (/^구분$/i.test(colName)) {
      if (colMap.equipment === undefined) colMap.equipment = colIdx;
    } else if (/^line|라인/i.test(colName)) {
      if (colMap.line === undefined) colMap.line = colIdx;
    } else if (/^(item|no|순번|번호|id)$/i.test(colName)) {
      if (colMap.item === undefined) colMap.item = colIdx;
    } else if (/start|시작|착수|착공|to\b/i.test(colName)) {
      if (colMap.start === undefined) colMap.start = colIdx;
    } else if (/end|종료|완료|완공|마감/i.test(colName)) {
      if (colMap.end === undefined) colMap.end = colIdx;
    } else if (/duration|기간|일수|days/i.test(colName)) {
      if (colMap.duration === undefined) colMap.duration = colIdx;
    }
  });
}
console.log('colMap:', colMap);

// Check dateCols
const refYear = 2026;
let bestDateCols = [];
for (let r = 0; r < Math.min(30, rows.length); r++) {
  const row = rows[r] || [];
  const curDates = [];
  let curYear = refYear;
  let prevMonth = null;
  for (let c = 0; c < row.length; c++) {
    const iso = excelDateToISO(row[c], curYear);
    if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      const m = parseInt(iso.slice(5, 7), 10);
      if (prevMonth !== null && prevMonth === 12 && m === 1) curYear++;
      prevMonth = m;
      curDates.push({ colIdx: c, dateStr: iso });
    }
  }
  if (curDates.length >= 5 && curDates.length > bestDateCols.length) {
    bestDateCols = curDates;
    console.log(`Row ${r} has ${curDates.length} dates! Sample:`, curDates.slice(0, 3));
  }
}
console.log('bestDateCols total:', bestDateCols.length);

// Let's trace rows 25 to 35 specifically for inManpowerSection and isDeptRow
let inManpowerSection = false;
let mpDeptCol = -1, mpTotalCol = -1, mpPeakCol = -1;
for (let r = 25; r <= 35; r++) {
  const row = rows[r];
  const rawJoined = row.map(x => String(x || '')).join(' ');
  const sRaw = row[colMap.start];
  const eRaw = row[colMap.end];
  const mStart = excelDateToISO(sRaw, refYear);
  const mEnd = excelDateToISO(eRaw, refYear);
  const isDateRow = Boolean(mStart && mEnd);

  const isManpowerHeader = (
     /manpower|인력|인원|공수|m\/d/i.test(rawJoined) ||
     (row.some(x => /^(personnel|구분|직종|부서)$/i.test(String(x || '').trim())) && row.some(x => /total/i.test(String(x || '')))) ||
     (/total/i.test(String(sRaw)) && /peak/i.test(String(eRaw)))
  );

  console.log(`\n--- Row ${r} ---`);
  console.log('raw:', row.filter(x => x != null && x !== '').slice(0, 8));
  console.log('isDateRow:', isDateRow, 'mStart:', mStart, 'mEnd:', mEnd);
  console.log('isManpowerHeader:', isManpowerHeader);
  console.log('inManpowerSection before:', inManpowerSection);

  if (isManpowerHeader) {
    inManpowerSection = true;
    row.forEach((cell, idx) => {
      const str = String(cell || '').trim().toLowerCase();
      if (/personnel|구분|직종|부서|인력|인원|공수/i.test(str)) mpDeptCol = idx;
      else if (/^total$/i.test(str)) mpTotalCol = idx;
      else if (/^peak$/i.test(str)) mpPeakCol = idx;
    });
    console.log('Set manpower header cols: dept=', mpDeptCol, 'total=', mpTotalCol, 'peak=', mpPeakCol);
    continue;
  }

  let isDeptRow = inManpowerSection && !isDateRow;
  console.log('isDeptRow:', isDeptRow);

  // Check how dept was recognized
  let deptRaw = "";
  if (mpDeptCol !== -1 && row[mpDeptCol] && !/^\d+$/.test(String(row[mpDeptCol]).trim())) {
    deptRaw = String(row[mpDeptCol]).trim();
  }
  console.log('deptRaw from mpDeptCol:', deptRaw);
  const deptName = normalizeDeptName(deptRaw);
  console.log('deptName normalized:', deptName);
  
  let rowTotal = 0;
  if (mpTotalCol !== -1) {
    rowTotal = parseNum(row[mpTotalCol]) || 0;
  }
  console.log('rowTotal:', rowTotal);
}
