const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');
const start = code.indexOf('export async function parseExcelMasterPlan');
let end = code.indexOf('export function isMasterPlanFormat');
let funcCode = code.substring(start, end);
funcCode = funcCode.replace('export async function parseExcelMasterPlan', 'async function parseExcelMasterPlan');

const headerCode = `
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
  return String(str||'').replace(/\\(.*\\)/g,'').trim();
};
const excelDateToISO=(val,refYear)=>{
  if(!val)return '';
  if(typeof val==='number'){
    if(val>40000&&val<50000){
      const d=new Date(Math.round((val-25569)*86400*1000));
      return d.toISOString().split('T')[0];
    }
    return '';
  }
  const s=String(val).trim();
  const m=s.match(/(\\d{1,2})[\\/\\-월]\\s*(\\d{1,2})[일]?/);
  if(m){
    const mon=m[1].padStart(2,'0');
    const day=m[2].padStart(2,'0');
    return refYear+'-'+mon+'-'+day;
  }
  return '';
};
`;

fs.writeFileSync('test_parser.cjs', headerCode + funcCode + '\nmodule.exports = { parseExcelMasterPlan };');

const xlsx = require('xlsx');
const files = fs.readdirSync('.').filter(f => f.endsWith('.xlsx'));
const file = files.find(f => f.includes('v5'));
const wb = xlsx.readFile(file);
const { parseExcelMasterPlan } = require('./test_parser.cjs');

parseExcelMasterPlan(wb).then(res => {
  res.forEach(p => {
    let total = 0;
    if (p._deptMap) {
      total = Object.values(p._deptMap).reduce((a,b)=>a+(b.total||0), 0);
    }
    p.computedTotal = total;
  });
  fs.writeFileSync('output.json', JSON.stringify(res, null, 2));
  console.log('Done!');
});
