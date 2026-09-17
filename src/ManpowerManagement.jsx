import React, { useState, useMemo } from "react";
import "./ManpowerManagement.css";
import ExcelJS from "exceljs";
import PptxGenJS from "pptxgenjs";
import { normalizeJVName } from "./utils";

export const BASE_DEPT_ORDER = [
  "mechanical",
  "mechanical_sub",
  "vision",
  "vision_sub",
  "control",
  "control_sub",
  "electrical",
  "electrical_sub",
  "supervisor",
  "safety",
  "manager"
];
export const DEPT_ORDER = BASE_DEPT_ORDER;

export const DEPT_LABELS = {
  mechanical: "기구 (Mechanical)",
  mechanical_sub: "기구 외주 (Mech Sub)",
  vision: "비전 (Vision)",
  vision_sub: "비전 외주 (Vision Sub)",
  control: "제어 (Control)",
  control_sub: "제어 외주 (Control Sub)",
  electrical: "전장 (Electrical)",
  electrical_sub: "전장 외주 (Elec Sub)",
  supervisor: "슈퍼바이저 (Supervisor)",
  safety: "안전 (Safety)",
  manager: "소장 (Manager)"
};

export const DEPT_SHORT = {
  mechanical: "기구",
  mechanical_sub: "기구외주",
  vision: "비전",
  vision_sub: "비전외주",
  control: "제어",
  control_sub: "제어외주",
  electrical: "전장",
  electrical_sub: "전장외주",
  supervisor: "SV",
  safety: "안전",
  manager: "소장"
};

export const DEPT_COLORS = {
  mechanical: "#3b82f6",
  mechanical_sub: "#60a5fa",
  vision: "#8b5cf6",
  vision_sub: "#a855f7",
  control: "#10b981",
  control_sub: "#34d399",
  electrical: "#f59e0b",
  electrical_sub: "#d97706",
  supervisor: "#0284c7",
  safety: "#ef4444",
  manager: "#06b6d4"
};

export function getDeptLabel(key) {
  const norm = normalizeDeptKey(key);
  if (DEPT_LABELS[norm]) return DEPT_LABELS[norm];
  return key;
}

export function getDeptShort(key) {
  const norm = normalizeDeptKey(key);
  if (DEPT_SHORT[norm]) return DEPT_SHORT[norm];
  return key.slice(0, 2);
}

const DYNAMIC_PALETTE = ["#ec4899", "#6366f1", "#14b8a6", "#84cc16", "#e11d48", "#f97316", "#8b5cf6", "#06b6d4"];
export function getDeptColor(key) {
  const norm = normalizeDeptKey(key);
  if (DEPT_COLORS[norm]) return DEPT_COLORS[norm];
  let hash = 0;
  for (let i = 0; i < norm.length; i++) hash = norm.charCodeAt(i) + ((hash << 5) - hash);
  return DYNAMIC_PALETTE[Math.abs(hash) % DYNAMIC_PALETTE.length];
}

export function normalizeDeptKey(key) {
  if (!key) return "other";
  const s = String(key).toLowerCase().trim();

  // 0. Manager check
  if (s.includes("소장") || s.includes("manager") || s.includes("현장대리인") || s.includes("site mgr") || s.includes("field mgr")) return "manager";

  // 1. Check if it's an outsourced (외주) department
  const isSub = s.includes("외주") || s.includes("sub") || s.includes("협력") || s.includes("outsourc") || s.includes("엘라이트");

  if (isSub) {
    if (s.includes("vision") || s.includes("비전") || s.includes("비젼") || s.includes("vis") || s.includes("엘라이트")) return "vision_sub";
    if (s.includes("elec") || s.includes("전장") || s.includes("전기")) return "electrical_sub";
    if (s.includes("mech") || s.includes("기구")) return "mechanical_sub";
    if (s.includes("cont") || s.includes("제어")) return "control_sub";
    return "other_sub";
  }

  // 2. Pure internal departments (No 외주 keyword)
  if (s.includes("supervis") || s.includes("슈퍼바이저") || s.includes("sv") || s.includes("해체") || s.includes("장착") || s.includes("검수")) return "supervisor";
  if (s.includes("mech") || s.includes("기구")) return "mechanical";
  if (s.includes("vision") || s.includes("비전") || s.includes("비젼") || s.includes("vis")) return "vision";
  if (s.includes("cont") || s.includes("제어")) return "control";
  if (s.includes("elec") || s.includes("전장") || s.includes("전기")) return "electrical";
  if (s.includes("safe") || s.includes("안전")) return "safety";

  return s;
}

export function getProjectTotalManday(p) {
  const mp = p.manpower;
  if (!mp) return 0;
  if (mp.totalManday && Number(mp.totalManday) > 0) return Number(mp.totalManday);
  if (mp.departments) {
    let sum = 0;
    Object.values(mp.departments).forEach(d => {
      if (d?.total && Number(d.total) > 0) sum += Number(d.total);
      else if (d?.daily) {
        Object.values(d.daily).forEach(v => sum += Number(v) || 0);
      }
    });
    if (sum > 0) return sum;
  }
  if (mp.dailyTotal) {
    const sum = Object.values(mp.dailyTotal).reduce((a, b) => a + (Number(b) || 0), 0);
    if (sum > 0) return sum;
  }
  return 0;
}

// Helper to render Project Detail Card on PPT
function renderProjectDetailCard(slide, p, yTop, C, activeDeptKeys = BASE_DEPT_ORDER) {
  const cardW = 12.13;
  const cardH = 2.76;

  // Background Box
  slide.addShape("roundRect", {
    x: 0.6,
    y: yTop,
    w: cardW,
    h: cardH,
    fill: { color: C.white },
    line: { color: C.borderLight, width: 1 },
    rectRadius: 0.08
  });

  // Header Banner
  slide.addShape("roundRect", {
    x: 0.6,
    y: yTop,
    w: cardW,
    h: 0.42,
    fill: { color: "0F172A" },
    line: { color: "0F172A", width: 1 },
    rectRadius: 0.08
  });

  // Project Header Text
  slide.addText(
    [
      { text: `[${normalizeJVName(p.manufacturingNo) || "제조번호 없음"}]  `, options: { bold: true, color: "93C5FD", fontSize: 11 } },
      { text: `${normalizeJVName(p.name)}  `, options: { bold: true, color: C.white, fontSize: 12 } },
      { text: `(Site: ${normalizeJVName(p.site) || "-"} | Line: ${normalizeJVName(p.line) || "-"} | PM: ${p.pm || "-"})`, options: { color: "CBD5E1", fontSize: 9 } }
    ],
    { x: 0.8, y: yTop + 0.08, w: 7.2, h: 0.3, margin: 0 }
  );

  // Header Right Badges
  slide.addText(
    `기간 계획 공수: ${p.pRangeTotal.toLocaleString()} M/D  |  마스터플랜 총공수: ${p.pTotalManday > 0 ? p.pTotalManday.toLocaleString() + " M/D" : "-"}  |  편성 비중: ${p.ratio !== "-" ? p.ratio + "%" : "-"}`,
    { x: 6.8, y: yTop + 0.08, w: 5.7, h: 0.3, align: "right", color: "F8FAFC", bold: true, fontSize: 9.5, margin: 0 }
  );

  // Left Section: Mini KPI Stats
  const stats = [
    { lbl: "공수 편성 일정", val: `${p.firstActiveDate} ~ ${p.lastActiveDate}` },
    { lbl: "공수 편성 일수", val: `${p.activeDaysCount}일간 편성` },
    { lbl: "일일 최대 계획", val: `${p.pPeak}명 (${p.pPeakDate || "-"})` },
    { lbl: "주력 편성 부서", val: `${p.dominantDept} (${p.maxDeptVal} M/D, 비중 ${p.pRangeTotal > 0 ? ((p.maxDeptVal / p.pRangeTotal) * 100).toFixed(1) : 0}%)` }
  ];

  stats.forEach((st, i) => {
    const sy = yTop + 0.52 + i * 0.48;
    slide.addText(st.lbl, { x: 0.8, y: sy, w: 1.15, h: 0.38, fontSize: 8, color: C.gray, bold: true, margin: 0 });
    slide.addText(st.val, { x: 2.0, y: sy, w: 2.2, h: 0.38, fontSize: 8.5, color: C.navy, bold: true, margin: 0 });
  });

  // Middle Section: Dept Breakdown Mini Table (Dynamic across all active depts)
  const deptCols = (activeDeptKeys && activeDeptKeys.length > 0 ? activeDeptKeys : BASE_DEPT_ORDER);
  const deptHeader = ["부서", ...deptCols.map(k => getDeptShort(k))];
  const deptVals = [
    "공수",
    ...deptCols.map(k => `${p.pDepts?.[k] || 0}`)
  ];
  const deptPcts = [
    "비중",
    ...deptCols.map(k => p.pRangeTotal > 0 ? `${(((p.pDepts?.[k] || 0) / p.pRangeTotal) * 100).toFixed(0)}%` : "0%")
  ];

  const colCount = deptHeader.length;
  const colWFirst = 0.65;
  const colWRemaining = Math.max(0.35, (4.5 - colWFirst) / Math.max(1, colCount - 1));
  const colW = [colWFirst, ...Array(colCount - 1).fill(colWRemaining)];

  const deptTable = [
    deptHeader.map((t, idx) => ({
      text: t,
      options: { bold: true, color: C.white, fill: { color: idx === 0 ? C.navy : C.blue }, align: "center" }
    })),
    deptVals.map((t, idx) => ({
      text: t,
      options: { bold: idx > 0, color: idx === 0 ? C.slate : C.navy, align: "center" }
    })),
    deptPcts.map((t, idx) => ({
      text: t,
      options: { color: C.gray, align: "center", fontSize: 7.5 }
    }))
  ];

  slide.addTable(deptTable, {
    x: 4.35,
    y: yTop + 0.54,
    w: 4.3,
    h: 1.85,
    colW: colW,
    border: { type: "solid", pt: 0.5, color: C.borderLight },
    fontSize: 8,
    margin: 0.02,
    rowH: 0.52,
    valign: "middle"
  });

  // Right Section: Analysis Insight Comment Box
  slide.addShape("roundRect", {
    x: 8.8,
    y: yTop + 0.54,
    w: 3.75,
    h: 2.0,
    fill: { color: "F1F5F9" },
    line: { color: "CBD5E1", width: 1 },
    rectRadius: 0.06
  });

  slide.addText("💡 마스터 플랜 공수 분석 코멘트", {
    x: 8.95,
    y: yTop + 0.64,
    w: 3.45,
    h: 0.22,
    fontSize: 9,
    bold: true,
    color: C.navy,
    margin: 0
  });

  let insight1 = "";
  if (p.pTotalManday > 0 && p.pRangeTotal >= p.pTotalManday) {
    insight1 = `• 마스터 플랜 계획 공수(${p.pTotalManday} M/D) 기준 기간 내 전량(100%) 편성`;
  } else if (p.pTotalManday > 0) {
    insight1 = `• 마스터 플랜 전체 공수(${p.pTotalManday} M/D) 중 본 기간에 ${p.ratio}% 편성`;
  } else {
    insight1 = `• 마스터 플랜 기준 본 기간 총 ${p.pRangeTotal} M/D 공수 계획 편성 완료`;
  }

  let insight2 = `• 주력 공정: ${p.dominantDept} 기술 인력 집중 편성 (${p.maxDeptVal} M/D)`;
  let insight3 = p.pPeak > 0 ? `• 일일 최대 계획 인원은 ${p.pPeakDate}에 ${p.pPeak}명 편성` : "• 일일 공수 균등 편성 구간 유지";

  slide.addText(
    `${insight1}\n${insight2}\n${insight3}\n• 마스터 플랜 일정 기준 공수 계획 반영 완료`,
    {
      x: 8.95,
      y: yTop + 0.92,
      w: 3.45,
      h: 1.5,
      fontSize: 8,
      color: C.slate,
      margin: 0,
      lineSpacing: 15
    }
  );
}

