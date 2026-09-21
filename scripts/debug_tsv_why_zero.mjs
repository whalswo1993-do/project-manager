import fs from 'fs';
import XLSX from 'xlsx';
import { excelDateToISO } from '../src/masterPlanParser.js';

const path = 'C:\\Users\\minja\\OneDrive\\바탕 화면\\SKBM 11, 13 Line E1111, E2222 JC.xlsx';
const buf = fs.readFileSync(path);
const wb = XLSX.read(buf, { cellDates: false, cellStyles: true });
const ws = wb.Sheets['Planning'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

const wsSlice = XLSX.utils.aoa_to_sheet(rows);
const tsv = XLSX.utils.sheet_to_txt(wsSlice);

const lines = tsv.split('\n').map(l => l.split('\t'));
const ws2 = XLSX.utils.aoa_to_sheet(lines);
const wb2 = { SheetNames: ['Sheet1'], Sheets: { Sheet1: ws2 } };

console.log('ws2 ref:', ws2['!ref']);
const rows2 = XLSX.utils.sheet_to_json(ws2, { header: 1, raw: true });
console.log('Total rows2:', rows2.length);

for (let r = 0; r < Math.min(10, rows2.length); r++) {
  console.log(`Row ${r}:`, rows2[r].slice(0, 10));
}

// Let's trace why parseExcelMasterPlan failed on wb2
import { parseExcelMasterPlan } from '../src/masterPlanParser.js';
const res = parseExcelMasterPlan(wb2, {});
console.log('Final res:', res);
