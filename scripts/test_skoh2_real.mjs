import fs from 'fs';
import XLSX from 'xlsx';
import { parseExcelMasterPlan, parseTSVWithQuotes } from '../src/masterPlanParser.js';

const text = fs.readFileSync('scripts/skoh2_clipboard_text.txt', 'utf8');
const lines = parseTSVWithQuotes(text);
console.log('Lines count:', lines.length);

const ws = XLSX.utils.aoa_to_sheet(lines);
const wb = { SheetNames: ['Sheet1'], Sheets: { Sheet1: ws } };
const projs = parseExcelMasterPlan(wb, {});

console.log('SKOH2 Real Clipboard Projects count:', projs.length);
projs.forEach((p, i) => {
  console.log(`P${i+1}: ${p.projectName} | Eq: ${p.equipment} | Manday: ${p.manpower?.totalManday} | Milestones: ${p.milestones?.length}`);
});
