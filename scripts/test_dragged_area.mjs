import fs from 'fs';
import XLSX from 'xlsx';
import { parseExcelMasterPlan, parseTSVWithQuotes } from '../src/masterPlanParser.js';

const rawHtml = fs.readFileSync('scripts/dragged_html.html', 'utf8');
const text = fs.readFileSync('scripts/dragged_text.txt', 'utf8');

const startIdx = rawHtml.indexOf('<html');
const html = startIdx !== -1 ? rawHtml.slice(startIdx) : rawHtml;

console.log('--- 1. Testing HTML from Dragged Area ---');
try {
  const htmlWb = XLSX.read(html, { type: 'string' });
  console.log('Sheet names:', htmlWb.SheetNames);
  const projs = parseExcelMasterPlan(htmlWb, {});
  console.log('Projects from HTML:', projs ? projs.length : 0);
  if (projs && projs.length > 0) {
    projs.forEach((p, i) => {
      const dailyCount = Object.keys(p.manpower?.dailyTotal || {}).length;
      console.log(`  P${i+1} [HTML]: ${p.projectName} | Manday: ${p.manpower?.totalManday} | ByDept: ${JSON.stringify(p.manpower?.byDepartment || {})} | Milestones: ${p.milestones?.length} | DailyCount: ${dailyCount}`);
    });
  }
} catch (e) {
  console.error('HTML parse error:', e);
}

console.log('\n--- 2. Testing TSV from Dragged Area ---');
try {
  const lines = parseTSVWithQuotes(text);
  console.log('TSV lines:', lines.length, 'Cols in line 0:', lines[0]?.length);
  const ws = XLSX.utils.aoa_to_sheet(lines);
  const wb = { SheetNames: ['Sheet1'], Sheets: { Sheet1: ws } };
  const projs = parseExcelMasterPlan(wb, {});
  console.log('Projects from TSV:', projs ? projs.length : 0);
  if (projs && projs.length > 0) {
    projs.forEach((p, i) => {
      const dailyCount = Object.keys(p.manpower?.dailyTotal || {}).length;
      console.log(`  P${i+1} [TSV]: ${p.projectName} | Manday: ${p.manpower?.totalManday} | ByDept: ${JSON.stringify(p.manpower?.byDepartment || {})} | Milestones: ${p.milestones?.length} | DailyCount: ${dailyCount}`);
    });
  }
} catch (e) {
  console.error('TSV parse error:', e);
}
