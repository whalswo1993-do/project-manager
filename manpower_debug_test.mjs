/**
 * Diagnostic test: reproduces TSV paste of a master schedule
 * and traces how the parser handles manpower sections.
 *
 * Expected:
 *   Notcher → Mechanical:82/3, Vision:88/4, Control:38/1, Electronical:8/1, Safety Manager:30/1, Supervisor:8/1
 *   Stacker → Mechanical:204/6, Vision:86/3, Control:44/1, Electronical:56/4, Safety Manager:57/1, Supervisor:12/1
 */

import { parseExcelMasterPlan } from 'file:///c:/Users/woowon/project-manager/src/masterPlanParser.js';
import * as XLSX from 'file:///c:/Users/woowon/project-manager/node_modules/xlsx/xlsx.mjs';

// Simulate TSV data matching the Excel screenshot structure
// Columns: Line | Equipment | Activity | Start | End | Duration | (gap) | 11-Jul | 14-Jul | 15-Jul | 16-Jul | 17-Jul | 18-Jul
const tsvLines = [
  // Header row
  ["Line", "Equipment", "Activity", "Start", "End", "Duration", "", "11-Jul", "14-Jul", "15-Jul", "16-Jul", "17-Jul", "18-Jul"],
  // Notcher milestones
  ["9", "Notcher (6대)", "검토 완료", "2026-07-06", "2026-07-09", "3", "", "", "", "", "", "", ""],
  ["", "", "고객사 협의회", "2026-07-06", "2026-07-11", "6", "", "", "", "", "", "", ""],
  ["", "", "J/C", "2026-07-06", "2026-07-25", "11", "", "", "", "", "", "", ""],
  ["", "", "조립/배선", "2026-08-01", "2026-09-15", "33", "", "", "", "", "", "", ""],
  // Notcher Manpower (combined header: Manpower + Personnel/Total/Peak on same row)
  ["", "Manpower", "Personnel", "Total", "Peak", "", "", "", "", "", "", "", ""],
  ["", "", "Mechanical", "82", "3", "", "", "2", "2", "2", "2", "3", "3"],
  ["", "", "Vision", "88", "4", "", "", "1", "1", "2", "2", "4", "4"],
  ["", "", "Control", "38", "1", "", "", "1", "1", "1", "1", "1", "1"],
  ["", "", "Electronical", "8", "1", "", "", "0", "0", "0", "1", "1", "0"],
  ["", "", "Safety Manager (소장)", "30", "1", "", "", "1", "1", "1", "1", "1", "1"],
  ["", "", "Supervisor (탈부착)", "8", "1", "", "", "0", "0", "1", "1", "0", "0"],
  ["", "", "Total Manday", "254", "", "", "", "Daily Peak", "5", "5", "7", "8", "10", "9"],
  // Stacker milestones
  ["9", "Stacker (9대)", "검토 완료", "2026-07-06", "2026-07-09", "3", "", "", "", "", "", "", ""],
  ["", "", "J/C", "2026-07-10", "2026-08-10", "20", "", "", "", "", "", "", ""],
  ["", "", "조립/배선", "2026-08-11", "2026-10-15", "50", "", "", "", "", "", "", ""],
  // Stacker Manpower
  ["", "Manpower", "Personnel", "Total", "Peak", "", "", "", "", "", "", "", ""],
  ["", "", "Mechanical", "204", "6", "", "", "3", "4", "5", "5", "6", "6"],
  ["", "", "Vision", "86", "3", "", "", "1", "2", "2", "3", "3", "3"],
  ["", "", "Control", "44", "1", "", "", "1", "1", "1", "1", "1", "1"],
  ["", "", "Electronical", "56", "4", "", "", "2", "2", "3", "4", "4", "3"],
  ["", "", "Safety Manager (소장)", "57", "1", "", "", "1", "1", "1", "1", "1", "1"],
  ["", "", "Supervisor (탈부착)", "12", "1", "", "", "0", "1", "1", "1", "1", "0"],
  ["", "", "Total Manday", "459", "", "", "", "Daily Peak", "8", "11", "12", "15", "16", "14"],
  // Grand Total
  ["", "Grand Total Manpower", "", "", "", "", "", "", "", "", "", "", ""],
  ["", "", "Personnel", "Total", "Peak", "", "", "", "", "", "", "", ""],
  ["", "", "Mechanical", "286", "9", "", "", "5", "6", "7", "7", "9", "9"],
  ["", "", "Total Manday", "685", "", "", "", "Daily Peak", "", "", "", "", ""],
];

