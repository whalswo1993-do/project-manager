import "./CsProgram.css";

// CS 통합 관리 프로그램: 독립 프로그램(public/cs/index.html)을 앱 안에 끼워 넣는다.
// - 프로그램의 기능·데이터 저장(브라우저 IndexedDB)은 원본 그대로이고, 디자인은 public/cs/cs-theme.css 가 앱 토큰에 맞춘다.
// - 라이트/다크는 앱이 저장하는 pm_theme_mode 를 프로그램이 직접 읽고 storage 이벤트로 따라간다.
export default function CsProgram() {
  const src = `${import.meta.env.BASE_URL || "/"}cs/index.html`.replace("//", "/");
  return (
    <>
      <div className="system-sticky-header">
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
          className="cs-frame"
          title="CS 통합 관리 프로그램"
          src={src}
          allow="clipboard-read; clipboard-write; fullscreen"
          allowTransparency="true"
        />
      </div>
    </>
  );
}
