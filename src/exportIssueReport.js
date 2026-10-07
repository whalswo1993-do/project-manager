import ExcelJS from 'exceljs';
import { normalizeJVName } from './utils.js';

const C = {
  navyDark: '0F172A',
  navyHeader: '1E3A8A',
  navyLight: 'F1F5F9',
  borderGray: 'CBD5E1',
  borderLight: 'E2E8F0',
  textMain: '0F172A',
  textMuted: '64748B',
  stackingBg: 'EFF6FF',
  stackingText: '1D4ED8',
  notchingBg: 'FFF7ED',
  notchingText: 'EA580C',
  resolvedBg: 'E8F5E9',
  resolvedText: '166534',
  inProgressBg: 'FEF3C7',
  inProgressText: 'B45309',
  openBg: 'FEE2E2',
  openText: 'B91C1C'
};

const today = () => new Date().toISOString().slice(0, 10);

function saveFile(buffer, fileName) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

/**
 * 기업 보고서 양식의 고품질 이슈 통합 관리 ExcelJS 내보내기
 */
export async function exportIssuesExcelReport(issues = [], filterInfo = {}) {
  if (!issues || issues.length === 0) {
    throw new Error('내보낼 이슈 데이터가 없습니다.');
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'TW System';
  wb.created = new Date();

  const ws = wb.addWorksheet('이슈 통합 관리 및 조치 이력', {
    views: [{ state: 'frozen', ySplit: 7, xSplit: 0 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });

  const lastColIdx = 18; // A to R

  // 1. 대제목 헤더 (Row 1)
  ws.mergeCells(1, 1, 1, lastColIdx);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = 'TW — 스태킹 · 노칭 공정 및 사이트별 이슈 통합 관리 보고서';
  titleCell.font = { name: '맑은 고딕', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${C.navyDark}` } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(1).height = 36;

  // 2. 부제목 및 조회 조건 (Row 2)
  ws.mergeCells(2, 1, 2, lastColIdx);
  const subCell = ws.getCell(2, 1);
  const subText = `기준일: ${today()} | SITE 필터: ${filterInfo.site || '전체'} | 공정: ${filterInfo.process || '전체(스태킹/노칭)'} | 상태: ${filterInfo.status || '전체'} | 검색: ${filterInfo.query || '없음'} (총 ${issues.length}건)`;
  subCell.value = subText;
  subCell.font = { name: '맑은 고딕', size: 9, bold: true, color: { argb: 'FF475569' } };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(2).height = 22;

  // 3. 통계 요약 카드 블록 (Row 4~5)
  const totalCount = issues.length;
  const resolvedCount = issues.filter(i => i.status === 'resolved').length;
  const inProgressCount = issues.filter(i => i.status === 'in_progress').length;
  const openCount = issues.filter(i => i.status === 'open').length;
  const stackingCount = issues.filter(i => i.processType === 'stacking').length;
  const stackingResolved = issues.filter(i => i.processType === 'stacking' && i.status === 'resolved').length;
  const notchingCount = issues.filter(i => i.processType === 'notching').length;
  const notchingResolved = issues.filter(i => i.processType === 'notching' && i.status === 'resolved').length;
  const resolvedRate = totalCount > 0 ? Math.round((resolvedCount / totalCount) * 100) : 0;

  ws.mergeCells('A4:C4');
  ws.getCell('A4').value = '전체 등록 이슈';
  ws.getCell('A4').font = { name: '맑은 고딕', size: 9, color: { argb: 'FF64748B' }, bold: true };
  ws.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('A4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

  ws.mergeCells('A5:C5');
  ws.getCell('A5').value = `${totalCount}건 (완료 ${resolvedCount} · 조치중 ${inProgressCount} · 발생 ${openCount})`;
  ws.getCell('A5').font = { name: '맑은 고딕', size: 11, bold: true, color: { argb: 'FF0F172A' } };
  ws.getCell('A5').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('D4:G4');
  ws.getCell('D4').value = '스태킹 (Stacking) 공정';
  ws.getCell('D4').font = { name: '맑은 고딕', size: 9, color: { argb: `FF${C.stackingText}` }, bold: true };
  ws.getCell('D4').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('D4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${C.stackingBg}` } };

  ws.mergeCells('D5:G5');
  ws.getCell('D5').value = `총 ${stackingCount}건 | 완료 ${stackingResolved}건 (${stackingCount > 0 ? Math.round((stackingResolved/stackingCount)*100) : 0}%)`;
  ws.getCell('D5').font = { name: '맑은 고딕', size: 11, bold: true, color: { argb: `FF${C.stackingText}` } };
  ws.getCell('D5').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('H4:K4');
  ws.getCell('H4').value = '노칭 (Notching) 공정';
  ws.getCell('H4').font = { name: '맑은 고딕', size: 9, color: { argb: `FF${C.notchingText}` }, bold: true };
  ws.getCell('H4').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('H4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${C.notchingBg}` } };

  ws.mergeCells('H5:K5');
  ws.getCell('H5').value = `총 ${notchingCount}건 | 완료 ${notchingResolved}건 (${notchingCount > 0 ? Math.round((notchingResolved/notchingCount)*100) : 0}%)`;
  ws.getCell('H5').font = { name: '맑은 고딕', size: 11, bold: true, color: { argb: `FF${C.notchingText}` } };
  ws.getCell('H5').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('L4:R4');
  ws.getCell('L4').value = '전체 조치 완료율 (Resolution Rate)';
  ws.getCell('L4').font = { name: '맑은 고딕', size: 9, color: { argb: 'FF166534' }, bold: true };
  ws.getCell('L4').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('L4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };

  ws.mergeCells('L5:R5');
  ws.getCell('L5').value = `${resolvedRate}% (목표 대비 정상 트래킹)`;
  ws.getCell('L5').font = { name: '맑은 고딕', size: 12, bold: true, color: { argb: 'FF166534' } };
  ws.getCell('L5').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.getRow(4).height = 18;
  ws.getRow(5).height = 24;

  // Row 4~5 테두리 적용
  for (let r = 4; r <= 5; r++) {
    for (let c = 1; c <= lastColIdx; c++) {
      ws.getCell(r, c).border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };
    }
  }

  // Row 6: 간격 행
  ws.getRow(6).height = 10;

  // 4. 테이블 헤더 (Row 7)
  const headers = [
    { label: 'No', width: 6, key: 'no' },
    { label: '구분', width: 14, key: 'type' },
    { label: 'SITE / 법인', width: 18, key: 'site' },
    { label: '프로젝트 / 양산라인', width: 26, key: 'project' },
    { label: '공정 (Process)', width: 16, key: 'process' },
    { label: '설비 / 호기', width: 16, key: 'line' },
    { label: '발생일자', width: 13, key: 'date' },
    { label: '상태', width: 12, key: 'status' },
    { label: '중요도', width: 10, key: 'severity' },
    { label: '이슈 제목 (핵심 요약)', width: 32, key: 'title' },
    { label: '상세 증상 및 현상 (Symptom)', width: 42, key: 'symptom' },
    { label: '근본 원인 분석 (Root Cause)', width: 38, key: 'rootCause' },
    { label: '긴급 / 임시 조치', width: 32, key: 'interimAction' },
    { label: '최종 대응 및 조치 내용 (How solved)', width: 44, key: 'finalAction' },
    { label: '🌟 재발 방지 대책 (Preventive)', width: 40, key: 'preventiveAction' },
    { label: '등록자', width: 14, key: 'reporter' },
    { label: '담당자', width: 16, key: 'assignee' },
    { label: '조치 완료자 / 완료일', width: 22, key: 'resolver' }
  ];

  const headerRow = ws.getRow(7);
  headerRow.height = 28;
  headers.forEach((h, idx) => {
    const colIdx = idx + 1;
    const cell = headerRow.getCell(colIdx);
    cell.value = h.label;
    cell.font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${C.navyHeader}` } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'medium', color: { argb: `FF${C.navyDark}` } },
      bottom: { style: 'medium', color: { argb: `FF${C.navyDark}` } },
      left: { style: 'thin', color: { argb: 'FF3B82F6' } },
      right: { style: 'thin', color: { argb: 'FF3B82F6' } }
    };
    ws.getColumn(colIdx).width = h.width;
  });

  // 5. 데이터 행 추가 (Row 8~)
  issues.forEach((item, index) => {
    const rowIdx = 8 + index;
    const row = ws.getRow(rowIdx);

    const procText = item.processType === 'stacking' ? '🟦 스태킹' : item.processType === 'notching' ? '🟧 노칭' : '기타/공통';
    const statusText = item.status === 'resolved' ? '🟢 조치완료' : item.status === 'in_progress' ? '🟡 조치중' : '🔴 발생/접수';
    const typeText = item.issueType === 'site' ? '🏭 사이트(양산)' : '📂 프로젝트';
    const sevText = item.severity === 'critical' ? '🚨 긴급' : item.severity === 'high' ? '⚠️ 높음' : '보통';
    const resolverText = item.status === 'resolved'
      ? `${item.resolver || item.assignee || '담당자'} (${item.resolvedDate || '완료'})`
      : '-';

    row.values = [
      index + 1,
      typeText,
      normalizeJVName(item.siteName || ''),
      normalizeJVName(item.projectName || '양산 라인'),
      procText,
      item.lineName || '-',
      item.occurredDate || '',
      statusText,
      sevText,
      item.title || '',
      item.symptom || '',
      item.rootCause || '-',
      item.interimAction || '-',
      item.finalAction || (item.status === 'resolved' ? '조치 완료' : '조치 진행 중'),
      item.preventiveAction || '-',
      item.reporter || '-',
      item.assignee || '-',
      resolverText
    ];

    // 행 높이: 텍스트 길이에 따라 유동적 확보
    const maxLen = Math.max(
      (item.symptom || '').length,
      (item.finalAction || '').length,
      (item.preventiveAction || '').length
    );
    row.height = maxLen > 100 ? 60 : maxLen > 40 ? 45 : 32;

    // 셀 서식 지정
    for (let c = 1; c <= lastColIdx; c++) {
      const cell = row.getCell(c);
      cell.font = { name: '맑은 고딕', size: 9, color: { argb: `FF${C.textMain}` } };
      cell.alignment = {
        vertical: 'top',
        horizontal: [1, 5, 7, 8, 9, 16, 17, 18].includes(c) ? 'center' : 'left',
        wrapText: true
      };

      // 테두리
      cell.border = {
        top: { style: 'thin', color: { argb: `FF${C.borderLight}` } },
        bottom: { style: 'thin', color: { argb: `FF${C.borderLight}` } },
        left: { style: 'thin', color: { argb: `FF${C.borderLight}` } },
        right: { style: 'thin', color: { argb: `FF${C.borderLight}` } }
      };

      // 지브라 배경색
      if (index % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
    }

    // 공정 열 (5열) 특별 배경색
    const procCell = row.getCell(5);
    if (item.processType === 'stacking') {
      procCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${C.stackingBg}` } };
      procCell.font = { name: '맑은 고딕', size: 9, bold: true, color: { argb: `FF${C.stackingText}` } };
    } else if (item.processType === 'notching') {
      procCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${C.notchingBg}` } };
      procCell.font = { name: '맑은 고딕', size: 9, bold: true, color: { argb: `FF${C.notchingText}` } };
    }

    // 상태 열 (8열) 특별 배경색
    const statusCell = row.getCell(8);
    if (item.status === 'resolved') {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${C.resolvedBg}` } };
      statusCell.font = { name: '맑은 고딕', size: 9, bold: true, color: { argb: `FF${C.resolvedText}` } };
    } else if (item.status === 'in_progress') {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${C.inProgressBg}` } };
      statusCell.font = { name: '맑은 고딕', size: 9, bold: true, color: { argb: `FF${C.inProgressText}` } };
    } else {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${C.openBg}` } };
      statusCell.font = { name: '맑은 고딕', size: 9, bold: true, color: { argb: `FF${C.openText}` } };
    }

    // 재발방지대책 열 (15열) 볼드 하이라이트
    if (item.preventiveAction && item.preventiveAction !== '-') {
      row.getCell(15).font = { name: '맑은 고딕', size: 9, color: { argb: 'FF166534' }, bold: true };
    }
  });

  // 6. 자동 필터 적용 (Row 7부터 데이터 끝까지)
  ws.autoFilter = {
    from: { row: 7, column: 1 },
    to: { row: ws.rowCount, column: lastColIdx }
  };

  // 7. 다운로드 실행
  const buffer = await wb.xlsx.writeBuffer();
  const fileDate = today();
  saveFile(buffer, `TW_이슈통합관리_스태킹_노칭_조치이력보고서_${fileDate}.xlsx`);
}
