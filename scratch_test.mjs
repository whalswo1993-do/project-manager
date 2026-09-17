// Test: simulate the actual Excel layout where Peak column is at the same position as the first date header
// This causes a 1-column offset between dates and data
import * as XLSX from 'xlsx';
import { parseTSVWithQuotes, parseExcelMasterPlan } from './src/masterPlanParser.js';

// Simulate the actual Excel structure:
// Header row: Line | Equipment | Activity | Start | End | Duration | date1 | date2 | ...
// Manpower:   (blank) | (blank) | (blank) | Manpower | Personnel | Total | Peak | daily1 | daily2 | ...
// Department: (blank) | (blank) | (blank) | (blank) | Mechanical | 82 | 3 | 2 | 2 | ...
//
// Note: dates start at col 6, but Peak is at col 6 too, so data starts at col 7.
// This means there's a 1-column mismatch.

const startDate = new Date('2026-06-28');
const endDate = new Date('2026-09-01');
const dateHeaders = [];
for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
  const day = String(d.getDate()).padStart(2, '0');
  const mon = d.toLocaleString('en', { month: 'short' });
  const yr = String(d.getFullYear()).slice(2);
  dateHeaders.push(`${day}-${mon}-${yr}`);
}

// Ground truth: 기구 starts on July 15
const mechDaily = {};
// Jul 7-9: 2
for (let d = 7; d <= 9; d++) mechDaily[`2026-07-${String(d).padStart(2,'0')}`] = 2;
// Jul 10-11: 2
mechDaily['2026-07-10'] = 2; mechDaily['2026-07-11'] = 2;
// Jul 12: 3
mechDaily['2026-07-12'] = 3;
// Jul 13-19: 3
for (let d = 13; d <= 19; d++) mechDaily[`2026-07-${String(d).padStart(2,'0')}`] = 3;
// Jul 20-26: 3
for (let d = 20; d <= 26; d++) mechDaily[`2026-07-${String(d).padStart(2,'0')}`] = 3;
// Jul 27-31: 2
for (let d = 27; d <= 31; d++) mechDaily[`2026-07-${String(d).padStart(2,'0')}`] = 2;
// Aug 1: 2
mechDaily['2026-08-01'] = 2;
// Aug 2: NO DATA (weekend/break)
// Aug 3-10: 2
for (let d = 3; d <= 10; d++) mechDaily[`2026-08-${String(d).padStart(2,'0')}`] = 2;

// Layout A: dates and data aligned (Peak at col 5, data at col 6, dates at col 6)
console.log("=== Layout A: Peak at col 5, dates at col 6, data at col 6 (aligned) ===");
{
  const headerRow = ['Line', 'Equipment', 'Activity', 'Start', 'End', '', ...dateHeaders];
  const eqRow = ['9', 'Notcher (6대)', '고객사 DR', '02월 20일', '03월 05일', '14', ...dateHeaders.map(() => '')];
  // Manpower header: Peak at col 5
  const mpRow = ['', '', 'Manpower', 'Personnel', 'Total', 'Peak', ...dateHeaders.map(() => '')];
  // Data starts at col 6 (same as dates)
  const mechVals = dateHeaders.map((_, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    return mechDaily[iso] || '';
  });
  const mechRow = ['', '', '', 'Mechanical', '82', '3', ...mechVals];
  
  const tsvText = [
    'Project Name : SKOH2 9Line E1127 J/C',
    headerRow.join('\t'),
    ['Line', 'Equipment', 'Activity', 'Start', 'End', 'Duration', ...dateHeaders.map(() => '')].join('\t'),
    eqRow.join('\t'),
    mpRow.join('\t'),
    mechRow.join('\t')
  ].join('\n');
  
  const lines = parseTSVWithQuotes(tsvText);
  const ws = XLSX.utils.aoa_to_sheet(lines);
  const wb = { SheetNames: ['Sheet1'], Sheets: { Sheet1: ws } };
  const result = parseExcelMasterPlan(wb, {});
  
  if (result.length > 0 && result[0].manpower?.departments?.['기구']) {
    const daily = result[0].manpower.departments['기구'].daily;
    // Check Jul 15 specifically
    console.log('  Jul 15:', daily['2026-07-15'] || 'MISSING');
    console.log('  Jul 16:', daily['2026-07-16'] || 'MISSING');
    console.log('  Aug 2:', daily['2026-08-02'] || 'no data (correct if empty)');
    console.log('  Aug 1:', daily['2026-08-01'] || 'no data');
  }
}

// Layout B: dates at col 6, Peak at col 6, data at col 7 (off by 1)
console.log("\n=== Layout B: Peak at col 6, dates at col 6, data at col 7 (off by 1) ===");
{
  const headerRow = ['Line', 'Equipment', 'Activity', 'Start', 'End', 'Duration', ...dateHeaders];
  const eqRow = ['9', 'Notcher (6대)', '고객사 DR', '02월 20일', '03월 05일', '14', ...dateHeaders.map(() => '')];
  // Manpower header: Personnel at col 3, Total at col 4... but shifted right by 1 so Peak at col 6
  const mpRow = ['', '', '', 'Manpower', 'Personnel', 'Total', 'Peak', ...dateHeaders.map(() => '')];
  // Data starts at col 7 (1 after Peak at col 6)
  const mechVals = dateHeaders.map((_, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    return mechDaily[iso] || '';
  });
  const mechRow = ['', '', '', '', 'Mechanical', '82', '3', ...mechVals];
  
  const tsvText = [
    'Project Name : SKOH2 9Line E1127 J/C',
    headerRow.join('\t'),
    ['Line', 'Equipment', 'Activity', 'Start', 'End', 'Duration', ...dateHeaders.map(() => '')].join('\t'),
    eqRow.join('\t'),
    mpRow.join('\t'),
    mechRow.join('\t')
  ].join('\n');
  
  const lines = parseTSVWithQuotes(tsvText);
  const ws = XLSX.utils.aoa_to_sheet(lines);
  const wb = { SheetNames: ['Sheet1'], Sheets: { Sheet1: ws } };
  const result = parseExcelMasterPlan(wb, {});
  
  if (result.length > 0 && result[0].manpower?.departments?.['기구']) {
    const daily = result[0].manpower.departments['기구'].daily;
    console.log('  Jul 15:', daily['2026-07-15'] || 'MISSING');
    console.log('  Jul 16:', daily['2026-07-16'] || 'MISSING');
    console.log('  Aug 2:', daily['2026-08-02'] || 'no data (correct if empty)');
    console.log('  Aug 1:', daily['2026-08-01'] || 'no data');
    
    // Full validation
    console.log('\n  --- Full Validation ---');
    let errors = 0;
    Object.keys(mechDaily).sort().forEach(date => {
      const expected = mechDaily[date];
      const actual = daily[date] || 0;
      if (expected !== actual) {
        console.log(`  ❌ ${date}: expected ${expected}, got ${actual}`);
        errors++;
      }
    });
    // Check for phantom dates
    Object.keys(daily).sort().forEach(date => {
      if (!mechDaily[date]) {
        console.log(`  ❌ PHANTOM: ${date} has value ${daily[date]} but should be empty`);
        errors++;
      }
    });
    if (errors === 0) console.log('  ✅ All dates match perfectly!');
    else console.log(`  Total errors: ${errors}`);
  } else {
    console.log('  ❌ No mechanical data found');
    if (result.length > 0) {
      console.log('  Departments:', Object.keys(result[0].manpower?.departments || {}));
    }
  }
}
