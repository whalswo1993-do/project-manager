import PptxGenJS from 'pptxgenjs';
import { normalizeJVName } from './utils.js';

const C = {
  navy: '0F172A',
  blue: '1D4ED8',
  stacking: '2563EB',
  notching: 'EA580C',
  green: '16A34A',
  amber: 'D97706',
  red: 'DC2626',
  gray: '64748B',
  line: 'CBD5E1',
  light: 'F1F5F9',
  white: 'FFFFFF'
};
const FONT = '맑은 고딕';

const clip = (text, max) => {
  const s = String(text ?? '').replace(/\s+\n/g, '\n').trim();
  if (!s) return '-';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};
const procLabel = (p) => (p === 'stacking' ? '스태킹' : p === 'notching' ? '노칭' : '공통');
const procColor = (p) => (p === 'stacking' ? C.stacking : p === 'notching' ? C.notching : C.gray);
const statusLabel = (s) => (s === 'resolved' ? '조치완료' : s === 'in_progress' ? '조치중' : '발생/접수');
const statusColor = (s) => (s === 'resolved' ? C.green : s === 'in_progress' ? C.amber : C.red);
const siteOf = (i) => normalizeJVName(i.siteName || '') || '(미지정)';

function frame(slide, title, sub, page, total) {
  slide.background = { color: C.white };
  slide.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.72, fill: { color: C.navy }, line: { color: C.navy } });
  slide.addText(title, { x: 0.45, y: 0.12, w: 9.5, h: 0.48, fontSize: 20, bold: true, color: C.white, fontFace: FONT, margin: 0 });
  slide.addText(sub, { x: 7.2, y: 0.2, w: 5.7, h: 0.32, fontSize: 10, color: 'CBD5E1', align: 'right', fontFace: FONT, margin: 0 });
  slide.addText(`TW Project | 이슈 통합분석 | ${page} / ${total}`, {
    x: 0.45, y: 7.1, w: 12.4, h: 0.22, fontSize: 8, color: '8493A1', align: 'right', fontFace: FONT, margin: 0
  });
}

/**
 * 등록된 이슈(조치 이력) 기반 이슈 통합분석 PPT
 */
