import PptxGenJS from "pptxgenjs";
import ExcelJS from "exceljs";
import { normalizeJVName, getConstructionPeriod, getMonthDailyDeptMatrix, getDailyDepartmentManpower } from "./utils.js";
import {
  TW_LOGO_COVER,
  TW_LOGO_FOOTER,
  TW_LOGO_ENDING,
  SECURITY_NOTICE,
  TW_SLOGAN
} from "./pptTemplateAssets.js";

const DAY=86400000,C={navy:"17324D",blue:"0B68B5",light:"F4F7FB",line:"D8E2EA",gray:"64748B",white:"FFFFFF",green:"16A34A",red:"DC2626",orange:"EA580C"};
const d=s=>new Date(`${s}T00:00:00`),hex=s=>String(s||C.blue).replace("#","").slice(0,6),today=()=>new Date().toISOString().slice(0,10);
const progress=p=>Number.isFinite(+p.value)?+p.value:p.status==="완료"?100:0;
const conditions=f=>`상태 ${f.filter||"전체"} | Site ${normalizeJVName(f.siteFilter||"전체")} | 담당자 ${f.personFilter||"전체"} | 검색 ${normalizeJVName(f.search||"없음")}`;
function ppt(title){
  const x=new PptxGenJS();
  x.layout="LAYOUT_WIDE"; // 13.333 x 7.5 인치 (16:9 Widescreen, TW PPT 공식 규격 일치)
  x.author="(주)TW";
  x.company="(주)TW";
  x.title=title;
  x.subject=title;
  x.lang="ko-KR";
  return x;
}
function head(slide, title, sub, page, totalPages) {
  slide.background = { color: C.white };
  // 슬라이드 제목 (상단) - 원본 TW PPT 양식 스타일 일치
  slide.addText(title, { x: 0.55, y: 0.25, w: 10.5, h: 0.42, fontSize: 17, bold: true, color: C.navy, fontFace: "맑은 고딕", margin: 0 });
  // 서브 메타 정보
  slide.addText(sub, { x: 0.55, y: 0.68, w: 12.2, h: 0.22, fontSize: 8.5, color: C.gray, fontFace: "맑은 고딕", margin: 0 });
  // 은은한 구분선
  slide.addShape("line", { x: 0.55, y: 0.92, w: 12.23, h: 0, line: { color: "D8E2EA", width: 0.8 } });
  
  // 하단 좌측 TW 공식 로고 (원본 Layout 2 규격: x: 0.30, y: 7.17, w: 1.25, h: 0.28)
  try {
    slide.addImage({ data: TW_LOGO_FOOTER, x: 0.30, y: 7.17, w: 1.25, h: 0.28 });
  } catch (e) {}

  // 하단 중앙 보안 문구 (원본 Layout 2 규격: x: 4.38, y: 7.12, w: 4.57, h: 0.13)
  slide.addText(SECURITY_NOTICE, { x: 4.38, y: 7.12, w: 4.57, h: 0.16, fontSize: 6.5, color: "8493A1", fontFace: "맑은 고딕", align: "center", margin: 0 });
  // 하단 우측 슬로건 (원본 Layout 2 규격: x: 9.34, y: 7.17, w: 3.72, h: 0.25)
  slide.addText(TW_SLOGAN, { x: 9.34, y: 7.17, w: 3.72, h: 0.25, fontSize: 7.5, bold: true, color: C.navy, fontFace: "맑은 고딕", align: "right", margin: 0 });
  // 하단 슬라이드 페이지 번호 (원본 Layout 2 규격: x: 6.14, y: 7.19, w: 0.54, h: 0.34)
  const pageStr = totalPages ? `${page} / ${totalPages}` : `${page}`;
  slide.addText(pageStr, { x: 6.14, y: 7.19, w: 0.54, h: 0.20, fontSize: 7, color: "8493A1", fontFace: "맑은 고딕", align: "center", margin: 0 });
}

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
    customer = '',
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

  // 1. 고객사 필터링 (SKon 선택 시 SKon 프로젝트만 격리 수록)
  const selectedCustomer = customer || (projects[0]?.customer) || "SK on";
  const customerOnlyProjects = projects.filter(p => !p.customer || p.customer === selectedCustomer);
  const baseProjects = customerOnlyProjects.length > 0 ? customerOnlyProjects : projects;

  const pptReportTitle = `${selectedCustomer} 프로젝트 ${isConstruction ? '공사 일정 및 투입 공수' : '종합 일정 및 공수'} 종합 보고서`;
  const x = ppt(pptReportTitle);

  // 로컬 기준 YYYY-MM-DD 변환 유틸 (타임존 하루 밀림 버그 원천 방지)
  const toYmd = dt => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

  // 2. 각 프로젝트의 일정 및 진행률 매핑
  const mappedAll = baseProjects.map(p => {
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

  // 3. 기간 필터링: 설정 기간에 걸쳐 있는 모든 프로젝트 누락 없이 포함
  let targetProjects = mappedAll;
  if (startDate && endDate) {
    const filtered = mappedAll.filter(p => (!p.effStart || p.effStart <= endDate) && (!p.effEnd || p.effEnd >= startDate));
    if (filtered.length > 0) targetProjects = filtered;
  }

  // 4. 월별 목록 및 4개월 단위 분기 청크 계산
  const monthsInRange = getMonthsInRange(startDate, endDate, targetProjects);
  const monthsSummaryStr = monthsInRange.length > 1
    ? `${monthsInRange[0].label} ~ ${monthsInRange[monthsInRange.length - 1].label} (${monthsInRange.length}개월)`
    : (monthsInRange[0]?.label || "전체");

  const quarterChunks = [];
  for (let i = 0; i < monthsInRange.length; i += 4) {
    quarterChunks.push(monthsInRange.slice(i, i + 4));
  }

  // 5. 간트차트 데이터: 마일스톤 펼침 없이 메인 프로젝트 바만 생성
  const gAllDates = targetProjects.flatMap(p => [p.effStart, p.effEnd]).filter(Boolean).map(d);
  let gStart = new Date(), gEnd = new Date();
  if (gAllDates.length > 0) {
    gStart = new Date(Math.min(...gAllDates.map(xx => xx.getTime())));
    gEnd = new Date(Math.max(...gAllDates.map(xx => xx.getTime())));
  }
  if (startDate && !isNaN(new Date(`${startDate}T00:00:00`).getTime())) gStart = new Date(`${startDate}T00:00:00`);
  if (endDate && !isNaN(new Date(`${endDate}T00:00:00`).getTime())) gEnd = new Date(`${endDate}T00:00:00`);
  const gSpan = Math.max(DAY, gEnd.getTime() - gStart.getTime() + DAY);

  const ganttRows = targetProjects.map(p => ({
    p,
    name: `${normalizeJVName(p.manufacturingNo || "")} · ${normalizeJVName(p.name)} (${normalizeJVName(p.site || "")})`,
    s: p.effStart,
    e: p.effEnd,
    v: p.effProgress,
    main: true
  }));

  const perGanttSlide = 14;
  const ganttSlideCount = Math.max(1, Math.ceil(ganttRows.length / perGanttSlide));

  // 6. 상세 명세서 페이징 계산
  const perDetailSlide = 12;
  const detailSlideCount = Math.max(1, Math.ceil(targetProjects.length / perDetailSlide));

  // 7. 총 슬라이드 페이지 수 사전 계산
  let totalReportPages = 1; // 표지
  if (includeSlides.summary !== false) totalReportPages += 1;
  if (includeSlides.calendar !== false) totalReportPages += monthsInRange.length;
  if (includeSlides.manpower !== false) totalReportPages += quarterChunks.length;
  if (includeSlides.gantt !== false) totalReportPages += ganttSlideCount;
  if (includeSlides.details !== false) totalReportPages += detailSlideCount;
  totalReportPages += 1; // 엔딩 슬라이드

  let curPageNum = 1;
  const periodStr = (startDate && endDate) ? `${startDate} ~ ${endDate}` : "전체 공사 기간";

  // 종합 집계 지표
  const grandTotalManday = targetProjects.reduce((acc, p) => acc + (p.manpower?.totalManday || 0), 0);
  const avgProgress = targetProjects.length > 0
    ? Math.round(targetProjects.reduce((acc, p) => acc + (p.effProgress || 0), 0) / targetProjects.length)
    : 0;

  let grandPeak = { val: 0, date: "-" };
  monthsInRange.forEach(mObj => {
    const m = getMonthDailyDeptMatrix(targetProjects, mObj.year, mObj.monthIdx);
    m.days.forEach(dStr => {
      const v = m.dayDataMap[dStr]?.total || 0;
      if (v > grandPeak.val) grandPeak = { val: v, date: dStr };
    });
  });

  // =============================================================
  // SLIDE 1: TW 공식 표지 슬라이드 (원본 Layout 1 양식 100% 일치)
  // =============================================================
  const sCover = x.addSlide();
  sCover.background = { color: C.white };

  // 대제목 (원본과 동일하게 깔끔하고 당당한 타이틀)
  sCover.addText(pptReportTitle, {
    x: 0.80, y: 1.60, w: 11.73, h: 0.85,
    fontSize: 26, bold: true, color: C.navy, fontFace: "맑은 고딕", align: "center", margin: 0
  });

  // - INDEX - 헤더 (원본 Layout 1 위치)
  sCover.addText("- INDEX -", {
    x: 0.80, y: 2.75, w: 11.73, h: 0.35,
    fontSize: 14, bold: true, color: C.navy, fontFace: "맑은 고딕", align: "center", margin: 0
  });

  // 목차 리스트 (중앙 단정하게 정렬)
  const indexBullets = [];
  if (includeSlides.summary !== false) indexBullets.push("1. 프로젝트 종합 현황 요약 (Executive Summary)");
  if (includeSlides.calendar !== false) indexBullets.push(`2. 월간 공사 일정 달력 (${monthsSummaryStr})`);
  if (includeSlides.manpower !== false) indexBullets.push(`3. 부서별 일일 투입 공수 매트릭스 (${quarterChunks.length}개 분기 집약)`);
  if (includeSlides.gantt !== false) indexBullets.push("4. 프로젝트 종합 간트차트 일정 타임라인 (전체 일정 한눈에 보기)");
  if (includeSlides.details !== false) indexBullets.push("5. 프로젝트별 공사 및 공수 상세 명세서 (전수 수록)");

  sCover.addText(indexBullets.join("\n"), {
    x: 4.10, y: 3.30, w: 5.13, h: 2.20,
    fontSize: 10.5, color: "334155", fontFace: "맑은 고딕", align: "left", lineSpacing: 25, margin: 0
  });

  // 기간 및 작성 일자 (원본 Layout 1 위치: y: 5.80)
  sCover.addText(`고객사: ${selectedCustomer}   |   설정 기간: ${periodStr}   |   작성일: ${today()}`, {
    x: 0.80, y: 5.80, w: 11.73, h: 0.30,
    fontSize: 9.5, color: C.gray, fontFace: "맑은 고딕", align: "center", margin: 0
  });

  // 하단 중앙 TW 로고 (원본 Layout 1 위치: x: 5.74, y: 6.48, w: 1.86, h: 0.41)
  try {
    sCover.addImage({ data: TW_LOGO_COVER, x: 5.74, y: 6.48, w: 1.86, h: 0.41 });
  } catch (e) {}

  // 하단 보안 문구 (원본 Layout 1 위치: x: 4.38, y: 7.12, w: 4.57, h: 0.13)
  sCover.addText(SECURITY_NOTICE, {
    x: 4.38, y: 7.12, w: 4.57, h: 0.16,
    fontSize: 6.5, color: "8493A1", fontFace: "맑은 고딕", align: "center", margin: 0
  });

  curPageNum++;

  // =============================================================
  // SLIDE 2: 1. 프로젝트 종합 현황 요약 (고객사 전용 KPI 및 Site별 분석)
  // =============================================================
  if (includeSlides.summary !== false) {
    const s1 = x.addSlide();
    head(s1, `1. [${selectedCustomer}] 프로젝트 종합 현황 요약`, `${conditions(filters)} | 설정 기간: ${periodStr} | 기준: ${modeLabel}`, curPageNum++, totalReportPages);

    // 4대 핵심 KPI 카드
    const kpiItems = [
      { label: `${selectedCustomer} 대상 프로젝트`, val: `${targetProjects.length} 건`, sub: `해당 고객사 전체 집계`, col: C.navy },
      { label: "기간 총 투입 공수", val: `${grandTotalManday} M/D`, sub: `산출 기간 합계 공수`, col: C.blue },
      { label: "일일 최대 투입(Peak)", val: `${grandPeak.val} 명`, sub: grandPeak.date.slice(5) || "-", col: C.red },
      { label: "평균 공사 진행률", val: `${avgProgress}%`, sub: `${modeLabel} 평균`, col: C.green }
    ];

    kpiItems.forEach((kpi, idx) => {
      const kx = 0.55 + idx * 3.08;
      s1.addShape("roundRect", { x: kx, y: 1.10, w: 2.95, h: 0.88, fill: { color: C.light }, line: { color: C.line, width: 0.6 } });
      s1.addText(kpi.label, { x: kx + 0.15, y: 1.18, w: 2.65, h: 0.20, fontSize: 8.5, color: C.gray, margin: 0 });
      s1.addText(kpi.val, { x: kx + 0.15, y: 1.40, w: 2.65, h: 0.34, fontSize: 19, bold: true, color: kpi.col, margin: 0 });
      s1.addText(kpi.sub, { x: kx + 0.15, y: 1.76, w: 2.65, h: 0.18, fontSize: 7.5, color: "94A3B8", margin: 0 });
    });

    // 선택된 고객사(selectedCustomer)의 주요 Site별 운영 현황 카드
    s1.addText(`🏢 [${selectedCustomer}] 주요 Site별 프로젝트 공사 및 공수 운영 현황`, {
      x: 0.55, y: 2.10, w: 12.0, h: 0.22, fontSize: 9.5, bold: true, color: C.navy, margin: 0
    });

    const uniqueSites = [...new Set(targetProjects.map(p => normalizeJVName(p.site || "기타")))].filter(Boolean);
    const displaySites = uniqueSites.length > 0 ? uniqueSites.slice(0, 3) : ["기타"];
    const siteColW = displaySites.length === 1 ? 12.2 : displaySites.length === 2 ? 6.0 : 3.95;

    displaySites.forEach((siteName, sIdx) => {
      const sProjects = targetProjects.filter(p => normalizeJVName(p.site || "기타") === siteName);
      const sDone = sProjects.filter(p => (p.effProgress || 0) >= 100).length;
      const sManday = sProjects.reduce((acc, p) => acc + (p.manpower?.totalManday || 0), 0);
      const sx = 0.55 + sIdx * (siteColW + 0.15);

      s1.addShape("roundRect", { x: sx, y: 2.36, w: siteColW, h: 0.68, fill: { color: "F8FAFC" }, line: { color: C.line, width: 0.5 } });
      s1.addText(`Site: ${siteName}`, { x: sx + 0.15, y: 2.42, w: siteColW - 0.3, h: 0.22, fontSize: 10, bold: true, color: C.navy, margin: 0 });
      s1.addText(`프로젝트 ${sProjects.length}건 (완료 ${sDone}건) | 누적 투입 공수: ${sManday} M/D`, {
        x: sx + 0.15, y: 2.70, w: siteColW - 0.3, h: 0.22, fontSize: 8, color: C.blue, margin: 0
      });
    });

    // 주요 프로젝트 요약 테이블
    s1.addText("📋 주요 프로젝트 진행 현황 요약 (PowerPoint 직접 편집 가능)", {
      x: 0.55, y: 3.18, w: 12.0, h: 0.22, fontSize: 9.5, bold: true, color: C.navy, margin: 0
    });

    const summaryTableRows = [
      [
        { text: "제조번호", options: { bold: true, fill: C.navy, color: C.white, align: "center" } },
        { text: "프로젝트명", options: { bold: true, fill: C.navy, color: C.white, align: "center" } },
        { text: "Site", options: { bold: true, fill: C.navy, color: C.white, align: "center" } },
        { text: `${isConstruction ? '공사 기간' : '전체 일정'}`, options: { bold: true, fill: C.navy, color: C.white, align: "center" } },
        { text: "상태", options: { bold: true, fill: C.navy, color: C.white, align: "center" } },
        { text: "진행률", options: { bold: true, fill: C.navy, color: C.white, align: "center" } },
        { text: "투입 공수", options: { bold: true, fill: C.navy, color: C.white, align: "center" } }
      ]
    ];

    targetProjects.slice(0, 10).forEach((p, idx) => {
      const isEven = idx % 2 === 1;
      const rowBg = isEven ? "F8FAFC" : C.white;
      summaryTableRows.push([
        { text: normalizeJVName(p.manufacturingNo || "-"), options: { fill: rowBg, align: "center" } },
        { text: normalizeJVName(p.name || "-"), options: { fill: rowBg } },
        { text: normalizeJVName(p.site || "-"), options: { fill: rowBg, align: "center" } },
        { text: `${p.effStart || "-"} ~ ${p.effEnd || "-"}`, options: { fill: rowBg, align: "center" } },
        { text: p.status || "진행중", options: { fill: rowBg, align: "center", bold: true, color: p.status === "완료" ? C.green : C.blue } },
        { text: `${Math.round(p.effProgress || 0)}%`, options: { fill: rowBg, align: "center", bold: true } },
        { text: `${p.manpower?.totalManday || 0} M/D`, options: { fill: rowBg, align: "center", color: C.blue, bold: true } }
      ]);
    });

    s1.addTable(summaryTableRows, {
      x: 0.55,
      y: 3.42,
      w: 12.23,
      colW: [1.6, 3.83, 1.4, 2.4, 1.0, 1.0, 1.0],
      fontSize: 8,
      rowH: 0.28,
      margin: 0.03,
      border: { type: "solid", color: C.line, pt: 0.5 }
    });
  }

  // =============================================================
  // SLIDE 3~: 2. 월간 공사 일정 달력 (3번&4번 요구사항: 찌그러진 막대 버그 수정 & 6건 전체 표시!)
  // =============================================================
  if (includeSlides.calendar !== false) {
    monthsInRange.forEach((mObj, mIdx) => {
      const s2 = x.addSlide();
      const mMatrix = getMonthDailyDeptMatrix(targetProjects, mObj.year, mObj.monthIdx);
      const mTotalManday = mMatrix.days.reduce((acc, dStr) => acc + (mMatrix.dayDataMap[dStr]?.total || 0), 0);
      const mPeak = mMatrix.days.reduce((pk, dStr) => {
        const curV = mMatrix.dayDataMap[dStr]?.total || 0;
        return curV > pk.val ? { date: dStr, val: curV } : pk;
      }, { date: "-", val: 0 });

      const cTitle = `2-${mIdx + 1}. ${mObj.label} ${isConstruction ? '공사 일정 달력' : '프로젝트 일정 달력'}`;
      const cSub = `${selectedCustomer} | ${modeLabel} | 월간 총 공수: ${mTotalManday} M/D | 일일 최대 피크: ${mPeak.val}명 (${mPeak.date.slice(5) || '-'})`;
      head(s2, cTitle, cSub, curPageNum++, totalReportPages);

      // 상단 미니 KPI
      const cKpis = [
        { label: "월간 총 투입 공수", val: `${mTotalManday} M/D`, color: C.blue },
        { label: "일일 최대 피크", val: `${mPeak.val} 명 (${mPeak.date.slice(5) || "-"})`, color: C.red },
        { label: "당월 진행 프로젝트", val: `${targetProjects.length} 건`, color: C.navy },
        { label: "투입 부서 수", val: `${mMatrix.sortedDepts.length} 개 부서`, color: C.green }
      ];
      cKpis.forEach((kpi, idx) => {
        const kx = 0.55 + idx * 3.08;
        s2.addShape("roundRect", { x: kx, y: 0.95, w: 2.95, h: 0.38, fill: { color: C.light }, line: { color: C.line, width: 0.5 } });
        s2.addText(`${kpi.label}: `, { x: kx + 0.12, y: 1.02, w: 1.45, h: 0.22, fontSize: 8, color: C.gray, margin: 0 });
        s2.addText(kpi.val, { x: kx + 1.25, y: 1.00, w: 1.6, h: 0.26, fontSize: 9.5, bold: true, color: kpi.color, margin: 0 });
      });

      const first = new Date(mObj.year, mObj.monthIdx, 1);
      const calStart = new Date(first);
      calStart.setDate(1 - first.getDay());
      const x0 = 0.55, y0 = 1.60, cw = 12.23 / 7, ch = 0.88;

      // 요일 헤더
      ["일", "월", "화", "수", "목", "금", "토"].forEach((v, i) => {
        s2.addText(v, {
          x: x0 + i * cw, y: 1.40, w: cw, h: 0.18, fontSize: 8, bold: true, align: "center",
          color: i === 0 ? C.red : i === 6 ? C.blue : C.gray, margin: 0
        });
      });

      // 6개 주차 렌더링
      for (let w = 0; w < 6; w++) {
        const ws = new Date(calStart);
        ws.setDate(calStart.getDate() + w * 7);
        const we = new Date(ws);
        we.setDate(ws.getDate() + 6);
        const wsStr = toYmd(ws);
        const weStr = toYmd(we);

        // 1단계: 날짜 셀 격자, 날짜 숫자 및 일일 총 공수 배지
        for (let k = 0; k < 7; k++) {
          const cur = new Date(ws);
          cur.setDate(ws.getDate() + k);
          const curStr = toYmd(cur);
          const isCurMonth = cur.getMonth() === mObj.monthIdx;
          const dayMp = mMatrix.dayDataMap[curStr]?.total || 0;

          s2.addShape("rect", {
            x: x0 + k * cw, y: y0 + w * ch, w: cw, h: ch,
            fill: { color: isCurMonth ? C.white : "F8FAFC" },
            line: { color: C.line, width: 0.4 }
          });

          // 날짜 번호
          s2.addText(String(cur.getDate()), {
            x: x0 + k * cw + 0.04, y: y0 + w * ch + 0.02, w: 0.35, h: 0.16,
            fontSize: 7.5, bold: isCurMonth, color: isCurMonth ? (k === 0 ? C.red : k === 6 ? C.blue : C.navy) : C.gray, margin: 0
          });

          // 일일 공수 배지
          if (dayMp > 0 && isCurMonth) {
            const bgCol = dayMp >= 20 ? "FEE2E2" : dayMp >= 10 ? "FEF3C7" : "E0F2FE";
            const txtCol = dayMp >= 20 ? C.red : dayMp >= 10 ? C.orange : C.blue;
            s2.addShape("roundRect", {
              x: x0 + k * cw + 0.42, y: y0 + w * ch + 0.02, w: cw - 0.46, h: 0.14,
              fill: { color: bgCol }, line: { color: txtCol, width: 0.4 }
            });
            s2.addText(`👥 ${dayMp}명`, {
              x: x0 + k * cw + 0.43, y: y0 + w * ch + 0.015, w: cw - 0.48, h: 0.15,
              fontSize: 6.5, bold: true, color: txtCol, align: "center", margin: 0
            });
          }
        }

        // 2단계: 주차별 연속 가로 막대 (3번&4번 요구사항 완벽 반영!)
        // 이 주와 실제로 겹치는 프로젝트들 필터
        const weekProjects = targetProjects.filter(p => {
          if (!p.effStart || !p.effEnd) return false;
          return p.effStart <= weStr && p.effEnd >= wsStr;
        });

        // 4번 요구사항: 6건 모두 생략 없이 100% 표시!
        const maxLanes = 6;
        const barH = 0.088;
        const laneGap = 0.018;

        weekProjects.slice(0, maxLanes).forEach((p, laneIdx) => {
          const pStartStr = p.effStart;
          const pEndStr = p.effEnd;

          // 3번 요구사항: 주차 범위 밖에 있는 경우 스킵 (찌그러진 미니 막대 원천 제거!)
          if (pEndStr < wsStr || pStartStr > weStr) return;

          let st = 0;
          if (pStartStr > wsStr) {
            const diffDays = Math.round((new Date(`${pStartStr}T00:00:00`) - new Date(`${wsStr}T00:00:00`)) / DAY);
            st = Math.max(0, Math.min(6, diffDays));
          }

          let en = 6;
          if (pEndStr < weStr) {
            const diffDays = Math.round((new Date(`${pEndStr}T00:00:00`) - new Date(`${wsStr}T00:00:00`)) / DAY);
            en = Math.max(0, Math.min(6, diffDays));
          }

          if (en < st) return; // 시작이 종료보다 뒤면 절대 그리지 않음!

          const bx = x0 + st * cw + 0.02;
          const bw = Math.max(0.3, (en - st + 1) * cw - 0.04);
          const by = y0 + w * ch + 0.18 + laneIdx * (barH + laneGap);
          const barColor = hex(p.projectColor || C.blue);

          // 둥근 연속 막대
          s2.addShape("roundRect", {
            x: bx, y: by, w: bw, h: barH,
            fill: { color: barColor },
            line: { color: barColor, transparency: 100 }
          });

          // 막대 라벨 (제조번호 + 프로젝트명 + 공사기간)
          const barLabel = `${normalizeJVName(p.manufacturingNo || "")} · ${normalizeJVName(p.name || "")}${isConstruction && p.cp?.hasConstructionData ? ` (${p.effStart.slice(5)}~${p.effEnd.slice(5)})` : ''}`;
          s2.addText(barLabel, {
            x: bx + 0.03, y: by - 0.02, w: bw - 0.06, h: barH + 0.04,
            fontSize: 5.5, bold: true, color: C.white, fontFace: "맑은 고딕", margin: 0, fit: "shrink"
          });
        });
      }
    });
  }

  // =============================================================
  // SLIDE 4~: 3. 부서별 일일 투입 공수 매트릭스 (1슬라이드에 4개월치 집약)
  // =============================================================
  if (includeSlides.manpower !== false) {
    quarterChunks.forEach((chunkMonths, chunkIdx) => {
      const s3 = x.addSlide();
      const chunkStartLabel = chunkMonths[0].label;
      const chunkEndLabel = chunkMonths[chunkMonths.length - 1].label;
      const chunkTotalManday = chunkMonths.reduce((acc, mObj) => {
        const m = getMonthDailyDeptMatrix(targetProjects, mObj.year, mObj.monthIdx);
        return acc + m.days.reduce((dAcc, dStr) => dAcc + (m.dayDataMap[dStr]?.total || 0), 0);
      }, 0);

      const mTitle = `3-${chunkIdx + 1}. 부서별 일일 투입 공수 매트릭스 (${chunkStartLabel} ~ ${chunkEndLabel})`;
      const mSub = `${selectedCustomer} | 1개 슬라이드 내 ${chunkMonths.length}개월(분기) 통합 집약 | 총 공수: ${chunkTotalManday} M/D | PowerPoint 직접 수정 가능`;
      head(s3, mTitle, mSub, curPageNum++, totalReportPages);

      const N = chunkMonths.length; // 1 ~ 4
      const availableH = 5.70;
      const blockH = availableH / N;

      chunkMonths.forEach((mObj, subIdx) => {
        const blockY = 1.15 + subIdx * blockH;
        const mMatrix = getMonthDailyDeptMatrix(targetProjects, mObj.year, mObj.monthIdx);
        const mTotal = mMatrix.days.reduce((acc, dStr) => acc + (mMatrix.dayDataMap[dStr]?.total || 0), 0);
        const lastDateNum = new Date(mObj.year, mObj.monthIdx + 1, 0).getDate();

        // 월 소제목 바
        s3.addText(`▶ ${mObj.label} (월간 총 공수: ${mTotal} M/D)`, {
          x: 0.52, y: blockY, w: 12.25, h: 0.18,
          fontSize: 8, bold: true, color: C.navy, fontFace: "맑은 고딕", margin: 0
        });

        // 테이블 헤더
        const matrixHeader = [
          { text: "구분", options: { bold: true, fill: C.navy, color: C.white, align: "center" } }
        ];
        mMatrix.days.forEach(dStr => {
          const dObj = new Date(`${dStr}T00:00:00`);
          const dayNum = dObj.getDate();
          const dayOfWeek = dObj.getDay();
          const isSun = dayOfWeek === 0, isSat = dayOfWeek === 6;

          matrixHeader.push({
            text: String(dayNum),
            options: {
              bold: true,
              fill: isSun ? "DC2626" : isSat ? "2563EB" : C.navy,
              color: C.white,
              align: "center"
            }
          });
        });
        matrixHeader.push({
          text: "합계",
          options: { bold: true, fill: "0F172A", color: C.white, align: "center" }
        });

        const matrixRows = [matrixHeader];

        // 주요 부서 목록 (최대 4개)
        const deptsToDisplay = mMatrix.sortedDepts.length > 0 ? mMatrix.sortedDepts.slice(0, 4) : ["기구", "제어", "설비기술", "비전"];
        deptsToDisplay.forEach((dept, rIdx) => {
          const isEven = rIdx % 2 === 1;
          const rowBg = isEven ? "F8FAFC" : C.white;
          const deptMonthSum = mMatrix.days.reduce((acc, dStr) => acc + (mMatrix.dayDataMap[dStr]?.[dept] || 0), 0);

          const row = [
            { text: dept, options: { bold: true, fill: rowBg, color: C.navy, align: "center" } }
          ];
          mMatrix.days.forEach(dStr => {
            const val = mMatrix.dayDataMap[dStr]?.[dept] || 0;
            row.push({
              text: val > 0 ? String(val) : "-",
              options: {
                align: "center",
                fill: val > 0 ? (val >= 5 ? "FEF3C7" : "EFF6FF") : rowBg,
                color: val > 0 ? (val >= 5 ? C.orange : C.blue) : "94A3B8",
                bold: val > 0
              }
            });
          });
          row.push({
            text: `${deptMonthSum}`,
            options: { bold: true, color: C.blue, fill: "DBEAFE", align: "center" }
          });
          matrixRows.push(row);
        });

        // 당일 총합 행
        const totalRow = [
          { text: "당일 합", options: { bold: true, fill: "1E3A8A", color: C.white, align: "center" } }
        ];
        mMatrix.days.forEach(dStr => {
          const val = mMatrix.dayDataMap[dStr]?.total || 0;
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
          text: `${mTotal}`,
          options: { bold: true, color: C.white, fill: "0F172A", align: "center" }
        });
        matrixRows.push(totalRow);

        const deptColW = 0.85;
        const totalColW = 0.70;
        const dayColW = (12.25 - deptColW - totalColW) / lastDateNum;
        const colWidths = [deptColW, ...Array(lastDateNum).fill(dayColW), totalColW];

        const rowH = N >= 4 ? 0.16 : 0.20;
        const tableH = (matrixRows.length) * rowH;

        s3.addTable(matrixRows, {
          x: 0.52,
          y: blockY + 0.19,
          w: 12.25,
          h: tableH,
          colW: colWidths,
          fontSize: 6,
          rowH: rowH,
          margin: 0.01,
          border: { type: "solid", color: C.line, pt: 0.3 }
        });
      });
    });
  }

  // =============================================================
  // SLIDE 5~: 4. 프로젝트 종합 간트차트 일정 타임라인 (1번&2번 요구사항 완벽 반영!)
  // =============================================================
  if (includeSlides.gantt !== false) {
    for (let o = 0; o < ganttRows.length; o += perGanttSlide) {
      const gs = x.addSlide();
      const pageIndexInGantt = Math.floor(o / perGanttSlide) + 1;
      const gTitle = `4. ${selectedCustomer} ${isConstruction ? '공사 종합 간트차트 일정' : '종합 프로젝트 간트차트 일정'} (${pageIndexInGantt}/${ganttSlideCount})`;
      const gSub = `${selectedCustomer} | 메인 프로젝트 일정 전수 조망 | 타임라인: ${gStart.toISOString().slice(0, 10)} ~ ${gEnd.toISOString().slice(0, 10)}`;
      head(gs, gTitle, gSub, curPageNum++, totalReportPages);

      const lx = 0.52, cx = 4.45, cw = 8.15, y0 = 1.30, rh = 0.36;

      gs.addText("프로젝트 명칭 (Site)", { x: lx, y: 1.05, w: 3.8, h: 0.18, fontSize: 8.5, bold: true, color: C.gray, margin: 0 });

      // 세로 눈금선 및 날짜 헤더
      for (let i = 0; i <= 6; i++) {
        const tickDate = new Date(gStart.getTime() + (gSpan * i / 6));
        const tickStr = `${tickDate.getMonth() + 1}/${tickDate.getDate()}`;
        const tickX = cx + i * (cw / 6);
        gs.addShape("line", { x: tickX, y: y0, w: 0, h: Math.min(perGanttSlide, ganttRows.length - o) * rh, line: { color: "E5EBF0", width: 0.4 } });
        gs.addText(tickStr, { x: tickX - 0.3, y: 1.08, w: 0.6, h: 0.16, fontSize: 7, color: "94A3B8", align: "center", margin: 0 });
      }

      // 오늘선
      const tp = (new Date() - gStart) / gSpan;
      if (tp >= 0 && tp <= 1) {
        gs.addShape("line", { x: cx + tp * cw, y: y0, w: 0, h: Math.min(perGanttSlide, ganttRows.length - o) * rh, line: { color: C.red, width: 1.1, dash: "dash" } });
        gs.addText("오늘", { x: cx + tp * cw - 0.2, y: 1.14, w: 0.4, h: 0.14, fontSize: 6.5, bold: true, color: C.red, align: "center", margin: 0 });
      }

      ganttRows.slice(o, o + perGanttSlide).forEach((q, i) => {
        const y = y0 + i * rh;

        // 2번 요구사항: 프로젝트명이 길면 단어 기준으로 2줄 줄바꿈되도록 wrap: true 적용
        gs.addText(q.name, {
          x: lx, y: y + 0.02, w: 3.85, h: 0.32,
          fontSize: 7.8, bold: true, color: C.navy, fontFace: "맑은 고딕",
          wrap: true, margin: 0
        });

        // 타임라인 막대
        const left = Math.max(0, (d(q.s) - gStart) / gSpan);
        const right = Math.min(1, (d(q.e) - gStart + DAY) / gSpan);
        const bx = cx + left * cw;
        const bw = Math.max(0.12, (right - left) * cw);
        const color = hex(q.p.projectColor || C.blue);
        const barH = 0.18;
        const doneW = bw * Math.max(0, Math.min(100, q.v)) / 100;

        // 배경 바
        gs.addShape("roundRect", {
          x: bx, y: y + 0.08, w: bw, h: barH,
          fill: { color, transparency: 65 },
          line: { color, width: 0.6, transparency: 30 }
        });

        // 완료율 채움 바
        if (doneW > 0) {
          gs.addShape("roundRect", {
            x: bx, y: y + 0.08, w: Math.max(0.04, doneW), h: barH,
            fill: { color, transparency: 0 },
            line: { color, transparency: 100 }
          });
        }

        // 1번 요구사항: 간트차트 막대 가운데에 프로젝트 기간이랑 진행률 기재 (align: "center")
        const dateSpanStr = `${q.s ? q.s.slice(5) : ''}~${q.e ? q.e.slice(5) : ''}`;
        const progressLabel = `${dateSpanStr} (${Math.round(q.v)}%)`;

        if (bw >= 0.85) {
          // 막대 너비가 충분한 경우: 막대 정중앙(center)에 배치!
          gs.addText(progressLabel, {
            x: bx, y: y + 0.07, w: bw, h: barH + 0.02,
            fontSize: 6.8, bold: true, color: C.navy, align: "center", fontFace: "맑은 고딕", margin: 0
          });
        } else {
          // 막대가 매우 짧은 경우: 막대 우측에 배치하여 텍스트 짤림 방지
          gs.addText(progressLabel, {
            x: bx + bw + 0.04, y: y + 0.07, w: 1.2, h: barH + 0.02,
            fontSize: 6.5, bold: true, color: C.navy, align: "left", fontFace: "맑은 고딕", margin: 0
          });
        }
      });
    }
  }

  // =============================================================
  // SLIDE 6~: 5. 프로젝트별 공사 및 공수 상세 명세서 (전수 수록)
  // =============================================================
  if (includeSlides.details !== false) {
    for (let o = 0; o < targetProjects.length; o += perDetailSlide) {
      const s5 = x.addSlide();
      const pageIndexInDetails = Math.floor(o / perDetailSlide) + 1;
      const dTitle = `5. ${selectedCustomer} ${isConstruction ? '프로젝트별 공사 일정 및 투입 공수 명세' : '프로젝트별 일정 및 투입 공수 명세'} (${pageIndexInDetails}/${detailSlideCount})`;
      const dSub = `${selectedCustomer} 프로젝트 총 ${targetProjects.length}건 전수 수록 | 상세 일정 및 부서별 투입 인원(M/D) 명세 (PowerPoint 직접 수정 가능)`;
      head(s5, dTitle, dSub, curPageNum++, totalReportPages);

      const detailHeader = [
        "No", "제조번호", "Site", "프로젝트명", `${isConstruction ? '공사 일정' : '전체 일정'}`, "공사 구분", "기구", "제어", "비전", "기타", "기간 공수", "전체 공수"
      ];
      const detailRows = [
        detailHeader.map(h => ({ text: h, options: { bold: true, fill: C.navy, color: C.white, align: "center" } }))
      ];

      targetProjects.slice(o, o + perDetailSlide).forEach((p, idx) => {
        const globalIdx = o + idx + 1;
        let pKigu = 0, pJeeo = 0, pVision = 0, pEtc = 0, pPeriodSum = 0;

        monthsInRange.forEach(mObj => {
          const m = getMonthDailyDeptMatrix([p], mObj.year, mObj.monthIdx);
          m.days.forEach(dStr => {
            const dayEntry = m.dayDataMap[dStr];
            if (dayEntry) {
              pKigu += dayEntry.depts?.["기구"] || 0;
              pJeeo += dayEntry.depts?.["제어"] || 0;
              pVision += dayEntry.depts?.["비전"] || 0;
              const others = (dayEntry.total || 0) - (dayEntry.depts?.["기구"] || 0) - (dayEntry.depts?.["제어"] || 0) - (dayEntry.depts?.["비전"] || 0);
              pEtc += Math.max(0, others);
              pPeriodSum += dayEntry.total || 0;
            }
          });
        });

        const isEven = idx % 2 === 1;
        const rowBg = isEven ? "F8FAFC" : C.white;

        detailRows.push([
          { text: String(globalIdx), options: { align: "center", fill: rowBg } },
          { text: normalizeJVName(p.manufacturingNo || "-"), options: { align: "center", fill: rowBg } },
          { text: normalizeJVName(p.site || "-"), options: { align: "center", fill: rowBg } },
          { text: normalizeJVName(p.name || "-"), options: { fill: rowBg } },
          { text: `${p.effStart || "-"} ~ ${p.effEnd || "-"}`, options: { align: "center", fill: rowBg } },
          { text: p.cp?.hasConstructionData ? "현장공사" : "전체일정", options: { align: "center", fill: rowBg } },
          { text: pKigu > 0 ? String(pKigu) : "-", options: { align: "center", fill: rowBg } },
          { text: pJeeo > 0 ? String(pJeeo) : "-", options: { align: "center", fill: rowBg } },
          { text: pVision > 0 ? String(pVision) : "-", options: { align: "center", fill: rowBg } },
          { text: pEtc > 0 ? String(pEtc) : "-", options: { align: "center", fill: rowBg } },
          { text: `${pPeriodSum} M/D`, options: { align: "center", bold: true, color: C.blue, fill: "EFF6FF" } },
          { text: `${p.manpower?.totalManday || pPeriodSum} M/D`, options: { align: "center", fill: rowBg } }
        ]);
      });

      s5.addTable(detailRows, {
        x: 0.52,
        y: 1.25,
        w: 12.25,
        colW: [0.5, 1.3, 1.1, 2.7, 1.6, 0.9, 0.6, 0.6, 0.6, 0.6, 1.0, 0.85],
        fontSize: 7.5,
        rowH: 0.26,
        margin: 0.03,
        border: { type: "solid", color: C.line, pt: 0.5 }
      });
    }
  }

  // =============================================================
  // SLIDE END: TW 공식 엔딩 슬라이드 (원본 Layout 4 규격 100% 일치)
  // =============================================================
  const sEnd = x.addSlide();
  sEnd.background = { color: C.white };

  // 중앙 공식 TW 로고 (원본 Layout 4: x: 5.45, y: 3.30, w: 2.47, h: 0.55)
  try {
    sEnd.addImage({ data: TW_LOGO_ENDING, x: 5.45, y: 3.30, w: 2.47, h: 0.55 });
  } catch (e) {}

  // 하단 보안 문구 (원본 Layout 4: x: 4.38, y: 7.12, w: 4.57, h: 0.13)
  sEnd.addText(SECURITY_NOTICE, {
    x: 4.38, y: 7.12, w: 4.57, h: 0.16,
    fontSize: 6.5, color: "8493A1", fontFace: "맑은 고딕", align: "center", margin: 0
  });

  const filePrefix = `${selectedCustomer}_종합보고서_${isConstruction ? '공사기준' : '전체일정기준'}`;
  const dateTag = (startDate && endDate) ? `${startDate}_${endDate}` : today();
  await x.writeFile({
    fileName: `${filePrefix}_${dateTag}.pptx`,
    compression: true
  });
}

export function getMonthsInRange(startDate, endDate, targetProjects = []) {
  let start = null;
  let end = null;

  if (startDate) {
    const s = new Date(`${startDate}T00:00:00`);
    if (!isNaN(s.getTime())) start = s;
  }
  if (endDate) {
    const e = new Date(`${endDate}T00:00:00`);
    if (!isNaN(e.getTime())) end = e;
  }

  if (!start && !end) {
    const validDates = targetProjects
      .flatMap(p => [p.effStart, p.effEnd])
      .filter(Boolean)
      .map(d);
    if (validDates.length > 0) {
      start = new Date(Math.min(...validDates.map(xx => xx.getTime())));
      end = new Date(Math.max(...validDates.map(xx => xx.getTime())));
    } else {
      start = new Date();
      end = new Date();
    }
  } else if (!start) {
    start = new Date(end.getFullYear(), end.getMonth() - 1, 1);
  } else if (!end) {
    end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  }

  const result = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cur <= endMonth) {
    result.push({
      year: cur.getFullYear(),
      monthIdx: cur.getMonth(),
      label: `${cur.getFullYear()}년 ${cur.getMonth() + 1}월`,
      yearMonthStr: `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`
    });
    cur.setMonth(cur.getMonth() + 1);
    if (result.length >= 24) break;
  }

  return result.length ? result : [{
    year: new Date().getFullYear(),
    monthIdx: new Date().getMonth(),
    label: `${new Date().getFullYear()}년 ${new Date().getMonth() + 1}월`,
    yearMonthStr: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
  }];
}
function title(ws,last,text,sub){ws.mergeCells(1,1,1,last);Object.assign(ws.getCell(1,1),{value:text,font:{name:"맑은 고딕",size:20,bold:true,color:{argb:"FFFFFFFF"}},fill:{type:"pattern",pattern:"solid",fgColor:{argb:"FF17324D"}},alignment:{vertical:"middle"}});ws.getRow(1).height=34;ws.mergeCells(2,1,2,last);Object.assign(ws.getCell(2,1),{value:sub,font:{name:"맑은 고딕",size:9,color:{argb:"FF52677A"}},fill:{type:"pattern",pattern:"solid",fgColor:{argb:"FFEAF2F8"}},alignment:{vertical:"middle"}});ws.getRow(2).height=22}
function header(row){row.height=24;row.eachCell(c=>{c.font={name:"맑은 고딕",size:10,bold:true,color:{argb:"FFFFFFFF"}};c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF0B68B5"}};c.alignment={vertical:"middle",horizontal:"center",wrapText:true}})}
function finish(ws,start=5){for(let r=start;r<=ws.rowCount;r++){ws.getRow(r).height=22;ws.getRow(r).eachCell(c=>{c.font={name:"맑은 고딕",size:9,color:{argb:"FF17324D"}};c.alignment={vertical:"middle",wrapText:true};c.border={bottom:{style:"hair",color:{argb:"FFDCE5ED"}}}})}ws.columns.forEach(c=>{let w=10;c.eachCell({includeEmpty:true},v=>w=Math.max(w,Math.min(38,String(v.value??"").length+3)));c.width=w})}
function save(buffer,name){const u=URL.createObjectURL(new Blob([buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),500)}
export async function exportExcelReport(projects,filters={}){if(!projects.length)throw new Error("내보낼 프로젝트가 없습니다.");const wb=new ExcelJS.Workbook(),sub=`기준일 ${today()} | ${conditions(filters)}`,ws=wb.addWorksheet("프로젝트 현황",{views:[{state:"frozen",ySplit:4}],pageSetup:{orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:0}}),h=["제조번호","Site","Line","프로젝트명","소장","설계","설비기술","제어","비전","시작일","종료일","상태","일정 진행률","진행 방식"];title(ws,h.length,"TW Project 프로젝트 현황 보고서",sub);ws.addRow([]);ws.addRow(h);header(ws.getRow(4));projects.forEach(p=>ws.addRow([normalizeJVName(p.manufacturingNo),normalizeJVName(p.site),normalizeJVName(p.line),normalizeJVName(p.name),p.pm,p.design,p.facilityTechnology,p.control,p.vision,d(p.startDate),d(p.endDate),p.status,progress(p)/100,p.autoProgress?"자동":"수동"]));ws.autoFilter={from:{row:4,column:1},to:{row:ws.rowCount,column:h.length}};ws.getColumn(10).numFmt=ws.getColumn(11).numFmt="yyyy-mm-dd";ws.getColumn(13).numFmt="0%";finish(ws);ws.getColumn(4).width=Math.max(20,ws.getColumn(4).width);const ms=wb.addWorksheet("마일스톤 상세",{views:[{state:"frozen",ySplit:4}],pageSetup:{orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:0}}),mh=["제조번호","프로젝트명","마일스톤명","시작일","종료일","기간(일)","일정 구분"];title(ms,mh.length,"마일스톤 상세 보고서",sub);ms.addRow([]);ms.addRow(mh);header(ms.getRow(4));projects.forEach(p=>(p.milestones||[]).filter(m=>m.name).forEach(m=>ms.addRow([normalizeJVName(p.manufacturingNo),normalizeJVName(p.name),normalizeJVName(m.name),d(m.startDate),d(m.endDate),Math.max(1,Math.round((d(m.endDate)-d(m.startDate))/DAY)+1),d(m.startDate)<d(p.startDate)?"선행 일정":d(m.endDate)>d(p.endDate)?"후행 일정":"프로젝트 기간 내"])));ms.getColumn(4).numFmt=ms.getColumn(5).numFmt="yyyy-mm-dd";finish(ms);const sm=wb.addWorksheet("요약",{views:[{showGridLines:false}]});title(sm,4,"프로젝트 요약",sub);sm.addRow([]);sm.addRow(["구분","전체","진행 중","완료"]);header(sm.getRow(4));sm.addRow(["프로젝트 수",projects.length,projects.filter(p=>p.status!=="완료").length,projects.filter(p=>p.status==="완료").length]);sm.addRow([]);sm.addRow(["상태","프로젝트 수"]);header(sm.getRow(7));[...new Set(projects.map(p=>p.status))].forEach(v=>sm.addRow([v,projects.filter(p=>p.status===v).length]));finish(sm);save(await wb.xlsx.writeBuffer(),`TW_Project_Report_${today()}.xlsx`)}
