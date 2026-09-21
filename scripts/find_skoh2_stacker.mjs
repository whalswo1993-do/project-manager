import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

const desktop = 'C:\\Users\\minja\\OneDrive\\바탕 화면';
const fileName = 'SKOH2 9Line E1127JC Master Schedule (공수 정합화 반영 NC+ ST) v5 (고객사 송부용 최종).xlsx';
const fPath = path.join(desktop, fileName);

const buf = fs.readFileSync(fPath);
const fileWb = XLSX.read(buf, { cellDates: false, cellStyles: true });
const wsFile = fileWb.Sheets['Planning'];
const rowsFile = XLSX.utils.sheet_to_json(wsFile, { header: 1, raw: true });

// Check where Stacker begins in rowsFile
for (let r = 0; r < 70; r++) {
  const row = rowsFile[r] || [];
  const text = row.filter(Boolean).map(String).join(' ');
  if (/notcher|stacker/i.test(text)) {
    console.log(`Row ${r}:`, row.slice(0, 8));
  }
}
