// 삭제 같은 되돌리기 어려운 동작 앞에 띄우는 확인 팝업의 호출부.
// 브라우저 기본 confirm()은 iPad/PWA 등에서 막히거나 눈에 안 띄므로 앱 안에서 직접 그린다.
//   if (!(await confirmDialog({ title: '프로젝트 삭제', message: '...' }))) return;
// 화면 쪽은 ConfirmDialog.jsx 의 <ConfirmDialogHost />(main.jsx 에 한 번만 둔다)가 맡는다.
let opener = null;

export function registerConfirmDialog(open) {
  opener = open;
}

export function confirmDialog(options = {}) {
  if (!opener) {
    // 호스트가 없으면(테스트 등) 기본 confirm으로 대신한다.
    return Promise.resolve(typeof window !== 'undefined' && window.confirm
      ? window.confirm(options.message || options.title || '계속할까요?')
      : false);
  }
  return opener(options);
}
