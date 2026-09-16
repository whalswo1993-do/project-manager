import{useEffect,useMemo,useState,useRef}from"react";import"./App.css";import{supabase}from"./supabase";import Login from"./Login";import{exportGanttReport,exportCalendarReport,exportExcelReport}from"./reportExports";import VisionSPC from "./VisionSPC";import IssueManagement from "./IssueManagement";import Quotations from "./Quotations";import ManpowerManagement, { ProjectManpowerModal } from "./ManpowerManagement";import{GoogleGenerativeAI}from"@google/generative-ai";import*as XLSX from"xlsx";import { ErrorBoundary } from "./ErrorBoundary";
import { normalizeJVName } from "./utils";
export { normalizeJVName };
const DAY=86400000,STATUSES=["검토중","PO대기중","제작 및 운송중","진행중","완료"],DEPTS=["PM","설계","설비기술","기구","기구 외주","비전","비전 외주","제어","제어 외주","전장","전장 외주","Supervisor","안전","소장"],COLORS=["#ef4444","#f97316","#eab308","#22c55e","#06b6d4","#3b82f6","#8b5cf6","#d946ef","#f43f5e","#14b8a6","#84cc16","#6366f1","#a855f7","#10b981","#f59e0b"];
const iso=(d=new Date())=>d.toISOString().slice(0,10),dt=s=>new Date(`${s}T00:00:00`),uid=()=>`${Date.now()}-${Math.random().toString(16).slice(2)}`,newMs=()=>Array.from({length:5},()=>({id:uid(),name:"",startDate:iso(),endDate:iso()}));
export function computeAutoStatus(p, today = iso()){
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
export default function App(){const[session,setSession]=useState(null),[loading,setLoading]=useState(true),[profile,setProfile]=useState(null),[users,setUsers]=useState([]),[projects,setProjects]=useState([]),[sites,setSites]=useState([]),[people,setPeople]=useState([]),[form,setForm]=useState(blank()),[editing,setEditing]=useState(null),[milestones,setMilestones]=useState(newMs()),[modal,setModal]=useState(null),[permissionModal,setPermissionModal]=useState(null),[expanded,setExpanded]=useState({}),[ganttExpanded,setGanttExpanded]=useState({}),[month,setMonth]=useState(new Date()),[selectedDay,setSelectedDay]=useState(null),[search,setSearch]=useState(""),[filter,setFilter]=useState("전체"),[siteFilter,setSiteFilter]=useState("전체"),[personFilter,setPersonFilter]=useState("전체"),[msg,setMsg]=useState(""),[newSite,setNewSite]=useState(""),[newPerson,setNewPerson]=useState(""),[newDept,setNewDept]=useState("PM"),[currentView,setCurrentView]=useState("projects"),[isExtracting,setIsExtracting]=useState(false),[selectedManpowerProject,setSelectedManpowerProject]=useState(null),[selectedProjects,setSelectedProjects]=useState(new Set());const masterPlanInput=useRef(null);
const currentUserName=useMemo(()=>{if(!session)return"담당자";return profile?.name||session?.user?.user_metadata?.name||session?.user?.user_metadata?.full_name||(people.find(p=>p.name&&session?.user?.email?.toLowerCase().includes(p.name.toLowerCase()))?.name)||(session?.user?.email?session.user.email.split("@")[0]:"담당자")},[profile,session,people]);
const computedCurrentStatus=useMemo(()=>{const validMs=milestones.filter(m=>m.name.trim()&&m.startDate&&m.endDate&&m.id!=='__status_meta__');return computeAutoStatus({startDate:form.startDate,endDate:form.endDate,milestones:validMs})},[form.startDate,form.endDate,milestones]);
function handleStatusChange(val){setForm(f=>({...f,status:val,autoStatus:false,isManualStatus:true,manualStatusBy:f.manualStatusBy||currentUserName}))}
function handleAutoStatusToggle(checked){if(checked){const validMs=milestones.filter(m=>m.name.trim()&&m.startDate&&m.endDate&&m.id!=='__status_meta__');const calculated=computeAutoStatus({startDate:form.startDate,endDate:form.endDate,milestones:validMs});setForm(f=>({...f,autoStatus:true,isManualStatus:false,manualStatusBy:"",status:calculated}))}else{setForm(f=>({...f,autoStatus:false,isManualStatus:true,manualStatusBy:f.manualStatusBy||currentUserName}))}}
async function switchToAutoStatus(p){const cleanMs=(p.milestones||[]).filter(m=>m&&m.id!=='__status_meta__');const autoStat=computeAutoStatus({startDate:p.startDate,endDate:p.endDate,milestones:cleanMs});const statusMeta={id:'__status_meta__',isManual:false,by:"",at:iso(),startDate:p.startDate,endDate:p.endDate};const finalMilestones=[...cleanMs,statusMeta];const{error}=await supabase.from("projects").update({status:autoStat,milestones:finalMilestones}).eq("id",p.id);if(error){setMsg("자동 상태 전환 실패: "+error.message)}else{setMsg(`'${p.name}' 프로젝트가 마일스톤 기준 자동 상태(${autoStat})로 전환되었습니다.`);load("projects")}}
useEffect(()=>{supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)});const{data}=supabase.auth.onAuthStateChange((_,s)=>setSession(s));return()=>data.subscription.unsubscribe()},[]);useEffect(()=>{if(session)boot();else setProfile(null)},[session]);
async function boot(){const{data:p,error}=await supabase.from("profiles").select("*").eq("id",session.user.id).single();if(error)return setMsg(error.message);if(p.active===false){await supabase.auth.signOut();return alert("비활성화된 계정입니다.")}setProfile(p);await Promise.all([load("projects"),load("sites"),load("personnel")]);if(p.role==="admin")load("profiles")}
async function load(t){const order=t==="projects"?"created_at":t==="personnel"?"department":t==="profiles"?"email":"name",{data,error}=await supabase.from(t).select("*").order(order,{ascending:t!=="projects"});if(error)return setMsg(error.message);if(t==="projects")setProjects((data||[]).map(from));if(t==="sites"){const seen=new Set();const normalizedSites=(data||[]).map(s=>({...s,name:normalizeJVName(s.name)})).filter(s=>{const k=s.name.trim().toLowerCase();if(!k||seen.has(k))return false;seen.add(k);return true;});setSites(normalizedSites);}if(t==="personnel")setPeople(data||[]);if(t==="profiles")setUsers(data||[])}
const role=profile?.role||"grade1",isGrade1=role==="grade1",isGrade2=role==="grade2",create=["admin","grade3"].includes(role),edit=["admin","grade3","grade2"].includes(role),del=["admin","grade3"].includes(role);
function showPermissionModal(feature){setPermissionModal({feature,role})}
const peopleNames=[...new Set(people.map(p=>p.name))].sort(),view=useMemo(()=>projects.map((p,i)=>{const cleanMs=(p.milestones||[]).filter(x=>x&&x.id!=='__status_meta__');const isPOWaiting=(p.status==="PO대기중");const effectiveManual=isPOWaiting||Boolean(p.isManualStatus);const currentStatus=effectiveManual?p.status:computeAutoStatus({...p,milestones:cleanMs});return{...p,status:currentStatus,isManualStatus:effectiveManual,manualStatusBy:p.manualStatusBy||(effectiveManual?(p.pm||"담당자"):""),value:progress({...p,status:currentStatus,milestones:cleanMs}),overdue:currentStatus!=="완료"&&dt(p.endDate)<dt(iso()),projectColor:COLORS[i%COLORS.length]}}).filter(p=>{const text=[p.manufacturingNo,p.site,p.line,p.name,p.pm,p.design,p.facilityTechnology,p.control,p.vision].join(" ").toLowerCase(),status=filter==="전체"||(filter==="완료"&&p.status==="완료")||(filter==="진행중"&&p.status!=="완료")||(filter==="지연"&&p.overdue)||(p.status===filter),site=siteFilter==="전체"||p.site===siteFilter,person=personFilter==="전체"||[p.pm,p.design,p.facilityTechnology,p.control,p.vision].includes(personFilter);return text.includes(search.toLowerCase())&&status&&site&&person}),[projects,search,filter,siteFilter,personFilter]);
async function save(){if(!editing&&!create)return showPermissionModal("새 프로젝트 생성");if(!form.site||!form.name.trim())return setMsg("Site, 프로젝트명은 필수입니다.");if(dt(form.endDate)<dt(form.startDate))return setMsg("프로젝트 종료일을 확인하세요.");const m=milestones.filter(x=>x.name.trim()&&x.startDate&&x.endDate&&x.id!=='__status_meta__'&&x.id!=='__manpower_meta__');if(m.some(x=>dt(x.endDate)<dt(x.startDate)))return setMsg("마일스톤 종료일은 시작일 이후여야 합니다.");const isPOWaiting=(form.status==="PO대기중");const isManual=isPOWaiting||Boolean(form.isManualStatus)||!form.autoStatus;const manualBy=isManual?(form.manualStatusBy||currentUserName):"";const calculatedStatus=isManual?form.status:computeAutoStatus({...form,milestones:m});const statusMeta={id:'__status_meta__',isManual,by:manualBy,at:iso(),startDate:form.startDate,endDate:form.endDate};const finalMilestones=[...m,statusMeta];if(form.manpower)finalMilestones.push({id:'__manpower_meta__',manpower:form.manpower});let error;if(editing&&role==="grade2")({error}=await supabase.from("projects").update({status:calculatedStatus,progress:+form.progress||0,auto_progress:form.autoProgress,milestones:finalMilestones}).eq("id",editing));else{const row={...form,status:calculatedStatus,isManualStatus:isManual,manualStatusBy:manualBy,id:editing||uid(),milestones:finalMilestones,manpower:form.manpower||null};({error}=editing?await supabase.from("projects").update(to(row)).eq("id",editing):await supabase.from("projects").insert(to(row)))}if(error){console.error(error);return setMsg(error.code==="23505"?"이미 사용 중인 제조번호입니다.":error.message.includes("project_history")?"프로젝트 저장 실패: 데이터베이스에 'project_history' 테이블이 없습니다. Supabase에서 해당 테이블을 만들거나 관련 트리거를 삭제해주세요.":"오류 발생: "+error.message);}setForm(blank());setEditing(null);setMilestones(newMs());setMsg("저장했습니다.");load("projects")}
function addMilestoneRow(){setMilestones([...milestones,{id:uid(),name:"",startDate:iso(),endDate:iso()}])}
function removeMilestoneRow(index){if(milestones.length<=1)return setMsg("마일스톤 입력란은 최소 1개 유지됩니다.");setMilestones(milestones.filter((_,i)=>i!==index))}
function editProject(p){setEditing(p.id);const cleanMs=(p.milestones||[]).filter(x=>x&&x.id!=='__status_meta__'&&x.id!=='__manpower_meta__');const isPOWaiting=(p.status==="PO대기중");const isManual=isPOWaiting||Boolean(p.isManualStatus);setForm({...p,status:p.status,autoStatus:!isManual,isManualStatus:isManual,manualStatusBy:p.manualStatusBy||(isManual?(p.pm||currentUserName):""),progress:p.value,milestones:cleanMs,manpower:p.manpower||null});setMilestones(cleanMs.length>=5?cleanMs:[...cleanMs,...newMs().slice(0,5-cleanMs.length)]);scrollTo({top:0,behavior:"smooth"})}async function remove(id){if(del&&confirm("삭제할까요?")){await supabase.from("projects").delete().eq("id",id);load("projects");setSelectedProjects(new Set(Array.from(selectedProjects).filter(x=>x!==id)))}}async function removeSelected(){if(del&&selectedProjects.size>0&&confirm(`선택한 ${selectedProjects.size}개의 프로젝트를 삭제할까요?`)){await supabase.from("projects").delete().in("id",Array.from(selectedProjects));setSelectedProjects(new Set());load("projects")}}function toggleSelect(id){const next=new Set(selectedProjects);if(next.has(id))next.delete(id);else next.add(id);setSelectedProjects(next)}function toggleSelectAll(){if(selectedProjects.size===view.length)setSelectedProjects(new Set());else setSelectedProjects(new Set(view.map(p=>p.id)))}async function updateUser(id,v){await supabase.from("profiles").update(v).eq("id",id);load("profiles")}async function add(t){if(t==="sites"){if(!newSite.trim())return;await supabase.from(t).insert({name:normalizeJVName(newSite.trim()),created_by:session.user.id});setNewSite("")}else{if(!newPerson.trim())return;await supabase.from(t).insert({name:newPerson.trim(),department:newDept,created_by:session.user.id});setNewPerson("")}load(t)}async function trash(t,r){if(confirm(`${r.name} 삭제?`)){await supabase.from(t).delete().eq("id",r.id);load(t)}}
const monthsMap={jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
function excelDateToISO(serial,defaultYear){
  if(!serial&&serial!==0)return"";
  if(serial instanceof Date)return serial.toISOString().slice(0,10);
  const numVal=Number(serial);
  if(!isNaN(numVal)&&typeof serial!=="boolean"&&numVal>20000&&numVal<80000){
    const u=Math.floor(numVal-25569);
    return new Date(u*86400*1000).toISOString().slice(0,10);
  }
  if(typeof serial==="string"){
    let s=serial.trim();
    s=s.replace(/\s*\([월화수목금토일MonTueWedThuFriSatSun]\)/gi,'');
    s=s.replace(/^[([<{'"\s]+|[)\]}>'"\s]+$/g,'').trim();
    s=s.replace(/\.+$/,'').trim();
    if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
    const yr=defaultYear||new Date().getFullYear();
    let m=s.match(/^(\d{4})[-./ ]\s*(\d{1,2})[-./ ]\s*(\d{1,2})$/);
    if(m)return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
    m=s.match(/^(\d{2})[-./ ]\s*(\d{1,2})[-./ ]\s*(\d{1,2})$/);
    if(m&&parseInt(m[1],10)>=20&&parseInt(m[1],10)<=40){return `20${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;}
    m=s.match(/^(\d{1,2})[-/ ](\d{1,2})[-/ ](\d{2,4})$/);
    if(m&&parseInt(m[1],10)<=12&&parseInt(m[2],10)<=31){
      let yStr=m[3].length===2?'20'+m[3]:m[3];
      return `${yStr}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
    }
    const dMatch=s.match(/^(\d{1,2})[-/ ]([a-zA-Z]{3,})(?:[-/ ](\d{2,4}))?$/);
    if(dMatch){
      const day=dMatch[1].padStart(2,'0');
      const monStr=dMatch[2].slice(0,3).toLowerCase();
      const mon=monthsMap[monStr];
      let yStr=dMatch[3]?(dMatch[3].length===2?'20'+dMatch[3]:dMatch[3]):String(yr);
      if(mon)return `${yStr}-${mon}-${day}`;
    }
    const engRev=s.match(/^([a-zA-Z]{3,})[-/ ](\d{1,2})(?:[-/ ](\d{2,4}))?$/);
    if(engRev){
      const monStr=engRev[1].slice(0,3).toLowerCase();
      const mon=monthsMap[monStr];
      const day=engRev[2].padStart(2,'0');
      let yStr=engRev[3]?(engRev[3].length===2?'20'+engRev[3]:engRev[3]):String(yr);
      if(mon)return `${yStr}-${mon}-${day}`;
    }
    const koFull=s.match(/^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일?$/);
    if(koFull)return `${koFull[1]}-${koFull[2].padStart(2,'0')}-${koFull[3].padStart(2,'0')}`;
    const koMatch=s.match(/^(\d{1,2})[-./월]\s*(\d{1,2})일?$/);
    if(koMatch&&parseInt(koMatch[1],10)<=12&&parseInt(koMatch[2],10)<=31){
      return `${yr}-${koMatch[1].padStart(2,'0')}-${koMatch[2].padStart(2,'0')}`;
    }
    const d=new Date(s);
    if(!isNaN(d.getTime())){
      const y=d.getFullYear();
      if(y>=2020&&y<=2040)return d.toISOString().slice(0,10);
    }
  }
  return "";
}
function parseHeaderDate(val,defaultYear){return excelDateToISO(val,defaultYear);}
function adjustProjectDates(project){if(!project)return project;const now=new Date();const uploadYear=now.getFullYear();const uploadMonth=now.getMonth()+1;const allDates=[];if(project.startDate)allDates.push(project.startDate);if(project.endDate)allDates.push(project.endDate);(project.milestones||[]).forEach(m=>{if(m.startDate)allDates.push(m.startDate);if(m.endDate)allDates.push(m.endDate);});if(project.manpower?.dailyTotal){Object.keys(project.manpower.dailyTotal).forEach(d=>allDates.push(d));}const parsed=allDates.map(d=>{const parts=String(d).match(/^(\d{4})-(\d{2})-(\d{2})$/);return parts?{str:d,year:parseInt(parts[1],10),month:parseInt(parts[2],10),day:parts[3]}:null;}).filter(Boolean);if(!parsed.length)return project;const origYears=[...new Set(parsed.map(p=>p.year))].sort((a,b)=>a-b);const minOrigYear=origYears[0]||uploadYear;const needYearShift=minOrigYear<uploadYear;let firstMonth=1;if(project.startDate){const m=project.startDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(m)firstMonth=parseInt(m[2],10);}else if(project.milestones&&project.milestones.length>0){for(const ms of project.milestones){if(ms.startDate){const m=ms.startDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(m){firstMonth=parseInt(m[2],10);break;}}}}let baseStartYear=uploadYear;if(uploadMonth>=10&&firstMonth<=4){baseStartYear=uploadYear+1;}else if(uploadMonth<=3&&firstMonth>=9){baseStartYear=uploadYear-1;}const convertDate=(dateStr)=>{if(!dateStr||typeof dateStr!=="string")return dateStr;const m=dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return dateStr;const origY=parseInt(m[1],10);const mo=parseInt(m[2],10);const da=m[3];if(!needYearShift&&origY>=uploadYear)return dateStr;let yearOffset=Math.max(0,origY-minOrigYear);if(firstMonth>=8&&mo<firstMonth){yearOffset=Math.max(yearOffset,1);}const targetYear=baseStartYear+yearOffset;return `${targetYear}-${String(mo).padStart(2,'0')}-${da}`;};const cleanMs=(project.milestones||[]).map(ms=>({...ms,startDate:convertDate(ms.startDate),endDate:convertDate(ms.endDate)}));let newStart=convertDate(project.startDate);let newEnd=convertDate(project.endDate);let minD="",maxD="";cleanMs.forEach(m=>{if(m.startDate&&(!minD||m.startDate<minD))minD=m.startDate;if(m.endDate&&(!maxD||m.endDate>maxD))maxD=m.endDate;});if(minD&&(!newStart||newStart>minD))newStart=minD;if(maxD&&(!newEnd||newEnd<maxD))newEnd=maxD;let newManpower=project.manpower;if(newManpower){const newDailyTotal={};if(newManpower.dailyTotal){Object.entries(newManpower.dailyTotal).forEach(([dStr,val])=>{newDailyTotal[convertDate(dStr)]=val;});}const newDepartments={};if(newManpower.departments){Object.entries(newManpower.departments).forEach(([deptKey,deptObj])=>{const newDaily={};if(deptObj.daily){Object.entries(deptObj.daily).forEach(([dStr,val])=>{newDaily[convertDate(dStr)]=val;});}newDepartments[deptKey]={...deptObj,daily:newDaily};});}newManpower={...newManpower,dailyTotal:newDailyTotal,departments:newDepartments};}return{...project,startDate:newStart,endDate:newEnd,milestones:cleanMs,manpower:newManpower};}
function normalizeDeptName(raw){
  if(!raw) return "";
  const s = String(raw).trim();
  const lower = s.toLowerCase();

  // 0. Total Manday check
  if (/total\s*manday|총\s*공수|합계/i.test(lower)) return "Total Manday";

  // 1. Check if it's an outsourced (외주) department
  const isSub = /외주|sub|협력|outsourc|엘라이트/i.test(lower);

  if (isSub) {
    if (/vision|비전|비젼|vis|엘라이트/i.test(lower)) return "Vision Sub";
    if (/electrical|electronical|전장|전기|elec/i.test(lower)) return "Electrical Sub";
    if (/mechanical|기구|mech/i.test(lower)) return "Mechanical Sub";
    if (/control|제어|cont/i.test(lower)) return "Control Sub";
    const base = s.replace(/\s*\([^)]*\)$/,'').replace(/외주|sub|협력사?/gi, '').trim();
    return base ? `${base} 외주` : "기타 외주";
  }

  // 2. Pure Internal departments (No 외주 keyword)
  if (/supervisor|슈퍼바이저|\bsv\b|해체\s*검수|장착\s*검수|해체\/장착\s*검수/i.test(lower)) return "Supervisor";
  if (/mechanical|기구|mech/i.test(lower)) return "Mechanical";
  if (/vision|비전|비젼/i.test(lower)) return "Vision";
  if (/control|제어|cont/i.test(lower)) return "Control";
  if (/electrical|electronical|전장|전기|elec/i.test(lower)) return "Electrical";
  if (/safety|안전|safe/i.test(lower)) return "Safety";
  if (/manager|소장|현장대리인/i.test(lower)) return "Manager";

  return s.replace(/\s*\([^)]*\)$/,'').trim() || s;
}

function parseExcelMasterPlan(wb,context={}){
  let targetName=wb.SheetNames.find(n=>/planning|schedule|master|일정/i.test(n));
  if(!targetName){
    const nonEdit=wb.SheetNames.find(n=>!/edit|설정|양식/i.test(n));
    targetName=nonEdit||wb.SheetNames[0];
  }
  const sheet=wb.Sheets[targetName];
  if(!sheet)return null;
  const rows=XLSX.utils.sheet_to_json(sheet,{header:1,raw:true});
  if(!rows||!rows.length)return null;

  let baseProjectName="",baseStartDate="",headerRowIdx=-1,colMap={};
  let lineMfgMap={};
  let titleLines=[];

  for(let r=0;r<Math.min(25,rows.length);r++){
    const row=rows[r]||[];
    for(let c=0;c<row.length;c++){
      const val=String(row[c]||"").trim();
      if(!val)continue;
      const pMatch=val.match(/(?:project\s*name|프로젝트명)\s*[:：]\s*(.+)/i);
      if(pMatch&&pMatch[1].trim()){
        baseProjectName=normalizeJVName(pMatch[1].trim());
      }else if(/^(?:project\s*name|프로젝트명)\s*[:：]?$/i.test(val)){
        for(let next=1;next<=3;next++){
          if(row[c+next]&&String(row[c+next]).trim()){
            baseProjectName=normalizeJVName(String(row[c+next]).trim());
            break;
          }
        }
      }
      const sMatch=val.match(/(?:project\s*start\s*date|plan\s*start\s*date|시작일)\s*[:：]\s*(.+)/i);
      if(sMatch&&sMatch[1].trim()){
        const isoVal=excelDateToISO(sMatch[1].trim());
        if(isoVal)baseStartDate=isoVal;
      }else if(/^(?:project\s*start\s*date|plan\s*start\s*date|시작일)\s*[:：]?$/i.test(val)){
        for(let next=1;next<=3;next++){
          const isoVal=excelDateToISO(row[c+next]);
          if(isoVal){baseStartDate=isoVal;break;}
        }
      }
    }
  }

  if(!baseProjectName&&(context.formName||context.editingProjectName)){
    baseProjectName=normalizeJVName(context.formName||context.editingProjectName);
  }
  if(!baseProjectName&&context.fileName){
    baseProjectName=normalizeJVName(context.fileName);
  }
  if(!baseProjectName&&context.formSite){
    baseProjectName=normalizeJVName(context.formSite);
  }

  let clientPrefix=baseProjectName?baseProjectName.split(' - ')[0].trim():(context.formSite||"Project");
  if(baseProjectName){
    const linesMatch=baseProjectName.match(/(?:^|[\s\-_])([0-9,\s]+)\s*(?:Line|L|라인)/i);
    if(linesMatch){
      titleLines=linesMatch[1].split(',').map(s=>s.trim()).filter(Boolean);
      const prefixPart=baseProjectName.slice(0,linesMatch.index).trim().replace(/[:\-_]+$/,'').trim();
      if(prefixPart)clientPrefix=prefixPart;
    }
    const mfgMatches=baseProjectName.match(/(E\d{4})/gi);
    if(mfgMatches&&titleLines.length>0){
      titleLines.forEach((ln,idx)=>{
        if(mfgMatches[idx])lineMfgMap[ln]=mfgMatches[idx].toUpperCase();
      });
    }else{
      const mfgMatch=baseProjectName.match(/(?:Line\s*:\s*|제조번호\s*[:：]\s*)([0-9,\s]+)/i);
      if(mfgMatch){
        const mfgs=mfgMatch[1].split(',').map(s=>s.trim()).filter(Boolean);
        titleLines.forEach((ln,idx)=>{if(mfgs[idx])lineMfgMap[ln]=mfgs[idx];});
      }
    }
  }

  if(headerRowIdx===-1){
    for(let r=0;r<Math.min(25,rows.length);r++){
      const row=rows[r]||[];
      const rowStr=row.map(x=>String(x||"").trim().toLowerCase()).join(" ");
      if((rowStr.includes("activity")||rowStr.includes("공정")||rowStr.includes("작업")||rowStr.includes("task")) &&
         (rowStr.includes("start")||rowStr.includes("end")||rowStr.includes("시작")||rowStr.includes("종료")||rowStr.includes("equipment")||rowStr.includes("설비")||rowStr.includes("장비"))){
        headerRowIdx=r;break;
      }
    }
  }
  if(headerRowIdx===-1){
    for(let r=0;r<Math.min(15,rows.length);r++){
      const row=rows[r]||[];
      const rowStr=row.map(x=>String(x||"").trim().toLowerCase()).join(" ");
      if(rowStr.includes("equipment")||rowStr.includes("설비")||rowStr.includes("장비")||rowStr.includes("activity")||rowStr.includes("공정")){
        headerRowIdx=r;break;
      }
    }
  }
  if(headerRowIdx===-1)headerRowIdx=0;

  const headerRow=rows[headerRowIdx]||[];
  headerRow.forEach((h,colIdx)=>{
    const colName=String(h||"").trim().toLowerCase();
    if(/activity|작업|공정|task|내용|항목|업무|마일스톤|milestone/i.test(colName)){
      if(colMap.activity===undefined)colMap.activity=colIdx;
    }else if(/equipment|설비|장비|호기|machine/i.test(colName)){
      if(colMap.equipment===undefined)colMap.equipment=colIdx;
    }else if(/^구분$/i.test(colName)){
      if(colMap.equipment===undefined)colMap.equipment=colIdx;
    }else if(/^line|라인/i.test(colName)){
      if(colMap.line===undefined)colMap.line=colIdx;
    }else if(/^(item|no|순번|번호|id)$/i.test(colName)){
      if(colMap.item===undefined)colMap.item=colIdx;
    }else if(/start|시작|착수|착공|to\b/i.test(colName)){
      if(colMap.start===undefined)colMap.start=colIdx;
    }else if(/end|종료|완료|완공|마감/i.test(colName)){
      if(colMap.end===undefined)colMap.end=colIdx;
    }else if(/duration|기간|일수|days/i.test(colName)){
      if(colMap.duration===undefined)colMap.duration=colIdx;
    }
  });

  if(colMap.item===undefined)colMap.item=0;
  if(colMap.equipment===undefined)colMap.equipment=1;
  if(colMap.activity===undefined)colMap.activity=2;
  if(colMap.start===undefined)colMap.start=3;
  if(colMap.end===undefined)colMap.end=4;

  const refYear=baseStartDate?parseInt(baseStartDate.slice(0,4),10):new Date().getFullYear();
  const mappedCols=new Set(Object.values(colMap));
  const dateCols=[];
  for(let r=0;r<Math.min(30,rows.length);r++){
    const rowInfo=sheet['!rows']?sheet['!rows'][r]:null;
    if(rowInfo&&rowInfo.hidden)continue;
    const row=rows[r]||[];
    const curDates=[];
    let curYear=refYear;
    let prevMonth=null;
    for(let c=0;c<row.length;c++){
      if(mappedCols.has(c))continue;
      const iso=parseHeaderDate(row[c],curYear);
      if(iso&&/^\d{4}-\d{2}-\d{2}$/.test(iso)){
        const m=parseInt(iso.slice(5,7),10);
        if(prevMonth!==null&&prevMonth===12&&m===1)curYear++;
        prevMonth=m;
        curDates.push({colIdx:c,dateStr:iso});
      }
    }
    if(curDates.length>=3){
      curDates.forEach(d=>{
        if(!dateCols.find(x=>x.colIdx===d.colIdx))dateCols.push(d);
      });
      break;
    }
  }

  let currentLine=titleLines[0]||context.formLine||"";
  let currentMfgNo=context.formMfg||"";
  let currentProject=null;
  let inManpowerSection=false;
  let inGrandTotalSection=false;
  const projects=[];

  for(let r=headerRowIdx+1;r<rows.length;r++){
    const row=rows[r];
    if(!row||!row.length)continue;
    const rowInfo=sheet['!rows']?sheet['!rows'][r]:null;

    // Detect section start even in hidden rows (e.g. collapsed outline group)
    const rawJoined=row.map(x=>String(x||'')).join(' ');
    if(/grand\s*total/i.test(rawJoined)){
      inGrandTotalSection=true;
      inManpowerSection=false;
      continue;
    }
    if(inGrandTotalSection)continue;

    if(/manpower|인력|인원|공수|manday|m\/d/i.test(rawJoined)||
       (row.some(x=>String(x||'').toLowerCase()==='personnel')&&row.some(x=>/total/i.test(String(x||''))))){
      inManpowerSection=true;
      continue;
    }

    if(rowInfo&&rowInfo.hidden)continue;

    const itemRaw=row[colMap.item!==undefined?colMap.item:0];
    const eqRaw=row[colMap.equipment!==undefined?colMap.equipment:1];
    const actRaw=row[colMap.activity!==undefined?colMap.activity:2];
    const lineRaw=colMap.line!==undefined?row[colMap.line]:undefined;
    const sRaw=row[colMap.start!==undefined?colMap.start:3];
    const eRaw=row[colMap.end!==undefined?colMap.end:4];

    const itemStr=String(itemRaw||"").trim();
    const eqStr=String(eqRaw||"").replace(/[\r\n]+/g," ").trim();
    const actStr=String(actRaw||"").trim();
    const lineStr=String(lineRaw||"").trim();
    const combinedLineStr=[itemStr,eqStr,actStr,lineStr].join(" ");

    if(lineStr){
      const lm=lineStr.match(/([0-9A-Za-z]+)/);
      if(lm)currentLine=lm[1];
    }else{
      const lineMatch=combinedLineStr.match(/(?:Line\s*|L|라인)\s*([0-9A-Za-z]+)|([0-9A-Za-z]+)\s*(?:Line|L|라인)/i);
      if(lineMatch&&!/total|manpower|personnel/i.test(combinedLineStr)){
        currentLine=(lineMatch[1]||lineMatch[2]).trim();
      }
    }
    const mfgMatch2=combinedLineStr.match(/(E[0-9]{4})/i);
    if(mfgMatch2&&!/total|manpower/i.test(combinedLineStr)){
      currentMfgNo=mfgMatch2[1].toUpperCase();
      for(let l in lineMfgMap){
        if(lineMfgMap[l]===currentMfgNo){currentLine=l;break;}
      }
    }else{
      if(lineMfgMap[currentLine])currentMfgNo=lineMfgMap[currentLine];
    }

    const mStart=excelDateToISO(sRaw,refYear);
    const mEnd=excelDateToISO(eRaw,refYear);
    const isDateRow=Boolean(mStart&&mEnd);

    const durRaw=colMap.duration!==undefined?row[colMap.duration]:row[7];

    if(/manpower|인력|인원|공수|manday|m\/d/i.test(combinedLineStr)||
       (String(sRaw||'').toLowerCase()==='personnel'&&/total/i.test(String(eRaw||'')))||
       (/total/i.test(String(sRaw))&&/peak/i.test(String(eRaw)))){
      inManpowerSection=true;
      continue;
    }

    let isDeptRow=inManpowerSection&&!isDateRow;
    if(!isDeptRow&&!isDateRow&&currentProject){
      const checkRaw=String(sRaw||actStr||eqStr||'').trim();
      const checkDept=normalizeDeptName(checkRaw);
      const isNum=Number(eRaw)>0||Number(durRaw)>0;
      if(checkDept&&(checkDept!==checkRaw||/mechanical|vision|control|electrical|safety|supervisor/i.test(checkDept))&&isNum){
        inManpowerSection=true;
        isDeptRow=true;
      }
    }

    const isEqStart=eqStr&&!/manpower|personnel|인력|인원|공수|manday|m\/d/i.test(combinedLineStr)&&eqStr!=="0"&&!isDeptRow&&(
      !currentProject||eqStr!==currentProject.equipment||currentLine!==currentProject._lineNum||inManpowerSection
    );

    if(isEqStart){
      inManpowerSection=false;
      const lineLabel=currentLine?`${currentLine}Line`:"";
      const mfgNo=currentMfgNo||lineMfgMap[currentLine]||context.formMfg||"";
      const projName=normalizeJVName([clientPrefix,lineLabel,eqStr].filter(Boolean).join(" - ").replace(" -  - "," - "));

      currentProject={
        projectName:projName,
        equipment:eqStr,
        startDate:baseStartDate,
        endDate:"",
        manufacturingNo:normalizeJVName(mfgNo),
        line:normalizeJVName(lineLabel||currentLine),
        _lineNum:currentLine,
        milestones:[],
        _deptMap:{},
        _dailyTotalMap:{},
        _totalMandayVal:0,
        _dailyPeakVal:0,
        sheetName:targetName
      };
      projects.push(currentProject);
    }

    if(inManpowerSection&&currentProject){
      // In this Excel format, department data layout in Manpower section:
      // col[colMap.start / 5] = Personnel name (department)
      // col[colMap.end / 6] = Total manday
      // col[colMap.duration / 7] = Peak
      // col[8+] = daily manpower values
      
      // Try multiple columns to find the department name
      const deptFromStart=String(sRaw||"").trim();
      const deptFromAct=String(actStr||"").trim();
      const deptFromEq=String(eqStr||"").trim();
      let deptRaw=deptFromStart&&deptFromStart!=="0"&&!/^\d+$/.test(deptFromStart)&&!/personnel|total|peak/i.test(deptFromStart)?deptFromStart:
                    (deptFromAct&&deptFromAct!=="0"&&!/^\d+$/.test(deptFromAct)&&!/personnel|total|peak/i.test(deptFromAct)?deptFromAct:
                    (deptFromEq&&deptFromEq!=="0"&&!/^\d+$/.test(deptFromEq)&&!/personnel|total|peak/i.test(deptFromEq)?deptFromEq:""));
      if(!deptRaw){
        for(let c=0;c<=Math.min(6,row.length-1);c++){
          const val=String(row[c]||"").trim();
          if(val&&val!=="0"&&!/^\d+$/.test(val)&&!/personnel|total|peak|activity|equipment|line/i.test(val)){
            const testNorm=normalizeDeptName(val);
            if(testNorm&&testNorm!==val){deptRaw=val;break;}
            if(/기구|전장|비전|비젼|제어|안전|소장|외주|supervisor/i.test(val)){deptRaw=val;break;}
          }
        }
      }
      if(!deptRaw)continue;
      
      const deptName=normalizeDeptName(deptRaw);
      const isTotalRow=deptName==="Total Manday"||/total\s*manday|총\s*공수|합계/i.test(deptRaw)||/^total$/i.test(deptRaw)||/total/i.test(combinedLineStr);

      // Total and Peak can be in colMap.end(col 6) and colMap.duration(col 7) respectively
      const totalVal=Number(eRaw)||0;
      const peakVal=Number(durRaw)||0;
      
      // Also try the original sRaw/eRaw as fallback if they look like numbers
      let rowTotal=totalVal;
      let rowPeak=peakVal;
      
      // If the start column has a number (old format), use it as total
      if(!rowTotal&&Number(sRaw)>0&&/^\d+(\.\d+)?$/.test(String(sRaw).trim())){
        rowTotal=Number(sRaw);
      }
      
      const daily={};
      dateCols.forEach(({colIdx,dateStr})=>{
        const val=Number(row[colIdx])||0;
        if(val>0){
          daily[dateStr]=val;
          if(isTotalRow)currentProject._dailyTotalMap[dateStr]=val;
        }
      });

      const dailySum=Object.values(daily).reduce((a,b)=>a+b,0);
      const dailyMax=Object.values(daily).reduce((a,b)=>Math.max(a,b),0);
      if(!rowTotal&&dailySum>0)rowTotal=dailySum;
      if(!rowPeak&&dailyMax>0)rowPeak=dailyMax;

      if(isTotalRow){
        currentProject._totalMandayVal=rowTotal;
        currentProject._dailyPeakVal=rowPeak;
        inManpowerSection=false;
      }else if(deptName&&(rowTotal>0||rowPeak>0||dailySum>0)){
        currentProject._deptMap[deptName]={total:rowTotal,peak:rowPeak,daily};
      }
      continue;
    }

    if(actStr&&actStr!=="0"&&mStart&&mEnd&&currentProject){
      currentProject.milestones.push({name:normalizeJVName(actStr),startDate:mStart,endDate:mEnd});
    }
  }

  projects.forEach(p=>{
    delete p._lineNum;
    if(Object.keys(p._deptMap).length>0||p._totalMandayVal>0){
      if(Object.keys(p._dailyTotalMap).length===0){
        dateCols.forEach(({dateStr})=>{
          let sum=0;
          Object.values(p._deptMap).forEach(d=>{
            if(d.daily&&d.daily[dateStr])sum+=d.daily[dateStr];
          });
          if(sum>0)p._dailyTotalMap[dateStr]=sum;
        });
      }
      if(!p._totalMandayVal){
        p._totalMandayVal=Object.values(p._deptMap).reduce((a,b)=>a+(b.total||0),0);
      }
      if(!p._dailyPeakVal){
        p._dailyPeakVal=Object.values(p._dailyTotalMap).reduce((a,b)=>Math.max(a,b),0);
      }
      p.manpower={
        totalManday:p._totalMandayVal,
        dailyPeak:p._dailyPeakVal,
        departments:p._deptMap,
        dailyTotal:p._dailyTotalMap
      };
    }
    delete p._deptMap;
    delete p._dailyTotalMap;
    delete p._totalMandayVal;
    delete p._dailyPeakVal;

    let minD="",maxD="";
    p.milestones.forEach(m=>{
      if(!minD||m.startDate<minD)minD=m.startDate;
      if(!maxD||m.endDate>maxD)maxD=m.endDate;
    });
    if(!p.startDate&&minD)p.startDate=minD;
    if(maxD)p.endDate=maxD;
  });

  // Removed duplicate appending logic to prevent E1540-1, E1540-2

  return projects.map(adjustProjectDates).filter(p=>p.milestones.length>0||p.manpower);
}

function hasSharedCode(setA, setB) {
  if (!setA || !setB) return false;
  for (let a of setA) {
    if (setB.has(a)) return true;
  }
  return false;
}

function extractProjectTags(p, sites = []) {
  const name = String(p.projectName || p.name || '').trim();
  const mfg = String(p.manufacturingNo || p.manufacturing_no || '').trim();
  const eq = String(p.equipment || '').toLowerCase().replace(/\s*\(\d+대\)/, '').trim();
  const line = String(p.line || '').replace(/line/i, '').trim().toLowerCase();
  const site = String(p.site || '').trim().toLowerCase();

  // 1. Job Change (형교환) project check
  const isJC = /j\/?c\b|jc\b|job\s*change|형교환|기종교체|모델교체|개조/i.test(name) ||
               (p.milestones && p.milestones.some(m => /j\/?c|형교환|job\s*change/i.test(m.name)));

  // 2. Setup / Initial installation project check
  const isSetup = /set-?up|셋업|신규|설치|초기|반입/i.test(name);

  // 3. Known site names to exclude from code matching
  const siteNamesUpper = new Set((sites || []).map(s => String(s.name || '').toUpperCase().trim()));
  ['SKOJ', 'SKOY', 'SKOH', 'HSBMA', 'TW'].forEach(s => siteNamesUpper.add(s));

  // 4. Project-specific codes (e.g. E1127, H055, S010A, 2309AD-N, E1144, E1540)
  const codeMatches = (name + ' ' + mfg).match(/\b([A-Z0-9]{4,12}(?:-[A-Z0-9]+)?)\b/gi) || [];
  const codes = new Set(codeMatches.map(c => c.toUpperCase()).filter(c => !siteNamesUpper.has(c) && !/line|notcher|stacker|project|schedule|master/i.test(c)));
  if (mfg && !siteNamesUpper.has(mfg.toUpperCase())) codes.add(mfg.toUpperCase());

  // 5. Phase / Round (1차, 2차 등)
  const roundMatch = name.match(/([0-9]+)\s*차/);
  const round = roundMatch ? roundMatch[1] : null;

  return { isJC: !!isJC, isSetup: !!isSetup, codes, round, line, site, eq, name: name.toLowerCase() };
}

function isSameProjectIdentity(existing, incoming, sites = []) {
  if (!existing || !incoming) return false;

  const exTags = extractProjectTags(existing, sites);
  const inTags = extractProjectTags(incoming, sites);

  // 1. Site Check: Must not conflict
  if (exTags.site && inTags.site && exTags.site !== inTags.site) return false;
  if (exTags.site && inTags.name) {
    const conflictingSite = (sites || []).find(s => s.name && s.name.trim().toLowerCase() !== exTags.site && inTags.name.includes(s.name.trim().toLowerCase()));
    if (conflictingSite) return false;
  }

  // 2. Line Check: Must not conflict
  if (exTags.line && inTags.line && exTags.line !== inTags.line) return false;

  // 3. Equipment Check: Notcher vs Stacker
  const isExNotcher = /notcher|노칭/i.test(exTags.name) || /notcher|노칭/i.test(exTags.eq);
  const isExStacker = /stacker|스태커|스택/i.test(exTags.name) || /stacker|스태커|스택/i.test(exTags.eq);
  const isInNotcher = /notcher|노칭/i.test(inTags.name) || /notcher|노칭/i.test(inTags.eq);
  const isInStacker = /stacker|스태커|스택/i.test(inTags.name) || /stacker|스태커|스택/i.test(inTags.eq);

  if ((isExNotcher && isInStacker) || (isExStacker && isInNotcher)) return false;

  // 4. Job Change (형교환) vs Setup (신규 셋업 / 일반) Distinction:
  // "동일사이트 동일라인에 형교환 프로젝트가 있을 수 있으니 추가 검증"
  if (exTags.isJC !== inTags.isJC) {
    return false;
  }

  // 5. J/C Round Check (1차 형교환 vs 2차 형교환)
  if (exTags.round && inTags.round && exTags.round !== inTags.round) {
    return false;
  }

  // 6. Project Code / Manufacturing No Check (e.g. H055 vs E1127 or E1144 vs E1540)
  if (exTags.codes.size > 0 && inTags.codes.size > 0) {
    if (!hasSharedCode(exTags.codes, inTags.codes)) {
      return false;
    }
  }

  // 7. Date Range Disjointness Check:
  // If dates are completely separated by more than 45 days with no overlapping code, they are different projects
  if (existing.startDate && existing.endDate && incoming.startDate && incoming.endDate) {
    const dtVal = s => new Date(s).getTime();
    const gap = Math.max(dtVal(incoming.startDate) - dtVal(existing.endDate), dtVal(existing.startDate) - dtVal(incoming.endDate));
    const dayGap = gap / (1000 * 60 * 60 * 24);
    if (dayGap > 45 && !hasSharedCode(exTags.codes, inTags.codes)) {
      return false;
    }
  }

  // 8. Positive Match Confirmation:
  const eqMatch = (isExNotcher && isInNotcher) || (isExStacker && isInStacker) ||
                  (inTags.eq && exTags.name.includes(inTags.eq)) ||
                  (exTags.eq && inTags.name.includes(exTags.eq));

  const nameMatch = exTags.name && inTags.name && (
    exTags.name === inTags.name ||
    exTags.name.replace(/\s+/g, '') === inTags.name.replace(/\s+/g, '')
  );

  const codeMatch = hasSharedCode(exTags.codes, inTags.codes);

  return nameMatch || (eqMatch && (codeMatch || (exTags.line === inTags.line && (!exTags.site || exTags.site === inTags.site))));
}

async function saveDirectProjects(directProjects,sourceLabel="엑셀"){
  if(!directProjects||directProjects.length===0)return false;
  if(editing){
    const curP=projects.find(pr=>pr.id===editing)||form;
    let targetP=directProjects.find(p=>isSameProjectIdentity(curP, p, sites));

    if(!targetP){
      const curType = (/j\/?c|형교환/i.test(curP.name) || (curP.milestones && curP.milestones.some(m => /j\/?c|형교환/i.test(m.name)))) ? "형교환(J/C)" : "일반/셋업";
      setMsg(`현재 수정 대상인 '${curP.name}'(${curType}, Site: ${curP.site||'-'}, Line: ${curP.line||'-'})와 일치하는 프로젝트/설비 정보를 첨부 파일에서 찾을 수 없습니다. 동일 사이트/라인의 별도 프로젝트(형교환 또는 신규)로 등록하시려면 상단의 [수정 취소]를 누른 후 파일을 첨부해주세요.`);
      return false;
    }

    const cleanMs=targetP.milestones.map(m=>({...m,name:normalizeJVName(m.name),id:uid()}));
    const autoStat=computeAutoStatus({startDate:targetP.startDate||form.startDate||iso(),endDate:targetP.endDate||form.endDate||iso(),milestones:cleanMs});
    let siteVal=form.site||curP.site;
    const projName=normalizeJVName(targetP.projectName||form.name||curP.name);
    if(!siteVal&&projName&&sites.length){
      const matchedSite=sites.find(s=>projName.toLowerCase().includes(s.name.toLowerCase()));
      if(matchedSite)siteVal=matchedSite.name;
    }
    const updatedRow={
      ...curP,...form,id:editing,
      name:form.name||projName,
      startDate:targetP.startDate||form.startDate,
      endDate:targetP.endDate||form.endDate,
      manufacturingNo:normalizeJVName(targetP.manufacturingNo||form.manufacturingNo||curP.manufacturingNo||""),
      line:normalizeJVName(targetP.line||form.line||curP.line||""),
      site:normalizeJVName(siteVal||form.site||curP.site||"선택 안됨"),
      status:autoStat,autoStatus:true,isManualStatus:false,manualStatusBy:"",
      milestones:cleanMs,manpower:targetP.manpower||curP.manpower||null
    };
    setForm(updatedRow);
    setMilestones(cleanMs.length>=5?cleanMs:[...cleanMs,...newMs().slice(0,5-cleanMs.length)]);
    const{error}=await supabase.from("projects").update(to(updatedRow)).eq("id",editing);
    if(error){
      console.error("Master plan update error:",error);
      setMsg(`마스터 플랜 최신화 실패: ${error.message}`);
    }else{
      const mpText=targetP.manpower?` (총 공수 ${targetP.manpower.totalManday} M/D 최신화)`:"";
      let additionalUpdated=0;
      let additionalCreated=0;
      if(directProjects.length>1){
        for(const otherP of directProjects){
          if(otherP===targetP)continue;
          const existingOther=projects.find(ep=>ep.id!==editing&&isSameProjectIdentity(ep, otherP, sites));
          if(existingOther){
            const otherCleanMs=otherP.milestones.map(m=>({...m,name:normalizeJVName(m.name),id:uid()}));
            const otherAutoStat=computeAutoStatus({startDate:otherP.startDate,endDate:otherP.endDate,milestones:otherCleanMs});
            const updatedOther={
              ...existingOther,
              startDate:otherP.startDate||existingOther.startDate,
              endDate:otherP.endDate||existingOther.endDate,
              manufacturingNo:normalizeJVName(otherP.manufacturingNo||existingOther.manufacturingNo||""),
              line:normalizeJVName(otherP.line||existingOther.line||""),
              status:otherAutoStat,autoStatus:true,isManualStatus:false,manualStatusBy:"",
              milestones:otherCleanMs,manpower:otherP.manpower||existingOther.manpower||null
            };
            await supabase.from("projects").update(to(updatedOther)).eq("id",existingOther.id);
            additionalUpdated++;
          }else{
            let otherSite=siteVal;
            const otherCleanMs=otherP.milestones.map(m=>({...m,name:normalizeJVName(m.name),id:uid()}));
            const otherAutoStat=computeAutoStatus({startDate:otherP.startDate||iso(),endDate:otherP.endDate||iso(),milestones:otherCleanMs});
            const newOtherRow={
              ...blank(),id:uid(),
              name:normalizeJVName(otherP.projectName),
              startDate:otherP.startDate||iso(),
              endDate:otherP.endDate||iso(),
              manufacturingNo:normalizeJVName(otherP.manufacturingNo||""),
              line:normalizeJVName(otherP.line||""),
              site:normalizeJVName(otherSite||"선택 안됨"),
              status:otherAutoStat,autoStatus:true,isManualStatus:false,manualStatusBy:"",
              milestones:otherCleanMs,manpower:otherP.manpower||null
            };
            let insertData=to(newOtherRow);
            if(insertData.manufacturing_no){
            // Removed duplicate loop for manufacturing_no
            }
            let{error:otherErr}=await supabase.from("projects").insert(insertData);
            if(otherErr&&otherErr.code==="23505"){
              insertData.manufacturing_no=`${insertData.manufacturing_no||'MFG'}-${uid().slice(-4)}`;
              const retry=await supabase.from("projects").insert(insertData);
              otherErr=retry.error;
            }
            if(otherErr){console.error("Auto-insert error for other project",otherP.projectName,otherErr);}
            else additionalCreated++;
          }
        }
      }
      const parts=[];
      if(additionalUpdated>0)parts.push(`관련 프로젝트 ${additionalUpdated}건 최신화`);
      if(additionalCreated>0)parts.push(`신규 설비 프로젝트 ${additionalCreated}건 등록`);
      const addText=parts.length>0?` 및 ${parts.join(', ')}`: "";
      setMsg(`'${updatedRow.name}' 프로젝트의 마스터 스케줄 및 공수가 최신 버전으로 업데이트되었습니다!${mpText}${addText}`);
      load("projects");
    }
    return true;
  }else{
    let successCount=0;
    let updateCount=0;
    let errorLog=[];
    for(const p of directProjects){
      let siteVal=form.site;
      const projName=normalizeJVName(p.projectName);
      if(!siteVal&&projName&&sites.length){
        const matchedSite=sites.find(s=>projName.toLowerCase().includes(s.name.toLowerCase()));
        if(matchedSite)siteVal=matchedSite.name;
      }
      const existing=projects.find(ep=>isSameProjectIdentity(ep, p, sites));
      const cleanMs=p.milestones.map(m=>({...m,name:normalizeJVName(m.name),id:uid()}));
      const autoStat=computeAutoStatus({startDate:p.startDate||iso(),endDate:p.endDate||iso(),milestones:cleanMs});

      if(existing){
        const updatedExisting={
          ...existing,
          startDate:p.startDate||existing.startDate,
          endDate:p.endDate||existing.endDate,
          manufacturingNo:normalizeJVName(p.manufacturingNo||existing.manufacturingNo||""),
          line:normalizeJVName(p.line||existing.line||""),
          site:normalizeJVName(siteVal||existing.site||"선택 안됨"),
          status:autoStat,autoStatus:true,isManualStatus:false,manualStatusBy:"",
          milestones:cleanMs,manpower:p.manpower||existing.manpower||null
        };
        const{error}=await supabase.from("projects").update(to(updatedExisting)).eq("id",existing.id);
        if(error){console.error("Auto-update error for",p.projectName,error);errorLog.push(error.message);}
        else updateCount++;
      }else{
        const newRow={
          ...blank(),id:uid(),name:projName,
          startDate:p.startDate||iso(),endDate:p.endDate||iso(),
          manufacturingNo:normalizeJVName(p.manufacturingNo||form.manufacturingNo||""),
          line:normalizeJVName(p.line||form.line||""),
          site:normalizeJVName(siteVal||form.site||"선택 안됨"),
          status:autoStat,autoStatus:true,isManualStatus:false,manualStatusBy:"",
          milestones:cleanMs,manpower:p.manpower||null
        };
        let insertData=to(newRow);
        if(insertData.manufacturing_no){
          // Removed duplicate loop for manufacturing_no
        }
        let{error}=await supabase.from("projects").insert(insertData);
        if(error&&error.code==="23505"){
          insertData.manufacturing_no=`${insertData.manufacturing_no||'MFG'}-${uid().slice(-4)}`;
          const retry=await supabase.from("projects").insert(insertData);
          error=retry.error;
        }
        if(error){console.error("Auto-insert error for",p.projectName,error);errorLog.push(error.message);}
        else successCount++;
      }
    }
    const totalMpSum=directProjects.reduce((acc,p)=>acc+(p.manpower?.totalManday||0),0);
    const mpSummaryText=totalMpSum>0?` 총 공수 ${totalMpSum} M/D 반영됨`:"";
    if(successCount===0&&updateCount===0&&errorLog.length>0){
      setMsg(`저장 실패: 데이터베이스 오류 발생 (${errorLog[0]})`);
    }else{
      const resText=[];
      if(successCount>0)resText.push(`${successCount}개 신규 등록`);
      if(updateCount>0)resText.push(`${updateCount}개 최신화`);
      setMsg(`${sourceLabel} 완료! (${directProjects[0].sheetName||'표 데이터'}에서 ${directProjects.length}개 설비 중 ${resText.join(', ')} 되었습니다.${mpSummaryText?` ${mpSummaryText}`:""})`);
    }
    load("projects");
    return true;
  }
}

async function handleMasterPlanUpload(input){
  if(!editing&&!create)return showPermissionModal("마스터 플랜 등록");
  if(editing&&!edit)return showPermissionModal("프로젝트 수정");
  if(!input)return;
  setMsg("마스터 플랜 분석 중...");
  setIsExtracting(true);
  try{
    let directProjects=null;
    let sourceLabel="엑셀 파일";
    const parseContext={formName:form.name,formLine:form.line,formSite:form.site,formMfg:form.manufacturingNo,editingProjectName:editing?projects.find(p=>p.id===editing)?.name:"",fileName:input.name?input.name.replace(/\.[^/.]+$/,""):""};

    if(input.name&&input.name.match(/\.(xlsx|xls)$/i)){
      const data=await input.arrayBuffer();
      const wb=XLSX.read(data,{cellDates:false,cellStyles:true});
      directProjects=parseExcelMasterPlan(wb,parseContext);
      sourceLabel="엑셀 파일";
    }else if(typeof input==="string"){
      sourceLabel="엑셀 표 붙여넣기";
      try{
        let wb=null;
        const rawLines=input.split(/\r?\n/).map(l=>l.trimEnd()).filter(Boolean);
        const delimiter=rawLines.some(l=>l.includes('\t'))?'\t':(rawLines.some(l=>l.includes(','))?',':'\t');
        const lines=rawLines.map(l=>{
          return l.split(delimiter).map(cell=>{
            let c=cell.trim();
            if(c.startsWith('"')&&c.endsWith('"'))c=c.slice(1,-1).replace(/""/g,'"').trim();
            return c;
          });
        });
        if(lines.length>0&&(input.includes('\t')||lines.some(l=>l.length>1))){
          const ws=XLSX.utils.aoa_to_sheet(lines);
          wb={SheetNames:['Sheet1'],Sheets:{Sheet1:ws}};
        }
        if(!wb){
          try{wb=XLSX.read(input,{type:"string"});}catch(e){}
        }
        if(wb&&wb.SheetNames&&wb.SheetNames.length>0){
          directProjects=parseExcelMasterPlan(wb,parseContext);
        }
      }catch(e){
        console.warn("Direct TSV parse failed, fallback to AI:",e);
      }
    }

    if(directProjects&&directProjects.length>0){
      await saveDirectProjects(directProjects,sourceLabel);
      return;
    }

    const apiKey=import.meta.env.VITE_GEMINI_API_KEY;
    if(!apiKey)throw new Error("엑셀 표 서식을 자동으로 판독하지 못했거나, AI 분석용 Gemini API 키가 설정되지 않았습니다.");
    const genAI=new GoogleGenerativeAI(apiKey);
    const model=genAI.getGenerativeModel({model:"gemini-3.6-flash"});
    let parts=[];

    if(typeof input==="string"){
      parts=[{text:`이것은 마스터 플랜의 클립보드 텍스트입니다:\n\n${input}`}];
    }else if(input.name&&input.name.match(/\.(xlsx|xls)$/i)){
      const data=await input.arrayBuffer();
      const wb=XLSX.read(data,{cellDates:false,cellStyles:true});
      let sheetName=wb.SheetNames.find(n=>/planning|schedule|master|일정/i.test(n))||wb.SheetNames.find(n=>!/edit|설정|양식/i.test(n))||wb.SheetNames[0];
      const sheet=wb.Sheets[sheetName];
      const rawJson=XLSX.utils.sheet_to_json(sheet,{header:1});
      const compactCsv=(rawJson||[]).slice(0,80).map(r=>(r||[]).slice(0,10).join(",")).filter(l=>l.replace(/,/g,"").trim().length>0).join("\n");
      parts=[{text:`이것은 마스터 플랜 엑셀(${sheetName} 시트)의 데이터입니다:\n\n${compactCsv}`}];
    }else if(input.type&&input.type.startsWith("image/")){
      const reader=new FileReader();
      const p=new Promise(res=>reader.onload=()=>res(reader.result));
      reader.readAsDataURL(input);
      const b64=await p;
      const b64d=b64.split(",")[1];
      parts=[{inlineData:{data:b64d,mimeType:input.type}}];
    }else{
      throw new Error("지원하지 않는 데이터 형식입니다. (Excel, 이미지, 또는 텍스트 복사)");
    }

    const prompt=`당신은 프로젝트 일정표(Master Plan) 및 공수(Manpower) 데이터를 분석하는 전문가입니다. 첨부된 데이터(이미지 또는 엑셀 텍스트)를 분석하여 아래 JSON 구조로만 데이터를 추출하세요.
데이터에 여러 장비(Equipment) 또는 라인(Line)별 공정이 포함되어 있다면, 각각 개별 프로젝트로 분할하여 "projects" 배열에 넣어 반환하세요.
각 장비 바로 아래에 위치한 공수(Mechanical, Vision, Vision Sub(비전 외주), Control, Electrical, Electrical Sub(전장 외주), Supervisor(슈퍼바이저), Safety(안전) 등 시트에 기재된 모든 부서) 표는 해당 장비 프로젝트의 "manpower"에 각각 1:1로 정확히 할당해야 합니다. 특히 "비전 외주", "전장 외주", "Supervisor(슈퍼바이저)"는 일반 비전/전장과 합치지 말고 반드시 별도 부서로 독립 추출해야 합니다.

JSON 출력 예시:
{
 "projects": [
  {
   "projectName": "SKOH 10Line - Stacker 1호기",
   "equipment": "Stacker 1호기",
   "line": "10Line",
   "manufacturingNo": "91144",
   "startDate": "2026-02-10",
   "endDate": "2026-08-30",
   "milestones": [
    { "name": "기구 셋팅", "startDate": "2026-07-06", "endDate": "2026-07-19" }
   ],
   "manpower": {
    "totalManday": 507,
    "dailyPeak": 21,
    "departments": {
     "Mechanical": { "total": 240, "peak": 11, "daily": { "2026-05-15": 6 } },
     "Vision": { "total": 94, "peak": 4, "daily": { "2026-05-15": 2 } },
     "Vision Sub": { "total": 25, "peak": 2, "daily": { "2026-05-15": 2 } },
     "Control": { "total": 47, "peak": 2, "daily": { "2026-05-15": 2 } },
     "Electrical": { "total": 61, "peak": 5, "daily": { "2026-05-15": 3 } },
     "Electrical Sub": { "total": 20, "peak": 2, "daily": { "2026-05-15": 2 } },
     "Supervisor": { "total": 11, "peak": 1, "daily": { "2026-05-15": 1 } },
     "Safety": { "total": 54, "peak": 2, "daily": { "2026-05-15": 2 } }
    },
    "dailyTotal": { "2026-05-15": 9 }
   }
  }
 ]
}

주의: JSON 이외의 어떠한 설명이나 마크다운 백틱(\`\`\`)을 포함하지 말고 순수 JSON만 응답하세요.`;

    const result=await model.generateContent([...parts,prompt]);
    let responseText=result.response.text().trim();
    if(responseText.startsWith("\`\`\`json"))responseText=responseText.replace(/^\`\`\`json\s*/,"").replace(/\s*\`\`\`$/,"");
    else if(responseText.startsWith("\`\`\`"))responseText=responseText.replace(/^\`\`\`\s*/,"").replace(/\s*\`\`\`$/,"");
    const rawJson=JSON.parse(responseText);
    let rawList=[];
    if(rawJson.projects&&Array.isArray(rawJson.projects)&&rawJson.projects.length>0){
      rawList=rawJson.projects;
    }else{
      rawList=[rawJson];
    }
    const aiProjects=rawList.map(adjustProjectDates);
    await saveDirectProjects(aiProjects,"AI 분석");
  }catch(err){
    setMsg("분석 실패: "+err.message);
  }finally{
    setIsExtracting(false);
    if(masterPlanInput.current)masterPlanInput.current.value="";
  }
}
async function excel(){setMsg("Excel 보고서 생성 중...");try{await exportExcelReport(view,{filter,siteFilter,personFilter,search});setMsg("Excel 보고서를 완료했습니다.")}catch(error){setMsg("Excel 생성 실패: "+error.message)}}
const gs=view.length?new Date(Math.min(...view.flatMap(p=>[dt(p.startDate).getTime(),...p.milestones.map(m=>dt(m.startDate).getTime())]))):dt(iso()),ge=view.length?new Date(Math.max(...view.flatMap(p=>[dt(p.endDate).getTime(),...p.milestones.map(m=>dt(m.endDate).getTime())]))):new Date(gs.getTime()+DAY),span=Math.max(DAY,ge-gs+DAY),pos=d=>Math.max(0,Math.min(100,(dt(d)-gs)/span*100)),barW=(s,e)=>Math.max(1,(dt(e)-dt(s)+DAY)/span*100),cells=monthCells(month),dayStats=d=>{const k=iso(d),active=view.filter(p=>k>=p.startDate&&k<=p.endDate),starts=active.filter(p=>p.startDate===k),ends=active.filter(p=>p.endDate===k);return{active,starts,ends}},monthProjects=view.filter(p=>p.startDate<=iso(new Date(month.getFullYear(),month.getMonth()+1,0))&&p.endDate>=iso(new Date(month.getFullYear(),month.getMonth(),1)));
if(loading)return<div className="center">확인 중...</div>;if(!session)return<Login/>;if(!profile)return<div className="center">권한 확인 중... {msg}</div>;const P=({label,field,dept})=><label>{label}<input list={dept} value={form[field]} disabled={role==="grade2"} onChange={e=>setForm({...form,[field]:e.target.value})}/><datalist id={dept}>{people.filter(x=>x.department===dept).map(x=><option key={x.id} value={x.name}/>)}</datalist></label>;
return <main><header><img src="/tw-logo.png"/><div><b>TW Project</b><h1>Project Management</h1><small>{session.user.email} · {role}</small></div><nav style={{display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end'}}><div style={{display: 'flex', gap: '4px'}}><button onClick={()=>{if('caches' in window){caches.keys().then(ks=>ks.forEach(k=>caches.delete(k)));}if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister()));}window.location.reload(true);}} style={{background:'#d97706',color:'#fff',fontSize:'11px',fontWeight:'bold'}} title="브라우저 캐시를 완전히 비우고 최신 화면으로 새로고침합니다">⚡ 캐시 새로고침</button><button onClick={()=>{if(isGrade1)return showPermissionModal("Excel 보고서 출력");excel();}}>Excel 보고서</button><button onClick={()=>supabase.auth.signOut()}>로그아웃</button></div><div style={{display: 'flex', gap: '4px'}}>{role==="admin"&&<button onClick={()=>setModal("users")}>사용자 권한 관리</button>}</div></nav></header><div className="top" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}><div style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}><button onClick={()=>setCurrentView("projects")} style={{background: currentView==="projects" ? "linear-gradient(135deg, #1f6feb, #1152b3)" : "#e1e4e8",color: currentView==="projects" ? "#fff" : "#24292e",border: currentView==="projects" ? "1px solid #388bfd" : "1px solid #d1d5da",padding: "0.45rem 1.15rem",borderRadius: "6px",cursor: "pointer",fontWeight: 600,height: "44px",display: "inline-flex",flexDirection: "column",alignItems: "center",justifyContent: "center",boxSizing: "border-box",fontSize: "13px"}}><span>프로젝트 일정 📅</span></button>
<button onClick={()=>setCurrentView("manpower")} style={{background: currentView==="manpower" ? "linear-gradient(135deg, #1f6feb, #1152b3)" : "#e1e4e8",color: currentView==="manpower" ? "#fff" : "#24292e",border: currentView==="manpower" ? "1px solid #388bfd" : "1px solid #d1d5da",padding: "0.45rem 1.15rem",borderRadius: "6px",cursor: "pointer",fontWeight: 600,height: "44px",display: "inline-flex",flexDirection: "column",alignItems: "center",justifyContent: "center",boxSizing: "border-box",fontSize: "13px"}}><span>공수 통합 관리 📊</span></button>
<button onClick={()=>setCurrentView("issues")} style={{background: currentView==="issues" ? "linear-gradient(135deg, #1f6feb, #1152b3)" : "#e1e4e8",color: currentView==="issues" ? "#fff" : "#24292e",border: currentView==="issues" ? "1px solid #388bfd" : "1px solid #d1d5da",padding: "0.45rem 1.15rem",borderRadius: "6px",cursor: "pointer",fontWeight: 600,height: "44px",display: "inline-flex",flexDirection: "column",alignItems: "center",justifyContent: "center",boxSizing: "border-box",fontSize: "13px"}}><span>프로젝트 이슈 관리 📋</span></button>
<button onClick={()=>{if(isGrade1)return showPermissionModal("견적 조회");setCurrentView("quotations");}} style={{background: currentView==="quotations" ? "linear-gradient(135deg, #1f6feb, #1152b3)" : "#e1e4e8",color: currentView==="quotations" ? "#fff" : "#24292e",border: currentView==="quotations" ? "1px solid #388bfd" : "1px solid #d1d5da",padding: "0.45rem 1.15rem",borderRadius: "6px",cursor: "pointer",fontWeight: 600,height: "44px",display: "inline-flex",flexDirection: "column",alignItems: "center",justifyContent: "center",boxSizing: "border-box",fontSize: "13px",opacity:isGrade1?0.85:1}} title={isGrade1 ? "Grade 1은 권한이 제한됩니다 (클릭 시 권한 안내)" : ""}><span>견적 조회 💰 {isGrade1 && "🔒"}</span></button>
<button onClick={()=>setCurrentView("vision-spc")} style={{background: currentView==="vision-spc" ? "linear-gradient(135deg, #1f6feb, #1152b3)" : "#e1e4e8",color: currentView==="vision-spc" ? "#fff" : "#24292e",border: currentView==="vision-spc" ? "1px solid #388bfd" : "1px solid #d1d5da",padding: "0.35rem 1.15rem",borderRadius: "6px",cursor: "pointer",fontWeight: 600,height: "44px",display: "inline-flex",flexDirection: "column",alignItems: "center",justifyContent: "center",boxSizing: "border-box",fontSize: "13px",lineHeight: 1.15}}><span>Vision SPC 📈</span><span style={{fontSize: "10px", fontWeight: 500, opacity: currentView==="vision-spc" ? 0.9 : 0.75, marginTop: "2px"}}>(Cp,Cpk분석)</span></button>
</div>
<div style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
{currentView === "projects" && <><button onClick={()=>{if(!del)return showPermissionModal("Site 관리");setModal("sites");}} style={{height: "44px", display: "inline-flex", alignItems: "center"}}>Site 관리 {!del && "🔒"}</button><button onClick={()=>{if(!del)return showPermissionModal("담당자 관리");setModal("personnel");}} style={{height: "44px", display: "inline-flex", alignItems: "center"}}>담당자 관리 {!del && "🔒"}</button></>}
</div>
</div>
{currentView === "vision-spc" ? <ErrorBoundary><VisionSPC /></ErrorBoundary> : currentView === "issues" ? <IssueManagement projects={projects} role={role} onPermissionDenied={showPermissionModal} /> : currentView === "quotations" ? <Quotations projects={projects} session={session} role={role} onPermissionDenied={showPermissionModal} /> : currentView === "manpower" ? <ManpowerManagement projects={projects} sites={sites} onSelectProject={setSelectedManpowerProject} /> : <>
{edit&&<section><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px',flexWrap:'wrap',gap:'12px'}}><div style={{display:'flex',alignItems:'center',gap:'10px',flexWrap:'wrap'}}><h2 style={{margin:0}}>{editing?"프로젝트 수정":"프로젝트 등록"}</h2>{editing&&(<div style={{display:'flex',alignItems:'center',gap:'6px'}}><span style={{fontSize:'13px',color:'#1d4ed8',fontWeight:'bold',background:'#eff6ff',padding:'3px 9px',borderRadius:'6px',border:'1px solid #bfdbfe'}}>수정 대상: {form.name||"선택됨"}</span><button type="button" onClick={()=>{setEditing(null);setForm(blank());setMilestones(newMs());setMsg("");}} style={{fontSize:'12px',padding:'4px 10px',background:'#f1f5f9',color:'#475569',border:'1px solid #cbd5e1',borderRadius:'6px',cursor:'pointer'}}>수정 취소</button></div>)}</div><div style={{border:'2px solid #38bdf8',borderRadius:'12px',padding:'6px 12px',background:'#f0f9ff',boxShadow:'0 1px 4px rgba(56, 189, 248, 0.15)'}}><div style={{textAlign:'center',marginBottom:'6px',fontSize:'13px'}}><b style={{color:'#0f172a'}}>{editing?"최신 Master Schedule 등록 (최신화)":"Master Schedule 등록"}</b>{" "}<span style={{color:'#2563eb',fontWeight:600,fontSize:'12px'}}>{editing?"※마스터 스케줄 첨부 시 일정 및 공수 데이터가 최신 버전으로 즉시 갱신됩니다":"※공수 포함 등록시 공수 통합 관리 자동 반영"}</span></div><div style={{display:'flex',gap:'8px',alignItems:'center'}}><input type="file" ref={masterPlanInput} onChange={e=>handleMasterPlanUpload(e.target.files[0])} accept=".xlsx, .xls, image/*" style={{display:'none'}}/><textarea placeholder="엑셀 표 붙여넣기 (Ctrl+V)" disabled={isExtracting} style={{height: '35px', width: '180px', padding: '8px 14px', borderRadius: '8px', border: '1.5px solid #10b981', outline: 'none', resize: 'none', overflow: 'hidden', whiteSpace: 'nowrap', boxSizing: 'border-box', fontSize: '13px', fontFamily: 'inherit', background:'#fff'}} onPaste={(e) => { const items = e.clipboardData?.items; if (items) { for (let i = 0; i < items.length; i++) { const item = items[i]; if (item.type.indexOf("image") !== -1) { e.preventDefault(); const file = item.getAsFile(); if (file) { handleMasterPlanUpload(file); return; } } } } const text = e.clipboardData?.getData("text/plain") || e.clipboardData?.getData("text"); if (text && text.trim().length > 5) { e.preventDefault(); e.target.value = ""; handleMasterPlanUpload(text); } }} /><button onClick={()=>masterPlanInput.current.click()} disabled={isExtracting} style={{background:isExtracting?'#94a3b8':'linear-gradient(135deg, #10b981, #059669)',color:'#fff',padding:'8px 16px',borderRadius:'8px',fontWeight:'bold',border:'none',boxShadow:'0 2px 5px rgba(16, 185, 129, 0.25)', height:'35px', whiteSpace:'nowrap', cursor:'pointer'}}>{isExtracting?"✨ AI 분석 중...":"✨ 파일 첨부 (Excel/이미지)"}</button></div></div></div><div className="grid"><label>제조번호<input value={form.manufacturingNo} disabled={role==="grade2"} onChange={e=>setForm({...form,manufacturingNo:e.target.value})}/></label><label>Site *<select value={form.site} disabled={role==="grade2"} onChange={e=>setForm({...form,site:e.target.value})}><option value="">선택</option>{sites.map(s=><option key={s.id}>{s.name}</option>)}</select></label><label>Line<input value={form.line} disabled={role==="grade2"} onChange={e=>setForm({...form,line:e.target.value})}/></label><label className="wide">프로젝트명 *<input value={form.name} disabled={role==="grade2"} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>시작일<input type="date" value={form.startDate} disabled={role==="grade2"} onChange={e=>setForm({...form,startDate:e.target.value})}/></label><label>종료일<input type="date" value={form.endDate} disabled={role==="grade2"} onChange={e=>setForm({...form,endDate:e.target.value})}/></label><label>상태<select value={form.status} onChange={e=>handleStatusChange(e.target.value)}>{STATUSES.map(s=><option key={s} value={s}>{s}{s==="PO대기중"?" (수동 전용)":""}</option>)}</select></label></div><div className="people"><P label="PM 담당자" field="pm" dept="PM"/><P label="설계 담당자" field="design" dept="설계"/><P label="설비기술 담당자" field="facilityTechnology" dept="설비기술"/><P label="제어 담당자" field="control" dept="제어"/><P label="비전 담당자" field="vision" dept="비전"/></div><div style={{display:'flex',gap:'12px',alignItems:'center',flexWrap:'wrap',margin:'8px 0'}}><label style={{display:'inline-flex',alignItems:'center',gap:'6px',cursor:'pointer',fontWeight:'bold',fontSize:'13px',whiteSpace:'nowrap'}}><input type="checkbox" style={{width:'auto',margin:0,cursor:'pointer'}} checked={form.autoStatus} onChange={e=>handleAutoStatusToggle(e.target.checked)}/><span>마일스톤 기준 상태 자동 계산</span></label>{form.autoStatus&&<span style={{fontSize:'12px',color:'#059669',fontWeight:'bold',whiteSpace:'nowrap'}}>(현재 계산: {computedCurrentStatus})</span>}{form.isManualStatus&&<span style={{fontSize:'12px',color:'#d97706',fontWeight:'bold',whiteSpace:'nowrap'}}>⚠️ 수동 수정 상태 (수정자: {form.manualStatusBy||currentUserName})</span>}</div>{form.isManualStatus&&<div style={{display:'flex',alignItems:'center',gap:'8px',background:'#fffbeb',border:'1px solid #fde68a',padding:'6px 12px',borderRadius:'6px',margin:'4px 0 8px',fontSize:'12px',color:'#b45309',flexWrap:'wrap'}}><span>수동 수정한 인원 이름:</span><input style={{width:'140px',padding:'4px 8px',fontSize:'12px'}} value={form.manualStatusBy} onChange={e=>setForm({...form,manualStatusBy:e.target.value})} placeholder="이름 입력" list="people-status-list"/><datalist id="people-status-list">{peopleNames.map(n=><option key={n} value={n}/>)}</datalist><span style={{fontSize:'11px',color:'#92400e'}}>* 프로젝트 목록에 '상태 확인 후 상태 변경을 해주세요' 문구와 함께 표시됩니다.</span></div>}<div style={{display:'flex',gap:'12px',alignItems:'center',flexWrap:'wrap',margin:'8px 0'}}><label style={{display:'inline-flex',alignItems:'center',gap:'6px',cursor:'pointer',fontWeight:'bold',fontSize:'13px',whiteSpace:'nowrap'}}><input type="checkbox" style={{width:'auto',margin:0,cursor:'pointer'}} checked={form.autoProgress} onChange={e=>handleAutoProgressToggle(e.target.checked)}/><span>일정 기준 진행률 자동 계산</span></label>{!form.autoProgress&&<div style={{display:'inline-flex',alignItems:'center',gap:'8px',marginLeft:'4px'}}><input type="range" min="0" max="100" value={form.progress} onChange={e=>setForm({...form,progress:e.target.value})} style={{width:'150px',cursor:'pointer'}}/><span style={{fontSize:'12px',fontWeight:'bold',color:'#0b68b5'}}>{form.progress}%</span></div>}</div> {create&&<div className="milestones"><div className="milestone-title-row"><div><h3>마일스톤</h3><p>프로젝트의 주요 단계와 기간을 입력하세요.</p></div><button type="button" className="milestone-add" onClick={addMilestoneRow}>+ 마일스톤 추가</button></div><div className="mh"><span>번호</span><b>마일스톤명</b><b>시작일</b><b>종료일</b><span>삭제</span></div>{milestones.map((m,i)=><div className="mr" key={m.id}><span>{i+1}</span><input value={m.name} placeholder="마일스톤명" onChange={e=>setMilestones(milestones.map((x,n)=>n===i?{...x,name:e.target.value}:x))}/><input type="date" value={m.startDate} onChange={e=>setMilestones(milestones.map((x,n)=>n===i?{...x,startDate:e.target.value}:x))}/><input type="date" value={m.endDate} onChange={e=>setMilestones(milestones.map((x,n)=>n===i?{...x,endDate:e.target.value}:x))}/><button type="button" className="milestone-remove" onClick={()=>removeMilestoneRow(i)} aria-label={`${i+1}번 마일스톤 삭제`}>×</button></div>)}</div>}{msg&&<p className="notice" style={{marginTop:'10px',fontWeight:'bold',color:'#059669'}}>{msg}</p>}<div style={{display:'flex',gap:'10px',alignItems:'center',marginTop:'15px',flexWrap:'wrap'}}><button className="primary" onClick={save}>{editing?"수정 저장":"프로젝트 추가"}</button>{editing&&<button type="button" onClick={()=>{setEditing(null);setForm(blank());setMilestones(newMs());setMsg("");}} style={{background:'#64748b',color:'#fff',padding:'10px 18px',borderRadius:'6px',fontWeight:'bold',border:'none',cursor:'pointer'}}>수정 취소</button>}</div></section>}
<section><div className="filterbar"><h2>일정 조회</h2><select value={siteFilter} onChange={e=>setSiteFilter(e.target.value)}><option>전체</option>{sites.map(s=><option key={s.id}>{s.name}</option>)}</select><select value={personFilter} onChange={e=>setPersonFilter(e.target.value)}><option>전체</option>{peopleNames.map(p=><option key={p}>{p}</option>)}</select><button onClick={()=>{setSiteFilter("전체");setPersonFilter("전체")}}>필터 초기화</button></div></section>
<section id="gantt-export"><div className="title"><h2>프로젝트 간트차트</h2><div className="view-actions"><span>프로젝트 상위 · 마일스톤 하위 · 오늘선</span><button className="ppt-btn" onClick={async()=>{if(isGrade1)return showPermissionModal("간트차트 PPT 내보내기");setMsg("간트차트 PPT 생성 중...");try{await exportGanttReport(view,{filter,siteFilter,personFilter,search});setMsg("간트차트 PPT를 완료했습니다.")}catch(error){setMsg("PPT 생성 실패: "+error.message)}}}>PPT 내보내기 {isGrade1 && "🔒"}</button></div></div><div className="gantt"><div className="axis"><span>{iso(gs)}</span><span>{iso(ge)}</span></div>{view.map(p=><div className="gblock" key={p.id}><div className="grow"><button className="toggle" onClick={()=>setGanttExpanded({...ganttExpanded,[p.id]:!ganttExpanded[p.id]})}>{ganttExpanded[p.id]?"▾":"▸"}</button><div className="glabel"><b style={{fontSize:'9px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'220px'}}>{p.manufacturingNo?.replace(/-[a-f0-9]{4}$/i, '')}</b><b style={{marginTop: '1px', fontSize:'9px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'220px'}}>{p.name}</b><small style={{marginTop: '1px', fontSize:'8px'}}>{p.site} · {p.line||"-"}</small></div><div className="track"><div className="projectbar" style={{left:pos(p.startDate)+"%",width:Math.min(barW(p.startDate,p.endDate),100-pos(p.startDate))+"%",background:p.projectColor}}><i style={{width:p.value+"%"}}/><span>{p.value}%</span></div><div className="today" style={{left:pos(iso())+"%"}}/></div></div>{ganttExpanded[p.id]&&p.milestones.map(m=><div className="grow sub" key={m.id}><span/><div className="glabel"><span style={{fontSize:'9px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'200px'}}>{m.name}</span><small style={{fontSize:'8px'}}>{m.startDate} ~ {m.endDate}</small></div><div className="track"><div className="msbar" style={{left:pos(m.startDate)+"%",width:Math.min(barW(m.startDate,m.endDate),100-pos(m.startDate))+"%",borderColor:p.projectColor,background:p.projectColor+"38"}}><i style={{width:pct(m.startDate,m.endDate)+"%",background:p.projectColor}}/></div><div className="today" style={{left:pos(iso())+"%"}}/></div></div>)}</div>)}</div></section>
<section id="calendar-export"><div className="calhead"><div><h2>프로젝트 일정 달력</h2><p>프로젝트 기간을 얇은 연속 막대로 표시합니다. 막대를 누르면 상세 정보가 열립니다.</p></div><div className="cal-actions"><button className="ppt-btn" onClick={async()=>{if(isGrade1)return showPermissionModal("일정 달력 PPT 내보내기");setMsg("일정 달력 PPT 생성 중...");try{await exportCalendarReport(view,month,{filter,siteFilter,personFilter,search});setMsg("일정 달력 PPT를 완료했습니다.")}catch(error){setMsg("PPT 생성 실패: "+error.message)}}}>PPT 내보내기 {isGrade1 && "🔒"}</button><button onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}>‹</button><b>{month.getFullYear()}년 {month.getMonth()+1}월</b><button onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}>›</button></div></div><div className="week">{["일","월","화","수","목","금","토"].map(x=><b key={x}>{x}</b>)}</div><div className="calendar-weeks">{Array.from({length:6},(_,weekIndex)=>{const weekDays=cells.slice(weekIndex*7,weekIndex*7+7),weekStart=iso(weekDays[0]),weekEnd=iso(weekDays[6]),weekProjects=view.filter(p=>p.startDate<=weekEnd&&p.endDate>=weekStart),lanes=weekProjects.map((p,lane)=>({p,lane,start:Math.max(0,Math.round((dt(p.startDate)-dt(weekStart))/DAY)),end:Math.min(6,Math.round((dt(p.endDate)-dt(weekStart))/DAY))}));const rowHeight = Math.max(75, lanes.length * 18 + 25); return <div className="calendar-week-row" key={weekStart} style={{height: rowHeight + 'px'}}><div className="date-cells" style={{height: rowHeight + 'px'}}>{weekDays.map(d=>{const dStr=iso(d);let dayManpower=0;view.forEach(p=>{if(p.manpower?.dailyTotal?.[dStr])dayManpower+=Number(p.manpower.dailyTotal[dStr])||0;});return <div className={monthKey(d)===monthKey(month)?"date-cell":"date-cell other"} key={dStr}><b>{d.getDate()}</b>{dayManpower>0&&<span style={{display:'inline-block',fontSize:'10px',background:dayManpower>=10?'#fee2e2':'#dbeafe',color:dayManpower>=10?'#b91c1c':'#1e40af',padding:'1px 5px',borderRadius:'10px',fontWeight:'bold',marginTop:'2px'}} title={`당일 프로젝트 투입 공수: ${dayManpower}명`}>👥 {dayManpower}명</span>}</div>})}</div><div className="event-lanes" style={{height:Math.max(24,lanes.length*18+4)}}>{lanes.map(({p,lane,start,end})=><button key={p.id} className="calendar-bar" style={{left:`${start/7*100}%`,width:`${(end-start+1)/7*100}%`,top:`${lane*18+2}px`,background:p.projectColor}} onClick={()=>setSelectedDay({date:`${weekStart} ~ ${weekEnd}`,active:[p],starts:p.startDate>=weekStart&&p.startDate<=weekEnd?[p]:[],ends:p.endDate>=weekStart&&p.endDate<=weekEnd?[p]:[]})} title={`${p.manufacturingNo?.replace(/-[a-f0-9]{4}$/i, '')} · ${p.name} · ${p.startDate}~${p.endDate}`}><span>{p.manufacturingNo?.replace(/-[a-f0-9]{4}$/i, '')} · {p.name}</span></button>)}</div></div>})}</div></section>
<section><div className="tools"><h2>프로젝트 목록</h2><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="제조번호, Site, Line, 프로젝트, 담당자 검색"/>{["전체","진행중","완료","지연"].map(x=><button key={x} className={filter===x?"active":""} onClick={()=>setFilter(x)}>{x}</button>)}</div><div style={{display:'flex',gap:'10px',alignItems:'center',padding:'0 14px 10px'}}><label style={{display:'flex',alignItems:'center',gap:'6px',cursor:'pointer',fontSize:'13px',fontWeight:'bold'}}><input type="checkbox" checked={view.length>0&&selectedProjects.size===view.length} onChange={toggleSelectAll} style={{width:'auto',margin:0,cursor:'pointer'}}/> 전체 선택</label>{selectedProjects.size>0&&<button onClick={()=>{if(!del)return showPermissionModal("프로젝트 다중 삭제");removeSelected();}} style={{background:'#ef4444',color:'#fff',border:'none',padding:'4px 10px',borderRadius:'6px',fontSize:'12px',fontWeight:'bold',cursor:'pointer'}}>선택 항목 삭제 ({selectedProjects.size}) {!del&&"🔒"}</button>}</div>{view.map(p=><article key={p.id} style={{borderLeft:`7px solid ${p.projectColor}`}}><div><h3 style={{display:'flex',alignItems:'center',gap:'8px'}}><input type="checkbox" checked={selectedProjects.has(p.id)} onChange={()=>toggleSelect(p.id)} style={{width:'16px',height:'16px',cursor:'pointer'}}/> {p.manufacturingNo?.replace(/-[a-f0-9]{4}$/i, '')} · {p.name}</h3><p>{p.site||"-"} · {p.line?`Line ${p.line}`:"-"} &nbsp;|&nbsp; PM {p.pm||"-"} · 설계 {p.design||"-"} · 설비 {p.facilityTechnology||"-"} · 제어 {p.control||"-"} · 비전 {p.vision||"-"} &nbsp;|&nbsp; {p.startDate} ~ {p.endDate} · <b style={{color:p.isManualStatus?(p.status==="PO대기중"?'#dc2626':'#d97706'):'inherit'}}>{p.status}</b></p>{p.isManualStatus&&<div style={{marginTop:'6px',display:'inline-flex',alignItems:'center',gap:'8px',backgroundColor:'#fffbeb',border:'1px solid #f59e0b',padding:'4px 9px',borderRadius:'6px',fontSize:'11px',color:'#b45309',fontWeight:'600'}}><span>⚠️ <b>수동 설정 ({p.manualStatusBy||"담당자"})</b> : 상태 확인 후 상태 변경을 해주세요</span>{edit&&p.status!=="PO대기중"&&<button type="button" onClick={()=>switchToAutoStatus(p)} style={{background:'#fef08a',border:'1px solid #fde047',color:'#854d0e',padding:'2px 7px',borderRadius:'4px',fontSize:'10px',cursor:'pointer',fontWeight:'bold'}} title="마일스톤 기반 자동 상태 계산으로 복귀">자동 상태 전환</button>}</div>}{expanded[p.id]&&<div className="detail">{p.milestones.length?p.milestones.map(m=><div key={m.id}><b>{m.name}</b><span>{m.startDate} ~ {m.endDate}</span><span>{pct(m.startDate,m.endDate)}%</span><span>{dt(m.startDate)<dt(p.startDate)?"선행 일정":dt(m.endDate)>dt(p.endDate)?"후행 일정":"프로젝트 기간 내"}</span></div>):<p>등록된 마일스톤이 없습니다.</p>}</div>}</div><div className="bar"><i style={{width:p.value+"%",background:p.projectColor}}/><b>{p.value}%</b></div><aside><button onClick={()=>setExpanded({...expanded,[p.id]:!expanded[p.id]})}>{expanded[p.id]?"마일스톤 닫기":"마일스톤 보기"}</button><button onClick={()=>setSelectedManpowerProject(p)} style={{background:p.manpower?'#eff6ff':'#f8fafc',color:p.manpower?'#1d4ed8':'#4b5563',border:p.manpower?'1px solid #bfdbfe':'1px solid #d1d5db',fontWeight:'bold'}}>공수 확인 {p.manpower?.totalManday?`(${p.manpower.totalManday}M/D)`:''}</button><button onClick={()=>{if(isGrade1)return showPermissionModal("프로젝트 수정");editProject(p);}}>수정 {isGrade1 && "🔒"}</button><button onClick={()=>{if(!del)return showPermissionModal("프로젝트 삭제");remove(p.id);}} style={{color:del?'inherit':'#9ca3af'}}>삭제 {!del && "🔒"}</button></aside></article>)}</section>
{selectedDay&&<div className="back" onMouseDown={()=>setSelectedDay(null)}><div className="modal" onMouseDown={e=>e.stopPropagation()}><button className="close" onClick={()=>setSelectedDay(null)}>×</button><h2>{selectedDay.date} 프로젝트</h2><div className="day-summary">진행 {selectedDay.active.length} · 착수 {selectedDay.starts.length} · 종료 {selectedDay.ends.length}</div>{selectedDay.active.map(p=><div className="dayevent" key={p.id}><i style={{background:p.projectColor}}/><b>{p.manufacturingNo?.replace(/-[a-f0-9]{4}$/i, '')} · {p.name}</b><span>{p.site} · {p.line||"Line 미입력"}</span><span>{p.startDate} ~ {p.endDate}</span></div>)}</div></div>}
</>}{modal&&<div className="back" onMouseDown={()=>setModal(null)}><div className="modal" onMouseDown={e=>e.stopPropagation()}><button className="close" onClick={()=>setModal(null)}>×</button>{modal==="users"&&<><h2>사용자 계정·권한 관리</h2>{users.map(u=><div className="user" key={u.id}><span>{u.email}</span><select value={u.role} disabled={u.email==="cmj1012@twgroup.co.kr"} onChange={e=>updateUser(u.id,{role:e.target.value})}><option value="admin">관리자</option><option value="grade3">Grade3</option><option value="grade2">Grade2</option><option value="grade1">Grade1</option></select><label><input type="checkbox" checked={u.active} disabled={u.email==="cmj1012@twgroup.co.kr"} onChange={e=>updateUser(u.id,{active:e.target.checked})}/>활성</label></div>)}</>}{modal==="sites"&&<Manage title="Site" rows={sites} value={newSite} setValue={setNewSite} add={()=>add("sites")} trash={r=>trash("sites",r)}/>} {modal==="personnel"&&<><h2>담당자 관리</h2><div className="add"><select value={newDept} onChange={e=>setNewDept(e.target.value)}>{DEPTS.map(d=><option key={d}>{d}</option>)}</select><input value={newPerson} onChange={e=>setNewPerson(e.target.value)}/><button onClick={()=>add("personnel")}>추가</button></div>{DEPTS.map(d=><div key={d}><b>{d}</b><div className="tags">{people.filter(p=>p.department===d).map(p=><button key={p.id} onContextMenu={e=>{e.preventDefault();trash("personnel",p)}}>{p.name}</button>)}</div></div>)}</>}</div></div>}
{permissionModal&&<div className="back" onMouseDown={()=>setPermissionModal(null)} style={{zIndex:9999}}><div className="modal" onMouseDown={e=>e.stopPropagation()} style={{maxWidth:'440px',textAlign:'center',padding:'28px 24px',borderRadius:'16px',boxShadow:'0 20px 25px -5px rgba(0,0,0,0.2)'}}><div style={{width:'56px',height:'56px',borderRadius:'28px',background:'#fef2f2',color:'#ef4444',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px',fontSize:'26px'}}>🔒</div><h3 style={{margin:'0 0 10px',fontSize:'19px',color:'#111827',fontWeight:'bold'}}>접근 권한 제한 안내</h3><p style={{margin:'0 0 14px',fontSize:'14px',color:'#4b5563',lineHeight:'1.6'}}><b style={{color:'#dc2626'}}>[{permissionModal.feature}]</b> 기능은 현재 등급에서 이용할 수 없습니다.<br/>해당 기능을 이용하시려면 <b>운영자에게 권한을 부여</b>받으시기 바랍니다.</p><div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:'10px',padding:'12px 16px',marginBottom:'14px',textAlign:'left',fontSize:'13px',color:'#334155'}}><div style={{fontWeight:'bold',color:'#0f172a',marginBottom:'6px',display:'flex',alignItems:'center',gap:'6px',fontSize:'12px'}}><span>📌</span><span>권한 부여 및 시스템 문의</span></div><div style={{display:'flex',flexDirection:'column',gap:'4px',fontSize:'12px',lineHeight:'1.5'}}><div>• <b>담당자</b>: 조민재 선임</div><div>• <b>E-mail</b>: cmj1012@twgroup.co.kr</div><div>• <b>Tel</b>: +82 10 5506 8739</div></div></div><div style={{background:'#f9fafb',border:'1px solid #e5e7eb',borderRadius:'8px',padding:'9px 14px',marginBottom:'18px',fontSize:'12px',color:'#6b7280',display:'flex',justifyContent:'space-between',alignItems:'center'}}><span>로그인: <b>{session?.user?.email}</b></span><span style={{background:'#e0e7ff',color:'#4338ca',padding:'2px 8px',borderRadius:'12px',fontWeight:'bold',fontSize:'11px'}}>{(role||'grade1').toUpperCase()}</span></div><button onClick={()=>setPermissionModal(null)} style={{width:'100%',padding:'11px',background:'linear-gradient(135deg, #1f6feb, #1152b3)',color:'#fff',fontSize:'14px',fontWeight:'bold',border:'none',borderRadius:'8px',cursor:'pointer'}}>확인</button></div></div>}
{selectedManpowerProject&&<ProjectManpowerModal project={selectedManpowerProject} onClose={()=>setSelectedManpowerProject(null)}/>}</main>}
function Manage({title,rows,value,setValue,add,trash}){return <><h2>{title} 관리</h2><div className="add"><input value={value} onChange={e=>setValue(e.target.value)}/><button onClick={add}>추가</button></div><p>항목을 우클릭하여 삭제하세요.</p><div className="tags">{rows.map(r=><button key={r.id} onContextMenu={e=>{e.preventDefault();trash(r)}}>{r.name}</button>)}</div></>}
