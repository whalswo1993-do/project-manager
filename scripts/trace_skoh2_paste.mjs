import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { parseExcelMasterPlan, parseTSVWithQuotes } from '../src/masterPlanParser.js';

const desktop = 'C:\\Users\\minja\\OneDrive\\바탕 화면';
const fileName = 'SKOH2 9Line E1127JC Master Schedule (공수 정합화 반영 NC+ ST) v5 (고객사 송부용 최종).xlsx';
const fPath = path.join(desktop, fileName);

const buf = fs.readFileSync(fPath);
const fileWb = XLSX.read(buf, { cellDates: false, cellStyles: true });
const ws = fileWb.Sheets['Planning'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

const tsvText = rows.map(r => (r || []).map(c => c == null ? '' : String(c)).join('\t')).join('\r\n');
const lines = parseTSVWithQuotes(tsvText);
const pasteWs = XLSX.utils.aoa_to_sheet(lines);
const pasteWb = { SheetNames: ['Sheet1'], Sheets: { Sheet1: pasteWs } };
const pasteProjects = parseExcelMasterPlan(pasteWb, {});

console.log('Paste projects count:', pasteProjects.length);
pasteProjects.forEach((p, i) => {
  console.log(`  P${i+1}: "${p.projectName}" | Eq: "${p.equipment}" | Milestones: ${p.milestones?.length} | Manday: ${p.manpower?.totalManday}`);
});
