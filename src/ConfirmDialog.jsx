import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { registerConfirmDialog } from './confirmService.js';
import './ConfirmDialog.css';

// 확인 팝업 화면. 호출은 confirmService.js 의 confirmDialog()로 한다.
export function ConfirmDialogHost() {
  const [dialog, setDialog] = useState(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    registerConfirmDialog((options) => new Promise((resolve) => {
      setDialog({ ...options, resolve });
    }));
    return () => registerConfirmDialog(null);
  }, []);

  const close = (result) => {
    setDialog((current) => {
      current?.resolve(result);
      return null;
    });
  };

  useEffect(() => {
    if (!dialog) return undefined;
    // 실수로 Enter가 눌려 삭제되지 않도록 기본 포커스는 "취소"에 둔다.
    cancelRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog]);

  if (!dialog) return null;
  const {
    title = '삭제 확인',
    message,
    detail,
    confirmLabel = '삭제',
    cancelLabel = '취소',
    danger = true,
  } = dialog;

  return (
    <div className="confirm-back" onMouseDown={() => close(false)}>
      <div
        className="confirm-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={`confirm-icon${danger ? ' danger' : ''}`}>
          <Icon name={danger ? 'trash' : 'alert'} size={22} />
        </div>
        <h3 id="confirm-title" className="confirm-title">{title}</h3>
        {message && <p className="confirm-message">{message}</p>}
        {detail && <p className="confirm-detail">{detail}</p>}
        <div className="confirm-actions">
          <button type="button" ref={cancelRef} className="confirm-btn" onClick={() => close(false)}>
            {cancelLabel}
          </button>
          <button type="button" className={`confirm-btn primary${danger ? ' danger' : ''}`} onClick={() => close(true)}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
