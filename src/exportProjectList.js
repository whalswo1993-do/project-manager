import * as XLSX from 'xlsx';
import { BASE_DEPT_ORDER, DEPT_SHORT, normalizeDeptKey } from './manpowerDepts';

// 프로젝트 목록(화면에 보이는 목록)을 엑셀로 내려받는다.
//  시트 1 "프로젝트 목록": 프로젝트 정보 + 공사 기간(공수 투입 시작~종료) + 부서별 계획공수(Total, Peak)
//  시트 2 "상세 공수": 마스터 스케줄 마일스톤(액티비티)별로 어느 부서가 몇 명 투입되는지
// 공수 데이터는 프로젝트의 manpower.departments[부서].daily = { 'YYYY-MM-DD': 인원 } 에서 계산한다.

const stripHash = (no) => String(no || '').replace(/-[a-f0-9]{4}$/i, '');
const num = (v) => Number(v) || 0;

function deptLabel(key) {
  return DEPT_SHORT[key] || key;
}

// 부서 이름이 제각각이어도(예: "기구(소장포함)") 같은 부서로 합쳐서 돌려준다.
function collectDepts(manpower) {
  const result = {};
  Object.entries(manpower?.departments || {}).forEach(([rawKey, d]) => {
    const key = normalizeDeptKey(rawKey);
    const slot = result[key] || (result[key] = { total: 0, peak: 0, daily: {} });
    Object.entries(d?.daily || {}).forEach(([date, v]) => {
      if (num(v) > 0) slot.daily[date] = (slot.daily[date] || 0) + num(v);
    });
    slot.total += num(d?.total) || Object.values(d?.daily || {}).reduce((a, v) => a + num(v), 0);
    slot.peak = Math.max(slot.peak, num(d?.peak));
  });
  Object.values(result).forEach((slot) => {
    const dailyPeak = Math.max(0, ...Object.values(slot.daily));
    if (dailyPeak > 0) slot.peak = dailyPeak;
  });
  return result;
}

// 프로젝트 하나의 공수 요약: 부서별 Total/Peak, 일자별 합계, 공사 시작·종료일
export function summarizeManpower(project) {
  const mp = project.manpower;
  const depts = collectDepts(mp);
  const daily = {};
  Object.values(depts).forEach((slot) => {
    Object.entries(slot.daily).forEach(([date, v]) => { daily[date] = (daily[date] || 0) + v; });
  });
  // 부서별 일자 데이터가 없고 합계(dailyTotal)만 있는 경우
  if (Object.keys(daily).length === 0) {
    Object.entries(mp?.dailyTotal || {}).forEach(([date, v]) => {
      if (num(v) > 0) daily[date] = num(v);
    });
  }
  const dates = Object.keys(daily).sort();
  const deptTotalSum = Object.values(depts).reduce((a, s) => a + s.total, 0);
  const dailySum = Object.values(daily).reduce((a, v) => a + v, 0);
  return {
    depts,
    daily,
    workStart: dates[0] || '',
    workEnd: dates[dates.length - 1] || '',
    total: num(mp?.totalManday) || deptTotalSum || dailySum,
    peak: Math.max(0, ...Object.values(daily)) || num(mp?.dailyPeak),
  };
}

// ── 공사 시작일 판단 ──────────────────────────────────────────
// 공수가 처음 잡힌 날을 그대로 공사 시작으로 보면 틀린다. 사전 현장 방문·자재 수령·본사 검수로 1~3명이 먼저 잡히기 때문이다.
//  - J/C(형교환) 프로젝트: 해체 작업 또는 J/C 일정부터가 공사 시작. (자재 수령·"형교환 툴 부칙"·본사 조립은 공사 전 준비)
//  - 신규 장비 현지 셋업: 장비 도착 전 라인마킹·하역·반입부터 소수 인원으로 시작해 점점 늘어난다.
//  - 일정에서 근거를 못 찾으면 공수가 처음 투입된 날로 잡고 근거 칸에 그렇게 적는다.
const JC_PROJECT = /(^|[^a-z])j\/?c([^a-z]|$)|형교환|해체|job\s*change/i;
const JC_START = /해체|(^|[^a-z])j\/?c([^a-z]|$)|job\s*change|형교환/i;
const NOT_WORK = /툴|부칙|자재|발송|준비|설계|발주|dr\b|fob|본사|하네스/i;
const SETUP_START = /라인\s*마킹|마킹|하역|반입|설치|set-?up|셋업|셋팅|세팅/i;

