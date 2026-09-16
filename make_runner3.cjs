const fs = require('fs');
const xlsx = require('xlsx');

const header = fs.readFileSync('prep3.cjs', 'utf8').split('let code = fs.readFileSync')[0];
const func = fs.readFileSync('temp_func3.cjs', 'utf8').replace('module.exports={parseExcelMasterPlan};', '');

const footer = `
const file = 'SKOH2 9Line E1127JC Master Schedule (공수 정합화 반영 NC+ ST) v5 (고객사 송부용 최종).xlsx';
const wb = xlsx.readFile(file);
const sheetName = wb.SheetNames.find(n => n.includes('Planning')) || wb.SheetNames[0];
const sheet = wb.Sheets[sheetName];
const csv = xlsx.utils.sheet_to_csv(sheet, { FS: '\\t', blankrows: false });

parseExcelMasterPlan(csv).then(res => {
  res.forEach(p => {
    let total = 0;
    if (p._deptMap) {
      total = Object.values(p._deptMap).reduce((a,b)=>a+(b.total||0), 0);
    }
    console.log(p.equipment + ': ' + total);
    console.log(JSON.stringify(p._deptMap));
  });
}).catch(e => console.error(e));
`;

fs.writeFileSync('run_all_test_3.cjs', header + func + footer);
