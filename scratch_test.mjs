const lines = `
Project Name : SKOH2 9Line E1127 J/C
\t\t\t\t\t\t28-Jun-26\t29-Jun-26\t30-Jun-26\t01-Jul-26\t02-Jul-26\t03-Jul-26\t04-Jul-26\t05-Jul-26\t06-Jul-26\t07-Jul-26\t08-Jul-26\t09-Jul-26\t10-Jul-26\t11-Jul-26\t12-Jul-26\t13-Jul-26\t14-Jul-26
Line\tEquipment\tActivity\tStart\tEnd\tDuration\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
9\tNotcher (6대)\t고객사 DR\t02월 20일\t03월 05일\t14
\t\tManpower\tPersonnel\tTotal\tPeak
\t\t\tMechanical\t67\t4\t2\t\t\t\t\t\t\t\t2\t2\t2\t2\t2\t2\t\t\t2`.trim().split('\n');
const rows = lines.map(l => l.split('\t'));

let bestDateCols = [];
for (let r = 0; r < rows.length; r++) {
  const row = rows[r] || [];
  const curDates = [];
  for (let c = 0; c < row.length; c++) {
    const val = row[c];
    const m = val.match(/^(\d{1,2})[-/ ]([a-z]{3})[-/ ](\d{2,4})$/i);
    if (m) {
      curDates.push({ colIdx: c, dateStr: val });
    }
  }
  if (curDates.length > bestDateCols.length) bestDateCols = curDates;
}
console.log('Date Cols:', bestDateCols);

const mechaRow = rows[5];
bestDateCols.forEach(d => {
  console.log(d.dateStr, 'at col', d.colIdx, '-> value:', mechaRow[d.colIdx]);
});
