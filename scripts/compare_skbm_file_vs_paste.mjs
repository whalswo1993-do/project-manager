import fs from 'fs';
import XLSX from 'xlsx';
import { parseExcelMasterPlan, parseTSVWithQuotes } from '../src/masterPlanParser.js';

// 1. Load File directly (Ground Truth)
const filePath = 'C:\\Users\\minja\\OneDrive\\바탕 화면\\SKBM 11, 13 Line E1111, E2222 JC.xlsx';
const buf = fs.readFileSync(filePath);
const fileWb = XLSX.read(buf, { cellDates: false, cellStyles: true });
const fileProjects = parseExcelMasterPlan(fileWb, {});

// 2. Load Real Excel Clipboard Text (Dumped from actual Windows Clipboard)
const realTsv = fs.readFileSync('scripts/clipboard_text.txt', 'utf8');
const lines = parseTSVWithQuotes(realTsv);
const ws = XLSX.utils.aoa_to_sheet(lines);
const pasteWb = { SheetNames: ['Sheet1'], Sheets: { Sheet1: ws } };
const pasteProjects = parseExcelMasterPlan(pasteWb, {});

console.log(`=== GROUND TRUTH (FILE): ${fileProjects.length} projects ===`);
fileProjects.forEach((p, i) => {
  console.log(`File P${i+1}: "${p.projectName}" | Site: ${p.site} | Line: ${p.line} | Mfg: ${p.manufacturingNo}`);
  console.log(`  Manday: ${p.manpower?.totalManday}, DailyCount: ${Object.keys(p.manpower?.dailyTotal || {}).length}, Milestones: ${p.milestones?.length}`);
  console.log(`  Depts:`, JSON.stringify(p.manpower?.byDepartment));
});

console.log(`\n=== PASTE FROM REAL CLIPBOARD: ${pasteProjects.length} projects ===`);
pasteProjects.forEach((p, i) => {
  console.log(`Paste P${i+1}: "${p.projectName}" | Site: ${p.site} | Line: ${p.line} | Mfg: ${p.manufacturingNo}`);
  console.log(`  Manday: ${p.manpower?.totalManday}, DailyCount: ${Object.keys(p.manpower?.dailyTotal || {}).length}, Milestones: ${p.milestones?.length}`);
  console.log(`  Depts:`, JSON.stringify(p.manpower?.byDepartment));
});

// Compare 1-to-1
console.log('\n=== 1:1 COMPARISON ===');
let allMatch = true;
fileProjects.forEach((fp, i) => {
  const pp = pasteProjects[i];
  if (!pp) {
    console.error(`P${i+1}: Missing in paste!`);
    allMatch = false;
    return;
  }
  const msCountMatch = fp.milestones?.length === pp.milestones?.length;
  const mandayMatch = fp.manpower?.totalManday === pp.manpower?.totalManday;
  const deptMatch = JSON.stringify(fp.manpower?.byDepartment) === JSON.stringify(pp.manpower?.byDepartment);
  const dailyTotalMatch = JSON.stringify(fp.manpower?.dailyTotal) === JSON.stringify(pp.manpower?.dailyTotal);

  console.log(`Project ${i+1}:`);
  console.log(`  Name Match: ${fp.projectName === pp.projectName} (${fp.projectName} vs ${pp.projectName})`);
  console.log(`  Milestone Count Match: ${msCountMatch} (${fp.milestones?.length} vs ${pp.milestones?.length})`);
  console.log(`  Total Manday Match: ${mandayMatch} (${fp.manpower?.totalManday} vs ${pp.manpower?.totalManday})`);
  console.log(`  Department Breakdown Match: ${deptMatch}`);
  console.log(`  Daily Manpower Match: ${dailyTotalMatch}`);

  if (!msCountMatch || !mandayMatch || !deptMatch || !dailyTotalMatch) allMatch = false;
});

console.log(`\nOVERALL MATCH RESULT: ${allMatch ? 'PERFECT 100% MATCH!' : 'MISMATCH FOUND!'}`);
