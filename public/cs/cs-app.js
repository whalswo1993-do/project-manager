const APP_VERSION='5.68';
const MAIN_DB_STORE='app_state';
const MAIN_DB_RECORD='main';
let db={};
function isSoftwareModification(projectOrType,model=''){const type=typeof projectOrType==='string'?projectOrType:projectOrType?.projectType,modelText=typeof projectOrType==='string'?model:projectOrType?.changeoverModel;return String(type||'').trim()==='개조'&&/(PLC|비전)/i.test(String(modelText||''))}
function projectRequiresMaterial(projectOrType,model=''){if(typeof projectOrType==='object'&&projectOrType?.materialRegistrationOverride===true)return true;return !isSoftwareModification(projectOrType,model)}
function materialUsageForProject(projectOrType,model=''){return projectRequiresMaterial(projectOrType,model)?'자재관리':'자재 완료'}

const SITE_COLOR_PRESETS=[
 ['빨','#f8d7da','빨강'],['주','#fde2c5','주황'],['노','#fff3bf','노랑'],['라','#f3e6bd','라임'],['연','#e8f3cf','연두'],
 ['초','#d9f2df','초록'],['청','#d5f0e8','청록'],['민','#d8f3f1','민트'],['하','#dbeffa','하늘'],['파','#d9eaff','파랑'],
 ['남','#dcdff8','남색'],['보','#eadcf8','보라'],['분','#f8dced','분홍'],['갈','#eadfd5','갈색'],['회','#e3e7e9','회색'],
 ['산','#ffc9c9','산호'],['복','#ffd8c2','복숭아'],['크','#fff0c2','크림'],['올','#e5e6b8','올리브'],['숲','#ccedc8','숲 연두'],
 ['에','#c8ead8','에메랄드'],['아','#c5eef0','아쿠아'],['코','#ccd9f6','코발트'],['벤','#ddd2f4','라벤더'],['자','#f0cce5','자주']
];
const SITE_COLOR_PALETTE=SITE_COLOR_PRESETS.map(x=>x[1]);
function defaultSiteColor(id=''){let h=0;for(const c of String(id))h=(h*31+c.charCodeAt(0))>>>0;return SITE_COLOR_PALETTE[h%SITE_COLOR_PALETTE.length]}

function ensureDatabaseShape(){
 ['projects','tasks','issues','materials','packaging','contacts','sites','sko','specs','shipping','effort','dailyReports'].forEach(key=>{if(!Array.isArray(db[key]))db[key]=[]});
 db.projects.forEach(p=>{
  p.projectNo=p.projectNo||p.id;p.manpower=p.manpower||[];p.milestones=p.milestones||[];p.bomItems=p.bomItems||[];p.captures=p.captures||[];
  p.dataSheet=p.dataSheet||[];p.pptPasteItems=p.pptPasteItems||[];p.pptPages=p.pptPages||[];p.attachments=p.attachments||[];
  if(!p.projectType||p.projectType==='형교환')p.projectType='기존 형교환';
  p.materialUsage=materialUsageForProject(p);
  if(!p.siteId){const r=(p.region||'').toLowerCase();p.siteId=r.includes('미국')||r.includes('usa')?'SITE-US':r.includes('헝가리')?'SITE-HU':r.includes('중국')?'SITE-CN':'SITE-KR'}
 });
 db.sites.forEach(s=>{s.groupName=s.id;s.name=s.id;s.color=s.color||defaultSiteColor(s.id)});
 db.tasks.forEach(t=>{if(!t.siteId){const p=db.projects.find(x=>x.id===t.project);t.siteId=p?.siteId||'SITE-KR'}});
}
async function initializeMainStorage(){
 updateStorageModeStatus('Supabase 확인 중…');
 if(!csStore.remote()){
  document.body.innerHTML='<div style="padding:40px;text-align:center;color:var(--ink-2)">CS 통합 관리는 프로젝트 매니저 앱 안에서 열어 주세요.</div>';
  return false;
 }
 try{
  const stored=await readMainDataDB();
  db=stored||{};
  ensureDatabaseShape();
  if(!stored)await writeMainDataDB(databaseSnapshot());
  updateStorageModeStatus('저장: Supabase ✓');
  mainStorageReady=true;
  return true;
 }catch(e){
  console.error('Supabase 초기화 실패',e);
  ensureDatabaseShape();mainStorageReady=false;
  updateStorageModeStatus('Supabase 연결 실패',true);
  alert('Supabase에서 CS 데이터를 불러오지 못했습니다. 이 상태에서는 저장되지 않습니다. 새로고침하거나 관리자에게 문의해 주세요. ('+e.message+')');
  return false;
 }
}

const APP_TITLE='TW CS팀 통합 관리 프로그램';
function buildNavItems(){
 return [
  ['dashboard','Dashboard'],
  ['materialHub','자재현황 조회'],
  ['projects','① 형교환·개조 PJT 관리'],
  ['tasks','② CS 업무 일정'],
  ['effort','③ CS 투입공수'],
  ['sites','④ Site 관리'],

 ];
}
let navItems=buildNavItems();
let dashboardProjectJumpFilter='';
let dashboardTaskJumpFilter='';
let mainStorageReady=false;
let mainStorageSaveChain=Promise.resolve();
let mainStorageErrorShown=false;
function updateStorageModeStatus(text,isError=false){const el=document.getElementById('storageModeStatus');if(!el)return;el.textContent=text;el.style.color=isError?'var(--danger)':''}
function openMainDataDB(){return Promise.resolve(csStore.facade())}
async function readMainDataDB(){
 const dbx=await openMainDataDB();
 return new Promise((resolve,reject)=>{
  const req=dbx.transaction(MAIN_DB_STORE,'readonly').objectStore(MAIN_DB_STORE).get(MAIN_DB_RECORD);
  req.onsuccess=()=>{dbx.close();resolve(req.result?.data||null)};
  req.onerror=()=>{dbx.close();reject(req.error||new Error('Supabase 데이터를 읽지 못했습니다.'))};
 });
}
async function writeMainDataDB(data){
 const dbx=await openMainDataDB();
 return new Promise((resolve,reject)=>{
  const tx=dbx.transaction(MAIN_DB_STORE,'readwrite');
  tx.objectStore(MAIN_DB_STORE).put({id:MAIN_DB_RECORD,data,appVersion:APP_VERSION,updatedAt:new Date().toISOString()});
  tx.oncomplete=()=>{dbx.close();resolve()};
  tx.onerror=()=>{dbx.close();reject(tx.error||new Error('Supabase 저장에 실패했습니다.'))};
  tx.onabort=()=>{dbx.close();reject(tx.error||new Error('Supabase 저장이 중단되었습니다.'))};
 });
}
function databaseSnapshot(){return typeof structuredClone==='function'?structuredClone(db):JSON.parse(JSON.stringify(db))}
function save(){
 try{
  if(!mainStorageReady)return true;
  const snapshot=databaseSnapshot();
  updateStorageModeStatus('Supabase 저장 중…');
  mainStorageSaveChain=mainStorageSaveChain.catch(()=>{}).then(()=>writeMainDataDB(snapshot)).then(()=>{
   mainStorageErrorShown=false;updateStorageModeStatus('저장: Supabase ✓');
  }).catch(e=>{
   console.error('Supabase 저장 실패',e);updateStorageModeStatus('Supabase 저장 오류',true);
   if(!mainStorageErrorShown){mainStorageErrorShown=true;alert('데이터 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.\n\n'+e.message)}
  });
  return true;
 }catch(e){console.error(e);alert('데이터 저장 준비 중 오류가 발생했습니다.\n'+e.message);return false}
}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function badge(s){let c=s==='완료'||s==='Closed'?'b-done':(s==='위험'||s==='High'?'b-high':(s==='진행'||s==='Root Cause'||s==='Containment'?'b-run':'b-pre'));return `<span class="badge ${c}">${esc(s)}</span>`}
function projectName(id){const p=db.projects.find(x=>x.id===id);return p?.projectNo||p?.id||id}
function renderNav(){function renderNav(){navItems=buildNavItems();document.getElementById('nav').innerHTML=navItems.map(x=>`<button data-v="${x[0]}" onclick="show('${x[0]}')">${x[1]}</button>`).join('');}
renderNav();setActive('dashboard')}
function setActive(v){document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.v===v));document.querySelectorAll('.view').forEach(s=>s.classList.toggle('active',s.id===v))}
function show(v){if(v==='projects')dashboardProjectJumpFilter='';if(v==='tasks')dashboardTaskJumpFilter='';setActive(v);({dashboard:()=>{renderDashboard();loadMaterialDashboardData(true)},materialHub:()=>openMaterialStatus(),projects:renderProjects,tasks:renderTasks,effort:renderEffort,sites:renderSites}[v]||(()=>{}))()}

function siteGroupName(id){return String(id||'').trim()}
function siteName(id){return String(id||'').trim()}
function sitePrimaryName(id){return String(id||'').trim()}
function siteColor(id){
 const s=db.sites.find(x=>x.id===id);
 const color=s?.color||defaultSiteColor(id);
 return /^#[0-9a-f]{6}$/i.test(color)?color:defaultSiteColor(id);
}
function siteTint(id){return siteColor(id)+'42'}
function siteColorOptions(current){return SITE_COLOR_PRESETS.map(([,color],i)=>`<option value="${color}" ${current===color?'selected':''} style="background:${color}">색상 ${i+1}</option>`).join('')}
function siteColorSelect(current,attrs=''){return `<select class="site-color-select" ${attrs} style="background:${current}" onchange="this.style.background=this.value;${attrs.includes('data-site-id')?`quickChangeSiteColor(this.dataset.siteId,this.value)`:''}">${siteColorOptions(current)}</select>`}
function siteRowAttrs(id,extraClass=''){
 return `class="site-tint-row ${extraClass}" style="--site-color:${siteColor(id)};--site-tint:${siteTint(id)}"`;
}
function decorateSiteRows(){
 const tableIds=['projectTable','projectsTable','tasksTable','dailyReportTable','skoTable','specTable','shippingTable','effortTable','sitesTable'];
 const ids=[...db.sites].map(s=>s.id).filter(Boolean).sort((a,b)=>b.length-a.length);
 tableIds.forEach(tableId=>{
   const body=document.getElementById(tableId);if(!body)return;
   body.querySelectorAll('tr').forEach(row=>{
     const first=row.cells?.[0];if(!first)return;
     const selected=first.querySelector('select')?.value||'';
     const text=(first.textContent||'').trim();
     const id=selected||ids.find(siteId=>text.startsWith(siteId));
     if(!id)return;
     row.classList.add('site-tint-row');
     row.style.setProperty('--site-color',siteColor(id));
     row.style.setProperty('--site-tint',siteTint(id));
     const badge=first.querySelector('.badge,.site-color-badge');
     if(badge){badge.classList.add('site-color-badge');badge.style.background=siteColor(id);}
   });
 });
}
let siteColorObserver;
function startSiteColorObserver(){
 if(siteColorObserver)return;
 siteColorObserver=new MutationObserver(()=>requestAnimationFrame(decorateSiteRows));
 document.querySelectorAll('tbody').forEach(body=>siteColorObserver.observe(body,{childList:true,subtree:true}));
 decorateSiteRows();
}
function siteCell(id,badgeStyle=false){
 const primary=esc(sitePrimaryName(id));
 const main=badgeStyle?`<span class="site-color-badge" style="background:${siteColor(id)}">${primary}</span>`:`<b>${primary}</b>`;
 return main;
}
function siteOptions(selected='',includeBlank=true){
 const opts=db.sites.filter(s=>s.active!=='비활성').map(s=>`<option value="${esc(s.id)}" ${s.id===selected?'selected':''}>${esc(s.id)}</option>`).join('');
 return (includeBlank?`<option value="" ${!selected?'selected':''}>Site 선택 / 미지정</option>`:'')+opts;
}
function syncSiteToLinkedData(siteId){
 const s=db.sites.find(x=>x.id===siteId);
 if(!s)return;
 (db.projects||[]).forEach(p=>{
   if(p.siteId===siteId){
     p.oem=s.oem||'';
     p.region=s.region||'';
   }
 });
 (db.dailyReports||[]).forEach(r=>{
   const p=(db.projects||[]).find(x=>x.id===r.projectId);
   if(p?.siteId===siteId)r.site=s.id;
 });
}
function renameSiteId(oldId,newId){
 if(!oldId||oldId===newId)return;
 ['projects','tasks','sko','specs','shipping','effort'].forEach(type=>{
   (db[type]||[]).forEach(row=>{if(row.siteId===oldId)row.siteId=newId;});
 });
 (db.dailyReports||[]).forEach(r=>{
   const p=(db.projects||[]).find(x=>x.id===r.projectId);
   if(p?.siteId===newId||r.site===oldId)r.site=newId;
 });
}
function applyProjectSiteDefaults(){
 const s=db.sites.find(x=>x.id===val('f_site'));
 if(!s)return;
 const oem=document.getElementById('f_oem');
 const region=document.getElementById('f_region');
 if(oem)oem.value=s.oem||'';
 if(region)region.value=s.region||'';
}
function fillSiteFilters(){['skoSite','specSite','shipSite','effortSite'].forEach(id=>{let el=document.getElementById(id);if(el){let old=el.value;el.innerHTML='<option value="">전체 Site</option>'+siteOptions(old,false);if([...el.options].some(o=>o.value===old))el.value=old;}})}
function projectNo(id){let p=db.projects.find(x=>x.id===id);return p?.projectNo||p?.id||id||''}
function dateDays(a,b){if(!a||!b)return 0;return Math.max(0,Math.round((new Date(b)-new Date(a))/86400000)+1)}




function renderEffort(){fillSiteFilters();let q=(document.getElementById('effortSearch')?.value||'').toLowerCase(),s=document.getElementById('effortSite')?.value||'';let arr=db.effort.filter(x=>(!s||x.siteId===s)&&(!q||JSON.stringify(x).toLowerCase().includes(q)));arr.sort((a,b)=>siteName(a.siteId).localeCompare(siteName(b.siteId),'ko')||String(a.projectNo||'').localeCompare(String(b.projectNo||''),'ko',{numeric:true})||String(a.owner||'').localeCompare(String(b.owner||''),'ko'));let plan=arr.reduce((a,x)=>a+(+x.planHours||0),0),actual=arr.reduce((a,x)=>a+(+x.actualHours||0),0),people=new Set(arr.map(x=>x.owner).filter(Boolean)).size;document.getElementById('effortKpi').innerHTML=[['투입 인원',people],['계획 공수',plan+' h'],['실적 공수',actual+' h'],['공수 차이',(actual-plan)+' h']].map(x=>`<div class="card"><div class="muted">${x[0]}</div><div class="metric">${x[1]}</div></div>`).join('');document.getElementById('effortTable').innerHTML=arr.map(x=>{let d=dateDays(x.inDate,x.outDate),total=d*(+x.dailyHours||0),diff=(+x.actualHours||0)-(+x.planHours||0);return `<tr><td ondblclick="openSiteDetail('${x.siteId}')" title="더블클릭: Site 상세/편집" style="cursor:pointer"><b><span class="badge b-run">${esc(siteName(x.siteId))}</span></b></td><td>${esc(x.projectNo)}</td><td>${esc(x.owner)}</td><td>${esc(x.role)}</td><td>${esc(x.type)}</td><td>${esc(x.inDate)}</td><td>${esc(x.outDate)}</td><td>${d}</td><td>${esc(x.dailyHours)}</td><td>${total}</td><td>${esc(x.reentry)}</td><td>${esc(x.round)}</td><td>${esc(x.planHours)}</td><td>${esc(x.actualHours)}</td><td>${diff}</td><td><button onclick="editEffort('${x.id}')">편집</button></td></tr>`}).join('')||'<tr><td colspan="16" class="muted" style="padding:20px;text-align:center">등록된 CS 투입공수가 없습니다.</td></tr>'}
function effortForm(x={}){return `<div class="formgrid"><label>Site (대분류)<select id="f_site">${siteOptions(x.siteId)}</select><span class="small muted">Site를 먼저 선택하세요.</span></label><label>PJT No.<input id="f_pno" value="${esc(x.projectNo)}"><span class="small muted">선택한 Site 안의 프로젝트 번호</span></label><label>담당자<input id="f_owner" value="${esc(x.owner)}"></label><label>역할<input id="f_role" value="${esc(x.role)}"></label><label>업무구분<input id="f_type" value="${esc(x.type)}"></label><label>투입 시작일<input id="f_in" type="date" value="${x.inDate||''}"></label><label>투입 종료일<input id="f_out" type="date" value="${x.outDate||''}"></label><label>일 투입시간<input id="f_daily" type="number" step="0.5" value="${x.dailyHours??8}"></label><label>재투입<select id="f_reentry"><option ${x.reentry==='N'?'selected':''}>N</option><option ${x.reentry==='Y'?'selected':''}>Y</option></select></label><label>재투입 차수<input id="f_round" type="number" min="0" value="${x.round??0}"></label><label>계획공수(h)<input id="f_planHours" type="number" step="0.5" value="${x.planHours??0}"></label><label>실적공수(h)<input id="f_actualHours" type="number" step="0.5" value="${x.actualHours??0}"></label><label class="span2">업무내용<textarea id="f_work">${esc(x.work)}</textarea></label></div>`}
function newEffort(){modal('CS 투입공수 등록',effortForm(),`saveEffort()`)}
function editEffort(id){let x=db.effort.find(v=>v.id===id);modal('CS 투입공수 편집',effortForm(x),`saveEffort('${id}')`,`deleteItem('effort','${id}')`)}
function saveEffort(id){if(!val('f_site'))return alert('Site를 먼저 선택해야 저장할 수 있습니다.');if(!val('f_pno').trim())return alert('선택한 Site 안의 PJT No.를 입력하세요.');let x=id?db.effort.find(v=>v.id===id):{id:'EF-'+Date.now()};Object.assign(x,{projectNo:val('f_pno'),siteId:val('f_site'),owner:val('f_owner'),role:val('f_role'),type:val('f_type'),inDate:val('f_in'),outDate:val('f_out'),dailyHours:+val('f_daily'),reentry:val('f_reentry'),round:+val('f_round'),planHours:+val('f_planHours'),actualHours:+val('f_actualHours'),work:val('f_work')});if(!id)db.effort.push(x);save();closeModal();renderEffort()}

function addSiteQuick(){
 const name=prompt('추가할 Site ID를 입력하세요. 예: HYD, SKOJ, USA-GA');
 if(!name) return;
 const cleaned=name.trim();
 let base=cleaned.toUpperCase().replace(/[^A-Z0-9가-힣]+/g,'-').replace(/^-|-$/g,'')||'SITE';
 let id=base, i=1;
 while(db.sites.some(s=>s.id===id)) id=base+'-'+(++i);
 db.sites.push({id,groupName:id,name:id,country:'',region:'',oem:'',tz:'',contact:'',active:'활성',memo:''});
 save(); renderSites(); fillSiteFilters();
}

let siteInlineEdit=false;
function toggleInlineSiteEdit(){
  siteInlineEdit=!siteInlineEdit;
  renderSites();
}
function siteUsageCount(id){
  let n=0;
  ['projects','tasks','sko','specs','shipping','effort'].forEach(type=>{
    n+=(db[type]||[]).filter(x=>x.siteId===id).length;
  });
  return n;
}
function saveSiteInline(id){
  const row=[...document.querySelectorAll('#sitesTable tr')].find(r=>r.dataset.siteId===id);
  if(!row)return;
  const get=(k)=>row.querySelector(`[data-site-field="${k}"]`)?.value??'';
  const x=db.sites.find(s=>s.id===id);
  if(!x)return;
  const newId=get('id').trim();
  if(!newId)return alert('Site ID를 입력하세요.');
  if(db.sites.some(s=>s.id===newId&&s.id!==id))return alert('이미 존재하는 Site ID입니다.');
  renameSiteId(id,newId);
  Object.assign(x,{
    id:newId,groupName:newId,name:newId,country:get('country'),region:get('region'),oem:get('oem'),
    tz:get('tz'),contact:get('contact'),active:get('active'),memo:get('memo'),color:get('color')||defaultSiteColor(newId)
  });
  syncSiteToLinkedData(newId);
  save();
  fillSiteFilters();
  renderAll();
  alert('Site 정보와 연결 프로젝트가 함께 업데이트되었습니다.');
}
function deleteSite(id){
  const used=siteUsageCount(id);
  let msg=`Site "${siteName(id)}"를 삭제하시겠습니까?`;
  if(used>0){
    msg+=`\n\n이 Site에 연결된 데이터 ${used}건이 있습니다.\n삭제하면 연결 데이터의 Site는 자동으로 '미지정' 처리됩니다.`;
  }
  if(!confirm(msg)) return;
  if(used>0){
    ['projects','tasks','sko','specs','shipping','effort'].forEach(type=>{
      (db[type]||[]).forEach(row=>{if(row.siteId===id) row.siteId='';});
    });
  }
  db.sites=db.sites.filter(s=>s.id!==id);
  save();
  fillSiteFilters();
  renderAll();
}


function openSiteDetail(id){
  const s=db.sites.find(x=>x.id===id);
  if(!s)return;
  const projects=(db.projects||[]).filter(p=>p.siteId===id);
  const body=`<div class="formgrid">
    <label>Site ID<input id="sd_id" value="${esc(s.id)}"><span class="small muted">Site 명칭은 이 값 하나로 관리됩니다.</span></label>
    <label>Site 색상${siteColorSelect(siteColor(s.id),'id="sd_color"')}<span class="small muted">색상 1~25 중 선택</span></label>
    <label>국가<input id="sd_country" value="${esc(s.country||'')}"></label>
    <label>지역<input id="sd_region" value="${esc(s.region||'')}"></label>
    <label>고객/OEM<input id="sd_oem" value="${esc(s.oem||'')}"></label>
    <label>Timezone<input id="sd_tz" value="${esc(s.tz||'')}"></label>
    <label>연락처<input id="sd_contact" value="${esc(s.contact||'')}"></label>
    <label>활성<select id="sd_active"><option ${s.active==='활성'?'selected':''}>활성</option><option ${s.active==='비활성'?'selected':''}>비활성</option></select></label>
    <label class="span2">비고<textarea id="sd_memo">${esc(s.memo||'')}</textarea></label>
    <div class="span4">
      <h3 style="margin:8px 0">연결 프로젝트 (${projects.length})</h3>
      <div class="tablewrap">
        <table>
          <thead><tr><th>PJT No.</th><th>구분</th><th>모델</th><th>장비명</th><th>라인</th><th>상태</th><th>편집</th></tr></thead>
          <tbody>${projects.map(p=>`<tr>
            <td>${esc(p.projectNo||p.id)}</td>
            <td>${projectTypeBadge(p.projectType||'기존 형교환')}</td>
            <td>${esc(p.changeoverModel||'')}</td>
            <td>${esc(p.equipmentName||'')}</td>
            <td>${esc(p.line||'')}</td>
            <td>${badge(p.status||'')}</td>
            <td><button type="button" onclick="closeModal();setTimeout(()=>editProject('${p.id}'),0)">프로젝트 편집</button></td>
          </tr>`).join('')||'<tr><td colspan="7" class="muted">연결 프로젝트가 없습니다.</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  </div>`;
  modal('Site 상세 / 편집 · '+s.id,body,`saveSiteDetail('${id}')`);
}
function saveSiteDetail(id){
  const s=db.sites.find(x=>x.id===id);
  if(!s)return;
  const newId=(document.getElementById('sd_id')?.value||'').trim();
  if(!newId)return alert('Site ID를 입력하세요.');
  if(db.sites.some(x=>x.id===newId&&x.id!==id))return alert('이미 존재하는 Site ID입니다.');
  renameSiteId(id,newId);
  Object.assign(s,{
    id:newId,groupName:newId,name:newId,
    country:document.getElementById('sd_country')?.value||'',
    region:document.getElementById('sd_region')?.value||'',
    oem:document.getElementById('sd_oem')?.value||'',
    tz:document.getElementById('sd_tz')?.value||'',
    contact:document.getElementById('sd_contact')?.value||'',
    active:document.getElementById('sd_active')?.value||'활성',
    memo:document.getElementById('sd_memo')?.value||'',
    color:document.getElementById('sd_color')?.value||defaultSiteColor(newId)
  });
  syncSiteToLinkedData(newId);
  save();
  closeModal();
  renderAll();
  alert('Site 정보와 연결 프로젝트가 함께 업데이트되었습니다.');
}

