// CS 통합 관리 프로그램(원본 단일 HTML)을 public/cs/index.html 로 옮긴다.
// 기능 코드는 그대로 두고, 디자인 파일(cs-theme.css, cs-material-theme.css) 연결과 테마 동기화만 끼워 넣는다.
// 사용: node scripts/build-cs-program.cjs "<원본 html 경로>"
const fs = require('fs');
const path = require('path');

const src = process.argv[2];
if (!src) { console.error('원본 HTML 경로가 필요합니다.'); process.exit(1); }
let html = fs.readFileSync(src, 'utf8');

const VER = Date.now().toString(36);
const THEME_SYNC = `<script>
/* 프로젝트 매니저 앱의 라이트/다크 설정(pm_theme_mode)을 따라간다. 단독으로 열어도 같은 저장값을 쓴다. */
(function(){
  function mode(){var m='dark';try{m=localStorage.getItem('pm_theme_mode')||'dark'}catch(e){}return m==='light'?'light':'dark'}
  function apply(){
    document.documentElement.setAttribute('data-theme',mode());
    if(window.parent!==window)document.documentElement.classList.add('embedded');
  }
  apply();
  window.addEventListener('storage',function(e){if(e.key==='pm_theme_mode')apply()});
})();
</script>`;

const HEAD_ADD = `
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Instrument+Serif&display=swap" rel="stylesheet">
<link rel="stylesheet" href="./cs-theme.css?v=${VER}">
${THEME_SYNC}
`;
if (!html.includes('</head>')) throw new Error('</head> 를 찾지 못했습니다.');
html = html.replace('</head>', HEAD_ADD + '</head>');

// 내장 자재현황 앱(base64)에도 같은 디자인 파일과 테마 동기화를 끼워 넣는다.
const oldFn = "function materialAppHtml(){const binary=atob(MATERIAL_APP_HTML_B64);return new TextDecoder().decode(Uint8Array.from(binary,c=>c.charCodeAt(0)))}";
if (!html.includes(oldFn)) throw new Error('materialAppHtml 함수를 찾지 못했습니다.');
const matInject = "const themeUrl=new URL('./cs-material-theme.css?v="+VER+"',location.href).href;" +
  "const inject='<link rel=\"stylesheet\" href=\"https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css\">'" +
  "+'<link rel=\"stylesheet\" href=\"'+themeUrl+'\">'" +
  "+'<script>(function(){function a(){var m=\"dark\";try{m=localStorage.getItem(\"pm_theme_mode\")||\"dark\"}catch(e){}document.documentElement.setAttribute(\"data-theme\",m===\"light\"?\"light\":\"dark\")}a();window.addEventListener(\"storage\",function(e){if(e.key===\"pm_theme_mode\")a()})})();<\\/script>';" +
  "const doc=new TextDecoder().decode(Uint8Array.from(binary,c=>c.charCodeAt(0)));" +
  "return doc.includes('</body>')?doc.replace('</body>',()=>inject+'</body>'):doc+inject";
html = html.replace(oldFn, "function materialAppHtml(){const binary=atob(MATERIAL_APP_HTML_B64);" + matInject + "}");

// 원본의 renderAll 은 지금 화면에 없는 옛 구역(이슈·품질·자재·포장·연락처)의 표를 그리다가 null 오류로 멈추고,
// 그 바람에 시작 코드의 뒷부분(Site 색 감시, 모달 바깥 클릭 닫기, 붙여넣기 처리 등록)이 실행되지 않았다.
// 없는 구역은 건너뛰도록 각 호출을 감싼다. 화면에 있는 구역의 오류는 콘솔에 그대로 남긴다.
const oldRenderAll = "function renderAll(){renderExecutive();renderDailyReports();updateMenuSectionTitles();fillSiteFilters();renderDashboard();renderProjects();renderTasks();renderEffort();renderSites();renderIssues();renderQuality();renderMaterials();renderPackaging();renderContacts()}";
if (!html.includes(oldRenderAll)) throw new Error('renderAll 함수를 찾지 못했습니다.');
const newRenderAll = "function renderAll(){const legacy=['renderIssues','renderQuality','renderMaterials','renderPackaging','renderContacts'];[renderExecutive,renderDailyReports,updateMenuSectionTitles,fillSiteFilters,renderDashboard,renderProjects,renderTasks,renderEffort,renderSites,renderIssues,renderQuality,renderMaterials,renderPackaging,renderContacts].forEach(fn=>{try{fn()}catch(e){if(!legacy.includes(fn.name))console.error(fn.name,e)}})}";
html = html.replace(oldRenderAll, () => newRenderAll);

const out = path.join(__dirname, '..', 'public', 'cs', 'index.html');
fs.writeFileSync(out, html);
console.log('wrote', out, html.length);
