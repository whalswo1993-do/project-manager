import fs from 'fs';
import XLSX from 'xlsx';
import { parseExcelMasterPlan } from '../src/masterPlanParser.js';

const rawHtml = fs.readFileSync('scripts/real_excel_html.html', 'utf8');

// Strip CF_HTML header to get clean HTML (like browser e.clipboardData.getData('text/html') does)
const startIdx = rawHtml.indexOf('<html');
const cleanHtml = startIdx !== -1 ? rawHtml.slice(startIdx) : rawHtml;

console.log('Clean HTML length:', cleanHtml.length);
console.log('Clean HTML starts with:', cleanHtml.slice(0, 100));

console.time('XLSX.read clean HTML');
const htmlWb = XLSX.read(cleanHtml, { type: 'string' });
console.timeEnd('XLSX.read clean HTML');

console.log('Sheet names:', htmlWb.SheetNames);
const sheet = htmlWb.Sheets[htmlWb.SheetNames[0]];
console.log('Sheet ref:', sheet['!ref']);

const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
console.log('Total rows in clean HTML sheet:', rows.length);
console.log('Row 0:', rows[0]?.slice(0, 10));
console.log('Row 1:', rows[1]?.slice(0, 10));
console.log('Row 5:', rows[5]?.slice(0, 10));
console.log('Row 6:', rows[6]?.slice(0, 10));
console.log('Row 26:', rows[26]?.slice(0, 10));
console.log('Row 27:', rows[27]?.slice(0, 10));

const projs = parseExcelMasterPlan(htmlWb, {});
console.log('\nparseExcelMasterPlan result from clean HTML:');
console.log('Projects count:', projs ? projs.length : 0);
if (projs && projs.length > 0) {
  projs.forEach((p, i) => {
    const dailyCount = Object.keys(p.manpower?.dailyTotal || {}).length;
    console.log(`  P${i+1}: ${p.projectName} | Manday: ${p.manpower?.totalManday} | ByDept: ${JSON.stringify(p.manpower?.byDepartment || {})} | Milestones: ${p.milestones?.length} | DailyCount: ${dailyCount}`);
  });
}
