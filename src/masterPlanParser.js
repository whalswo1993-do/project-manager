import * as XLSX from "xlsx";
import { normalizeJVName } from "./utils.js";

export { normalizeJVName };

export const monthsMap = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
};

/**
 * 문자열 내 쉼표 등 숫자가 아닌 문자를 제거하고 숫자로 파싱합니다.
 */
export function parseNum(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const cleaned = String(val).replace(/,/g, '').trim();
  return Number(cleaned) || 0;
}

/**
 * 엑셀 시리얼 날짜(숫자) 또는 다양한 날짜 문자열(YYYY-MM-DD, MM/DD, DD-Mon, 한글 날짜 등)을
 * ISO 형식('YYYY-MM-DD')으로 정규화하여 반환합니다.
 */
export function excelDateToISO(serial, defaultYear) {
  if (!serial && serial !== 0) return "";
  if (serial instanceof Date) return serial.toISOString().slice(0, 10);

  const str = String(serial).trim();
  const numVal = Number(str);
  if (!isNaN(numVal) && typeof serial !== "boolean") {
    if (numVal >= 25000 && numVal < 80000) {
      const u = Math.floor(numVal - 25569);
      return new Date(u * 86400 * 1000).toISOString().slice(0, 10);
    }
    return "";
  }

  let s = str.replace(/[\r\n]+/g, '').trim();
  s = s.replace(/\s*\([월화수목금토일MonTueWedThuFriSatSun]\)/gi, '');
  s = s.replace(/^[([<{'"\s]+|[)\]}>'"\s]+$/g, '').trim();
  s = s.replace(/\.+$/, '').trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const yr = defaultYear || new Date().getFullYear();
  let m = s.match(/^(\d{4})[-./ ]\s*(\d{1,2})[-./ ]\s*(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  m = s.match(/^(\d{2})[-./ ]\s*(\d{1,2})[-./ ]\s*(\d{1,2})$/);
  if (m && parseInt(m[1], 10) >= 20 && parseInt(m[1], 10) <= 40) {
    return `20${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }

  m = s.match(/^(\d{1,2})[-/ ](\d{1,2})[-/ ](\d{2,4})$/);
  if (m && parseInt(m[1], 10) <= 12 && parseInt(m[2], 10) <= 31) {
    let yStr = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${yStr}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }

  const dMatch = s.match(/^(\d{1,2})[-/ ]([a-zA-Z]{3,})(?:[-/ ](\d{2,4}))?$/);
  if (dMatch) {
    const day = dMatch[1].padStart(2, '0');
    const monStr = dMatch[2].slice(0, 3).toLowerCase();
    const mon = monthsMap[monStr];
    let yStr = dMatch[3] ? (dMatch[3].length === 2 ? '20' + dMatch[3] : dMatch[3]) : String(yr);
    if (mon) return `${yStr}-${mon}-${day}`;
  }

  const engRev = s.match(/^([a-zA-Z]{3,})[-/ ](\d{1,2})(?:[-/ ](\d{2,4}))?$/);
  if (engRev) {
    const monStr = engRev[1].slice(0, 3).toLowerCase();
    const mon = monthsMap[monStr];
    const day = engRev[2].padStart(2, '0');
    let yStr = engRev[3] ? (engRev[3].length === 2 ? '20' + engRev[3] : engRev[3]) : String(yr);
    if (mon) return `${yStr}-${mon}-${day}`;
  }

  const koFull = s.match(/^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일?$/);
  if (koFull) return `${koFull[1]}-${koFull[2].padStart(2, '0')}-${koFull[3].padStart(2, '0')}`;

  const koMatch = s.match(/^(\d{1,2})[-./월]\s*(\d{1,2})일?$/);
  if (koMatch && parseInt(koMatch[1], 10) >= 1 && parseInt(koMatch[1], 10) <= 12 && parseInt(koMatch[2], 10) >= 1 && parseInt(koMatch[2], 10) <= 31) {
    return `${yr}-${koMatch[1].padStart(2, '0')}-${koMatch[2].padStart(2, '0')}`;
  }

  if (/[-./]/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      if (y >= 2020 && y <= 2040) return d.toISOString().slice(0, 10);
    }
  }
  return "";
}

export function parseHeaderDate(val, defaultYear) {
  return excelDateToISO(val, defaultYear);
}

/**
 * 마스터 스케줄 내 날짜가 과거 연도(예: 전년도 작성본)이거나 연도 전환(Cross-year)이 필요한 경우
 * 업로드 시점 기준 적절한 연도로 시프트 및 정합성을 맞춥니다.
 */
export function adjustProjectDates(project) {
  if (!project) return project;
  const now = new Date();
  const uploadYear = now.getFullYear();
  const uploadMonth = now.getMonth() + 1;
  const allDates = [];

  if (project.startDate) allDates.push(project.startDate);
  if (project.endDate) allDates.push(project.endDate);
  (project.milestones || []).forEach(m => {
    if (m.startDate) allDates.push(m.startDate);
    if (m.endDate) allDates.push(m.endDate);
  });
  if (project.manpower?.dailyTotal) {
    Object.keys(project.manpower.dailyTotal).forEach(d => allDates.push(d));
  }

  const parsed = allDates.map(d => {
    const parts = String(d).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return parts ? { str: d, year: parseInt(parts[1], 10), month: parseInt(parts[2], 10), day: parts[3] } : null;
  }).filter(Boolean);

  if (!parsed.length) return project;

  const origYears = [...new Set(parsed.map(p => p.year))].sort((a, b) => a - b);
  const minOrigYear = origYears[0] || uploadYear;
  const needYearShift = minOrigYear < uploadYear;

  let firstMonth = 1;
  if (project.startDate) {
    const m = project.startDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) firstMonth = parseInt(m[2], 10);
  } else if (project.milestones && project.milestones.length > 0) {
    for (const ms of project.milestones) {
      if (ms.startDate) {
        const m = ms.startDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) { firstMonth = parseInt(m[2], 10); break; }
      }
    }
  }

  let baseStartYear = uploadYear;
  if (uploadMonth >= 10 && firstMonth <= 4) {
    baseStartYear = uploadYear + 1;
  } else if (uploadMonth <= 3 && firstMonth >= 9) {
    baseStartYear = uploadYear - 1;
  }

  const convertDate = (dateStr) => {
    if (!dateStr || typeof dateStr !== "string") return dateStr;
    const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return dateStr;
    const origY = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const da = m[3];
    if (!needYearShift && origY >= uploadYear) return dateStr;
    let yearOffset = Math.max(0, origY - minOrigYear);
    if (firstMonth >= 8 && mo < firstMonth) {
      yearOffset = Math.max(yearOffset, 1);
    }
    const targetYear = baseStartYear + yearOffset;
    return `${targetYear}-${String(mo).padStart(2, '0')}-${da}`;
  };

  const cleanMs = (project.milestones || []).map(ms => ({
    ...ms,
    startDate: convertDate(ms.startDate),
    endDate: convertDate(ms.endDate)
  }));

  let newStart = convertDate(project.startDate);
  let newEnd = convertDate(project.endDate);
  let minD = "", maxD = "";
  cleanMs.forEach(m => {
    if (m.startDate && (!minD || m.startDate < minD)) minD = m.startDate;
    if (m.endDate && (!maxD || m.endDate > maxD)) maxD = m.endDate;
  });
  if (minD && (!newStart || newStart > minD)) newStart = minD;
  if (maxD && (!newEnd || newEnd < maxD)) newEnd = maxD;

  let newManpower = project.manpower;
  if (newManpower) {
    const newDailyTotal = {};
    if (newManpower.dailyTotal) {
      Object.entries(newManpower.dailyTotal).forEach(([dStr, val]) => {
        newDailyTotal[convertDate(dStr)] = val;
      });
    }
    const newDepartments = {};
    if (newManpower.departments) {
      Object.entries(newManpower.departments).forEach(([deptKey, deptObj]) => {
        const newDaily = {};
        if (deptObj.daily) {
          Object.entries(deptObj.daily).forEach(([dStr, val]) => {
            newDaily[convertDate(dStr)] = val;
          });
        }
        newDepartments[deptKey] = { ...deptObj, daily: newDaily };
      });
    }
    newManpower = { ...newManpower, dailyTotal: newDailyTotal, departments: newDepartments };
  }

  return { ...project, startDate: newStart, endDate: newEnd, milestones: cleanMs, manpower: newManpower };
}

/**
 * 시트에 기재된 부서/직종 문자열을 사내 표준 부서명으로 매핑합니다.
 * 특히 외주(Sub) 구분 및 Supervisor, Total Manday 등을 엄격하게 구분합니다.
 */
export function normalizeDeptName(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  const lower = s.toLowerCase();

  // 0. Total Manday check
  if (/total\s*manday|총\s*공수|합계/i.test(lower)) return "Total Manday";

  // 1. Check if it's an outsourced (외주) department
  const isSub = /외주|sub|협력|outsourc|엘라이트/i.test(lower);

  if (isSub) {
    if (/vision|비전|비젼|vis|엘라이트/i.test(lower)) return "비전 외주";
    if (/electrical|electronical|전장|전기|elec/i.test(lower)) return "전장 외주";
    if (/mechanical|기구|mech/i.test(lower)) return "기구 외주";
    if (/control|제어|cont/i.test(lower)) return "제어 외주";
    const base = s.replace(/\s*\([^)]*\)$/, '').replace(/외주|sub|협력사?/gi, '').trim();
    return base ? `${base} 외주` : "기타 외주";
  }

  // 2. Pure Internal departments (No 외주 keyword)
  // Mechanical / 설비기술 must be checked BEFORE manager/소장 because strings often have "(소장포함)"
  if (/설비기술/i.test(lower)) return "설비기술";
  if (/mechanical|기구|mech/i.test(lower)) return "기구";

  if (/supervisor|슈퍼바이저|\bsv\b|해체\s*검수|장착\s*검수|해체\/장착\s*검수/i.test(lower)) return "Supervisor";

  // Safety vs 소장 distinction:
  // "Safety Manager (소장)" -> 소장
  // "Safety Manager(안전)" -> 안전
  if (/safety.*소장|소장.*safety/i.test(lower)) return "소장";
  if (/safety|안전|safe/i.test(lower)) return "안전";
  if (/manager|소장|현장대리인/i.test(lower)) return "소장";

  if (/mechanical|기구|mech|기술/i.test(lower)) return "기구";
  if (/vision|비전|비젼/i.test(lower)) return "비전";
  if (/control|제어|cont/i.test(lower)) return "제어";
  if (/electrical|electronical|전장|전기|elec/i.test(lower)) return "전장";
  if (/^pm$/i.test(lower)) return "PM";
  if (/설계|design/i.test(lower)) return "설계";

  return s.replace(/\s*\([^)]*\)$/, '').trim() || s;
}

/**
 * 엑셀 클립보드 복사 시 큰따옴표(") 및 개행문자가 포함된 TSV 데이터를 올바르게 2차원 배열로 파싱합니다.
 */
export function parseTSVWithQuotes(text) {
  if (!text) return [];
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  let hasTab = false;
  for (let i = 0; i < Math.min(text.length, 3000); i++) {
    if (text[i] === '\t') { hasTab = true; break; }
  }
  const delimiter = hasTab ? '\t' : ',';

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const nextCh = text[i + 1];

    if (ch === '"') {
      if (inQuotes && nextCh === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      row.push(cell.trim());
      cell = '';
    } else if ((ch === '\r' || ch === '\n') && !inQuotes) {
      if (ch === '\r' && nextCh === '\n') i++;
      row.push(cell.trim());
      cell = '';
      rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

/**
 * 엑셀 워크북(XLSX Workbook) 또는 붙여넣은 표 데이터를 분석하여
 * 각 설비(Equipment)별 프로젝트 일정, 마일스톤, 공수(Manpower) 정보를 추출합니다.
 */
export function parseExcelMasterPlan(wb, context = {}) {
  let targetName = wb.SheetNames.find(n => /planning|schedule|master|일정/i.test(n));
  if (!targetName) {
    const nonEdit = wb.SheetNames.find(n => !/edit|설정|양식/i.test(n));
    targetName = nonEdit || wb.SheetNames[0];
  }
  const sheet = wb.Sheets[targetName];
  if (!sheet) return null;
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
  if (!rows || !rows.length) return null;

  let baseProjectName = "", baseStartDate = "", headerRowIdx = -1, colMap = {};
  let lineMfgMap = {};
  let titleLines = [];
  let mfgMatches = [];

  for (let r = 0; r < Math.min(25, rows.length); r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] || "").trim();
      if (!val) continue;
      const pMatch = val.match(/(?:project\s*name|프로젝트명)\s*[:：]\s*(.+)/i);
      if (pMatch && pMatch[1].trim()) {
        baseProjectName = normalizeJVName(pMatch[1].trim());
      } else if (/^(?:project\s*name|프로젝트명)\s*[:：]?$/i.test(val)) {
        for (let next = 1; next <= 3; next++) {
          if (row[c + next] && String(row[c + next]).trim()) {
            baseProjectName = normalizeJVName(String(row[c + next]).trim());
            break;
          }
        }
      }
      const sMatch = val.match(/(?:project\s*start\s*date|plan\s*start\s*date|시작일)\s*[:：]\s*(.+)/i);
      if (sMatch && sMatch[1].trim()) {
        const isoVal = excelDateToISO(sMatch[1].trim());
        if (isoVal) baseStartDate = isoVal;
      } else if (/^(?:project\s*start\s*date|plan\s*start\s*date|시작일)\s*[:：]?$/i.test(val)) {
        for (let next = 1; next <= 3; next++) {
          const isoVal = excelDateToISO(row[c + next]);
          if (isoVal) { baseStartDate = isoVal; break; }
        }
      }
    }
  }

  if (!baseProjectName && (context.formName || context.editingProjectName)) {
    baseProjectName = normalizeJVName(context.formName || context.editingProjectName);
  }
  if (!baseProjectName && context.fileName) {
    baseProjectName = normalizeJVName(context.fileName);
  }
  if (!baseProjectName && context.formSite) {
    baseProjectName = normalizeJVName(context.formSite);
  }

  let clientPrefix = baseProjectName ? baseProjectName.split(' - ')[0].trim() : (context.formSite || "Project");
  if (baseProjectName) {
    const siteMatch = baseProjectName.match(/(SKBM|SKOY|SKOJ|SKOH2|SKOH|SKBA|SKON|SKB|HSBMA|HMB|OJ1|OJ2-1F|OJ2|OJ|TW|SDI|LGES)/i);
    if (siteMatch) clientPrefix = siteMatch[1].toUpperCase();

    const linesMatch = baseProjectName.match(/(?:^|[\s\-_])([0-9,\s]+)\s*(?:Line|L|라인)/i);
    if (linesMatch) {
      titleLines = linesMatch[1].split(',').map(s => s.trim()).filter(Boolean);
      const prefixPart = baseProjectName.slice(0, linesMatch.index).trim().replace(/[:\-_]+$/, '').trim();
      if (prefixPart && !siteMatch) clientPrefix = prefixPart;
    }
    mfgMatches = baseProjectName.match(/([EH]\d{3,4})/gi) || [];
    if (mfgMatches && titleLines.length > 0) {
      titleLines.forEach((ln, idx) => {
        if (mfgMatches[idx]) lineMfgMap[ln] = mfgMatches[idx].toUpperCase();
      });
    } else {
      const mfgMatch = baseProjectName.match(/(?:Line\s*:\s*|제조번호\s*[:：]\s*)([0-9,\s]+)/i);
      if (mfgMatch) {
        const mfgs = mfgMatch[1].split(',').map(s => s.trim()).filter(Boolean);
        titleLines.forEach((ln, idx) => { if (mfgs[idx]) lineMfgMap[ln] = mfgs[idx]; });
      }
    }
  }

  for (let r = 0; r < Math.min(25, rows.length); r++) {
    const row = rows[r] || [];
    const rowStr = row.map(x => String(x || "").trim().toLowerCase()).join(" ");
    if ((rowStr.includes("activity") || rowStr.includes("공정") || rowStr.includes("작업") || rowStr.includes("task")) &&
        (rowStr.includes("start") || rowStr.includes("end") || rowStr.includes("시작") || rowStr.includes("종료") || rowStr.includes("equipment") || rowStr.includes("설비") || rowStr.includes("장비"))) {
      headerRowIdx = r; break;
    }
  }

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

  const refYear = baseStartDate ? parseInt(baseStartDate.slice(0, 4), 10) : new Date().getFullYear();
  if (colMap.start === undefined || colMap.end === undefined || colMap.activity === undefined) {
    const colStats = {};
    for (let r = 0; r < Math.min(60, rows.length); r++) {
      const row = rows[r] || [];
      for (let c = 0; c < Math.min(20, row.length); c++) {
        if (!colStats[c]) colStats[c] = { dates: 0, texts: 0, nums: 0, lines: 0, eqs: 0 };
        const val = row[c];
        if (val === undefined || val === null || val === '') continue;
        const str = String(val).trim();
        const iso = excelDateToISO(val, refYear);
        if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
          colStats[c].dates++;
        } else if (typeof val === 'number' || /^\d+$/.test(str)) {
          colStats[c].nums++;
          if (parseInt(str, 10) >= 1 && parseInt(str, 10) <= 20) colStats[c].lines++;
        } else {
          colStats[c].texts++;
          if (/notcher|stacker|노칭|스택|호기/i.test(str)) colStats[c].eqs++;
        }
      }
    }

    let bestStart = -1, bestEnd = -1, maxDateCount = 0;
    const colIndices = Object.keys(colStats).map(Number).sort((a, b) => a - b);
    for (let i = 0; i < colIndices.length - 1; i++) {
      const c1 = colIndices[i];
      const c2 = colIndices[i + 1];
      const d1 = colStats[c1]?.dates || 0;
      const d2 = colStats[c2]?.dates || 0;
      if (d1 >= 2 && d2 >= 2 && (d1 + d2) > maxDateCount) {
        maxDateCount = d1 + d2;
        bestStart = c1;
        bestEnd = c2;
      }
    }

    if (bestStart !== -1 && bestEnd !== -1) {
      if (colMap.start === undefined) colMap.start = bestStart;
      if (colMap.end === undefined) colMap.end = bestEnd;
      if (colMap.duration === undefined && colStats[bestEnd + 1]?.nums >= 2) {
        colMap.duration = bestEnd + 1;
      }
    }

    if (colMap.activity === undefined) {
      let cand = -1;
      const limit = colMap.start !== undefined ? colMap.start : 4;
      for (let c = limit - 1; c >= 0; c--) {
        if ((colStats[c]?.texts || 0) >= 2) {
          cand = c; break;
        }
      }
      colMap.activity = cand !== -1 ? cand : 2;
    }

    if (colMap.equipment === undefined) {
      let cand = -1;
      for (let c = 0; c < colMap.activity; c++) {
        if ((colStats[c]?.eqs || 0) > 0 || ((colStats[c]?.texts || 0) >= 1 && c !== colMap.activity)) {
          cand = c; break;
        }
      }
      colMap.equipment = cand !== -1 ? cand : Math.max(0, colMap.activity - 1);
    }

    if (colMap.line === undefined) {
      for (let c = 0; c < colMap.equipment; c++) {
        if ((colStats[c]?.lines || 0) >= 1) {
          colMap.line = c; break;
        }
      }
    }
  }

  if (colMap.item === undefined) colMap.item = 0;
  if (colMap.equipment === undefined) colMap.equipment = 1;
  if (colMap.activity === undefined) colMap.activity = 2;
  if (colMap.start === undefined) colMap.start = 5;
  if (colMap.end === undefined) colMap.end = 6;
  if (colMap.duration === undefined) colMap.duration = 7;

  // 4. Date headers detection across top rows (Must have at least 5 consecutive dates)
  const dateCols = [];
  let bestDateCols = [];
  for (let r = 0; r < Math.min(30, rows.length); r++) {
    const rowInfo = sheet['!rows'] ? sheet['!rows'][r] : null;
    if (rowInfo && rowInfo.hidden) continue;
    const row = rows[r] || [];
    const curDates = [];
    let curYear = refYear;
    let prevMonth = null;
    for (let c = 0; c < row.length; c++) {
      const iso = parseHeaderDate(row[c], curYear);
      if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        const m = parseInt(iso.slice(5, 7), 10);
        if (prevMonth !== null && prevMonth === 12 && m === 1) curYear++;
        prevMonth = m;
        curDates.push({ colIdx: c, dateStr: iso });
      }
    }
    if (curDates.length >= 5 && curDates.length > bestDateCols.length) {
      bestDateCols = curDates;
    }
  }

  if (bestDateCols.length >= 2) {
    bestDateCols.sort((a, b) => a.colIdx - b.colIdx);
    const extrapolated = [];
    for (let i = 0; i < bestDateCols.length; i++) {
      const cur = bestDateCols[i];
      extrapolated.push(cur);
      if (i < bestDateCols.length - 1) {
        const next = bestDateCols[i + 1];
        const curDate = new Date(cur.dateStr);
        const diffCols = next.colIdx - cur.colIdx;
        if (diffCols > 1) {
          for (let d = 1; d < diffCols; d++) {
            const tempDate = new Date(curDate);
            tempDate.setDate(tempDate.getDate() + d);
            extrapolated.push({
              colIdx: cur.colIdx + d,
              dateStr: tempDate.toISOString().slice(0, 10)
            });
          }
        }
      }
    }
    const lastDate = new Date(bestDateCols[bestDateCols.length - 1].dateStr);
    const lastCol = bestDateCols[bestDateCols.length - 1].colIdx;
    for (let d = 1; d <= 250; d++) {
      const tempDate = new Date(lastDate);
      tempDate.setDate(tempDate.getDate() + d);
      extrapolated.push({
        colIdx: lastCol + d,
        dateStr: tempDate.toISOString().slice(0, 10)
      });
    }
    extrapolated.forEach(d => {
      if (!dateCols.find(x => x.colIdx === d.colIdx)) dateCols.push(d);
    });
  } else {
    let firstMsDate = "";
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r] || [];
      const sRaw = row[colMap.start];
      const sIso = excelDateToISO(sRaw, refYear);
      if (sIso && (!firstMsDate || sIso < firstMsDate)) {
        firstMsDate = sIso;
      }
    }
    const baseDateStr = baseStartDate || firstMsDate || context.formStartDate || new Date().toISOString().slice(0, 10);
    const calStart = (colMap.duration !== undefined ? colMap.duration + 1 : 8);
    const startDateObj = new Date(baseDateStr);
    for (let d = 0; d <= 300; d++) {
      const tempDate = new Date(startDateObj);
      tempDate.setDate(tempDate.getDate() + d);
      dateCols.push({
        colIdx: calStart + d,
        dateStr: tempDate.toISOString().slice(0, 10)
      });
    }
  }

  let currentLine = titleLines[0] || context.formLine || "";
  let currentMfgNo = context.formMfg || "";
  let currentProject = null;
  let inManpowerSection = false;
  let inGrandTotalSection = false;
  let mpDeptCol = -1;
  let mpTotalCol = -1;
  let mpPeakCol = -1;
  const projects = [];

  const startLoopRow = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;

  for (let r = startLoopRow; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row.length) continue;
    const rowInfo = sheet['!rows'] ? sheet['!rows'][r] : null;

    const rawJoined = row.map(x => String(x || '')).join(' ');
    if (/grand\s*total/i.test(rawJoined)) {
      inGrandTotalSection = true;
      inManpowerSection = false;
      continue;
    }
    if (inGrandTotalSection) continue;

    const looksLikeTotalDataRow = row.some(x => /^(total\s*manday|총\s*공수|합계)$/i.test(String(x || '').trim())) &&
       row.some(x => { const v = Number(x); return !isNaN(v) && v > 10; });
    if (!looksLikeTotalDataRow && (
       /manpower|인력|인원|공수|m\/d/i.test(rawJoined) ||
       (row.some(x => String(x || '').toLowerCase() === 'personnel') && row.some(x => /total/i.test(String(x || '')))))) {
      inManpowerSection = true;
      row.forEach((cell, idx) => {
        const str = String(cell || '').trim().toLowerCase();
        if (/personnel|구분|직종|부서/i.test(str)) mpDeptCol = idx;
        else if (/^total$/i.test(str)) mpTotalCol = idx;
        else if (/^peak$/i.test(str)) mpPeakCol = idx;
      });
      continue;
    }

    if (rowInfo && rowInfo.hidden) continue;

    const itemRaw = row[colMap.item !== undefined ? colMap.item : 0];
    const eqRaw = row[colMap.equipment !== undefined ? colMap.equipment : 1];
    const actRaw = row[colMap.activity !== undefined ? colMap.activity : 2];
    const lineRaw = colMap.line !== undefined ? row[colMap.line] : undefined;
    const sRaw = row[colMap.start !== undefined ? colMap.start : 3];
    const eRaw = row[colMap.end !== undefined ? colMap.end : 4];

    const itemStr = String(itemRaw || "").trim();
    const eqStr = String(eqRaw || "").replace(/[\r\n]+/g, " ").trim();
    const actStr = String(actRaw || "").trim();
    const lineStr = String(lineRaw || "").trim();
    const combinedLineStr = [itemStr, eqStr, actStr, lineStr].join(" ");

    if (lineStr) {
      const lm = lineStr.match(/([0-9A-Za-z]+)/);
      if (lm) {
        if (titleLines.length === 1 && lm[1] === "1" && titleLines[0] !== "1") {
          currentLine = titleLines[0];
        } else if (titleLines.length > 0 && !titleLines.includes(lm[1])) {
          const forwardMatch = (currentLine && Math.abs(parseInt(currentLine, 10) - parseInt(lm[1], 10)) <= 1)
            ? currentLine
            : titleLines.slice().reverse().find(tl => Math.abs(parseInt(tl, 10) - parseInt(lm[1], 10)) <= 1);
          currentLine = forwardMatch || lm[1];
        } else {
          currentLine = lm[1];
        }
      }
    } else {
      const lineMatch = combinedLineStr.match(/(?:Line\s*|L|라인)\s*([0-9A-Za-z]+)|([0-9A-Za-z]+)\s*(?:Line|L|라인)/i);
      if (lineMatch && !/total|manpower|personnel/i.test(combinedLineStr)) {
        currentLine = (lineMatch[1] || lineMatch[2]).trim();
        if (titleLines.length > 0 && !titleLines.includes(currentLine)) {
          const matchedTitleLine = titleLines.find(tl => Math.abs(parseInt(tl, 10) - parseInt(currentLine, 10)) <= 1);
          if (matchedTitleLine) currentLine = matchedTitleLine;
        }
      }
    }
    const mfgMatch2 = combinedLineStr.match(/(E[0-9]{4})/i);
    if (mfgMatch2 && !/total|manpower/i.test(combinedLineStr)) {
      currentMfgNo = mfgMatch2[1].toUpperCase();
      for (let l in lineMfgMap) {
        if (lineMfgMap[l] === currentMfgNo) { currentLine = l; break; }
      }
    } else {
      if (lineMfgMap[currentLine]) currentMfgNo = lineMfgMap[currentLine];
    }

    const mStart = excelDateToISO(sRaw, refYear);
    const mEnd = excelDateToISO(eRaw, refYear);
    const isDateRow = Boolean(mStart && mEnd);
    const durRaw = colMap.duration !== undefined ? row[colMap.duration] : row[7];

    if (isDateRow) {
      inManpowerSection = false;
    }

    const looksLikeTotalRow2 = row.some(x => /^(total\s*manday|총\s*공수|합계)$/i.test(String(x || '').trim()));
    const isManpowerHeader = !looksLikeTotalRow2 && (
       /manpower|인력|인원|공수|m\/d/i.test(combinedLineStr) ||
       (row.some(x => /^(personnel|구분|직종|부서)$/i.test(String(x || '').trim())) && row.some(x => /total/i.test(String(x || '')))) ||
       (/total/i.test(String(sRaw)) && /peak/i.test(String(eRaw)))
    );

    if (isManpowerHeader) {
      inManpowerSection = true;
      mpDeptCol = -1;
      mpTotalCol = -1;
      mpPeakCol = -1;
      row.forEach((cell, idx) => {
        const str = String(cell || '').trim().toLowerCase();
        if (/personnel|구분|직종|부서|인력|인원|공수/i.test(str)) mpDeptCol = idx;
        else if (/^total$/i.test(str)) mpTotalCol = idx;
        else if (/^peak$/i.test(str)) mpPeakCol = idx;
      });
      continue;
    }

    let isDeptRow = inManpowerSection && !isDateRow;
    if (!isDeptRow && !isDateRow && currentProject) {
      const checkRaw = String(sRaw || actStr || eqStr || '').trim();
      const checkDept = normalizeDeptName(checkRaw);
      const isNum = Number(eRaw) > 0 || Number(durRaw) > 0;
      if (checkDept && (checkDept !== checkRaw || /mechanical|vision|control|electrical|safety|supervisor/i.test(checkDept)) && isNum) {
        inManpowerSection = true;
        isDeptRow = true;
      }
    }

    let effectiveEqStr = eqStr;
    if (!effectiveEqStr && currentProject && Object.keys(currentProject._deptMap).length > 0 && isDateRow) {
      for (let nr = r; nr < Math.min(r + 20, rows.length); nr++) {
        const nextEqRaw = rows[nr] && rows[nr][colMap.equipment !== undefined ? colMap.equipment : 1];
        const nextEq = String(nextEqRaw || "").replace(/[\r\n]+/g, " ").trim();
        if (nextEq && !/manpower|personnel|인력|인원|공수|manday|m\/d/i.test(nextEq) && nextEq !== "0") {
          effectiveEqStr = nextEq;
          break;
        }
      }
    }

    const isEqStart = effectiveEqStr && !/manpower|personnel|인력|인원|공수|manday|m\/d/i.test(combinedLineStr) && effectiveEqStr !== "0" && !isDeptRow && (
      !currentProject || effectiveEqStr !== currentProject.equipment || currentLine !== currentProject._lineNum || inManpowerSection
    );

    if (isEqStart) {
      inManpowerSection = false;
      mpDeptCol = -1;
      mpTotalCol = -1;
      mpPeakCol = -1;
      const lineLabel = currentLine ? (currentLine.toLowerCase().includes('line') ? currentLine : `${currentLine}Line`) : (context.formLine || "");
      const mfgNo = context.formMfg || "";
      const projName = normalizeJVName([clientPrefix, lineLabel, effectiveEqStr].filter(Boolean).join(" - ").replace(" -  - ", " - "));

      currentProject = {
        projectName: projName,
        equipment: effectiveEqStr,
        site: clientPrefix || context.formSite || "",
        startDate: baseStartDate,
        endDate: "",
        manufacturingNo: normalizeJVName(mfgNo),
        line: normalizeJVName(lineLabel || currentLine),
        _lineNum: currentLine,
        milestones: [],
        _deptMap: {},
        _dailyTotalMap: {},
        _totalMandayVal: 0,
        _dailyPeakVal: 0,
        sheetName: targetName
      };
      projects.push(currentProject);
    } else if (!currentProject && isDateRow) {
      const lineLabel = currentLine ? (currentLine.toLowerCase().includes('line') ? currentLine : `${currentLine}Line`) : (context.formLine || "");
      const mfgNo = context.formMfg || "";
      const fallbackEq = context.editingProjectName || context.formName || "Main Equipment";
      const projName = normalizeJVName([clientPrefix, lineLabel, fallbackEq].filter(Boolean).join(" - ").replace(" -  - ", " - "));
      currentProject = {
        projectName: projName,
        equipment: fallbackEq,
        site: clientPrefix || context.formSite || "",
        startDate: baseStartDate,
        endDate: "",
        manufacturingNo: normalizeJVName(mfgNo),
        line: normalizeJVName(lineLabel || currentLine),
        _lineNum: currentLine,
        milestones: [],
        _deptMap: {},
        _dailyTotalMap: {},
        _totalMandayVal: 0,
        _dailyPeakVal: 0,
        sheetName: targetName
      };
      projects.push(currentProject);
    }

    if (inManpowerSection && !isDateRow && currentProject) {
      if (row.some(x => String(x || '').toLowerCase() === 'personnel') && row.some(x => /total/i.test(String(x || '')))) {
        row.forEach((cell, idx) => {
          const str = String(cell || '').trim().toLowerCase();
          if (/personnel|구분|직종|부서/i.test(str)) mpDeptCol = idx;
          else if (/^total$/i.test(str)) mpTotalCol = idx;
          else if (/^peak$/i.test(str)) mpPeakCol = idx;
        });
        continue;
      }

      let deptRaw = "";
      if (mpDeptCol !== -1 && row[mpDeptCol] && !/^\d+$/.test(String(row[mpDeptCol]).trim())) {
        deptRaw = String(row[mpDeptCol]).trim();
      } else {
        const cand = [actStr, sRaw, eqStr];
        for (const c of cand) {
          if (c && c !== "0" && !/^\d+$/.test(c) && !/personnel|peak/i.test(c)) {
            deptRaw = c; break;
          }
        }
        if (!deptRaw) {
          for (let c = 0; c <= Math.min(8, row.length - 1); c++) {
            const val = String(row[c] || "").trim();
            if (val && val !== "0" && !/^\d+$/.test(val) && !/personnel|peak|activity|equipment|line/i.test(val)) {
              const testNorm = normalizeDeptName(val);
              if (testNorm && testNorm !== val) { deptRaw = val; break; }
              if (/기구|전장|비전|비젼|제어|안전|소장|외주|supervisor|total|합계/i.test(val)) { deptRaw = val; break; }
            }
          }
        }
      }
      if (!deptRaw) continue;
      if (/^\d{1,2}[월\-/. ]/i.test(deptRaw) || /^\d{4}[-/. ]/i.test(deptRaw)) continue;

      const isTotalRow = /^(total|total\s*manday|총\s*공수|합계)$/i.test(deptRaw) ||
                         row.some(x => /^(total|total\s*manday|총\s*공수|합계)$/i.test(String(x || '').trim()));

      const deptName = isTotalRow ? "Total Manday" : normalizeDeptName(deptRaw);
      if (!isTotalRow) {
        const isKnown = /기구|비전|제어|전장|안전|소장|pm|supervisor|설계|설비기술|외주/i.test(deptName);
        if (!isKnown) continue;
      }

      let rowTotal = 0;
      let rowPeak = 0;
      if (mpTotalCol !== -1) {
        rowTotal = parseNum(row[mpTotalCol]) || 0;
        if (mpPeakCol !== -1) {
          rowPeak = parseNum(row[mpPeakCol]) || 0;
        } else {
          rowPeak = parseNum(row[mpTotalCol + 1]) || 0;
        }
      } else {
        const numIndices = [];
        for (let c = 0; c < Math.min(12, row.length); c++) {
          const v = parseNum(row[c]);
          if (v > 0 && c > (colMap.activity || 2)) numIndices.push({ c, v });
        }
        if (numIndices.length >= 1) {
          mpTotalCol = numIndices[0].c;
          rowTotal = numIndices[0].v;
          if (numIndices.length >= 2) {
            mpPeakCol = numIndices[1].c;
            rowPeak = numIndices[1].v;
          }
        }
      }

      const daily = {};
      const calendarStartCol = dateCols.length > 0 ? dateCols[0].colIdx : (mpPeakCol !== -1 ? mpPeakCol + 1 : mpTotalCol !== -1 ? mpTotalCol + 2 : 8);

      dateCols.forEach(({ colIdx, dateStr }) => {
        if (colIdx < calendarStartCol) return;
        if (mpTotalCol !== -1 && colIdx === mpTotalCol) return;
        if (mpPeakCol !== -1 && colIdx === mpPeakCol) return;
        const val = parseNum(row[colIdx]) || 0;
        if (val > 0) {
          daily[dateStr] = val;
          if (isTotalRow) currentProject._dailyTotalMap[dateStr] = val;
        }
      });

      const dailySum = Object.values(daily).reduce((a, b) => a + b, 0);
      const dailyMax = Object.values(daily).reduce((a, b) => Math.max(a, b), 0);
      if (!rowTotal && dailySum > 0) rowTotal = dailySum;
      if (!rowPeak && dailyMax > 0) rowPeak = dailyMax;

      if (isTotalRow) {
        currentProject._totalMandayVal = rowTotal;
        currentProject._dailyPeakVal = rowPeak;
        inManpowerSection = false;
      } else if (deptName && (rowTotal > 0 || rowPeak > 0 || dailySum > 0)) {
        if (currentProject._deptMap[deptName]) {
          currentProject._deptMap[deptName].total += rowTotal;
          currentProject._deptMap[deptName].peak = Math.max(currentProject._deptMap[deptName].peak, rowPeak);
          Object.entries(daily).forEach(([dStr, val]) => {
            currentProject._deptMap[deptName].daily[dStr] = (currentProject._deptMap[deptName].daily[dStr] || 0) + val;
          });
        } else {
          currentProject._deptMap[deptName] = { total: rowTotal, peak: rowPeak, daily };
        }
      }
      continue;
    }

    if (actStr && actStr !== "0" && mStart && mEnd && currentProject) {
      inManpowerSection = false;
      currentProject.milestones.push({ name: normalizeJVName(actStr), startDate: mStart, endDate: mEnd });
    }
  }

  projects.forEach(p => {
    delete p._lineNum;
    if (Object.keys(p._deptMap).length > 0 || p._totalMandayVal > 0) {
      if (Object.keys(p._dailyTotalMap).length === 0) {
        dateCols.forEach(({ dateStr }) => {
          let sum = 0;
          Object.values(p._deptMap).forEach(d => {
            if (d.daily && d.daily[dateStr]) sum += d.daily[dateStr];
          });
          if (sum > 0) p._dailyTotalMap[dateStr] = sum;
        });
      }
      if (!p._totalMandayVal) {
        p._totalMandayVal = Object.values(p._deptMap).reduce((a, b) => a + (b.total || 0), 0);
      }

      // If user copied partial table without rightmost calendar columns, but department totals exist:
      // Distribute manpower across active milestone dates so timeline is never empty!
      if (Object.keys(p._dailyTotalMap).length === 0 && p._totalMandayVal > 0 && p.milestones.length > 0) {
        const setupMs = p.milestones.filter(m => /세팅|조립|인증|대응|셋업|설치|작업|sample/i.test(m.name));
        const targetMsList = setupMs.length > 0 ? setupMs : p.milestones;
        let sMin = targetMsList[0].startDate;
        let eMax = targetMsList[0].endDate;
        targetMsList.forEach(m => {
          if (m.startDate && m.startDate < sMin) sMin = m.startDate;
          if (m.endDate && m.endDate > eMax) eMax = m.endDate;
        });
        if (sMin && eMax) {
          const curD = new Date(sMin);
          const endD = new Date(eMax);
          const activeDates = [];
          while (curD <= endD && activeDates.length < 200) {
            const dayOfWeek = curD.getDay();
            if (dayOfWeek !== 0) { // Monday-Saturday
              activeDates.push(curD.toISOString().slice(0, 10));
            }
            curD.setDate(curD.getDate() + 1);
          }
          if (activeDates.length > 0) {
            Object.entries(p._deptMap).forEach(([dName, dData]) => {
              if (dData.total > 0 && Object.keys(dData.daily).length === 0) {
                const perDay = Math.max(1, Math.min(dData.peak || dData.total, Math.ceil(dData.total / activeDates.length)));
                let rem = dData.total;
                for (const dStr of activeDates) {
                  if (rem <= 0) break;
                  const alloc = Math.min(rem, perDay);
                  dData.daily[dStr] = alloc;
                  p._dailyTotalMap[dStr] = (p._dailyTotalMap[dStr] || 0) + alloc;
                  rem -= alloc;
                }
              }
            });
          }
        }
      }
      if (!p._dailyPeakVal) {
        p._dailyPeakVal = Object.values(p._dailyTotalMap).reduce((a, b) => Math.max(a, b), 0);
      }
      
      Object.values(p._deptMap).forEach(d => {
        if (d.daily && Object.keys(d.daily).length > 0) {
          const calculatedPeak = Object.values(d.daily).reduce((max, val) => Math.max(max, val), 0);
          if (calculatedPeak > 0) {
            d.peak = calculatedPeak;
          }
        }
      });

      p.manpower = {
        totalManday: p._totalMandayVal,
        dailyPeak: p._dailyPeakVal,
        departments: p._deptMap,
        byDepartment: Object.fromEntries(Object.entries(p._deptMap).map(([k, v]) => [k, v.total])),
        dailyTotal: p._dailyTotalMap
      };
    }
    delete p._deptMap;
    delete p._dailyTotalMap;
    delete p._totalMandayVal;
    delete p._dailyPeakVal;

    let minD = "", maxD = "";
    p.milestones.forEach(m => {
      if (!minD || m.startDate < minD) minD = m.startDate;
      if (!maxD || m.endDate > maxD) maxD = m.endDate;
    });
    
    if (p.manpower && p.manpower.dailyTotal) {
      const mpDates = Object.keys(p.manpower.dailyTotal);
      if (mpDates.length > 0) {
        const mpMin = mpDates.reduce((min, d) => d < min ? d : min, mpDates[0]);
        const mpMax = mpDates.reduce((max, d) => d > max ? d : max, mpDates[0]);
        if (!minD || mpMin < minD) minD = mpMin;
        if (!maxD || mpMax > maxD) maxD = mpMax;
      }
    }

    if (!p.startDate && minD) p.startDate = minD;
    if (maxD) p.endDate = maxD;
  });

  return projects.map(adjustProjectDates).filter(p => p.milestones.length > 0 || p.manpower);
}

export function hasSharedCode(setA, setB) {
  if (!setA || !setB) return false;
  for (let a of setA) {
    if (setB.has(a)) return true;
  }
  return false;
}

/**
 * 프로젝트명, 라인, 제조번호 등에서 특성 태그(형교환 여부, 셋업 여부, 프로젝트 코드 등)를 추출합니다.
 */
export function extractProjectTags(p, sites = []) {
  const name = String(p.projectName || p.name || '').trim();
  const mfg = String(p.manufacturingNo || p.manufacturing_no || '').trim();
  const eq = String(p.equipment || '').toLowerCase().replace(/\s*\(\d+대\)/, '').trim();
  const line = String(p.line || '').replace(/line/i, '').trim().toLowerCase();
  const site = String(p.site || '').trim().toLowerCase();

  // 1. Job Change (형교환) project check
  const isJC = /j[\.\/]?c\b|jc\b|job\s*change|형교환|기종교체|모델교체|개조/i.test(name) ||
               (p.milestones && p.milestones.some(m => /j[\.\/]?c|형교환|job\s*change/i.test(m.name)));

  // 2. Setup / Initial installation project check
  const isSetup = /set-?up|셋업|신규|설치|초기|반입/i.test(name);

  // 3. Known site names to exclude from code matching
  const siteNamesUpper = new Set((sites || []).map(s => String(s.name || '').toUpperCase().trim()));
  ['SKOJ', 'SKOY', 'SKOH', 'HSBMA', 'TW'].forEach(s => siteNamesUpper.add(s));

  // 4. Project-specific codes (e.g. E1127, H055, S010A, 2309AD-N, E1144, E1540)
  const codeMatches = (name + ' ' + mfg).match(/\b([A-Z0-9]{4,12}(?:-[A-Z0-9]+)?)\b/gi) || [];
  const codes = new Set(codeMatches.map(c => c.toUpperCase()).filter(c => !siteNamesUpper.has(c) && !/line|notcher|stacker|project|schedule|master/i.test(c)));
  if (mfg && !siteNamesUpper.has(mfg.toUpperCase())) codes.add(mfg.toUpperCase());

  // 5. Phase / Round (1차, 2차 등)
  const roundMatch = name.match(/([0-9]+)\s*차/);
  const round = roundMatch ? roundMatch[1] : null;

  return { isJC: !!isJC, isSetup: !!isSetup, codes, round, line, site, eq, name: name.toLowerCase() };
}

/**
 * 동일한 Site / Line 이라도 형교환(J/C)과 신규 셋업, 설비(Notcher vs Stacker), 프로젝트 코드 등을 다각도로 검증하여
 * 기존 DB 프로젝트와 업로드된 프로젝트가 동일한 실체인지 여부를 판별합니다.
 */
export function isSameProjectIdentity(existing, incoming, sites = []) {
  if (!existing || !incoming) return false;

  const exTags = extractProjectTags(existing, sites);
  const inTags = extractProjectTags(incoming, sites);

  // 1. Site Check: Must not conflict
  if (exTags.site && inTags.site && exTags.site !== inTags.site) return false;
  if (exTags.site && inTags.name) {
    const conflictingSite = (sites || []).find(s => s.name && s.name.trim().toLowerCase() !== exTags.site && inTags.name.includes(s.name.trim().toLowerCase()));
    if (conflictingSite) return false;
  }

  // 2. Line Check: Must not conflict
  if (exTags.line && inTags.line && exTags.line !== inTags.line) return false;

  // 3. Equipment Check: Notcher vs Stacker
  const isExNotcher = /notcher|노칭/i.test(exTags.name) || /notcher|노칭/i.test(exTags.eq);
  const isExStacker = /stacker|스태커|스택/i.test(exTags.name) || /stacker|스태커|스택/i.test(exTags.eq);
  const isInNotcher = /notcher|노칭/i.test(inTags.name) || /notcher|노칭/i.test(inTags.eq);
  const isInStacker = /stacker|스태커|스택/i.test(inTags.name) || /stacker|스태커|스택/i.test(inTags.eq);

  if ((isExNotcher && isInStacker) || (isExStacker && isInNotcher)) return false;

  // 4. Job Change (형교환) vs Setup (신규 셋업 / 일반) Distinction
  if (exTags.isJC !== inTags.isJC) {
    return false;
  }

  // 5. J/C Round Check (1차 형교환 vs 2차 형교환)
  if (exTags.round && inTags.round && exTags.round !== inTags.round) {
    return false;
  }

  // 6. Project Code / Manufacturing No Check (e.g. H055 vs E1127 or E1144 vs E1540)
  if (exTags.codes.size > 0 && inTags.codes.size > 0) {
    if (!hasSharedCode(exTags.codes, inTags.codes)) {
      return false;
    }
  }

  // 7. Date Range Disjointness Check:
  // 45일 이상 완전히 떨어져 있고 공유 코드가 없는 경우 별개 프로젝트로 판단
  if (existing.startDate && existing.endDate && incoming.startDate && incoming.endDate) {
    const dtVal = s => new Date(s).getTime();
    const gap = Math.max(dtVal(incoming.startDate) - dtVal(existing.endDate), dtVal(existing.startDate) - dtVal(incoming.endDate));
    const dayGap = gap / (1000 * 60 * 60 * 24);
    if (dayGap > 45 && !hasSharedCode(exTags.codes, inTags.codes)) {
      return false;
    }
  }

  // 8. Positive Match Confirmation:
  const eqMatch = (isExNotcher && isInNotcher) || (isExStacker && isInStacker) ||
                  (inTags.eq && exTags.name.includes(inTags.eq)) ||
                  (exTags.eq && inTags.name.includes(exTags.eq));

  const nameMatch = exTags.name && inTags.name && (
    exTags.name === inTags.name ||
    exTags.name.replace(/\s+/g, '') === inTags.name.replace(/\s+/g, '')
  );

  const codeMatch = hasSharedCode(exTags.codes, inTags.codes);

  return nameMatch || (eqMatch && (codeMatch || (exTags.line === inTags.line && (!exTags.site || exTags.site === inTags.site))));
}

/**
 * 마일스톤 날짜 및 주요 명칭(발주, 제작, 반입, 셋팅 등)을 기반으로 현재 프로젝트 상태를 자동 계산합니다.
 */
export function computeAutoStatus(p, today = new Date().toISOString().slice(0, 10)) {
  const end = p.endDate || p.end_date;
  const start = p.startDate || p.start_date;
  if (end && today > end) return "완료";

  const rawMs = p.milestones || [];
  const validMs = rawMs.filter(m => m && m.name && m.startDate && m.endDate && m.id !== '__status_meta__');
  if (!validMs.length) {
    if (end && today > end) return "완료";
    if (start && today >= start) return "진행중";
    return "검토중";
  }

  const orderRegex = /발주|제작|구매|가공|조립|자재|부품|order|mfg|manufacturing|fabricat/i;
  const deliveryRegex = /반입|입고|출하|출고|현장|설치|셋팅|setting|site|공정|시운전|셋업|setup|install|delivery|ship/i;

  const deliveryMs = validMs.filter(m => deliveryRegex.test(m.name));
  let deliveryStart = deliveryMs.length ? deliveryMs.reduce((min, m) => (!min || m.startDate < min ? m.startDate : min), "") : "";

  const orderMs = validMs.filter(m => orderRegex.test(m.name) && !/po\s*대기/i.test(m.name) && !deliveryRegex.test(m.name));
  let orderStart = orderMs.length ? orderMs.reduce((min, m) => (!min || m.startDate < min ? m.startDate : min), "") : "";

  if (deliveryStart && today >= deliveryStart && (!end || today <= end)) {
    return "진행중";
  }

  if (orderStart) {
    if (deliveryStart) {
      if (today >= orderStart && today < deliveryStart) return "제작 및 운송중";
      if (today < orderStart) return "검토중";
    } else {
      if (today >= orderStart && (!end || today <= end)) return "제작 및 운송중";
      if (today < orderStart) return "검토중";
    }
  }

  if (deliveryStart && today < deliveryStart) return "검토중";

  const sorted = [...validMs].sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (today < sorted[0].startDate) return "검토중";
  return "진행중";
}
