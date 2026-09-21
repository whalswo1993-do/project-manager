import fs from 'fs';
import XLSX from 'xlsx';

const path = 'C:\\Users\\minja\\OneDrive\\바탕 화면\\SKBM 11, 13 Line E1111, E2222 JC.xlsx';
const buf = fs.readFileSync(path);
const wb = XLSX.read(buf, { cellDates: false, cellStyles: true });

const ws = wb.Sheets['Planning'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

console.log('Planning sheet ref:', ws['!ref']);
console.log('Total rows:', rows.length);

// 1. Check title & headers (Rows 0~10)
for (let i = 0; i <= 10; i++) {
  const nonNull = (rows[i] || []).map((v, c) => v != null ? `[c${c}]:${v}` : null).filter(Boolean);
  console.log(`Row ${i}:`, nonNull.slice(0, 10).join(', '));
}

// 2. Find where Manpower / Personnel is located!
console.log('\n--- Searching for Manpower / Personnel / 부서 / Total / Line / Equipment in all rows ---');
for (let i = 0; i < rows.length; i++) {
  const row = rows[i] || [];
  const text = row.filter(v => v != null).map(String).join(' ');
  if (/personnel|manpower|기구|제어|비전|전장|안전|소장|total|sum|설계|notcher|stacker|공정/i.test(text)) {
    const nonNull = row.map((v, c) => v != null && v !== '' ? `[c${c}]:${v}` : null).filter(Boolean);
    console.log(`Row ${i}: ${nonNull.slice(0, 12).join(', ')}`);
  }
}
