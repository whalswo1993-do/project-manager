import { parseExcelMasterPlan } from './src/masterPlanParser.js';
import fs from 'fs';

const tsv = `Project Name: SKOH2 9Line E1127 J/C
\t\t\t\t\t\t28-Jun-26\t29-Jun-26\t30-Jun-26\t01-Jul-26\t02-Jul-26\t03-Jul-26\t04-Jul-26\t05-Jul-26\t06-Jul-26\t07-Jul-26\t08-Jul-26\t09-Jul-26\t10-Jul-26\t11-Jul-26\t12-Jul-26\t13-Jul-26\t14-Jul-26
Line\tEquipment\tActivity\tStart\tEnd\tDuration\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
9\tNotcher (6대)\t고객사 DR\t02월 20일\t03월 05일\t14
\t\tManpower\tPersonnel\tTotal\tPeak
\t\t\tMechanical\t67\t4\t2\t\t\t\t\t\t\t\t2\t2\t2\t2\t2\t2\t\t\t2
\t\t\tVision\t60\t4
\t\t\tControl\t33\t1
\t\t\tElectronical\t0\t0
\t\t\tSafety Manager\t30\t1\t\t\t\t\t\t\t\t1\t1\t1\t1\t1\t1\t\t\t1
\t\t\tSupervisor\t6\t1
9\tStacker (9대)\t고객사 DR\t02월 20일\t03월 05일\t14
\t\tManpower\tPersonnel\tTotal\tPeak
\t\t\tMechanical\t204\t8\t\t\t\t\t\t\t\t\t\t3\t3\t3\t3\t3\t3\t\t\t6`;

// Convert to ArrayBuffer
const buf = Buffer.from(tsv, 'utf8');
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const result = parseExcelMasterPlan(ab, {});
console.log(JSON.stringify(result.map(p => ({
  eq: p.equipment,
  manpower: p.manpower?.departments
})), null, 2));
