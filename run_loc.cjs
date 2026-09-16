const xlsx = require('xlsx');
const { parseExcelMasterPlan } = require('./AppTestLoc.cjs');
const wb = xlsx.readFile('SKOH2 9Line E1127JC Master Schedule (공수 정합화 반영 NC+ ST) v5 (고객사 송부용 최종).xlsx');
const rawData = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
const res = parseExcelMasterPlan(rawData);
res.forEach(p => {
  console.log(p.equipment + ': ' + p._totalMandayVal);
  console.log(Object.keys(p._deptMap).map(k => k + '=' + p._deptMap[k].total).join(', '));
});
