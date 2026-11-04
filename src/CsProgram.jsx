import { useState, useEffect, useRef } from "react";
import "./CsProgram.css";
import { createCsBridge } from "./csBridge";

// CS 통합 관리 프로그램: 독립 프로그램(public/cs/index.html)을 앱 안에 끼워 넣는다.
// - 프로그램의 기능·데이터 저장(브라우저 IndexedDB)은 원본 그대로이고, 디자인은 public/cs/cs-theme.css 가 앱 토큰에 맞춘다.
// - 라이트/다크는 앱이 저장하는 pm_theme_mode 를 프로그램이 직접 읽고 storage 이벤트로 따라간다.
export default function CsProgram({ role }) {
  // iframe 이 열리기 전에 다리를 먼저 놓는다(렌더 중 1회). 권한이 바뀌면 아래 effect 가 다시 놓는다.
  useState(() => { window.__csBridge = createCsBridge(role); });
  useEffect(() => {
    window.__csBridge = createCsBridge(role);
    return () => { delete window.__csBridge; };
  }, [role]);
  const wrapRef = useRef(null);
  const headRef = useRef(null);
  const frameRef = useRef(null);

  // 머리말(다른 시스템과 같은 크기)의 실제 높이를 재서, 바깥과 iframe 안쪽 모두에 알려 준다
  useEffect(() => {
    const apply = () => {
      const h = headRef.current?.offsetHeight;
      if (!h) return;
      wrapRef.current?.style.setProperty("--cs-head-h", `${h}px`);
      try {
        frameRef.current?.contentDocument?.documentElement.style.setProperty("--cs-head-h", `${h}px`);
      } catch {
        // 같은 출처가 아니면 건너뜀
      }
    };
    apply();
    const ro = new ResizeObserver(apply);
    if (headRef.current) ro.observe(headRef.current);
    return () => ro.disconnect();
  }, []);

  const src = `${import.meta.env.BASE_URL || "/"}cs/index.html`.replace("//", "/");
  return (
    <div className="cs-head" ref={wrapRef}>
      <div className="system-sticky-header" ref={headRef}>
        <div className="system-header-row">
          <div className="system-title-group">
            <div className="system-title-text">
              <span className="eyebrow">CS Management</span>
              <h2>CS 통합 관리 시스템</h2>
              <p>형교환·개조 프로젝트 일정, CS 업무와 일보, 투입공수, 자재현황을 Site 기준으로 통합 관리</p>
            </div>
          </div>
        </div>
      </div>
      <div className="cs-frame-wrap">
        <iframe
          ref={frameRef}
          onLoad={() => headRef.current && frameRef.current?.contentDocument?.documentElement.style.setProperty("--cs-head-h", `${headRef.current.offsetHeight}px`)}
          className="cs-frame"
          title="CS 통합 관리 프로그램"
          src={src}
          allow="clipboard-read; clipboard-write; fullscreen"
          allowTransparency="true"
        />
      </div>
    </div>
  );
}
