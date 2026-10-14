import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

// 상단 오른쪽 사용자 메뉴: 흩어져 있던 캐시 새로고침 / 비밀번호 변경 / 로그아웃 / 사용자 권한 관리를 한곳에 모은다.
export default function HeaderUserMenu({
  name,
  roleLabel,
  hasUpdate = false,
  newUserCount = 0,
  isAdmin = false,
  onUpdate,
  onPassword,
  onUsers,
  onSignOut,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (fn) => () => {
    setOpen(false);
    if (fn) fn();
  };
  const initial = String(name || "?").trim().slice(0, 1) || "?";
  const flagged = hasUpdate || (isAdmin && newUserCount > 0);

  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button"
        className={`user-menu-trigger${open ? " open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="사용자 메뉴"
      >
        <span className="user-avatar">
          {initial}
          {flagged && <i className="user-avatar-dot" />}
        </span>
        <span className="user-info-text">
          <span className="user-display-name">{name}</span>
          <span className="user-role-tag">{roleLabel}</span>
        </span>
        <Icon name="chevDown" size={14} className="user-menu-caret" />
      </button>

      {open && (
        <div className="user-menu-pop" role="menu">
          {isAdmin && (
            <button
              type="button"
              role="menuitem"
              className="user-menu-item"
              onClick={run(onUsers)}
              title={newUserCount > 0 ? `신규 가입자 ${newUserCount}명이 있습니다.` : "사용자 권한 관리"}
            >
              <Icon name="shield" size={16} />
              <span>사용자 권한 관리</span>
              {newUserCount > 0 && <span className="user-menu-count">{newUserCount}</span>}
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="user-menu-item"
            onClick={run(onPassword)}
            title="현재 로그인된 계정의 비밀번호를 변경합니다"
          >
            <Icon name="key" size={16} />
            <span>비밀번호 변경</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="user-menu-item"
            onClick={run(onUpdate)}
            title="브라우저 캐시를 완전히 비우고 최신 화면으로 새로고침합니다"
          >
            <Icon name="refresh" size={16} />
            <span>캐시 새로고침</span>
            {hasUpdate && <span className="user-menu-flag">업데이트</span>}
          </button>
          <div className="user-menu-sep" />
          <button
            type="button"
            role="menuitem"
            className="user-menu-item danger"
            onClick={run(onSignOut)}
            title="로그아웃합니다"
          >
            <Icon name="logout" size={16} />
            <span>로그아웃</span>
          </button>
        </div>
      )}
    </div>
  );
}
