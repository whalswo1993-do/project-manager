import fs from 'fs';
import XLSX from 'xlsx';
import { parseExcelMasterPlan, parseTSVWithQuotes } from '../src/masterPlanParser.js';

const text = fs.readFileSync('scripts/clipboard_text.txt', 'utf8');
const html = fs.readFileSync('scripts/clipboard_html.txt', 'utf8');

console.log('Real Clipboard Text length:', text.length);
console.log('Real Clipboard HTML length:', html.length);
console.log('First 500 chars of Text:\n', text.slice(0, 500));
console.log('First 500 chars of HTML:\n', html.slice(0, 500));

// 1. Try HTML table
console.log('\n--- 1. Testing Real HTML Clipboard with XLSX.read ---');
try {
  const htmlWb = XLSX.read(html, { type: 'string' });
  console.log('Sheet names:', htmlWb.SheetNames);
  const projs = parseExcelMasterPlan(htmlWb, {});
  console.log('Projects from HTML:', projs ? projs.length : 0);
  if (projs && projs.length > 0) {
    projs.forEach((p, i) => {
      console.log(`  P${i+1}: ${p.projectName} | Manday: ${p.manpower?.totalManday} | ByDept: ${JSON.stringify(p.manpower?.byDepartment || {})} | Milestones: ${p.milestones?.length} | DailyCount: ${Object.keys(p.manpower?.dailyTotal || {}).length}`);
    });
  }
} catch (e) {
  console.error('HTML parse threw error:', e);
}

// 2. Try TSV text
console.log('\n--- 2. Testing Real TSV Clipboard ---');
try {
  const lines = parseTSVWithQuotes(text);
  console.log('TSV parsed lines:', lines.length);
  const ws = XLSX.utils.aoa_to_sheet(lines);
  const wb = { SheetNames: ['Sheet1'], Sheets: { Sheet1: ws } };
  const projs = parseExcelMasterPlan(wb, {});
  console.log('Projects from TSV:', projs ? projs.length : 0);
  if (projs && projs.length > 0) {
    projs.forEach((p, i) => {
      console.log(`  P${i+1}: ${p.projectName} | Manday: ${p.manpower?.totalManday} | ByDept: ${JSON.stringify(p.manpower?.byDepartment || {})} | Milestones: ${p.milestones?.length} | DailyCount: ${Object.keys(p.manpower?.dailyTotal || {}).length}`);
    });
  }
} catch (e) {
  console.error('TSV parse threw error:', e);
}