function isJcProject(project) {
  const texts = [project.name, ...(project.milestones || []).map((m) => m?.name)];
  return texts.some((t) => JC_PROJECT.test(String(t || '')));
}

export function detectWorkStart(project, summary) {
  const dates = Object.keys(summary.daily).sort();
  const firstManpower = dates[0] || '';
  const milestones = (project.milestones || []).filter((m) => m && m.name && m.startDate && m.endDate);

  // 일정 하나의 기간 안에서 공수가 처음 잡힌 날. 공수 데이터가 아예 없으면 일정 시작일.
  const startInside = (m) => {
    if (dates.length === 0) return m.startDate;
    return dates.find((d) => d >= m.startDate && d <= m.endDate) || '';
  };
  const pick = (re, basisLabel) => {
    const found = milestones
      .filter((m) => re.test(m.name) && !NOT_WORK.test(m.name))
      .map((m) => ({ m, date: startInside(m) }))
      .filter((x) => x.date)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    return found ? { date: found.date, basis: `${basisLabel}: '${found.m.name}'` } : null;
  };

  if (isJcProject(project)) {
    // 해체/J/C 일정. 단 "고객사 형교환 툴 부칙" 같은 자재 준비 일정은 NOT_WORK로 제외된다.
    const jc = pick(JC_START, 'J/C 공사 시작');
    if (jc) return jc;
  } else {
    const setup = pick(SETUP_START, '신규 셋업 공사 시작');
    if (setup) return setup;
  }
  if (firstManpower) return { date: firstManpower, basis: '공수 최초 투입일(일정에서 근거를 찾지 못함)' };
  return { date: '', basis: '' };
}

// 부서 열 순서: 기본 순서 먼저, 그 밖의 부서는 뒤에 붙인다
function orderDepts(keys) {
  const set = new Set(keys);
  const ordered = BASE_DEPT_ORDER.filter((k) => set.has(k));
  keys.forEach((k) => { if (!ordered.includes(k)) ordered.push(k); });
  return ordered;
}

function sheetFrom(rows, widths) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = widths.map((wch) => ({ wch }));
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  return ws;
}

