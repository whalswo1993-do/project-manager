import * as XLSX from 'xlsx';

// 프로젝트 목록(화면에 보이는 목록)을 엑셀로 내려받는다.
// 시트 1: 프로젝트 목록 / 시트 2: 마일스톤(프로젝트마다 한 줄씩)
const LIST_HEADERS = [
  ['고객사', 'customer', 14],
  ['제조번호', 'manufacturingNo', 16],
  ['Site', 'site', 14],
  ['Line', 'line', 8],
  ['프로젝트', 'name', 34],
  ['시작일', 'startDate', 12],
  ['종료일', 'endDate', 12],
  ['상태', 'status', 10],
  ['진행률(%)', 'value', 10],
];

const MS_HEADERS = ['제조번호', '프로젝트', '마일스톤', '시작일', '종료일'];

function sheetFrom(rows, widths) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = widths.map((wch) => ({ wch }));
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  return ws;
}

export function buildProjectListWorkbook(projects) {
  const listRows = [
    LIST_HEADERS.map(([label]) => label),
    ...projects.map((p) => LIST_HEADERS.map(([, key]) => {
      const v = p[key];
      if (key === 'manufacturingNo') return String(v || '').replace(/-[a-f0-9]{4}$/i, '');
      return v ?? '';
    })),
  ];
  const msRows = [MS_HEADERS];
  projects.forEach((p) => {
    (p.milestones || []).forEach((m) => {
      msRows.push([
        String(p.manufacturingNo || '').replace(/-[a-f0-9]{4}$/i, ''),
        p.name || '',
        m.name || '',
        m.startDate || '',
        m.endDate || '',
      ]);
    });
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFrom(listRows, LIST_HEADERS.map(([, , w]) => w)), '프로젝트 목록');
  XLSX.utils.book_append_sheet(wb, sheetFrom(msRows, [16, 34, 24, 12, 12]), '마일스톤');
  return wb;
}

export function exportProjectList(projects, { customer = '', label = '' } = {}) {
  const wb = buildProjectListWorkbook(projects);
  const today = new Date().toISOString().slice(0, 10);
  const name = ['프로젝트목록', customer, label, today].filter(Boolean).join('_').replace(/[\\/:*?"<>|\s]+/g, '_');
  XLSX.writeFile(wb, `${name}.xlsx`);
}
