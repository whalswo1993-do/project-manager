// CS 프로그램의 저장소를 Supabase 로 돌리는 패치 모음 (build-cs-program.cjs 가 불러 쓴다).
// 원칙: 원본 코드는 그대로 두고, IndexedDB 를 여는 함수 머리에서 "앱 안에서 실행 중이면 가짜 db(csStore.facade)를 돌려준다".
function must(html, from, to, label) {
  if (!html.includes(from)) throw new Error('패치 대상을 찾지 못했습니다: ' + label);
  return html.replace(from, () => to);
}

const LABEL = "(csStore.remote()?'Supabase':'IndexedDB')";

function patchMain(html) {
  // 환경설정의 "눈 편한 5가지 모드"는 앱 디자인(라이트/다크)과 부딪히므로 색 적용을 없앤다(글자 크기만 유지)
  html = must(html, "root.style.setProperty('--bg',themes[0]);root.style.setProperty('--panel',themes[1]);root.style.setProperty('--panel2',themes[2]);root.style.setProperty('--text',themes[3]);root.style.setProperty('--accent',themes[4]);", '', '색 모드 적용 제거');
  // 저장소 어댑터를 가장 먼저 불러온다 (head 끝에 이미 theme 연결이 있으므로 그 앞에 둔다)
  html = must(html, '<link rel="stylesheet" href="./cs-theme.css', '<script src="./cs-store.js?v=__VER__"></script>\n<link rel="stylesheet" href="./cs-theme.css', 'cs-store 연결');

  // IndexedDB 를 여는 세 함수: 앱 안에서는 Supabase 로
  html = must(html, 'function openMainDataDB(){\n return new Promise(', 'function openMainDataDB(){\n if(csStore.remote())return Promise.resolve(csStore.facade());\n return new Promise(', 'openMainDataDB');
  html = must(html, 'function openMaterialSummaryDB(){return new Promise(', 'function openMaterialSummaryDB(){if(csStore.remote())return Promise.resolve(csStore.facade({track:false}));return new Promise(', 'openMaterialSummaryDB');
  html = must(html, 'function openProjectFileDB(){\n return new Promise(', 'function openProjectFileDB(){\n if(csStore.remote())return Promise.resolve(csStore.facade());\n return new Promise(', 'openProjectFileDB');

  // 상태 표시 글자: IndexedDB → Supabase
  html = must(html, "function updateStorageModeStatus(text,isError=false){", "function updateStorageModeStatus(text,isError=false){text=String(text).replace('IndexedDB'," + LABEL + ");", 'updateStorageModeStatus');

  // 서버가 비어 있으면 원본의 예시 데이터를 올리지 않고 빈 상태로 시작한다
  html = must(html, "  else{\n   ensureDatabaseShape();\n   await writeMainDataDB(databaseSnapshot());",
    "  else{\n   if(csStore.remote())db={};\n   ensureDatabaseShape();\n   await writeMainDataDB(databaseSnapshot());", '빈 서버 시작');

  // 서버에서 못 읽으면 조용히 브라우저 저장으로 바꾸지 않고 원인을 알린다
  html = must(html, "console.error('IndexedDB 초기화 실패',e);mainStorageFallback=true;mainStorageReady=false;ensureDatabaseShape();",
    "console.error('IndexedDB 초기화 실패',e);if(csStore.remote()){db={};ensureDatabaseShape();mainStorageReady=false;mainStorageFallback=false;updateStorageModeStatus('Supabase 연결 실패',true);alert('Supabase에서 CS 데이터를 불러오지 못했습니다. 이 상태에서는 저장되지 않습니다. 새로고침하거나 관리자에게 문의해 주세요. ('+e.message+')');return false}mainStorageFallback=true;mainStorageReady=false;ensureDatabaseShape();", '초기화 실패 처리');
  // 서버 연결이 안 된 상태(mainStorageReady=false)에서 save() 가 localStorage 로 새지 않게 한다
  html = must(html, "if(mainStorageFallback||!mainStorageReady){localStorage.setItem(KEY,JSON.stringify(db));return true}",
    "if(csStore.remote()&&!mainStorageReady){return true}if(mainStorageFallback||!mainStorageReady){localStorage.setItem(KEY,JSON.stringify(db));return true}", 'save 분기');
  html = must(html, 'JSON 백업을 먼저 저장한 뒤 프로그램을 다시 실행해 주세요.', '잠시 후 다시 시도해 주세요.', '저장 오류 문구');

  // JSON 저장 단추 → (관리자) 이전 데이터 가져오기
  html = must(html, '<button onclick="exportJSON()">JSON 저장</button>',
    '<button id="importJsonBtn" onclick="importJSONPrompt()" style="display:none" title="이전 프로그램에서 저장한 JSON 파일로 서버 데이터를 교체합니다(관리자)">이전 데이터 가져오기</button><input id="importJsonFile" type="file" accept=".json,application/json" style="display:none" onchange="importJSONFile(this)">', 'JSON 저장 단추');
  html = must(html, 'function exportJSON(){', `function importJSONPrompt(){if(!confirm('이전 프로그램에서 저장한 JSON 파일로 서버의 CS 데이터를 모두 교체합니다. 서버에만 있고 파일에 없는 항목은 삭제됩니다. 계속할까요?'))return;document.getElementById('importJsonFile').click()}
async function importJSONFile(input){const f=input.files[0];input.value='';if(!f)return;try{const next=JSON.parse(await f.text());if(!next||typeof next!=='object'||!Array.isArray(next.projects))return alert('CS 프로그램에서 저장한 JSON 파일이 아닙니다.');db=next;ensureDatabaseShape();save();await mainStorageSaveChain;renderAll();alert('가져오기를 마쳤습니다. 프로젝트 '+db.projects.length+'건')}catch(e){alert('가져오지 못했습니다. '+e.message)}}
function exportJSON(){`, 'importJSON 함수');

  // 서버 사용 시: 관리자에게만 가져오기 단추를 보이고, 화면에 돌아올 때 다른 사람이 바꾼 내용을 불러온다
  html = must(html, 'renderAppTitle();\n</script>', `renderAppTitle();
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
   if(r.changed&&!document.getElementById('modal').classList.contains('show')){db=r.data;ensureDatabaseShape();renderAll();updateStorageModeStatus('저장: IndexedDB ✓')}
  }catch(e){console.warn('서버 변경 확인 실패',e)}finally{csPulling=false}
 }
 document.addEventListener('visibilitychange',csRefreshFromServer);
 window.addEventListener('focus',csRefreshFromServer);
 setInterval(csRefreshFromServer,60000);
}
</script>`, '끝부분 훅');
  return html;
}

function patchMaterial(doc) {
  doc = must(doc, "function setMaterialStorageStatus(text, error = false) {", "function setMaterialStorageStatus(text, error = false) {\n            try { text = String(text).replace('IndexedDB', (window.parent && window.parent.csStore && window.parent.csStore.remote()) ? 'Supabase' : 'IndexedDB'); } catch (e) { }", 'setMaterialStorageStatus');
  doc = must(doc, "function openMaterialDB() {\n            return new Promise(", "function openMaterialDB() {\n            try { if (window.parent && window.parent.csStore && window.parent.csStore.remote()) return Promise.resolve(window.parent.csStore.facade()); } catch (e) { }\n            return new Promise(", 'openMaterialDB');
  return doc;
}

module.exports = { patchMain, patchMaterial };
