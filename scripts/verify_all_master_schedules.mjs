import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { parseExcelMasterPlan, parseTSVWithQuotes } from '../src/masterPlanParser.js';

const desktop = 'C:\\Users\\minja\\OneDrive\\바탕 화면';
const testFiles = [
  'SKBM 11, 13 Line E1111, E2222 JC.xlsx',
  'SKOY NC, ST 10,12Line E1144,E1540 JC Master Schedule v12.xlsx',
  'SKOJ H055 J.C Master Schedule (송부용 보안해제).xlsx',
  'SKOH2 9Line E1127JC Master Schedule (공수 정합화 반영 NC+ ST) v5 (고객사 송부용 최종).xlsx'
];

function serializeToExcelClipboardTSV(rows) {
  return rows.map(row => {
    return (row || []).map(cell => {
      if (cell == null) return '';
      const str = String(cell);
      if (str.includes('\t') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join('\t');
  }).join('\r\n');
}

let allTestsPassed = true;

for (const fileName of testFiles) {
  const fPath = path.join(desktop, fileName);
  if (!fs.existsSync(fPath)) {
    console.log(`[SKIP] File not found: ${fileName}`);
    continue;
  }
  console.log(`\n======================================================`);
  console.log(`Testing File: ${fileName}`);
  console.log(`======================================================`);

  const buf = fs.readFileSync(fPath);
  const fileWb = XLSX.read(buf, { cellDates: false, cellStyles: true });
  const fileProjects = parseExcelMasterPlan(fileWb, {});

  let targetSheetName = fileWb.SheetNames.find(n => /planning|schedule|master|일정/i.test(n)) || fileWb.SheetNames[0];
  const ws = fileWb.Sheets[targetSheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
  
  // Real Excel compliant clipboard TSV serialization
  const tsvText = serializeToExcelClipboardTSV(rows);

  const lines = parseTSVWithQuotes(tsvText);
  const pasteWs = XLSX.utils.aoa_to_sheet(lines);
  const pasteWb = { SheetNames: ['Sheet1'], Sheets: { Sheet1: pasteWs } };
  const pasteProjects = parseExcelMasterPlan(pasteWb, {});

  console.log(`File extracted: ${fileProjects.length} projects`);
  console.log(`Paste extracted: ${pasteProjects.length} projects`);

  if (fileProjects.length !== pasteProjects.length || fileProjects.length === 0) {
    console.error(`❌ Project count mismatch! (File: ${fileProjects.length}, Paste: ${pasteProjects.length})`);
    allTestsPassed = false;
    continue;
  }

  let fileMatch = true;
  fileProjects.forEach((fp, idx) => {
    const pp = pasteProjects[idx];
    const msCountMatch = fp.milestones?.length === pp.milestones?.length;
    const mandayMatch = fp.manpower?.totalManday === pp.manpower?.totalManday;
    const deptMatch = JSON.stringify(fp.manpower?.byDepartment) === JSON.stringify(pp.manpower?.byDepartment);
    const dailyCountMatch = Object.keys(fp.manpower?.dailyTotal || {}).length === Object.keys(pp.manpower?.dailyTotal || {}).length;

    console.log(`  P${idx+1}: "${fp.projectName}"`);
    console.log(`     Milestones: ${fp.milestones?.length} vs ${pp.milestones?.length} (${msCountMatch ? 'OK' : 'FAIL'})`);
    console.log(`     Total Manday: ${fp.manpower?.totalManday} vs ${pp.manpower?.totalManday} (${mandayMatch ? 'OK' : 'FAIL'})`);
    console.log(`     Depts: ${deptMatch ? 'OK' : 'FAIL'}`);
    console.log(`     Daily Count: ${Object.keys(fp.manpower?.dailyTotal || {}).length} vs ${Object.keys(pp.manpower?.dailyTotal || {}).length} (${dailyCountMatch ? 'OK' : 'FAIL'})`);

    if (!msCountMatch || !mandayMatch || !deptMatch || !dailyCountMatch) {
      fileMatch = false;
      allTestsPassed = false;
    }
  });

  console.log(`Result for ${fileName}: ${fileMatch ? '✅ 100% PERFECT MATCH' : '❌ MISMATCH'}`);
}

console.log(`\n======================================================`);
console.log(`FINAL RESULT ACROSS ALL 4 FILES: ${allTestsPassed ? '🎉 ALL 4 FILES 100% PASSED!' : '❌ SOME TESTS FAILED'}`);
console.log(`======================================================`);
