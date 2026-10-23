import ExcelJS from 'exceljs';
import { normalizeJVName } from './utils.js';

const C = {
  navyDark: '262626',
  navyHeader: 'E5E5E5',
  navyLight: 'F2F2F2',
  borderGray: 'BFBFBF',
  borderLight: 'D0D0D0',
  textMain: '000000',
  textMuted: '000000',
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

// 요약 함수가 세는 표의 마지막 행 (다운로드 후 직접 추가하는 행을 위한 여유 포함)
const DATA_END_ROW = 1000;

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
export async function exportIssuesExcelReport(issues = [], filterInfo = {}, { summary = false } = {}) {
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

  const lastColIdx = 19; // A to S

  // 1. 대제목 헤더 (Row 1)
  ws.mergeCells(1, 1, 1, lastColIdx);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = summary
    ? 'TW — 전체 고객사 종합본 · 스태킹 · 노칭 공정 및 사이트별 이슈 통합 관리 보고서'
    : 'TW — 스태킹 · 노칭 공정 및 사이트별 이슈 통합 관리 보고서';
  titleCell.font = { name: '맑은 고딕', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${C.navyDark}` } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(1).height = 36;

  // 2. 간격 행 (Row 2~3)
  ws.getRow(2).height = 8;

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
  ws.getCell('A4').font = { name: '맑은 고딕', size: 9, color: { argb: 'FF000000' }, bold: true };
  ws.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('A4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };

  ws.mergeCells('A5:C5');
  // 요약 칸은 표(상태 H열·공정 E열)를 세는 함수라, 다운로드 후 행을 추가·수정하면 자동 반영된다
  const rng = col => `${col}$8:${col}$${DATA_END_ROW}`;
  const statusRng = rng('$H');
  const procRng = rng('$E');
  const pct = (num, den) => `IF(${den}=0,0,ROUND(${num}/${den}*100,0))`;
  const totalF = `COUNTA(${statusRng})`;
  const resolvedF = `COUNTIF(${statusRng},"조치완료")`;
  const stackingF = `COUNTIF(${procRng},"스태킹")`;
  const stackingResolvedF = `COUNTIFS(${procRng},"스태킹",${statusRng},"조치완료")`;
  const notchingF = `COUNTIF(${procRng},"노칭")`;
  const notchingResolvedF = `COUNTIFS(${procRng},"노칭",${statusRng},"조치완료")`;

  ws.getCell('A5').value = {
    formula: `${totalF}&"건 (완료 "&${resolvedF}&" · 조치중 "&COUNTIF(${statusRng},"조치중")&" · 발생 "&COUNTIF(${statusRng},"발생/접수")&")"`,
    result: `${totalCount}건 (완료 ${resolvedCount} · 조치중 ${inProgressCount} · 발생 ${openCount})`
  };
  ws.getCell('A5').font = { name: '맑은 고딕', size: 11, bold: true, color: { argb: 'FF000000' } };
  ws.getCell('A5').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('D4:G4');
  ws.getCell('D4').value = '스태킹 (Stacking) 공정';
  ws.getCell('D4').font = { name: '맑은 고딕', size: 9, color: { argb: 'FF000000' }, bold: true };
  ws.getCell('D4').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('D4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${C.stackingBg}` } };

  ws.mergeCells('D5:G5');
  ws.getCell('D5').value = {
    formula: `"총 "&${stackingF}&"건 | 완료 "&${stackingResolvedF}&"건 ("&${pct(stackingResolvedF, stackingF)}&"%)"`,
    result: `총 ${stackingCount}건 | 완료 ${stackingResolved}건 (${stackingCount > 0 ? Math.round((stackingResolved/stackingCount)*100) : 0}%)`
  };
  ws.getCell('D5').font = { name: '맑은 고딕', size: 11, bold: true, color: { argb: 'FF000000' } };
  ws.getCell('D5').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('H4:K4');
  ws.getCell('H4').value = '노칭 (Notching) 공정';
  ws.getCell('H4').font = { name: '맑은 고딕', size: 9, color: { argb: 'FF000000' }, bold: true };
  ws.getCell('H4').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('H4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${C.notchingBg}` } };

  ws.mergeCells('H5:K5');
  ws.getCell('H5').value = {
    formula: `"총 "&${notchingF}&"건 | 완료 "&${notchingResolvedF}&"건 ("&${pct(notchingResolvedF, notchingF)}&"%)"`,
    result: `총 ${notchingCount}건 | 완료 ${notchingResolved}건 (${notchingCount > 0 ? Math.round((notchingResolved/notchingCount)*100) : 0}%)`
  };
  ws.getCell('H5').font = { name: '맑은 고딕', size: 11, bold: true, color: { argb: 'FF000000' } };
  ws.getCell('H5').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('L4:R4');
  ws.getCell('L4').value = '전체 조치 완료율 (Resolution Rate)';
  ws.getCell('L4').font = { name: '맑은 고딕', size: 9, color: { argb: 'FF000000' }, bold: true };
  ws.getCell('L4').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('L4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${C.resolvedBg}` } };

  ws.mergeCells('L5:R5');
  ws.getCell('L5').value = {
    formula: `${pct(resolvedF, totalF)}&"% (목표 대비 정상 트래킹)"`,
    result: `${resolvedRate}% (목표 대비 정상 트래킹)`
  };
  ws.getCell('L5').font = { name: '맑은 고딕', size: 12, bold: true, color: { argb: 'FF000000' } };
  ws.getCell('L5').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.getRow(4).height = 18;
  ws.getRow(5).height = 24;

  // Row 4~5 테두리 적용
  for (let r = 4; r <= 5; r++) {
    for (let c = 1; c <= lastColIdx; c++) {
      ws.getCell(r, c).border = {
        top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
        bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
        left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
        right: { style: 'thin', color: { argb: 'FFBFBFBF' } }
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
    { label: '테스트 내역', width: 36, key: 'testHistory' },
    { label: '최종 대응 및 조치 내용 (How solved)', width: 44, key: 'finalAction' },
    { label: '재발 방지 대책 (Preventive)', width: 40, key: 'preventiveAction' },
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
    cell.font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: 'FF000000' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${C.navyHeader}` } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF595959' } },
      bottom: { style: 'medium', color: { argb: 'FF595959' } },
      left: { style: 'thin', color: { argb: 'FF8C8C8C' } },
      right: { style: 'thin', color: { argb: 'FF8C8C8C' } }
    };
    ws.getColumn(colIdx).width = h.width;
  });

  // 5. 데이터 행 추가 (Row 8~)
  issues.forEach((item, index) => {
    const rowIdx = 8 + index;
    const row = ws.getRow(rowIdx);

    const procText = item.processType === 'stacking' ? '스태킹' : item.processType === 'notching' ? '노칭' : '기타/공통';
    const statusText = item.status === 'resolved' ? '조치완료' : item.status === 'in_progress' ? '조치중' : '발생/접수';
    const typeText = item.issueType === 'site' ? '사이트(양산)' : '프로젝트';
    const sevText = item.severity === 'critical' ? '긴급' : item.severity === 'high' ? '높음' : '보통';
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
      item.testHistory || '-',
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
        vertical: 'middle',
        horizontal: 'center',
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
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
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

    // 재발방지대책 열 (16열) 볼드 하이라이트
    if (item.preventiveAction && item.preventiveAction !== '-') {
      row.getCell(16).font = { name: '맑은 고딕', size: 9, color: { argb: 'FF000000' }, bold: true };
    }
  });

  // 6. 자동 필터 적용 (Row 7부터 데이터 끝까지)
  ws.autoFilter = {
    from: { row: 7, column: 1 },
    to: { row: ws.rowCount, column: lastColIdx }
  };

  // 직접 추가하는 행도 요약 함수가 세도록 공정(E)·상태(H)는 목록에서 고르게 한다
  const listRule = items => ({
    type: 'list',
    allowBlank: true,
    formulae: [`"${items.join(',')}"`],
    showErrorMessage: true,
    errorTitle: '입력 오류',
    error: '목록에서 선택해 주세요. (요약 칸이 이 값으로 집계됩니다)'
  });
  for (let r = 8; r <= DATA_END_ROW; r++) {
    ws.getCell(r, 5).dataValidation = listRule(['스태킹', '노칭', '기타/공통']);
    ws.getCell(r, 8).dataValidation = listRule(['조치완료', '조치중', '발생/접수']);
  }

  // 7. 다운로드 실행
  const buffer = await wb.xlsx.writeBuffer();
  const fileDate = today();
  saveFile(buffer, `TW_이슈통합관리_${summary ? '전체고객사_종합본_' : ''}스태킹_노칭_조치이력보고서_${fileDate}.xlsx`);
}
