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

  const head = ['고객사', '제조번호', 'Site', 'Line', '프로젝트', '프로젝트 시작일', '프로젝트 종료일', '상태', '공사 시작일', '공사 종료일'];
  deptKeys.forEach((k) => head.push(`${deptLabel(k)} Total(M/D)`, `${deptLabel(k)} Peak(명)`));
  head.push('전체 Total(M/D)', '전체 Peak(명)');

  const listRows = [head];
  projects.forEach((p, i) => {
    const s = summaries[i];
    const row = [
      p.customer || '', stripHash(p.manufacturingNo), p.site || '', p.line || '', p.name || '',
      p.startDate || '', p.endDate || '', p.status || '', s.workStart, s.workEnd,
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
  detailHead.push('투입 M/D 합계', '일 최대 인원(명)');
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
    const push = (name, from, to, st) => {
      detailRows.push([
        stripHash(p.manufacturingNo), p.name || '', name, from, to,
        ...deptKeys.map((k) => st.byDept[k] || ''),
        st.md || '', st.peak || '',
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
    sheetFrom(listRows, [14, 16, 14, 8, 34, 14, 14, 10, 12, 12, ...deptKeys.flatMap(() => [14, 14]), 14, 14]),
    '프로젝트 목록',
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheetFrom(detailRows, [16, 34, 34, 12, 12, ...deptKeys.map(() => 12), 14, 14]),
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
