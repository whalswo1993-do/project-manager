import fs from 'fs';
import XLSX from 'xlsx';
import { parseExcelMasterPlan } from '../src/masterPlanParser.js';

const html = fs.readFileSync('scripts/real_excel_html.html', 'utf8');
console.log('HTML size:', html.length);

console.time('XLSX.read real html');
const htmlWb = XLSX.read(html, { type: 'string' });
console.timeEnd('XLSX.read real html');

console.log('Sheet names:', htmlWb.SheetNames);
const sheet = htmlWb.Sheets[htmlWb.SheetNames[0]];
console.log('Sheet ref:', sheet['!ref']);

const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
console.log('Total rows parsed from real HTML:', rows.length);
for (let r = 0; r < Math.min(15, rows.length); r++) {
  const row = rows[r] || [];
  const nonNull = row.map((v, c) => v != null && v !== '' ? `[c${c}]:${v}` : null).filter(Boolean);
  console.log(`Row ${r}:`, nonNull.slice(0, 10).join(', '));
}

console.log('\n--- parseExcelMasterPlan with real HTML ---');
const projects = parseExcelMasterPlan(htmlWb, {});
console.log('Projects count:', projects ? projects.length : 0);
if (projects && projects.length > 0) {
  projects.forEach((p, i) => {
    const dailyCount = Object.keys(p.manpower?.dailyTotal || {}).length;
    console.log(`  P${i+1}: ${p.projectName} | Manday: ${p.manpower?.totalManday} | ByDept: ${JSON.stringify(p.manpower?.byDepartment || {})} | Milestones: ${p.milestones?.length} | DailyCount: ${dailyCount}`);
    if (p.milestones?.length > 0) {
      console.log('    Sample milestone:', p.milestones[0]);
    }
    if (dailyCount > 0) {
      console.log('    Sample daily:', Object.entries(p.manpower.dailyTotal).slice(0, 3));
    }
  });
}