function renderSites(){
 let q=(document.getElementById('siteSearch')?.value||'').toLowerCase();
 let arr=db.sites.filter(x=>!q||JSON.stringify(x).toLowerCase().includes(q));
 const tbody=document.getElementById('sitesTable');
 if(!tbody)return;
 tbody.innerHTML=arr.map(x=>{
   const used=siteUsageCount(x.id);
   if(siteInlineEdit){
     return `<tr data-site-id="${esc(x.id)}" style="--site-color:${siteColor(x.id)};--site-tint:${siteTint(x.id)};background:var(--site-tint)">
       <td><input data-site-field="id" value="${esc(x.id)}"><div class="small muted">연결 ${used}건</div></td>
       <td>${siteColorSelect(siteColor(x.id),'data-site-field="color"')}</td>
       <td><input data-site-field="country" value="${esc(x.country)}"></td>
       <td><input data-site-field="region" value="${esc(x.region)}"></td>
       <td><input data-site-field="oem" value="${esc(x.oem)}"></td>
       <td><input data-site-field="tz" value="${esc(x.tz)}"></td>
       <td><input data-site-field="contact" value="${esc(x.contact)}"></td>
       <td><select data-site-field="active"><option ${x.active==='활성'?'selected':''}>활성</option><option ${x.active==='비활성'?'selected':''}>비활성</option></select></td>
       <td><input data-site-field="memo" value="${esc(x.memo)}"></td>
       <td><button class="primary" onclick="saveSiteInline('${x.id}')">저장</button> <button class="danger" onclick="deleteSite('${x.id}')">삭제</button></td>
     </tr>`;
   }
   return `<tr data-site-id="${esc(x.id)}" style="--site-color:${siteColor(x.id)};--site-tint:${siteTint(x.id)};background:var(--site-tint);box-shadow:inset 5px 0 var(--site-color)">
     <td ondblclick="openSiteDetail('${x.id}')" title="더블클릭: Site 상세/편집" style="cursor:pointer"><span class="site-color-badge" style="background:${siteColor(x.id)}">${esc(x.id)}</span><div class="small muted">연결 ${used}건</div></td>
     <td>${siteColorSelect(siteColor(x.id),`data-site-id="${esc(x.id)}"`)}</td>
     <td>${esc(x.country)}</td><td>${esc(x.region)}</td><td>${esc(x.oem)}</td>
     <td>${esc(x.tz)}</td><td>${esc(x.contact)}</td><td>${badge(x.active)}</td><td>${esc(x.memo)}</td>
     <td><button onclick="editSite('${x.id}')">편집</button> <button class="danger" onclick="deleteSite('${x.id}')">삭제</button></td>
   </tr>`;
 }).join('') || '<tr><td colspan="10" class="muted" style="padding:20px;text-align:center">등록된 Site가 없습니다. 상단의 “＋ Site 추가” 버튼으로 추가하세요.</td></tr>';
}
function quickChangeSiteColor(id,color){const s=db.sites.find(x=>x.id===id);if(!s)return;s.color=color;save();renderAll()}
function siteForm(x={}){const color=x.id?siteColor(x.id):SITE_COLOR_PRESETS[0][1];return `<div class="formgrid"><label>Site ID<input id="f_id" value="${esc(x.id)}" placeholder="예: HYD, SKOJ, SKON-DP3"><span class="small muted">Site 명칭은 이 값 하나로 관리합니다.</span></label><label>Site 색상${siteColorSelect(color,'id="f_color"')}<span class="small muted">색상 1~25 중 선택</span></label>
<label>국가<input id="f_country" value="${esc(x.country)}"></label><label>지역<input id="f_region" value="${esc(x.region)}"></label><label>고객/OEM<input id="f_oem" value="${esc(x.oem)}"></label><label>Timezone<input id="f_tz" value="${esc(x.tz)}"></label><label>주요 연락처<input id="f_contact" value="${esc(x.contact)}"></label><label>활성<select id="f_active"><option ${x.active==='활성'?'selected':''}>활성</option><option ${x.active==='비활성'?'selected':''}>비활성</option></select></label><label class="span2">비고<textarea id="f_memo">${esc(x.memo)}</textarea></label></div>`}
function newSite(){modal('Site 추가',siteForm({active:'활성'}),`saveSite()`)}
function editSite(id){let x=db.sites.find(v=>v.id===id);modal('Site 편집 · '+id,siteForm(x),`saveSite('${id}')`)}
function saveSite(oldId){
 let newId=(val('f_id')||'').trim();
 if(!newId)return alert('Site ID를 입력하세요.');
 if(db.sites.some(s=>s.id===newId && s.id!==oldId)) return alert('이미 존재하는 Site ID입니다.');
 let x=oldId?db.sites.find(v=>v.id===oldId):{id:newId};
 if(!x) return alert('Site 정보를 찾을 수 없습니다.');
 // Site ID 변경 시 연결 데이터도 같이 변경
 if(oldId && oldId!==newId){
   renameSiteId(oldId,newId);
 }
 Object.assign(x,{id:newId,groupName:newId,name:newId,color:val('f_color')||defaultSiteColor(newId),country:val('f_country'),region:val('f_region'),oem:val('f_oem'),tz:val('f_tz'),contact:val('f_contact'),active:val('f_active'),memo:val('f_memo')});
 if(!oldId) db.sites.push(x);
 syncSiteToLinkedData(newId);
 save(); closeModal(); renderAll();
 alert(oldId?'Site 정보와 연결 프로젝트가 함께 업데이트되었습니다.':'신규 Site가 저장되었습니다.');
}



let dashboardSiteClickTimer=null;
function filterDashboardBySite(siteId){
 clearTimeout(dashboardSiteClickTimer);
 dashboardSiteClickTimer=setTimeout(()=>{
  const siteFilter=document.getElementById('dashSite');
  if(!siteFilter)return;
  siteFilter.value=siteId;
  renderDashboard();
  const wrap=document.getElementById('dashboardProjectTable')?.closest('.tablewrap');
  if(wrap){wrap.scrollTop=0;wrap.scrollLeft=0}
 },400);
}
function openDashboardSiteDetail(event,siteId){
 clearTimeout(dashboardSiteClickTimer);dashboardSiteClickTimer=null;
 if(event){event.preventDefault();event.stopPropagation()}
 openSiteDetail(siteId);
}

