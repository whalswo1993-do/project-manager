import fs from 'fs';
import XLSX from 'xlsx';
import { parseExcelMasterPlan } from '../src/masterPlanParser.js';

const path = 'C:\\Users\\minja\\OneDrive\\바탕 화면\\SKBM 11, 13 Line E1111, E2222 JC.xlsx';
const buf = fs.readFileSync(path);
const wb = XLSX.read(buf, { cellDates: false, cellStyles: true });

console.log('--- parseExcelMasterPlan result from FILE ---');
const fileProjects = parseExcelMasterPlan(wb, {});
console.log(`Found ${fileProjects.length} projects:`);
fileProjects.forEach((p, idx) => {
  console.log(`Project ${idx+1}: projectName="${p.projectName}", site="${p.site}", line="${p.line}", mfg="${p.manufacturingNo}", dates=${p.startDate}~${p.endDate}, milestones=${p.milestones?.length}`);
  console.log('  totalManday:', p.manpower?.totalManday);
  console.log('  byDepartment:', JSON.stringify(p.manpower?.byDepartment));
  console.log('  dailyTotal dates count:', Object.keys(p.manpower?.dailyTotal || {}).length);
  console.log('  daily sample:', Object.entries(p.manpower?.dailyTotal || {}).slice(0, 5));
});
