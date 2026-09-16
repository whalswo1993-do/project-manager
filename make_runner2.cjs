const fs = require('fs');
const xlsx = require('xlsx');

const header = fs.readFileSync('prep2.cjs', 'utf8').split('let code = fs.readFileSync')[0];
const func = fs.readFileSync('temp_func2.cjs', 'utf8').replace('module.exports={parseExcelMasterPlan};', '');

const footer = `
const files = fs.readdirSync('.').filter(f => f.endsWith('.xlsx'));
for (const file of files) {
  const wb = xlsx.readFile(file);
  const sheetName = wb.SheetNames.find(n => n.includes('Planning')) || wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const csv = xlsx.utils.sheet_to_csv(sheet, { FS: '\\t', blankrows: false });
  
  parseExcelMasterPlan(csv).then(res => {
    console.log('\\n--- FILE: ' + file + ' ---');
    res.forEach(p => {
      let total = 0;
      if (p._deptMap) {
        total = Object.values(p._deptMap).reduce((a,b)=>a+(b.total||0), 0);
      }
      console.log(p.equipment + ': ' + total);
    });
  });
}
`;

fs.writeFileSync('run_all_test.cjs', header + func + footer);