const MATERIAL_SUMMARY_DB_STORE='material_state';
const MATERIAL_SUMMARY_DB_RECORD='main';
let materialStateCache=null;
let materialSummaryCache={required:0,received:0,rate:0,missing:0,overdue:0,projectCount:0};
let materialProjectSummaryCache={};
let materialFramePendingProject='';
let materialFramePendingProjectType='';
let materialFramePendingProjectStatus='';
function openMaterialSummaryDB(){return Promise.resolve(csStore.facade({track:false}))}
function summarizeMaterialState(state){
 const closed=new Set(state?.closedPjts||[]);
 const existing=new Set(state?.existingMaterialPjts||[]);
 const entries=Object.entries(state?.projectDatasets||{}).filter(([pjt])=>!closed.has(pjt)&&!existing.has(pjt));
 const items=entries.flatMap(([,rows])=>rows||[]);
 const required=items.reduce((sum,x)=>sum+(Number(x.reqQty)||0),0);
 const received=items.reduce((sum,x)=>sum+Math.min(Number(x.rcvQty)||0,Number(x.reqQty)||0),0);
 const today=new Date().toISOString().slice(0,10);
 return {required,received,rate:required?Math.round(received/required*100):0,missing:items.filter(x=>(Number(x.rcvQty)||0)<(Number(x.reqQty)||0)).length,overdue:items.filter(x=>(Number(x.rcvQty)||0)<(Number(x.reqQty)||0)&&x.dueDate&&x.dueDate!=='-'&&x.dueDate<today).length,projectCount:entries.length};
}
async function loadMaterialDashboardData(refresh=false){
 try{
  const dbx=await openMaterialSummaryDB();
  const state=await new Promise((resolve,reject)=>{const req=dbx.transaction(MATERIAL_SUMMARY_DB_STORE,'readonly').objectStore(MATERIAL_SUMMARY_DB_STORE).get(MATERIAL_SUMMARY_DB_RECORD);req.onsuccess=()=>resolve(req.result?.data||null);req.onerror=()=>reject(req.error)});
  dbx.close();materialStateCache=state;materialSummaryCache=summarizeMaterialState(state);materialProjectSummaryCache={};Object.keys(state?.projectDatasets||{}).forEach(key=>{materialProjectSummaryCache[key]=materialStatsForRows(state.projectDatasets[key]||[])});if(refresh&&document.getElementById('dashboard')?.classList.contains('active'))renderDashboard();
 }catch(e){console.warn('자재현황 요약을 불러오지 못했습니다.',e)}
}
function materialRowsForProject(projectNo){
 const sets=materialStateCache?.projectDatasets||{};
 const key=Object.keys(sets).find(k=>String(k).trim()===String(projectNo||'').trim());
 return key?(sets[key]||[]):[];
}
function materialStatsForRows(rows){const required=rows.reduce((s,x)=>s+(Number(x.reqQty)||0),0),received=rows.reduce((s,x)=>s+Math.min(Number(x.rcvQty)||0,Number(x.reqQty)||0),0);return {count:rows.length,missing:rows.filter(x=>(Number(x.rcvQty)||0)<(Number(x.reqQty)||0)).length,rate:required?Math.round(received/required*100):0}}
function materialStatsForProject(projectNo){const key=Object.keys(materialProjectSummaryCache).find(k=>String(k).trim()===String(projectNo||'').trim());return key?materialProjectSummaryCache[key]:materialStatsForRows(materialRowsForProject(projectNo))}
function materialButtonForProject(p){const no=p.projectNo||p.id,type=p.projectType||'기존 형교환';if(!projectRequiresMaterial(p))return `<button class="material-open-btn" type="button" ondblclick="enableProjectMaterialRegistration(event,'${String(p.id).replace(/'/g,"\\'")}')" title="자재 등록이 필요하면 더블클릭하세요.">자재 완료</button>`;const stat=materialStatsForProject(no),label=p.status==='완료'?'자재 완료':(stat.count?`입고율 ${stat.rate}%${stat.missing?` · 미입고 ${stat.missing}`:''}`:'자재 등록/조회');return `<button class="material-open-btn" onclick="openMaterialStatus('${String(no).replace(/'/g,"\\'")}','${String(type).replace(/'/g,"\\'")}')" title="${p.status==='완료'?'프로젝트 완료에 따라 자재 PJT도 완료 처리됨':'자재현황 상세 열기'}">${label}</button>`}
async function enableProjectMaterialRegistration(event,projectId){event?.preventDefault();event?.stopPropagation();const p=db.projects.find(x=>x.id===projectId);if(!p)return alert('프로젝트를 찾을 수 없습니다.');p.materialRegistrationOverride=true;p.materialUsage='자재관리';if(!save())return;await reopenProjectMaterials(p);renderDashboard();renderProjects();openMaterialStatus(p.projectNo||p.id,p.projectType||'개조')}
function sendMaterialProjectToFrame(){const frame=document.getElementById('materialFrame');if(frame?.contentWindow&&materialFramePendingProject)frame.contentWindow.postMessage({type:'tw-open-material-project',projectNo:materialFramePendingProject,projectType:materialFramePendingProjectType,projectStatus:materialFramePendingProjectStatus,existingMaterialUse:false},'*')}
function ensureMaterialFrame(){const frame=document.getElementById('materialFrame');if(!frame)return null;if(frame.dataset.materialLoaded!=='true'){frame.onload=()=>{frame.dataset.materialLoaded='true';sendMaterialProjectToFrame();loadMaterialDashboardData(false)};frame.src='./material.html'}return frame}
function openMaterialStatus(projectNo='',projectType=''){const p=db.projects.find(x=>String(x.projectNo||x.id).trim()===String(projectNo||'').trim());if(p&&!projectRequiresMaterial(p))return alert('구분이 개조이고 모델에 PLC 또는 비전이 입력되어 자재 등록 없이 완료 처리됩니다.');setActive('materialHub');materialFramePendingProject=projectNo||'';materialFramePendingProjectType=projectType||p?.projectType||'';materialFramePendingProjectStatus=p?.status||'';ensureMaterialFrame();setTimeout(sendMaterialProjectToFrame,250)}
async function completeProjectMaterials(p,options={}){
 const force=options.force===true,existingOnly=options.existingOnly===true;
 if(!p||(!force&&p.status!=='완료'))return {updated:0,total:0,pending:false};
 const projectNo=String(p.projectNo||p.id||'').trim();if(!projectNo)return {updated:0,total:0,pending:false};
 p.materialCompletionPending=true;
 try{
  const dbx=await openMaterialSummaryDB();
  const record=await new Promise((resolve,reject)=>{const req=dbx.transaction(MATERIAL_SUMMARY_DB_STORE,'readonly').objectStore(MATERIAL_SUMMARY_DB_STORE).get(MATERIAL_SUMMARY_DB_RECORD);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error)});
  if(!record?.data){dbx.close();p.materialCompletionPending=false;save();return {updated:0,total:0,pending:!existingOnly}}
  const state=record.data,stateSets=state.projectDatasets||(state.projectDatasets={}),existingKey=Object.keys(stateSets).find(k=>String(k).trim()===projectNo);
  if(existingOnly&&!existingKey){dbx.close();p.materialCompletionPending=false;save();return {updated:0,total:0,pending:false}}
  const key=existingKey||projectNo,rows=stateSets[key]||(stateSets[key]=[]),today=localDateYMD();let updated=0;
  const frame=document.getElementById('materialFrame');if(frame?.contentWindow&&frame.dataset.materialLoaded==='true')frame.contentWindow.postMessage({type:'tw-complete-material-project',projectNo},'*');
  rows.forEach(x=>{const req=Math.max(0,Number(x.reqQty)||0),rcv=Math.max(0,Number(x.rcvQty)||0);if(rcv<req){x.rcvQty=req;updated++}if(req===0||Number(x.rcvQty)>=req){x.status='입고';if(!x.date||x.date==='-')x.date=today}});
  state.pjtMasterOrder=Array.from(new Set([...(state.pjtMasterOrder||Object.keys(stateSets)),key]));
  state.closedPjts=Array.from(new Set([...(state.closedPjts||[]),key]));
  await new Promise((resolve,reject)=>{const tx=dbx.transaction(MATERIAL_SUMMARY_DB_STORE,'readwrite');tx.objectStore(MATERIAL_SUMMARY_DB_STORE).put({id:MATERIAL_SUMMARY_DB_RECORD,data:state,updatedAt:new Date().toISOString()});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});dbx.close();
  p.materialCompletionPending=false;save();await loadMaterialDashboardData(true);return {updated,total:rows.length,pending:false};
 }catch(e){console.warn('자재 PJT 완료 연동 실패',e);save();return {updated:0,total:0,pending:true}}
}
async function reopenProjectMaterials(p){
 const projectNo=String(p?.projectNo||p?.id||'').trim();if(!projectNo)return {reopened:false};
 try{
  const dbx=await openMaterialSummaryDB(),record=await new Promise((resolve,reject)=>{const req=dbx.transaction(MATERIAL_SUMMARY_DB_STORE,'readonly').objectStore(MATERIAL_SUMMARY_DB_STORE).get(MATERIAL_SUMMARY_DB_RECORD);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error)});
  if(!record?.data){dbx.close();return {reopened:false}}const state=record.data,sets=state.projectDatasets||{},key=Object.keys(sets).find(k=>String(k).trim()===projectNo),closed=new Set(state.closedPjts||[]);if(!key||!closed.has(key)){dbx.close();return {reopened:false}}closed.delete(key);state.closedPjts=[...closed];await new Promise((resolve,reject)=>{const tx=dbx.transaction(MATERIAL_SUMMARY_DB_STORE,'readwrite');tx.objectStore(MATERIAL_SUMMARY_DB_STORE).put({id:MATERIAL_SUMMARY_DB_RECORD,data:state,updatedAt:new Date().toISOString()});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});dbx.close();await loadMaterialDashboardData(true);return {reopened:true};
 }catch(e){console.warn('자재 PJT 재등록 전환 실패',e);return {reopened:false}}
}
async function syncProjectMaterialRule(p){p.materialUsage=materialUsageForProject(p);if(!projectRequiresMaterial(p))return completeProjectMaterials(p,{force:true,existingOnly:true});if(p.status==='완료')return completeProjectMaterials(p);return reopenProjectMaterials(p)}
async function reconcileProjectMaterialRules(){
 const targets=db.projects||[];if(!targets.length)return;
 try{
  const dbx=await openMaterialSummaryDB(),record=await new Promise((resolve,reject)=>{const req=dbx.transaction(MATERIAL_SUMMARY_DB_STORE,'readonly').objectStore(MATERIAL_SUMMARY_DB_STORE).get(MATERIAL_SUMMARY_DB_RECORD);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error)});
  if(!record?.data){dbx.close();return}const state=record.data,sets=state.projectDatasets||{},closed=new Set(state.closedPjts||[]),today=localDateYMD();let changed=false;
  targets.forEach(p=>{const requires=projectRequiresMaterial(p);p.materialUsage=requires?'자재관리':'자재 완료';const projectNo=String(p.projectNo||p.id||'').trim(),key=Object.keys(sets).find(k=>String(k).trim()===projectNo);if(!key)return;if(!requires){(sets[key]||[]).forEach(x=>{const req=Math.max(0,Number(x.reqQty)||0);if((Number(x.rcvQty)||0)<req)x.rcvQty=req;if(req===0||Number(x.rcvQty)>=req){x.status='입고';if(!x.date||x.date==='-')x.date=today}});if(!closed.has(key)){closed.add(key);changed=true}}else if(p.status!=='완료'&&closed.has(key)){closed.delete(key);changed=true}});
  if(changed){state.closedPjts=[...closed];await new Promise((resolve,reject)=>{const tx=dbx.transaction(MATERIAL_SUMMARY_DB_STORE,'readwrite');tx.objectStore(MATERIAL_SUMMARY_DB_STORE).put({id:MATERIAL_SUMMARY_DB_RECORD,data:state,updatedAt:new Date().toISOString()});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}dbx.close();if(changed)await loadMaterialDashboardData(false);
 }catch(e){console.warn('프로젝트 자재 등록 기준 정리 실패',e)}
}
function reloadMaterialFrame(){const frame=ensureMaterialFrame();if(frame){frame.dataset.materialLoaded='false';frame.src='./material.html?t='+Date.now()}}
window.addEventListener('message',event=>{if(event.data?.type==='tw-material-summary'){materialSummaryCache=event.data.summary||materialSummaryCache;materialProjectSummaryCache=event.data.projects||materialProjectSummaryCache;if(document.getElementById('dashboard')?.classList.contains('active'))renderDashboard();loadMaterialDashboardData(false)}});

function openDashboardKpi(type){
 if(type==='incomplete'){
  dashboardProjectJumpFilter='incompleteBySite';
  const site=document.getElementById('pSiteFilter'),search=document.getElementById('pSearch'),status=document.getElementById('pFilter'),kind=document.getElementById('pTypeFilter');
  if(site)site.value='';if(search)search.value='';if(status)status.value='';if(kind)kind.value='';
  setActive('projects');renderProjects();return;
 }
 if(type==='urgent'){
  dashboardTaskJumpFilter='urgent';
  const site=document.getElementById('taskSite'),search=document.getElementById('tSearch'),status=document.getElementById('tFilter');
  if(site)site.value='';if(search)search.value='';if(status)status.value='';
  setActive('tasks');renderTasks();return;
 }
 openMaterialStatus();
}

function scheduleDate(value){const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?new Date(Number(m[1]),Number(m[2])-1,Number(m[3])):null}
function scheduleYmd(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
function scheduleWeekday(date){return ['일','월','화','수','목','금','토'][date.getDay()]}
const KOREA_SCHEDULE_HOLIDAYS={
 '2025-01-01':'신정','2025-01-28':'설날 연휴','2025-01-29':'설날','2025-01-30':'설날 연휴','2025-03-01':'삼일절','2025-05-05':'어린이날·부처님오신날','2025-05-06':'대체공휴일','2025-06-06':'현충일','2025-08-15':'광복절','2025-10-03':'개천절','2025-10-05':'추석 연휴','2025-10-06':'추석','2025-10-07':'추석 연휴','2025-10-08':'대체공휴일','2025-10-09':'한글날','2025-12-25':'성탄절',
 '2026-01-01':'신정','2026-02-16':'설날 연휴','2026-02-17':'설날','2026-02-18':'설날 연휴','2026-03-01':'삼일절','2026-03-02':'대체공휴일','2026-05-05':'어린이날','2026-05-24':'부처님오신날','2026-05-25':'대체공휴일','2026-06-03':'전국동시지방선거','2026-06-06':'현충일','2026-07-17':'제헌절','2026-08-15':'광복절','2026-08-17':'대체공휴일','2026-09-24':'추석 연휴','2026-09-25':'추석','2026-09-26':'추석 연휴','2026-10-03':'개천절','2026-10-05':'대체공휴일','2026-10-09':'한글날','2026-12-25':'성탄절',
 '2027-01-01':'신정','2027-02-06':'설날 연휴','2027-02-07':'설날','2027-02-08':'설날 연휴','2027-02-09':'대체공휴일','2027-03-01':'삼일절','2027-05-01':'근로자의 날','2027-05-03':'대체공휴일','2027-05-05':'어린이날','2027-05-13':'부처님오신날','2027-06-06':'현충일','2027-07-17':'제헌절','2027-07-19':'대체공휴일','2027-08-15':'광복절','2027-08-16':'대체공휴일','2027-09-14':'추석 연휴','2027-09-15':'추석','2027-09-16':'추석 연휴','2027-10-03':'개천절','2027-10-04':'대체공휴일','2027-10-09':'한글날','2027-10-11':'대체공휴일','2027-12-25':'성탄절','2027-12-27':'대체공휴일'
};
function scheduleHolidayName(date){return KOREA_SCHEDULE_HOLIDAYS[scheduleYmd(date)]||''}
function scheduleDayClasses(date){return `${[0,6].includes(date.getDay())?'schedule-weekend':''} ${scheduleHolidayName(date)?'schedule-holiday':''} ${scheduleYmd(date)===localDateYMD()?'schedule-today':''}`}
let dashboardScheduleMode='month';
function setDashboardScheduleMode(mode){dashboardScheduleMode=['month','year','all'].includes(mode)?mode:'month';renderDashboard()}
function selectDashboardScheduleMonth(){const year=document.getElementById('dashYear');if(year)year.value='';dashboardScheduleMode='month';renderDashboard()}
function renderProjectSchedule(projects,selectedYear=''){
 const head=document.getElementById('projectScheduleHead'),body=document.getElementById('projectScheduleBody'),period=document.getElementById('projectSchedulePeriod'),wrap=document.getElementById('projectScheduleWrap');if(!head||!body||!wrap)return;
 const allowed=new Set(['신규 형교환','개조','기존 형교환']),baseRows=(projects||[]).filter(p=>allowed.has(p.projectType));
 const now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate()),picker=document.getElementById('scheduleMonthPicker');if(picker&&!picker.value)picker.value=`${Number(selectedYear)||now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
 const picked=String(picker?.value||'').match(/^(\d{4})-(\d{2})$/),pickedMonth=Math.max(0,Math.min(11,Number(picked?.[2]||now.getMonth()+1)-1)),pickedYear=Number(selectedYear)||Number(picked?.[1])||now.getFullYear();
 let rangeStart,rangeEnd,modeLabel,monthRows=null;
 if(dashboardScheduleMode==='month'){
  const isCurrentMonth=pickedYear===now.getFullYear()&&pickedMonth===now.getMonth();rangeStart=isCurrentMonth?today:new Date(pickedYear,pickedMonth,1);const monthEnd=new Date(pickedYear,pickedMonth+1,0),nextMonthEnd=new Date(pickedYear,pickedMonth+2,0);
  monthRows=baseRows.filter(p=>['준비','진행'].includes(p.status)).filter(p=>{const s=scheduleDate(p.start),d=scheduleDate(p.due),from=s&&d&&s>d?d:s,to=s&&d&&s>d?s:d;return from&&to&&from<=monthEnd&&to>=rangeStart});
  const overlapEnds=monthRows.map(p=>{const s=scheduleDate(p.start),d=scheduleDate(p.due);return s&&d&&s>d?s:d}).filter(d=>d&&d>monthEnd).map(d=>d>nextMonthEnd?nextMonthEnd:d);rangeEnd=overlapEnds.length?new Date(Math.max(...overlapEnds.map(d=>d.getTime()))):monthEnd;modeLabel=`월 일정 · 준비/진행 · ${isCurrentMonth?'오늘부터':'월초부터'} · 다음 달 겹침 구간`;
 }else if(dashboardScheduleMode==='year'){
  rangeStart=new Date(pickedYear,0,1);rangeEnd=new Date(pickedYear,11,31);modeLabel='년 일정 · 준비/진행';
 }else if(selectedYear){
  rangeStart=new Date(Number(selectedYear),0,1);rangeEnd=new Date(Number(selectedYear),11,31);modeLabel='전체 일정 · 모든 상태';
 }else{
  const allDates=baseRows.flatMap(p=>[scheduleDate(p.start),scheduleDate(p.due)]).filter(Boolean).sort((a,b)=>a-b);rangeStart=allDates[0]||new Date(now.getFullYear(),now.getMonth(),1);rangeEnd=allDates[allDates.length-1]||new Date(now.getFullYear(),now.getMonth()+2,0);modeLabel='전체 일정 · 모든 상태';
 }
 const rows=(monthRows||baseRows.filter(p=>dashboardScheduleMode==='all'||['준비','진행'].includes(p.status)).filter(p=>{const s=scheduleDate(p.start),d=scheduleDate(p.due),from=s&&d&&s>d?d:s,to=s&&d&&s>d?s:d;return from&&to&&from<=rangeEnd&&to>=rangeStart})).sort((a,b)=>siteName(a.siteId).localeCompare(siteName(b.siteId),'ko',{numeric:true})||String(a.projectNo||a.id).localeCompare(String(b.projectNo||b.id),'ko',{numeric:true}));
 const dates=[];for(let d=new Date(rangeStart);d<=rangeEnd;d.setDate(d.getDate()+1))dates.push(new Date(d));
 const months=[];dates.forEach(d=>{const key=`${d.getFullYear()}-${d.getMonth()}`,last=months[months.length-1];if(!last||last.key!==key)months.push({key,label:`${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}`,count:1});else last.count++});
 head.innerHTML=`<tr><th class="schedule-label" rowspan="2">Site → 프로젝트 번호</th>${months.map(x=>`<th colspan="${x.count}">${x.label}</th>`).join('')}</tr><tr>${dates.map(d=>{const holiday=scheduleHolidayName(d);return `<th class="schedule-day ${scheduleDayClasses(d)}"${holiday?` title="${esc(holiday)}"`:''}><span class="schedule-date-number">${d.getDate()}</span><span class="schedule-weekday-label">${scheduleWeekday(d)}</span></th>`}).join('')}</tr>`;
 const typeClass=p=>p.projectType==='신규 형교환'?'schedule-active-new':p.projectType==='개조'?'schedule-active-change':'schedule-active-existing';
 body.innerHTML=rows.map(p=>{const start=scheduleDate(p.start),due=scheduleDate(p.due),from=start&&due&&start>due?due:start,to=start&&due&&start>due?start:due,visibleFrom=from&&from<rangeStart?rangeStart:from,visibleTo=to&&to>rangeEnd?rangeEnd:to,range=`시작일 ${p.start||'미입력'} · 완료일 ${p.due||'미입력'} · 상태 ${p.status||'미입력'}`;return `<tr><td class="schedule-label" ondblclick="editProject('${p.id}')" title="더블클릭: 프로젝트 편집"><b>${esc(siteName(p.siteId))}</b><br><span>${esc(p.projectNo||p.id)}</span></td>${dates.map(d=>{const active=from&&to&&d>=from&&d<=to,isStart=active&&scheduleYmd(d)===scheduleYmd(visibleFrom),isEnd=active&&scheduleYmd(d)===scheduleYmd(visibleTo),holiday=scheduleHolidayName(d),cellTitle=[active?range:'',holiday].filter(Boolean).join(' · ');return `<td class="schedule-day ${scheduleDayClasses(d)} ${active?typeClass(p):''} ${isStart?'schedule-line-start':''} ${isEnd?'schedule-line-end':''} ${active&&p.status==='완료'?'schedule-active-done':''}"${cellTitle?` title="${esc(cellTitle)}"`:''}></td>`}).join('')}</tr>`}).join('')||`<tr><td class="schedule-label muted">표시할 프로젝트 없음</td><td colspan="${dates.length}" class="muted" style="padding:18px;text-align:left">선택한 조건에 신규 형교환·개조·기존 형교환 일정이 없습니다.</td></tr>`;
 if(period)period.textContent=`${scheduleYmd(rangeStart)} ~ ${scheduleYmd(rangeEnd)} · ${modeLabel} · ${rows.length}개`;
 document.querySelectorAll('[data-schedule-mode]').forEach(btn=>btn.classList.toggle('active',btn.dataset.scheduleMode===dashboardScheduleMode));
 const scheduleKey=`${dashboardScheduleMode}:${scheduleYmd(rangeStart)}:${scheduleYmd(rangeEnd)}`;if(wrap.dataset.scheduleKey!==scheduleKey){wrap.dataset.scheduleKey=scheduleKey;setTimeout(()=>{const inRange=now>=rangeStart&&now<=rangeEnd,focus=inRange?Math.max(0,Math.floor((now-rangeStart)/86400000)-5):0;wrap.scrollLeft=Math.max(0,focus*28)},0)}
}

function dashboardProjectStatusRank(status){return ({'준비':0,'진행':1,'진행중':1,'위험':2,'보류':3,'완료':4})[String(status||'').trim()]??2}
function compareDashboardProjectSchedule(a,b){const statusOrder=dashboardProjectStatusRank(a.status)-dashboardProjectStatusRank(b.status);if(statusOrder)return statusOrder;const aStart=String(a.start||a.due||'9999-12-31'),bStart=String(b.start||b.due||'9999-12-31');if(aStart!==bStart)return aStart.localeCompare(bStart);const dueOrder=String(a.due||'9999-12-31').localeCompare(String(b.due||'9999-12-31'));if(dueOrder)return dueOrder;const projectOrder=String(a.projectNo||a.id).localeCompare(String(b.projectNo||b.id),'ko',{numeric:true});if(projectOrder)return projectOrder;return (Number(b.createdAt)||0)-(Number(a.createdAt)||0)}
function renderDashboard(){
 fillSiteFilters();let ds=document.getElementById('dashSite');if(ds){let old=ds.value;ds.innerHTML='<option value="">전체 Site</option>'+siteOptions(old,false);ds.value=old;} let q=(document.getElementById('dashSearch')?.value||'').toLowerCase(), f=document.getElementById('dashStatus')?.value||'', site=document.getElementById('dashSite')?.value||'', year=document.getElementById('dashYear')?.value||'', sortMode=document.getElementById('dashSort')?.value||'activeDate';
 let schedulePs=db.projects.filter(p=>{
   const start=(p.start||'').toString();
   const due=(p.due||'').toString();
   let yearMatch=true;
   if(year){
     const yStart=`${year}-01-01`;
     const yEnd=`${year}-12-31`;
     // 선택 연도와 프로젝트 기간이 하루라도 겹치면 검색에 포함
     if(start&&due) yearMatch=(start<=yEnd && due>=yStart);
     else if(start) yearMatch=(start>=yStart && start<=yEnd);
     else if(due) yearMatch=(due>=yStart && due<=yEnd);
     else yearMatch=false;
   }
   return (!site||p.siteId===site)&&yearMatch&&(!q||JSON.stringify(p).toLowerCase().includes(q));
 });
 let ps=schedulePs.filter(p=>!f||p.status===f);
 if(sortMode==='site')ps.sort((a,b)=>siteName(a.siteId).localeCompare(siteName(b.siteId),'ko',{numeric:true})||compareDashboardProjectSchedule(a,b));
 else ps.sort(compareDashboardProjectSchedule);
 let openTasks=db.tasks.filter(t=>t.status!=='완료').length, openIssues=db.issues.filter(i=>i.status!=='Closed').length, risks=db.projects.filter(p=>p.risk==='High').length+db.tasks.filter(t=>t.status==='위험').length;
 const incompleteProjects=db.projects.filter(p=>p.status!=='완료').length;
 document.getElementById('kpis').innerHTML=[['미완료 프로젝트',incompleteProjects+'건','','incomplete','형교환·개조 프로젝트의 미완료 목록'],['자재 입고율',materialSummaryCache.rate+'%','good','material','자재현황 조회'],['미입고',materialSummaryCache.missing+'건',materialSummaryCache.missing?'alert':'','material','자재현황 조회'],['납기초과',materialSummaryCache.overdue+'건',materialSummaryCache.overdue?'alert':'','material','자재현황 조회']].map(x=>`<div class="card integrated-kpi kpi-link ${x[2]}" ondblclick="openDashboardKpi('${x[3]}')" title="더블클릭: ${x[4]}로 이동"><div class="muted">${x[0]}</div><div class="metric">${x[1]}</div></div>`).join('');
 renderProjectSchedule(schedulePs,year);

 const incompleteTasks=(db.tasks||[]).filter(t=>t.status!=='완료');
 const urgentTasks=incompleteTasks.filter(t=>t.status==='위험'||t.priority==='High');
 const urgentIssues=(db.issues||[]).filter(i=>i.status!=='Closed'&&['High','Critical'].includes(i.severity));
 const linkedSiteId=item=>item.siteId||(db.projects||[]).find(p=>p.id===item.project)?.siteId||'';
 const urgentSiteIds=new Set([
   ...(db.sites||[]).filter(s=>s.active!=='비활성').map(s=>s.id),
   ...urgentTasks.map(linkedSiteId),
   ...urgentIssues.map(linkedSiteId)
 ].filter(Boolean));
 const urgentSiteRows=[...urgentSiteIds].map(siteId=>{
   const taskCount=urgentTasks.filter(t=>linkedSiteId(t)===siteId).length;
   const issueCount=urgentIssues.filter(i=>linkedSiteId(i)===siteId).length;
   return {siteId,taskCount,issueCount,total:taskCount+issueCount};
 }).sort((a,b)=>b.total-a.total||siteName(a.siteId).localeCompare(siteName(b.siteId),'ko',{numeric:true}));
 const csKpis=document.getElementById('csKpis');
 if(csKpis)csKpis.innerHTML=[
   ['현재 미완료 CS 업무',incompleteTasks.length,'완료되지 않은 전체 업무'],
   ['전체 긴급 건수',urgentTasks.length+urgentIssues.length,`CS 업무 ${urgentTasks.length}건 · Issue ${urgentIssues.length}건`]
 ].map(x=>`<div class="card"><div class="muted">${x[0]}</div><div class="metric">${x[1]}</div><div class="small muted">${x[2]}</div></div>`).join('');
 const urgentBody=document.getElementById('csUrgentSiteBody');
 if(urgentBody)urgentBody.innerHTML=urgentSiteRows.map(x=>`<tr ${siteRowAttrs(x.siteId,x.total?'project-row-overdue':'')}><td>${siteCell(x.siteId,true)}</td><td style="text-align:center">${x.taskCount}</td><td style="text-align:center">${x.issueCount}</td><td style="text-align:center"><b>${x.total}</b></td></tr>`).join('')||'<tr><td colspan="4" class="muted" style="padding:20px;text-align:center">등록된 Site가 없습니다.</td></tr>';

 document.getElementById('projectTable').innerHTML=ps.map(p=>`<tr ${siteRowAttrs(p.siteId,projectRowClass(p))}><td onclick="filterDashboardBySite('${p.siteId}')" ondblclick="openDashboardSiteDetail(event,'${p.siteId}')" title="한 번 클릭: 이 Site만 보기 · 더블클릭: Site 상세/편집" style="cursor:pointer">${siteCell(p.siteId,true)}</td><td>${(()=>{
  const sy=((p.start||'').match(/^(20\d{2})/)||[])[1]||'';
  const ey=((p.due||'').match(/^(20\d{2})/)||[])[1]||'';
  return esc(sy&&ey&&sy!==ey?`${sy}~${ey}`:(sy||ey));
})()}</td><td ondblclick="editProject('${p.id}')" title="더블클릭: 프로젝트 편집" style="cursor:pointer">${esc(p.projectNo||p.id)}</td><td>${projectTypeBadge(p.projectType||'기존 형교환')}</td><td>${esc(p.changeoverModel||'')}</td><td>${pptButton(p)}</td><td>${esc(p.equipmentName||'')}</td><td>${esc(p.line||'')}</td><td>${p.equipmentCount===''||p.equipmentCount==null?'':esc(p.equipmentCount)+'대'}</td><td ondblclick="editProjectStatusInline(event,this,'${p.id}')" title="더블클릭: 단계 바로 수정" style="cursor:pointer">${badge(p.status)}</td><td>${esc(p.cs)}</td><td>${esc(p.start)}</td><td>${esc(p.due)}</td><td><div>${p.progress}%</div><div class="progress"><i style="width:${p.progress}%"></i></div></td><td>${badge(p.risk)}</td><td>${materialButtonForProject(p)}</td></tr>`).join('');
 let timelineEl=document.getElementById('timeline'); if(timelineEl) timelineEl.innerHTML=ps.map(p=>`<div class="step ${p.risk==='High'?'risk':p.status==='완료'?'done':''}"><b>${esc(p.oem)} · ${esc(p.projectNo||p.id)}</b><br><span class="small">${p.start} → ${p.due}</span><br>${p.progress}% / ${badge(p.status)}</div>`).join('')||'<span class="muted">조건에 맞는 프로젝트 없음</span>';
 let today=new Date().toISOString().slice(0,10);
 let rr=db.tasks.filter(t=>t.status!=='완료'&&(t.status==='위험'||t.due<=today)).sort((a,b)=>a.due.localeCompare(b.due));
 let riskEl=document.getElementById('riskList'); if(riskEl) riskEl.innerHTML=rr.slice(0,8).map(t=>`<div style="padding:7px 0;border-bottom:1px solid var(--line)"><b>${esc(t.name)}</b> · ${projectName(t.project)}<br><span class="small">${t.due} · ${esc(t.owner)} · ${badge(t.status)}</span></div>`).join('')||'<span class="muted">위험/기한 초과 업무 없음</span>';
}

function resetDashboardFilters(){
 const search=document.getElementById('dashSearch');
 const site=document.getElementById('dashSite');
 const sort=document.getElementById('dashSort');
 const year=document.getElementById('dashYear');
 const status=document.getElementById('dashStatus');
 if(search)search.value='';
 if(site)site.value='';
 if(sort)sort.value='activeDate';
 if(year)year.value='';
 if(status)status.value='';
}

let projectInlineEdit=false;

function toggleProjectInlineEdit(){
  projectInlineEdit=!projectInlineEdit;
  renderProjects();
}

async function saveProjectInline(id){
  const row=[...document.querySelectorAll('#projectsTable tr')].find(r=>r.dataset.projectId===id);
  if(!row)return;
  const get=(k)=>row.querySelector(`[data-project-field="${k}"]`)?.value??'';
  const p=db.projects.find(x=>x.id===id);
  if(!p)return;
  if(!get('siteId'))return alert('Site를 먼저 선택해야 저장할 수 있습니다.');
  if(!get('projectNo').trim())return alert('선택한 Site 안의 프로젝트 번호를 입력하세요.');
  p.projectNo=get('projectNo');
  p.projectType=get('projectType');
  p.changeoverModel=get('changeoverModel');
  p.materialUsage=materialUsageForProject(p);
  p.equipmentName=get('equipmentName');
  p.line=get('line');
  p.siteId=get('siteId');
  p.equipmentCount=get('equipmentCount')===''?'':Math.max(0,Math.floor(Number(get('equipmentCount'))||0));
  p.status=get('status');
  p.cs=get('cs');
  p.pm=get('pm');
  p.start=get('start');
  p.due=get('due');
  p.risk=get('risk');
  save();
  await syncProjectMaterialRule(p);
  renderProjects();
  renderDashboard();
}

const DEFAULT_DELETE_PASSWORD='1234';
function getDeletePassword(){
  return localStorage.getItem('gacs_delete_password')||DEFAULT_DELETE_PASSWORD;
}
function verifyDeletePassword(message='삭제'){
  const pw=prompt(`${message}\n삭제 비밀번호를 입력하세요.`);
  if(pw===null)return false;
  if(pw!==getDeletePassword()){
    alert('비밀번호가 일치하지 않습니다. 삭제되지 않았습니다.');
    return false;
  }
  return true;
}

function deleteProjectDirect(id){
  const p=db.projects.find(x=>x.id===id);
  if(!p)return;
  if(!verifyDeletePassword(`프로젝트 "${p.projectNo||p.name||id}" 삭제 확인`))return;
  const linkedTasks=(db.tasks||[]).filter(x=>x.project===id).length;
  const linkedIssues=(db.issues||[]).filter(x=>x.project===id).length;
  let msg=`형교환/프로젝트 "${p.projectNo||p.name||id}"를 삭제하시겠습니까?`;
  if(linkedTasks+linkedIssues>0){
    msg+=`\n\n연결된 CS 업무 ${linkedTasks}건, Issue ${linkedIssues}건이 있습니다.\n프로젝트만 삭제되고 연결 데이터는 유지됩니다.`;
  }
  if(!confirm(msg))return;
  db.projects=db.projects.filter(x=>x.id!==id);
  save();
  (p.attachments||[]).forEach(x=>{if(!projectAttachmentReferenced(x.id))deleteProjectAttachmentBlob(x.id)});
  renderProjects();
  renderDashboard();
}

function duplicateProject(id){
  const p=db.projects.find(x=>x.id===id);
  if(!p)return;
  const copy=JSON.parse(JSON.stringify(p));
  copy.id='P-'+Date.now();
  copy.createdAt=Date.now();
  copy.projectNo=(p.projectNo||'')+'-COPY';
  copy.name=(p.name||'')+' 복사본';
  db.projects.push(copy);
  save();
  renderProjects();
  renderDashboard();
}

function localDateYMD(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
// 완료된 프로젝트는 기존 표시를 유지하고, 미완료 프로젝트만 기한 경과로 표시한다.
function isProjectOverdue(p){return !!p.due && p.status!=='완료' && p.due<localDateYMD();}
function projectRowClass(p){if(isProjectOverdue(p))return 'project-row-overdue';if(p.status==='진행')return 'project-row-progress';return '';}

function editProjectStatusInline(event,cell,id){
  if(event){event.preventDefault();event.stopPropagation()}
  if(!cell||cell.querySelector('select'))return;
  const p=db.projects.find(x=>x.id===id);
  if(!p)return;
  const previous=p.status||'준비';
  const statuses=['준비','진행','보류','완료','위험'];
  cell.innerHTML=`<select aria-label="프로젝트 단계 수정" style="min-width:82px;padding:5px 7px">${statuses.map(s=>`<option value="${s}" ${s===previous?'selected':''}>${s}</option>`).join('')}</select>`;
  const select=cell.querySelector('select');
  select.addEventListener('click',e=>e.stopPropagation());
  select.addEventListener('dblclick',e=>e.stopPropagation());
  select.addEventListener('change',async()=>{
    p.status=select.value;
    if(!save())p.status=previous;
    else await syncProjectMaterialRule(p);
    renderDashboard();
    renderProjects();
  },{once:true});
  select.addEventListener('blur',()=>{
    setTimeout(()=>{if(document.body.contains(cell)&&!select.matches(':focus'))cell.innerHTML=badge(p.status)},0);
  },{once:true});
  select.focus();
}

function projectTypeBadge(type){
  const t=String(type||'기존 형교환');
  let cls='b-pre';
  if(t==='신규 형교환') cls='b-run';
  else if(t==='기존 형교환') cls='b-pre';
  else if(t==='개조') cls='b-done';
  else if(t.includes('대응')||t.includes('추가')) cls='b-pre';
  return `<span class="badge ${cls}">${esc(t)}</span>`;
}

function bomButton(p){
 const count=(p?.bomItems||[]).length;
 return `<button type="button" class="primary" onclick="openBomList('${p.id}')">BOM 목록 (${count})</button>`;
}
function savedProjectPptPages(p){const pages=(p?.pptPages||[]).filter(x=>String(x||'').replace(/<[^>]*>/g,'').trim()||/<img|<table/i.test(x||''));if(!pages.length&&p?.pptRichHtml)pages.push(p.pptRichHtml);return pages}
function projectPptFiles(p){return (p?.attachments||[]).filter(x=>/\.(ppt|pptx)$/i.test(x.name||'')||/powerpoint|presentation/i.test(x.type||''))}
function pptButton(p){const pages=savedProjectPptPages(p).length,files=projectPptFiles(p).length,label=files?`파일 ${files}${pages?' / 페이지 '+pages:''}`:pages;return `<button type="button" class="primary" onclick="openProjectPptPages('${p.id}',0)">PPT 자료 (${label})</button>`}
async function openStoredProjectPptFile(projectId,attachmentId){
 const p=db.projects.find(x=>x.id===projectId),x=p?.attachments?.find(v=>v.id===attachmentId);if(!x)return;
 try{const blob=await getProjectAttachmentBlob(x.id);if(!blob)return alert('PPT 원본을 찾지 못했습니다. 이 자료를 저장했던 PC와 브라우저에서 열어주세요.');const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=x.name||'PPT자료.pptx';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}catch(e){alert('PPT 파일을 열지 못했습니다: '+e.message)}
}
function openProjectPptPages(projectId,page=0){
 const p=db.projects.find(x=>x.id===projectId);if(!p)return;const pages=savedProjectPptPages(p),files=projectPptFiles(p),count=pages.length;
 if(!count&&!files.length){modal(`PPT 자료 · ${siteName(p.siteId)} → ${p.projectNo||p.id}`,`<div class="muted" style="padding:35px;text-align:center">저장된 PPT 자료가 없습니다.<br><button type="button" style="margin-top:12px" onclick="editProject('${p.id}')">프로젝트 편집에서 PPT 자료 추가</button></div>`,`closeModal()`);const closeBtn=document.querySelector('#modal .actions .primary');if(closeBtn)closeBtn.textContent='닫기';return}
 const fileBar=files.length?`<div class="card" style="margin-bottom:10px"><b>PPT 전체 파일 ${files.length}개</b><div class="toprow" style="margin-top:7px">${files.map(x=>`<button type="button" class="primary" onclick="openStoredProjectPptFile('${p.id}','${x.id}')">${esc(x.name)} 열기/저장</button>`).join('')}</div></div>`:'';
 page=Math.max(0,Math.min(Number(page)||0,Math.max(0,count-1)));const nav=count?`<div class="toprow" style="margin-bottom:9px"><button type="button" onclick="openProjectPptPages('${p.id}',${page-1})" ${page===0?'disabled':''}>← 이전 페이지</button><b>PPT ${page+1} / ${count} 페이지</b><button type="button" onclick="openProjectPptPages('${p.id}',${page+1})" ${page===count-1?'disabled':''}>다음 페이지 →</button><button type="button" style="margin-left:auto" onclick="editProject('${p.id}')">PPT 자료 편집</button></div>`:`<div class="toprow" style="margin-bottom:9px"><button type="button" style="margin-left:auto" onclick="editProject('${p.id}')">PPT 자료 편집</button></div>`;
 modal(`PPT 자료 · ${siteName(p.siteId)} → ${p.projectNo||p.id}`,`${fileBar}${nav}${count?`<div class="ppt-view-page">${sanitizeProjectPptHtml(pages[page])}</div>`:''}`,`closeModal()`);document.querySelector('.modalbox')?.classList.add('bom-wide');const closeBtn=document.querySelector('#modal .actions .primary');if(closeBtn)closeBtn.textContent='닫기';
}
const BOM_PAGE_SIZE=200;
function bomGridHeader(){return '<tr><th>순번</th><th>프로젝트유형</th><th>프로젝트번호</th><th>상위Unit품명</th><th>UnitNo</th><th>도면번호(조립도)</th><th>입고일</th><th>납품예정일</th><th>자재명</th><th>구매요청</th><th>발주수량</th><th>입고수량</th><th>구매단위</th><th>출고요청</th><th></th></tr>'}
function bomGridCells(x,project,number,actions=''){return `<td>${number}</td><td>${esc(x.projectType)}</td><td>${esc(x.projectNo||project.projectNo)}</td><td>${esc(x.upperUnitName)}</td><td>${esc(x.unitNo)}</td><td>${esc(x.drawingNo||x.partNo)}</td><td>${esc(x.receiptDate)}</td><td>${esc(x.deliveryDate)}</td><td>${esc(x.materialName||x.partName)}</td><td>${esc(x.purchaseRequest)}</td><td>${esc(x.orderQty||x.qty)}</td><td>${esc(x.receivedQty)}</td><td>${esc(x.unit||'EA')}</td><td>${esc(x.issueRequest)}</td><td>${actions}</td>`}
function openBomList(projectId,page=0){
 const p=db.projects.find(x=>x.id===projectId);if(!p)return;
 p.bomItems=p.bomItems||[];
 const pageCount=Math.max(1,Math.ceil(p.bomItems.length/BOM_PAGE_SIZE));page=Math.max(0,Math.min(page,pageCount-1));const start=page*BOM_PAGE_SIZE,visible=p.bomItems.slice(start,start+BOM_PAGE_SIZE);
 const rows=visible.map((x,i)=>`<tr>${bomGridCells(x,p,start+i+1,`<button onclick="editBomItem('${projectId}','${x.id}')">편집</button> <button class="danger" onclick="deleteBomItem('${projectId}','${x.id}')">삭제</button>`)}</tr>`).join('');
 const uploadId='bomUpload_'+projectId.replace(/[^a-zA-Z0-9_-]/g,'_');
 const pager=`<div class="toprow" style="margin:8px 0"><b>전체 ${p.bomItems.length.toLocaleString()}행</b><span class="muted">${page+1} / ${pageCount} 페이지 · 페이지당 ${BOM_PAGE_SIZE}행</span><button ${page===0?'disabled':''} onclick="openBomList('${projectId}',${page-1})">← 이전</button><button ${page>=pageCount-1?'disabled':''} onclick="openBomList('${projectId}',${page+1})">다음 →</button></div>`;
 const body=`<div class="toolbar"><button class="primary" onclick="openBomPaste('${projectId}')">📋 큰 화면에서 붙여넣기</button><button onclick="newBomItem('${projectId}')">＋ 직접 추가</button><button onclick="document.getElementById('${uploadId}').click()">보안 해제 후 BOM 업로드</button><input id="${uploadId}" type="file" accept=".xlsx,.csv,.tsv" style="display:none" onchange="handleBomFileUpload('${projectId}',this)"><button onclick="exportBomExcel('${projectId}')">BOM Excel 저장</button>${p.bomItems.length?`<button class="danger" onclick="clearBomItems('${projectId}')">BOM 전체삭제</button>`:''}<span class="small muted">모든 DataSheet는 아래 BOM 목록과 동일한 13개 열을 사용합니다.</span></div><div class="toprow" style="margin-bottom:8px"><select id="bomListPasteMode" style="max-width:190px"><option value="append">기존 BOM에 추가</option><option value="replace">붙여넣은 표로 교체</option></select><b>아래 BOM 표를 클릭한 뒤 Ctrl+V</b></div>${pager}<div class="tablewrap bom-table-paste" tabindex="0" onclick="this.focus()" onpaste="handleBomListDirectPaste(event,'${projectId}')"><table class="bom-sheet"><thead>${bomGridHeader()}</thead><tbody>${rows||'<tr><td colspan="15" class="muted" style="padding:24px;text-align:center">이 표를 클릭한 뒤 Excel 셀 범위를 Ctrl+V 하세요.</td></tr>'}</tbody></table></div>`;
 modal(`BOM 목록 · ${siteName(p.siteId)} → ${p.projectNo||p.id}`,body,`closeModal()`);
 document.querySelector('.modalbox')?.classList.add('bom-wide');
}
function bomItemForm(x={}){return `<div class="formgrid"><label>프로젝트유형<input id="bom_projectType" value="${esc(x.projectType)}"></label><label>프로젝트번호<input id="bom_projectNo" value="${esc(x.projectNo)}"></label><label>상위Unit품명<input id="bom_upperUnitName" value="${esc(x.upperUnitName)}"></label><label>UnitNo<input id="bom_unitNo" value="${esc(x.unitNo)}"></label><label>도면번호(조립도)<input id="bom_drawingNo" value="${esc(x.drawingNo||x.partNo)}"></label><label>입고일<input id="bom_receiptDate" value="${esc(x.receiptDate)}"></label><label>납품예정일<input id="bom_deliveryDate" value="${esc(x.deliveryDate)}"></label><label>자재명<input id="bom_materialName" value="${esc(x.materialName||x.partName)}"></label><label>구매요청<input id="bom_purchaseRequest" value="${esc(x.purchaseRequest)}"></label><label>발주수량<input id="bom_orderQty" value="${esc(x.orderQty||x.qty)}"></label><label>입고수량<input id="bom_receivedQty" value="${esc(x.receivedQty)}"></label><label>구매단위<input id="bom_unit" value="${esc(x.unit||'EA')}"></label><label>출고요청<input id="bom_issueRequest" value="${esc(x.issueRequest)}"></label></div>`}
function newBomItem(projectId){modal('BOM 항목 추가',bomItemForm({unit:'EA'}),`saveBomItem('${projectId}')`)}
function editBomItem(projectId,itemId){const p=db.projects.find(x=>x.id===projectId),x=p?.bomItems?.find(v=>v.id===itemId);if(x)modal('BOM 항목 편집',bomItemForm(x),`saveBomItem('${projectId}','${itemId}')`)}
function saveBomItem(projectId,itemId){
 const p=db.projects.find(x=>x.id===projectId);if(!p)return;
 p.bomItems=p.bomItems||[];let x=itemId?p.bomItems.find(v=>v.id===itemId):{id:'BOM-'+Date.now()};
 Object.assign(x,{projectType:val('bom_projectType'),projectNo:val('bom_projectNo')||p.projectNo,upperUnitName:val('bom_upperUnitName'),unitNo:val('bom_unitNo'),drawingNo:val('bom_drawingNo'),receiptDate:val('bom_receiptDate'),deliveryDate:val('bom_deliveryDate'),materialName:val('bom_materialName'),purchaseRequest:val('bom_purchaseRequest'),orderQty:val('bom_orderQty'),receivedQty:val('bom_receivedQty'),unit:val('bom_unit')||'EA',issueRequest:val('bom_issueRequest')});
 if(!itemId)p.bomItems.push(x);save();openBomList(projectId);renderDashboard();renderProjects();
}
function deleteBomItem(projectId,itemId){const p=db.projects.find(x=>x.id===projectId);if(!p||!confirm('이 BOM 항목을 삭제하시겠습니까?'))return;p.bomItems=(p.bomItems||[]).filter(x=>x.id!==itemId);save();openBomList(projectId);renderDashboard();renderProjects()}
function clearBomItems(projectId){const p=db.projects.find(x=>x.id===projectId);if(!p||!confirm(`BOM ${p.bomItems?.length||0}건을 모두 삭제하시겠습니까?`))return;p.bomItems=[];save();openBomList(projectId);renderDashboard();renderProjects()}
function exportBomExcel(projectId){
 const p=db.projects.find(x=>x.id===projectId);if(!p)return;
 const rows=[['순번','프로젝트유형','프로젝트번호','상위Unit품명','UnitNo','도면번호(조립도)','입고일','납품예정일','자재명','구매요청','발주수량','입고수량','구매단위','출고요청'],...(p.bomItems||[]).map((x,i)=>[i+1,x.projectType||'',x.projectNo||p.projectNo||'',x.upperUnitName||'',x.unitNo||'',x.drawingNo||x.partNo||'',x.receiptDate||'',x.deliveryDate||'',x.materialName||x.partName||'',x.purchaseRequest||'',x.orderQty||x.qty||'',x.receivedQty||'',x.unit||'EA',x.issueRequest||''])];
 const bytes=buildXlsxBytes([{name:'BOM',rows}]);downloadBlob(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`${sanitizeFileName(p.projectNo||p.id)}_BOM.xlsx`);
}

const BOM_IMPORT_FIELDS=[
 ['projectType',['프로젝트유형','프로젝트타입']],['projectNo',['프로젝트번호','프로젝트No','PJTNo']],['upperUnitName',['상위Unit품명','상위유닛품명']],['unitNo',['UnitNo','유닛No']],
 ['drawingNo',['도면번호(조립도)','도면번호','품번']],['receiptDate',['입고일']],['deliveryDate',['납품예정일','납기예정일']],['materialName',['자재명','품명']],
 ['purchaseRequest',['구매요청','구매요청수량']],['orderQty',['발주수량','수량']],['receivedQty',['입고수량']],['unit',['구매단위','구매','단위']],['issueRequest',['출고요청','출고요청수량']]
];
function normalizeBomHeader(v){return String(v??'').replace(/[\s_\-./]/g,'').toLowerCase()}
function parseDelimitedTable(text,delimiter='\t'){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<String(text).length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(ch===delimiter&&!quoted){row.push(cell);cell=''}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell=''}else cell+=ch}
 row.push(cell);if(row.some(v=>String(v).trim()))rows.push(row);return rows;
}
function clipboardTableRows(event){
 const plain=event.clipboardData?.getData('text/plain')||'';
 if(plain.trim())return parseDelimitedTable(plain,plain.includes('\t')?'\t':',');
 const html=event.clipboardData?.getData('text/html')||'';if(!html.trim())return [];
 const doc=new DOMParser().parseFromString(html,'text/html'),table=doc.querySelector('table');if(!table)return [];
 return [...table.querySelectorAll('tr')].map(tr=>[...tr.querySelectorAll('th,td')].map(td=>(td.innerText||td.textContent||'').trim())).filter(r=>r.some(Boolean));
}
function excelSerialToDate(v){const n=Number(v);if(!Number.isFinite(n)||n<20000||n>80000)return String(v??'');return new Date(Date.UTC(1899,11,30)+Math.round(n)*86400000).toISOString().slice(0,10)}
function bomRowsToItems(rows,project){
 rows=(rows||[]).map(r=>r.map(v=>String(v??'').trim())).filter(r=>r.some(Boolean));if(!rows.length)return [];
 let headerIndex=rows.findIndex((r,i)=>i<10&&r.some(v=>normalizeBomHeader(v).includes('프로젝트번호'))&&r.some(v=>normalizeBomHeader(v).includes('자재명')));
 let map={};
 if(headerIndex>=0){const headers=rows[headerIndex].map(normalizeBomHeader);BOM_IMPORT_FIELDS.forEach(([field,names])=>{const aliases=names.map(normalizeBomHeader);const idx=headers.findIndex(h=>aliases.some(a=>h===a||h.startsWith(a)));if(idx>=0)map[field]=idx});rows=rows.slice(headerIndex+1)}
 else BOM_IMPORT_FIELDS.forEach(([field],i)=>map[field]=i);
 return rows.filter(r=>r.some(Boolean)).map((r,i)=>{const x={id:'BOM-'+Date.now()+'-'+i};BOM_IMPORT_FIELDS.forEach(([field])=>x[field]=map[field]===undefined?'':(r[map[field]]??''));x.projectNo=x.projectNo||project.projectNo||project.id;x.unit=x.unit||'EA';x.receiptDate=excelSerialToDate(x.receiptDate);x.deliveryDate=excelSerialToDate(x.deliveryDate);return x}).filter(x=>x.drawingNo||x.materialName||x.unitNo);
}
let bomImportDraft=[],bomImportProjectId='',bomImportPreviewPage=0;
function handleBomListDirectPaste(event,projectId){
 event.preventDefault();const p=db.projects.find(x=>x.id===projectId),rows=clipboardTableRows(event);if(!p||!rows.length)return alert('Excel에서 제목을 포함한 셀 범위를 먼저 Ctrl+C 해주세요.');const items=bomRowsToItems(rows,p);if(!items.length)return alert('BOM 행을 인식하지 못했습니다. BOM 목록과 동일한 제목 행을 포함해 복사해 주세요.');const mode=document.getElementById('bomListPasteMode')?.value||'append';p.bomItems=mode==='replace'?items:[...(p.bomItems||[]),...items];if(!save())return;openBomList(projectId,mode==='replace'?0:Math.floor((p.bomItems.length-1)/BOM_PAGE_SIZE));renderDashboard();renderProjects();alert(`Excel BOM ${items.length.toLocaleString()}행이 ${mode==='replace'?'교체':'추가'}되었습니다.`)
}
function openBomPaste(projectId){
 bomImportDraft=[];bomImportProjectId=projectId;bomImportPreviewPage=0;
 const body=`<div class="toprow"><b id="bomPastePreview">아래 표 클릭 후 Ctrl+V · 수백~수천 행 가능</b><label style="margin-left:auto">저장 방식<select id="bomImportMode"><option value="append">기존 BOM에 추가</option><option value="replace">기존 BOM을 교체</option></select></label><button id="bomPreviewPrev" type="button" onclick="changeBomImportPage(-1)" disabled>← 이전</button><button id="bomPreviewNext" type="button" onclick="changeBomImportPage(1)" disabled>다음 →</button></div><div id="bomGridPasteTable" class="tablewrap bom-table-paste" tabindex="0" onclick="this.focus()" onpaste="handleBomGridPaste(event,'${projectId}')" style="margin-top:8px"><table class="bom-sheet"><thead>${bomGridHeader()}</thead><tbody id="bomImportPreviewBody"><tr><td colspan="15" class="muted" style="padding:28px;text-align:center">이 표를 클릭한 뒤 Excel 셀 범위를 Ctrl+V 하세요.</td></tr></tbody></table></div>`;
 modal('BOM Excel 표 붙여넣기',body,`importBomGrid('${projectId}')`);document.querySelector('.modalbox')?.classList.add('bom-wide');setTimeout(()=>document.getElementById('bomGridPasteTable')?.focus(),0);
}
function handleBomGridPaste(event,projectId){
 event.preventDefault();const p=db.projects.find(x=>x.id===projectId),rows=clipboardTableRows(event);if(!rows.length)return alert('Excel 셀 범위를 먼저 Ctrl+C 해주세요.');
 bomImportDraft=bomRowsToItems(rows,p||{});bomImportPreviewPage=0;if(!bomImportDraft.length)return alert('BOM 행을 인식하지 못했습니다. 제목 행과 데이터를 함께 복사해 주세요.');renderBomImportGrid();
}
function renderBomImportGrid(){
 const p=db.projects.find(x=>x.id===bomImportProjectId)||{},pages=Math.max(1,Math.ceil(bomImportDraft.length/BOM_PAGE_SIZE));bomImportPreviewPage=Math.max(0,Math.min(bomImportPreviewPage,pages-1));const start=bomImportPreviewPage*BOM_PAGE_SIZE,rows=bomImportDraft.slice(start,start+BOM_PAGE_SIZE),body=document.getElementById('bomImportPreviewBody');if(body)body.innerHTML=rows.map((x,i)=>`<tr>${bomGridCells(x,p,start+i+1,'')}</tr>`).join('');const info=document.getElementById('bomPastePreview');if(info)info.textContent=`전체 ${bomImportDraft.length.toLocaleString()}행 인식 · ${bomImportPreviewPage+1}/${pages} 페이지`;const prev=document.getElementById('bomPreviewPrev'),next=document.getElementById('bomPreviewNext');if(prev)prev.disabled=bomImportPreviewPage===0;if(next)next.disabled=bomImportPreviewPage>=pages-1;
}
function changeBomImportPage(delta){bomImportPreviewPage+=delta;renderBomImportGrid()}
function importBomGrid(projectId){const p=db.projects.find(x=>x.id===projectId);if(!p)return;if(!bomImportDraft.length)return alert('Excel 표를 Ctrl+V로 먼저 붙여넣으세요.');const mode=val('bomImportMode');p.bomItems=mode==='replace'?[...bomImportDraft]:[...(p.bomItems||[]),...bomImportDraft];if(!save())return;const count=bomImportDraft.length;bomImportDraft=[];openBomList(projectId);renderDashboard();renderProjects();alert(`BOM ${count.toLocaleString()}행이 ${mode==='replace'?'교체':'추가'}되었습니다.`)}

async function unzipXlsxEntries(buffer){
 const bytes=new Uint8Array(buffer),view=new DataView(buffer);let eocd=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(view.getUint32(i,true)===0x06054b50){eocd=i;break}}if(eocd<0)throw new Error('올바른 xlsx 파일이 아닙니다.');
 const count=view.getUint16(eocd+10,true),offset=view.getUint32(eocd+16,true),entries={};let pos=offset;
 for(let i=0;i<count;i++){if(view.getUint32(pos,true)!==0x02014b50)break;const method=view.getUint16(pos+10,true),size=view.getUint32(pos+20,true),nameLen=view.getUint16(pos+28,true),extraLen=view.getUint16(pos+30,true),commentLen=view.getUint16(pos+32,true),localOffset=view.getUint32(pos+42,true),name=new TextDecoder().decode(bytes.slice(pos+46,pos+46+nameLen));const localNameLen=view.getUint16(localOffset+26,true),localExtraLen=view.getUint16(localOffset+28,true),start=localOffset+30+localNameLen+localExtraLen;entries[name]={method,data:bytes.slice(start,start+size)};pos+=46+nameLen+extraLen+commentLen}
 const read=async name=>{const e=entries[name];if(!e)return '';let out=e.data;if(e.method===8){if(typeof DecompressionStream==='undefined')throw new Error('이 브라우저는 xlsx 압축 해제를 지원하지 않습니다. CSV로 저장해 업로드해 주세요.');out=new Uint8Array(await new Response(new Blob([e.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer())}else if(e.method!==0)throw new Error('지원하지 않는 xlsx 압축 형식입니다.');return new TextDecoder().decode(out)};
 return {entries,read};
}
async function readXlsxRows(file){
 const zip=await unzipXlsxEntries(await file.arrayBuffer()),parser=new DOMParser(),sharedXml=await zip.read('xl/sharedStrings.xml'),shared=sharedXml?[...parser.parseFromString(sharedXml,'application/xml').querySelectorAll('si')].map(x=>x.textContent||''):[];
 const sheetName=Object.keys(zip.entries).filter(n=>/^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a,b)=>(+a.match(/\d+/)[0])-(+b.match(/\d+/)[0]))[0];if(!sheetName)throw new Error('xlsx에서 시트를 찾지 못했습니다.');
 const doc=parser.parseFromString(await zip.read(sheetName),'application/xml'),rows=[];
 doc.querySelectorAll('sheetData row').forEach(rowEl=>{const row=[];rowEl.querySelectorAll('c').forEach(c=>{const ref=c.getAttribute('r')||'',letters=(ref.match(/[A-Z]+/i)||['A'])[0].toUpperCase();let col=0;for(const ch of letters)col=col*26+ch.charCodeAt(0)-64;col--;const type=c.getAttribute('t'),v=c.querySelector('v')?.textContent??'',value=type==='s'?(shared[Number(v)]??''):type==='inlineStr'?(c.querySelector('is')?.textContent??''):v;row[col]=value});rows.push(row)});return rows;
}
async function handleBomFileUpload(projectId,input){
 const file=input.files?.[0];if(!file)return;const p=db.projects.find(x=>x.id===projectId);if(!p)return;
 try{let rows;if(file.name.toLowerCase().endsWith('.xlsx'))rows=await readXlsxRows(file);else{const text=await file.text(),delimiter=file.name.toLowerCase().endsWith('.tsv')||text.includes('\t')?'\t':',';rows=parseDelimitedTable(text,delimiter)}const items=bomRowsToItems(rows,p);if(!items.length)throw new Error('BOM 행을 인식하지 못했습니다.');const replace=(p.bomItems||[]).length?confirm(`BOM ${items.length}건을 읽었습니다.\n\n확인: 기존 BOM을 교체\n취소: 기존 BOM에 추가`):true;p.bomItems=replace?items:[...(p.bomItems||[]),...items];save();openBomList(projectId);renderDashboard();renderProjects();alert(`BOM ${items.length}건을 업로드했습니다.`)}catch(e){alert('BOM 업로드 실패: '+e.message)}finally{input.value=''}
}

function fillProjectTypeFilter(){
  const el=document.getElementById('pTypeFilter');
  if(!el)return;
  const old=el.value;
  const types=[...new Set(db.projects.map(p=>p.projectType||'기존 형교환'))];
  el.innerHTML='<option value="">전체 구분</option>'+types.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');
  if([...el.options].some(o=>o.value===old)) el.value=old;
}

function fillProjectSiteFilter(){
  const el=document.getElementById('pSiteFilter');
  if(!el)return;
  const old=el.value;
  el.innerHTML='<option value="">전체 Site</option>'+siteOptions(old,false);
  if([...el.options].some(o=>o.value===old))el.value=old;
}

function renderProjects(){
 fillProjectTypeFilter();
 fillProjectSiteFilter();
 let q=(document.getElementById('pSearch')?.value||'').toLowerCase(),
     f=document.getElementById('pFilter')?.value||'',
     tf=document.getElementById('pTypeFilter')?.value||'',
     sf=document.getElementById('pSiteFilter')?.value||'';
 let arr=db.projects.filter(p=>(dashboardProjectJumpFilter!=='incompleteBySite'||p.status!=='완료')&&(!sf||p.siteId===sf)&&(!f||p.status===f)&&(!tf||(p.projectType||'기존 형교환')===tf)&&(!q||JSON.stringify(p).toLowerCase().includes(q)));
 const insertionIndex=new Map(db.projects.map((p,i)=>[p.id,i]));
 arr.sort((a,b)=>{
   if(dashboardProjectJumpFilter==='incompleteBySite'){
    const siteOrder=siteName(a.siteId).localeCompare(siteName(b.siteId),'ko',{numeric:true});
    if(siteOrder)return siteOrder;
    const dueOrder=String(a.due||'9999-12-31').localeCompare(String(b.due||'9999-12-31'));
    if(dueOrder)return dueOrder;
   }
   const aCreated=Number(a.createdAt)||0;
   const bCreated=Number(b.createdAt)||0;
   if(aCreated!==bCreated)return bCreated-aCreated;
   return (insertionIndex.get(b.id)??-1)-(insertionIndex.get(a.id)??-1);
 });
 const tbody=document.getElementById('projectsTable');
 if(!tbody)return;

 let previousProjectSite='';
 tbody.innerHTML=arr.map(p=>{
   const siteHeader=dashboardProjectJumpFilter==='incompleteBySite'&&p.siteId!==previousProjectSite?((previousProjectSite=p.siteId),`<tr class="site-group-header"><td colspan="15" style="padding:9px 12px;background:${siteColor(p.siteId)};font-weight:800">${esc(siteName(p.siteId))} · 미완료 ${arr.filter(x=>x.siteId===p.siteId).length}건</td></tr>`):'';
   if(projectInlineEdit){
     return siteHeader+`<tr class="${projectRowClass(p)}" data-project-id="${esc(p.id)}">
       <td><select data-project-field="siteId">${siteOptions(p.siteId)}</select></td>
       <td><input data-project-field="projectNo" value="${esc(p.projectNo||p.id)}"></td>
       <td><select data-project-field="projectType">
         <option value="신규 형교환" ${p.projectType==='신규 형교환'?'selected':''}>1. 신규 형교환</option>
         <option value="기존 형교환" ${(p.projectType||'기존 형교환')==='기존 형교환'?'selected':''}>2. 기존 형교환</option>
         <option value="개조" ${p.projectType==='개조'?'selected':''}>3. 개조</option>
         ${p.projectType && !['신규 형교환','기존 형교환','개조'].includes(p.projectType)?`<option value="${esc(p.projectType)}" selected>4. ${esc(p.projectType)}</option>`:''}
       </select></td>
       <td><input data-project-field="changeoverModel" value="${esc(p.changeoverModel||'')}" placeholder="예: E1472"></td>
       <td>${pptButton(p)}</td>
       <td><select data-project-field="equipmentName">
         <option value="">선택</option>
         <option value="STACKING" ${(p.equipmentName||'').toUpperCase()==='STACKING'?'selected':''}>1. STACKING</option>
         <option value="NOTCHING" ${(p.equipmentName||'').toUpperCase()==='NOTCHING'?'selected':''}>2. NOTCHING</option>
         <option value="${esc(p.equipmentName||'기타')}" ${p.equipmentName && !['STACKING','NOTCHING'].includes((p.equipmentName||'').toUpperCase())?'selected':''}>3. 기타/현재값</option>
       </select></td>
       <td><input data-project-field="line" value="${esc(p.line||'')}" placeholder="예: 1~7 Line"></td>
       <td><input data-project-field="equipmentCount" type="number" min="0" step="1" value="${esc(p.equipmentCount??'')}" placeholder="예: 3"></td>
       <td><select data-project-field="status">${['준비','진행','완료','보류','위험'].map(x=>`<option ${p.status===x?'selected':''}>${x}</option>`).join('')}</select></td>
       <td><input data-project-field="cs" value="${esc(p.cs)}"></td>
       <td><input data-project-field="pm" value="${esc(p.pm)}"></td>
       <td><input data-project-field="start" type="date" value="${p.start||''}"></td>
       <td><input data-project-field="due" type="date" value="${p.due||''}"></td>
       <td>${p.progress??0}%</td>
       <td>
         <button class="primary" onclick="saveProjectInline('${p.id}')">저장</button>
         <button onclick="editProject('${p.id}')">상세</button>
         <button class="danger" onclick="deleteProjectDirect('${p.id}')">삭제</button>
       </td>
     </tr>`;
   }
   return siteHeader+`<tr class="${projectRowClass(p)}" data-project-id="${esc(p.id)}">
     <td ondblclick="openSiteDetail('${p.siteId}')" title="더블클릭: Site 상세/편집" style="cursor:pointer">${siteCell(p.siteId,true)}</td>
     <td>${esc(p.projectNo||p.id)}</td>
     <td>${projectTypeBadge(p.projectType||'기존 형교환')}</td>
     <td>${esc(p.changeoverModel||'')}</td>
     <td>${pptButton(p)}</td>
     <td>${esc(p.equipmentName||'')}</td>
     <td>${esc(p.line||'')}</td>
     <td>${p.equipmentCount===''||p.equipmentCount==null?'':esc(p.equipmentCount)+'대'}</td>
     <td ondblclick="editProjectStatusInline(event,this,'${p.id}')" title="더블클릭: 상태 바로 수정" style="cursor:pointer">${badge(p.status)}</td>
     <td>${esc(p.cs)}</td>
     <td>${esc(p.pm)}</td>
     <td>${esc(p.start)}</td>
     <td>${esc(p.due)}${isProjectOverdue(p)?'<div class="small" style="font-weight:700">⚠ 기한 초과</div>':''}</td>
     <td>${p.progress??0}%</td>
     <td>
       <button onclick="editProject('${p.id}')">편집</button>
       <button onclick="duplicateProject('${p.id}')">복사</button>
       <button class="danger" onclick="deleteProjectDirect('${p.id}')">삭제</button>
     </td>
   </tr>`;
 }).join('') || '<tr><td colspan="16" class="muted" style="padding:20px;text-align:center">등록된 형교환/프로젝트가 없습니다. 상단의 “＋ 형교환 추가” 버튼으로 추가하세요.</td></tr>';
}

function dailyProjectOptions(selected=''){
  return '<option value="">프로젝트 선택</option>'+[...db.projects].sort((a,b)=>siteName(a.siteId).localeCompare(siteName(b.siteId),'ko')||String(a.projectNo||a.id).localeCompare(String(b.projectNo||b.id),'ko',{numeric:true})).map(p=>{
    const label=[siteName(p.siteId),p.projectNo||p.id,p.changeoverModel,p.equipmentName,p.line].filter(Boolean).join(' · ');
    return `<option value="${esc(p.id)}" ${p.id===selected?'selected':''}>${esc(label)}</option>`;
  }).join('');
}
function fillDailyProjectInfo(){
  const pid=val('dr_project');
  const p=db.projects.find(x=>x.id===pid);
  if(!p)return;
  const site=document.getElementById('dr_site');
  const equipment=document.getElementById('dr_equipment');
  if(site) site.value=siteName(p.siteId);
  if(equipment) equipment.value=[p.equipmentName,p.line].filter(Boolean).join(' / ');
}
function dailyReportForm(r={}){
  const today=new Date().toISOString().slice(0,10);
  return `<div class="formgrid">
    <label>프로젝트<select id="dr_project" onchange="fillDailyProjectInfo()">${dailyProjectOptions(r.projectId||'')}</select></label>
    <label>Site (대분류)<input id="dr_site" value="${esc(r.site||'')}" placeholder="프로젝트 선택 시 자동표시" readonly></label>
    <label>일자<input id="dr_date" type="date" value="${esc(r.date||today)}"></label>
    <label>장비 / 라인<input id="dr_equipment" value="${esc(r.equipment||'')}" placeholder="예: STACKING / 1~7 Line"></label>
    <label>담당자<input id="dr_owner" value="${esc(r.owner||'')}" placeholder="CS 담당자"></label>
    <label>상태<select id="dr_status">
      ${['진행','완료','대기','이슈'].map(x=>`<option ${r.status===x?'selected':''}>${x}</option>`).join('')}
    </select></label>
    <label class="span2">금일 작업<textarea id="dr_work" rows="3" placeholder="오늘 진행한 작업을 간단히 입력">${esc(r.work||'')}</textarea></label>
    <label class="span2">이슈 / 문제점<textarea id="dr_issue" rows="3" placeholder="발생 이슈, 고객 요청, 문제점 등">${esc(r.issue||'')}</textarea></label>
    <label class="span2">조치 내용 / 익일 계획<textarea id="dr_action" rows="3" placeholder="조치사항 또는 다음 작업 계획">${esc(r.action||'')}</textarea></label>
    <label class="span2">비고<input id="dr_memo" value="${esc(r.memo||'')}" placeholder="추가 메모"></label>
  </div>`;
}
function newDailyReport(){
  modal('간단 CS 일보 작성',dailyReportForm(),`saveDailyReport()`);
}
function editDailyReport(id){
  const r=db.dailyReports.find(x=>x.id===id);
  if(!r)return;
  modal('간단 CS 일보 편집',dailyReportForm(r),`saveDailyReport('${id}')`,`deleteDailyReport('${id}');closeModal()`);
}
function saveDailyReport(id){
  if(!val('dr_project'))return alert('Site와 프로젝트 번호를 먼저 선택하세요.');
  const selectedProject=db.projects.find(x=>x.id===val('dr_project'));
  if(!selectedProject?.siteId)return alert('선택한 프로젝트에 Site가 없습니다. 프로젝트 정보에서 Site를 먼저 지정하세요.');
  let r=id?db.dailyReports.find(x=>x.id===id):{id:'DR-'+Date.now()};
  if(!r)return;
  Object.assign(r,{
    date:val('dr_date'),projectId:val('dr_project'),site:val('dr_site'),
    equipment:val('dr_equipment'),owner:val('dr_owner'),status:val('dr_status'),
    work:val('dr_work'),issue:val('dr_issue'),action:val('dr_action'),memo:val('dr_memo')
  });
  if(!id)db.dailyReports.unshift(r);
  save();closeModal();renderDailyReports();
}
function deleteDailyReport(id){
  if(!verifyDeletePassword('CS 일보 삭제 확인'))return;
  if(!confirm('이 일보를 삭제하시겠습니까?'))return;
  db.dailyReports=db.dailyReports.filter(x=>x.id!==id);
  save();renderDailyReports();
}
function renderDailyIssueSummary(){
  const body=document.getElementById('dailyIssueSummaryBody');
  if(!body)return;
  const selectedSite=document.getElementById('dailySiteFilter')?.value||'';
  const groups=new Map();
  (db.dailyReports||[]).forEach(report=>{
    const project=db.projects.find(x=>x.id===report.projectId);
    const siteId=project?.siteId||report.site||'미지정';
    if(selectedSite&&siteId!==selectedSite)return;
    if(!groups.has(siteId))groups.set(siteId,[]);
    groups.get(siteId).push({report,project});
  });
  const rows=[...groups.entries()].map(([siteId,items])=>{
    items.sort((a,b)=>String(b.report.date||'').localeCompare(String(a.report.date||''))||String(b.report.id||'').localeCompare(String(a.report.id||'')));
    const issueItems=items.filter(x=>String(x.report.issue||'').trim());
    const openItems=issueItems.filter(x=>x.report.status!=='완료');
    const visible=(openItems.length?openItems:issueItems).slice(0,3);
    const issues=visible.length?`<div class="daily-issue-list">${visible.map(x=>`<div class="daily-issue-item"><b>${esc(x.project?.projectNo||x.project?.id||'프로젝트 미지정')}</b> · ${esc(x.report.date||'')}<br>${esc(x.report.issue||'')}</div>`).join('')}</div>`:'<span class="muted">등록 이슈 없음</span>';
    const actions=visible.length?`<div class="daily-issue-list">${visible.map(x=>`<div class="daily-action-item">${esc(x.report.action||'조치/계획 미입력')}</div>`).join('')}</div>`:'<span class="muted">-</span>';
    return {siteId,count:items.length,open:openItems.length,issues,actions,latest:items[0]?.report.date||''};
  }).sort((a,b)=>b.open-a.open||siteName(a.siteId).localeCompare(siteName(b.siteId),'ko',{numeric:true}));
  body.innerHTML=rows.map(x=>`<tr ${siteRowAttrs(x.siteId,x.open?'project-row-overdue':'')}>
    <td ondblclick="openSiteDetail('${x.siteId}')" title="더블클릭: Site 상세/편집" style="cursor:pointer">${siteCell(x.siteId,true)}</td>
    <td style="text-align:center"><b>${x.count}</b>건</td>
    <td style="text-align:center"><b>${x.open}</b>건</td>
    <td>${x.issues}</td>
    <td>${x.actions}</td>
    <td style="text-align:center">${esc(x.latest)}</td>
    <td style="text-align:center">${x.open?'<span class="badge b-high">확인 필요</span>':'<span class="badge b-done">정상</span>'}</td>
  </tr>`).join('')||'<tr><td colspan="7" class="muted" style="padding:22px;text-align:center">작성된 Site별 일보가 없습니다.</td></tr>';
}
function renderDailyReports(){
  const body=document.getElementById('dailyReportTable');
  if(!body)return;
  const siteFilter=document.getElementById('dailySiteFilter');
  if(siteFilter){const old=siteFilter.value;siteFilter.innerHTML='<option value="">전체 Site</option>'+siteOptions(old,false);if([...siteFilter.options].some(o=>o.value===old))siteFilter.value=old;}
  const sf=siteFilter?.value||'';
  const q=(document.getElementById('dailySearch')?.value||'').toLowerCase();
  let arr=(db.dailyReports||[]).filter(r=>{const p=db.projects.find(x=>x.id===r.projectId);return (!sf||p?.siteId===sf)&&(!q||JSON.stringify(r).toLowerCase().includes(q)||JSON.stringify(p||{}).toLowerCase().includes(q));});
  arr.sort((a,b)=>{const pa=db.projects.find(x=>x.id===a.projectId)||{},pb=db.projects.find(x=>x.id===b.projectId)||{};return siteName(pa.siteId).localeCompare(siteName(pb.siteId),'ko')||String(pa.projectNo||'').localeCompare(String(pb.projectNo||''),'ko',{numeric:true})||String(b.date||'').localeCompare(String(a.date||''));});
  body.innerHTML=arr.map(r=>{
    const p=db.projects.find(x=>x.id===r.projectId);
    const project=p ? esc(p.projectNo||p.id) : '';
    return `<tr>
      <td ondblclick="openSiteDetail('${p?.siteId||''}')" title="더블클릭: Site 상세/편집" style="cursor:pointer"><b><span class="badge b-run">${esc(p?siteName(p.siteId):(r.site||''))}</span></b></td><td>${project}</td><td>${esc(r.date||'')}</td>
      <td>${esc(r.equipment||'')}</td><td>${esc(r.owner||'')}</td>
      <td style="min-width:180px">${esc(r.work||'')}</td>
      <td style="min-width:180px">${esc(r.issue||'')}</td>
      <td style="min-width:180px">${esc(r.action||'')}</td>
      <td>${badge(r.status||'진행')}</td>
      <td><button onclick="editDailyReport('${r.id}')">편집</button> <button class="danger" onclick="deleteDailyReport('${r.id}')">삭제</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="10" class="muted" style="padding:20px;text-align:center">작성된 일보가 없습니다. “＋ 일보 작성”으로 당일 작업과 이슈를 기록하세요.</td></tr>';
  renderDailyIssueSummary();
}

function renderTasks(){
 fillSiteFilters();const siteEl=document.getElementById('taskSite');if(siteEl){const old=siteEl.value;siteEl.innerHTML='<option value="">전체 Site</option>'+siteOptions(old,false);if([...siteEl.options].some(o=>o.value===old))siteEl.value=old;}
 let q=(document.getElementById('tSearch')?.value||'').toLowerCase(),f=document.getElementById('tFilter')?.value||'',sf=siteEl?.value||'';
 let arr=db.tasks.filter(t=>{const p=db.projects.find(x=>x.id===t.project);return (dashboardTaskJumpFilter!=='urgent'||(t.status!=='완료'&&(t.status==='위험'||t.priority==='High')))&&(!sf||p?.siteId===sf)&&(!f||t.status===f)&&(!q||JSON.stringify(t).toLowerCase().includes(q)||JSON.stringify(p||{}).toLowerCase().includes(q));});
 arr.sort((a,b)=>{const pa=db.projects.find(x=>x.id===a.project)||{},pb=db.projects.find(x=>x.id===b.project)||{};return siteName(pa.siteId).localeCompare(siteName(pb.siteId),'ko')||String(pa.projectNo||pa.id||'').localeCompare(String(pb.projectNo||pb.id||''),'ko',{numeric:true})||String(a.due||'').localeCompare(String(b.due||''));});
 document.getElementById('tasksTable').innerHTML=arr.map(t=>{const p=db.projects.find(x=>x.id===t.project)||{};return `<tr><td ondblclick="openSiteDetail('${p.siteId||''}')" title="더블클릭: Site 상세/편집" style="cursor:pointer"><b><span class="badge b-run">${esc(siteName(p.siteId))}</span></b></td><td>${esc(p.projectNo||p.id||'')}</td><td><b>${esc(t.name)}</b><div class="small">${t.id}</div></td><td>${esc(t.type)}</td><td>${esc(t.owner)}</td><td>${badge(t.priority)}</td><td>${t.due}</td><td>${badge(t.status)}</td><td>${esc(t.note)}</td><td><button onclick="editTask('${t.id}')">편집</button></td></tr>`}).join('')||'<tr><td colspan="10" class="muted" style="padding:20px;text-align:center">등록된 CS 업무가 없습니다.</td></tr>';
}
function modal(title,body,saveFn,delFn){
 document.querySelector('.modalbox')?.classList.remove('bom-wide');
 document.getElementById('modalContent').innerHTML=`<div class="toprow"><h2 style="margin:0">${title}</h2><button onclick="closeModal()">닫기</button></div><div style="margin-top:12px">${body}</div><div class="actions">${delFn?`<button class="danger" onclick="${delFn}">삭제</button>`:''}<button class="primary" onclick="${saveFn}">저장</button></div>`;
 document.getElementById('modal').classList.add('show');
}
function closeModal(){document.getElementById('modal').classList.remove('show')}
function val(id){return document.getElementById(id).value}
function addManpowerRow(){let d=document.createElement('div');d.className='toprow';d.style.margin='5px 0';d.innerHTML='<input data-mp-name placeholder="담당자"><input data-mp-role placeholder="역할"><input data-mp-in type="date"><input data-mp-out type="date"><button type="button" onclick="this.parentElement.remove()">삭제</button>';document.getElementById('manpowerEditor').appendChild(d)}
function collectManpower(){return [...document.querySelectorAll('#manpowerEditor .toprow')].map(r=>({name:r.querySelector('[data-mp-name]')?.value||'',role:r.querySelector('[data-mp-role]')?.value||'',inDate:r.querySelector('[data-mp-in]')?.value||'',outDate:r.querySelector('[data-mp-out]')?.value||''})).filter(x=>x.name||x.role||x.inDate||x.outDate)}

function defaultMilestones(){
  return [
    {name:'설계시작',due:'',done:false},
    {name:'부품출도',due:'',done:false},
    {name:'조립시작',due:'',done:false},
    {name:'형교환/개조시작',due:'',done:false},
    {name:'완료',due:'',done:false}
  ];
}
function milestoneRowHtml(m={},i=0){
  return `<div class="toprow milestone-row" style="margin:5px 0">
    <span data-ms-order style="min-width:24px;font-weight:700">${i+1}</span>
    <input data-ms-name value="${esc(m.name||'')}" placeholder="진행 단계명" style="min-width:220px">
    <input data-ms-due type="date" value="${m.due||''}">
    <label style="width:100px"><input data-ms-done type="checkbox" ${m.done?'checked':''}> 완료</label>
    <button type="button" onclick="moveMilestone(this,-1)">↑</button>
    <button type="button" onclick="moveMilestone(this,1)">↓</button>
    <button type="button" onclick="insertMilestoneAfter(this)">＋중간</button>
    <button type="button" class="danger" onclick="this.parentElement.remove();renumberMilestones();calcMilestoneProgress()">삭제</button>
  </div>`;
}
function addMilestoneRow(name=''){
  const box=document.getElementById('milestoneEditor'); if(!box)return;
  const wrap=document.createElement('div');
  wrap.innerHTML=milestoneRowHtml({name,due:'',done:false},box.querySelectorAll('.milestone-row').length);
  box.appendChild(wrap.firstElementChild); renumberMilestones();
}
function insertMilestoneAfter(btn){
  const row=btn.closest('.milestone-row'); if(!row)return;
  const wrap=document.createElement('div'); wrap.innerHTML=milestoneRowHtml({},0);
  row.insertAdjacentElement('afterend',wrap.firstElementChild); renumberMilestones();
}
function moveMilestone(btn,dir){
  const row=btn.closest('.milestone-row'); if(!row)return;
  if(dir<0&&row.previousElementSibling)row.parentNode.insertBefore(row,row.previousElementSibling);
  if(dir>0&&row.nextElementSibling)row.parentNode.insertBefore(row.nextElementSibling,row);
  renumberMilestones();
}
function renumberMilestones(){
  [...document.querySelectorAll('#milestoneEditor .milestone-row')].forEach((r,i)=>{
    const n=r.querySelector('[data-ms-order]'); if(n)n.textContent=i+1;
  });
}
function loadDefaultMilestones(){
  const box=document.getElementById('milestoneEditor'); if(!box)return;
  if(box.children.length&&!confirm('현재 단계 목록을 기본 5단계로 교체하시겠습니까?'))return;
  box.innerHTML=defaultMilestones().map((m,i)=>milestoneRowHtml(m,i)).join('');
  calcMilestoneProgress();
}
function collectMilestones(){
  return [...document.querySelectorAll('#milestoneEditor .milestone-row')].map(r=>({
    name:r.querySelector('[data-ms-name]')?.value||'',
    due:r.querySelector('[data-ms-due]')?.value||'',
    done:!!r.querySelector('[data-ms-done]')?.checked
  })).filter(x=>x.name);
}
function calcMilestoneProgress(returnValue=false){
  const ms=collectMilestones();
  const pct=ms.length?Math.round(ms.filter(x=>x.done).length/ms.length*100):0;
  const f=document.getElementById('f_progress');if(f)f.value=pct;
  const bar=document.getElementById('milestoneBar');if(bar)bar.style.width=pct+'%';
  const tx=document.getElementById('milestonePct');if(tx)tx.textContent=pct+'%';
  return pct;
}

function applyProjectTypePreset(){
  const sel=document.getElementById('f_projectTypePreset');
  const input=document.getElementById('f_projectType');
  if(!sel||!input)return;
  if(sel.value==='신규 형교환'){
    input.readOnly=true;
    input.value='신규 형교환';
  }else if(sel.value==='기존 형교환'){
    input.readOnly=true;
    input.value='기존 형교환';
  }else if(sel.value==='개조'){
    input.readOnly=true;
    input.value='개조';
  }else if(sel.value==='OTHER'){
    input.readOnly=false;
    if(['신규 형교환','기존 형교환','개조'].includes((input.value||'').trim())) input.value='';
    input.focus();
  }
}
function enableProjectTypeCustom(){
  const sel=document.getElementById('f_projectTypePreset');
  const input=document.getElementById('f_projectType');
  if(!input)return;
  if(sel) sel.value='OTHER';
  input.readOnly=false;
  input.focus();
  input.select();
}

function applyEquipmentPreset(){
  const sel=document.getElementById('f_equipmentPreset');
  const input=document.getElementById('f_equipmentName');
  if(!sel||!input)return;
  if(sel.value==='STACKING'){
    input.readOnly=true;
    input.value='STACKING';
  }else if(sel.value==='NOTCHING'){
    input.readOnly=true;
    input.value='NOTCHING';
  }else if(sel.value==='OTHER'){
    input.readOnly=false;
    if(['STACKING','NOTCHING'].includes((input.value||'').toUpperCase())) input.value='';
    input.focus();
  }else{
    input.readOnly=true;
  }
}
function enableEquipmentCustom(){
  const sel=document.getElementById('f_equipmentPreset');
  const input=document.getElementById('f_equipmentName');
  if(!input)return;
  if(sel) sel.value='OTHER';
  input.readOnly=false;
  input.focus();
  input.select();
}

function setLineRange(){
  const s=(document.getElementById('f_lineStart')?.value||'').trim();
  const e=(document.getElementById('f_lineEnd')?.value||'').trim();
  const target=document.getElementById('f_line');
  if(!target)return;
  if(s && e){
    target.value = s===e ? `${s} Line` : `${s}~${e} Line`;
  } else if(s){
    target.value = `${s} Line`;
  } else if(e){
    target.value = `${e} Line`;
  }
}

let projectCaptureDraft=[];
const MAX_PROJECT_CAPTURES=30;
function compressProjectCapture(file){
 return new Promise((resolve,reject)=>{
   const url=URL.createObjectURL(file),img=new Image();
   img.onload=()=>{try{const max=1600,scale=Math.min(1,max/Math.max(img.width,img.height)),w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale)),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);URL.revokeObjectURL(url);resolve({id:'CAP-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),name:file.name||'캡처 이미지',data:canvas.toDataURL('image/jpeg',.82),addedAt:new Date().toISOString()})}catch(e){URL.revokeObjectURL(url);reject(e)}};
   img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('이미지를 읽을 수 없습니다.'))};img.src=url;
 });
}
async function addProjectCaptureFiles(fileList){
 const files=[...(fileList||[])].filter(f=>f.type.startsWith('image/'));
 if(!files.length)return alert('붙여넣은 내용에서 이미지 캡처를 찾지 못했습니다.');
 if(projectCaptureDraft.length+files.length>MAX_PROJECT_CAPTURES){alert(`프로젝트당 캡처는 최대 ${MAX_PROJECT_CAPTURES}장까지 저장할 수 있습니다.`);return;}
 for(const file of files){try{projectCaptureDraft.push(await compressProjectCapture(file))}catch(e){alert(file.name+' 파일을 읽지 못했습니다.')}}
 renderProjectCaptureDraft();
}
async function handleProjectCapturePaste(event){
 event.preventDefault();
 const files=[...(event.clipboardData?.items||[])].filter(x=>x.type.startsWith('image/')).map(x=>x.getAsFile()).filter(Boolean);
 await addProjectCaptureFiles(files);
 const zone=document.getElementById('projectCapturePasteZone');if(zone){zone.textContent=`✓ ${projectCaptureDraft.length}장 저장 준비됨 — 계속 Ctrl+V 가능`;setTimeout(()=>{if(zone)zone.textContent='BOM 화면 캡처 후 Ctrl+V — 여러 장 반복 붙여넣기'},1400)}
}
function renderProjectCaptureDraft(){
 const el=document.getElementById('projectCapturePreview');if(!el)return;
 const count=document.getElementById('projectCaptureCount');if(count)count.textContent=`현재 ${projectCaptureDraft.length} / ${MAX_PROJECT_CAPTURES}장`;
 el.innerHTML=projectCaptureDraft.map((x,i)=>`<div class="capture-card"><img src="${x.data}" alt="${esc(x.name)}" onclick="openProjectCapture(${i})" title="클릭: 크게 보기"><button type="button" class="danger" onclick="removeProjectCapture(${i})">삭제</button><div class="small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.name)}</div></div>`).join('')||'<div class="muted small">저장된 캡처가 없습니다.</div>';
}
function removeProjectCapture(index){projectCaptureDraft.splice(index,1);renderProjectCaptureDraft()}
function openProjectCapture(index){const x=projectCaptureDraft[index];if(x)window.open(x.data,'_blank')}

