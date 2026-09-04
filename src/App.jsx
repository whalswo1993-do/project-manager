import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { supabase } from "./supabase";
import Login from "./Login";

const DAY = 86400000;
const iso = (d = new Date()) => d.toISOString().slice(0, 10);
const parse = (s) => new Date(`${s}T00:00:00`);
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const blank = () => ({ manufacturingNo:"", site:"", name:"", pm:"", design:"", facilityTechnology:"", control:"", vision:"", startDate:iso(), endDate:iso(new Date(Date.now()+7*DAY)), status:"진행예정", progress:0, autoProgress:true, milestones:[] });
const toDb = (p) => ({ id:p.id, manufacturing_no:p.manufacturingNo.trim(), site:p.site, name:p.name.trim(), manager:p.pm.trim(), pm:p.pm.trim(), design:p.design.trim(), facility_technology:p.facilityTechnology.trim(), control:p.control.trim(), vision:p.vision.trim(), start_date:p.startDate, end_date:p.endDate, status:p.status, progress:Number(p.progress)||0, auto_progress:p.autoProgress, milestones:p.milestones||[] });
const fromDb = (p) => ({ id:p.id, manufacturingNo:p.manufacturing_no||"", site:p.site||"", name:p.name||"", pm:p.pm||p.manager||"", design:p.design||"", facilityTechnology:p.facility_technology||"", control:p.control||"", vision:p.vision||"", startDate:p.start_date, endDate:p.end_date, status:p.status, progress:p.progress||0, autoProgress:p.auto_progress??true, milestones:p.milestones||[] });
const progressOf = (p) => p.status==="완료" ? 100 : !p.autoProgress ? Number(p.progress)||0 : Math.max(0,Math.min(100,Math.round((parse(iso())-parse(p.startDate))/Math.max(DAY,parse(p.endDate)-parse(p.startDate))*100)));