// Convert to a workbook
const sheet = XLSX.utils.aoa_to_sheet(tsvLines);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, sheet, "MasterPlan");

const context = {
  formTitle: "SKOH2 9Line E1127 J/C",
  formLine: "9",
  formMfg: "E1127",
  formStartDate: "2026-07-06"
};

console.log("=== BEFORE FIX: Running parseExcelMasterPlan ===\n");

const result = parseExcelMasterPlan(wb, context);

console.log(`\nTotal projects found: ${result.length}\n`);

result.forEach((p, i) => {
  console.log(`--- Project ${i + 1}: ${p.projectName} ---`);
  console.log(`  Equipment: ${p.equipment}`);
  console.log(`  Milestones: ${p.milestones.length}`);
  if (p.manpower) {
    console.log(`  Manpower:`);
    console.log(`    Total M/D: ${p.manpower.totalManday}`);
    console.log(`    Daily Peak: ${p.manpower.dailyPeak}`);
    console.log(`    Departments:`);
    for (const [dept, data] of Object.entries(p.manpower.departments)) {
      console.log(`      ${dept}: total=${data.total}, peak=${data.peak}, dailyDays=${Object.keys(data.daily).length}`);
    }
  } else {
    console.log(`  Manpower: NONE DETECTED ❌`);
  }
  console.log();
});

// Expected results verification
const expectedNotcher = {
  "기구": { total: 82, peak: 3 },
  "비전": { total: 88, peak: 4 },
  "제어": { total: 38, peak: 1 },
  "전장": { total: 8, peak: 1 },
  "소장": { total: 30, peak: 1 },
  "Supervisor": { total: 8, peak: 1 }
};

const expectedStacker = {
  "기구": { total: 204, peak: 6 },
  "비전": { total: 86, peak: 3 },
  "제어": { total: 44, peak: 1 },
  "전장": { total: 56, peak: 4 },
  "소장": { total: 57, peak: 1 },
  "Supervisor": { total: 12, peak: 1 }
};

let hasErrors = false;

function checkProject(projIdx, expected, label) {
  const proj = result[projIdx];
  if (!proj) {
    console.log(`❌ ${label}: Project not found at index ${projIdx}`);
    hasErrors = true;
    return;
  }
  if (!proj.manpower) {
    console.log(`❌ ${label}: No manpower data`);
    hasErrors = true;
    return;
  }
  const depts = proj.manpower.departments;
  for (const [dept, exp] of Object.entries(expected)) {
    if (!depts[dept]) {
      console.log(`❌ ${label} - ${dept}: MISSING`);
      hasErrors = true;
    } else {
      const actual = depts[dept];
      if (actual.total !== exp.total || actual.peak !== exp.peak) {
        console.log(`❌ ${label} - ${dept}: expected total=${exp.total}/peak=${exp.peak}, got total=${actual.total}/peak=${actual.peak}`);
        hasErrors = true;
      } else {
        console.log(`✅ ${label} - ${dept}: total=${actual.total}, peak=${actual.peak}`);
      }
    }
  }
}

console.log("=== VERIFICATION ===\n");
checkProject(0, expectedNotcher, "Notcher");
console.log();
checkProject(1, expectedStacker, "Stacker");

if (hasErrors) {
  console.log("\n⚠️ ERRORS DETECTED - Fix needed!");
  process.exit(1);
} else {
  console.log("\n✅ All values match!");
}
