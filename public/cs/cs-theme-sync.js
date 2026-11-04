/* 프로젝트 매니저 앱의 라이트/다크 설정(pm_theme_mode)을 따라간다. 단독으로 열어도 같은 저장값을 쓴다. */
(function () {
  function mode() { var m = 'dark'; try { m = localStorage.getItem('pm_theme_mode') || 'dark'; } catch (e) { /* 저장소 사용 불가 */ } return m === 'light' ? 'light' : 'dark'; }
  function apply() {
    document.documentElement.setAttribute('data-theme', mode());
    if (window.parent !== window) document.documentElement.classList.add('embedded');
  }
  apply();
  window.addEventListener('storage', function (e) { if (e.key === 'pm_theme_mode') apply(); });
})();