let projectDataSheetDraft=[];
const PROJECT_DATASHEET_PREVIEW_ROWS=50;
const PROJECT_DATASHEET_MAX_ROWS=10000;
function projectSheetColumnName(index){let n=index+1,name='';while(n>0){n--;name=String.fromCharCode(65+n%26)+name;n=Math.floor(n/26)}return name}
function normalizeProjectDataSheetRows(rows){
 const clean=(rows||[]).slice(0,PROJECT_DATASHEET_MAX_ROWS).map(r=>(r||[]).map(v=>String(v??'').replace(/\r/g,'')));
 while(clean.length&&clean[clean.length-1].every(v=>!v.trim()))clean.pop();
 let maxCols=clean.reduce((m,r)=>Math.max(m,r.length),0);while(maxCols>0&&clean.every(r=>!String(r[maxCols-1]??'').trim()))maxCols--;
 return clean.map(r=>r.slice(0,maxCols));
}
function updateProjectDataSheetCell(row,col,value){while(projectDataSheetDraft.length<=row)projectDataSheetDraft.push([]);while(projectDataSheetDraft[row].length<=col)projectDataSheetDraft[row].push('');projectDataSheetDraft[row][col]=String(value??'');const count=document.getElementById('projectDataSheetCount');if(count)count.textContent=`현재 ${projectDataSheetDraft.length.toLocaleString()}행`}
function handleProjectDataSheetPaste(event,startRow=0,startCol=0){
 event.preventDefault();event.stopPropagation();const rows=clipboardTableRows(event);if(!rows.length)return alert('Excel에서 셀 범위를 먼저 Ctrl+C 해주세요.');
 const clean=normalizeProjectDataSheetRows(rows);if(!clean.length)return alert('붙여넣을 표 내용을 찾지 못했습니다.');
 const mode=document.getElementById('projectDataSheetPasteMode')?.value||'replace';
 if(mode==='replace'){projectDataSheetDraft=clean}else{const targetStart=projectDataSheetDraft.length;clean.forEach((r,ri)=>{const target=targetStart+ri;while(projectDataSheetDraft.length<=target)projectDataSheetDraft.push([]);r.forEach((v,ci)=>projectDataSheetDraft[target][startCol+ci]=v)})}
 renderProjectDataSheetDraft();const note=document.getElementById('projectDataSheetNote');if(note)note.textContent=`✓ Excel ${clean.length.toLocaleString()}행 × ${Math.max(...clean.map(r=>r.length)).toLocaleString()}열을 붙여넣었습니다.`;
}
function renderProjectDataSheetDraft(){
 const count=document.getElementById('projectDataSheetCount');if(count)count.textContent=`현재 ${projectDataSheetDraft.length.toLocaleString()}행`;
 const head=document.getElementById('projectDataSheetHead'),body=document.getElementById('projectDataSheetBody');if(!head||!body)return;
 const dataCols=projectDataSheetDraft.reduce((m,r)=>Math.max(m,r.length),0),colCount=Math.max(12,Math.min(60,dataCols||12)),rowCount=Math.max(20,Math.min(PROJECT_DATASHEET_PREVIEW_ROWS,projectDataSheetDraft.length||20));
 head.innerHTML=`<tr><th style="min-width:52px">순번</th>${Array.from({length:colCount},(_,i)=>`<th>${projectSheetColumnName(i)}</th>`).join('')}</tr>`;
 body.innerHTML=Array.from({length:rowCount},(_,ri)=>`<tr><td>${ri+1}</td>${Array.from({length:colCount},(_,ci)=>`<td contenteditable="true" spellcheck="false" oninput="updateProjectDataSheetCell(${ri},${ci},this.textContent)" onpaste="handleProjectDataSheetPaste(event,${ri},${ci})">${esc(projectDataSheetDraft[ri]?.[ci]||'')}</td>`).join('')}</tr>`).join('');
 const note=document.getElementById('projectDataSheetNote');if(note)note.textContent=projectDataSheetDraft.length>PROJECT_DATASHEET_PREVIEW_ROWS?`전체 ${projectDataSheetDraft.length.toLocaleString()}행 중 앞 ${PROJECT_DATASHEET_PREVIEW_ROWS}행 표시 · 저장 시 전체 행 보관`:'표의 첫 번째 셀을 클릭한 뒤 Ctrl+V 하세요.';
}
function clearProjectDataSheetDraft(){if(!projectDataSheetDraft.length||confirm(`붙여넣은 자료 ${projectDataSheetDraft.length.toLocaleString()}행을 모두 지우시겠습니까?`)){projectDataSheetDraft=[];renderProjectDataSheetDraft()}}

