import fs from 'fs';
import XLSX from 'xlsx';
import { parseExcelMasterPlan } from '../src/masterPlanParser.js';

/**
 * 엑셀에서 복사된 HTML에 여러 개의 <table>이 포함되어 있거나 
 * XLSX.read가 이를 여러 시트로 쪼개는 문제를 해결하기 위해,
 * 모든 <table> 내의 <tr> 및 <td>/<th>를 순서대로 파싱하여
 * 단 하나의 일관된 2차원 배열(AOA)로 변환합니다.
 */
export function htmlTablesToAOA(html) {
  if (!html || !html.includes('<table')) return [];
  
  // Clean comments and head/styles
  let clean = html.replace(/<head[\s\S]*?<\/head>/gi, '');
  clean = clean.replace(/<style[\s\S]*?<\/style>/gi, '');
  clean = clean.replace(/<!--[\s\S]*?-->/gi, '');

  const rows = [];
  // Match all <tr> blocks across all tables
  const trMatches = clean.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  
  for (const trHtml of trMatches) {
    const row = [];
    const cellMatches = trHtml.match(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi) || [];
    
    for (const cellHtml of cellMatches) {
      // Extract text inside td/th
      let text = cellHtml.replace(/<(?:td|th)[^>]*>/i, '').replace(/<\/(?:td|th)>/i, '');
      // Remove inner tags
      text = text.replace(/<[^>]+>/g, '');
      // Decode common HTML entities
      text = text.replace(/&nbsp;/gi, ' ')
                 .replace(/&amp;/gi, '&')
                 .replace(/&lt;/gi, '<')
                 .replace(/&gt;/gi, '>')
                 .replace(/&quot;/gi, '"')
                 .replace(/&#39;/gi, "'");
      text = text.trim();
      row.push(text);
    }
    if (row.length > 0) {
      rows.push(row);
    }
  }
  return rows;
}

const rawHtml = fs.readFileSync('scripts/real_excel_html.html', 'utf8');
console.log('Real Excel HTML length:', rawHtml.length);

console.time('htmlTablesToAOA');
const aoa = htmlTablesToAOA(rawHtml);
console.timeEnd('htmlTablesToAOA');

console.log('Total rows extracted from real HTML:', aoa.length);
console.log('Row 0:', aoa[0]?.slice(0, 10));
console.log('Row 1:', aoa[1]?.slice(0, 10));
console.log('Row 5:', aoa[5]?.slice(0, 10));
console.log('Row 6:', aoa[6]?.slice(0, 10));
console.log('Row 26:', aoa[26]?.slice(0, 10));
console.log('Row 27:', aoa[27]?.slice(0, 10));

const ws = XLSX.utils.aoa_to_sheet(aoa);
const wb = { SheetNames: ['Sheet1'], Sheets: { Sheet1: ws } };
const projs = parseExcelMasterPlan(wb, {});
console.log('\nResult of parseExcelMasterPlan from unified AOA:');
console.log('Projects count:', projs ? projs.length : 0);
if (projs && projs.length > 0) {
  projs.forEach((p, i) => {
    const dailyCount = Object.keys(p.manpower?.dailyTotal || {}).length;
    console.log(`  P${i+1}: ${p.projectName} | Manday: ${p.manpower?.totalManday} | ByDept: ${JSON.stringify(p.manpower?.byDepartment || {})} | Milestones: ${p.milestones?.length} | DailyCount: ${dailyCount}`);
  });
}
