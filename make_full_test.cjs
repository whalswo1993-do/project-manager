const fs = require('fs');
const header = fs.readFileSync('prep.cjs', 'utf8').split('// Paste')[0];
const func = fs.readFileSync('temp_func.cjs', 'utf8');
const footer = `
const files = fs.readdirSync('.').filter(f => f.endsWith('.xlsx'));
const file = files.find(f => f.includes('v5'));
const wb = xlsx.readFile(file);
parseExcelMasterPlan(wb).then(res => {
  console.log('\\n--- FINAL RESULTS ---');
  res.forEach(p => {
    let total = 0;
    if (p._deptMap) {
      total = Object.values(p._deptMap).reduce((a,b)=>a+(b.total||0), 0);
    }
    console.log(p.equipment + ': _totalMandayVal=' + p._totalMandayVal + ', computedDeptMapTotal=' + total);
    if(p.equipment && p.equipment.includes('Notcher')) {
       console.log('NOTCHER DEPT MAP: ', p._deptMap);
    }
    if(p.equipment && p.equipment.includes('Stacker')) {
       console.log('STACKER DEPT MAP: ', p._deptMap);
    }
  });
});
`;
fs.writeFileSync('run_full_test.cjs', header + func + footer);
