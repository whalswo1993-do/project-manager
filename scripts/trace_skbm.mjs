import fs from 'fs';
import XLSX from 'xlsx';

const path = 'C:\\Users\\minja\\OneDrive\\바탕 화면\\SKBM 11, 13 Line E1111, E2222 JC.xlsx';
const buf = fs.readFileSync(path);
const wb = XLSX.read(buf, { cellDates: false, cellStyles: true });

const ws = wb.Sheets['Planning'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

// Let's trace lines 20 to 45
for (let r = 20; r <= 45; r++) {
  const row = rows[r];
  if (!row) continue;
  const nonNull = row.map((v, c) => v != null && v !== '' ? `[c${c}]:${v}` : null).filter(Boolean);
  console.log(`Row ${r}:`, nonNull.slice(0, 10).join(', '));
}
