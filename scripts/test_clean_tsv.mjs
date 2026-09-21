import fs from 'fs';
import XLSX from 'xlsx';
import { parseExcelMasterPlan } from '../src/masterPlanParser.js';

const path = 'C:\\Users\\minja\\OneDrive\\바탕 화면\\SKBM 11, 13 Line E1111, E2222 JC.xlsx';
const buf = fs.readFileSync(path);
const wb = XLSX.read(buf, { cellDates: false, cellStyles: true });
const ws = wb.Sheets['Planning'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

function rowsToCleanTsv(rList) {
  return rList.map(row => (row || []).map(cell => cell == null ? '' : String(cell)).join('\t')).join('\n');
}

function testCleanTsv(rList, label) {
  console.log(`\n=== Testing Clean TSV: [${label}] ===`);
  const tsv = rowsToCleanTsv(rList);
  const lines = tsv.split('\n').map(l => l.split('\t'));
  const ws2 = XLSX.utils.aoa_to_sheet(lines);
  const wb2 = { SheetNames: ['Sheet1'], Sheets: { Sheet1: ws2 } };
  const projs = parseExcelMasterPlan(wb2, {});
  console.log('Result count:', projs ? projs.length : 0);
  if (projs && projs.length > 0) {
    projs.forEach((p, idx) => {
      console.log(`  P${idx+1}: ${p.projectName} | Manday: ${p.manpower?.totalManday} | ByDept: ${JSON.stringify(p.manpower?.byDepartment || {})} | Milestones: ${p.milestones?.length} | DailyCount: ${Object.keys(p.manpower?.dailyTotal || {}).length}`);
      if (p.milestones?.length > 0) {
        console.log(`     Sample ms:`, p.milestones[0], p.milestones[p.milestones.length - 1]);
      }
    });
  }
}

testCleanTsv(rows, 'Full rows');
testCleanTsv(rows.slice(5), 'Rows from 5');
testCleanTsv(rows.slice(6, 38), '11Line Notcher only (rows 6 to 37)');
testCleanTsv(rows.slice(39, 72), '11Line Stacker only (rows 39 to 71)');
