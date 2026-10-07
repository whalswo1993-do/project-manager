/**
 * Normalizes any variation of "북미JV" to "HSBMA" across all parts of the application.
 * Handles: "북미JV", "북미 JV", "북미-JV", "북미_JV", "북미 jv", standalone "북미", etc.
 */
export const normalizeJVName = s => {
  if (typeof s !== "string") return s || "";
  let res = s.replace(/북미[\s-_]*JV/gi, "HSBMA");
  res = res.replace(/\b북미\b/g, "HSBMA");
  res = res.replace(/북미(?=[\s-_]*(?:\d+L|Line|라인|ESS|배터리|공장))/gi, "HSBMA");
  if (res.trim() === "북미") res = "HSBMA";
  return res;
};

/**
 * 프로젝트의 실제 공사/셋업/이설/공수 투입 기간을 정밀 산출합니다.
 * - 공수가 처음 반영되는 시점 (dailyTotal > 0 또는 departments.daily > 0)
 * - 이설, J/C, 셋업, 설치, 조립 등의 마일스톤 시작/종료일자
 * - 둘 중 유효한 시점부터 공사 일정으로 계산합니다.
 */
export function getConstructionPeriod(p) {
  if (!p) return { startDate: '', endDate: '', hasConstructionData: false, scheduleType: 'none', reason: '' };

  // 1. 공수(Manpower) 투입 일자들 추출
  const mpDates = [];
  if (p.manpower?.dailyTotal) {
    Object.entries(p.manpower.dailyTotal).forEach(([dStr, val]) => {
      if (Number(val) > 0) mpDates.push(dStr);
    });
  }
  if (p.manpower?.departments) {
    Object.values(p.manpower.departments).forEach(dept => {
      if (dept?.daily) {
        Object.entries(dept.daily).forEach(([dStr, val]) => {
          if (Number(val) > 0 && !mpDates.includes(dStr)) mpDates.push(dStr);
        });
      }
    });
  }
  mpDates.sort();
  const firstMpDate = mpDates.length > 0 ? mpDates[0] : null;
  const lastMpDate = mpDates.length > 0 ? mpDates[mpDates.length - 1] : null;

  // 2. 공사 / 셋업 / 이설 / J/C 관련 마일스톤 탐색
  const constrKeywords = /이설|j[./]?c|job\s*change|셋업|setup|설치|세팅|시운전|조립|반입|현장|개조|공사/i;
  const constrMilestones = (p.milestones || []).filter(m => 
    m && m.name && constrKeywords.test(m.name) && m.startDate && m.endDate
  );

  let msStartDate = null;
  let msEndDate = null;
  if (constrMilestones.length > 0) {
    const sDates = constrMilestones.map(m => m.startDate).sort();
    const eDates = constrMilestones.map(m => m.endDate).sort();
    msStartDate = sDates[0];
    msEndDate = eDates[eDates.length - 1];
  }

  // 3. 시작일 및 종료일 결정
  let startDate = p.startDate;
  let endDate = p.endDate;
  let hasConstructionData = false;
  let scheduleType = 'full';
  let reason = '';

  if (firstMpDate && msStartDate) {
    startDate = firstMpDate < msStartDate ? firstMpDate : msStartDate;
    endDate = lastMpDate > msEndDate ? lastMpDate : msEndDate;
    hasConstructionData = true;
    scheduleType = 'construction';
    reason = `공수 투입(${firstMpDate}) 및 공사 마일스톤(${msStartDate})`;
  } else if (firstMpDate) {
    startDate = firstMpDate;
    endDate = lastMpDate;
    hasConstructionData = true;
    scheduleType = 'construction';
    reason = `공수 투입 기준 (${firstMpDate} ~ ${lastMpDate})`;
  } else if (msStartDate) {
    startDate = msStartDate;
    endDate = msEndDate;
    hasConstructionData = true;
    scheduleType = 'construction';
    reason = `공사/셋업 마일스톤 기준 (${msStartDate} ~ ${msEndDate})`;
  } else {
    reason = '프로젝트 전체 기간';
  }

  return {
    startDate: startDate || p.startDate,
    endDate: endDate || p.endDate,
    hasConstructionData,
    scheduleType,
    firstMpDate,
    lastMpDate,
    msStartDate,
    msEndDate,
    reason,
    constrMilestones
  };
}

/**
 * 특정 일자의 부서별 투입 인원 및 총합 집계
 */
export function getDailyDepartmentManpower(projects, dateStr) {
  const depts = {};
  let total = 0;
  const projectBreakdown = [];

  (projects || []).forEach(p => {
    let pDayTotal = 0;
    const pDepts = {};

    if (p.manpower?.departments) {
      Object.entries(p.manpower.departments).forEach(([deptKey, deptObj]) => {
        const val = Number(deptObj?.daily?.[dateStr]) || 0;
        if (val > 0) {
          depts[deptKey] = (depts[deptKey] || 0) + val;
          pDepts[deptKey] = val;
          pDayTotal += val;
        }
      });
    }

    if (pDayTotal === 0 && p.manpower?.dailyTotal?.[dateStr]) {
      const val = Number(p.manpower.dailyTotal[dateStr]) || 0;
      if (val > 0) {
        depts['공통'] = (depts['공통'] || 0) + val;
        pDepts['공통'] = val;
        pDayTotal += val;
      }
    }

    if (pDayTotal > 0) {
      total += pDayTotal;
      projectBreakdown.push({
        project: p,
        total: pDayTotal,
        depts: pDepts
      });
    }
  });

  return {
    date: dateStr,
    total,
    depts,
    projectBreakdown
  };
}

/**
 * 특정 월(year, monthIndex)의 일자별 부서별 매트릭스 집계
 */
export function getMonthDailyDeptMatrix(projects, year, monthIndex) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const days = [];
  const allDeptNames = new Set();
  const dayDataMap = {};

  for (let day = 1; day <= lastDay; day++) {
    const dStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    days.push(dStr);
    const dayStat = getDailyDepartmentManpower(projects, dStr);
    dayDataMap[dStr] = dayStat;
    Object.keys(dayStat.depts).forEach(dept => allDeptNames.add(dept));
  }

  const priority = ['기구', '제어', '비전', '설비기술', '배선', 'CS', 'PM', '공통'];
  const sortedDepts = Array.from(allDeptNames).sort((a, b) => {
    const ia = priority.indexOf(a);
    const ib = priority.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });

  return {
    year,
    month: monthIndex + 1,
    days,
    sortedDepts,
    dayDataMap
  };
}