export function buildProjectListWorkbook(projects) {
  const summaries = projects.map((p) => summarizeManpower(p));
  const deptKeys = orderDepts([...new Set(summaries.flatMap((s) => Object.keys(s.depts)))]);

  const starts = projects.map((p, i) => detectWorkStart(p, summaries[i]));

  const head = ['고객사', '제조번호', 'Site', 'Line', '프로젝트', '프로젝트 시작일', '프로젝트 종료일', '상태', '공사 시작일', '공사 종료일', '공사 시작일 판단 근거'];
  deptKeys.forEach((k) => head.push(`${deptLabel(k)} Total(M/D)`, `${deptLabel(k)} Peak(명)`));
  head.push('전체 Total(M/D)', '전체 Peak(명)');

  const listRows = [head];
  projects.forEach((p, i) => {
    const s = summaries[i];
    const row = [
      p.customer || '', stripHash(p.manufacturingNo), p.site || '', p.line || '', p.name || '',
      p.startDate || '', p.endDate || '', p.status || '', starts[i].date, s.workEnd, starts[i].basis,
    ];
    deptKeys.forEach((k) => {
      const d = s.depts[k];
      row.push(d && d.total > 0 ? d.total : '', d && d.peak > 0 ? d.peak : '');
    });
    row.push(s.total > 0 ? s.total : '', s.peak > 0 ? s.peak : '');
    listRows.push(row);
  });

  // 상세 공수: 마일스톤 기간 안의 일자별 인원을 부서마다 모아 Peak 인원과 M/D를 구한다
  const detailHead = ['제조번호', '프로젝트', '액티비티', '시작일', '종료일'];
  deptKeys.forEach((k) => detailHead.push(`${deptLabel(k)} 인원(명)`));
  detailHead.push('투입 M/D 합계', '일 최대 인원(명)', '구분');
  const detailRows = [detailHead];

  const windowStats = (s, from, to) => {
    const byDept = {};
    const dayTotals = {};
    Object.entries(s.depts).forEach(([k, slot]) => {
      Object.entries(slot.daily).forEach(([date, v]) => {
        if (date >= from && date <= to) {
          byDept[k] = Math.max(byDept[k] || 0, v);
          dayTotals[date] = (dayTotals[date] || 0) + v;
        }
      });
    });
    const md = Object.values(dayTotals).reduce((a, v) => a + v, 0);
    return { byDept, md, peak: Math.max(0, ...Object.values(dayTotals)) };
  };

  projects.forEach((p, i) => {
    const s = summaries[i];
    if (Object.keys(s.depts).length === 0) return;
    const milestones = [...(p.milestones || [])]
      .filter((m) => m && m.startDate && m.endDate)
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate));
    const covered = new Set();
    const workStart = starts[i].date;
    const push = (name, from, to, st) => {
      // 공사 시작일 앞의 투입(자재 수령·사전 방문 등)은 "공사 전 준비", 시작일이 든 일정은 "공사 시작"으로 표시
      let flag = '';
      if (workStart && to < workStart) flag = '공사 전 준비';
      else if (workStart && from <= workStart && workStart <= to) flag = '공사 시작';
      detailRows.push([
        stripHash(p.manufacturingNo), p.name || '', name, from, to,
        ...deptKeys.map((k) => st.byDept[k] || ''),
        st.md || '', st.peak || '', flag,
      ]);
    };
    milestones.forEach((m) => {
      const st = windowStats(s, m.startDate, m.endDate);
      if (st.md <= 0) return; // 공수가 투입되지 않는 일정(운송 등)은 제외
      Object.keys(s.daily).forEach((d) => { if (d >= m.startDate && d <= m.endDate) covered.add(d); });
      push(m.name || '', m.startDate, m.endDate, st);
    });
    // 어떤 마일스톤에도 속하지 않는 날에 투입된 공수
    const rest = Object.keys(s.daily).filter((d) => !covered.has(d)).sort();
    if (rest.length > 0) {
      const restSet = new Set(rest);
      const byDept = {};
      let md = 0;
      let peak = 0;
      rest.forEach((d) => {
        let dayTotal = 0;
        Object.entries(s.depts).forEach(([k, slot]) => {
          const v = slot.daily[d] || 0;
          if (v > 0 && restSet.has(d)) { byDept[k] = Math.max(byDept[k] || 0, v); dayTotal += v; }
        });
        md += dayTotal;
        peak = Math.max(peak, dayTotal);
      });
      push('(마일스톤 밖 기간)', rest[0], rest[rest.length - 1], { byDept, md, peak });
    }
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    sheetFrom(listRows, [14, 16, 14, 8, 34, 14, 14, 10, 12, 12, 40, ...deptKeys.flatMap(() => [14, 14]), 14, 14]),
    '프로젝트 목록',
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheetFrom(detailRows, [16, 34, 34, 12, 12, ...deptKeys.map(() => 12), 14, 14, 14]),
    '상세 공수',
  );
  return wb;
}

export function exportProjectList(projects, { customer = '', label = '' } = {}) {
  const wb = buildProjectListWorkbook(projects);
  const today = new Date().toISOString().slice(0, 10);
  const name = ['프로젝트목록', customer, label, today].filter(Boolean).join('_').replace(/[\\/:*?"<>|\s]+/g, '_');
  XLSX.writeFile(wb, `${name}.xlsx`);
}
