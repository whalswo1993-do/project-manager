import fs from 'fs';
import XLSX from 'xlsx';
import { parseExcelMasterPlan } from '../src/masterPlanParser.js';

const path = 'C:\\Users\\minja\\OneDrive\\바탕 화면\\SKBM 11, 13 Line E1111, E2222 JC.xlsx';
const buf = fs.readFileSync(path);
const wb = XLSX.read(buf, { cellDates: false, cellStyles: true });
const ws = wb.Sheets['Planning'];

// 1. Full TSV
const fullTsv = XLSX.utils.sheet_to_txt(ws);
console.log('Full TSV length:', fullTsv.length);

// 2. Full HTML table
const fullHtml = XLSX.utils.sheet_to_html(ws);
console.log('Full HTML length:', fullHtml.length);

// Let's test how App.jsx handles this:
function testAppPasteLogic(pasteText, pasteHtml, label) {
  console.log(`\n=== Testing [${label}] ===`);
  let directProjects = null;

  // 1. HTML table check
  if (pasteHtml && pasteHtml.includes('<table')) {
    try {
      const htmlWb = XLSX.read(pasteHtml, { type: 'string' });
      if (htmlWb && htmlWb.SheetNames && htmlWb.SheetNames.length > 0) {
        directProjects = parseExcelMasterPlan(htmlWb, {});
        console.log('HTML parse result:', directProjects ? directProjects.length : 0, 'projects');
      }
    } catch (e) {
      console.warn('HTML parse error:', e.message);
    }
  }

  // 2. TSV check
  if ((!directProjects || directProjects.length === 0) && pasteText) {
    try {
      const lines = pasteText.split('\n').map(l => l.split('\t'));
      const ws2 = XLSX.utils.aoa_to_sheet(lines);
      const wb2 = { SheetNames: ['Sheet1'], Sheets: { Sheet1: ws2 } };
      directProjects = parseExcelMasterPlan(wb2, {});
      console.log('TSV parse result:', directProjects ? directProjects.length : 0, 'projects');
    } catch (e) {
      console.warn('TSV parse error:', e.message);
    }
  }

  if (directProjects && directProjects.length > 0) {
    directProjects.forEach((p, idx) => {
      console.log(`  P${idx+1}: ${p.projectName} | Manday: ${p.manpower?.totalManday} | ByDept: ${JSON.stringify(p.manpower?.byDepartment || {})} | Milestones: ${p.milestones?.length} | DailyCount: ${Object.keys(p.manpower?.dailyTotal || {}).length}`);
    });
  } else {
    console.log('  FAILED to parse projects!');
  }
}

testAppPasteLogic(fullTsv, fullHtml, 'Full Sheet Copy');

// What if user dragged from Row 5 (Line Equipment Activity...)?
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
const fromRow5 = rows.slice(5);
const wsFromRow5 = XLSX.utils.aoa_to_sheet(fromRow5);
const tsvFromRow5 = XLSX.utils.sheet_to_txt(wsFromRow5);
const htmlFromRow5 = XLSX.utils.sheet_to_html(wsFromRow5);
testAppPasteLogic(tsvFromRow5, htmlFromRow5, 'Dragged from Row 5 (Header only, no Project Name / Date header)');

// What if user dragged from Row 1 (Project Name...) but without Row 2 Project Start Date?
const fromRow1 = rows.slice(1);
const wsFromRow1 = XLSX.utils.aoa_to_sheet(fromRow1);
const tsvFromRow1 = XLSX.utils.sheet_to_txt(wsFromRow1);
const htmlFromRow1 = XLSX.utils.sheet_to_html(wsFromRow1);
testAppPasteLogic(tsvFromRow1, htmlFromRow1, 'Dragged from Row 1 to bottom');
