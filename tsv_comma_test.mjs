import { parseTSVWithQuotes } from 'file:///c:/Users/woowon/project-manager/src/masterPlanParser.js';

const tsvData = `Line\tEquipment\tActivity\tStart\tEnd\tDuration\t\t11-Jul\t14-Jul
9\tNotcher (6대)\t검토 완료\t2026-07-06\t2026-07-09\t3\t\t\t
\tManpower\tPersonnel\tTotal\tPeak\t\t\t\t
\t\tMechanical\t"1,050"\t3\t\t\t"1,000"\t50
\t\tTotal Manday\t"1,050"\t\t\t\tDaily Peak\t"1,000"\t50
`;

const rows = parseTSVWithQuotes(tsvData);

console.log("=== TSV PARSING RESULT ===");
rows.forEach((r, i) => {
  console.log(`Row ${i} length: ${r.length} ->`, JSON.stringify(r));
});
