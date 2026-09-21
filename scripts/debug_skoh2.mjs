import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { parseExcelMasterPlan, parseTSVWithQuotes } from '../src/masterPlanParser.js';

const desktop = 'C:\\Users\\minja\\OneDrive\\바탕 화면';
const fileName = 'SKOH2 9Line E1127JC Master Schedule (공수 정합화 반영 NC+ ST) v5 (고객사 송부용 최종).xlsx';
const fPath = path.join(desktop, fileName);

const buf = fs.readFileSync(fPath);
const fileWb = XLSX.read(buf, { cellDates: false, cellStyles: true });
console.log('Sheet names in SKOH2:', fileWb.SheetNames);

const fileProjects = parseExcelMasterPlan(fileWb, {});
console.log('File projects:');
fileProjects.forEach(p => console.log('  ', p.projectName, p.sheetName, 'milestones:', p.milestones?.length, 'manday:', p.manpower?.totalManday));

let targetSheetName = fileWb.SheetNames.find(n => /planning|schedule|master|일정/i.test(n)) || fileWb.SheetNames[0];
console.log('targetSheetName chosen in test:', targetSheetName);

for (const sn of fileWb.SheetNames) {
  const ws = fileWb.Sheets[sn];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
  console.log(`Sheet "${sn}": ${rows.length} rows`);
}
