import PptxGenJS from "pptxgenjs";
import ExcelJS from "exceljs";
import { normalizeJVName, getConstructionPeriod, getMonthDailyDeptMatrix, getDailyDepartmentManpower } from "./utils";

const DAY=86400000,C={navy:"17324D",blue:"0B68B5",light:"F4F7FB",line:"D8E2EA",gray:"64748B",white:"FFFFFF",green:"16A34A",red:"DC2626",orange:"EA580C"};
const d=s=>new Date(`${s}T00:00:00`),hex=s=>String(s||C.blue).replace("#","").slice(0,6),today=()=>new Date().toISOString().slice(0,10);
const progress=p=>Number.isFinite(+p.value)?+p.value:p.status==="완료"?100:0;
const conditions=f=>`상태 ${f.filter||"전체"} | Site ${normalizeJVName(f.siteFilter||"전체")} | 담당자 ${f.personFilter||"전체"} | 검색 ${normalizeJVName(f.search||"없음")}`;
function ppt(title){const x=new PptxGenJS();x.layout="LAYOUT_WIDE";x.author="TW Project";x.company="TW";x.title=title;x.subject=title;x.lang="ko-KR";return x}
function head(slide,title,sub,page){slide.background={color:C.white};slide.addText(title,{x:.45,y:.2,w:9.5,h:.42,fontSize:22,bold:true,color:C.navy,margin:0});slide.addText(sub,{x:.46,y:.68,w:12.2,h:.22,fontSize:8,color:C.gray,margin:0});slide.addShape("line",{x:.45,y:1.0,w:12.4,h:0,line:{color:C.blue,width:1.3}});slide.addText(`TW Project | ${today()} | ${page}`,{x:.45,y:7.18,w:12.4,h:.14,fontSize:7,color:"8493A1",align:"right",margin:0})}
function summary(pptx,projects,filters){const s=pptx.addSlide();head(s,"Project Management Report",conditions(filters),1);const stats=[["전체",projects.length,C.blue],["진행 중",projects.filter(p=>p.status!=="완료").length,C.orange],["완료",projects.filter(p=>p.status==="완료").length,C.green],["지연",projects.filter(p=>p.status!=="완료"&&d(p.endDate)<new Date()).length,C.red]];stats.forEach((v,i)=>{const x=.65+i*3.08;s.addShape("roundRect",{x,y:1.4,w:2.7,h:1.05,fill:{color:C.light},line:{color:C.line}});s.addText(v[0],{x:x+.2,y:1.62,w:1.6,h:.2,fontSize:10,color:C.gray,margin:0});s.addText(String(v[1]),{x:x+.2,y:1.91,w:1.5,h:.34,fontSize:25,bold:true,color:v[2],margin:0})});const rows=projects.slice(0,11).map(p=>[normalizeJVName(p.manufacturingNo),normalizeJVName(p.name),normalizeJVName(p.site),p.status,`${progress(p)}%`]),tableRows=[["제조번호","프로젝트명","Site","상태","진행률"],...rows],tableHeight=Math.min(3.55,.26+tableRows.length*.24);s.addTable(tableRows,{x:.65,y:2.85,w:12,h:tableHeight,colW:[1.8,4.7,1.8,1.7,1.2],fontSize:8.5,color:C.navy,fill:C.white,border:{type:"solid",color:C.line,pt:.5},margin:.035,rowH:.22,autoFit:false})}
function range(projects){const a=projects.flatMap(p=>[p.startDate,p.endDate,...(p.milestones||[]).flatMap(m=>[m.startDate,m.endDate])]).filter(Boolean).map(d);const start=new Date(Math.min(...a.map(x=>x.getTime()))),end=new Date(Math.max(...a.map(x=>x.getTime())));return{start,end,span:Math.max(DAY,end-start+DAY)}}
export async function exportGanttReport(projects,filters={}){if(!projects.length)throw new Error("내보낼 프로젝트가 없습니다.");const x=ppt("프로젝트 간트차트 보고서");summary(x,projects,filters);const r=range(projects),rows=[];projects.forEach(p=>{rows.push({p,name:`${normalizeJVName(p.manufacturingNo)} · ${normalizeJVName(p.name)}`,s:p.startDate,e:p.endDate,v:progress(p),main:true});(p.milestones||[]).filter(m=>m.name).forEach(m=>rows.push({p,name:normalizeJVName(m.name),s:m.startDate,e:m.endDate,v:Math.max(0,Math.min(100,Math.round((new Date()-d(m.startDate))/Math.max(DAY,d(m.endDate)-d(m.startDate))*100))),main:false}))});const per=18;for(let o=0;o<rows.length;o+=per){const s=x.addSlide();head(s,"프로젝트 간트차트",`${conditions(filters)} | ${r.start.toISOString().slice(0,10)} ~ ${r.end.toISOString().slice(0,10)}`,2+o/per);const lx=.45,cx=4.25,cw=8.5,y0=1.28,rh=.31;s.addText("프로젝트 / 마일스톤",{x:lx,y:1.04,w:3.6,h:.18,fontSize:8,bold:true,color:C.gray,margin:0});for(let i=0;i<10;i++)s.addShape("line",{x:cx+i*cw/9,y:y0,w:0,h:Math.min(per,rows.length-o)*rh,line:{color:"E5EBF0",width:.4}});const tp=(new Date()-r.start)/r.span;if(tp>=0&&tp<=1)s.addShape("line",{x:cx+tp*cw,y:y0,w:0,h:Math.min(per,rows.length-o)*rh,line:{color:C.red,width:1,dash:"dash"}});rows.slice(o,o+per).forEach((q,i)=>{const y=y0+i*rh,ind=q.main?0:.22;s.addText(q.name,{x:lx+ind,y:y+.04,w:3.55-ind,h:.18,fontSize:q.main?9:8,bold:q.main,color:q.main?C.navy:C.gray,margin:0,fit:"shrink"});const left=Math.max(0,(d(q.s)-r.start)/r.span),right=Math.min(1,(d(q.e)-r.start+DAY)/r.span),bx=cx+left*cw,bw=Math.max(.04,(right-left)*cw),color=hex(q.p.projectColor);const barH=q.main?.16:.1,doneW=bw*Math.max(0,Math.min(100,q.v))/100;s.addShape(q.main?"roundRect":"rect",{x:bx,y:y+.075,w:bw,h:barH,fill:{color,transparency:q.main?72:84},line:{color,width:q.main?.65:.5,transparency:45}});if(doneW>0)s.addShape(q.main?"roundRect":"rect",{x:bx,y:y+.075,w:Math.max(.025,doneW),h:barH,fill:{color,transparency:0},line:{color,transparency:100}});s.addText(`${Math.round(q.v)}%`,{x:Math.min(bx+bw+.04,12.45),y:y+.035,w:.48,h:.18,fontSize:7.5,bold:q.main,color:q.main?C.navy:C.gray,margin:0,fit:"shrink"})})}await x.writeFile({fileName:`TW_Project_Gantt_${today()}.pptx`,compression:true})}

