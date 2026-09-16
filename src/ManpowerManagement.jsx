import React, { useState, useMemo } from "react";
import "./ManpowerManagement.css";
import ExcelJS from "exceljs";

export const DEPT_ORDER = ["mechanical", "vision", "control", "electrical", "safety", "manager"];

export const DEPT_LABELS = {
  mechanical: "기구 (Mechanical)",
  vision: "비전 (Vision)",
  control: "제어 (Control)",
  electrical: "전장 (Electrical)",
  safety: "안전 (Safety)",
  manager: "소장 (Manager)"
};

export const DEPT_SHORT = {
  mechanical: "기구",
  vision: "비전",
  control: "제어",
  electrical: "전장",
  safety: "안전",
  manager: "소장"
};

export const DEPT_COLORS = {
  mechanical: "#3b82f6",
  vision: "#8b5cf6",
  control: "#10b981",
  electrical: "#f59e0b",
  safety: "#ef4444",
  manager: "#06b6d4"
};

export function normalizeDeptKey(key) {
  if (!key) return "other";
  const s = String(key).toLowerCase().trim();
  if (s.includes("소장") || s.includes("manager") || s.includes("현장대리인") || s.includes("site mgr") || s.includes("field mgr")) return "manager";
  if (s.includes("mech") || s.includes("기구")) return "mechanical";
  if (s.includes("vis") || s.includes("비전")) return "vision";
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
      if (siteFilter !== "전체" && p.site !== siteFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const match =
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.manufacturingNo && p.manufacturingNo.toLowerCase().includes(q)) ||
          (p.line && p.line.toLowerCase().includes(q));
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
    const depts = { mechanical: 0, vision: 0, control: 0, electrical: 0, safety: 0, manager: 0 };
    const pList = [];

    // Ensure all days of the current visible month exist for the calendar
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= lastDayOfMonth; d++) {
      const dStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      daily[dStr] = {
        dateStr: dStr,
        dayNum: d,
        total: 0,
        departments: { mechanical: 0, vision: 0, control: 0, electrical: 0, safety: 0, manager: 0 },
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
          departments: { mechanical: 0, vision: 0, control: 0, electrical: 0, safety: 0, manager: 0 },
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
                    manufacturingNo: p.manufacturingNo,
                    name: p.name,
                    site: p.site,
                    line: p.line,
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
                manufacturingNo: p.manufacturingNo,
                name: p.name,
                site: p.site,
                line: p.line,
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
  }, [filteredProjects, effectiveStartDate, effectiveEndDate, year, month, deptFilter]);

  // Helper: compute manpower breakdown for each project within effective range
  const getProjectRangeData = (p) => {
    const mp = p.manpower;
    const pDepts = { mechanical: 0, vision: 0, control: 0, electrical: 0, safety: 0, manager: 0 };
    let pRangeTotal = 0;

    if (mp?.departments) {
      Object.entries(mp.departments).forEach(([rawD, dData]) => {
        const k = normalizeDeptKey(rawD);
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

  // Excel Export based on effective range
  const exportManpowerExcel = async () => {
    try {
      const wb = new ExcelJS.Workbook();

      // Sheet 1: Daily Summary
      const wsDaily = wb.addWorksheet(`일별 공수 집계`);
      wsDaily.addRow([`TW Project - 공수 현황 (${effectiveLabel}, 총 ${periodTotalManday} M/D, Peak ${periodDailyPeak}명)`]);
      wsDaily.addRow([]);
      wsDaily.addRow(["날짜", "요일", "기구 (M/D)", "비전 (M/D)", "제어 (M/D)", "전장 (M/D)", "안전 (M/D)", "소장 (M/D)", "총 인원 (M/D)", "투입 프로젝트 목록"]);

      const headerRow = wsDaily.getRow(3);
      headerRow.height = 24;
      headerRow.eachCell(c => {
        c.font = { bold: true, color: { argb: "FFFFFFFF" } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
        c.alignment = { horizontal: "center", vertical: "middle" };
      });

      const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
      Object.entries(dailyData)
        .filter(([dStr]) => dStr >= effectiveStartDate && dStr <= effectiveEndDate)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([, d]) => {
          const dtObj = new Date(d.dateStr);
          const dayOfWeek = dayNames[dtObj.getDay()];
          const projs = d.projectBreakdown.map(x => `${x.manufacturingNo || x.name}(${x.total}명)`).join(", ");
          const row = wsDaily.addRow([
            d.dateStr,
            dayOfWeek,
            d.departments.mechanical || 0,
            d.departments.vision || 0,
            d.departments.control || 0,
            d.departments.electrical || 0,
            d.departments.safety || 0,
            d.departments.manager || 0,
            d.total,
            projs || "-"
          ]);

          if (d.total === periodDailyPeak && periodDailyPeak > 0) {
            row.getCell(9).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
            row.getCell(9).font = { bold: true, color: { argb: "FFDC2626" } };
          }
        });

      wsDaily.columns.forEach(col => { col.width = 16; });
      wsDaily.getColumn(1).width = 14;
      wsDaily.getColumn(10).width = 45;

      // Sheet 2: Project Breakdown
      const wsProj = wb.addWorksheet("프로젝트별 공수");
      wsProj.addRow([`프로젝트별 공수 투입 현황 (${effectiveLabel})`]);
      wsProj.addRow([]);
      wsProj.addRow(["제조번호", "Site", "Line", "프로젝트명", "기구 (M/D)", "비전 (M/D)", "제어 (M/D)", "전장 (M/D)", "안전 (M/D)", "소장 (M/D)", "기간 총합 (M/D)", "프로젝트 전체 총공수 (M/D)"]);

      const pHeaderRow = wsProj.getRow(3);
      pHeaderRow.height = 24;
      pHeaderRow.eachCell(c => {
        c.font = { bold: true, color: { argb: "FFFFFFFF" } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
        c.alignment = { horizontal: "center", vertical: "middle" };
      });

      filteredProjects.forEach(p => {
        const { pDepts, pRangeTotal } = getProjectRangeData(p);
        const pTotalManday = getProjectTotalManday(p);

        wsProj.addRow([
          p.manufacturingNo || "-",
          p.site || "-",
          p.line || "-",
          p.name,
          pDepts.mechanical,
          pDepts.vision,
          pDepts.control,
          pDepts.electrical,
          pDepts.safety,
          pDepts.manager,
          pRangeTotal,
          pTotalManday || pRangeTotal
        ]);
      });

      wsProj.columns.forEach(col => { col.width = 16; });
      wsProj.getColumn(4).width = 32;

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const fileLabel = viewMode === "month" ? monthStr : `${effectiveStartDate}_${effectiveEndDate}`;
      a.download = `TW_공수통합보고서_${fileLabel}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 500);
    } catch (err) {
      alert("엑셀 다운로드 실패: " + err.message);
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

        {/* Row 2: Filters & Excel Download */}
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
              <option value="mechanical">기구 (Mechanical)</option>
              <option value="vision">비전 (Vision)</option>
              <option value="control">제어 (Control)</option>
              <option value="electrical">전장 (Electrical)</option>
              <option value="safety">안전 (Safety)</option>
              <option value="manager">소장 (Manager)</option>
            </select>

            <input
              type="text"
              placeholder="프로젝트, 제조번호 검색..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <button className="mp-excel-btn" onClick={exportManpowerExcel}>
            📥 공수 엑셀 다운로드 ({viewMode === "month" ? `${month + 1}월` : "지정기간"})
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
          {DEPT_ORDER.map(deptKey => {
            const count = deptTotals[deptKey] || 0;
            const pct = periodTotalManday > 0 ? Math.round((count / periodTotalManday) * 100) : 0;
            return (
              <div className="mp-dept-tag" key={deptKey} style={{ borderLeft: `4px solid ${DEPT_COLORS[deptKey] || "#64748b"}` }}>
                <div className="mp-dept-tag-name">{DEPT_LABELS[deptKey] || deptKey}</div>
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
                          <span key={dKey} style={{ borderLeft: `2px solid ${DEPT_COLORS[dKey]}` }}>
                            {DEPT_SHORT[dKey] || dKey} {cnt}
                          </span>
                        );
                      })}
                    </div>
                    <div className="mp-day-projs" title={cell.data.projectBreakdown.map(p => p.name).join(", ")}>
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
                <th style={{ textAlign: "center" }}>기구</th>
                <th style={{ textAlign: "center" }}>비전</th>
                <th style={{ textAlign: "center" }}>제어</th>
                <th style={{ textAlign: "center" }}>전장</th>
                <th style={{ textAlign: "center" }}>안전</th>
                <th style={{ textAlign: "center" }}>소장</th>
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
                    <td><b>{p.manufacturingNo || "-"}</b></td>
                    <td>{p.site || "-"} {p.line ? `· Line ${p.line}` : ""}</td>
                    <td>
                      <div style={{ fontWeight: 600, color: "#0f172a" }}>{p.name}</div>
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
                    <td style={{ textAlign: "center" }}>{pDepts.mechanical ? `${pDepts.mechanical}명` : "-"}</td>
                    <td style={{ textAlign: "center" }}>{pDepts.vision ? `${pDepts.vision}명` : "-"}</td>
                    <td style={{ textAlign: "center" }}>{pDepts.control ? `${pDepts.control}명` : "-"}</td>
                    <td style={{ textAlign: "center" }}>{pDepts.electrical ? `${pDepts.electrical}명` : "-"}</td>
                    <td style={{ textAlign: "center" }}>{pDepts.safety ? `${pDepts.safety}명` : "-"}</td>
                    <td style={{ textAlign: "center" }}>{pDepts.manager ? `${pDepts.manager}명` : "-"}</td>
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
                  <td style={{ textAlign: "center" }}>{deptTotals.mechanical > 0 ? `${deptTotals.mechanical} M/D` : "-"}</td>
                  <td style={{ textAlign: "center" }}>{deptTotals.vision > 0 ? `${deptTotals.vision} M/D` : "-"}</td>
                  <td style={{ textAlign: "center" }}>{deptTotals.control > 0 ? `${deptTotals.control} M/D` : "-"}</td>
                  <td style={{ textAlign: "center" }}>{deptTotals.electrical > 0 ? `${deptTotals.electrical} M/D` : "-"}</td>
                  <td style={{ textAlign: "center" }}>{deptTotals.safety > 0 ? `${deptTotals.safety} M/D` : "-"}</td>
                  <td style={{ textAlign: "center" }}>{deptTotals.manager > 0 ? `${deptTotals.manager} M/D` : "-"}</td>
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
                <div key={dKey} style={{ background: "#f8fafc", border: `1px solid #e2e8f0`, borderLeft: `4px solid ${DEPT_COLORS[dKey]}`, borderRadius: "8px", padding: "8px 14px", minWidth: "120px" }}>
                  <div style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold" }}>{DEPT_LABELS[dKey]}</div>
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
                    <th style={{ textAlign: "center" }}>기구</th>
                    <th style={{ textAlign: "center" }}>비전</th>
                    <th style={{ textAlign: "center" }}>제어</th>
                    <th style={{ textAlign: "center" }}>전장</th>
                    <th style={{ textAlign: "center" }}>안전</th>
                    <th style={{ textAlign: "center" }}>소장</th>
                    <th style={{ textAlign: "center" }}>당일 총원</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedDay.projectBreakdown.length === 0 ? (
                    <tr><td colSpan={10} style={{ textAlign: "center", padding: "20px", color: "#94a3b8" }}>당일 투입된 프로젝트 공수가 없습니다.</td></tr>
                  ) : (
                    selectedDay.projectBreakdown.map((pb, pIdx) => (
                      <tr key={pIdx}>
                        <td><b>{pb.manufacturingNo || "-"}</b></td>
                        <td>{pb.site || "-"} · {pb.line || "-"}</td>
                        <td><b style={{ color: "#0f172a" }}>{pb.name}</b></td>
                        <td style={{ textAlign: "center" }}>{pb.departments.mechanical || "-"}</td>
                        <td style={{ textAlign: "center" }}>{pb.departments.vision || "-"}</td>
                        <td style={{ textAlign: "center" }}>{pb.departments.control || "-"}</td>
                        <td style={{ textAlign: "center" }}>{pb.departments.electrical || "-"}</td>
                        <td style={{ textAlign: "center" }}>{pb.departments.safety || "-"}</td>
                        <td style={{ textAlign: "center" }}>{pb.departments.manager || "-"}</td>
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

  // Extract all distinct dates in project manpower
  const dates = useMemo(() => {
    if (!mp) return [];
    const set = new Set();
    if (mp.dailyTotal) Object.keys(mp.dailyTotal).forEach(d => set.add(d));
    if (mp.departments) {
      Object.values(mp.departments).forEach(dData => {
        if (dData?.daily) Object.keys(dData.daily).forEach(d => set.add(d));
      });
    }
    return Array.from(set).sort();
  }, [mp]);

  return (
    <div className="mp-modal-backdrop" onMouseDown={onClose}>
      <div className="mp-modal-card" onMouseDown={e => e.stopPropagation()}>
        <div className="mp-modal-head">
          <div>
            <h3>📊 {project.manufacturingNo ? `${project.manufacturingNo} · ` : ""}{project.name} 공수 투입 현황</h3>
            <p>{project.site || "-"} · Line {project.line || "-"} &nbsp;|&nbsp; 기간: {project.startDate} ~ {project.endDate}</p>
          </div>
          <button className="mp-close-btn" onClick={onClose}>×</button>
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
                <div style={{ fontSize: "24px", fontWeight: "800", color: "#2563eb", marginTop: "4px" }}>{dates.length} 일</div>
              </div>
            </div>

            {/* Department Breakdown */}
            {mp.departments && (
              <div>
                <h4 style={{ margin: "0 0 10px 0", fontSize: "14px", color: "#334155" }}>부서별 투입 요약</h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px" }}>
                  {Object.entries(mp.departments).map(([rawD, dData]) => {
                    const norm = normalizeDeptKey(rawD);
                    return (
                      <div key={rawD} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderLeft: `4px solid ${DEPT_COLORS[norm] || "#64748b"}`, borderRadius: "8px", padding: "10px 14px" }}>
                        <div style={{ fontSize: "11px", fontWeight: "bold", color: "#64748b" }}>{DEPT_LABELS[norm] || rawD}</div>
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
            {dates.length > 0 && (
              <div>
                <h4 style={{ margin: "0 0 10px 0", fontSize: "14px", color: "#334155" }}>일자별 인력 투입 타임라인 ({dates[0]} ~ {dates[dates.length - 1]})</h4>
                <div style={{ overflowX: "auto", maxHeight: "300px" }}>
                  <table className="mp-timeline-table">
                    <thead>
                      <tr>
                        <th>날짜</th>
                        <th>기구</th>
                        <th>비전</th>
                        <th>제어</th>
                        <th>전장</th>
                        <th>안전</th>
                        <th>소장</th>
                        <th>당일 합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dates.map(dateStr => {
                        const mech = mp.departments?.mechanical?.daily?.[dateStr] || mp.departments?.Mechanical?.daily?.[dateStr] || 0;
                        const vis = mp.departments?.vision?.daily?.[dateStr] || mp.departments?.Vision?.daily?.[dateStr] || 0;
                        const ctrl = mp.departments?.control?.daily?.[dateStr] || mp.departments?.Control?.daily?.[dateStr] || 0;
                        const elec = mp.departments?.electrical?.daily?.[dateStr] || mp.departments?.Electrical?.daily?.[dateStr] || mp.departments?.Electronical?.daily?.[dateStr] || 0;
                        const safe = mp.departments?.safety?.daily?.[dateStr] || mp.departments?.Safety?.daily?.[dateStr] || mp.departments?.["Safety Manager"]?.daily?.[dateStr] || 0;
                        const mgr = mp.departments?.manager?.daily?.[dateStr] || mp.departments?.Manager?.daily?.[dateStr] || mp.departments?.["소장"]?.daily?.[dateStr] || 0;
                        const total = mp.dailyTotal?.[dateStr] || (mech + vis + ctrl + elec + safe + mgr);
                        const isPeak = total === mp.dailyPeak && mp.dailyPeak > 0;

                        return (
                          <tr key={dateStr}>
                            <td style={{ fontWeight: 600, background: "#f8fafc" }}>{dateStr}</td>
                            <td>{mech || "-"}</td>
                            <td>{vis || "-"}</td>
                            <td>{ctrl || "-"}</td>
                            <td>{elec || "-"}</td>
                            <td>{safe || "-"}</td>
                            <td>{mgr || "-"}</td>
                            <td className={isPeak ? "mp-peak-cell" : ""} style={{ fontWeight: "bold" }}>
                              {total}명 {isPeak && "🔥"}
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

        <button
          onClick={onClose}
          style={{ width: "100%", padding: "12px", background: "linear-gradient(135deg, #1f6feb, #1152b3)", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "14px", marginTop: "10px" }}
        >
          확인
        </button>
      </div>
    </div>
  );
}
