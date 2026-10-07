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
  x.layout="LAYOUT_16x9"; // 13.33 x 7.5 인치 (TW 양식 규격 100% 일치)
  x.author="(주)TW";
  x.company="(주)TW";
  x.title=title;
  x.subject=title;
  x.lang="ko-KR";
  return x;
}
function head(slide,title,sub,page,totalPages){
  slide.background={color:C.white};
  // 슬라이드 제목 (상단)
  slide.addText(title,{x:0.45,y:0.20,w:9.8,h:0.45,fontSize:18,bold:true,color:C.navy,fontFace:"맑은 고딕",margin:0});
  // 서브 메타 정보
  slide.addText(sub,{x:0.46,y:0.65,w:12.2,h:0.22,fontSize:8.5,color:C.gray,fontFace:"맑은 고딕",margin:0});
  // 구분선 (블루 라인)
  slide.addShape("line",{x:0.45,y:0.92,w:12.4,h:0,line:{color:C.blue,width:1.2}});
  
  // 하단 좌측 TW 공식 로고 (image2)
  try {
    slide.addImage({data:TW_LOGO_FOOTER,x:0.30,y:7.15,w:1.25,h:0.28});
  } catch(e){}

  // 하단 중앙 보안 문구
  slide.addText(SECURITY_NOTICE,{x:3.80,y:7.17,w:5.73,h:0.16,fontSize:6.5,color:"8493A1",fontFace:"맑은 고딕",align:"center",margin:0});
  // 하단 우측 슬로건
  slide.addText(TW_SLOGAN,{x:9.34,y:7.15,w:3.72,h:0.25,fontSize:7.5,bold:true,color:C.navy,fontFace:"맑은 고딕",align:"right",margin:0});
  // 하단 슬라이드 페이지 번호
  const pageStr = totalPages ? `${page} / ${totalPages}` : `${page}`;
  slide.addText(pageStr,{x:6.14,y:6.98,w:1.05,h:0.18,fontSize:7,color:"8493A1",fontFace:"맑은 고딕",align:"center",margin:0});
}
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
  const pptReportTitle = isConstruction
    ? "TW 프로젝트 공사 일정 및 투입 공수 종합 보고서"
    : "TW 프로젝트 종합 일정 및 공수 보고서";
  const x = ppt(pptReportTitle);

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

  // 2. 기간 필터링: 설정 기간에 걸쳐 있는 모든 프로젝트를 누락 없이 포함
  let targetProjects = mappedAll;
  if (startDate && endDate) {
    targetProjects = mappedAll.filter(p => (!p.effStart || p.effStart <= endDate) && (!p.effEnd || p.effEnd >= startDate));
  } else if (startDate) {
    targetProjects = mappedAll.filter(p => !p.effEnd || p.effEnd >= startDate);
  } else if (endDate) {
    targetProjects = mappedAll.filter(p => !p.effStart || p.effStart <= endDate);
  }
  if (!targetProjects.length) {
    targetProjects = mappedAll; // 조건에 맞는 프로젝트가 없으면 전체로 안전하게 폴백
  }

  // 3. 설정 기간 내 포함되는 모든 월(Months) 추출 (데이터 누락 방지 핵심!)
  const monthsInRange = getMonthsInRange(startDate, endDate, targetProjects);
  const monthsSummaryStr = monthsInRange.length === 1
    ? monthsInRange[0].label
    : `${monthsInRange[0].label} ~ ${monthsInRange[monthsInRange.length - 1].label} (${monthsInRange.length}개월)`;

  // 전체 기간 누적 통계 계산
  const grandTotalManday = targetProjects.reduce((acc, p) => acc + (p.manpower?.totalManday || 0), 0);
  const avgProgress = targetProjects.length > 0
    ? Math.round(targetProjects.reduce((acc, p) => acc + (p.effProgress || 0), 0) / targetProjects.length)
    : 0;

  // 전체 일자별 피크 투입량 계산
  let grandPeak = { date: "-", val: 0 };
  monthsInRange.forEach(mObj => {
    const mMatrix = getMonthDailyDeptMatrix(targetProjects, mObj.year, mObj.monthIdx);
    mMatrix.days.forEach(dStr => {
      const v = mMatrix.dayDataMap[dStr]?.total || 0;
      if (v > grandPeak.val) {
        grandPeak = { date: dStr, val: v };
      }
    });
  });

  const periodStr = (startDate || endDate)
    ? `${startDate || '시작'} ~ ${endDate || '종료'}`
    : '전체 일정 기간';

  // 4. 간트차트 행 데이터 준비 (미리 계산하여 슬라이드 수 파악)
  const allDates = targetProjects.flatMap(p => [
    p.effStart,
    p.effEnd,
    ...(p.milestones || []).flatMap(m => [m.startDate, m.endDate])
  ]).filter(Boolean).map(d);
  if (startDate) allDates.push(d(startDate));
  if (endDate) allDates.push(d(endDate));

  const gStart = allDates.length ? new Date(Math.min(...allDates.map(xx => xx.getTime()))) : new Date();
  const gEnd = allDates.length ? new Date(Math.max(...allDates.map(xx => xx.getTime()))) : new Date(Date.now() + DAY * 30);
  const gSpan = Math.max(DAY, gEnd - gStart + DAY);

  const ganttRows = [];
  if (includeSlides.gantt !== false) {
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
  }

  const perGanttSlide = 15;
  const ganttSlideCount = includeSlides.gantt !== false ? Math.max(1, Math.ceil(ganttRows.length / perGanttSlide)) : 0;

  // 상세 명세서 페이징 계산 (슬라이드당 12개 프로젝트씩 전수 수록)
  const perDetailSlide = 12;
  const detailSlideCount = includeSlides.details !== false ? Math.max(1, Math.ceil(targetProjects.length / perDetailSlide)) : 0;

  // 총 슬라이드 수 사전 집계 (하단 Page / Total 표시용)
  let totalReportPages = 1; // 표지
  if (includeSlides.summary !== false) totalReportPages += 1;
  if (includeSlides.calendar !== false) totalReportPages += monthsInRange.length;
  if (includeSlides.manpower !== false) totalReportPages += monthsInRange.length;
  if (includeSlides.gantt !== false) totalReportPages += ganttSlideCount;
  if (includeSlides.details !== false) totalReportPages += detailSlideCount;
  totalReportPages += 1; // 엔딩 슬라이드

  let curPageNum = 1;

  // =============================================================
  // SLIDE 1: TW 공식 표지 슬라이드 (Cover Slide - Layout 1 규격)
  // =============================================================
  const sCover = x.addSlide();
  sCover.background = { color: C.white };

  // 대제목
  sCover.addText(pptReportTitle, {
    x: 1.5, y: 1.45, w: 10.33, h: 0.85,
    fontSize: 24, bold: true, color: C.navy, fontFace: "맑은 고딕", align: "center", margin: 0
  });

  // 영문 서브타이틀
  sCover.addText("TW PROJECT MANAGEMENT SYSTEM", {
    x: 3.91, y: 2.30, w: 5.51, h: 0.32,
    fontSize: 11, bold: true, color: C.blue, fontFace: "맑은 고딕", align: "center", margin: 0
  });

  // - INDEX - 헤더
  sCover.addText("- INDEX -", {
    x: 5.45, y: 2.75, w: 2.44, h: 0.35,
    fontSize: 14, bold: true, color: C.navy, fontFace: "맑은 고딕", align: "center", margin: 0
  });

  // 목차 리스트
  const indexBullets = [];
  if (includeSlides.summary !== false) indexBullets.push("1. 프로젝트 종합 현황 요약 (Executive Summary)");
  if (includeSlides.calendar !== false) indexBullets.push(`2. 월간 공사 일정 달력 (${monthsSummaryStr})`);
  if (includeSlides.manpower !== false) indexBullets.push(`3. 부서별 일일 투입 공수 매트릭스 (${monthsSummaryStr})`);
  if (includeSlides.gantt !== false) indexBullets.push("4. 프로젝트 종합 간트차트 일정 타임라인");
  if (includeSlides.details !== false) indexBullets.push("5. 프로젝트별 공사 및 공수 상세 명세서 (전수 수록)");

  sCover.addText(indexBullets.join("\n"), {
    x: 4.20, y: 3.20, w: 4.93, h: 2.30,
    fontSize: 10.5, color: "334155", fontFace: "맑은 고딕", align: "left", lineSpacing: 25, margin: 0
  });

  // 기간 및 작성 일자
  sCover.addText(`설정 기간: ${periodStr}   |   보고서 작성일: ${today()}`, {
    x: 3.5, y: 5.85, w: 6.33, h: 0.35,
    fontSize: 10, color: C.gray, fontFace: "맑은 고딕", align: "center", margin: 0
  });

  // 하단 중앙 TW 로고 (image1)
  try {
    sCover.addImage({ data: TW_LOGO_COVER, x: 5.74, y: 6.45, w: 1.86, h: 0.41 });
  } catch (e) {}

  // 하단 보안 문구
  sCover.addText(SECURITY_NOTICE, {
    x: 3.80, y: 7.12, w: 5.73, h: 0.16,
    fontSize: 6.5, color: "8493A1", fontFace: "맑은 고딕", align: "center", margin: 0
  });

  curPageNum++;

  // =============================================================
  // SLIDE 2: 1. 프로젝트 종합 현황 요약 (Executive Summary & KPIs)
  // =============================================================
  if (includeSlides.summary !== false) {
    const s1 = x.addSlide();
    head(s1, "1. 프로젝트 종합 현황 요약 (Executive Summary)", `${conditions(filters)} | 설정 기간: ${periodStr} | 기준: ${modeLabel}`, curPageNum++, totalReportPages);

    // 4대 핵심 KPI 카드
    const kpiItems = [
      { label: "대상 프로젝트", val: `${targetProjects.length} 건`, sub: `전체 ${projects.length}건 중 해당`, col: C.navy },
      { label: "기간 총 투입 공수", val: `${grandTotalManday} M/D`, sub: `산출 기간 합계 공수`, col: C.blue },
      { label: "일일 최대 투입(Peak)", val: `${grandPeak.val} 명`, sub: grandPeak.date.slice(5) || "-", col: C.red },
      { label: "평균 공사 진행률", val: `${avgProgress}%`, sub: `${modeLabel} 평균`, col: C.green }
    ];

    kpiItems.forEach((kpi, idx) => {
      const kx = 0.55 + idx * 3.08;
      s1.addShape("roundRect", { x: kx, y: 1.12, w: 2.95, h: 0.92, fill: { color: C.light }, line: { color: C.line, width: 0.6 } });
      s1.addText(kpi.label, { x: kx + 0.15, y: 1.22, w: 2.65, h: 0.20, fontSize: 8.5, color: C.gray, margin: 0 });
      s1.addText(kpi.val, { x: kx + 0.15, y: 1.44, w: 2.65, h: 0.36, fontSize: 20, bold: true, color: kpi.col, margin: 0 });
      s1.addText(kpi.sub, { x: kx + 0.15, y: 1.82, w: 2.65, h: 0.18, fontSize: 7.5, color: "94A3B8", margin: 0 });
    });

    // 고객사별 요약 블록
    s1.addText("🏢 주요 고객사별 프로젝트 운영 현황", {
      x: 0.55, y: 2.18, w: 12.0, h: 0.22, fontSize: 9.5, bold: true, color: C.navy, margin: 0
    });

    const customers = ["SK on", "Samsung SDI", "Hyundai"];
    customers.forEach((cust, cIdx) => {
      const cProjects = targetProjects.filter(p => (p.customer || "SK on") === cust);
      const cDone = cProjects.filter(p => (p.effProgress || 0) >= 100).length;
      const cManday = cProjects.reduce((acc, p) => acc + (p.manpower?.totalManday || 0), 0);
      const cx = 0.55 + cIdx * 4.10;

      s1.addShape("roundRect", { x: cx, y: 2.45, w: 3.95, h: 0.70, fill: { color: "F8FAFC" }, line: { color: C.line, width: 0.5 } });
      s1.addText(cust, { x: cx + 0.15, y: 2.52, w: 1.8, h: 0.22, fontSize: 10, bold: true, color: C.navy, margin: 0 });
      s1.addText(`프로젝트 ${cProjects.length}건 (완료 ${cDone}건) | 누적 공수: ${cManday} M/D`, {
        x: cx + 0.15, y: 2.80, w: 3.65, h: 0.22, fontSize: 8, color: C.blue, margin: 0
      });
    });

    // 주요 프로젝트 요약 테이블 (상위 11건)
    s1.addText("📋 주요 프로젝트 진행 현황 요약 (PowerPoint 직접 편집 가능)", {
      x: 0.55, y: 3.30, w: 12.0, h: 0.22, fontSize: 9.5, bold: true, color: C.navy, margin: 0
    });

    const summaryHeader = ["No", "제조번호", "Site", "프로젝트명", `${isConstruction ? '공사 일정' : '전체 일정'}`, "공사 구분", "상태", `${isConstruction ? '공사진행률' : '진행률'}`];
    const summaryRows = [
      summaryHeader.map(h => ({ text: h, options: { bold: true, fill: C.navy, color: C.white, align: "center" } }))
    ];

    targetProjects.slice(0, 11).forEach((p, idx) => {
      const isEven = idx % 2 === 1;
      const rowBg = isEven ? "F8FAFC" : C.white;
      const cType = p.cp?.hasConstructionData ? (p.cp?.msStartDate ? '셋업/이설' : '공수투입') : '일반일정';
      summaryRows.push([
        { text: String(idx + 1), options: { align: "center", fill: rowBg } },
        { text: normalizeJVName(p.manufacturingNo || '-'), options: { align: "center", bold: true, fill: rowBg } },
        { text: normalizeJVName(p.site || '-'), options: { align: "center", fill: rowBg } },
        { text: normalizeJVName(p.name || '-'), options: { align: "left", fill: rowBg } },
        { text: `${(p.effStart || '-').slice(2)} ~ ${(p.effEnd || '-').slice(2)}`, options: { align: "center", fill: rowBg } },
        { text: cType, options: { align: "center", color: cType !== '일반일정' ? C.blue : C.gray, fill: rowBg } },
        { text: p.status || '-', options: { align: "center", fill: rowBg } },
        { text: `${Math.round(p.effProgress || 0)}%`, options: { align: "center", bold: true, color: C.blue, fill: "EFF6FF" } }
      ]);
    });

    s1.addTable(summaryRows, {
      x: 0.55,
      y: 3.58,
      w: 12.25,
      colW: [0.6, 1.8, 1.4, 4.25, 2.1, 1.0, 0.9, 0.9],
      fontSize: 8,
      rowH: 0.24,
      margin: 0.03,
      border: { type: "solid", color: C.line, pt: 0.5 }
    });
  }

  // =============================================================
  // SLIDE 2~: 2. 월간 공사 일정 달력 (설정 기간 내 모든 월별 생성!)
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
      const cSub = `${modeLabel} | 월간 총 공수: ${mTotalManday} M/D | 일일 최대 투입: ${mPeak.val}명 (${mPeak.date.slice(5) || '-'})`;
      head(s2, cTitle, cSub, curPageNum++, totalReportPages);

      // 상단 미니 KPI
      const cKpis = [
        { label: "월간 총 투입 공수", val: `${mTotalManday} M/D`, color: C.blue },
        { label: "일일 최대 투입(Peak)", val: `${mPeak.val} 명 (${mPeak.date.slice(5) || "-"})`, color: C.red },
        { label: "당월 진행 프로젝트", val: `${targetProjects.length} 건`, color: C.navy },
        { label: "투입 부서 수", val: `${mMatrix.sortedDepts.length} 개 부서`, color: C.green }
      ];
      cKpis.forEach((kpi, idx) => {
        const kx = 0.55 + idx * 3.08;
        s2.addShape("roundRect", { x: kx, y: 0.95, w: 2.95, h: 0.38, fill: { color: C.light }, line: { color: C.line, width: 0.5 } });
        s2.addText(`${kpi.label}: `, { x: kx + 0.12, y: 1.02, w: 1.5, h: 0.22, fontSize: 8, color: C.gray, margin: 0 });
        s2.addText(kpi.val, { x: kx + 1.25, y: 1.00, w: 1.6, h: 0.26, fontSize: 9.5, bold: true, color: kpi.color, margin: 0 });
      });

      const first = new Date(mObj.year, mObj.monthIdx, 1);
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

        for (let k = 0; k < 7; k++) {
          const cur = new Date(ws);
          cur.setDate(ws.getDate() + k);
          const curStr = cur.toISOString().slice(0, 10);
          const isCurMonth = cur.getMonth() === mObj.monthIdx;
          const dayMp = mMatrix.dayDataMap[curStr]?.total || 0;

          s2.addShape("rect", {
            x: x0 + k * cw, y: y0 + w * ch, w: cw, h: ch,
            fill: { color: isCurMonth ? C.white : "F8FAFC" },
            line: { color: C.line, width: 0.5 }
          });

          // 날짜 숫자
          s2.addText(String(cur.getDate()), {
            x: x0 + k * cw + 0.04, y: y0 + w * ch + 0.03, w: 0.35, h: 0.16,
            fontSize: 7.5, bold: isCurMonth, color: isCurMonth ? (k === 0 ? C.red : k === 6 ? C.blue : C.navy) : C.gray, margin: 0
          });

          // 일일 공수 투입 인원 배지
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

          // 해당 일자에 활성화된 공사/셋업 프로젝트 막대 표시
          if (isCurMonth) {
            const activeProjects = targetProjects.filter(p => (!p.effStart || p.effStart <= curStr) && (!p.effEnd || p.effEnd >= curStr));
            activeProjects.slice(0, 3).forEach((ap, pIdx) => {
              const barY = y0 + w * ch + 0.21 + pIdx * 0.18;
              const pCol = hex(ap.projectColor || C.blue);
              s2.addShape("roundRect", {
                x: x0 + k * cw + 0.04, y: barY, w: cw - 0.08, h: 0.15,
                fill: { color: pCol, transparency: 80 }, line: { color: pCol, width: 0.4 }
              });
              s2.addText(`${normalizeJVName(ap.manufacturingNo || ap.name)}`, {
                x: x0 + k * cw + 0.06, y: barY - 0.01, w: cw - 0.12, h: 0.15,
                fontSize: 6, color: C.navy, margin: 0, fit: "shrink"
              });
            });
            if (activeProjects.length > 3) {
              s2.addText(`+${activeProjects.length - 3}건 외`, {
                x: x0 + k * cw + 0.06, y: y0 + w * ch + 0.73, w: cw - 0.12, h: 0.12,
                fontSize: 5.5, color: C.gray, margin: 0
              });
            }
          }
        }
      }
    });
  }

  // =============================================================
  // SLIDE 3~: 3. 부서별 일일 투입 공수 매트릭스 (설정 기간 내 모든 월별 생성!)
  // =============================================================
  if (includeSlides.manpower !== false) {
    monthsInRange.forEach((mObj, mIdx) => {
      const s3 = x.addSlide();
      const mMatrix = getMonthDailyDeptMatrix(targetProjects, mObj.year, mObj.monthIdx);
      const mTotalManday = mMatrix.days.reduce((acc, dStr) => acc + (mMatrix.dayDataMap[dStr]?.total || 0), 0);
      const lastDateNum = new Date(mObj.year, mObj.monthIdx + 1, 0).getDate();

      const mTitle = `3-${mIdx + 1}. ${mObj.label} 부서별 일일 투입 공수 매트릭스`;
      const mSub = `월간 총 공수: ${mTotalManday} M/D | 1일~${lastDateNum}일 부서별 일일 인원(M/D) 상세 집계표 (PowerPoint 직접 수정 가능)`;
      head(s3, mTitle, mSub, curPageNum++, totalReportPages);

      // 매트릭스 테이블 헤더 구성
      const matrixHeader = [
        { text: "투입 부서", options: { bold: true, fill: C.navy, color: C.white, align: "center" } }
      ];
      mMatrix.days.forEach(dStr => {
        const dObj = new Date(`${dStr}T00:00:00`);
        const dayNum = dObj.getDate();
        const dayOfWeek = dObj.getDay();
        const isSun = dayOfWeek === 0;
        const isSat = dayOfWeek === 6;

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

      // 부서별 데이터 행
      mMatrix.sortedDepts.forEach((dept, rIdx) => {
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
        { text: "당일 총합 (명)", options: { bold: true, fill: "1E3A8A", color: C.white, align: "center" } }
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
        text: `${mTotalManday}`,
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
    });
  }

  // =============================================================
  // SLIDE 4~: 4. 종합 프로젝트 간트차트 (자동 페이징으로 전수 수록!)
  // =============================================================
  if (includeSlides.gantt !== false) {
    for (let o = 0; o < ganttRows.length; o += perGanttSlide) {
      const gs = x.addSlide();
      const pageIndexInGantt = Math.floor(o / perGanttSlide) + 1;
      const gTitle = `4. ${isConstruction ? '공사 종합 간트차트 일정' : '종합 프로젝트 간트차트 일정'} (${pageIndexInGantt}/${ganttSlideCount})`;
      const gSub = `${modeLabel} | 타임라인: ${gStart.toISOString().slice(0, 10)} ~ ${gEnd.toISOString().slice(0, 10)} | 설정 기간: ${periodStr}`;
      head(gs, gTitle, gSub, curPageNum++, totalReportPages);

      const lx = 0.45, cx = 4.35, cw = 8.4, y0 = 1.30, rh = 0.33;

      gs.addText("프로젝트 / 마일스톤 명칭", { x: lx, y: 1.05, w: 3.7, h: 0.18, fontSize: 8.5, bold: true, color: C.gray, margin: 0 });

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
  // SLIDE 5~: 5. 프로젝트별 공사 및 공수 상세 명세서 (전수 수록 페이징!)
  // =============================================================
  if (includeSlides.details !== false) {
    for (let o = 0; o < targetProjects.length; o += perDetailSlide) {
      const s5 = x.addSlide();
      const pageIndexInDetails = Math.floor(o / perDetailSlide) + 1;
      const dTitle = `5. ${isConstruction ? '프로젝트별 공사 일정 및 투입 공수 명세' : '프로젝트별 일정 및 투입 공수 명세'} (${pageIndexInDetails}/${detailSlideCount})`;
      const dSub = `프로젝트 총 ${targetProjects.length}건 전수 수록 | 상세 일정 및 부서별 투입 인원(M/D) 명세 (PowerPoint 직접 수정 가능)`;
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

        // 설정된 전체 월 범위의 공수 합산
        monthsInRange.forEach(mObj => {
          const mMatrix = getMonthDailyDeptMatrix([p], mObj.year, mObj.monthIdx);
          mMatrix.days.forEach(dStr => {
            if (p.manpower?.departments) {
              Object.entries(p.manpower.departments).forEach(([dk, dObj]) => {
                const val = Number(dObj?.daily?.[dStr]) || 0;
                if (val > 0) {
                  pPeriodSum += val;
                  if (dk.includes("기구")) pKigu += val;
                  else if (dk.includes("제어")) pJeeo += val;
                  else if (dk.includes("비전")) pVision += val;
                  else pEtc += val;
                }
              });
            } else if (p.manpower?.dailyTotal?.[dStr]) {
              const val = Number(p.manpower.dailyTotal[dStr]) || 0;
              pPeriodSum += val;
              pEtc += val;
            }
          });
        });

        const isEven = idx % 2 === 1;
        const rowBg = isEven ? "F8FAFC" : C.white;
        const constrType = p.cp?.hasConstructionData ? (p.cp.msStartDate ? '공사' : '공수투입') : '일반일정';

        detailRows.push([
          { text: String(globalIdx), options: { align: "center", fill: rowBg } },
          { text: normalizeJVName(p.manufacturingNo || '-'), options: { align: "center", bold: true, fill: rowBg } },
          { text: normalizeJVName(p.site || '-'), options: { align: "center", fill: rowBg } },
          { text: normalizeJVName(p.name || '-'), options: { align: "left", fill: rowBg } },
          { text: `${(p.effStart || '-').slice(5)} ~ ${(p.effEnd || '-').slice(5)}`, options: { align: "center", bold: true, fill: rowBg } },
          { text: constrType, options: { align: "center", color: constrType !== '일반일정' ? C.blue : C.gray, fill: rowBg } },
          { text: pKigu > 0 ? `${pKigu}` : "-", options: { align: "center", fill: rowBg } },
          { text: pJeeo > 0 ? `${pJeeo}` : "-", options: { align: "center", fill: rowBg } },
          { text: pVision > 0 ? `${pVision}` : "-", options: { align: "center", fill: rowBg } },
          { text: pEtc > 0 ? `${pEtc}` : "-", options: { align: "center", fill: rowBg } },
          { text: `${pPeriodSum} M/D`, options: { align: "center", bold: true, color: C.blue, fill: "EFF6FF" } },
          { text: `${p.manpower?.totalManday || pPeriodSum} M/D`, options: { align: "center", fill: rowBg } }
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
  }

  // =============================================================
  // SLIDE END: TW 공식 엔딩 슬라이드 (Ending Slide - Layout 4 규격)
  // =============================================================
  const sEnd = x.addSlide();
  sEnd.background = { color: C.white };

  // 중앙 공식 TW 로고 (image3)
  try {
    sEnd.addImage({ data: TW_LOGO_ENDING, x: 5.45, y: 3.30, w: 2.47, h: 0.55 });
  } catch (e) {}

  // 하단 보안 문구
  sEnd.addText(SECURITY_NOTICE, {
    x: 3.80, y: 7.12, w: 5.73, h: 0.16,
    fontSize: 6.5, color: "8493A1", fontFace: "맑은 고딕", align: "center", margin: 0
  });

  const filePrefix = isConstruction ? "TW_종합보고서_공사기준" : "TW_종합보고서_전체일정기준";
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