let projectMaterialModeDraft='excel';
let projectPptDraft=[];
const MAX_PROJECT_PPT_ITEMS=30;
function switchProjectMaterialMode(mode){
 projectMaterialModeDraft=mode==='ppt'?'ppt':'excel';const excel=document.getElementById('projectExcelPastePanel'),ppt=document.getElementById('projectPptPastePanel');if(excel)excel.style.display=projectMaterialModeDraft==='excel'?'block':'none';if(ppt)ppt.style.display=projectMaterialModeDraft==='ppt'?'block':'none';setTimeout(()=>{if(projectMaterialModeDraft==='excel')renderProjectDataSheetDraft();else renderProjectPptPages()},0);
}
let projectPptHtmlDraft='';
function sanitizeProjectPptHtml(source){const box=document.createElement('div');box.innerHTML=String(source||'');box.querySelectorAll('script,iframe,object,embed,link,meta,base').forEach(x=>x.remove());box.querySelectorAll('*').forEach(el=>[...el.attributes].forEach(a=>{if(/^on/i.test(a.name)||a.name.toLowerCase()==='srcdoc')el.removeAttribute(a.name)}));return box.innerHTML}
function projectPptContentCount(html=projectPptHtmlDraft){const box=document.createElement('div');box.innerHTML=html||'';const images=box.querySelectorAll('img').length,tables=box.querySelectorAll('table').length,text=(box.textContent||'').trim();return images+tables+(text?1:0)}
async function inlineProjectPptBlobImages(editor){for(const img of [...editor.querySelectorAll('img')]){if(!img.src.startsWith('blob:'))continue;try{const blob=await fetch(img.src).then(r=>r.blob()),x=await compressProjectCapture(new File([blob],'PPT 붙여넣기',{type:blob.type||'image/png'}));img.src=x.data}catch(e){console.warn('PPT 이미지 변환 실패',e)}}}
async function syncProjectPptRichEditor(){const editor=document.getElementById('projectPptRichEditor');if(!editor)return;await inlineProjectPptBlobImages(editor);projectPptHtmlDraft=sanitizeProjectPptHtml(editor.innerHTML);const count=document.getElementById('projectPptCount');if(count)count.textContent=`현재 ${projectPptContentCount()}개`;const status=document.getElementById('projectPptPasteStatus');if(status)status.textContent=projectPptHtmlDraft?'✓ PPT 붙여넣기 내용이 저장 준비되었습니다.':'PPT 편집창을 클릭한 뒤 Ctrl+V 하세요.'}
function appendProjectPptFallback(editor,images,text){return (async()=>{for(const file of images){try{const x=await compressProjectCapture(file),img=document.createElement('img');img.src=x.data;img.alt='PPT 슬라이드/그림';editor.appendChild(img)}catch(e){console.warn(e)}}if(!images.length&&text){const block=document.createElement('div');block.style.whiteSpace='pre-wrap';block.textContent=text;editor.appendChild(block)}await syncProjectPptRichEditor()})()}
function handleProjectPptNativePaste(event){const editor=event.currentTarget,before=editor.innerHTML,items=[...(event.clipboardData?.items||[])],images=items.filter(x=>x.kind==='file').map(x=>x.getAsFile()).filter(isProjectImageFile),text=event.clipboardData?.getData('text/plain')||'';setTimeout(async()=>{if(editor.innerHTML===before){if(images.length||text.trim())await appendProjectPptFallback(editor,images,text.trim());else{const status=document.getElementById('projectPptPasteStatus');if(status)status.textContent='붙여넣을 내용을 인식하지 못했습니다. PPT 화면을 캡처한 뒤 다시 Ctrl+V 해주세요.'}}else await syncProjectPptRichEditor()},80)}
function renderProjectPptRichEditor(){const editor=document.getElementById('projectPptRichEditor');if(!editor)return;editor.innerHTML=sanitizeProjectPptHtml(projectPptHtmlDraft);const count=document.getElementById('projectPptCount');if(count)count.textContent=`현재 ${projectPptContentCount()}개`;const status=document.getElementById('projectPptPasteStatus');if(status)status.textContent=projectPptHtmlDraft?'저장된 PPT 붙여넣기 자료입니다. 계속 Ctrl+V 할 수 있습니다.':'PPT 편집창을 클릭한 뒤 Ctrl+V 하세요.'}
function clearProjectPptDraft(){if(!projectPptHtmlDraft&&!projectPptDraft.length||confirm('붙여넣은 PPT 자료를 모두 지우시겠습니까?')){projectPptDraft=[];projectPptHtmlDraft='';const editor=document.getElementById('projectPptRichEditor');if(editor)editor.innerHTML='';renderProjectPptRichEditor()}}