export async function exportCalendarReport(projects, month, filters = {}, mode = 'construction') {
  if (!projects || !projects.length) throw new Error("내보낼 프로젝트가 없습니다.");
  const isConstruction = mode === 'construction';
  const pptTitle = isConstruction ? "공사 일정 및 공수 통합 보고서" : "프로젝트 일정 달력 보고서";
  const x = ppt(pptTitle);
  const curYear = month.getFullYear();
  const curMonthIdx = month.getMonth();
  const monthLabel = `${curYear}년 ${curMonthIdx + 1}월`;

  // 각 프로젝트의 공사 일정 및 전체 일정 계산
  const mappedProjects = projects.map(p => {
    const cp = getConstructionPeriod(p);
    const effStart = isConstruction ? cp.startDate : p.startDate;
    const effEnd = isConstruction ? cp.endDate : p.endDate;
    return {
      ...p,
      cp,
      effStart,
      effEnd
    };
  });

  // 해당 월 일자별 부서별 매트릭스 데이터 집계
  const matrix = getMonthDailyDeptMatrix(projects, curYear, curMonthIdx);
  const totalMonthManday = matrix.days.reduce((acc, dStr) => acc + (matrix.dayDataMap[dStr]?.total || 0), 0);
  const peakDayEntry = matrix.days.reduce((peak, dStr) => {
    const curVal = matrix.dayDataMap[dStr]?.total || 0;
    return curVal > peak.val ? { date: dStr, val: curVal } : peak;
  }, { date: "-", val: 0 });

  // =============================================================
  // SLIDE 1: 월간 달력 슬라이드 (100% Native Shapes & TextBoxes)
  // =============================================================
  const s1 = x.addSlide();
  const mainTitle = isConstruction ? `${monthLabel} 공사 일정 달력` : `${monthLabel} 프로젝트 일정 달력`;
  const subText = `${conditions(filters)} | 월간 총 공수: ${totalMonthManday} M/D | 일일 피크: ${peakDayEntry.val}명(${peakDayEntry.date.slice(5) || '-'}) | 기준: ${isConstruction ? '공사 시작 기준' : '프로젝트 전체 기간'}`;
  head(s1, mainTitle, subText, 1);

  // 상단 KPI 카드 블록 (Native roundRect & Text)
  const kpis = [
    { label: "월간 총 투입 공수", val: `${totalMonthManday} M/D`, color: C.blue },
    { label: "일일 최대 투입(Peak)", val: `${peakDayEntry.val} 명 (${peakDayEntry.date.slice(5) || "-"})`, color: C.red },
    { label: "당월 진행 프로젝트", val: `${projects.length} 건`, color: C.navy },
    { label: "투입 부서 수", val: `${matrix.sortedDepts.length} 개 부서`, color: C.green }
  ];
  kpis.forEach((kpi, idx) => {
    const kx = 0.55 + idx * 3.08;
    s1.addShape("roundRect", { x: kx, y: 0.95, w: 2.95, h: 0.38, fill: { color: C.light }, line: { color: C.line, width: 0.5 } });
    s1.addText(`${kpi.label}: `, { x: kx + 0.12, y: 1.02, w: 1.5, h: 0.22, fontSize: 8, color: C.gray, margin: 0 });
    s1.addText(kpi.val, { x: kx + 1.25, y: 1.00, w: 1.6, h: 0.26, fontSize: 9.5, bold: true, color: kpi.color, margin: 0 });
  });

  // 달력 그리드 좌표
  const first = new Date(curYear, curMonthIdx, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const x0 = 0.55, y0 = 1.62, cw = 12.25 / 7, ch = 0.88;

  ["일", "월", "화", "수", "목", "금", "토"].forEach((v, i) => {
    s1.addText(v, {
      x: x0 + i * cw, y: 1.42, w: cw, h: 0.18, fontSize: 8, bold: true, align: "center",
      color: i === 0 ? C.red : i === 6 ? C.blue : C.gray, margin: 0
    });
  });

  for (let w = 0; w < 6; w++) {
    const ws = new Date(start);
    ws.setDate(start.getDate() + w * 7);
    const we = new Date(ws);
    we.setDate(ws.getDate() + 6);
    const wsStr = ws.toISOString().slice(0, 10);
    const weStr = we.toISOString().slice(0, 10);

    for (let k = 0; k < 7; k++) {
      const cur = new Date(ws);
      cur.setDate(ws.getDate() + k);
      const curStr = cur.toISOString().slice(0, 10);
      const isCurMonth = cur.getMonth() === curMonthIdx;
      const dayMp = matrix.dayDataMap[curStr]?.total || 0;

      s1.addShape("rect", {
        x: x0 + k * cw, y: y0 + w * ch, w: cw, h: ch,
        fill: { color: isCurMonth ? C.white : "F8FAFC" },
        line: { color: C.line, width: 0.5 }
      });

      // 날짜 번호
      s1.addText(String(cur.getDate()), {
        x: x0 + k * cw + 0.04, y: y0 + w * ch + 0.03, w: 0.35, h: 0.16,
        fontSize: 7.5, bold: isCurMonth, color: isCurMonth ? (k === 0 ? C.red : k === 6 ? C.blue : C.navy) : C.gray, margin: 0
      });

      // 당일 총 공수 배지
      if (dayMp > 0 && isCurMonth) {
        const bgCol = dayMp >= 20 ? "FEE2E2" : dayMp >= 10 ? "FEF3C7" : "E0F2FE";
        const txtCol = dayMp >= 20 ? C.red : dayMp >= 10 ? C.orange : C.blue;
        s1.addShape("roundRect", {
          x: x0 + k * cw + 0.45, y: y0 + w * ch + 0.03, w: cw - 0.49, h: 0.14,
          fill: { color: bgCol }, line: { color: txtCol, width: 0.4 }
        });
        s1.addText(`👥 ${dayMp}명`, {
          x: x0 + k * cw + 0.47, y: y0 + w * ch + 0.02, w: cw - 0.53, h: 0.15,
          fontSize: 6.5, bold: true, color: txtCol, align: "center", margin: 0
        });
      }
    }

    // 주차별 프로젝트 막대 (Native roundRect & Text)
    const a = mappedProjects.filter(p => p.effStart <= weStr && p.effEnd >= wsStr);
    a.slice(0, 5).forEach((p, l) => {
      const st = Math.max(0, Math.round((d(p.effStart) - d(wsStr)) / DAY));
      const en = Math.min(6, Math.round((d(p.effEnd) - d(wsStr)) / DAY));
      const bx = x0 + st * cw, by = y0 + w * ch + 0.22 + l * 0.12, bw = (en - st + 1) * cw;
      const barColor = hex(p.projectColor);

      s1.addShape("roundRect", {
        x: bx + 0.02, y: by, w: bw - 0.04, h: 0.095,
        fill: { color: barColor }, line: { color: barColor, transparency: 100 }
      });
      const barLabel = `${normalizeJVName(p.manufacturingNo)} ${normalizeJVName(p.name)}${isConstruction && p.cp.hasConstructionData ? ` (${p.effStart.slice(5)}~${p.effEnd.slice(5)})` : ''}`;
      s1.addText(barLabel, {
        x: bx + 0.04, y: by - 0.015, w: bw - 0.08, h: 0.11,
        fontSize: 5.5, bold: true, color: C.white, margin: 0, fit: "shrink"
      });
    });
  }

  // =============================================================
  // SLIDE 2: 일일 부서별 공수 투입 현황 매트릭스 (100% Native Table)
  // =============================================================
  const s2 = x.addSlide();
  head(s2, `${monthLabel} 일일 부서별 투입 공수 현황 (Daily Department Matrix)`, "PowerPoint 네이티브 표로 작성되어 모든 셀의 수치와 부서명을 직접 수정할 수 있습니다.", 2);

  const lastDateNum = matrix.days.length;
  const tableHeaders = [
    { text: "구분 (부서)", options: { bold: true, fill: C.navy, color: C.white, align: "center" } }
  ];
  for (let day = 1; day <= lastDateNum; day++) {
    const curD = new Date(curYear, curMonthIdx, day);
    const dayOfWeek = curD.getDay();
    const isWknd = dayOfWeek === 0 || dayOfWeek === 6;
    tableHeaders.push({
      text: `${day}`,
      options: {
        bold: true,
        fill: isWknd ? "2E4A62" : C.navy,
        color: dayOfWeek === 0 ? "FCA5A5" : dayOfWeek === 6 ? "93C5FD" : C.white,
        align: "center"
      }
    });
  }
  tableHeaders.push({ text: "월간 합계", options: { bold: true, fill: C.blue, color: C.white, align: "center" } });

  const matrixRows = [tableHeaders];

  // 부서별 데이터 행
  const deptsToDisplay = matrix.sortedDepts.length > 0 ? matrix.sortedDepts : ["기구", "제어", "비전", "설비기술", "공통"];
  deptsToDisplay.forEach(dept => {
    let deptMonthSum = 0;
    const row = [
      { text: dept, options: { bold: true, fill: "F1F5F9", color: C.navy, align: "center" } }
    ];
    matrix.days.forEach(dStr => {
      const val = matrix.dayDataMap[dStr]?.depts?.[dept] || 0;
      deptMonthSum += val;
      row.push({
        text: val > 0 ? String(val) : "-",
        options: {
          bold: val > 0,
          color: val > 0 ? C.navy : "94A3B8",
          fill: val > 0 ? "EFF6FF" : C.white,
          align: "center"
        }
      });
    });
    row.push({
      text: `${deptMonthSum}`,
      options: { bold: true, color: C.blue, fill: "DBEAFE", align: "center" }
    });
    matrixRows.push(row);
  });

  // 당일 총합 (Daily Total) 행
  const totalRow = [
    { text: "당일 총합 (명)", options: { bold: true, fill: "1E3A8A", color: C.white, align: "center" } }
  ];
  matrix.days.forEach(dStr => {
    const val = matrix.dayDataMap[dStr]?.total || 0;
    totalRow.push({
      text: val > 0 ? String(val) : "0",
      options: {
        bold: true,
        color: val >= 20 ? "FEE2E2" : C.white,
        fill: val >= 20 ? "B91C1C" : val > 0 ? "2563EB" : "475569",
        align: "center"
      }
    });
  });
  totalRow.push({
    text: `${totalMonthManday}`,
    options: { bold: true, color: C.white, fill: "0F172A", align: "center" }
  });
  matrixRows.push(totalRow);

  // 컬럼 너비 지정 (가로 12.3인치)
  const deptColW = 1.3;
  const totalColW = 0.9;
  const dayColW = (12.3 - deptColW - totalColW) / lastDateNum;
  const colWidths = [deptColW, ...Array(lastDateNum).fill(dayColW), totalColW];

  s2.addTable(matrixRows, {
    x: 0.52,
    y: 1.25,
    w: 12.3,
    colW: colWidths,
    fontSize: 7,
    rowH: 0.28,
    margin: 0.02,
    border: { type: "solid", color: C.line, pt: 0.5 }
  });

  // =============================================================
  // SLIDE 3: 당월 공사 진행 프로젝트 및 부서별 투입 공수 명세표 (100% Native Table)
  // =============================================================
  const s3 = x.addSlide();
  head(s3, `${monthLabel} 프로젝트별 공사 일정 및 투입 공수 명세`, "각 프로젝트별 실제 공사 기간과 부서별 상세 투입 인원(M/D) 내역입니다. (직접 편집 가능)", 3);

  const monthStartStr = `${curYear}-${String(curMonthIdx + 1).padStart(2, '0')}-01`;
  const monthEndStr = matrix.days[matrix.days.length - 1];
  const activeProjectsInMonth = mappedProjects.filter(p => p.effStart <= monthEndStr && p.effEnd >= monthStartStr);

  const detailHeader = [
    "No", "제조번호", "Site", "프로젝트명", "공사 일정", "공사 구분", "기구", "제어", "비전", "기타", "당월 공수", "전체 공수"
  ];
  const detailRows = [
    detailHeader.map(h => ({ text: h, options: { bold: true, fill: C.navy, color: C.white, align: "center" } }))
  ];

  activeProjectsInMonth.slice(0, 14).forEach((p, idx) => {
    let pKigu = 0, pJeeo = 0, pVision = 0, pEtc = 0, pMonthSum = 0;
    matrix.days.forEach(dStr => {
      if (p.manpower?.departments) {
        Object.entries(p.manpower.departments).forEach(([dk, dObj]) => {
          const val = Number(dObj?.daily?.[dStr]) || 0;
          if (val > 0) {
            pMonthSum += val;
            if (dk.includes("기구")) pKigu += val;
            else if (dk.includes("제어")) pJeeo += val;
            else if (dk.includes("비전")) pVision += val;
            else pEtc += val;
          }
        });
      } else if (p.manpower?.dailyTotal?.[dStr]) {
        const val = Number(p.manpower.dailyTotal[dStr]) || 0;
        pMonthSum += val;
        pEtc += val;
      }
    });

    const isEven = idx % 2 === 1;
    const rowBg = isEven ? "F8FAFC" : C.white;
    const constrType = p.cp.hasConstructionData ? (p.cp.msStartDate ? '셋업/이설' : '공수투입') : '일반일정';

    detailRows.push([
      { text: String(idx + 1), options: { align: "center", fill: rowBg } },
      { text: normalizeJVName(p.manufacturingNo || '-'), options: { align: "center", bold: true, fill: rowBg } },
      { text: normalizeJVName(p.site || '-'), options: { align: "center", fill: rowBg } },
      { text: normalizeJVName(p.name || '-'), options: { align: "left", fill: rowBg } },
      { text: `${p.effStart.slice(5)} ~ ${p.effEnd.slice(5)}`, options: { align: "center", bold: true, fill: rowBg } },
      { text: constrType, options: { align: "center", color: constrType !== '일반일정' ? C.blue : C.gray, fill: rowBg } },
      { text: pKigu > 0 ? `${pKigu}` : "-", options: { align: "center", fill: rowBg } },
      { text: pJeeo > 0 ? `${pJeeo}` : "-", options: { align: "center", fill: rowBg } },
      { text: pVision > 0 ? `${pVision}` : "-", options: { align: "center", fill: rowBg } },
      { text: pEtc > 0 ? `${pEtc}` : "-", options: { align: "center", fill: rowBg } },
      { text: `${pMonthSum} M/D`, options: { align: "center", bold: true, color: C.blue, fill: "EFF6FF" } },
      { text: `${p.manpower?.totalManday || pMonthSum} M/D`, options: { align: "center", fill: rowBg } }
    ]);
  });

  s3.addTable(detailRows, {
    x: 0.52,
    y: 1.25,
    w: 12.3,
    colW: [0.5, 1.3, 1.1, 2.7, 1.6, 0.9, 0.6, 0.6, 0.6, 0.6, 1.0, 0.8],
    fontSize: 7.5,
    rowH: 0.26,
    margin: 0.03,
    border: { type: "solid", color: C.line, pt: 0.5 }
  });

  const fileNamePrefix = isConstruction ? "TW_Construction_Manpower_Report" : "TW_Project_Calendar";
  await x.writeFile({
    fileName: `${fileNamePrefix}_${curYear}-${String(curMonthIdx + 1).padStart(2, "0")}.pptx`,
    compression: true
  });
}

/**
 * =========================================================================================
 * 📊 간트차트 & 공사일정 달력 통합 종합 보고서 PPT 내보내기 (100% Native Shapes & Tables)
 * - 공사 일정 기준 vs 전체 프로젝트 일정 기준 선택 가능
 * - 임의 기간(startDate ~ endDate) 설정 및 해당 기간 필터링
 * - 슬라이드 구성 선택 (요약, 달력, 일일 부서별 공수표, 간트차트, 상세 명세서)
 * - 파워포인트에서 100% 직접 수정 가능 (이미지 캡쳐 절대 사용 안 함)
 * =========================================================================================
 */
export async function exportComprehensiveReport(projects, options = {}) {
  if (!projects || !projects.length) throw new Error("내보낼 프로젝트가 없습니다.");

  const {
    mode = 'construction', // 'construction' | 'project'
    startDate = '',
    endDate = '',
    filters = {},
    includeSlides = {
      summary: true,
      calendar: true,
      manpower: true,
      gantt: true,
      details: true
    }
  } = options;

  const isConstruction = mode === 'construction';
  const modeLabel = isConstruction ? "공사 일정 기준" : "전체 프로젝트 일정 기준";
  const pptTitle = isConstruction ? "TW 공사 종합 일정 보고서" : "TW 전체 프로젝트 종합 일정 보고서";
  const x = ppt(pptTitle);

  // 1. 각 프로젝트의 일정 및 진행률 매핑
  const mappedAll = projects.map(p => {
    const cp = getConstructionPeriod(p);
    const effStart = isConstruction ? (cp.startDate || p.startDate) : p.startDate;
    const effEnd = isConstruction ? (cp.endDate || p.endDate) : p.endDate;
    const effProgress = isConstruction ? cp.progress : progress(p);
    return {
      ...p,
      cp,
      effStart,
      effEnd,
      effProgress
    };
  });

  // 2. 기간 필터링
  let targetProjects = mappedAll;
  if (startDate && endDate) {
    targetProjects = mappedAll.filter(p => (!p.effStart || p.effStart <= endDate) && (!p.effEnd || p.effEnd >= startDate));
  } else if (startDate) {
    targetProjects = mappedAll.filter(p => !p.effEnd || p.effEnd >= startDate);
  } else if (endDate) {
    targetProjects = mappedAll.filter(p => !p.effStart || p.effStart <= endDate);
  }
  if (!targetProjects.length) {
    targetProjects = mappedAll; // 필터 결과 없으면 전체 프로젝트로 폴백
  }

  // 3. 기준 월 (달력 및 매트릭스용)
  let refDate = new Date();
  if (startDate) {
    const parsed = new Date(`${startDate}T00:00:00`);
    if (!isNaN(parsed.getTime())) refDate = parsed;
  }
  const curYear = refDate.getFullYear();
  const curMonthIdx = refDate.getMonth();
  const monthLabel = `${curYear}년 ${curMonthIdx + 1}월`;

  const matrix = getMonthDailyDeptMatrix(targetProjects, curYear, curMonthIdx);
  const totalMonthManday = matrix.days.reduce((acc, dStr) => acc + (matrix.dayDataMap[dStr]?.total || 0), 0);
  const peakDayEntry = matrix.days.reduce((peak, dStr) => {
    const curVal = matrix.dayDataMap[dStr]?.total || 0;
    return curVal > peak.val ? { date: dStr, val: curVal } : peak;
  }, { date: "-", val: 0 });

  const avgProgress = targetProjects.length > 0
    ? Math.round(targetProjects.reduce((acc, p) => acc + (p.effProgress || 0), 0) / targetProjects.length)
    : 0;

  const periodStr = (startDate || endDate)
    ? `${startDate || '시작'} ~ ${endDate || '종료'}`
    : '전체 기간';

  let pageIndex = 1;

  // =============================================================
  // SLIDE 1: 표지 및 Executive Summary KPI (Native Shapes & Tables)
  // =============================================================
  if (includeSlides.summary !== false) {
    const s1 = x.addSlide();
    head(s1, `TW 프로젝트 종합 일정 보고서 (${isConstruction ? '공사' : '전체일정'})`, `${conditions(filters)} | 설정 기간: ${periodStr} | 기준: ${modeLabel}`, pageIndex++);

    const kpiItems = [
      { label: "대상 프로젝트", val: `${targetProjects.length} 건`, sub: `전체 ${projects.length}건 중`, col: C.navy },
      { label: "기준월 투입 공수", val: `${totalMonthManday} M/D`, sub: `${monthLabel} 합계`, col: C.blue },
      { label: "일일 최대 투입(Peak)", val: `${peakDayEntry.val} 명`, sub: peakDayEntry.date.slice(5) || "-", col: C.red },
      { label: "평균 진행률", val: `${avgProgress}%`, sub: `${isConstruction ? '공사 기준' : '전체 기준'} 평균`, col: C.green }
    ];

    kpiItems.forEach((kpi, idx) => {
      const kx = 0.55 + idx * 3.08;
      s1.addShape("roundRect", { x: kx, y: 1.15, w: 2.95, h: 0.95, fill: { color: C.light }, line: { color: C.line, width: 0.6 } });
      s1.addText(kpi.label, { x: kx + 0.15, y: 1.25, w: 2.65, h: 0.22, fontSize: 8.5, color: C.gray, margin: 0 });
      s1.addText(kpi.val, { x: kx + 0.15, y: 1.48, w: 2.65, h: 0.36, fontSize: 20, bold: true, color: kpi.col, margin: 0 });
      s1.addText(kpi.sub, { x: kx + 0.15, y: 1.86, w: 2.65, h: 0.18, fontSize: 7.5, color: "94A3B8", margin: 0 });
    });

    // 요약 테이블 (상위 12개 프로젝트)
    const summaryHeader = ["제조번호", "Site", "프로젝트명", `${isConstruction ? '공사 일정' : '전체 일정'}`, "공사 구분", "상태", `${isConstruction ? '공사진행률' : '진행률'}`];
    const summaryRows = [
      summaryHeader.map(h => ({ text: h, options: { bold: true, fill: C.navy, color: C.white, align: "center" } }))
    ];

    targetProjects.slice(0, 11).forEach((p, idx) => {
      const isEven = idx % 2 === 1;
      const rowBg = isEven ? "F8FAFC" : C.white;
      const cType = p.cp?.hasConstructionData ? (p.cp?.msStartDate ? '셋업/이설' : '공수투입') : '일반일정';
      summaryRows.push([
        { text: normalizeJVName(p.manufacturingNo || '-'), options: { align: "center", bold: true, fill: rowBg } },
        { text: normalizeJVName(p.site || '-'), options: { align: "center", fill: rowBg } },
        { text: normalizeJVName(p.name || '-'), options: { align: "left", fill: rowBg } },
        { text: `${(p.effStart || '-').slice(2)} ~ ${(p.effEnd || '-').slice(2)}`, options: { align: "center", fill: rowBg } },
        { text: cType, options: { align: "center", color: cType !== '일반일정' ? C.blue : C.gray, fill: rowBg } },
        { text: p.status || '-', options: { align: "center", fill: rowBg } },
        { text: `${Math.round(p.effProgress || 0)}%`, options: { align: "center", bold: true, color: C.blue, fill: "EFF6FF" } }
      ]);
    });

    s1.addText("📋 주요 프로젝트 진행 현황 요약 (PowerPoint 직접 편집 가능 표)", {
      x: 0.55, y: 2.24, w: 12.0, h: 0.22, fontSize: 9.5, bold: true, color: C.navy, margin: 0
    });

    s1.addTable(summaryRows, {
      x: 0.55,
      y: 2.50,
      w: 12.25,
      colW: [1.8, 1.2, 4.35, 2.1, 1.0, 0.9, 0.9],
      fontSize: 8,
      rowH: 0.24,
      margin: 0.03,
      border: { type: "solid", color: C.line, pt: 0.5 }
    });
  }

  // =============================================================
  // SLIDE 2: 일정 달력 (Native Shapes)
  // =============================================================
  if (includeSlides.calendar !== false) {
    const s2 = x.addSlide();
    const cTitle = isConstruction ? `${monthLabel} 공사 일정 달력` : `${monthLabel} 프로젝트 일정 달력`;
    const cSub = `기준: ${modeLabel} | 월간 총 공수: ${totalMonthManday} M/D | 일일 최대 투입: ${peakDayEntry.val}명 | 기간: ${periodStr}`;
    head(s2, cTitle, cSub, pageIndex++);

    // 상단 미니 KPI
    const cKpis = [
      { label: "월간 총 투입 공수", val: `${totalMonthManday} M/D`, color: C.blue },
      { label: "일일 최대 투입(Peak)", val: `${peakDayEntry.val} 명 (${peakDayEntry.date.slice(5) || "-"})`, color: C.red },
      { label: "당월 진행 프로젝트", val: `${targetProjects.length} 건`, color: C.navy },
      { label: "투입 부서 수", val: `${matrix.sortedDepts.length} 개 부서`, color: C.green }
    ];
    cKpis.forEach((kpi, idx) => {
      const kx = 0.55 + idx * 3.08;
      s2.addShape("roundRect", { x: kx, y: 0.95, w: 2.95, h: 0.38, fill: { color: C.light }, line: { color: C.line, width: 0.5 } });
      s2.addText(`${kpi.label}: `, { x: kx + 0.12, y: 1.02, w: 1.5, h: 0.22, fontSize: 8, color: C.gray, margin: 0 });
      s2.addText(kpi.val, { x: kx + 1.25, y: 1.00, w: 1.6, h: 0.26, fontSize: 9.5, bold: true, color: kpi.color, margin: 0 });
    });

    const first = new Date(curYear, curMonthIdx, 1);
    const calStart = new Date(first);
    calStart.setDate(1 - first.getDay());
    const x0 = 0.55, y0 = 1.62, cw = 12.25 / 7, ch = 0.88;

    ["일", "월", "화", "수", "목", "금", "토"].forEach((v, i) => {
      s2.addText(v, {
        x: x0 + i * cw, y: 1.42, w: cw, h: 0.18, fontSize: 8, bold: true, align: "center",
        color: i === 0 ? C.red : i === 6 ? C.blue : C.gray, margin: 0
      });
    });

    for (let w = 0; w < 6; w++) {
      const ws = new Date(calStart);
      ws.setDate(calStart.getDate() + w * 7);
      const we = new Date(ws);
      we.setDate(ws.getDate() + 6);
      const wsStr = ws.toISOString().slice(0, 10);
      const weStr = we.toISOString().slice(0, 10);

      for (let k = 0; k < 7; k++) {
        const cur = new Date(ws);
        cur.setDate(ws.getDate() + k);
        const curStr = cur.toISOString().slice(0, 10);
        const isCurMonth = cur.getMonth() === curMonthIdx;
        const dayMp = matrix.dayDataMap[curStr]?.total || 0;

        s2.addShape("rect", {
          x: x0 + k * cw, y: y0 + w * ch, w: cw, h: ch,
          fill: { color: isCurMonth ? C.white : "F8FAFC" },
          line: { color: C.line, width: 0.5 }
        });

        s2.addText(String(cur.getDate()), {
          x: x0 + k * cw + 0.04, y: y0 + w * ch + 0.03, w: 0.35, h: 0.16,
          fontSize: 7.5, bold: isCurMonth, color: isCurMonth ? (k === 0 ? C.red : k === 6 ? C.blue : C.navy) : C.gray, margin: 0
        });

        if (dayMp > 0 && isCurMonth) {
          const bgCol = dayMp >= 20 ? "FEE2E2" : dayMp >= 10 ? "FEF3C7" : "E0F2FE";
          const txtCol = dayMp >= 20 ? C.red : dayMp >= 10 ? C.orange : C.blue;
          s2.addShape("roundRect", {
            x: x0 + k * cw + 0.45, y: y0 + w * ch + 0.03, w: cw - 0.49, h: 0.14,
            fill: { color: bgCol }, line: { color: txtCol, width: 0.4 }
          });
          s2.addText(`👥 ${dayMp}명`, {
            x: x0 + k * cw + 0.47, y: y0 + w * ch + 0.02, w: cw - 0.53, h: 0.15,
            fontSize: 6.5, bold: true, color: txtCol, align: "center", margin: 0
          });
        }
      }

      // 주차별 프로젝트 막대
      const a = targetProjects.filter(p => p.effStart <= weStr && p.effEnd >= wsStr);
      a.slice(0, 5).forEach((p, l) => {
        const st = Math.max(0, Math.round((d(p.effStart) - d(wsStr)) / DAY));
        const en = Math.min(6, Math.round((d(p.effEnd) - d(wsStr)) / DAY));
        const bx = x0 + st * cw, by = y0 + w * ch + 0.22 + l * 0.12, bw = (en - st + 1) * cw;
        const barColor = hex(p.projectColor);

        s2.addShape("roundRect", {
          x: bx + 0.02, y: by, w: bw - 0.04, h: 0.095,
          fill: { color: barColor }, line: { color: barColor, transparency: 100 }
        });
        const barLabel = `${normalizeJVName(p.manufacturingNo)} ${normalizeJVName(p.name)}${isConstruction && p.cp?.hasConstructionData ? ` (${(p.effStart || '').slice(5)}~${(p.effEnd || '').slice(5)})` : ''}`;
        s2.addText(barLabel, {
          x: bx + 0.04, y: by - 0.015, w: bw - 0.08, h: 0.11,
          fontSize: 5.5, bold: true, color: C.white, margin: 0, fit: "shrink"
        });
      });
    }
  }

  // =============================================================
  // SLIDE 3: 일일 부서별 공수 매트릭스 표 (100% Native Table)
  // =============================================================
  if (includeSlides.manpower !== false) {
    const s3 = x.addSlide();
    head(s3, `${monthLabel} 일일 부서별 투입 공수 매트릭스 (Daily Department Matrix)`, "PowerPoint 네이티브 표로 작성되어 모든 셀의 수치와 부서명을 직접 수정할 수 있습니다.", pageIndex++);

    const lastDateNum = matrix.days.length;
    const tableHeaders = [
      { text: "구분 (부서)", options: { bold: true, fill: C.navy, color: C.white, align: "center" } }
    ];
    for (let day = 1; day <= lastDateNum; day++) {
      const curD = new Date(curYear, curMonthIdx, day);
      const dayOfWeek = curD.getDay();
      const isWknd = dayOfWeek === 0 || dayOfWeek === 6;
      tableHeaders.push({
        text: `${day}`,
        options: {
          bold: true,
          fill: isWknd ? "2E4A62" : C.navy,
          color: dayOfWeek === 0 ? "FCA5A5" : dayOfWeek === 6 ? "93C5FD" : C.white,
          align: "center"
        }
      });
    }
    tableHeaders.push({ text: "월간 합계", options: { bold: true, fill: C.blue, color: C.white, align: "center" } });

    const matrixRows = [tableHeaders];
    const deptsToDisplay = matrix.sortedDepts.length > 0 ? matrix.sortedDepts : ["기구", "제어", "비전", "설비기술", "공통"];
    deptsToDisplay.forEach(dept => {
      let deptMonthSum = 0;
      const row = [
        { text: dept, options: { bold: true, fill: "F1F5F9", color: C.navy, align: "center" } }
      ];
      matrix.days.forEach(dStr => {
        const val = matrix.dayDataMap[dStr]?.depts?.[dept] || 0;
        deptMonthSum += val;
        row.push({
          text: val > 0 ? String(val) : "-",
          options: {
            bold: val > 0,
            color: val > 0 ? C.navy : "94A3B8",
            fill: val > 0 ? "EFF6FF" : C.white,
            align: "center"
          }
        });
      });
      row.push({
        text: `${deptMonthSum}`,
        options: { bold: true, color: C.blue, fill: "DBEAFE", align: "center" }
      });
      matrixRows.push(row);
    });

    // 당일 총합
    const totalRow = [
      { text: "당일 총합 (명)", options: { bold: true, fill: "1E3A8A", color: C.white, align: "center" } }
    ];
    matrix.days.forEach(dStr => {
      const val = matrix.dayDataMap[dStr]?.total || 0;
      totalRow.push({
        text: val > 0 ? String(val) : "0",
        options: {
          bold: true,
          color: val >= 20 ? "FEE2E2" : C.white,
          fill: val >= 20 ? "B91C1C" : val > 0 ? "2563EB" : "475569",
          align: "center"
        }
      });
    });
    totalRow.push({
      text: `${totalMonthManday}`,
      options: { bold: true, color: C.white, fill: "0F172A", align: "center" }
    });
    matrixRows.push(totalRow);

    const deptColW = 1.3;
    const totalColW = 0.9;
    const dayColW = (12.3 - deptColW - totalColW) / lastDateNum;
    const colWidths = [deptColW, ...Array(lastDateNum).fill(dayColW), totalColW];

    s3.addTable(matrixRows, {
      x: 0.52,
      y: 1.25,
      w: 12.3,
      colW: colWidths,
      fontSize: 7,
      rowH: 0.28,
      margin: 0.02,
      border: { type: "solid", color: C.line, pt: 0.5 }
    });
  }

  // =============================================================
  // SLIDE 4~: 종합 프로젝트 간트차트 (100% Native Shapes & Text)
  // =============================================================
  if (includeSlides.gantt !== false) {
    // 간트차트 타임라인 범위 결정
    const allDates = targetProjects.flatMap(p => [
      p.effStart,
      p.effEnd,
      ...(p.milestones || []).flatMap(m => [m.startDate, m.endDate])
    ]).filter(Boolean).map(d);

    if (startDate) allDates.push(d(startDate));
    if (endDate) allDates.push(d(endDate));

    const gStart = allDates.length ? new Date(Math.min(...allDates.map(x => x.getTime()))) : new Date();
    const gEnd = allDates.length ? new Date(Math.max(...allDates.map(x => x.getTime()))) : new Date(Date.now() + DAY * 30);
    const gSpan = Math.max(DAY, gEnd - gStart + DAY);

    // 간트 행 구성
    const ganttRows = [];
    targetProjects.forEach(p => {
      ganttRows.push({
        p,
        name: `${normalizeJVName(p.manufacturingNo)} · ${normalizeJVName(p.name)}`,
        s: p.effStart,
        e: p.effEnd,
        v: p.effProgress,
        main: true,
        typeLabel: isConstruction && p.cp?.hasConstructionData ? (p.cp.msStartDate ? '셋업/이설' : '공수투입') : '일반'
      });

      // 마일스톤
      const msList = isConstruction
        ? ((p.cp?.constrMilestones && p.cp.constrMilestones.length > 0) ? p.cp.constrMilestones : (p.milestones || []).slice(0, 3))
        : (p.milestones || []);

      msList.filter(m => m && m.name && m.startDate && m.endDate).forEach(m => {
        const msElapsed = Math.max(0, Math.min(100, Math.round((new Date() - d(m.startDate)) / Math.max(DAY, d(m.endDate) - d(m.startDate)) * 100)));
        ganttRows.push({
          p,
          name: normalizeJVName(m.name),
          s: m.startDate,
          e: m.endDate,
          v: msElapsed,
          main: false
        });
      });
    });

    const perSlide = 16;
    for (let o = 0; o < ganttRows.length; o += perSlide) {
      const gs = x.addSlide();
      const gTitle = isConstruction ? "공사 종합 간트차트" : "종합 프로젝트 간트차트";
      const gSub = `${modeLabel} | 타임라인: ${gStart.toISOString().slice(0, 10)} ~ ${gEnd.toISOString().slice(0, 10)} | 설정 기간: ${periodStr}`;
      head(gs, gTitle, gSub, pageIndex++);

      const lx = 0.45, cx = 4.35, cw = 8.4, y0 = 1.30, rh = 0.33;

      gs.addText("프로젝트 / 마일스톤 명칭", { x: lx, y: 1.05, w: 3.7, h: 0.18, fontSize: 8.5, bold: true, color: C.gray, margin: 0 });

      // 세로 눈금선 및 날짜 헤더
      for (let i = 0; i <= 6; i++) {
        const tickDate = new Date(gStart.getTime() + (gSpan * i / 6));
        const tickStr = `${tickDate.getMonth() + 1}/${tickDate.getDate()}`;
        const tickX = cx + i * (cw / 6);
        gs.addShape("line", { x: tickX, y: y0, w: 0, h: Math.min(perSlide, ganttRows.length - o) * rh, line: { color: "E5EBF0", width: 0.4 } });
        gs.addText(tickStr, { x: tickX - 0.3, y: 1.08, w: 0.6, h: 0.16, fontSize: 7, color: "94A3B8", align: "center", margin: 0 });
      }

      // 오늘선
      const tp = (new Date() - gStart) / gSpan;
      if (tp >= 0 && tp <= 1) {
        gs.addShape("line", { x: cx + tp * cw, y: y0, w: 0, h: Math.min(perSlide, ganttRows.length - o) * rh, line: { color: C.red, width: 1.1, dash: "dash" } });
        gs.addText("오늘", { x: cx + tp * cw - 0.2, y: 1.14, w: 0.4, h: 0.14, fontSize: 6.5, bold: true, color: C.red, align: "center", margin: 0 });
      }

      ganttRows.slice(o, o + perSlide).forEach((q, i) => {
        const y = y0 + i * rh;
        const ind = q.main ? 0 : 0.25;

        // 라벨
        gs.addText(q.name, {
          x: lx + ind, y: y + 0.04, w: 3.75 - ind, h: 0.18,
          fontSize: q.main ? 8.5 : 7.5,
          bold: q.main,
          color: q.main ? C.navy : C.gray,
          margin: 0,
          fit: "shrink"
        });

        // 타임라인 막대
        const left = Math.max(0, (d(q.s) - gStart) / gSpan);
        const right = Math.min(1, (d(q.e) - gStart + DAY) / gSpan);
        const bx = cx + left * cw;
        const bw = Math.max(0.05, (right - left) * cw);
        const color = hex(q.p.projectColor);
        const barH = q.main ? 0.16 : 0.10;
        const doneW = bw * Math.max(0, Math.min(100, q.v)) / 100;

        // 배경 바
        gs.addShape(q.main ? "roundRect" : "rect", {
          x: bx, y: y + 0.075, w: bw, h: barH,
          fill: { color, transparency: q.main ? 70 : 85 },
          line: { color, width: q.main ? 0.6 : 0.4, transparency: 40 }
        });

        // 완료율 채움 바
        if (doneW > 0) {
          gs.addShape(q.main ? "roundRect" : "rect", {
            x: bx, y: y + 0.075, w: Math.max(0.03, doneW), h: barH,
            fill: { color, transparency: 0 },
            line: { color, transparency: 100 }
          });
        }

        // 진행률 텍스트
        const progressLabel = q.main
          ? `${isConstruction ? '공사 ' : ''}${Math.round(q.v)}%`
          : `${Math.round(q.v)}%`;

        gs.addText(progressLabel, {
          x: Math.min(bx + bw + 0.04, 12.35), y: y + 0.035, w: 0.65, h: 0.18,
          fontSize: 7, bold: q.main, color: q.main ? C.navy : C.gray, margin: 0, fit: "shrink"
        });
      });
    }
  }

  // =============================================================
  // SLIDE 5: 프로젝트별 공사 및 공수 상세 명세서 (100% Native Table)
  // =============================================================
  if (includeSlides.details !== false) {
    const s5 = x.addSlide();
    head(s5, `${isConstruction ? '공사 일정 및 부서별 투입 공수 명세' : '프로젝트 일정 및 투입 공수 명세'}`, "각 프로젝트별 상세 일정과 부서별 투입 인원(M/D) 내역입니다. (직접 편집 가능)", pageIndex++);

    const detailHeader = [
      "No", "제조번호", "Site", "프로젝트명", `${isConstruction ? '공사 일정' : '전체 일정'}`, "공사 구분", "기구", "제어", "비전", "기타", "기준월 공수", "전체 공수"
    ];
    const detailRows = [
      detailHeader.map(h => ({ text: h, options: { bold: true, fill: C.navy, color: C.white, align: "center" } }))
    ];

    targetProjects.slice(0, 14).forEach((p, idx) => {
      let pKigu = 0, pJeeo = 0, pVision = 0, pEtc = 0, pMonthSum = 0;
      matrix.days.forEach(dStr => {
        if (p.manpower?.departments) {
          Object.entries(p.manpower.departments).forEach(([dk, dObj]) => {
            const val = Number(dObj?.daily?.[dStr]) || 0;
            if (val > 0) {
              pMonthSum += val;
              if (dk.includes("기구")) pKigu += val;
              else if (dk.includes("제어")) pJeeo += val;
              else if (dk.includes("비전")) pVision += val;
              else pEtc += val;
            }
          });
        } else if (p.manpower?.dailyTotal?.[dStr]) {
          const val = Number(p.manpower.dailyTotal[dStr]) || 0;
          pMonthSum += val;
          pEtc += val;
        }
      });

      const isEven = idx % 2 === 1;
      const rowBg = isEven ? "F8FAFC" : C.white;
      const constrType = p.cp?.hasConstructionData ? (p.cp.msStartDate ? '공사' : '공수투입') : '일반일정';

      detailRows.push([
        { text: String(idx + 1), options: { align: "center", fill: rowBg } },
        { text: normalizeJVName(p.manufacturingNo || '-'), options: { align: "center", bold: true, fill: rowBg } },
        { text: normalizeJVName(p.site || '-'), options: { align: "center", fill: rowBg } },
        { text: normalizeJVName(p.name || '-'), options: { align: "left", fill: rowBg } },
        { text: `${(p.effStart || '-').slice(5)} ~ ${(p.effEnd || '-').slice(5)}`, options: { align: "center", bold: true, fill: rowBg } },
        { text: constrType, options: { align: "center", color: constrType !== '일반일정' ? C.blue : C.gray, fill: rowBg } },
        { text: pKigu > 0 ? `${pKigu}` : "-", options: { align: "center", fill: rowBg } },
        { text: pJeeo > 0 ? `${pJeeo}` : "-", options: { align: "center", fill: rowBg } },
        { text: pVision > 0 ? `${pVision}` : "-", options: { align: "center", fill: rowBg } },
        { text: pEtc > 0 ? `${pEtc}` : "-", options: { align: "center", fill: rowBg } },
        { text: `${pMonthSum} M/D`, options: { align: "center", bold: true, color: C.blue, fill: "EFF6FF" } },
        { text: `${p.manpower?.totalManday || pMonthSum} M/D`, options: { align: "center", fill: rowBg } }
      ]);
    });

    s5.addTable(detailRows, {
      x: 0.52,
      y: 1.25,
      w: 12.3,
      colW: [0.5, 1.3, 1.1, 2.7, 1.6, 0.9, 0.6, 0.6, 0.6, 0.6, 1.0, 0.8],
      fontSize: 7.5,
      rowH: 0.26,
      margin: 0.03,
      border: { type: "solid", color: C.line, pt: 0.5 }
    });
  }

  const filePrefix = isConstruction ? "TW_종합보고서_공사기준" : "TW_종합보고서_전체일정기준";
  const dateTag = (startDate && endDate) ? `${startDate}_${endDate}` : today();
  await x.writeFile({
    fileName: `${filePrefix}_${dateTag}.pptx`,
    compression: true
  });
}
function title(ws,last,text,sub){ws.mergeCells(1,1,1,last);Object.assign(ws.getCell(1,1),{value:text,font:{name:"맑은 고딕",size:20,bold:true,color:{argb:"FFFFFFFF"}},fill:{type:"pattern",pattern:"solid",fgColor:{argb:"FF17324D"}},alignment:{vertical:"middle"}});ws.getRow(1).height=34;ws.mergeCells(2,1,2,last);Object.assign(ws.getCell(2,1),{value:sub,font:{name:"맑은 고딕",size:9,color:{argb:"FF52677A"}},fill:{type:"pattern",pattern:"solid",fgColor:{argb:"FFEAF2F8"}},alignment:{vertical:"middle"}});ws.getRow(2).height=22}
function header(row){row.height=24;row.eachCell(c=>{c.font={name:"맑은 고딕",size:10,bold:true,color:{argb:"FFFFFFFF"}};c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF0B68B5"}};c.alignment={vertical:"middle",horizontal:"center",wrapText:true}})}
function finish(ws,start=5){for(let r=start;r<=ws.rowCount;r++){ws.getRow(r).height=22;ws.getRow(r).eachCell(c=>{c.font={name:"맑은 고딕",size:9,color:{argb:"FF17324D"}};c.alignment={vertical:"middle",wrapText:true};c.border={bottom:{style:"hair",color:{argb:"FFDCE5ED"}}}})}ws.columns.forEach(c=>{let w=10;c.eachCell({includeEmpty:true},v=>w=Math.max(w,Math.min(38,String(v.value??"").length+3)));c.width=w})}
function save(buffer,name){const u=URL.createObjectURL(new Blob([buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),500)}
export async function exportExcelReport(projects,filters={}){if(!projects.length)throw new Error("내보낼 프로젝트가 없습니다.");const wb=new ExcelJS.Workbook(),sub=`기준일 ${today()} | ${conditions(filters)}`,ws=wb.addWorksheet("프로젝트 현황",{views:[{state:"frozen",ySplit:4}],pageSetup:{orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:0}}),h=["제조번호","Site","Line","프로젝트명","소장","설계","설비기술","제어","비전","시작일","종료일","상태","일정 진행률","진행 방식"];title(ws,h.length,"TW Project 프로젝트 현황 보고서",sub);ws.addRow([]);ws.addRow(h);header(ws.getRow(4));projects.forEach(p=>ws.addRow([normalizeJVName(p.manufacturingNo),normalizeJVName(p.site),normalizeJVName(p.line),normalizeJVName(p.name),p.pm,p.design,p.facilityTechnology,p.control,p.vision,d(p.startDate),d(p.endDate),p.status,progress(p)/100,p.autoProgress?"자동":"수동"]));ws.autoFilter={from:{row:4,column:1},to:{row:ws.rowCount,column:h.length}};ws.getColumn(10).numFmt=ws.getColumn(11).numFmt="yyyy-mm-dd";ws.getColumn(13).numFmt="0%";finish(ws);ws.getColumn(4).width=Math.max(20,ws.getColumn(4).width);const ms=wb.addWorksheet("마일스톤 상세",{views:[{state:"frozen",ySplit:4}],pageSetup:{orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:0}}),mh=["제조번호","프로젝트명","마일스톤명","시작일","종료일","기간(일)","일정 구분"];title(ms,mh.length,"마일스톤 상세 보고서",sub);ms.addRow([]);ms.addRow(mh);header(ms.getRow(4));projects.forEach(p=>(p.milestones||[]).filter(m=>m.name).forEach(m=>ms.addRow([normalizeJVName(p.manufacturingNo),normalizeJVName(p.name),normalizeJVName(m.name),d(m.startDate),d(m.endDate),Math.max(1,Math.round((d(m.endDate)-d(m.startDate))/DAY)+1),d(m.startDate)<d(p.startDate)?"선행 일정":d(m.endDate)>d(p.endDate)?"후행 일정":"프로젝트 기간 내"])));ms.getColumn(4).numFmt=ms.getColumn(5).numFmt="yyyy-mm-dd";finish(ms);const sm=wb.addWorksheet("요약",{views:[{showGridLines:false}]});title(sm,4,"프로젝트 요약",sub);sm.addRow([]);sm.addRow(["구분","전체","진행 중","완료"]);header(sm.getRow(4));sm.addRow(["프로젝트 수",projects.length,projects.filter(p=>p.status!=="완료").length,projects.filter(p=>p.status==="완료").length]);sm.addRow([]);sm.addRow(["상태","프로젝트 수"]);header(sm.getRow(7));[...new Set(projects.map(p=>p.status))].forEach(v=>sm.addRow([v,projects.filter(p=>p.status===v).length]));finish(sm);save(await wb.xlsx.writeBuffer(),`TW_Project_Report_${today()}.xlsx`)}