export async function exportIssuesPpt({ issues = [], startDate, endDate, siteFilter = 'all' }) {
  const inRange = issues.filter(i => {
    const d = (i.occurredDate || String(i.createdAt || '').slice(0, 10) || '');
    if (!d || d < startDate || d > endDate) return false;
    if (siteFilter !== 'all') {
      return siteOf(i).toUpperCase() === normalizeJVName(siteFilter).trim().toUpperCase();
    }
    return true;
  }).sort((a, b) =>
    siteOf(a).localeCompare(siteOf(b)) ||
    String(a.processType).localeCompare(String(b.processType)) ||
    String(a.occurredDate).localeCompare(String(b.occurredDate))
  );

  if (inRange.length === 0) {
    throw new Error('해당 기간(및 선택한 SITE)에 등록된 이슈가 없습니다.');
  }

  const total = inRange.length;
  const resolved = inRange.filter(i => i.status === 'resolved').length;
  const inProgress = inRange.filter(i => i.status === 'in_progress').length;
  const open = inRange.filter(i => i.status === 'open').length;
  const rate = Math.round((resolved / total) * 100);
  const byProc = (p) => inRange.filter(i => i.processType === p);
  const stacking = byProc('stacking');
  const notching = byProc('notching');
  const pending = inRange.filter(i => i.status !== 'resolved');

  // 슬라이드 수 계산
  const PENDING_PER = 8;
  const pendingPages = Math.ceil(pending.length / PENDING_PER);
  const siteNames = [...new Set(inRange.map(siteOf))];
  const SITE_PER = 10;
  const sitePages = Math.ceil(siteNames.length / SITE_PER);
  const totalPages = 1 + sitePages + pendingPages + total;
  let page = 0;

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'TW Project';
  pptx.company = 'TW';
  pptx.title = '이슈 통합분석 보고서';
  pptx.lang = 'ko-KR';

  const periodText = `${startDate} ~ ${endDate}${siteFilter !== 'all' ? ` | ${siteFilter}` : ''}`;

  // ── 1. 요약 슬라이드 ──
  const s1 = pptx.addSlide();
  frame(s1, '이슈 통합분석 보고서', periodText, ++page, totalPages);

  const kpis = [
    ['전체 이슈', `${total}건`, C.navy],
    ['조치 완료', `${resolved}건`, C.green],
    ['조치 진행중', `${inProgress}건`, C.amber],
    ['발생/접수', `${open}건`, C.red],
    ['조치 완료율', `${rate}%`, C.blue]
  ];
  kpis.forEach((k, idx) => {
    const x = 0.5 + idx * 2.5;
    s1.addShape('roundRect', { x, y: 1.15, w: 2.3, h: 1.25, fill: { color: C.light }, line: { color: C.line }, rectRadius: 0.08 });
    s1.addText(k[0], { x: x + 0.2, y: 1.28, w: 1.9, h: 0.28, fontSize: 11, color: C.gray, fontFace: FONT, margin: 0 });
    s1.addText(k[1], { x: x + 0.2, y: 1.62, w: 1.9, h: 0.6, fontSize: 28, bold: true, color: k[2], fontFace: FONT, margin: 0 });
  });

  const procBlock = (label, list, color, x) => {
    const done = list.filter(i => i.status === 'resolved').length;
    s1.addShape('roundRect', { x, y: 2.75, w: 6.1, h: 1.35, fill: { color: C.white }, line: { color }, rectRadius: 0.08 });
    s1.addText(label, { x: x + 0.25, y: 2.88, w: 3, h: 0.3, fontSize: 13, bold: true, color, fontFace: FONT, margin: 0 });
    s1.addText(`${list.length}건`, { x: x + 0.25, y: 3.25, w: 2.4, h: 0.6, fontSize: 26, bold: true, color: C.navy, fontFace: FONT, margin: 0 });
    s1.addText(`조치 완료 ${done}건 · 미완료 ${list.length - done}건`, {
      x: x + 2.6, y: 3.38, w: 3.3, h: 0.35, fontSize: 12, color: C.gray, fontFace: FONT, margin: 0
    });
  };
  procBlock('스태킹 (Stacking) 공정', stacking, C.stacking, 0.5);
  procBlock('노칭 (Notching) 공정', notching, C.notching, 6.75);

  // 재발방지 대책 하이라이트 (최근 조치완료 건)
  const prevent = inRange.filter(i => i.status === 'resolved' && i.preventiveAction).slice(0, 4);
  s1.addText('재발 방지 대책 요약', { x: 0.5, y: 4.4, w: 6, h: 0.3, fontSize: 13, bold: true, color: C.navy, fontFace: FONT, margin: 0 });
  if (prevent.length === 0) {
    s1.addText('기간 내 재발 방지 대책이 기재된 조치 완료 이슈가 없습니다.', { x: 0.5, y: 4.8, w: 12, h: 0.35, fontSize: 11, color: C.gray, fontFace: FONT, margin: 0 });
  } else {
    s1.addText(
      prevent.map(i => ({
        text: `[${siteOf(i)} · ${procLabel(i.processType)}] ${clip(i.title, 40)} → ${clip(i.preventiveAction, 90)}`,
        options: { bullet: true, breakLine: true }
      })),
      { x: 0.5, y: 4.8, w: 12.3, h: 2.1, fontSize: 11, color: '334155', valign: 'top', fontFace: FONT, lineSpacingMultiple: 1.3 }
    );
  }

  // ── 2. SITE × 공정 현황 ──
  const siteRows = siteNames.map(name => {
    const list = inRange.filter(i => siteOf(i) === name);
    const st = list.filter(i => i.processType === 'stacking').length;
    const nt = list.filter(i => i.processType === 'notching').length;
    const done = list.filter(i => i.status === 'resolved').length;
    return [name, String(st), String(nt), String(list.length), String(done), String(list.length - done), `${Math.round((done / list.length) * 100)}%`];
  });
  for (let p = 0; p < sitePages; p++) {
    const s = pptx.addSlide();
    frame(s, 'SITE별 이슈 현황', periodText, ++page, totalPages);
    const head = ['SITE', '스태킹', '노칭', '합계', '조치완료', '미완료', '완료율'].map(t => ({
      text: t,
      options: { bold: true, color: C.white, fill: { color: C.blue }, align: 'center', fontFace: FONT, fontSize: 12 }
    }));
    const body = siteRows.slice(p * SITE_PER, (p + 1) * SITE_PER).map(r => r.map((t, ci) => ({
      text: t,
      options: { align: ci === 0 ? 'left' : 'center', fontFace: FONT, fontSize: 12, color: C.navy, bold: ci === 0 }
    })));
    s.addTable([head, ...body], {
      x: 0.6, y: 1.2, w: 12.1,
      colW: [3.6, 1.4, 1.4, 1.4, 1.5, 1.4, 1.4],
      rowH: 0.45,
      border: { type: 'solid', color: C.line, pt: 0.5 }
    });
  }

  // ── 3. 미조치(진행중/접수) 이슈 목록 ──
  for (let p = 0; p < pendingPages; p++) {
    const s = pptx.addSlide();
    frame(s, `미조치 이슈 현황 (${pending.length}건)`, periodText, ++page, totalPages);
    const head = ['SITE', '공정', '설비/호기', '이슈 제목', '상태', '발생일', '담당'].map(t => ({
      text: t,
      options: { bold: true, color: C.white, fill: { color: C.red }, align: 'center', fontFace: FONT, fontSize: 11 }
    }));
    const body = pending.slice(p * PENDING_PER, (p + 1) * PENDING_PER).map(i => ([
      { text: siteOf(i), options: { bold: true } },
      { text: procLabel(i.processType), options: { color: procColor(i.processType), bold: true, align: 'center' } },
      { text: clip(i.lineName, 18), options: { align: 'center' } },
      { text: clip(i.title, 46), options: {} },
      { text: statusLabel(i.status), options: { color: statusColor(i.status), bold: true, align: 'center' } },
      { text: i.occurredDate || '-', options: { align: 'center' } },
      { text: clip(i.assignee, 16), options: { align: 'center' } }
    ].map(c => ({ text: c.text, options: { fontFace: FONT, fontSize: 10.5, color: C.navy, ...c.options } }))));
    s.addTable([head, ...body], {
      x: 0.45, y: 1.1, w: 12.4,
      colW: [1.5, 0.9, 1.8, 4.6, 1.1, 1.2, 1.3],
      rowH: 0.58,
      border: { type: 'solid', color: C.line, pt: 0.5 },
      valign: 'middle'
    });
  }

  // ── 4. 이슈별 상세 (현상 / 원인 / 조치 / 재발방지) ──
  inRange.forEach(i => {
    const s = pptx.addSlide();
    frame(s, `${siteOf(i)} · ${procLabel(i.processType)} 이슈 상세`, periodText, ++page, totalPages);

    s.addText(clip(i.title, 80), { x: 0.45, y: 0.9, w: 10.4, h: 0.55, fontSize: 18, bold: true, color: C.navy, fontFace: FONT, margin: 0 });
    s.addShape('roundRect', { x: 11.1, y: 0.95, w: 1.75, h: 0.4, fill: { color: statusColor(i.status) }, line: { color: statusColor(i.status) }, rectRadius: 0.2 });
    s.addText(statusLabel(i.status), { x: 11.1, y: 0.95, w: 1.75, h: 0.4, fontSize: 12, bold: true, color: C.white, align: 'center', valign: 'middle', fontFace: FONT, margin: 0 });

    const meta = [
      `구분: ${i.issueType === 'site' ? '사이트(양산)' : '프로젝트'}`,
      `프로젝트: ${clip(normalizeJVName(i.projectName || ''), 30)}`,
      `설비: ${clip(i.lineName, 20)}`,
      `발생일: ${i.occurredDate || '-'}`,
      `등록자: ${clip(i.reporter, 16)}`,
      `담당자: ${clip(i.assignee, 16)}`
    ].join('   |   ');
    s.addText(meta, { x: 0.45, y: 1.5, w: 12.4, h: 0.3, fontSize: 10.5, color: C.gray, fontFace: FONT, margin: 0 });

    const box = (label, text, x, y, color) => {
      s.addShape('roundRect', { x, y, w: 6.1, h: 2.4, fill: { color: C.white }, line: { color }, rectRadius: 0.06 });
      s.addText(label, { x: x + 0.2, y: y + 0.1, w: 5.7, h: 0.3, fontSize: 12, bold: true, color, fontFace: FONT, margin: 0 });
      s.addText(clip(text, 360), {
        x: x + 0.2, y: y + 0.48, w: 5.7, h: 1.8, fontSize: 11, color: '334155', valign: 'top', fontFace: FONT, lineSpacingMultiple: 1.25, margin: 0
      });
    };
    box('현상 / 증상', i.symptom, 0.45, 1.95, C.red);
    box('근본 원인 분석', i.rootCause, 6.75, 1.95, C.amber);
    box('최종 대응 및 조치 내용', i.finalAction || i.interimAction, 0.45, 4.5, C.green);
    box('재발 방지 대책', i.preventiveAction, 6.75, 4.5, C.blue);

    if (i.status === 'resolved') {
      s.addText(`조치 완료: ${i.resolvedDate || '-'} · ${clip(i.resolver || i.assignee, 24)}`, {
        x: 0.45, y: 6.95, w: 8, h: 0.22, fontSize: 9.5, color: C.gray, fontFace: FONT, margin: 0
      });
    }
  });

  await pptx.writeFile({ fileName: `이슈_통합분석_${startDate}_${endDate}.pptx` });
  return { total, resolved };
}
