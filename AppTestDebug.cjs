const DAY=86400000,STATUSES=["검토중","PO대기중","제작 및 운송중","진행중","완료"],DEPTS=["PM","설계","설비기술","기구","기구 외주","비전","비전 외주","제어","제어 외주","전장","전장 외주","Supervisor","안전","소장"],COLORS=["#ef4444","#f97316","#eab308","#22c55e","#06b6d4","#3b82f6","#8b5cf6","#d946ef","#f43f5e","#14b8a6","#84cc16","#6366f1","#a855f7","#10b981","#f59e0b"];
const iso=(d=new Date())=>d.toISOString().slice(0,10),dt=s=>new Date(`${s}T00:00:00`),uid=()=>`${Date.now()}-${Math.random().toString(16).slice(2)}`,newMs=()=>Array.from({length:5},()=>({id:uid(),name:"",startDate:iso(),endDate:iso()}));
function computeAutoStatus(p, today = iso()){
  const end = p.endDate || p.end_date;
  const start = p.startDate || p.start_date;
  if(end && today > end) return "완료";
  const rawMs = p.milestones || [];
  const validMs = rawMs.filter(m => m && m.name && m.startDate && m.endDate && m.id !== '__status_meta__');
  if(!validMs.length){
    if(end && today > end) return "완료";
    if(start && today >= start) return "진행중";
    return "검토중";
  }
  const orderRegex = /발주|제작|구매|가공|조립|자재|부품|order|mfg|manufacturing|fabricat/i;
  const deliveryRegex = /반입|입고|출하|출고|현장|설치|셋팅|setting|site|공정|시운전|셋업|setup|install|delivery|ship/i;
  const deliveryMs = validMs.filter(m => deliveryRegex.test(m.name));
  let deliveryStart = deliveryMs.length ? deliveryMs.reduce((min, m) => (!min || m.startDate < min ? m.startDate : min), "") : "";
  const orderMs = validMs.filter(m => orderRegex.test(m.name) && !/po\s*대기/i.test(m.name) && !deliveryRegex.test(m.name));
  let orderStart = orderMs.length ? orderMs.reduce((min, m) => (!min || m.startDate < min ? m.startDate : min), "") : "";
  if(deliveryStart && today >= deliveryStart && (!end || today <= end)){
    return "진행중";
  }
  if(orderStart){
    if(deliveryStart){
      if(today >= orderStart && today < deliveryStart) return "제작 및 운송중";
      if(today < orderStart) return "검토중";
    } else {
      if(today >= orderStart && (!end || today <= end)) return "제작 및 운송중";
      if(today < orderStart) return "검토중";
    }
  }
  if(deliveryStart && today < deliveryStart) return "검토중";
  const sorted = [...validMs].sort((a, b) => a.startDate.localeCompare(b.startDate));
  if(today < sorted[0].startDate) return "검토중";
  return "진행중";
}
const blank=()=>({manufacturingNo:"",site:"",line:"",name:"",pm:"",design:"",facilityTechnology:"",control:"",vision:"",startDate:iso(),endDate:iso(new Date(Date.now()+7*DAY)),status:"검토중",autoStatus:true,isManualStatus:false,manualStatusBy:"",progress:0,autoProgress:true,milestones:[],manpower:null});
const norm=m=>({id:m.id||uid(),name:normalizeJVName(m.name||""),startDate:m.startDate||m.date||iso(),endDate:m.endDate||m.date||iso()});
const from=p=>{
  const rawList=p.milestones||[];
  const meta=rawList.find(x=>x&&x.id==='__status_meta__');
  const manpowerMeta=rawList.find(x=>x&&x.id==='__manpower_meta__');
  const cleanMs=rawList.filter(x=>x&&x.id!=='__status_meta__'&&x.id!=='__manpower_meta__').map(norm);
  const isPOWaiting=(p.status==="PO대기중");
  const isManual=isPOWaiting||(meta?Boolean(meta.isManual):false);
  const manualBy=meta?.by||(isManual?(p.pm||p.manager||"수동지정 담당자"):"");
  const manualAt=meta?.at||"";
  const effectiveStatus=isManual?(p.status||"검토중"):computeAutoStatus({startDate:p.start_date,endDate:p.end_date,milestones:cleanMs});
  return{
    id:p.id,
    manufacturingNo:normalizeJVName(p.manufacturing_no||""),
    site:normalizeJVName(p.site||""),
    line:normalizeJVName(p.line||""),
    name:normalizeJVName(p.name||""),
    pm:p.pm||p.manager||"",
    design:p.design||"",
    facilityTechnology:p.facility_technology||"",
    control:p.control||"",
    vision:p.vision||"",
    startDate:p.start_date,
    endDate:p.end_date,
    status:effectiveStatus,
    isManualStatus:isManual,
    autoStatus:!isManual,
    manualStatusBy:manualBy,
    manualStatusAt:manualAt,
    progress:p.progress||0,
    autoProgress:p.auto_progress??true,
    milestones:cleanMs,
    manpower:manpowerMeta?.manpower||p.manpower||null
  };
};
const to=p=>{
  const rawMs=p.milestones||[];
  const cleanMs=rawMs.filter(m=>m&&m.id!=='__status_meta__'&&m.id!=='__manpower_meta__');
  const existingMeta=rawMs.find(m=>m&&m.id==='__status_meta__');
  const existingManpowerMeta=rawMs.find(m=>m&&m.id==='__manpower_meta__');
  const isPOWaiting=(p.status==="PO대기중");
  const isManual=isPOWaiting||(p.isManualStatus!==undefined?Boolean(p.isManualStatus):(existingMeta?Boolean(existingMeta.isManual):false));
  const manualBy=p.manualStatusBy!==undefined&&p.manualStatusBy!==""?p.manualStatusBy:(existingMeta?.by||(isManual?(p.pm||"수동지정 담당자"):""));
  const statusMeta={id:'__status_meta__',isManual,by:manualBy,at:existingMeta?.at||iso(),startDate:p.startDate,endDate:p.endDate};
  const manpowerMeta=p.manpower?{id:'__manpower_meta__',manpower:p.manpower}:(existingManpowerMeta||null);
  const finalMilestones=[...cleanMs,statusMeta];
  if(manpowerMeta)finalMilestones.push(manpowerMeta);
  return{
    id:p.id,
    manufacturing_no:normalizeJVName((p.manufacturingNo||"").trim()),
    site:normalizeJVName(p.site),
    line:normalizeJVName((p.line||"").trim()),
    name:normalizeJVName((p.name||"").trim()),
    manager:(p.pm||"").trim(),
    pm:(p.pm||"").trim(),
    design:(p.design||"").trim(),
    facility_technology:(p.facilityTechnology||"").trim(),
    control:(p.control||"").trim(),
    vision:(p.vision||"").trim(),
    start_date:p.startDate,
    end_date:p.endDate,
    status:p.status,
    progress:+p.progress||0,
    auto_progress:p.autoProgress??true,
    milestones:finalMilestones
  };
};
const pct=(s,e)=>{const n=dt(iso()),a=dt(s),b=dt(e);if(n<=a)return 0;if(n>=b)return 100;return Math.round((n-a)/Math.max(DAY,b-a)*100)},len=(s,e)=>Math.max(1,Math.round((dt(e)-dt(s))/DAY)+1),progress=p=>{if(p.status==="완료")return 100;if(!p.autoProgress)return+p.progress||0;const m=p.milestones.filter(x=>x.name&&x.startDate&&x.endDate);if(!m.length)return pct(p.startDate,p.endDate);const total=m.reduce((a,x)=>a+len(x.startDate,x.endDate),0);return Math.round(m.reduce((a,x)=>a+pct(x.startDate,x.endDate)*len(x.startDate,x.endDate),0)/total)},hash=s=>[...String(s)].reduce((a,c)=>(a*31+c.charCodeAt(0))>>>0,7),color=p=>COLORS[hash(p.id||p.manufacturingNo)%COLORS.length],monthKey=d=>`${d.getFullYear()}-${d.getMonth()}`,monthCells=d=>{const x=new Date(d.getFullYear(),d.getMonth(),1);x.setDate(x.getDate()-x.getDay());return Array.from({length:42},(_,i)=>{const v=new Date(x);v.setDate(x.getDate()+i);return v})};

module.exports = { parseExcelMasterPlan, parseExcelData, excelDateToISO, normalizeDeptName, normalizeJVName };