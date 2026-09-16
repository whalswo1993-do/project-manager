const fs = require('fs');
const xlsx = require('xlsx');

const normalizeDeptName = (raw) => {
  const s=String(raw||'').trim().toLowerCase();
  if(!s)return '';
  if(s.includes('supervisor')||s.includes('탈,부착')||s.includes('탈부착'))return 'Supervisor';
  if(s.includes('기구 외주'))return '기구 외주';
  if(s.includes('mechanical')||s.includes('기구'))return '기구';
  if(s.includes('비전 외주'))return '비전 외주';
  if(s.includes('vision')||s.includes('비전')||s.includes('비젼'))return '비전';
  if(s.includes('제어 외주'))return '제어 외주';
  if(s.includes('control')||s.includes('제어'))return '제어';
  if(s.includes('전장 외주'))return '전장 외주';
  if(s.includes('electronical')||s.includes('electrical')||s.includes('전장'))return '전장';
  if(s.includes('안전'))return '안전';
  if(s.includes('소장')||s.includes('safety'))return '소장';
  if(s.includes('pm'))return 'PM';
  if(s.includes('설비기술'))return '설비기술';
  if(s.includes('설계'))return '설계';
  return s;
};
const normalizeJVName=(str)=>{
  return String(str||'').replace(/\(.*\)/g,'').trim();
};
const excelDateToISO=(val,refYear)=>{
  return '';
};



const files = fs.readdirSync('.').filter(f => f.endsWith('.xlsx'));
for (const file of files) {
  const wb = xlsx.readFile(file);
  const sheetName = wb.SheetNames.find(n => n.includes('Planning')) || wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const csv = xlsx.utils.sheet_to_csv(sheet, { FS: '\t', blankrows: false });
  
  parseExcelMasterPlan(csv).then(res => {
    console.log('\n--- FILE: ' + file + ' ---');
    res.forEach(p => {
      let total = 0;
      if (p._deptMap) {
        total = Object.values(p._deptMap).reduce((a,b)=>a+(b.total||0), 0);
      }
      console.log(p.equipment + ': ' + total);
    });
  });
}