let projectPptPagesDraft=[];
const DEFAULT_PROJECT_PPT_PAGES=5;
function ensureProjectPptPages(){while(projectPptPagesDraft.length<DEFAULT_PROJECT_PPT_PAGES)projectPptPagesDraft.push('')}
function projectPptSavedPageCount(){return projectPptPagesDraft.filter(x=>String(x||'').replace(/<[^>]*>/g,'').trim()||/<img|<table/i.test(x||'')).length}
function updateProjectPptPageCount(){const count=document.getElementById('projectPptCount');if(count)count.textContent=`저장 ${projectPptSavedPageCount()} / 전체 ${projectPptPagesDraft.length}페이지`}
async function syncProjectPptPageEditor(index,editor){if(!editor)return;await inlineProjectPptBlobImages(editor);projectPptPagesDraft[index]=sanitizeProjectPptHtml(editor.innerHTML);updateProjectPptPageCount();const status=document.getElementById('projectPptPasteStatus');if(status)status.textContent=`✓ PPT 페이지 ${index+1} 저장 준비됨`}
function focusProjectPptPage(index){const editor=document.querySelector(`[data-ppt-page="${index}"]`);if(!editor)return;editor.focus({preventScroll:true});const sel=window.getSelection(),range=document.createRange();range.selectNodeContents(editor);range.collapse(false);sel.removeAllRanges();sel.addRange(range);document.querySelectorAll('.ppt-page-card').forEach(x=>x.style.boxShadow='');editor.closest('.ppt-page-card').style.boxShadow='0 0 0 3px rgba(79,120,128,.18)'}
function restoreProjectPptScroll(scroller,top,winY){requestAnimationFrame(()=>{if(scroller)scroller.scrollTop=top;window.scrollTo(window.scrollX,winY)});setTimeout(()=>{if(scroller)scroller.scrollTop=top;window.scrollTo(window.scrollX,winY)},160)}
function appendProjectPptHtml(editor,html){
 const clean=sanitizeProjectPptHtml(html);if(!clean)return false;
 const box=document.createElement('div');box.innerHTML=clean;
 box.querySelectorAll('img').forEach(img=>{if(/^file:/i.test(img.getAttribute('src')||''))img.remove()});
 if(!(box.textContent||'').trim()&&!box.querySelector('img,table,svg'))return false;
 while(box.firstChild)editor.appendChild(box.firstChild);return true;
}
async function appendProjectPptClipboard(editor,payload={}){
 const images=[...(payload.images||[])].filter(Boolean);let added=false;
 for(const file of images){try{const x=await compressProjectCapture(file),img=document.createElement('img');img.src=x.data;img.alt='PPT 슬라이드/그림';editor.appendChild(img);added=true}catch(e){console.warn('PPT 이미지 붙여넣기 실패',e)}}
 if(!added&&payload.html)added=appendProjectPptHtml(editor,payload.html);
 if(!added&&String(payload.text||'').trim()){const block=document.createElement('div');block.style.whiteSpace='pre-wrap';block.textContent=String(payload.text).trim();editor.appendChild(block);added=true}
 return added;
}
async function handleProjectPptPagePaste(event,index){
 event.preventDefault();event.stopPropagation();
 const editor=event.currentTarget,scroller=document.querySelector('.modalbox'),scrollTop=scroller?.scrollTop||0,winY=window.scrollY,clip=event.clipboardData;
 const itemImages=[...(clip?.items||[])].filter(x=>x.kind==='file').map(x=>x.getAsFile()).filter(isProjectImageFile);
 const fileImages=[...(clip?.files||[])].filter(isProjectImageFile);
 const images=[...new Map([...itemImages,...fileImages].map(x=>[`${x.name}|${x.size}|${x.type}`,x])).values()];
 const added=await appendProjectPptClipboard(editor,{images,html:clip?.getData('text/html')||'',text:clip?.getData('text/plain')||''});
 const status=document.getElementById('projectPptPasteStatus');
 if(!added){if(status)status.textContent=`페이지 ${index+1}: 클립보드 내용을 읽지 못했습니다. PPT에서 슬라이드 화면을 캡처한 뒤 다시 붙여넣으세요.`;alert('붙여넣을 수 있는 이미지·표·텍스트를 찾지 못했습니다.\nPowerPoint 슬라이드 화면을 캡처한 뒤 이 칸을 한 번 클릭하고 Ctrl+V 해주세요.')}else if(status)status.textContent=`✓ PPT 페이지 ${index+1} 붙여넣기 완료 · 프로젝트 저장을 눌러주세요.`;
 await syncProjectPptPageEditor(index,editor);focusProjectPptPage(index);restoreProjectPptScroll(scroller,scrollTop,winY);
}
async function pasteProjectPptPageFromClipboard(index){
 const editor=document.querySelector(`[data-ppt-page="${index}"]`);if(!editor)return;focusProjectPptPage(index);
 const scroller=document.querySelector('.modalbox'),scrollTop=scroller?.scrollTop||0,winY=window.scrollY,status=document.getElementById('projectPptPasteStatus');
 try{
  let images=[],html='',text='';
  if(navigator.clipboard?.read){const items=await navigator.clipboard.read();for(const item of items){for(const type of item.types){if(type.startsWith('image/'))images.push(new File([await item.getType(type)],'PPT-clipboard',{type}));else if(type==='text/html'&&!html)html=await (await item.getType(type)).text();else if(type==='text/plain'&&!text)text=await (await item.getType(type)).text()}}}
  else if(navigator.clipboard?.readText)text=await navigator.clipboard.readText();
  const added=await appendProjectPptClipboard(editor,{images,html,text});
  if(!added)throw new Error('지원되는 클립보드 내용 없음');
  await syncProjectPptPageEditor(index,editor);if(status)status.textContent=`✓ PPT 페이지 ${index+1} 붙여넣기 완료 · 프로젝트 저장을 눌러주세요.`;restoreProjectPptScroll(scroller,scrollTop,winY);
 }catch(e){if(status)status.textContent='브라우저가 클립보드 읽기를 허용하지 않았습니다. 페이지 칸을 클릭한 뒤 Ctrl+V 하세요.';alert('클립보드 자동 읽기가 차단되었습니다.\n페이지의 흰색 칸을 한 번 클릭한 뒤 Ctrl+V로 붙여넣어 주세요.')}
}
function isPptFile(file){return !!file&&(/\.(ppt|pptx)$/i.test(file.name||'')||/powerpoint|presentation/i.test(file.type||''))}
function isProjectImageFile(file){return !!file&&(/^image\//i.test(file.type||'')||/\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name||''))}
function uniqueClipboardFiles(items=[],files=[]){const all=[...items].filter(x=>x.kind==='file').map(x=>x.getAsFile()).filter(Boolean).concat([...files].filter(Boolean));return [...new Map(all.map(x=>[`${x.name}|${x.size}|${x.type}`,x])).values()]}
async function readProjectPptClipboardImages(){const files=[];if(!navigator.clipboard?.read)return files;try{const items=await navigator.clipboard.read();for(const item of items){for(const type of item.types||[]){if(!/^image\//i.test(type))continue;const blob=await item.getType(type),ext=type.includes('jpeg')?'jpg':(type.split('/')[1]||'png').replace(/[^a-z0-9]/gi,'')||'png';files.push(new File([blob],`클립보드_캡처_${files.length+1}.${ext}`,{type}))}}}catch(e){console.warn('보조 클립보드 이미지 읽기 실패',e)}return files}
async function importProjectPptImagesAsPages(images=[]){
 let imported=0;
 for(const file of images){try{const x=await compressProjectCapture(file);let index=projectPptPagesDraft.findIndex(v=>!String(v||'').replace(/<[^>]*>/g,'').trim()&&!/<img|<table/i.test(v||''));if(index<0){index=projectPptPagesDraft.length;projectPptPagesDraft.push('')}projectPptPagesDraft[index]=`<img src="${x.data}" alt="PPT 슬라이드 ${index+1}">`;imported++}catch(e){console.warn('PPT 전체페이지 이미지 변환 실패',e)}}
 return imported;
}
function updateProjectPptWholeFileStatus(){
 const el=document.getElementById('projectPptWholeFileStatus');if(!el)return;const files=(projectAttachmentDraft||[]).filter(isPptFile);el.innerHTML=files.length?`<b>전체 PPT 파일 ${files.length}개 저장 준비됨</b> · ${files.map(x=>esc(x.name)).join(', ')}`:'PPT 또는 PPTX 파일을 복사한 뒤 이 영역을 클릭하고 Ctrl+V 하세요.';
}
async function receiveProjectPptWholeFiles(files=[]){
 const pptFiles=[...files].filter(isPptFile);if(!pptFiles.length)return 0;await addProjectAttachmentFiles(pptFiles);renderProjectAttachmentDraft();updateProjectPptWholeFileStatus();return pptFiles.length;
}
async function handleProjectPptWholeFileInput(input){await receiveProjectPptWholeFiles([...(input.files||[])]);input.value=''}
async function handleProjectPptSlideImagesInput(input){
 const images=[...(input.files||[])].filter(isProjectImageFile).sort((a,b)=>String(a.webkitRelativePath||a.name).localeCompare(String(b.webkitRelativePath||b.name),'ko',{numeric:true}));input.value='';
 if(!images.length)return alert('슬라이드 이미지 파일을 찾지 못했습니다. PNG 또는 JPG 파일을 선택하세요.');
 if(projectPptSavedPageCount()&&!confirm(`기존 페이지 미리보기를 지우고 선택한 슬라이드 이미지 ${images.length}장으로 교체하시겠습니까?`))return;
 projectPptPagesDraft=[];const imported=await importProjectPptImagesAsPages(images);ensureProjectPptPages();renderProjectPptPages();const status=document.getElementById('projectPptPasteStatus');if(status)status.textContent=`✓ 전체 슬라이드 ${imported}장을 순서대로 자동 배치했습니다. 프로젝트 저장을 눌러주세요.`;
}
async function handleProjectPptAllDrop(event){event.preventDefault();event.currentTarget.classList.remove('dragover');await processProjectPptAllPayload([...(event.dataTransfer?.files||[])],event.dataTransfer?.getData('text/html')||'',event.dataTransfer?.getData('text/plain')||'')}
async function handleProjectPptAllPaste(event){event.preventDefault();event.stopPropagation();const clip=event.clipboardData;let files=uniqueClipboardFiles([...(clip?.items||[])],[...(clip?.files||[])]);if(!files.some(x=>isProjectImageFile(x)||isPptFile(x)))files=uniqueClipboardFiles([],files.concat(await readProjectPptClipboardImages()));await processProjectPptAllPayload(files,clip?.getData('text/html')||'',clip?.getData('text/plain')||'')}
async function processProjectPptAllPayload(files=[],html='',text=''){
 const status=document.getElementById('projectPptPasteStatus'),pptFiles=files.filter(isPptFile),images=files.filter(isProjectImageFile);
 if(pptFiles.length){const count=await receiveProjectPptWholeFiles(pptFiles);if(status)status.textContent=`✓ PPT 전체 파일 ${count}개 저장 준비됨 · 프로젝트 저장을 눌러주세요.`;return}
 const imported=await importProjectPptImagesAsPages(images);
 if(imported){renderProjectPptPages();if(status)status.textContent=imported===1?'✓ 캡처 이미지 1장을 첫 번째 빈 PPT 페이지에 붙여넣었습니다. 프로젝트 저장을 눌러주세요.':`✓ 캡처/슬라이드 이미지 ${imported}장을 페이지별로 자동 배치했습니다.`;return}
 if(html||String(text).trim()){let index=projectPptPagesDraft.findIndex(v=>!String(v||'').trim());if(index<0){index=projectPptPagesDraft.length;projectPptPagesDraft.push('')}const box=document.createElement('div');if(!appendProjectPptHtml(box,html)){box.style.whiteSpace='pre-wrap';box.textContent=String(text).trim()}projectPptPagesDraft[index]=sanitizeProjectPptHtml(box.innerHTML);renderProjectPptPages();if(status)status.textContent='✓ PPT 내용을 한 페이지로 가져왔습니다.';return}
 if(status)status.textContent='PPT 파일 또는 여러 슬라이드 이미지를 인식하지 못했습니다.';alert('PPT 전체 파일을 복사하거나, 여러 슬라이드를 이미지로 선택한 뒤 다시 Ctrl+V 해주세요.')
}
function renderProjectPptPages(){ensureProjectPptPages();const panel=document.getElementById('projectPptPastePanel');if(!panel)return;if(!document.getElementById('projectPptPages'))panel.innerHTML=`<div class="toprow" style="margin:6px 0"><b id="projectPptCount" class="badge b-run">저장 0 / 전체 5페이지</b><button type="button" onclick="clearProjectPptPages()">페이지 미리보기 지우기</button><span id="projectPptPasteStatus" class="small muted">PowerPoint의 일반 Ctrl+V는 한 장만 전달될 수 있습니다.</span></div><div class="card" style="margin:8px 0;background:#eef6f5"><b>전 페이지를 한 번에 넣는 방법</b><div class="small" style="margin-top:5px">PowerPoint에서 PNG/JPG로 저장할 때 「모든 슬라이드」 선택 → 아래 버튼으로 이미지 전체 또는 폴더를 한 번 선택하세요.</div><div class="toprow" style="margin-top:9px"><input id="projectPptSlideImagesInput" type="file" accept="image/png,image/jpeg,image/webp,image/bmp,image/gif" multiple style="display:none" onchange="handleProjectPptSlideImagesInput(this)"><button type="button" class="primary" onclick="document.getElementById('projectPptSlideImagesInput').click()">슬라이드 이미지 전체 선택</button><input id="projectPptSlideFolderInput" type="file" accept="image/png,image/jpeg,image/webp,image/bmp,image/gif" multiple webkitdirectory directory style="display:none" onchange="handleProjectPptSlideImagesInput(this)"><button type="button" class="primary" onclick="document.getElementById('projectPptSlideFolderInput').click()">슬라이드 폴더 선택</button></div></div><div id="projectPptAllPasteZone" class="capture-paste-zone" tabindex="0" onclick="this.focus()" onpaste="handleProjectPptAllPaste(event)" ondragover="event.preventDefault();this.classList.add('dragover')" ondragleave="this.classList.remove('dragover')" ondrop="handleProjectPptAllDrop(event)"><b>캡처 이미지 파일 · 클립보드 붙여넣기</b><br><span class="small">이미지 또는 이미지 파일 Ctrl+C → 이 영역 한 번 클릭 → Ctrl+V · 여러 장은 페이지별 자동 배치</span></div><div class="toprow" style="margin-bottom:8px"><input id="projectPptWholeFileInput" type="file" accept=".ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" multiple style="display:none" onchange="handleProjectPptWholeFileInput(this)"><button type="button" onclick="document.getElementById('projectPptWholeFileInput').click()">PPT 원본 전체 파일 보관</button><span id="projectPptWholeFileStatus" class="small muted"></span></div><details><summary style="cursor:pointer;font-weight:700">페이지별 미리보기·수정</summary><div id="projectPptPages" class="ppt-page-list"></div><div style="display:flex;justify-content:center;padding:14px 0 4px"><button type="button" class="primary" onclick="addProjectPptPage()">＋ 마지막 하단에 PPT 페이지 추가</button></div></details>`;const box=document.getElementById('projectPptPages');box.innerHTML=projectPptPagesDraft.map((html,i)=>`<div class="ppt-page-card" onclick="if(!event.target.closest('button'))focusProjectPptPage(${i})"><div class="ppt-page-head"><b>PPT 페이지 ${i+1} · 미리보기/직접 수정</b><span><button type="button" class="primary" onclick="pasteProjectPptPageFromClipboard(${i})">이 페이지만 붙여넣기</button> <button type="button" class="danger" onclick="removeProjectPptPage(${i})">페이지 삭제</button></span></div><div class="ppt-page-editor" contenteditable="true" spellcheck="false" data-ppt-page="${i}" tabindex="0" onpaste="handleProjectPptPagePaste(event,${i})" oninput="syncProjectPptPageEditor(${i},this)">${sanitizeProjectPptHtml(html)}</div></div>`).join('');updateProjectPptPageCount();updateProjectPptWholeFileStatus()}
function addProjectPptPage(){projectPptPagesDraft.push('');renderProjectPptPages();setTimeout(()=>document.querySelector(`[data-ppt-page="${projectPptPagesDraft.length-1}"]`)?.focus(),0)}
function removeProjectPptPage(index){if(!confirm(`PPT 페이지 ${index+1}을 삭제하시겠습니까?`))return;projectPptPagesDraft.splice(index,1);ensureProjectPptPages();renderProjectPptPages()}
function clearProjectPptPages(){if(projectPptSavedPageCount()&&!confirm('붙여넣은 PPT 페이지 자료를 모두 지우시겠습니까?'))return;projectPptPagesDraft=Array(DEFAULT_PROJECT_PPT_PAGES).fill('');projectPptHtmlDraft='';projectPptDraft=[];renderProjectPptPages()}
async function syncAllProjectPptPages(){for(const editor of document.querySelectorAll('[data-ppt-page]'))await syncProjectPptPageEditor(Number(editor.dataset.pptPage),editor)}

let projectAttachmentDraft=[];
let projectAttachmentPending=new Map();
let projectAttachmentRemoved=new Set();
const MAX_PROJECT_ATTACHMENTS=50;
const PROJECT_FILE_DB='gacs_project_files_v1';
function openProjectFileDB(){return Promise.resolve(csStore.facade())}
async function putProjectAttachmentBlob(id,file){const dbx=await openProjectFileDB();return new Promise((resolve,reject)=>{const tx=dbx.transaction('files','readwrite');tx.objectStore('files').put({id,blob:file});tx.oncomplete=()=>{dbx.close();resolve()};tx.onerror=()=>{dbx.close();reject(tx.error||new Error('첨부파일 저장 실패'))}})}
async function getProjectAttachmentBlob(id){const pending=projectAttachmentPending.get(id);if(pending)return pending;const dbx=await openProjectFileDB();return new Promise((resolve,reject)=>{const req=dbx.transaction('files','readonly').objectStore('files').get(id);req.onsuccess=()=>{dbx.close();resolve(req.result?.blob||null)};req.onerror=()=>{dbx.close();reject(req.error)}})}
async function deleteProjectAttachmentBlob(id){try{const dbx=await openProjectFileDB();await new Promise((resolve,reject)=>{const tx=dbx.transaction('files','readwrite');tx.objectStore('files').delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});dbx.close()}catch(e){console.warn('첨부파일 정리 실패',e)}}
function projectAttachmentReferenced(id){return (db.projects||[]).some(p=>(p.attachments||[]).some(x=>x.id===id))}
function formatFileSize(size){const n=Number(size)||0;if(n<1024)return n+' B';if(n<1048576)return (n/1024).toFixed(1)+' KB';return (n/1048576).toFixed(n<10485760?1:0)+' MB'}
function projectFileType(x){const ext=(x.name||'').split('.').pop()?.toUpperCase()||'FILE';return ext.length<=6?ext:'FILE'}
async function addProjectAttachmentFiles(fileList){
 const files=[...(fileList||[])].filter(Boolean);if(!files.length)return alert('첨부할 파일을 찾지 못했습니다.');
 if(projectAttachmentDraft.length+files.length>MAX_PROJECT_ATTACHMENTS)return alert(`프로젝트당 첨부자료는 최대 ${MAX_PROJECT_ATTACHMENTS}개까지 저장할 수 있습니다.`);
 files.forEach(file=>{const id='ATT-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);projectAttachmentDraft.push({id,name:file.name||'첨부자료',type:file.type||'application/octet-stream',size:file.size||0,addedAt:new Date().toISOString()});projectAttachmentPending.set(id,file)});renderProjectAttachmentDraft();
}
function handleProjectAttachmentInput(input){addProjectAttachmentFiles(input.files);input.value=''}
function renderProjectAttachmentDraft(){
 const count=document.getElementById('projectAttachmentCount');if(count)count.textContent=`현재 ${projectAttachmentDraft.length} / ${MAX_PROJECT_ATTACHMENTS}개`;
 const el=document.getElementById('projectAttachmentList');if(!el)return;
 el.innerHTML=projectAttachmentDraft.map((x,i)=>`<div class="project-file-row"><div class="project-file-name" title="${esc(x.name)}">📎 ${esc(x.name)}</div><span class="badge b-pre">${esc(projectFileType(x))}</span><span class="small muted">${formatFileSize(x.size)}</span><div><button type="button" onclick="openProjectAttachment(${i})">열기/저장</button> <button type="button" class="danger" onclick="removeProjectAttachment(${i})">삭제</button></div></div>`).join('')||'<div class="muted small">첨부된 형교환/개조 자료가 없습니다.</div>';
}
function removeProjectAttachment(index){const x=projectAttachmentDraft[index];if(!x)return;if(!confirm(`첨부자료 "${x.name}"을 목록에서 삭제하시겠습니까?`))return;projectAttachmentDraft.splice(index,1);if(projectAttachmentPending.has(x.id))projectAttachmentPending.delete(x.id);else projectAttachmentRemoved.add(x.id);renderProjectAttachmentDraft();updateProjectPptWholeFileStatus()}
async function openProjectAttachment(index){
 const x=projectAttachmentDraft[index];if(!x)return;try{const blob=await getProjectAttachmentBlob(x.id);if(!blob)return alert('첨부파일 원본을 찾지 못했습니다. 이 파일을 저장했던 PC와 브라우저에서 열어주세요.');const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=x.name||'첨부자료';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}catch(e){alert('첨부파일을 열지 못했습니다: '+e.message)}
}
async function persistProjectAttachmentDraft(){for(const [id,file] of projectAttachmentPending)await putProjectAttachmentBlob(id,file)}
async function cleanupRemovedProjectAttachments(){for(const id of projectAttachmentRemoved){if(!projectAttachmentReferenced(id))await deleteProjectAttachmentBlob(id)}projectAttachmentRemoved.clear();projectAttachmentPending.clear()}

let projectBomDraft=[];
function bomDraftValue(x,field,project){if(field==='projectNo')return x.projectNo||project.projectNo||'';if(field==='drawingNo')return x.drawingNo||x.partNo||'';if(field==='materialName')return x.materialName||x.partName||'';if(field==='orderQty')return x.orderQty||x.qty||'';if(field==='unit')return x.unit||'EA';return x[field]||''}
function bomDraftHasData(x){return !!x&&BOM_IMPORT_FIELDS.some(([field])=>field!=='projectNo'&&String(x[field]??'').trim())}
function editableBomGridRow(x,rowIndex,project){return `<tr><td>${rowIndex+1}</td>${BOM_IMPORT_FIELDS.map(([field],colIndex)=>`<td contenteditable="true" spellcheck="false" data-bom-row="${rowIndex}" data-bom-col="${colIndex}" oninput="updateProjectBomCell(${rowIndex},'${field}',this.textContent)" onpaste="handleProjectBomCellPaste(event,${rowIndex},${colIndex})">${esc(bomDraftValue(x,field,project))}</td>`).join('')}<td></td></tr>`}
function updateProjectBomCell(rowIndex,field,value){while(projectBomDraft.length<=rowIndex)projectBomDraft.push({id:'BOM-'+Date.now()+'-'+projectBomDraft.length});projectBomDraft[rowIndex][field]=String(value||'').trim();const projectNo=document.getElementById('f_projectNo')?.value||'';if(!projectBomDraft[rowIndex].projectNo)projectBomDraft[rowIndex].projectNo=projectNo;const count=document.getElementById('projectBomCount');if(count)count.textContent=`현재 ${projectBomDraft.filter(bomDraftHasData).length.toLocaleString()}행`}
function handleProjectBomCellPaste(event,rowIndex,colIndex){
 event.preventDefault();const rows=clipboardTableRows(event);if(!rows.length)return alert('Excel에서 BOM 셀 범위를 먼저 Ctrl+C 해주세요.');const project={projectNo:document.getElementById('f_projectNo')?.value||''},hasHeader=rows.slice(0,10).some(r=>r.some(v=>normalizeBomHeader(v).includes('프로젝트번호'))&&r.some(v=>normalizeBomHeader(v).includes('자재명'))),mode=document.getElementById('projectBomPasteMode')?.value||'replace';let added=0;
 if(hasHeader){const items=bomRowsToItems(rows,project);if(!items.length)return alert('BOM 행을 인식하지 못했습니다.');projectBomDraft=mode==='append'?[...projectBomDraft,...items]:items;added=items.length}
 else{if(mode==='replace')projectBomDraft=[];const startRow=mode==='append'?projectBomDraft.length:rowIndex,fields=BOM_IMPORT_FIELDS.map(x=>x[0]);rows.forEach((r,ri)=>{const target=startRow+ri;while(projectBomDraft.length<=target)projectBomDraft.push({id:'BOM-'+Date.now()+'-'+projectBomDraft.length,projectNo:project.projectNo});r.forEach((value,ci)=>{const field=fields[colIndex+ci];if(field)projectBomDraft[target][field]=String(value??'').trim()});added++})}
 projectBomDraft=projectBomDraft.filter(bomDraftHasData);renderProjectBomDraft();const note=document.getElementById('projectBomPreviewNote');if(note)note.textContent=`✓ Excel ${added.toLocaleString()}행이 셀에 입력되었습니다.`;
}
function renderProjectBomDraft(){
 const count=document.getElementById('projectBomCount');if(count)count.textContent=`현재 ${projectBomDraft.filter(bomDraftHasData).length.toLocaleString()}행`;const body=document.getElementById('projectBomPreviewBody');if(!body)return;const project={projectNo:document.getElementById('f_projectNo')?.value||''},rowCount=Math.max(20,Math.min(50,projectBomDraft.length||20));body.innerHTML=Array.from({length:rowCount},(_,i)=>editableBomGridRow(projectBomDraft[i]||{},i,project)).join('');const note=document.getElementById('projectBomPreviewNote');if(note)note.textContent=projectBomDraft.length>50?`전체 ${projectBomDraft.length.toLocaleString()}행 중 앞 50행 표시 · 저장 후 BOM 목록에서 전체 확인`:'첫 번째 빈 셀을 클릭한 뒤 Ctrl+V 하세요.';
}
function clearProjectBomDraft(){if(!projectBomDraft.length||confirm(`붙여넣은 BOM ${projectBomDraft.length.toLocaleString()}행을 모두 지우시겠습니까?`)){projectBomDraft=[];renderProjectBomDraft()}}

function projectForm(p={}){
return `<div class="formgrid">
<label>Site (대분류)<select id="f_site" onchange="applyProjectSiteDefaults()">${siteOptions(p.siteId)}</select><span class="small muted">Site를 선택하면 고객/OEM과 지역이 Site 최신정보로 자동 입력됩니다.</span></label>
<label>프로젝트 번호<input id="f_projectNo" value="${esc(p.projectNo||'')}"></label>
<label class="legacy-bom-ui">BOM${p.id?bomButton(p):'<button type="button" disabled>BOM 목록 (프로젝트 저장 후 사용)</button>'}<span class="small muted">클릭하면 이 프로젝트의 BOM 리스트가 열립니다.</span></label>
<label>구분
  <select id="f_projectTypePreset" onchange="applyProjectTypePreset()" ondblclick="enableProjectTypeCustom()">
    <option value="신규 형교환" ${(p.projectType||'신규 형교환')==='신규 형교환'?'selected':''}>1. 신규 형교환</option>
    <option value="기존 형교환" ${p.projectType==='기존 형교환'?'selected':''}>2. 기존 형교환</option>
    <option value="개조" ${p.projectType==='개조'?'selected':''}>3. 개조</option>
    <option value="OTHER" ${p.projectType && !['신규 형교환','기존 형교환','개조'].includes(p.projectType)?'selected':''}>4. 기타 / 직접입력</option>
  </select>
  <input id="f_projectType" value="${esc(p.projectType||'신규 형교환')}" placeholder="더블클릭 후 직접 입력" style="margin-top:5px"
    ${p.projectType && !['신규 형교환','기존 형교환','개조'].includes(p.projectType)?'':'readonly'}>
  <span class="small muted">구분은 신규 형교환·기존 형교환·개조 등으로 사용합니다. 개조 선택 후 모델에 PLC 또는 비전을 입력한 경우만 자재 완료 처리됩니다.</span>
</label>
<label>형교환 모델
  <input id="f_changeoverModel" value="${esc(p.changeoverModel||'')}" placeholder="예: E1472, PLC 개조, 비전 개조, PLC/비전 개조">
</label>
<label>OEM<input id="f_oem" value="${esc(p.oem)}"></label><label>장비명
  <select id="f_equipmentPreset" onchange="applyEquipmentPreset()" ondblclick="enableEquipmentCustom()">
    <option value="">장비명 선택</option>
    <option value="STACKING" ${(p.equipmentName||'').toUpperCase()==='STACKING'?'selected':''}>1. STACKING</option>
    <option value="NOTCHING" ${(p.equipmentName||'').toUpperCase()==='NOTCHING'?'selected':''}>2. NOTCHING</option>
    <option value="OTHER" ${p.equipmentName && !['STACKING','NOTCHING'].includes((p.equipmentName||'').toUpperCase())?'selected':''}>3. 기타</option>
  </select>
  <input id="f_equipmentName" value="${esc(p.equipmentName||'')}" placeholder="더블클릭 후 직접 입력" style="margin-top:5px" ${p.equipmentName && !['STACKING','NOTCHING'].includes((p.equipmentName||'').toUpperCase())?'':'readonly'}>
  <span class="small muted">1=STACKING, 2=NOTCHING, 3=기타 / 선택창을 더블클릭하면 장비명을 직접 입력할 수 있습니다.</span>
</label>
<label>라인<input id="f_line" value="${esc(p.line||'')}" placeholder="예: 1~7 Line"></label>
<label>라인 빠른입력
  <div class="toprow">
    <input id="f_lineStart" type="number" min="1" placeholder="시작" style="max-width:90px">
    <span>~</span>
    <input id="f_lineEnd" type="number" min="1" placeholder="종료" style="max-width:90px">
    <button type="button" onclick="setLineRange()">적용</button>
  </div>
  <span class="small muted">예: 시작 1 / 종료 7 → 1~7 Line</span>
</label><label>장비 대수<input id="f_equipmentCount" type="number" min="0" step="1" value="${esc(p.equipmentCount??'')}" placeholder="예: 3"><span class="small muted">이 프로젝트에 해당하는 장비 수량을 숫자로 입력하세요.</span></label><label>상태<select id="f_status">${['준비','진행','완료','보류','위험'].map(x=>`<option ${p.status===x?'selected':''}>${x}</option>`).join('')}</select></label>
<label>CS 담당<input id="f_cs" value="${esc(p.cs)}"></label><label>PM<input id="f_pm" value="${esc(p.pm)}"></label><label>Start<input id="f_start" type="date" value="${p.start||''}"></label><label>Due<input id="f_due" type="date" value="${p.due||''}"></label>
<label>진척 %<input id="f_progress" type="number" min="0" max="100" value="${p.progress??0}" readonly></label><label>Risk<select id="f_risk">${['Low','Medium','High'].map(x=>`<option ${p.risk===x?'selected':''}>${x}</option>`).join('')}</select></label><label class="span4">형교환/개조 진행 단계 <span class="small muted">기본 5단계를 제공하며 중간 단계는 자유롭게 추가·수정·삭제할 수 있습니다.</span>
<div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 8px">
<button type="button" onclick="loadDefaultMilestones()">기본 5단계 불러오기</button>
<button type="button" onclick="addMilestoneRow()">＋ 단계 추가</button>
</div>
<div id="milestoneEditor">${((p.milestones&&p.milestones.length)?p.milestones:defaultMilestones()).map((m,i)=>milestoneRowHtml(m,i)).join('')}</div>
<div class="small muted" style="margin-top:6px">기본: 1. 설계시작 → 2. 부품출도 → 3. 조립시작 → 4. 형교환/개조시작 → 5. 완료</div>
<div class="progress" style="margin-top:8px"><i id="milestoneBar" style="width:${p.progress||0}%"></i></div>
<div id="milestonePct" class="small">${p.progress||0}%</div></label><label class="span2">Notes<textarea id="f_notes">${esc(p.notes)}</textarea></label><label class="span4">① 캡처 바로 붙여넣기 <b id="projectCaptureCount" class="badge b-run">현재 0 / 30장</b><div id="projectCapturePasteZone" class="capture-paste-zone" tabindex="0" onpaste="handleProjectCapturePaste(event)" onclick="this.focus()">BOM 화면 캡처 후 Ctrl+V — 여러 장 반복 붙여넣기</div><span class="small muted">이미지 캡처 자료를 보관할 때 사용합니다. 최대 30장.</span><div id="projectCapturePreview" class="capture-grid"></div></label><label class="span4">② BOM DataSheet Table — Excel 내용 직접 붙여넣기 <b id="projectBomCount" class="badge b-run">현재 0행</b><div class="toprow" style="margin:6px 0"><select id="projectBomPasteMode" style="max-width:190px"><option value="replace">붙여넣은 표로 교체</option><option value="append">기존 BOM에 추가</option></select><button type="button" onclick="clearProjectBomDraft()">붙여넣은 표 지우기</button><span id="projectBomPreviewNote" class="small muted">첫 번째 빈 셀을 클릭한 뒤 Excel 셀 범위를 Ctrl+V 하세요.</span></div><div id="projectBomTablePaste" class="tablewrap" style="max-height:410px"><table class="bom-sheet excel-cell-grid"><thead>${bomGridHeader()}</thead><tbody id="projectBomPreviewBody"></tbody></table></div></label><label class="span4">③ 형교환/개조 자료 직접 붙여넣기<div class="toprow" style="margin:7px 0"><b>자료 종류</b><select id="projectMaterialMode" onchange="switchProjectMaterialMode(this.value)" style="max-width:220px"><option value="excel" ${(p.materialMode||'excel')==='excel'?'selected':''}>Excel 표 붙여넣기</option><option value="ppt" ${p.materialMode==='ppt'?'selected':''}>PPT 편집창 붙여넣기</option></select><span class="small muted">종류를 선택한 뒤 해당 화면에서 Ctrl+V 하세요.</span></div><div id="projectExcelPastePanel" style="display:${(p.materialMode||'excel')==='excel'?'block':'none'}"><div class="toprow" style="margin:6px 0"><b id="projectDataSheetCount" class="badge b-run">현재 0행</b><select id="projectDataSheetPasteMode" style="max-width:190px"><option value="replace">붙여넣은 표로 교체</option><option value="append">기존 표 아래에 추가</option></select><button type="button" onclick="clearProjectDataSheetDraft()">붙여넣은 표 지우기</button><span id="projectDataSheetNote" class="small muted">표의 첫 번째 셀을 클릭한 뒤 Ctrl+V 하세요.</span></div><div id="projectDataSheetTablePaste" class="tablewrap bom-table-paste" tabindex="0" onclick="this.focus()" onpaste="handleProjectDataSheetPaste(event,0,0)" style="max-height:410px"><table class="excel-cell-grid project-generic-grid"><thead id="projectDataSheetHead"></thead><tbody id="projectDataSheetBody"></tbody></table></div><div class="small muted" style="margin-top:6px">회사 Excel에서 셀 범위 Ctrl+C → A1 셀 클릭 → Ctrl+V · 최대 10,000행</div></div><div id="projectPptPastePanel" style="display:${p.materialMode==='ppt'?'block':'none'}"><div class="toprow" style="margin:6px 0"><b id="projectPptCount" class="badge b-run">현재 0개</b><button type="button" onclick="clearProjectPptDraft()">PPT 자료 전체 지우기</button><span id="projectPptPasteStatus" class="small muted">PPT 편집창을 클릭한 뒤 Ctrl+V 하세요.</span></div><div id="projectPptRichEditor" class="ppt-rich-editor" contenteditable="true" spellcheck="false" onpaste="handleProjectPptNativePaste(event)" oninput="syncProjectPptRichEditor()"></div><div class="small muted" style="margin-top:6px">PPT에서 슬라이드·그림·표·텍스트 선택 → Ctrl+C → 위 편집창 클릭 → Ctrl+V · 여러 번 계속 붙여넣기 가능</div></div><details style="margin-top:12px;padding:9px;border:1px solid var(--line);border-radius:7px"><summary style="cursor:pointer;font-weight:700">보안 해제 후 원본 파일 업로드 — 나중에 사용</summary><div style="margin-top:8px"><input id="projectAttachmentInput" type="file" multiple accept=".xlsx,.xls,.xlsm,.csv,.pptx,.ppt,.pdf,.docx,.doc,.zip,.7z,.png,.jpg,.jpeg,.gif,.txt" style="display:none" onchange="handleProjectAttachmentInput(this)"><button type="button" onclick="document.getElementById('projectAttachmentInput').click()">Excel·PPT·PDF 파일 선택</button> <b id="projectAttachmentCount" class="badge b-pre">현재 0 / 50개</b><span class="small muted" style="margin-left:8px">DRM 보안 해제 후에만 사용하세요.</span><div id="projectAttachmentList" class="project-file-list"></div></div></details></label><label class="span4">투입 인력 / 재투입 관리<div id="manpowerEditor">${(p.manpower||[]).map(m=>`<div class="toprow" style="margin:5px 0"><input data-mp-name value="${esc(m.name)}" placeholder="담당자"><input data-mp-role value="${esc(m.role)}" placeholder="역할"><input data-mp-in type="date" value="${m.inDate||''}"><input data-mp-out type="date" value="${m.outDate||''}"><button type="button" onclick="this.parentElement.remove()">삭제</button></div>`).join('')}</div><button type="button" onclick="addManpowerRow()">＋ 인력 추가 / 재투입</button><div class="small muted">동일 인원의 재투입은 별도 행으로 기록하여 투입/철수 이력을 보존합니다.</div></label></div>`;
}
function resetProjectAttachmentDraft(items=[]){projectAttachmentDraft=JSON.parse(JSON.stringify(items||[]));projectAttachmentPending=new Map();projectAttachmentRemoved=new Set()}
function resetProjectDataSheetDraft(rows=[]){projectDataSheetDraft=JSON.parse(JSON.stringify(rows||[]))}
function legacyProjectPptHtml(items=[]){return (items||[]).map(x=>x.type==='image'&&x.data?`<div><img src="${x.data}" alt="${esc(x.name||'PPT 자료')}"></div>`:`<div style="white-space:pre-wrap">${esc(x.text||'')}</div>`).join('')}
function resetProjectPptDraft(items=[],mode='excel',html='',pages=[]){projectPptDraft=JSON.parse(JSON.stringify(items||[]));projectPptHtmlDraft=html||legacyProjectPptHtml(projectPptDraft);projectPptPagesDraft=(pages&&pages.length)?JSON.parse(JSON.stringify(pages)):Array(DEFAULT_PROJECT_PPT_PAGES).fill('');if(projectPptHtmlDraft&&!projectPptPagesDraft.some(x=>String(x||'').trim()))projectPptPagesDraft[0]=projectPptHtmlDraft;ensureProjectPptPages();projectMaterialModeDraft=mode==='ppt'?'ppt':'excel'}
function newProject(){projectCaptureDraft=[];projectBomDraft=[];resetProjectDataSheetDraft();resetProjectPptDraft();resetProjectAttachmentDraft();modal('형교환 / 프로젝트 추가',projectForm(),`saveProject()`);setTimeout(()=>{applyProjectTypePreset();applyEquipmentPreset();renderProjectCaptureDraft();renderProjectBomDraft();switchProjectMaterialMode(projectMaterialModeDraft);renderProjectAttachmentDraft()},0)}
function editProject(id){let p=db.projects.find(x=>x.id===id);projectCaptureDraft=JSON.parse(JSON.stringify(p.captures||[]));projectBomDraft=JSON.parse(JSON.stringify(p.bomItems||[]));resetProjectDataSheetDraft(p.dataSheet||[]);resetProjectPptDraft(p.pptPasteItems||[],p.materialMode||'excel',p.pptRichHtml||'',p.pptPages||[]);resetProjectAttachmentDraft(p.attachments||[]);modal('형교환 / 프로젝트 편집 · '+p.id,projectForm(p),`saveProject('${id}')`,`deleteProjectDirect('${id}');closeModal()`);setTimeout(()=>{applyProjectTypePreset();applyEquipmentPreset();renderProjectCaptureDraft();renderProjectBomDraft();switchProjectMaterialMode(projectMaterialModeDraft);renderProjectAttachmentDraft()},0)}
async function saveProject(id){if(!val('f_site'))return alert('Site를 먼저 선택해야 저장할 수 있습니다.');if(!val('f_projectNo').trim())return alert('선택한 Site 안의 프로젝트 번호를 입력하세요.');if(document.querySelector('[data-ppt-page]'))await syncAllProjectPptPages();if(document.getElementById('projectPptRichEditor'))await syncProjectPptRichEditor();try{await persistProjectAttachmentDraft()}catch(e){return alert('첨부파일을 저장하지 못했습니다. 브라우저 저장공간을 확인해 주세요.\n'+e.message)}const isNew=!id;let p=id?db.projects.find(x=>x.id===id):{id:'P-'+Date.now(),createdAt:Date.now(),bomItems:[],captures:[],dataSheet:[],pptPasteItems:[],pptRichHtml:'',pptPages:[],attachments:[]};projectBomDraft=projectBomDraft.filter(bomDraftHasData);projectDataSheetDraft=normalizeProjectDataSheetRows(projectDataSheetDraft);const equipmentCountValue=val('f_equipmentCount'),projectTypeValue=val('f_projectType');Object.assign(p,{projectNo:val('f_projectNo'),projectType:projectTypeValue,materialUsage:materialUsageForProject(projectTypeValue,val('f_changeoverModel')),changeoverModel:val('f_changeoverModel'),siteId:val('f_site'),oem:val('f_oem'),equipmentName:val('f_equipmentName'),line:val('f_line'),equipmentCount:equipmentCountValue===''?'':Math.max(0,Math.floor(Number(equipmentCountValue)||0)),status:val('f_status'),cs:val('f_cs'),pm:val('f_pm'),start:val('f_start'),due:val('f_due'),progress:calcMilestoneProgress(true),risk:val('f_risk'),notes:val('f_notes'),captures:JSON.parse(JSON.stringify(projectCaptureDraft)),bomItems:JSON.parse(JSON.stringify(projectBomDraft)),materialMode:projectMaterialModeDraft,dataSheet:JSON.parse(JSON.stringify(projectDataSheetDraft)),pptPasteItems:JSON.parse(JSON.stringify(projectPptDraft)),pptRichHtml:projectPptHtmlDraft,pptPages:JSON.parse(JSON.stringify(projectPptPagesDraft)),attachments:JSON.parse(JSON.stringify(projectAttachmentDraft)),milestones:collectMilestones(),manpower:collectManpower()});if(isNew)db.projects.push(p);if(!save()){if(isNew)db.projects=db.projects.filter(x=>x.id!==p.id);return}await syncProjectMaterialRule(p);await cleanupRemovedProjectAttachments();closeModal();if(isNew)resetDashboardFilters();renderDashboard();renderProjects();if(isNew)alert(`신규 프로젝트가 저장되었습니다. 장비 ${p.equipmentCount===''?'미입력':p.equipmentCount+'대'} / 캡처 ${projectCaptureDraft.length}장 / BOM ${projectBomDraft.length.toLocaleString()}행 / Excel ${projectDataSheetDraft.length.toLocaleString()}행 / PPT ${projectPptSavedPageCount()}페이지 / 첨부자료 ${projectAttachmentDraft.length}개 저장 완료.`)}
function taskForm(t={}){
return `<div class="formgrid"><label>Site → 프로젝트 번호<select id="f_project"><option value="">선택</option>${[...db.projects].sort((a,b)=>siteName(a.siteId).localeCompare(siteName(b.siteId),'ko')||String(a.projectNo||a.id).localeCompare(String(b.projectNo||b.id),'ko',{numeric:true})).map(p=>`<option value="${p.id}" ${t.project===p.id?'selected':''}>${esc(siteName(p.siteId)+' → '+(p.projectNo||p.id))}</option>`).join('')}</select></label><label>업무명<input id="f_name" value="${esc(t.name)}"></label><label>구분<input id="f_type" value="${esc(t.type||'Mission')}"></label><label>담당<input id="f_owner" value="${esc(t.owner)}"></label><label>우선순위<select id="f_priority">${['Low','Medium','High'].map(x=>`<option ${t.priority===x?'selected':''}>${x}</option>`).join('')}</select></label><label>Due<input id="f_due" type="date" value="${t.due||''}"></label><label>상태<select id="f_status">${['준비','진행','완료','보류','위험'].map(x=>`<option ${t.status===x?'selected':''}>${x}</option>`).join('')}</select></label><label class="span2">메모<textarea id="f_note">${esc(t.note)}</textarea></label></div>`;
}
function newTask(){modal('Mission / 업무 등록',taskForm(),`saveTask()`)}
function editTask(id){let t=db.tasks.find(x=>x.id===id);modal('Mission / 업무 편집 · '+t.id,taskForm(t),`saveTask('${id}')`,`deleteItem('tasks','${id}')`)}
function saveTask(id){const p=db.projects.find(x=>x.id===val('f_project'));if(!p)return alert('Site와 프로젝트 번호를 먼저 선택하세요.');if(!p.siteId)return alert('선택한 프로젝트에 Site가 없습니다. 프로젝트 정보에서 Site를 먼저 지정하세요.');let t=id?db.tasks.find(x=>x.id===id):{id:'T-'+Date.now()};Object.assign(t,{name:val('f_name'),project:val('f_project'),type:val('f_type'),owner:val('f_owner'),priority:val('f_priority'),due:val('f_due'),status:val('f_status'),note:val('f_note')});if(!id)db.tasks.push(t);save();closeModal();renderTasks();renderDashboard()}
function deleteItem(type,id){
  if(!verifyDeletePassword('데이터 삭제 확인'))return;if(confirm('삭제하시겠습니까?')){db[type]=db[type].filter(x=>x.id!==id);save();closeModal();renderAll()}}
function renderAll(){[renderDailyReports,fillSiteFilters,renderDashboard,renderProjects,renderTasks,renderEffort,renderSites].forEach(fn=>{try{fn()}catch(e){console.error(fn.name,e)}})}

// ===== Native XLSX Export (offline / no external library) =====
function xmlEsc(v){
  return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[m]));
}
function xlsxCol(n){
  let s='';
  while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);}
  return s;
}
function crc32(bytes){
  let table=crc32.table;
  if(!table){
    table=crc32.table=new Uint32Array(256);
    for(let n=0;n<256;n++){
      let c=n;
      for(let k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);
      table[n]=c>>>0;
    }
  }
  let crc=0xFFFFFFFF;
  for(let i=0;i<bytes.length;i++) crc=table[(crc^bytes[i])&0xFF]^(crc>>>8);
  return (crc^0xFFFFFFFF)>>>0;
}
function u16(n){return new Uint8Array([n&255,(n>>>8)&255])}
function u32(n){return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255])}
function concatBytes(parts){
  const total=parts.reduce((a,p)=>a+p.length,0), out=new Uint8Array(total);
  let o=0; for(const p of parts){out.set(p,o);o+=p.length;} return out;
}
function zipStore(files){
  const enc=new TextEncoder(), locals=[], centrals=[];
  let offset=0;
  for(const f of files){
    const name=enc.encode(f.name), data=typeof f.data==='string'?enc.encode(f.data):f.data;
    const crc=crc32(data);
    const local=concatBytes([
      u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),
      u32(data.length),u32(data.length),u16(name.length),u16(0),name,data
    ]);
    locals.push(local);
    const central=concatBytes([
      u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),
      u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),
      u32(0),u32(offset),name
    ]);
    centrals.push(central);
    offset+=local.length;
  }
  const centralStart=offset;
  const centralBlob=concatBytes(centrals);
  const end=concatBytes([
    u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),
    u32(centralBlob.length),u32(centralStart),u16(0)
  ]);
  return concatBytes([...locals,centralBlob,end]);
}
function sheetXml(rows){
  let maxCols=0;
  const body=rows.map((row,ri)=>{
    maxCols=Math.max(maxCols,row.length);
    const cells=row.map((v,ci)=>{
      if(v===null||v===undefined||v==='') return '';
      const ref=xlsxCol(ci+1)+(ri+1);
      if(typeof v==='number' && isFinite(v)) return `<c r="${ref}" s="1"><v>${v}</v></c>`;
      if(typeof v==='boolean') return `<c r="${ref}" t="b"><v>${v?1:0}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
    }).join('');
    return `<row r="${ri+1}">${cells}</row>`;
  }).join('');
  const dim=maxCols?`A1:${xlsxCol(maxCols)}${Math.max(1,rows.length)}`:'A1';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="${dim}"/>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<sheetData>${body}</sheetData>
</worksheet>`;
}
function projectLabel(p){return p ? (p.projectNo||p.id||'') : ''}

function exportDurationDays(start,due){
  if(!start||!due)return '';
  const a=new Date(start), b=new Date(due);
  if(Number.isNaN(a.getTime())||Number.isNaN(b.getTime()))return '';
  return Math.max(0,Math.round((b-a)/86400000));
}
function projectSiteCode(p){
  const s=(db.sites||[]).find(x=>x.id===p.siteId);
  return (s?.groupName||s?.name||s?.id||p.siteId||'').replace(/^SK[-_ ]?/i,'SK-');
}
function makePjtPlanActualRows(){
  const rows=[
    ['SITE','프로젝트번호','형교환 모델','라인','장비명','내용','분류','현지 반입일자','시작일자','완료일자','PJT 진행여부','기간(DAY)','CS 담당','PM','비고']
  ];
  const arr=[...(db.projects||[])].sort((a,b)=>{
    const sa=siteGroupName(a.siteId)||'', sb=siteGroupName(b.siteId)||'';
    if(sa!==sb)return sa.localeCompare(sb,'ko',{numeric:true});
    return String(a.projectNo||a.id||'').localeCompare(String(b.projectNo||b.id||''),'ko',{numeric:true});
  });
  arr.forEach(p=>{
    const content=(p.notes||p.name||'').trim();
    rows.push([
      projectSiteCode(p),
      p.projectNo||p.id||'',
      p.changeoverModel||'',
      p.line||'',
      p.equipmentName||'',
      content,
      '계획',
      p.localArrival||'',
      p.start||'',
      p.due||'',
      p.status||'',
      exportDurationDays(p.start,p.due),
      p.cs||'',
      p.pm||'',
      ''
    ]);
    rows.push([
      '',
      '',
      '',
      '',
      '',
      '',
      '실적',
      p.actualArrival||'',
      p.actualStart||'',
      p.actualDue||'',
      p.status==='완료'?'완료':'',
      exportDurationDays(p.actualStart,p.actualDue),
      '',
      '',
      ''
    ]);
  });
  return rows;
}

function makeXlsxSheets(){
  const sheets=[];
  const ps=db.projects||[];
  sheets.push({name:'00_PJT현황',rows:[
    ['26년 형교환 및 개조 PJT 실적 및 계획 현황'],
    ['구분','건수'],
    ['총 PJT',ps.length],
    ['진행중',ps.filter(p=>p.status==='진행').length],
    ['완료',ps.filter(p=>p.status==='완료').length],
    ['보류',ps.filter(p=>p.status==='보류').length],
    ['준비',ps.filter(p=>p.status==='준비').length],
    ['위험',ps.filter(p=>p.status==='위험').length],
    ['기한초과',ps.filter(p=>typeof isProjectOverdue==='function'&&isProjectOverdue(p)).length]
  ]});
  sheets.push({name:'01_형교환개조_PJT',rows:makePjtPlanActualRows()});
  sheets.push({name:'01B_PJT진행단계',rows:[
    ['Site','프로젝트번호','구분','형교환 모델','단계순번','단계명','예정일','완료여부'],
    ...(db.projects||[]).flatMap(p=>((p.milestones&&p.milestones.length)?p.milestones:defaultMilestones()).map((m,i)=>[
      siteName(p.siteId),p.projectNo||p.id,p.projectType||'기존 형교환',p.changeoverModel||'',i+1,m.name||'',m.due||'',m.done?'Y':'N'
    ]))
  ]});
  sheets.push({name:'02_SKO개조Item',rows:[
    ['프로젝트번호','Site','라인','설비번호','설비명','Item No.','개조 Item','적용','계획일','완료일','검증','담당자','Issue'],
    ...(db.sko||[]).map(x=>[x.projectNo||'',siteName(x.siteId),x.line||'',x.equipNo||'',x.equipName||'',x.itemNo||'',x.item||'',x.applied||'',x.planDate||'',x.doneDate||'',x.verified||'',x.owner||'',x.issue||''])
  ]});
  sheets.push({name:'03_제품규격',rows:[
    ['Site','라인','모델','제품명','제품규격','Part No.','Rev.','Cycle Time','적용 설비','관련 개조 Item','확인자'],
    ...(db.specs||[]).map(x=>[siteName(x.siteId),x.line||'',x.model||'',x.product||'',x.spec||'',x.part||'',x.rev||'',x.cycle||'',x.equipment||'',x.modItem||'',x.checker||''])
  ]});
  sheets.push({name:'04_설비출하',rows:[
    ['프로젝트번호','Site','설비번호','설비명','출하계획','실제출하','도착예정','현지도착','포장상태','운송방식','Tracking','설치완료','상태'],
    ...(db.shipping||[]).map(x=>[x.projectNo||'',siteName(x.siteId),x.equipNo||'',x.equipName||'',x.planShip||'',x.actualShip||'',x.eta||'',x.arrival||'',x.pack||'',x.transport||'',x.tracking||'',x.installDone||'',x.status||''])
  ]});
  sheets.push({name:'05_CS업무',rows:[
    ['업무ID','업무','프로젝트','Site','구분','담당','우선순위','Due','상태','메모'],
    ...(db.tasks||[]).map(t=>{
      const p=(db.projects||[]).find(x=>x.id===t.project);
      return [t.id||'',t.name||'',projectLabel(p),siteName(t.siteId||p?.siteId),t.type||'',t.owner||'',t.priority||'',t.due||'',t.status||'',t.note||''];
    })
  ]});
  sheets.push({name:'06_CS투입공수',rows:[
    ['프로젝트번호','Site','담당자','역할','업무구분','투입시작','투입종료','일투입시간','재투입','재투입차수','계획공수','실적공수','업무내용'],
    ...(db.effort||[]).map(x=>[x.projectNo||'',siteName(x.siteId),x.owner||'',x.role||'',x.type||'',x.inDate||'',x.outDate||'',x.dailyHours??'',x.reentry||'',x.round??'',x.planHours??'',x.actualHours??'',x.work||''])
  ]});
  sheets.push({name:'07_Site',rows:[
    ['Site 그룹','Site ID','Site명','국가','지역','고객/OEM','Timezone','연락처','활성','비고'],
    ...(db.sites||[]).map(x=>[siteGroupName(x.id),x.id||'',x.name||'',x.country||'',x.region||'',x.oem||'',x.tz||'',x.contact||'',x.active||'',x.memo||''])
  ]});
  sheets.push({name:'08_CS일보',rows:[
    ['일보ID','일자','프로젝트','Site','장비/라인','담당자','금일 작업','이슈/문제점','조치/익일계획','상태','비고'],
    ...(db.dailyReports||[]).map(r=>{
      const p=(db.projects||[]).find(x=>x.id===r.projectId);
      return [r.id||'',r.date||'',projectLabel(p),r.site||siteName(p?.siteId),r.equipment||'',r.owner||'',r.work||'',r.issue||'',r.action||'',r.status||'',r.memo||''];
    })
  ]});
  return sheets;
}

function sanitizeFileName(s){
  return String(s||'Site').replace(/[\\/:*?"<>|]+/g,'_').trim()||'Site';
}

function buildXlsxBytes(sheets){
  const files=[];
  const ctSheets=sheets.map((s,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  files.push({name:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${ctSheets}
</Types>`});
  files.push({name:'_rels/.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`});
  const sheetTags=sheets.map((s,i)=>`<sheet name="${xmlEsc(s.name.substring(0,31))}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('');
  files.push({name:'xl/workbook.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheetTags}</sheets>
</workbook>`});
  const rels=sheets.map((s,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('');
  files.push({name:'xl/_rels/workbook.xml.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${rels}
<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`});
  files.push({name:'xl/styles.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF5F7D78"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`});
  sheets.forEach((s,i)=>{
    const styled=sheetXml(s.rows).replace(/<c r="([A-Z]+1)" /g,'<c r="$1" s="1" ');
    files.push({name:`xl/worksheets/sheet${i+1}.xml`,data:styled});
  });
  return zipStore(files);
}


function groupedSiteProjects(){
  const map=new Map();
  (db.sites||[]).filter(s=>s.active!=='비활성').forEach(s=>{
    const g=siteGroupName(s.id)||s.id||'SITE';
    if(!map.has(g))map.set(g,{group:g,sites:[],projects:[]});
    map.get(g).sites.push(s);
  });
  (db.projects||[]).forEach(p=>{
    const g=siteGroupName(p.siteId)||p.siteId||'미지정';
    if(!map.has(g))map.set(g,{group:g,sites:[],projects:[]});
    map.get(g).projects.push(p);
  });
  for(const v of map.values()){
    v.projects.sort((a,b)=>String(a.projectNo||a.id||'').localeCompare(String(b.projectNo||b.id||''),'ko',{numeric:true}));
  }
  return [...map.values()].sort((a,b)=>a.group.localeCompare(b.group,'ko',{numeric:true}));
}



function exportXLSX(){
  try{
    const sheets=makeXlsxSheets();
    const files=[];
    const ctSheets=sheets.map((s,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
    files.push({name:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${ctSheets}
</Types>`});
    files.push({name:'_rels/.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`});
    const sheetTags=sheets.map((s,i)=>`<sheet name="${xmlEsc(s.name.substring(0,31))}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('');
    files.push({name:'xl/workbook.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheetTags}</sheets>
</workbook>`});
    const rels=sheets.map((s,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('');
    files.push({name:'xl/_rels/workbook.xml.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${rels}
<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`});
    files.push({name:'xl/styles.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF5F7D78"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`});
    sheets.forEach((s,i)=>{
      const xml=sheetXml(s.rows);
      // Make first row header styled (s=1)
      const styled=xml.replace(/<c r="([A-Z]+1)" /g,'<c r="$1" s="1" ');
      files.push({name:`xl/worksheets/sheet${i+1}.xml`,data:styled});
    });
    const bytes=zipStore(files);
    const blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const title=APP_TITLE.replace(/[\\/:*?"<>|]+/g,'_');
    const today=new Date().toISOString().slice(0,10);
    downloadBlob(blob,`${title}_${today}.xlsx`);
  }catch(e){
    console.error(e);
    alert('Excel 저장 중 오류가 발생했습니다: '+e.message);
  }
}
// ===== End Native XLSX Export =====

// ===== Native PPTX Export (offline / no external library) =====
function pptTextShape(id,name,text,x,y,w,h,opt={}){
  const fill=opt.fill||'FFFFFF', color=opt.color||'243238', size=opt.size||1600;
  const bold=opt.bold?' b="1"':'', align=opt.align||'l', line=opt.line||fill;
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xmlEsc(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="${line}"/></a:solidFill></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="70000" rIns="70000" tIns="40000" bIns="30000"/><a:lstStyle/><a:p><a:pPr algn="${align}"/><a:r><a:rPr lang="ko-KR" sz="${size}"${bold}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="Arial"/><a:ea typeface="Malgun Gothic"/></a:rPr><a:t>${xmlEsc(text)}</a:t></a:r><a:endParaRPr lang="ko-KR" sz="${size}"/></a:p></p:txBody></p:sp>`;
}
function pptSlideXml(title,subtitle,rows=[],pageNo=1){
  let shapes='',id=2;
  shapes+=pptTextShape(id++,'Title',title,420000,260000,11350000,650000,{fill:'4F7880',line:'4F7880',color:'FFFFFF',size:2600,bold:true});
  if(subtitle)shapes+=pptTextShape(id++,'Subtitle',subtitle,480000,950000,11200000,380000,{fill:'EEF2F3',line:'EEF2F3',color:'4F7880',size:1200,bold:true});
  const cols=[1700000,1900000,1250000,1350000,1200000,1200000,1150000,900000];
  const headers=['Site','프로젝트 번호','구분','모델/장비','상태','담당','완료일','진척'];
  let x0=420000,y0=1450000,rowH=410000;
  let x=x0;
  headers.forEach((v,i)=>{shapes+=pptTextShape(id++,'Header '+i,v,x,y0,cols[i],rowH,{fill:'D9E4E2',line:'A8BCB8',color:'243238',size:1050,bold:true,align:'ctr'});x+=cols[i];});
  rows.forEach((r,ri)=>{x=x0;const fill=ri%2?'F4F7F6':'FFFFFF';r.forEach((v,i)=>{shapes+=pptTextShape(id++,`Cell ${ri}-${i}`,String(v??''),x,y0+rowH*(ri+1),cols[i],rowH,{fill,line:'D4DEDC',color:'243238',size:900,align:i===0||i===4||i===7?'ctr':'l'});x+=cols[i];});});
  shapes+=pptTextShape(id++,'Footer',`${APP_TITLE}  |  ${new Date().toISOString().slice(0,10)}  |  ${pageNo}`,420000,6720000,11350000,260000,{fill:'FFFFFF',line:'FFFFFF',color:'6B7A7E',size:850,align:'r'});
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}
function pptCoverXml(total,siteCount){
  let s='',id=2;
  s+=pptTextShape(id++,'Band','',0,0,12192000,1100000,{fill:'4F7880',line:'4F7880'});
  s+=pptTextShape(id++,'Title','글로벌 CS 관리 현황',700000,1800000,10800000,1000000,{fill:'FFFFFF',line:'FFFFFF',color:'243238',size:4000,bold:true,align:'ctr'});
  s+=pptTextShape(id++,'Sub','Site → 프로젝트 번호 → 세부 업무',700000,2900000,10800000,600000,{fill:'FFFFFF',line:'FFFFFF',color:'4F7880',size:2100,bold:true,align:'ctr'});
  s+=pptTextShape(id++,'KPI',`전체 프로젝트 ${total}건   |   Site ${siteCount}개`,2600000,4100000,7000000,700000,{fill:'E7EFED',line:'A8BCB8',color:'243238',size:2200,bold:true,align:'ctr'});
  s+=pptTextShape(id++,'Date',new Date().toISOString().slice(0,10),4500000,5450000,3200000,450000,{fill:'FFFFFF',line:'FFFFFF',color:'6B7A7E',size:1500,align:'ctr'});
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${s}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}
function exportPPTX(){
  try{
    const groups=groupedSiteProjects().filter(g=>g.projects.length);
    const slides=[pptCoverXml((db.projects||[]).length,groups.length)];
    const summary=groups.map(g=>{const ps=g.projects;const avg=ps.length?Math.round(ps.reduce((a,p)=>a+(+p.progress||0),0)/ps.length):0;return [g.group,ps.length,'-',`진행 ${ps.filter(p=>p.status==='진행').length}`,`완료 ${ps.filter(p=>p.status==='완료').length}`,'-',`초과 ${ps.filter(isProjectOverdue).length}`,avg+'%'];});
    for(let i=0;i<summary.length;i+=10)slides.push(pptSlideXml('전체 Site 요약',`Site별 프로젝트 현황 (${i+1}~${Math.min(i+10,summary.length)})`,summary.slice(i,i+10),slides.length+1));
    groups.forEach(g=>{for(let i=0;i<g.projects.length;i+=10){const rows=g.projects.slice(i,i+10).map(p=>[siteName(p.siteId),p.projectNo||p.id,p.projectType||'기존 형교환',[p.changeoverModel,p.equipmentName].filter(Boolean).join(' / '),p.status||'',p.cs||'',p.due||'',(p.progress??0)+'%']);slides.push(pptSlideXml(`${g.group} 프로젝트 현황`,`Site → 프로젝트 번호  |  ${i+1}~${Math.min(i+10,g.projects.length)} / ${g.projects.length}`,rows,slides.length+1));}});
    const files=[];
    const slideOverrides=slides.map((_,i)=>`<Override PartName="/ppt/slides/slide${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('');
    files.push({name:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slideOverrides}</Types>`});
    files.push({name:'_rels/.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`});
    const sldIds=slides.map((_,i)=>`<p:sldId id="${256+i}" r:id="rId${i+2}"/>`).join('');
    files.push({name:'ppt/presentation.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${sldIds}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`});
    const presRels=[`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>`,...slides.map((_,i)=>`<Relationship Id="rId${i+2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i+1}.xml"/>`)].join('');
    files.push({name:'ppt/_rels/presentation.xml.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${presRels}</Relationships>`});
    files.push({name:'ppt/slideMasters/slideMaster1.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`});
    files.push({name:'ppt/slideMasters/_rels/slideMaster1.xml.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`});
    files.push({name:'ppt/slideLayouts/slideLayout1.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`});
    files.push({name:'ppt/slideLayouts/_rels/slideLayout1.xml.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`});
    files.push({name:'ppt/theme/theme1.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Global CS"><a:themeElements><a:clrScheme name="Global CS"><a:dk1><a:srgbClr val="243238"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="4F7880"/></a:dk2><a:lt2><a:srgbClr val="EEF2F3"/></a:lt2><a:accent1><a:srgbClr val="4F7880"/></a:accent1><a:accent2><a:srgbClr val="79A897"/></a:accent2><a:accent3><a:srgbClr val="D9E4E2"/></a:accent3><a:accent4><a:srgbClr val="B75B5B"/></a:accent4><a:accent5><a:srgbClr val="8A7957"/></a:accent5><a:accent6><a:srgbClr val="5F7D90"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Global CS"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface="Malgun Gothic"/><a:cs typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface="Malgun Gothic"/><a:cs typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="Global CS"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`});
    slides.forEach((xml,i)=>{files.push({name:`ppt/slides/slide${i+1}.xml`,data:xml});files.push({name:`ppt/slides/_rels/slide${i+1}.xml.rels`,data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`});});
    const bytes=zipStore(files),title=sanitizeFileName(APP_TITLE),today=new Date().toISOString().slice(0,10);
    downloadBlob(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.presentationml.presentation'}),`${title}_Site별현황_${today}.pptx`);
  }catch(e){console.error(e);alert('PowerPoint 생성 중 오류가 발생했습니다: '+e.message);}
}
// ===== End Native PPTX Export =====

function importJSONPrompt(){if(!confirm('이전 프로그램에서 저장한 JSON 파일로 서버의 CS 데이터를 모두 교체합니다. 서버에만 있고 파일에 없는 항목은 삭제됩니다. 계속할까요?'))return;document.getElementById('importJsonFile').click()}
async function importJSONFile(input){const f=input.files[0];input.value='';if(!f)return;try{const next=JSON.parse(await f.text());if(!next||typeof next!=='object'||!Array.isArray(next.projects))return alert('CS 프로그램에서 저장한 JSON 파일이 아닙니다.');db=next;ensureDatabaseShape();save();await mainStorageSaveChain;renderAll();alert('가져오기를 마쳤습니다. 프로젝트 '+db.projects.length+'건')}catch(e){alert('가져오지 못했습니다. '+e.message)}}
function csvRow(a){return a.map(x=>`"${String(x??'').replaceAll('"','""')}"`).join(',')}
function exportCSV(){
let rows=[['Projects'],['ID','Project No.','Type','Changeover Model','Project','Equipment Name','Line','OEM','Region','Status','CS','PM','Start','Due','Progress','Risk','Notes'],...db.projects.map(p=>[p.id,p.projectNo||'',p.projectType||'기존 형교환',p.changeoverModel||'',p.name,p.equipmentName||'',p.line||'',p.oem,p.region,p.status,p.cs,p.pm,p.start,p.due,p.progress,p.risk,p.notes]),[],['Tasks'],['ID','Task','Project','Type','Owner','Priority','Due','Status','Note'],...db.tasks.map(t=>[t.id,t.name,projectName(t.project),t.type,t.owner,t.priority,t.due,t.status,t.note]),[],['Issues'],['ID','Title','Customer','Project','Severity','Status','Opened','Containment','Root Cause','Corrective Action','Verification','Due'],...db.issues.map(i=>[i.id,i.title,i.customer,projectName(i.project),i.severity,i.status,i.opened,i.contain,i.root,i.ca,i.verify,i.due]),[],['Materials'],['ID','Item','Project','Supplier','Part','Qty','ETA','Status','Risk','Action'],...db.materials.map(x=>[x.id,x.item,projectName(x.project),x.supplier,x.part,x.qty,x.eta,x.status,x.risk,x.action]),[],['Packaging'],['ID','Project','Type','Spec','Label','Country','Transport','Verify','Status','Memo'],...db.packaging.map(x=>[x.id,projectName(x.project),x.type,x.spec,x.label,x.country,x.transport,x.verify,x.status,x.memo]),[],['SKO Site Modification Items'],['Project No','Site','Line','Equipment No','Equipment','Item No','Modification Item','Applied','Plan Date','Done Date','Verified','Owner','Issue'],...db.sko.map(x=>[x.projectNo,siteName(x.siteId),x.line,x.equipNo,x.equipName,x.itemNo,x.item,x.applied,x.planDate,x.doneDate,x.verified,x.owner,x.issue]),[],['Product Specifications'],['Site','Line','Model','Product','Specification','Part No','Rev','Cycle Time','Equipment','Modification Item','Checker'],...db.specs.map(x=>[siteName(x.siteId),x.line,x.model,x.product,x.spec,x.part,x.rev,x.cycle,x.equipment,x.modItem,x.checker]),[],['Equipment Shipping'],['Project No','Site','Equipment No','Equipment','Plan Ship','Actual Ship','ETA','Arrival','Packing','Transport','Tracking','Install Done','Status'],...db.shipping.map(x=>[x.projectNo,siteName(x.siteId),x.equipNo,x.equipName,x.planShip,x.actualShip,x.eta,x.arrival,x.pack,x.transport,x.tracking,x.installDone,x.status]),[],['CS Effort'],['Project No','Site','Owner','Role','Type','In','Out','Daily Hours','Reentry','Round','Plan Hours','Actual Hours','Work'],...db.effort.map(x=>[x.projectNo,siteName(x.siteId),x.owner,x.role,x.type,x.inDate,x.outDate,x.dailyHours,x.reentry,x.round,x.planHours,x.actualHours,x.work]),[],['Sites'],['Site ID','Site','Country','Region','OEM','Timezone','Contact','Active','Memo'],...db.sites.map(x=>[x.id,x.name,x.country,x.region,x.oem,x.tz,x.contact,x.active,x.memo]),[],['Contacts'],['ID','Name','Company','Region','Role','Email','Phone','Timezone','Language','Memo'],...db.contacts.map(x=>[x.id,x.name,x.company,x.region,x.role,x.email,x.phone,x.tz,x.lang,x.memo])];
let blob=new Blob(['\\ufeff'+rows.map(csvRow).join('\\n')],{type:'text/csv;charset=utf-8'});downloadBlob(blob,'global-automotive-cs-excel.csv')}
function downloadBlob(blob,name){let a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
function openSettings(){modal('환경설정',`<div class="formgrid"><label>글자 크기<select id="fs"><option>13</option><option selected>14</option><option>15</option><option>16</option><option>18</option></select></label></div>`,`applySettings()`)}
function applySettings(){document.body.style.fontSize=val('fs')+'px';localStorage.setItem('gacs_fs',val('fs'));closeModal()}
(async function(){if(!(await initializeMainStorage())&&!csStore.remote())return;await loadMaterialDashboardData(false);await reconcileProjectMaterialRules();renderNav();let fs=localStorage.getItem('gacs_fs')||'14';document.body.style.fontSize=fs+'px';let s=document.createElement('style');s.textContent='';document.head.appendChild(s);renderAll();startSiteColorObserver();document.getElementById('modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});document.getElementById('modal').addEventListener('change',e=>{if(e.target.matches('[data-ms-done]'))calcMilestoneProgress()});document.addEventListener('paste',e=>{if(e.defaultPrevented||!document.getElementById('projectCapturePasteZone'))return;const active=document.activeElement,tag=active?.tagName;if(active?.isContentEditable||e.target?.closest?.('[contenteditable="true"],#projectPptPastePanel,#projectDataSheetTablePaste'))return;if(['INPUT','TEXTAREA','SELECT'].includes(tag))return;handleProjectCapturePaste(e)})})();

if(csStore.remote()){
 if(csStore.role()==='admin')document.getElementById('importJsonBtn').style.display='';
 let csPulling=false;
 async function csRefreshFromServer(){
  if(csPulling||!mainStorageReady||document.hidden)return;
  if(document.getElementById('modal').classList.contains('show'))return;
  csPulling=true;
  try{
   await mainStorageSaveChain.catch(()=>{});
   const r=await csStore.pull('main');
   if(r.changed&&!document.getElementById('modal').classList.contains('show')){db=r.data;ensureDatabaseShape();renderAll();updateStorageModeStatus('저장: Supabase ✓')}
  }catch(e){console.warn('서버 변경 확인 실패',e)}finally{csPulling=false}
 }
 document.addEventListener('visibilitychange',csRefreshFromServer);
 window.addEventListener('focus',csRefreshFromServer);
 setInterval(csRefreshFromServer,60000);
}