export default function App() {
  const [session,setSession]=useState(null), [loading,setLoading]=useState(true), [profile,setProfile]=useState(null);
  const [users,setUsers]=useState([]), [projects,setProjects]=useState([]), [sites,setSites]=useState([]), [personnel,setPersonnel]=useState([]);
  const [form,setForm]=useState(blank()), [editing,setEditing]=useState(null), [filter,setFilter]=useState("전체"), [search,setSearch]=useState(""), [message,setMessage]=useState("");
  const [newSite,setNewSite]=useState(""), [newPerson,setNewPerson]=useState(""), [msName,setMsName]=useState(""), [msDate,setMsDate]=useState(iso());

  useEffect(() => {
    supabase.auth.getSession().then(({data}) => { setSession(data.session); setLoading(false); });
    const {data} = supabase.auth.onAuthStateChange((_event,next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => { if(session) boot(); else { setProfile(null); setProjects([]); } }, [session]);

  async function boot() {
    const {data:p,error} = await supabase.from("profiles").select("*").eq("id",session.user.id).single();
    if(error) return setMessage(error.message);
    setProfile(p);
    await Promise.all([loadProjects(),loadSites(),loadPersonnel()]);
    if(p.role==="admin") await loadUsers();
  }
  async function loadProjects() { const {data,error}=await supabase.from("projects").select("*").order("created_at",{ascending:false}); if(error)setMessage(error.message); else setProjects((data||[]).map(fromDb)); }
  async function loadSites() { const {data,error}=await supabase.from("sites").select("*").order("name"); if(error)setMessage(error.message); else setSites(data||[]); }
  async function loadPersonnel() { const {data,error}=await supabase.from("personnel").select("*").order("name"); if(error)setMessage(error.message); else setPersonnel(data||[]); }
  async function loadUsers() { const {data,error}=await supabase.from("profiles").select("*").order("email"); if(error)setMessage(error.message); else setUsers(data||[]); }

  const role=profile?.role;
  const canCreate=["admin","grade3"].includes(role), canEdit=["admin","grade3","grade2"].includes(role), canDelete=["admin","grade3"].includes(role);
  const enriched=useMemo(()=>projects.map(p=>({...p,value:progressOf(p),overdue:p.status!=="완료"&&parse(p.endDate)<parse(iso())})),[projects]);
  const visible=enriched.filter(p=>{
    const text=[p.manufacturingNo,p.site,p.name,p.pm,p.design,p.facilityTechnology,p.control,p.vision].join(" ").toLowerCase();
    return text.includes(search.toLowerCase())&&(filter==="전체"||(filter==="완료"&&p.status==="완료")||(filter==="진행중"&&p.status!=="완료")||(filter==="지연"&&p.overdue));
  });

  async function addSite() {
    const name=newSite.trim();
    if(!name) return setMessage("추가할 Site명을 입력하세요.");
    const {data,error}=await supabase.from("sites").insert({name,created_by:session.user.id}).select().single();
    if(error) { setMessage(error.code==="23505"?"이미 등록된 Site입니다.":error.message); return; }
    await loadSites(); setForm({...form,site:data.name}); setNewSite(""); setMessage("Site를 추가했습니다.");
  }
  async function addPerson() {
    const name=newPerson.trim();
    if(!name) return setMessage("추가할 담당자 이름을 입력하세요.");
    const {error}=await supabase.from("personnel").insert({name,created_by:session.user.id});
    if(error) { setMessage(error.code==="23505"?"이미 등록된 담당자입니다.":error.message); return; }
    await loadPersonnel(); setNewPerson(""); setMessage("담당자를 목록에 추가했습니다.");
  }
  function addMilestone() { if(!msName.trim()||!msDate)return; setForm(f=>({...f,milestones:[...f.milestones,{id:uid(),name:msName.trim(),date:msDate}]})); setMsName(""); }
  async function save() {
    if(!canEdit) return;
    if(!editing&&!canCreate) return setMessage("Grade2는 새 프로젝트를 만들 수 없습니다.");
    if(!form.manufacturingNo.trim()||!form.site||!form.name.trim()) return setMessage("제조번호, Site, 프로젝트명은 필수입니다.");
    if(parse(form.endDate)<parse(form.startDate)) return setMessage("종료일을 확인하세요.");
    let error;
    if(editing && role==="grade2") ({error}=await supabase.from("projects").update({status:form.status,progress:Number(form.progress)||0,auto_progress:form.autoProgress}).eq("id",editing));
    else {
      const row={...form,id:editing||uid()};
      ({error}=editing?await supabase.from("projects").update(toDb(row)).eq("id",editing):await supabase.from("projects").insert(toDb(row)));
    }
    if(error) { setMessage(error.code==="23505"?"이미 사용 중인 제조번호입니다.":error.message); return; }
    setForm(blank()); setEditing(null); setMessage("저장했습니다."); await loadProjects();
  }
  function edit(p) { if(!canEdit)return; setEditing(p.id); setForm({...p,progress:p.value}); window.scrollTo({top:0,behavior:"smooth"}); }
  async function remove(id) { if(!canDelete||!confirm("삭제할까요?"))return; const {error}=await supabase.from("projects").delete().eq("id",id); if(error)setMessage(error.message); else loadProjects(); }
  async function setRole(id,nextRole) { const {error}=await supabase.from("profiles").update({role:nextRole}).eq("id",id); if(error)setMessage(error.message); else loadUsers(); }
  function csv() { const esc=v=>`"${String(v??"").replaceAll('"','""')}"`; const rows=[["제조번호","Site","프로젝트명","PM 담당자","설계 담당자","설비기술 담당자","제어 담당자","비전 담당자","시작일","종료일","상태","진행률"],...visible.map(p=>[p.manufacturingNo,p.site,p.name,p.pm,p.design,p.facilityTechnology,p.control,p.vision,p.startDate,p.endDate,p.status,`${p.value}%`])]; const u=URL.createObjectURL(new Blob(["\ufeff"+rows.map(r=>r.map(esc).join(",")).join("\r\n")],{type:"text/csv"})); const a=document.createElement("a"); a.href=u;a.download=`프로젝트_${iso()}.csv`;a.click();URL.revokeObjectURL(u); }

  if(loading)return <div className="center">로그인 확인 중...</div>;
  if(!session)return <Login/>;
  if(!profile)return <div className="center">사용자 권한 확인 중... {message}</div>;

  return <main>
    <header><div><b>TEAM PROJECT HUB</b><h1>프로젝트 일정 관리</h1><p>{session.user.email} · {role}</p></div><div><button onClick={csv}>CSV</button><button onClick={()=>supabase.auth.signOut()}>로그아웃</button></div></header>
    {role==="admin"&&<section><h2>사용자 권한 관리</h2><div className="users">{users.map(u=><div key={u.id}><span>{u.email}</span><select value={u.role} disabled={u.email==="cmj1012@twgroup.co.kr"} onChange={e=>setRole(u.id,e.target.value)}><option value="admin">관리자</option><option value="grade3">Grade3</option><option value="grade2">Grade2</option><option value="grade1">Grade1</option></select></div>)}</div></section>}
    {canEdit&&<section><h2>{editing?"프로젝트 수정":"새 프로젝트"}</h2>
      <div className="project-grid">
        <label>제조번호 *<input value={form.manufacturingNo} disabled={role==="grade2"} onChange={e=>setForm({...form,manufacturingNo:e.target.value})}/></label>
        <label>Site *<select value={form.site} disabled={role==="grade2"} onChange={e=>setForm({...form,site:e.target.value})}><option value="">선택</option>{sites.map(s=><option key={s.id}>{s.name}</option>)}</select></label>
        <label className="wide">프로젝트명 *<input value={form.name} disabled={role==="grade2"} onChange={e=>setForm({...form,name:e.target.value})}/></label>
        <label>PM 담당자<select value={form.pm} disabled={role==="grade2"} onChange={e=>setForm({...form,pm:e.target.value})}><option value="">선택</option>{personnel.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}</select></label>
        <label>설계 담당자<select value={form.design} disabled={role==="grade2"} onChange={e=>setForm({...form,design:e.target.value})}><option value="">선택</option>{personnel.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}</select></label>
        <label>설비기술 담당자<select value={form.facilityTechnology} disabled={role==="grade2"} onChange={e=>setForm({...form,facilityTechnology:e.target.value})}><option value="">선택</option>{personnel.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}</select></label>
        <label>제어 담당자<select value={form.control} disabled={role==="grade2"} onChange={e=>setForm({...form,control:e.target.value})}><option value="">선택</option>{personnel.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}</select></label>
        <label>비전 담당자<select value={form.vision} disabled={role==="grade2"} onChange={e=>setForm({...form,vision:e.target.value})}><option value="">선택</option>{personnel.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}</select></label>
        <label>시작일<input type="date" value={form.startDate} disabled={role==="grade2"} onChange={e=>setForm({...form,startDate:e.target.value})}/></label>
        <label>종료일<input type="date" value={form.endDate} disabled={role==="grade2"} onChange={e=>setForm({...form,endDate:e.target.value})}/></label>
        <label>상태<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option>진행예정</option><option>진행중</option><option>보류</option><option>완료</option></select></label>
      </div>
      {canCreate&&<div className="site-add"><input placeholder="새 Site명" value={newSite} onChange={e=>setNewSite(e.target.value)}/><button onClick={addSite}>Site 목록에 추가</button></div>}
      {canCreate&&<div className="site-add"><input placeholder="새 담당자 이름" value={newPerson} onChange={e=>setNewPerson(e.target.value)}/><button onClick={addPerson}>담당자 목록에 추가</button></div>}
      <label className="check"><input type="checkbox" checked={form.autoProgress} onChange={e=>setForm({...form,autoProgress:e.target.checked})}/> 자동 진행률</label>
      {!form.autoProgress&&<input type="range" min="0" max="100" value={form.progress} onChange={e=>setForm({...form,progress:e.target.value})}/>} 
      {canCreate&&<div className="milestones"><input placeholder="마일스톤" value={msName} onChange={e=>setMsName(e.target.value)}/><input type="date" value={msDate} onChange={e=>setMsDate(e.target.value)}/><button onClick={addMilestone}>추가</button></div>}
      <button className="primary" onClick={save}>{editing?"수정 저장":"프로젝트 추가"}</button>
    </section>}
    <section><div className="tools"><h2>프로젝트 목록</h2><input placeholder="제조번호, Site, 프로젝트명, 담당자 검색" value={search} onChange={e=>setSearch(e.target.value)}/>{["전체","진행중","완료","지연"].map(x=><button className={filter===x?"active":""} onClick={()=>setFilter(x)} key={x}>{x}</button>)}</div>{message&&<p className="notice">{message}</p>}
      <div className="cards">{visible.map(p=><article key={p.id}><div><h3>{p.manufacturingNo||"제조번호 미등록"} · {p.name}</h3><p><b>Site</b> {p.site||"-"}</p><p><b>PM 담당자</b> {p.pm||"-"} · <b>설계 담당자</b> {p.design||"-"} · <b>설비기술 담당자</b> {p.facilityTechnology||"-"} · <b>제어 담당자</b> {p.control||"-"} · <b>비전 담당자</b> {p.vision||"-"}</p><p>{p.startDate} ~ {p.endDate} · {p.status}</p></div><div className="progress"><i style={{width:`${p.value}%`}}/><b>{p.value}%</b></div><div>{canEdit&&<button onClick={()=>edit(p)}>수정</button>}{canDelete&&<button className="danger" onClick={()=>remove(p.id)}>삭제</button>}</div></article>)}</div>
    </section>
  </main>;
}
