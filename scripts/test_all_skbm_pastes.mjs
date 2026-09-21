import fs from 'fs';
import XLSX from 'xlsx';
import { parseExcelMasterPlan, parseTSVWithQuotes } from '../src/masterPlanParser.js';

const path = 'C:\\Users\\minja\\OneDrive\\바탕 화면\\SKBM 11, 13 Line E1111, E2222 JC.xlsx';
const buf = fs.readFileSync(path);
const wb = XLSX.read(buf, { cellDates: false, cellStyles: true });
const ws = wb.Sheets['Planning'];
const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

console.log('Sheet Planning has', allRows.length, 'rows');

function simulatePaste(rowsSubset, desc) {
  console.log(`\n========================================`);
  console.log(`Simulating Paste: ${desc}`);
  console.log(`Rows: ${rowsSubset.length}, Cols in row 0: ${(rowsSubset[0]||[]).length}`);
  
  // 1. As HTML table
  const wsSub = XLSX.utils.aoa_to_sheet(rowsSubset);
  const html = XLSX.utils.sheet_to_html(wsSub);
  let htmlProjects = null;
  try {
    const htmlWb = XLSX.read(html, { type: 'string' });
    htmlProjects = parseExcelMasterPlan(htmlWb, {});
  } catch (e) {
    console.log('  HTML parse threw error:', e.message);
  }

  // 2. As TSV text
  const tsv = rowsSubset.map(r => (r || []).map(c => c == null ? '' : String(c)).join('\t')).join('\r\n');
  let tsvProjects = null;
  try {
    const lines = parseTSVWithQuotes(tsv);
    const wsTsv = XLSX.utils.aoa_to_sheet(lines);
    const tsvWb = { SheetNames: ['Sheet1'], Sheets: { Sheet1: wsTsv } };
    tsvProjects = parseExcelMasterPlan(tsvWb, {});
  } catch (e) {
    console.log('  TSV parse threw error:', e.message);
  }

  console.log(`  Result HTML: ${htmlProjects ? htmlProjects.length : 0} projects`);
  if (htmlProjects && htmlProjects.length > 0) {
    htmlProjects.forEach((p, i) => {
      const dailyCount = Object.keys(p.manpower?.dailyTotal || {}).length;
      console.log(`    P${i+1} [HTML]: ${p.projectName} | Manday: ${p.manpower?.totalManday} | ByDept: ${JSON.stringify(p.manpower?.byDepartment || {})} | Milestones: ${p.milestones?.length} | DailyCount: ${dailyCount}`);
    });
  }

  console.log(`  Result TSV: ${tsvProjects ? tsvProjects.length : 0} projects`);
  if (tsvProjects && tsvProjects.length > 0) {
    tsvProjects.forEach((p, i) => {
      const dailyCount = Object.keys(p.manpower?.dailyTotal || {}).length;
      console.log(`    P${i+1} [TSV]: ${p.projectName} | Manday: ${p.manpower?.totalManday} | ByDept: ${JSON.stringify(p.manpower?.byDepartment || {})} | Milestones: ${p.milestones?.length} | DailyCount: ${dailyCount}`);
    });
  }
}

// Case 1: Entire sheet (all rows)
simulatePaste(allRows, 'Case 1: All rows (from row 0)');

// Case 2: From row 1 (Project Name)
simulatePaste(allRows.slice(1), 'Case 2: From row 1 (Project Name)');

// Case 3: From row 2 (Project Start Date)
simulatePaste(allRows.slice(2), 'Case 3: From row 2 (Project Start Date)');

// Case 4: From row 5 (Header: Line Equipment Activity...)
simulatePaste(allRows.slice(5), 'Case 4: From row 5 (Header: Line Equipment Activity...)');

// Case 5: From row 6 (Data: 11 Notcher(6대) 설계 및 내부 DR...)
simulatePaste(allRows.slice(6), 'Case 5: From row 6 (First data row, no headers!)');

// Case 6: Rows 5 to 38 (11Line Notcher with headers)
simulatePaste(allRows.slice(5, 39), 'Case 6: Rows 5 to 38 (11Line Notcher with header)');

// Case 7: Rows 6 to 38 (11Line Notcher without header)
simulatePaste(allRows.slice(6, 39), 'Case 7: Rows 6 to 38 (11Line Notcher without header)');

// Case 8: What if columns to the right are cut off? (e.g. only copied up to col 30 or col 100)
const partialColsRows = allRows.slice(5).map(r => (r || []).slice(0, 50));
simulatePaste(partialColsRows, 'Case 8: Columns partially copied (only up to col 50)');
