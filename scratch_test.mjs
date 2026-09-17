// Test: simulate exactly what App.jsx does with TSV paste data
import * as XLSX from 'xlsx';
import { parseTSVWithQuotes, parseExcelMasterPlan } from './src/masterPlanParser.js';

// User's ground truth for SKOH2 9Line E1127 J/C Notcher:
// 2026-07-06: SV=1, 소장=1 => 2명
// 2026-07-07: 기구=2, 소장=1 => 3명
// 2026-07-08: 기구=2, 소장=1 => 3명
// 2026-07-09: 기구=2, 소장=1 => 3명
// 2026-07-10: 기구=2, 전장=2, 소장=1 => 5명
// 2026-07-11: 기구=2, 전장=2, 소장=1 => 5명
// ...no data on weekends where excel is blank...

// Simulate a minimal TSV that mimics the actual Excel structure
// The Excel has: daily date headers in one row, and manpower data below
// When copied from Excel, each column = 1 day

// Build a TSV with date headers for every day from 2026-06-28 to 2026-09-01
const startDate = new Date('2026-06-28');
const endDate = new Date('2026-09-01');
const dateHeaders = [];
for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
  const day = d.getDate();
  const mon = d.toLocaleString('en', { month: 'short' });
  const yr = String(d.getFullYear()).slice(2);
  dateHeaders.push(`${String(day).padStart(2,'0')}-${mon}-${yr}`);
}

// Create the TSV
const headerRow = ['', '', '', '', '', '', ...dateHeaders];

const colRow = ['Line', 'Equipment', 'Activity', 'Start', 'End', 'Duration', ...dateHeaders.map(() => '')];

const eqRow = ['9', 'Notcher (6대)', '고객사 DR', '02월 20일', '03월 05일', '14', ...dateHeaders.map(() => '')];

const mpHeaderRow = ['', '', 'Manpower', 'Personnel', 'Total', 'Peak', ...dateHeaders.map(() => '')];

// Build mechanical row: 기구 total=82, peak=3
// Ground truth: 07-07~07-09: 2, 07-10~07-12: 2, 07-12: 3, 07-13~07-15: 3, 07-16~08-02: 3, 08-03~08-09: 2, 08-10~08-19: 2, 08-20: 1
// Let's use a simplified version to test column alignment
const mechDaily = {};
mechDaily['2026-07-07'] = 2; mechDaily['2026-07-08'] = 2; mechDaily['2026-07-09'] = 2;
mechDaily['2026-07-10'] = 2; mechDaily['2026-07-11'] = 2;
mechDaily['2026-07-12'] = 3;
mechDaily['2026-07-13'] = 3; mechDaily['2026-07-14'] = 3; mechDaily['2026-07-15'] = 3;
mechDaily['2026-07-16'] = 3; mechDaily['2026-07-17'] = 3; mechDaily['2026-07-18'] = 3;
mechDaily['2026-07-19'] = 3; mechDaily['2026-07-20'] = 3; mechDaily['2026-07-21'] = 3;
mechDaily['2026-07-22'] = 3; mechDaily['2026-07-23'] = 3; mechDaily['2026-07-24'] = 3;
mechDaily['2026-07-25'] = 3; mechDaily['2026-07-26'] = 3;
mechDaily['2026-07-27'] = 2; mechDaily['2026-07-28'] = 2; mechDaily['2026-07-29'] = 2;
mechDaily['2026-07-30'] = 2; mechDaily['2026-07-31'] = 2;
mechDaily['2026-08-01'] = 2; mechDaily['2026-08-02'] = 2;
mechDaily['2026-08-03'] = 2; mechDaily['2026-08-04'] = 2; mechDaily['2026-08-05'] = 2;
mechDaily['2026-08-06'] = 2; mechDaily['2026-08-07'] = 2; mechDaily['2026-08-08'] = 2;
mechDaily['2026-08-09'] = 2;
mechDaily['2026-08-10'] = 2; mechDaily['2026-08-11'] = 1; mechDaily['2026-08-12'] = 1;
mechDaily['2026-08-13'] = 1; mechDaily['2026-08-14'] = 1; mechDaily['2026-08-15'] = 1;
mechDaily['2026-08-16'] = 1; mechDaily['2026-08-17'] = 1; mechDaily['2026-08-18'] = 1;
mechDaily['2026-08-19'] = 1; mechDaily['2026-08-20'] = 1;

const mechVals = dateHeaders.map((_, i) => {
  const d = new Date(startDate);
  d.setDate(d.getDate() + i);
  const iso = d.toISOString().slice(0, 10);
  return mechDaily[iso] || '';
});
const mechRow = ['', '', '', 'Mechanical', '82', '3', ...mechVals];

// Build TSV string
const allRows = [
  'Project Name : SKOH2 9Line E1127 J/C',
  headerRow.join('\t'),
  colRow.join('\t'),
  eqRow.join('\t'),
  mpHeaderRow.join('\t'),
  mechRow.join('\t')
];
const tsvText = allRows.join('\n');

// Now run through the same flow as App.jsx
const lines = parseTSVWithQuotes(tsvText);
console.log('TSV parsed rows:', lines.length);
console.log('Row lengths:', lines.map(r => r.length));

const ws = XLSX.utils.aoa_to_sheet(lines);
const wb = { SheetNames: ['Sheet1'], Sheets: { Sheet1: ws } };

const result = parseExcelMasterPlan(wb, {});
console.log('\nProjects found:', result.length);

if (result.length > 0) {
  const p = result[0];
  console.log('Equipment:', p.equipment);
  console.log('Manpower:', JSON.stringify(p.manpower?.departments?.['기구'], null, 2));
  
  if (p.manpower?.departments?.['기구']?.daily) {
    const daily = p.manpower.departments['기구'].daily;
    console.log('\n=== 기구 Daily Timeline ===');
    const dates = Object.keys(daily).sort();
    dates.forEach(d => {
      const expected = mechDaily[d] || 0;
      const actual = daily[d];
      const match = expected === actual ? '✅' : `❌ (expected ${expected})`;
      console.log(`  ${d}: ${actual} ${match}`);
    });
    
    // Check for dates that should have data but don't
    console.log('\n=== Missing dates ===');
    Object.keys(mechDaily).sort().forEach(d => {
      if (!daily[d]) {
        console.log(`  ❌ MISSING: ${d} should have ${mechDaily[d]}`);
      }
    });
  }
}