// Reusable Synchronized Month Navigator Component
export function MonthNavigator({ currentDate, onPrev, onNext, onToday }) {
  const y = currentDate.getFullYear();
  const m = currentDate.getMonth() + 1;
  return (
    <div className="mp-month-navigator">
      <button className="mp-nav-btn" onClick={onPrev} title="이전 달">‹</button>
      <span className="mp-month-text">{y}년 {m}월</span>
      <button className="mp-nav-btn" onClick={onNext} title="다음 달">›</button>
      <button className="mp-today-btn" onClick={onToday}>이번달</button>
    </div>
  );
}

export default function ManpowerManagement({ projects = [], sites = [], onSelectProject }) {
  const [currentDate, setCurrentDate] = useState(() => {
    for (const p of projects) {
      if (p.manpower?.dailyTotal) {
        const dates = Object.keys(p.manpower.dailyTotal).sort();
        if (dates.length > 0) {
          const [y, m] = dates[0].split("-");
          return new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
        }
      }
    }
    return new Date();
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed
  const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;

  // View mode: 'month' (월간 단위) vs 'range' (기간 지정)
  const [viewMode, setViewMode] = useState("month");

  // Custom date range
  const [customStart, setCustomStart] = useState(() => `${year}-${String(month + 1).padStart(2, "0")}-01`);
  const [customEnd, setCustomEnd] = useState(() => {
    const endDt = new Date(year, month + 3, 0);
    return endDt.toISOString().slice(0, 10);
  });

  const [siteFilter, setSiteFilter] = useState("전체");
  const [deptFilter, setDeptFilter] = useState("전체");
  const [search, setSearch] = useState("");
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedProjectForDetail, setSelectedProjectForDetail] = useState(null);

  // Dynamic active departments computation: includes standard departments + any newly introduced departments from projects
  const activeDeptKeys = useMemo(() => {
    const presentDepts = new Set();
    projects.forEach(p => {
      if (p.manpower?.departments) {
        Object.keys(p.manpower.departments).forEach(rawD => {
          const norm = normalizeDeptKey(rawD);
          if (norm && norm !== "other") presentDepts.add(norm);
        });
      }
    });

    const ordered = [];
    BASE_DEPT_ORDER.forEach(k => {
      // Always include core departments (including vision_sub, electrical_sub, supervisor) or any present department
      if (presentDepts.has(k) || ["mechanical", "vision", "vision_sub", "control", "electrical", "electrical_sub", "supervisor"].includes(k)) {
        ordered.push(k);
      }
    });
    // Append any other dynamic departments that might not be in BASE_DEPT_ORDER
    presentDepts.forEach(k => {
      if (!ordered.includes(k)) {
        ordered.push(k);
      }
    });

    return ordered.length > 0 ? ordered : BASE_DEPT_ORDER;
  }, [projects]);

  // Synchronized month navigation handlers (affect all 3 navigators)
  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToToday = () => setCurrentDate(new Date());

  // Extract all dates present across all projects' manpower
  const allManpowerDates = useMemo(() => {
    const set = new Set();
    projects.forEach(p => {
      if (p.manpower?.dailyTotal) Object.keys(p.manpower.dailyTotal).forEach(d => set.add(d));
      if (p.manpower?.departments) {
        Object.values(p.manpower.departments).forEach(d => {
          if (d?.daily) Object.keys(d.daily).forEach(dt => set.add(dt));
        });
      }
    });
    return Array.from(set).sort();
  }, [projects]);

  // Determine effective query date range
  const { effectiveStartDate, effectiveEndDate, effectiveLabel } = useMemo(() => {
    if (viewMode === "month") {
      const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const end = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      return {
        effectiveStartDate: start,
        effectiveEndDate: end,
        effectiveLabel: `${year}년 ${month + 1}월`
      };
    } else {
      const start = customStart || `${year}-01-01`;
      const end = customEnd >= start ? customEnd : start;
      return {
        effectiveStartDate: start,
        effectiveEndDate: end,
        effectiveLabel: `${start} ~ ${end}`
      };
    }
  }, [viewMode, year, month, customStart, customEnd]);

  // Quick preset ranges
  const handleQuickPreset = (monthsCount) => {
    const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const endDt = new Date(year, month + monthsCount, 0);
    setCustomStart(start);
    setCustomEnd(endDt.toISOString().slice(0, 10));
    setViewMode("range");
  };

  const handleAllRange = () => {
    if (allManpowerDates.length > 0) {
      setCustomStart(allManpowerDates[0]);
      setCustomEnd(allManpowerDates[allManpowerDates.length - 1]);
    } else {
      setCustomStart(`${year}-01-01`);
      setCustomEnd(`${year}-12-31`);
    }
    setViewMode("range");
  };

  // Filter projects by site and search
  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const pSiteNorm = normalizeJVName(p.site);
      const siteFilterNorm = normalizeJVName(siteFilter);
      if (siteFilter !== "전체" && pSiteNorm !== siteFilterNorm && p.site !== siteFilter) return false;
      if (search.trim()) {
        const q = normalizeJVName(search.toLowerCase().trim()).toLowerCase();
        const rawQ = search.toLowerCase().trim();
        const match =
          (p.name && (p.name.toLowerCase().includes(q) || p.name.toLowerCase().includes(rawQ) || normalizeJVName(p.name).toLowerCase().includes(q))) ||
          (p.manufacturingNo && (p.manufacturingNo.toLowerCase().includes(q) || p.manufacturingNo.toLowerCase().includes(rawQ))) ||
          (p.line && (p.line.toLowerCase().includes(q) || p.line.toLowerCase().includes(rawQ))) ||
          (p.site && (p.site.toLowerCase().includes(q) || p.site.toLowerCase().includes(rawQ) || pSiteNorm.toLowerCase().includes(q)));
        if (!match) return false;
      }
      return true;
    });
  }, [projects, siteFilter, search]);

  // Aggregate daily manpower across filtered projects for effective range AND current visible month
  const { dailyData, periodTotalManday, periodDailyPeak, peakDates, deptTotals, projectsWithManpower } = useMemo(() => {
    const daily = {};
    let totalM = 0;
    let peakVal = 0;
    const peakD = [];
    const depts = {};
    activeDeptKeys.forEach(k => { depts[k] = 0; });
    const pList = [];

    const initDepts = () => {
      const obj = {};
      activeDeptKeys.forEach(k => { obj[k] = 0; });
      return obj;
    };

    // Ensure all days of the current visible month exist for the calendar
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= lastDayOfMonth; d++) {
      const dStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      daily[dStr] = {
        dateStr: dStr,
        dayNum: d,
        total: 0,
        departments: initDepts(),
        projectBreakdown: []
      };
    }

    // Also ensure all days in effectiveStartDate ~ effectiveEndDate exist
    const sDt = new Date(effectiveStartDate);
    const eDt = new Date(effectiveEndDate);
    for (let cur = new Date(sDt); cur <= eDt; cur.setDate(cur.getDate() + 1)) {
      const dStr = cur.toISOString().slice(0, 10);
      if (!daily[dStr]) {
        daily[dStr] = {
          dateStr: dStr,
          dayNum: cur.getDate(),
          total: 0,
          departments: initDepts(),
          projectBreakdown: []
        };
      }
    }

    filteredProjects.forEach(p => {
      const mp = p.manpower;
      if (!mp) return;
      let hasDataInRange = false;

      if (mp.departments) {
        Object.entries(mp.departments).forEach(([deptRaw, dData]) => {
          const normDept = normalizeDeptKey(deptRaw);
          if (deptFilter !== "전체" && normDept !== deptFilter) return;

          if (dData?.daily) {
            Object.entries(dData.daily).forEach(([dateStr, count]) => {
              const num = Number(count) || 0;
              if (num > 0 && daily[dateStr]) {
                daily[dateStr].departments[normDept] = (daily[dateStr].departments[normDept] || 0) + num;
                daily[dateStr].total += num;

                // Accumulate totals only within effective range
                if (dateStr >= effectiveStartDate && dateStr <= effectiveEndDate) {
                  hasDataInRange = true;
                  depts[normDept] = (depts[normDept] || 0) + num;
                  totalM += num;
                }

                let pb = daily[dateStr].projectBreakdown.find(x => x.projectId === p.id);
                if (!pb) {
                  pb = {
                    projectId: p.id,
                    manufacturingNo: normalizeJVName(p.manufacturingNo),
                    name: normalizeJVName(p.name),
                    site: normalizeJVName(p.site),
                    line: normalizeJVName(p.line),
                    total: 0,
                    departments: {}
                  };
                  daily[dateStr].projectBreakdown.push(pb);
                }
                pb.departments[normDept] = (pb.departments[normDept] || 0) + num;
                pb.total += num;
              }
            });
          }
        });
      } else if (mp.dailyTotal) {
        if (deptFilter === "전체") {
          Object.entries(mp.dailyTotal).forEach(([dateStr, count]) => {
            const num = Number(count) || 0;
            if (num > 0 && daily[dateStr]) {
              daily[dateStr].total += num;
              if (dateStr >= effectiveStartDate && dateStr <= effectiveEndDate) {
                hasDataInRange = true;
                totalM += num;
              }
              daily[dateStr].projectBreakdown.push({
                projectId: p.id,
                manufacturingNo: normalizeJVName(p.manufacturingNo),
                name: normalizeJVName(p.name),
                site: normalizeJVName(p.site),
                line: normalizeJVName(p.line),
                total: num,
                departments: {}
              });
            }
          });
        }
      }

      if (hasDataInRange) pList.push(p);
    });

    // Calculate peak within effective date range
    Object.entries(daily).forEach(([dStr, d]) => {
      if (dStr >= effectiveStartDate && dStr <= effectiveEndDate) {
        if (d.total > peakVal) {
          peakVal = d.total;
          peakD.length = 0;
          peakD.push(d.dateStr);
        } else if (d.total === peakVal && d.total > 0) {
          peakD.push(d.dateStr);
        }
      }
    });

    return {
      dailyData: daily,
      periodTotalManday: totalM,
      periodDailyPeak: peakVal,
      peakDates: peakD,
      deptTotals: depts,
      projectsWithManpower: pList
    };
  }, [filteredProjects, effectiveStartDate, effectiveEndDate, year, month, deptFilter, activeDeptKeys]);

  // Helper: compute manpower breakdown for each project within effective range
  const getProjectRangeData = (p) => {
    const mp = p.manpower;
    const pDepts = {};
    activeDeptKeys.forEach(k => { pDepts[k] = 0; });
    let pRangeTotal = 0;

    if (mp?.departments) {
      Object.entries(mp.departments).forEach(([rawD, dData]) => {
        const k = normalizeDeptKey(rawD);
        if (pDepts[k] === undefined) pDepts[k] = 0;
        if (dData?.daily) {
          Object.entries(dData.daily).forEach(([dateStr, count]) => {
            if (dateStr >= effectiveStartDate && dateStr <= effectiveEndDate) {
              const n = Number(count) || 0;
              pDepts[k] = (pDepts[k] || 0) + n;
              pRangeTotal += n;
            }
          });
        }
      });
    } else if (mp?.dailyTotal) {
      Object.entries(mp.dailyTotal).forEach(([dateStr, count]) => {
        if (dateStr >= effectiveStartDate && dateStr <= effectiveEndDate) {
          pRangeTotal += (Number(count) || 0);
        }
      });
    }
    return { pDepts, pRangeTotal };
  };

  // Calendar cells generation (42 cells: 6 weeks x 7 days) for the visible month
  const calendarCells = useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sunday
    const lastDate = new Date(year, month + 1, 0).getDate();
    const prevLastDate = new Date(year, month, 0).getDate();

    const cells = [];

    // Prev month padding
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const prevDateNum = prevLastDate - i;
      const prevDate = new Date(year, month - 1, prevDateNum);
      const dStr = prevDate.toISOString().slice(0, 10);
      cells.push({
        dateStr: dStr,
        dayNum: prevDateNum,
        isCurrentMonth: false,
        data: null
      });
    }

    // Current month days
    for (let d = 1; d <= lastDate; d++) {
      const dStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({
        dateStr: dStr,
        dayNum: d,
        isCurrentMonth: true,
        data: dailyData[dStr] || null
      });
    }

    // Next month padding
    const remaining = 42 - cells.length;
    for (let i = 1; i <= remaining; i++) {
      const nextDate = new Date(year, month + 1, i);
      const dStr = nextDate.toISOString().slice(0, 10);
      cells.push({
        dateStr: dStr,
        dayNum: i,
        isCurrentMonth: false,
        data: null
      });
    }

    return cells;
  }, [year, month, dailyData]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const [isExportingPPT, setIsExportingPPT] = useState(false);

  // PPT Export Function for Executive Reporting
  const exportManpowerPPT = async () => {
    if (isExportingPPT) return;
    setIsExportingPPT(true);

    try {
      const pptx = new PptxGenJS();
      pptx.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 inch
      pptx.author = "TW Project";
      pptx.company = "TW";
      pptx.title = `공수 통합 관리 보고서 (${effectiveLabel})`;
      pptx.subject = "마스터 플랜 기반 부서별 일일 투입 인원 및 전사 공수 모니터링";

      const C = {
        navy: "0F172A",
        navyDark: "020617",
        blue: "0969DA",
        blueLight: "EFF6FF",
        blueSoft: "DBEAFE",
        slate: "334155",
        gray: "64748B",
        lightGray: "F8FAFC",
        white: "FFFFFF",
        border: "CBD5E1",
        borderLight: "E2E8F0",
        red: "DC2626",
        redLight: "FEE2E2",
        green: "16A34A",
        greenLight: "DCFCE7",
        amber: "D97706",
        purple: "7C3AED"
      };

      // Helper to add Slide Header and Footer
      const addSlideHeader = (slide, title, subtitle, pageNum, totalPages) => {
        slide.background = { color: C.lightGray };
        // Title
        slide.addText(title, {
          x: 0.6,
          y: 0.3,
          w: 9.8,
          h: 0.42,
          fontSize: 18,
          bold: true,
          color: C.navy,
          margin: 0
        });
        // Subtitle
        slide.addText(subtitle, {
          x: 0.6,
          y: 0.74,
          w: 10.5,
          h: 0.22,
          fontSize: 9,
          color: C.gray,
          margin: 0
        });
        // Blue line divider
        slide.addShape("line", {
          x: 0.6,
          y: 1.02,
          w: 12.13,
          h: 0,
          line: { color: C.blue, width: 1.5 }
        });
        // Footer
        slide.addText(
          `TW 공수 통합 관리 시스템  |  보고서 생성일: ${new Date().toLocaleDateString("ko-KR")}  |  Page ${pageNum} / ${totalPages}`,
          {
            x: 0.6,
            y: 7.15,
            w: 12.13,
            h: 0.2,
            fontSize: 8,
            color: "94A3B8",
            align: "right",
            margin: 0
          }
        );
      };

      // 1. Calculate Target Months for Calendars
      let targetMonths = [];
      if (viewMode === "month") {
        targetMonths = [{ y: year, m: month }];
      } else {
        const sD = new Date(effectiveStartDate);
        const eD = new Date(effectiveEndDate);
        let cur = new Date(sD.getFullYear(), sD.getMonth(), 1);
        const endCur = new Date(eD.getFullYear(), eD.getMonth(), 1);
        while (cur <= endCur) {
          targetMonths.push({ y: cur.getFullYear(), m: cur.getMonth() });
          cur.setMonth(cur.getMonth() + 1);
        }
      }

      // 2. Project Analysis Data Preparation
      const analyzedProjects = filteredProjects.map(p => {
        const { pDepts, pRangeTotal } = getProjectRangeData(p);
        const pTotalManday = getProjectTotalManday(p);
        const ratio = pTotalManday > 0 ? ((pRangeTotal / pTotalManday) * 100).toFixed(1) : "-";

        // Find peak and active days in this project
        let pPeak = 0;
        let pPeakDate = "-";
        let activeDaysCount = 0;
        let activeDates = [];
        const mp = p.manpower;

        if (mp?.departments) {
          const datesSet = new Set();
          Object.values(mp.departments).forEach(d => {
            if (d?.daily) {
              Object.keys(d.daily).forEach(dt => {
                if (dt >= effectiveStartDate && dt <= effectiveEndDate) datesSet.add(dt);
              });
            }
          });
          datesSet.forEach(dt => {
            let daySum = 0;
            Object.values(mp.departments).forEach(d => {
              if (d?.daily?.[dt]) daySum += Number(d.daily[dt]) || 0;
            });
            if (daySum > 0) {
              activeDaysCount++;
              activeDates.push(dt);
              if (daySum > pPeak) {
                pPeak = daySum;
                pPeakDate = dt;
              }
            }
          });
        } else if (mp?.dailyTotal) {
          Object.entries(mp.dailyTotal).forEach(([dt, val]) => {
            const num = Number(val) || 0;
            if (dt >= effectiveStartDate && dt <= effectiveEndDate && num > 0) {
              activeDaysCount++;
              activeDates.push(dt);
              if (num > pPeak) {
                pPeak = num;
                pPeakDate = dt;
              }
            }
          });
        }

        activeDates.sort();
        const firstActiveDate = activeDates[0] || "-";
        const lastActiveDate = activeDates[activeDates.length - 1] || "-";

        // Dominant department
        let dominantDept = "-";
        let maxDeptVal = 0;
        Object.entries(pDepts).forEach(([k, v]) => {
          if (v > maxDeptVal) {
            maxDeptVal = v;
            dominantDept = DEPT_SHORT[k] || k;
          }
        });

        return {
          ...p,
          pDepts,
          pRangeTotal,
          pTotalManday,
          ratio,
          pPeak,
          pPeakDate,
          activeDaysCount,
          firstActiveDate,
          lastActiveDate,
          dominantDept,
          maxDeptVal
        };
      });

      // Active projects sorted by range total descending
      const activeProjects = analyzedProjects
        .filter(p => p.pRangeTotal > 0)
        .sort((a, b) => b.pRangeTotal - a.pRangeTotal);

      const displayActiveProjects = activeProjects.length > 0 ? activeProjects : analyzedProjects.slice(0, 6);

      // Pagination for Table Slide
      const PJT_PER_PAGE = 10;
      const tablePagesCount = Math.max(1, Math.ceil(filteredProjects.length / PJT_PER_PAGE));

      // Detailed Analysis Projects: up to 6 top projects (2 per slide)
      const detailPjtList = displayActiveProjects.slice(0, 6);
      const detailSlidesCount = Math.max(1, Math.ceil(detailPjtList.length / 2));

      // Total Slide Count Estimation
      const totalSlides = 1 + targetMonths.length + tablePagesCount + detailSlidesCount;
      let curPage = 1;

      // ==========================================
      // SLIDE 1: Executive Summary (종합 요약)
      // ==========================================
      const s1 = pptx.addSlide();
      addSlideHeader(
        s1,
        "공수 통합 관리 종합 현황 (Executive Summary)",
        `조회 대상: ${effectiveLabel}  |  Site 필터: ${siteFilter}  |  부서 필터: ${deptFilter}`,
        curPage++,
        totalSlides
      );

      // 4 KPI Cards
      const daysDiff = Math.max(1, Math.round((new Date(effectiveEndDate) - new Date(effectiveStartDate)) / 86400000) + 1);
      const dailyAvg = (periodTotalManday / daysDiff).toFixed(1);

      const kpis = [
        { title: "총 투입 공수", val: `${periodTotalManday.toLocaleString()} M/D`, desc: `조회 기간 누적 투입량`, color: C.blue },
        { title: "일일 Peak 인원", val: `${periodDailyPeak} 명`, desc: peakDates.length > 0 ? peakDates.slice(0, 2).join(", ") : "피크 없음", color: C.red },
        { title: "투입 프로젝트", val: `${projectsWithManpower.length} 개 PJT`, desc: `전체 ${filteredProjects.length}개 대상 프로젝트`, color: C.green },
        { title: "일일 평균 투입", val: `${dailyAvg} M/D`, desc: `총 ${daysDiff}일간 일평균 인원`, color: C.purple }
      ];

      kpis.forEach((k, i) => {
        const x = 0.6 + i * 3.12;
        s1.addShape("roundRect", {
          x,
          y: 1.2,
          w: 2.9,
          h: 1.12,
          fill: { color: C.white },
          line: { color: C.borderLight, width: 1 },
          rectRadius: 0.08
        });
        s1.addText(k.title, {
          x: x + 0.18,
          y: 1.32,
          w: 2.54,
          h: 0.22,
          fontSize: 9.5,
          color: C.gray,
          bold: true,
          margin: 0
        });
        s1.addText(k.val, {
          x: x + 0.18,
          y: 1.56,
          w: 2.54,
          h: 0.42,
          fontSize: 19,
          color: k.color,
          bold: true,
          margin: 0
        });
        s1.addText(k.desc, {
          x: x + 0.18,
          y: 2.02,
          w: 2.54,
          h: 0.2,
          fontSize: 7.5,
          color: "94A3B8",
          margin: 0
        });
      });

      // Split Section: Left - Department Breakdown Table
      s1.addText("부서별 공수 투입 현황 및 비중", {
        x: 0.6,
        y: 2.52,
        w: 5.85,
        h: 0.28,
        fontSize: 12,
        bold: true,
        color: C.navy,
        margin: 0
      });

      const deptTableRows = [
        [
          { text: "부서명", options: { bold: true, color: C.white, fill: { color: C.navy }, align: "center" } },
          { text: "투입 공수 (M/D)", options: { bold: true, color: C.white, fill: { color: C.navy }, align: "center" } },
          { text: "비중 (%)", options: { bold: true, color: C.white, fill: { color: C.navy }, align: "center" } }
        ]
      ];

      activeDeptKeys.forEach(k => {
        const val = deptTotals[k] || 0;
        const pct = periodTotalManday > 0 ? ((val / periodTotalManday) * 100).toFixed(1) : "0.0";
        deptTableRows.push([
          { text: getDeptLabel(k), options: { bold: true, color: C.navy, align: "left" } },
          { text: `${val.toLocaleString()} M/D`, options: { bold: true, color: C.blue, align: "right" } },
          { text: `${pct}%`, options: { align: "right", color: C.gray } }
        ]);
      });

      deptTableRows.push([
        { text: "전체 합계", options: { bold: true, color: C.navy, fill: { color: "E2E8F0" }, align: "left" } },
        { text: `${periodTotalManday.toLocaleString()} M/D`, options: { bold: true, color: C.blue, fill: { color: "E2E8F0" }, align: "right" } },
        { text: "100.0%", options: { bold: true, color: C.navy, fill: { color: "E2E8F0" }, align: "right" } }
      ]);

      s1.addTable(deptTableRows, {
        x: 0.6,
        y: 2.88,
        w: 5.85,
        h: 4.0,
        colW: [2.65, 1.8, 1.4],
        border: { type: "solid", pt: 0.5, color: C.borderLight },
        fontSize: 8.5,
        margin: 0.04,
        rowH: 0.35,
        valign: "middle"
      });

      // Split Section: Right - Top Projects Overview
      s1.addText("주요 투입 프로젝트 현황 (TOP 5)", {
        x: 6.88,
        y: 2.52,
        w: 5.85,
        h: 0.28,
        fontSize: 12,
        bold: true,
        color: C.navy,
        margin: 0
      });

      const topPjtRows = [
        [
          { text: "제조번호", options: { bold: true, color: C.white, fill: { color: C.blue }, align: "center" } },
          { text: "프로젝트명", options: { bold: true, color: C.white, fill: { color: C.blue }, align: "center" } },
          { text: "Site", options: { bold: true, color: C.white, fill: { color: C.blue }, align: "center" } },
          { text: "기간 계획", options: { bold: true, color: C.white, fill: { color: C.blue }, align: "center" } },
          { text: "편성 비중", options: { bold: true, color: C.white, fill: { color: C.blue }, align: "center" } }
        ]
      ];

      displayActiveProjects.slice(0, 5).forEach(p => {
        topPjtRows.push([
          { text: normalizeJVName(p.manufacturingNo) || "-", options: { align: "center", bold: true, color: C.slate } },
          { text: normalizeJVName(p.name) || "-", options: { align: "left", bold: true, color: C.navy } },
          { text: normalizeJVName(p.site) || "-", options: { align: "center", color: C.gray } },
          { text: `${p.pRangeTotal.toLocaleString()} M/D`, options: { align: "right", bold: true, color: C.blue } },
          { text: p.ratio !== "-" ? `${p.ratio}%` : "-", options: { align: "right", bold: true, color: C.green } }
        ]);
      });

      if (displayActiveProjects.length === 0) {
        topPjtRows.push([
          { text: "해당 기간 공수 편성된 프로젝트가 없습니다.", options: { colspan: 5, align: "center", color: C.gray } }
        ]);
      }

      s1.addTable(topPjtRows, {
        x: 6.88,
        y: 2.88,
        w: 5.85,
        h: 4.0,
        colW: [1.2, 2.25, 0.8, 1.0, 0.6],
        border: { type: "solid", pt: 0.5, color: C.borderLight },
        fontSize: 8.5,
        margin: 0.04,
        rowH: 0.45,
        valign: "middle"
      });

      // ==========================================
      // SLIDE 2+: Monthly Calendar Slides (월별 달력)
      // ==========================================
      targetMonths.forEach(({ y: curY, m: curM }) => {
        const sCal = pptx.addSlide();

        const daysInCurMonth = new Date(curY, curM + 1, 0).getDate();
        let mTotal = 0;
        let mPeak = 0;
        let mPeakDate = "-";

        for (let d = 1; d <= daysInCurMonth; d++) {
          const dStr = `${curY}-${String(curM + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const dData = dailyData[dStr];
          if (dData && dData.total > 0) {
            mTotal += dData.total;
            if (dData.total > mPeak) {
              mPeak = dData.total;
              mPeakDate = dStr;
            }
          }
        }

        addSlideHeader(
          sCal,
          `${curY}년 ${curM + 1}월 공수 투입 달력`,
          `월간 투입 공수: ${mTotal.toLocaleString()} M/D  |  일일 Peak: ${mPeak}명 (${mPeakDate || "-"})  |  전체 조회 기간: ${effectiveLabel}`,
          curPage++,
          totalSlides
        );

        const firstDayOfWeek = new Date(curY, curM, 1).getDay();
        const totalWeeks = Math.ceil((firstDayOfWeek + daysInCurMonth) / 7);

        const calRows = [];

        // Weekday Header (기존 대비 약 1/3 수준으로 슬림하게 축소)
        const weekdays = ["일 (Sun)", "월 (Mon)", "화 (Tue)", "수 (Wed)", "목 (Thu)", "금 (Fri)", "토 (Sat)"];
        calRows.push(
          weekdays.map((w, idx) => ({
            text: w,
            options: {
              bold: true,
              color: idx === 0 ? "FCA5A5" : idx === 6 ? "93C5FD" : C.white,
              fill: { color: C.navy },
              align: "center",
              valign: "middle",
              fontSize: 7.5,
              margin: 0
            }
          }))
        );

        // Week Rows
        let dayCounter = 1;
        for (let w = 0; w < totalWeeks; w++) {
          const rowCells = [];
          for (let col = 0; col < 7; col++) {
            const cellIndex = w * 7 + col;
            if (cellIndex < firstDayOfWeek || dayCounter > daysInCurMonth) {
              rowCells.push({
                text: "",
                options: {
                  fill: { color: "F8FAFC" },
                  border: { type: "solid", pt: 0.5, color: "E2E8F0" }
                }
              });
            } else {
              const dNum = dayCounter;
              const dStr = `${curY}-${String(curM + 1).padStart(2, "0")}-${String(dNum).padStart(2, "0")}`;
              const dData = dailyData[dStr];
              const isInRange = dStr >= effectiveStartDate && dStr <= effectiveEndDate;

              let cellFill = C.white;
              let textRuns = [];

              if (dData && dData.total > 0) {
                const isPeak = dData.total === mPeak && mPeak > 0;
                if (isPeak) cellFill = C.redLight;
                else if (dData.total >= 5) cellFill = C.blueSoft;
                else cellFill = C.blueLight;

                // 1. Date & M/D: Text 7.5, M/D 8
                textRuns.push({
                  text: `${dNum}일 `,
                  options: { fontSize: 7.5, bold: true, color: col === 0 ? C.red : col === 6 ? C.blue : C.navy }
                });
                textRuns.push({
                  text: `[${dData.total} M/D]\n`,
                  options: { fontSize: 8, bold: true, color: isPeak ? C.red : C.blue }
                });

                // 2. Department summary: Text 7.5
                const deptsActive = [];
                Object.entries(dData.departments || {}).forEach(([dk, val]) => {
                  if (val > 0) deptsActive.push(`${getDeptShort(dk)}${val}`);
                });

                if (deptsActive.length > 0) {
                  textRuns.push({
                    text: `${deptsActive.slice(0, 3).join(" ")}\n`,
                    options: { fontSize: 7.5, color: C.gray }
                  });
                }

                // 3. Project name summary: Text 7.5
                const pList = dData.projectBreakdown || [];
                if (pList.length > 0) {
                  const pName = normalizeJVName(pList[0].manufacturingNo || pList[0].name);
                  const pExtra = pList.length > 1 ? ` 외 ${pList.length - 1}건` : "";
                  textRuns.push({
                    text: `${pName}${pExtra}`,
                    options: { fontSize: 7.5, color: C.slate }
                  });
                }
              } else {
                textRuns.push({
                  text: `${dNum}`,
                  options: {
                    fontSize: 7.5,
                    bold: true,
                    color: !isInRange ? "CBD5E1" : col === 0 ? C.red : col === 6 ? C.blue : C.gray
                  }
                });
              }

              rowCells.push({
                text: textRuns,
                options: {
                  fill: { color: cellFill },
                  valign: "top",
                  align: "left",
                  margin: 0.02,
                  border: { type: "solid", pt: 0.5, color: C.borderLight }
                }
              });

              dayCounter++;
            }
          }
          calRows.push(rowCells);
        }

        const colWidth = 12.13 / 7;
        const totalHeight = 5.45;
        const headerH = 0.22; // 기존 0.8~1.0 대비 약 1/3 수준으로 축소
        const weekRowH = (totalHeight - headerH) / totalWeeks;
        const rowHeights = [headerH, ...Array(totalWeeks).fill(weekRowH)];

        sCal.addTable(calRows, {
          x: 0.6,
          y: 1.25,
          w: 12.13,
          h: totalHeight,
          colW: [colWidth, colWidth, colWidth, colWidth, colWidth, colWidth, colWidth],
          margin: 0.02,
          rowH: rowHeights,
          border: { type: "solid", pt: 0.5, color: C.borderLight },
          autoFit: false
        });
      });

      // ==========================================
      // SLIDE: Project Overview Tables (프로젝트별 현황 표)
      // ==========================================
      for (let pIdx = 0; pIdx < tablePagesCount; pIdx++) {
        const sTbl = pptx.addSlide();
        const start = pIdx * PJT_PER_PAGE;
        const pagePjtSlice = filteredProjects.slice(start, start + PJT_PER_PAGE);

        addSlideHeader(
          sTbl,
          `프로젝트별 마스터 플랜 공수 편성 현황 (${pIdx + 1}/${tablePagesCount})`,
          `조회 대상: ${effectiveLabel}  |  투입 단위: Man-Day (M/D)`,
          curPage++,
          totalSlides
        );

        const tableRows = [
          [
            { text: "제조번호", options: { bold: true, color: C.white, fill: { color: C.navy }, align: "center" } },
            { text: "Site", options: { bold: true, color: C.white, fill: { color: C.navy }, align: "center" } },
            { text: "Line", options: { bold: true, color: C.white, fill: { color: C.navy }, align: "center" } },
            { text: "프로젝트명", options: { bold: true, color: C.white, fill: { color: C.navy }, align: "center" } },
            ...activeDeptKeys.map(k => ({
              text: getDeptShort(k),
              options: { bold: true, color: C.white, fill: { color: C.navy }, align: "center" }
            })),
            { text: "기간 계획 공수", options: { bold: true, color: C.white, fill: { color: C.blue }, align: "center" } },
            { text: "마스터플랜 총공수", options: { bold: true, color: C.white, fill: { color: C.navy }, align: "center" } },
            { text: "편성 비중", options: { bold: true, color: C.white, fill: { color: C.green }, align: "center" } }
          ]
        ];

        pagePjtSlice.forEach(p => {
          const { pDepts, pRangeTotal } = getProjectRangeData(p);
          const pTotalManday = getProjectTotalManday(p);
          const ratio = pTotalManday > 0 ? ((pRangeTotal / pTotalManday) * 100).toFixed(1) + "%" : "-";

          tableRows.push([
            { text: normalizeJVName(p.manufacturingNo) || "-", options: { align: "center", bold: true, color: C.slate } },
            { text: normalizeJVName(p.site) || "-", options: { align: "center", color: C.gray } },
            { text: normalizeJVName(p.line) || "-", options: { align: "center", color: C.gray } },
            { text: normalizeJVName(p.name) || "-", options: { align: "left", bold: true, color: C.navy } },
            ...activeDeptKeys.map(k => ({
              text: pDepts[k] > 0 ? String(pDepts[k]) : "-",
              options: { align: "right" }
            })),
            { text: pRangeTotal > 0 ? `${pRangeTotal} M/D` : "-", options: { align: "right", bold: true, color: C.blue } },
            { text: pTotalManday > 0 ? `${pTotalManday} M/D` : "-", options: { align: "right", color: C.slate } },
            { text: ratio, options: { align: "right", bold: true, color: ratio !== "-" ? C.green : C.gray } }
          ]);
        });

        // Add summary row on the last page
        if (pIdx === tablePagesCount - 1) {
          const allTotalMandaySum = filteredProjects.reduce((acc, p) => acc + getProjectTotalManday(p), 0);
          tableRows.push([
            { text: "합계 (Total)", options: { colspan: 4, bold: true, color: C.navy, fill: { color: "E2E8F0" }, align: "center" } },
            ...activeDeptKeys.map(k => ({
              text: String(deptTotals[k] || 0),
              options: { bold: true, color: C.navy, fill: { color: "E2E8F0" }, align: "right" }
            })),
            { text: `${periodTotalManday} M/D`, options: { bold: true, color: C.blue, fill: { color: "E2E8F0" }, align: "right" } },
            { text: `${allTotalMandaySum} M/D`, options: { bold: true, color: C.navy, fill: { color: "E2E8F0" }, align: "right" } },
            { text: allTotalMandaySum > 0 ? `${((periodTotalManday / allTotalMandaySum) * 100).toFixed(1)}%` : "-", options: { bold: true, color: C.green, fill: { color: "E2E8F0" }, align: "right" } }
          ]);
        }

        const baseW = [1.2, 0.7, 0.7, 2.2];
        const endW = [1.1, 1.1, 0.8];
        const remainingW = 12.13 - (1.2 + 0.7 + 0.7 + 2.2 + 1.1 + 1.1 + 0.8);
        const deptW = Math.max(0.4, remainingW / Math.max(1, activeDeptKeys.length));
        const colW = [...baseW, ...Array(activeDeptKeys.length).fill(deptW), ...endW];

        sTbl.addTable(tableRows, {
          x: 0.6,
          y: 1.25,
          w: 12.13,
          h: 5.6,
          colW: colW,
          border: { type: "solid", pt: 0.5, color: C.borderLight },
          fontSize: 8,
          margin: 0.04,
          rowH: 0.35,
          valign: "middle"
        });
      }

      // ==========================================
      // SLIDE: Project Deep Dive / Detailed Analysis (프로젝트별 상세 분석)
      // ==========================================
      for (let dIdx = 0; dIdx < detailSlidesCount; dIdx++) {
        const sDtl = pptx.addSlide();
        const p1 = detailPjtList[dIdx * 2];
        const p2 = detailPjtList[dIdx * 2 + 1];

        addSlideHeader(
          sDtl,
          `주요 프로젝트별 마스터 플랜 공수 상세 분석 (${dIdx + 1}/${detailSlidesCount})`,
          `마스터 플랜 기준 부서별 공수 편성 비중, 일정 계획, 일일 최대 편성 인원 상세 분석`,
          curPage++,
          totalSlides
        );

        // Render Project 1 (Top Card)
        if (p1) renderProjectDetailCard(sDtl, p1, 1.2, C, activeDeptKeys);

        // Render Project 2 (Bottom Card)
        if (p2) renderProjectDetailCard(sDtl, p2, 4.2, C, activeDeptKeys);
      }

      // Save PPT File
      const fileLabel = viewMode === "month" ? `${year}년_${month + 1}월` : `${effectiveStartDate}_${effectiveEndDate}`;
      await pptx.writeFile({ fileName: `TW_공수보고서_${fileLabel}.pptx` });
    } catch (err) {
      console.error("PPT 생성 실패:", err);
      alert("PPT 생성 실패: " + err.message);
    } finally {
      setIsExportingPPT(false);
    }
  };

  return (
    <div className="manpower-dashboard">
      {/* Top Header Card */}
      <div className="mp-header-card">
        <div className="mp-title-group">
          <div className="mp-logo-icon">📊</div>
          <div className="mp-title-text">
            <h2><span style={{ color: "#0969da" }}>공수</span> 통합 관리 시스템 (Manpower Management)</h2>
            <p>마스터 플랜 기반 부서별 일일 투입 인원 및 전사 공수 종합 모니터링</p>
          </div>
        </div>
      </div>

      {/* Filter and Action Bar */}
      <div className="mp-controls-bar">
        {/* Row 1: View Mode & Date Range Picker */}
        <div className="mp-controls-row">
          <div className="mp-mode-toggle">
            <button
              className={`mp-mode-btn ${viewMode === "month" ? "active" : ""}`}
              onClick={() => setViewMode("month")}
            >
              🗓️ 월간 단위 조회
            </button>
            <button
              className={`mp-mode-btn ${viewMode === "range" ? "active" : ""}`}
              onClick={() => setViewMode("range")}
            >
              📆 기간 지정 조회
            </button>
          </div>

          {viewMode === "range" ? (
            <div className="mp-date-range-group">
              <span className="mp-date-range-label">조회 기간:</span>
              <input
                type="date"
                className="mp-date-input"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
              />
              <span className="mp-date-sep">~</span>
              <input
                type="date"
                className="mp-date-input"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
              />
              <div className="mp-quick-btns">
                <button className="mp-quick-btn" onClick={() => handleQuickPreset(1)}>1개월</button>
                <button className="mp-quick-btn" onClick={() => handleQuickPreset(3)}>3개월</button>
                <button className="mp-quick-btn" onClick={() => handleQuickPreset(6)}>6개월</button>
                <button className="mp-quick-btn" onClick={handleAllRange}>전체 기간</button>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: "13px", color: "#64748b" }}>
              선택 기준월: <b style={{ color: "#0969da" }}>{year}년 {month + 1}월</b>
            </div>
          )}
        </div>

        {/* Row 2: Filters & PPT Export Button */}
        <div className="mp-controls-row">
          <div className="mp-filter-group">
            <label style={{ fontSize: "12px", fontWeight: "bold", color: "#475569" }}>Site 필터:</label>
            <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)}>
              <option value="전체">전체 Site</option>
              {sites.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>

            <label style={{ fontSize: "12px", fontWeight: "bold", color: "#475569" }}>부서 필터:</label>
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
              <option value="전체">전체 부서</option>
              {activeDeptKeys.map(k => (
                <option key={k} value={k}>{getDeptLabel(k)}</option>
              ))}
            </select>

            <input
              type="text"
              placeholder="프로젝트, 제조번호 검색..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <button
            className="mp-ppt-btn"
            onClick={exportManpowerPPT}
            disabled={isExportingPPT}
            title="공수 현황 및 프로젝트 상세 분석 보고서 PPT 다운로드"
          >
            {isExportingPPT ? "⏳ PPT 보고서 생성 중..." : `📊 공수 보고서 PPT 다운로드 (${viewMode === "month" ? `${month + 1}월` : "지정기간"})`}
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="mp-kpi-grid">
        <div className="mp-kpi-card total">
          <div className="mp-kpi-label"><span>📌</span> 총 투입 공수 ({effectiveLabel})</div>
          <div className="mp-kpi-val">{periodTotalManday.toLocaleString()} <span style={{ fontSize: "16px" }}>M/D</span></div>
          <div className="mp-kpi-sub">{effectiveLabel} 기준 합산</div>
        </div>

        <div className="mp-kpi-card peak">
          <div className="mp-kpi-label"><span>⚡</span> 일일 피크 (최대 인원)</div>
          <div className="mp-kpi-val" style={{ color: "#dc2626" }}>{periodDailyPeak} <span style={{ fontSize: "16px" }}>명</span></div>
          <div className="mp-kpi-sub">
            {peakDates.length > 0 ? `최대 투입일: ${peakDates.slice(0, 3).map(d => d.slice(5)).join(", ")}${peakDates.length > 3 ? ` 외 ${peakDates.length - 3}일` : ""}` : "투입 인원 없음"}
          </div>
        </div>

        <div className="mp-kpi-card projects">
          <div className="mp-kpi-label"><span>🏢</span> 공수 운영 프로젝트</div>
          <div className="mp-kpi-val">{projectsWithManpower.length} <span style={{ fontSize: "16px" }}>개</span></div>
          <div className="mp-kpi-sub">조회 대상 {filteredProjects.length}개 프로젝트 중</div>
        </div>

        <div className="mp-kpi-card depts">
          <div className="mp-kpi-label"><span>👥</span> 최다 투입 부서</div>
          <div className="mp-kpi-val" style={{ fontSize: "20px", marginTop: "4px" }}>
            {(() => {
              const entries = Object.entries(deptTotals).sort((a, b) => b[1] - a[1]);
              if (entries[0] && entries[0][1] > 0) {
                return `${DEPT_SHORT[entries[0][0]]} (${entries[0][1]} M/D)`;
              }
              return "-";
            })()}
          </div>
          <div className="mp-kpi-sub">부서별 인력 배분 현황</div>
        </div>
      </div>

      {/* Department Breakdown Banner */}
      <div className="mp-dept-banner">
        <h3><span>📈</span> 부서별 공수 투입 현황 ({effectiveLabel})</h3>
        <div className="mp-dept-tags">
          {activeDeptKeys.map(deptKey => {
            const count = deptTotals[deptKey] || 0;
            const pct = periodTotalManday > 0 ? Math.round((count / periodTotalManday) * 100) : 0;
            return (
              <div className="mp-dept-tag" key={deptKey} style={{ borderLeft: `4px solid ${getDeptColor(deptKey)}` }}>
                <div className="mp-dept-tag-name">{getDeptLabel(deptKey)}</div>
                <div className="mp-dept-tag-val">
                  {count.toLocaleString()} M/D <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "normal" }}>({pct}%)</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Manpower Calendar View */}
      <div className="mp-calendar-section">
        <div className="mp-cal-head">
          <div>
            <h3 style={{ margin: "0 0 4px 0" }}>📅 일별 전사 인력 투입 달력 ({year}년 {month + 1}월)</h3>
            <span style={{ fontSize: "12px", color: "#64748b" }}>
              * 날짜를 클릭하면 해당 일자의 프로젝트별 세부 투입 명단을 볼 수 있습니다.
              {viewMode === "range" && ` (전체 지정 기간: ${effectiveStartDate} ~ ${effectiveEndDate})`}
            </span>
          </div>
          {/* Synchronized Month Navigator in Calendar */}
          <MonthNavigator currentDate={currentDate} onPrev={prevMonth} onNext={nextMonth} onToday={goToToday} />
        </div>

        <div className="mp-cal-weekdays">
          <span>일</span>
          <span>월</span>
          <span>화</span>
          <span>수</span>
          <span>목</span>
          <span>금</span>
          <span>토</span>
        </div>

        <div className="mp-cal-grid">
          {calendarCells.map((cell, idx) => {
            const isToday = cell.dateStr === todayStr;
            const hasData = cell.data && cell.data.total > 0;
            const isPeak = hasData && cell.data.total === periodDailyPeak && periodDailyPeak > 0;

            let badgeClass = "mp-headcount-badge";
            if (cell.data && cell.data.total >= 10) badgeClass += " high";
            else if (cell.data && cell.data.total >= 5) badgeClass += " mid";

            return (
              <div
                key={idx}
                className={`mp-cal-day ${!cell.isCurrentMonth ? "other-month" : ""} ${isToday ? "is-today" : ""} ${isPeak ? "has-peak" : ""}`}
                onClick={() => cell.data && setSelectedDay(cell.data)}
              >
                <div className="mp-day-top">
                  <span className="mp-day-num">{cell.dayNum}</span>
                  {hasData && (
                    <span className={badgeClass} title="당일 총 투입 인원">
                      👥 {cell.data.total}명
                    </span>
                  )}
                </div>

                {hasData && (
                  <>
                    <div className="mp-day-depts">
                      {Object.entries(cell.data.departments).map(([dKey, cnt]) => {
                        if (cnt <= 0) return null;
                        return (
                          <span key={dKey} style={{ borderLeft: `2px solid ${getDeptColor(dKey)}` }}>
                            {getDeptShort(dKey)} {cnt}
                          </span>
                        );
                      })}
                    </div>
                    <div className="mp-day-projs" title={cell.data.projectBreakdown.map(p => normalizeJVName(p.name)).join(", ")}>
                      {cell.data.projectBreakdown.length}개 프로젝트 진행중
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Project Breakdown Table */}
      <div className="mp-table-section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <h3 style={{ margin: "0 0 4px 0" }}>🏢 프로젝트별 공수 현황 ({effectiveLabel})</h3>
            <span style={{ fontSize: "12px", color: "#64748b" }}>
              * {viewMode === "range" ? `지정 기간(${effectiveStartDate} ~ ${effectiveEndDate})` : `상단 달력의 기준월(${year}년 {month + 1}월)`}에 투입된 프로젝트별 공수 데이터입니다.
            </span>
          </div>
          {/* Synchronized Month Navigator in Table Section */}
          <MonthNavigator currentDate={currentDate} onPrev={prevMonth} onNext={nextMonth} onToday={goToToday} />
        </div>
        <div className="mp-table-wrapper">
          <table className="mp-table">
            <thead>
              <tr>
                <th>제조번호</th>
                <th>Site · Line</th>
                <th>프로젝트명</th>
                {activeDeptKeys.map(k => (
                  <th key={k} style={{ textAlign: "center" }}>{getDeptShort(k)}</th>
                ))}
                <th style={{ textAlign: "center", color: "#1d4ed8" }}>
                  {viewMode === "range" ? "기간 투입 공수" : `${month + 1}월 투입 공수`}
                </th>
                <th style={{ textAlign: "center", background: "#f1f5f9", color: "#0f172a" }}>프로젝트 총 공수</th>
                <th style={{ textAlign: "center" }}>상세</th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.map(p => {
                const mp = p.manpower;
                const { pDepts, pRangeTotal } = getProjectRangeData(p);
                const pTotalManday = getProjectTotalManday(p);

                const effectiveTotal = pTotalManday > 0 ? pTotalManday : (pRangeTotal > 0 ? pRangeTotal : 0);
                const progressRate = effectiveTotal > 0 && pRangeTotal > 0 ? Math.round((pRangeTotal / effectiveTotal) * 100) : 0;

                return (
                  <tr key={p.id}>
                    <td><b>{normalizeJVName(p.manufacturingNo) || "-"}</b></td>
                    <td>{normalizeJVName(p.site) || "-"} {p.line ? `· Line ${normalizeJVName(p.line)}` : ""}</td>
                    <td>
                      <div style={{ fontWeight: 600, color: "#0f172a" }}>{normalizeJVName(p.name)}</div>
                      {effectiveTotal > 0 ? (
                        <div style={{ fontSize: "11px", color: "#475569", marginTop: "2px" }}>
                          프로젝트 총 공수: <b style={{ color: "#059669" }}>{effectiveTotal.toLocaleString()} M/D</b>
                        </div>
                      ) : (
                        <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>
                          공수 미등록
                        </div>
                      )}
                    </td>
                    {activeDeptKeys.map(k => (
                      <td key={k} style={{ textAlign: "center" }}>{pDepts[k] ? `${pDepts[k]}명` : "-"}</td>
                    ))}
                    <td style={{ textAlign: "center" }}>
                      <span style={{ fontWeight: "bold", color: pRangeTotal > 0 ? "#1d4ed8" : "#94a3b8", fontSize: "14px" }}>
                        {pRangeTotal > 0 ? `${pRangeTotal.toLocaleString()} M/D` : "-"}
                      </span>
                    </td>
                    <td style={{ textAlign: "center", background: "#f8fafc" }}>
                      {effectiveTotal > 0 ? (
                        <div>
                          <span style={{ fontWeight: "800", color: "#0f172a", fontSize: "14px" }}>
                            {effectiveTotal.toLocaleString()} M/D
                          </span>
                          {pRangeTotal > 0 && (
                            <div style={{ fontSize: "11px", color: "#059669", fontWeight: 600, marginTop: "1px" }}>
                              {viewMode === "range" ? "기간" : "당월"} {progressRate}%
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: "#94a3b8" }}>-</span>
                      )}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        onClick={() => setSelectedProjectForDetail(p)}
                        style={{
                          background: mp ? "#eff6ff" : "#f1f5f9",
                          color: mp ? "#1d4ed8" : "#64748b",
                          border: mp ? "1px solid #bfdbfe" : "1px solid #cbd5e1",
                          borderRadius: "6px",
                          padding: "4px 8px",
                          fontSize: "11px",
                          fontWeight: "bold",
                          cursor: "pointer"
                        }}
                      >
                        {mp ? "공수 상세" : "공수 조회"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filteredProjects.length > 0 && (
              <tfoot>
                <tr style={{ background: "#f1f5f9", fontWeight: "bold", borderTop: "2px solid #cbd5e1" }}>
                  <td colSpan={3} style={{ textAlign: "center", padding: "10px" }}>
                    {viewMode === "range" ? "지정 기간 합산" : "당월 합산"}
                  </td>
                  {activeDeptKeys.map(k => (
                    <td key={k} style={{ textAlign: "center" }}>{deptTotals[k] > 0 ? `${deptTotals[k]} M/D` : "-"}</td>
                  ))}
                  <td style={{ textAlign: "center", color: "#1d4ed8", fontSize: "14px" }}>
                    {periodTotalManday > 0 ? `${periodTotalManday.toLocaleString()} M/D` : "-"}
                  </td>
                  <td style={{ textAlign: "center", color: "#0f172a", fontSize: "14px", background: "#e2e8f0" }}>
                    {filteredProjects.reduce((sum, p) => sum + getProjectTotalManday(p), 0).toLocaleString()} M/D
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Day Detail Modal */}
      {selectedDay && (
        <div className="mp-modal-backdrop" onMouseDown={() => setSelectedDay(null)}>
          <div className="mp-modal-card" onMouseDown={e => e.stopPropagation()}>
            <div className="mp-modal-head">
              <div>
                <h3>📅 {selectedDay.dateStr} 일일 전사 공수 현황</h3>
                <p>당일 총 투입 인원: <b style={{ color: "#dc2626", fontSize: "16px" }}>{selectedDay.total}명</b> (진행 프로젝트 {selectedDay.projectBreakdown.length}개)</p>
              </div>
              <button className="mp-close-btn" onClick={() => setSelectedDay(null)}>×</button>
            </div>

            {/* Department mini cards for the day */}
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {Object.entries(selectedDay.departments).map(([dKey, cnt]) => (
                <div key={dKey} style={{ background: "#f8fafc", border: `1px solid #e2e8f0`, borderLeft: `4px solid ${getDeptColor(dKey)}`, borderRadius: "8px", padding: "8px 14px", minWidth: "120px" }}>
                  <div style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold" }}>{getDeptLabel(dKey)}</div>
                  <div style={{ fontSize: "16px", fontWeight: "bold", color: "#0f172a" }}>{cnt}명</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: "10px" }}>
              <h4 style={{ margin: "0 0 10px 0", fontSize: "14px", color: "#334155" }}>당일 프로젝트별 인력 투입 상세</h4>
              <table className="mp-table">
                <thead>
                  <tr>
                    <th>제조번호</th>
                    <th>Site / Line</th>
                    <th>프로젝트명</th>
                    {activeDeptKeys.map(k => (
                      <th key={k} style={{ textAlign: "center" }}>{getDeptShort(k)}</th>
                    ))}
                    <th style={{ textAlign: "center" }}>당일 총원</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedDay.projectBreakdown.length === 0 ? (
                    <tr><td colSpan={4 + activeDeptKeys.length} style={{ textAlign: "center", padding: "20px", color: "#94a3b8" }}>당일 투입된 프로젝트 공수가 없습니다.</td></tr>
                  ) : (
                    selectedDay.projectBreakdown.map((pb, pIdx) => (
                      <tr key={pIdx}>
                        <td><b>{normalizeJVName(pb.manufacturingNo) || "-"}</b></td>
                        <td>{normalizeJVName(pb.site) || "-"} · {normalizeJVName(pb.line) || "-"}</td>
                        <td><b style={{ color: "#0f172a" }}>{normalizeJVName(pb.name)}</b></td>
                        {activeDeptKeys.map(k => (
                          <td key={k} style={{ textAlign: "center" }}>{pb.departments?.[k] || "-"}</td>
                        ))}
                        <td style={{ textAlign: "center", fontWeight: "bold", color: "#dc2626" }}>{pb.total}명</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <button
              onClick={() => setSelectedDay(null)}
              style={{ padding: "10px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", marginTop: "10px" }}
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* Project Detail Modal */}
      {selectedProjectForDetail && (
        <ProjectManpowerModal
          project={selectedProjectForDetail}
          onClose={() => setSelectedProjectForDetail(null)}
        />
      )}
    </div>
  );
}

// Individual Project Manpower Modal component (also exported for use in Project List!)
export function ProjectManpowerModal({ project, onClose }) {
  const mp = project.manpower;

  // Calculate full continuous date range for the project & active manpower days
  const { fullDates, activeDaysCount } = useMemo(() => {
    let start = project.startDate || "";
    let end = project.endDate || "";

    // Include milestone dates if they extend the project range
    (project.milestones || []).forEach(m => {
      if (m.startDate && (!start || m.startDate < start)) start = m.startDate;
      if (m.endDate && (!end || m.endDate > end)) end = m.endDate;
    });

    // Check manpower dates
    const mpDateSet = new Set();
    if (mp) {
      if (mp.dailyTotal) {
        Object.entries(mp.dailyTotal).forEach(([d, v]) => {
          if (Number(v) > 0) mpDateSet.add(d);
          if (!start || d < start) start = d;
          if (!end || d > end) end = d;
        });
      }
      if (mp.departments) {
        Object.values(mp.departments).forEach(dData => {
          if (dData?.daily) {
            Object.entries(dData.daily).forEach(([d, v]) => {
              if (Number(v) > 0) mpDateSet.add(d);
              if (!start || d < start) start = d;
              if (!end || d > end) end = d;
            });
          }
        });
      }
    }

    const activeDays = mpDateSet.size;

    if (!start || !end) {
      const dates = Array.from(mpDateSet).sort();
      return { fullDates: dates, activeDaysCount: activeDays };
    }

    const dates = [];
    const cur = new Date(start + "T00:00:00");
    const last = new Date(end + "T00:00:00");

    if (isNaN(cur.getTime()) || isNaN(last.getTime()) || cur > last) {
      return { fullDates: Array.from(mpDateSet).sort(), activeDaysCount: activeDays };
    }

    let count = 0;
    while (cur <= last && count < 1000) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, "0");
      const d = String(cur.getDate()).padStart(2, "0");
      dates.push(`${y}-${m}-${d}`);
      cur.setDate(cur.getDate() + 1);
      count++;
    }

    return { fullDates: dates, activeDaysCount: activeDays };
  }, [project.startDate, project.endDate, project.milestones, mp]);

  // Sorted department list matching company standard order
  const sortedDepts = useMemo(() => {
    if (!mp?.departments) return [];
    return Object.entries(mp.departments).sort(([a], [b]) => {
      const idxA = BASE_DEPT_ORDER.indexOf(normalizeDeptKey(a));
      const idxB = BASE_DEPT_ORDER.indexOf(normalizeDeptKey(b));
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });
  }, [mp]);

  // Export clean formatted Excel sheet matching the UI layout
  const handleExportExcel = async () => {
    if (!mp) return;

    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = "TW Project Manager";
      wb.created = new Date();

      const mfgNo = project.manufacturingNo ? normalizeJVName(project.manufacturingNo) : "";
      const projName = normalizeJVName(project.name || project.equipment || "Project");
      const sheetTitle = (mfgNo ? `${mfgNo}_` : "") + projName.slice(0, 20);

      const ws = wb.addWorksheet(sheetTitle.replace(/[\\/*?:[\]]/g, "_"), {
        views: [{ showGridLines: true }]
      });

      const totalCols = Math.max(8, sortedDepts.length + 2);

      // 1. Title
      ws.mergeCells(1, 1, 1, totalCols);
      const titleCell = ws.getCell("A1");
      titleCell.value = `📊 ${mfgNo ? `${mfgNo} · ` : ""}${projName} 공수 투입 현황`;
      titleCell.font = { name: "Malgun Gothic", size: 15, bold: true, color: { argb: "FF0F172A" } };
      titleCell.alignment = { vertical: "middle", horizontal: "left" };
      ws.getRow(1).height = 32;

      // 2. Subtitle
      ws.mergeCells(2, 1, 2, totalCols);
      const subCell = ws.getCell("A2");
      const siteStr = normalizeJVName(project.site) || "-";
      const lineStr = normalizeJVName(project.line) || "-";
      const pStart = fullDates[0] || project.startDate || "-";
      const pEnd = fullDates[fullDates.length - 1] || project.endDate || "-";
      subCell.value = `${siteStr} · Line ${lineStr}  |  기간: ${pStart} ~ ${pEnd}`;
      subCell.font = { name: "Malgun Gothic", size: 10, color: { argb: "FF64748B" } };
      subCell.alignment = { vertical: "middle", horizontal: "left" };
      ws.getRow(2).height = 20;

      // Spacing
      ws.getRow(3).height = 10;

      const thinBorder = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } }
      };

      // 3. KPI Cards Section
      // Card 1: 총 투입 공수 (Total Manday) - Cols A..B
      ws.mergeCells(4, 1, 4, 2);
      const k1Head = ws.getCell(4, 1);
      k1Head.value = "총 투입 공수 (Total Manday)";
      k1Head.font = { name: "Malgun Gothic", size: 9.5, bold: true, color: { argb: "FF166534" } };
      k1Head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
      k1Head.alignment = { vertical: "middle", horizontal: "center" };

      ws.mergeCells(5, 1, 5, 2);
      const k1Val = ws.getCell(5, 1);
      k1Val.value = `${mp.totalManday || 0} M/D`;
      k1Val.font = { name: "Malgun Gothic", size: 15, bold: true, color: { argb: "FF15803D" } };
      k1Val.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
      k1Val.alignment = { vertical: "middle", horizontal: "center" };

      // Card 2: 일일 피크 인원 (Daily Peak) - Cols C..D
      ws.mergeCells(4, 3, 4, 4);
      const k2Head = ws.getCell(4, 3);
      k2Head.value = "일일 피크 인원 (Daily Peak)";
      k2Head.font = { name: "Malgun Gothic", size: 9.5, bold: true, color: { argb: "FF991B1B" } };
      k2Head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF2F2" } };
      k2Head.alignment = { vertical: "middle", horizontal: "center" };

      ws.mergeCells(5, 3, 5, 4);
      const k2Val = ws.getCell(5, 3);
      k2Val.value = `${mp.dailyPeak || 0} 명`;
      k2Val.font = { name: "Malgun Gothic", size: 15, bold: true, color: { argb: "FFDC2626" } };
      k2Val.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF2F2" } };
      k2Val.alignment = { vertical: "middle", horizontal: "center" };

      // Card 3: 공수 투입 일수 - Cols E..F
      ws.mergeCells(4, 5, 4, 6);
      const k3Head = ws.getCell(4, 5);
      k3Head.value = "공수 투입 일수";
      k3Head.font = { name: "Malgun Gothic", size: 9.5, bold: true, color: { argb: "FF1E40AF" } };
      k3Head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
      k3Head.alignment = { vertical: "middle", horizontal: "center" };

      ws.mergeCells(5, 5, 5, 6);
      const k3Val = ws.getCell(5, 5);
      k3Val.value = `${activeDaysCount} 일`;
      k3Val.font = { name: "Malgun Gothic", size: 15, bold: true, color: { argb: "FF2563EB" } };
      k3Val.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
      k3Val.alignment = { vertical: "middle", horizontal: "center" };

      for (let r = 4; r <= 5; r++) {
        for (let c = 1; c <= 6; c++) {
          ws.getCell(r, c).border = thinBorder;
        }
      }
      ws.getRow(4).height = 22;
      ws.getRow(5).height = 28;

      // Spacing
      ws.getRow(6).height = 12;

      // 4. Department Summary
      let curRow = 7;
      ws.getCell(curRow, 1).value = "■ 부서별 투입 요약";
      ws.getCell(curRow, 1).font = { name: "Malgun Gothic", size: 11, bold: true, color: { argb: "FF334155" } };
      ws.getRow(curRow).height = 22;

      curRow++;
      const dHeaders = ["부서명 (Department)", "총 투입 공수 (Total)", "일일 피크 (Peak)"];
      const dHeadRow = ws.getRow(curRow);
      dHeaders.forEach((h, i) => {
        const c = dHeadRow.getCell(i + 1);
        c.value = h;
        c.font = { name: "Malgun Gothic", size: 10, bold: true, color: { argb: "FF1E293B" } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
        c.alignment = { vertical: "middle", horizontal: "center" };
        c.border = thinBorder;
      });
      dHeadRow.height = 22;

      sortedDepts.forEach(([rawD, dData]) => {
        curRow++;
        const norm = normalizeDeptKey(rawD);
        const r = ws.getRow(curRow);

        const c1 = r.getCell(1);
        c1.value = getDeptLabel(norm);
        c1.font = { name: "Malgun Gothic", size: 9.5, color: { argb: "FF0F172A" } };
        c1.alignment = { vertical: "middle", horizontal: "left" };
        c1.border = thinBorder;

        const c2 = r.getCell(2);
        c2.value = `${dData.total || 0} M/D`;
        c2.font = { name: "Malgun Gothic", size: 9.5, color: { argb: "FF0F172A" } };
        c2.alignment = { vertical: "middle", horizontal: "center" };
        c2.border = thinBorder;

        const c3 = r.getCell(3);
        c3.value = `${dData.peak || 0}명`;
        c3.font = { name: "Malgun Gothic", size: 9.5, color: { argb: "FFDC2626" } };
        c3.alignment = { vertical: "middle", horizontal: "center" };
        c3.border = thinBorder;
        r.height = 20;
      });

      // Summary Total Row
      curRow++;
      const totDRow = ws.getRow(curRow);
      totDRow.getCell(1).value = "합계 (Total)";
      totDRow.getCell(1).font = { name: "Malgun Gothic", size: 10, bold: true, color: { argb: "FF0F172A" } };
      totDRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      totDRow.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
      totDRow.getCell(1).border = thinBorder;

      totDRow.getCell(2).value = `${mp.totalManday || 0} M/D`;
      totDRow.getCell(2).font = { name: "Malgun Gothic", size: 10, bold: true, color: { argb: "FF15803D" } };
      totDRow.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      totDRow.getCell(2).alignment = { vertical: "middle", horizontal: "center" };
      totDRow.getCell(2).border = thinBorder;

      totDRow.getCell(3).value = `${mp.dailyPeak || 0}명`;
      totDRow.getCell(3).font = { name: "Malgun Gothic", size: 10, bold: true, color: { argb: "FFDC2626" } };
      totDRow.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      totDRow.getCell(3).alignment = { vertical: "middle", horizontal: "center" };
      totDRow.getCell(3).border = thinBorder;
      totDRow.height = 22;

      // Spacing
      curRow++;
      ws.getRow(curRow).height = 14;

      // 5. Daily Timeline Section
      curRow++;
      ws.getCell(curRow, 1).value = `■ 일자별 인력 투입 타임라인 (${pStart} ~ ${pEnd})`;
      ws.getCell(curRow, 1).font = { name: "Malgun Gothic", size: 11, bold: true, color: { argb: "FF334155" } };
      ws.getRow(curRow).height = 22;

      curRow++;
      const tHeadRow = ws.getRow(curRow);
      const timelineHeaders = ["날짜", ...sortedDepts.map(([dName]) => getDeptShort(normalizeDeptKey(dName))), "당일 합계"];
      timelineHeaders.forEach((th, cIdx) => {
        const c = tHeadRow.getCell(cIdx + 1);
        c.value = th;
        c.font = { name: "Malgun Gothic", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
        c.alignment = { vertical: "middle", horizontal: "center" };
        c.border = thinBorder;
      });
      tHeadRow.height = 24;

      fullDates.forEach(dateStr => {
        curRow++;
        const r = ws.getRow(curRow);

        const cDate = r.getCell(1);
        cDate.value = dateStr;
        cDate.font = { name: "Malgun Gothic", size: 9.5, color: { argb: "FF1E293B" } };
        cDate.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
        cDate.alignment = { vertical: "middle", horizontal: "center" };
        cDate.border = thinBorder;

        let daySum = 0;
        sortedDepts.forEach(([dName], dIdx) => {
          const v = mp.departments?.[dName]?.daily?.[dateStr] || 0;
          daySum += Number(v) || 0;
          const c = r.getCell(dIdx + 2);
          c.value = v > 0 ? v : "-";
          c.font = { name: "Malgun Gothic", size: 9.5, color: { argb: v > 0 ? "FF0F172A" : "FF94A3B8" } };
          c.alignment = { vertical: "middle", horizontal: "center" };
          c.border = thinBorder;
        });

        const total = mp.dailyTotal?.[dateStr] !== undefined ? mp.dailyTotal[dateStr] : daySum;
        const isPeak = total === mp.dailyPeak && mp.dailyPeak > 0;
        const totCell = r.getCell(sortedDepts.length + 2);

        if (total > 0) {
          totCell.value = `${total}명${isPeak ? " (Peak)" : ""}`;
          totCell.font = { name: "Malgun Gothic", size: 9.5, bold: true, color: { argb: isPeak ? "FFDC2626" : "FF0F172A" } };
          if (isPeak) {
            totCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF2F2" } };
          }
        } else {
          totCell.value = "-";
          totCell.font = { name: "Malgun Gothic", size: 9.5, color: { argb: "FF94A3B8" } };
        }
        totCell.alignment = { vertical: "middle", horizontal: "center" };
        totCell.border = thinBorder;
        r.height = 20;
      });

      // Bottom Total Row for Timeline
      curRow++;
      const bRow = ws.getRow(curRow);
      const bDate = bRow.getCell(1);
      bDate.value = "총 합계";
      bDate.font = { name: "Malgun Gothic", size: 10, bold: true, color: { argb: "FF0F172A" } };
      bDate.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
      bDate.alignment = { vertical: "middle", horizontal: "center" };
      bDate.border = thinBorder;

      sortedDepts.forEach(([dName, dData], dIdx) => {
        const c = bRow.getCell(dIdx + 2);
        c.value = `${dData.total || 0} M/D`;
        c.font = { name: "Malgun Gothic", size: 9.5, bold: true, color: { argb: "FF0F172A" } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
        c.alignment = { vertical: "middle", horizontal: "center" };
        c.border = thinBorder;
      });

      const bTot = bRow.getCell(sortedDepts.length + 2);
      bTot.value = `${mp.totalManday || 0} M/D`;
      bTot.font = { name: "Malgun Gothic", size: 10, bold: true, color: { argb: "FF15803D" } };
      bTot.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCFCE7" } };
      bTot.alignment = { vertical: "middle", horizontal: "center" };
      bTot.border = thinBorder;
      bRow.height = 24;

      // Set Column Widths
      const colWidths = [
        { width: 16 }, // A: 날짜 / 부서명
        ...sortedDepts.map(() => ({ width: 13 })),
        { width: 16 }  // 당일 합계
      ];
      ws.columns = colWidths;

      // Download file
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cleanFileName = `${mfgNo ? `${mfgNo}_` : ""}${projName}_공수투입현황.xlsx`.replace(/[\\/:*?"<>|]/g, "_");
      a.download = cleanFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 500);
    } catch (err) {
      console.error("Excel export error:", err);
      alert("Excel 파일 생성 중 오류가 발생했습니다: " + (err.message || err));
    }
  };

  return (
    <div className="mp-modal-backdrop" onMouseDown={onClose}>
      <div className="mp-modal-card" onMouseDown={e => e.stopPropagation()}>
        <div className="mp-modal-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3>📊 {project.manufacturingNo ? `${normalizeJVName(project.manufacturingNo)} · ` : ""}{normalizeJVName(project.name)} 공수 투입 현황</h3>
            <p>{normalizeJVName(project.site) || "-"} · Line {normalizeJVName(project.line) || "-"} &nbsp;|&nbsp; 기간: {fullDates[0] || project.startDate || "-"} ~ {fullDates[fullDates.length - 1] || project.endDate || "-"}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "5px", flexShrink: 0 }}>
            {mp && (
              <button
                onClick={handleExportExcel}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "4px 9px",
                  height: "26px",
                  background: "#10b981",
                  color: "#fff",
                  border: "none",
                  borderRadius: "5px",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                  transition: "background 0.15s"
                }}
                title="화면과 동일한 서식의 Excel 파일 다운로드"
              >
                <span style={{ fontSize: "11px" }}>📥</span> excel
              </button>
            )}
            <button className="mp-close-btn" onClick={onClose}>×</button>
          </div>
        </div>

        {!mp ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "#64748b" }}>
            <div style={{ fontSize: "36px", marginBottom: "12px" }}>📋</div>
            <h4 style={{ margin: "0 0 8px 0", color: "#1e293b" }}>등록된 마스터 플랜 공수 데이터가 없습니다.</h4>
            <p style={{ margin: 0, fontSize: "13px" }}>새 프로젝트 등록 시 <b>마스터 플랜 엑셀(Manpower 표 포함)</b>을 첨부하시면 자동으로 공수 데이터가 추출되어 이곳에 표시됩니다.</p>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "14px" }}>
                <div style={{ fontSize: "12px", color: "#166534", fontWeight: "bold" }}>총 투입 공수 (Total Manday)</div>
                <div style={{ fontSize: "24px", fontWeight: "800", color: "#15803d", marginTop: "4px" }}>{mp.totalManday || 0} M/D</div>
              </div>
              <div style={{ background: "#fef2f2", border: "1px solid #fecdd3", borderRadius: "10px", padding: "14px" }}>
                <div style={{ fontSize: "12px", color: "#991b1b", fontWeight: "bold" }}>일일 피크 인원 (Daily Peak)</div>
                <div style={{ fontSize: "24px", fontWeight: "800", color: "#dc2626", marginTop: "4px" }}>{mp.dailyPeak || 0} 명</div>
              </div>
              <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "10px", padding: "14px" }}>
                <div style={{ fontSize: "12px", color: "#1e40af", fontWeight: "bold" }}>공수 투입 일수</div>
                <div style={{ fontSize: "24px", fontWeight: "800", color: "#2563eb", marginTop: "4px" }}>{activeDaysCount} 일</div>
              </div>
            </div>

            {/* Department Breakdown */}
            {sortedDepts.length > 0 && (
              <div>
                <h4 style={{ margin: "0 0 10px 0", fontSize: "14px", color: "#334155" }}>부서별 투입 요약</h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px" }}>
                  {sortedDepts.map(([rawD, dData]) => {
                    const norm = normalizeDeptKey(rawD);
                    return (
                      <div key={rawD} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderLeft: `4px solid ${getDeptColor(norm)}`, borderRadius: "8px", padding: "10px 14px" }}>
                        <div style={{ fontSize: "11px", fontWeight: "bold", color: "#64748b" }}>{getDeptLabel(norm)}</div>
                        <div style={{ fontSize: "18px", fontWeight: "bold", color: "#0f172a", marginTop: "4px" }}>
                          {dData.total || 0} <span style={{ fontSize: "12px", fontWeight: "normal" }}>M/D</span>
                        </div>
                        <div style={{ fontSize: "11px", color: "#dc2626" }}>Peak: {dData.peak || 0}명</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Timeline Table */}
            {fullDates.length > 0 && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "0 0 10px 0" }}>
                  <h4 style={{ margin: 0, fontSize: "14px", color: "#334155" }}>
                    일자별 인력 투입 타임라인 ({fullDates[0]} ~ {fullDates[fullDates.length - 1]})
                  </h4>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>전체 {fullDates.length}일 (투입 {activeDaysCount}일)</span>
                </div>
                <div style={{ overflowX: "auto", maxHeight: "320px", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
                  <table className="mp-timeline-table">
                    <thead>
                      <tr>
                        <th>날짜</th>
                        {sortedDepts.map(([dName]) => {
                          const norm = normalizeDeptKey(dName);
                          return <th key={dName}>{getDeptShort(norm)}</th>;
                        })}
                        <th>당일 합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fullDates.map(dateStr => {
                        let daySum = 0;
                        const cells = sortedDepts.map(([dName]) => {
                          const v = mp.departments?.[dName]?.daily?.[dateStr] || 0;
                          daySum += Number(v) || 0;
                          return v;
                        });
                        const total = mp.dailyTotal?.[dateStr] !== undefined ? mp.dailyTotal[dateStr] : daySum;
                        const isPeak = total === mp.dailyPeak && mp.dailyPeak > 0;
                        const hasManpower = total > 0;

                        return (
                          <tr key={dateStr}>
                            <td style={{ fontWeight: 600, background: "#f8fafc" }}>{dateStr}</td>
                            {cells.map((v, cIdx) => (
                              <td key={cIdx} style={{ color: v > 0 ? undefined : "#94a3b8" }}>
                                {v > 0 ? v : "-"}
                              </td>
                            ))}
                            <td
                              className={isPeak ? "mp-peak-cell" : ""}
                              style={{
                                fontWeight: hasManpower ? "bold" : "normal",
                                color: hasManpower ? (isPeak ? "#dc2626" : "#0f172a") : "#94a3b8"
                              }}
                            >
                              {hasManpower ? `${total}명 ${isPeak ? "🔥" : ""}` : "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
          {mp && (
            <button
              onClick={handleExportExcel}
              style={{
                flex: 1,
                padding: "12px",
                background: "#10b981",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontWeight: "bold",
                cursor: "pointer",
                fontSize: "14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px"
              }}
            >
              <span>📥</span> Excel 서식 다운로드
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "12px",
              background: "linear-gradient(135deg, #1f6feb, #1152b3)",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              fontWeight: "bold",
              cursor: "pointer",
              fontSize: "14px"
            }}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
