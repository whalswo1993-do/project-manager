import { useEffect, useRef, useState } from 'react';
import './PasteZone.css';

// 엑셀 "표 붙여넣기" 칸 — 마스터 스케줄 / 공사일보 / 견적 / Vision SPC 가 같이 쓴다.
// DRM 보안 때문에 파일 첨부가 안 되는 문서가 많아서 표 붙여넣기가 주된 입력 방법이다.
// 그래서 작은 입력칸이 아니라 색이 있는 큰 영역으로 눈에 띄게 보여준다.
//
// 구현: 눈에 보이는 안내 영역 위에 투명한 textarea 를 덮어 둔다.
//  - 영역을 클릭하면 textarea 에 포커스가 가서 Ctrl+V 가 되고, 마우스 오른쪽 → 붙여넣기도 된다.
//  - 붙여넣기 처리는 화면마다 달라서 기존 핸들러를 onPaste / onInput 으로 그대로 받는다.
//  - 전역 CSS 가 모든 textarea 의 배경·테두리를 !important 로 덮으므로, 투명 처리는 PasteZone.css 에서 더 구체적인 선택자로 한다.
export function PasteZone({
  label = '엑셀 표 붙여넣기',
  hint = '엑셀에서 표를 복사(Ctrl+C) → 여기를 클릭 → 붙여넣기(Ctrl+V)',
  readyHint = '지금 Ctrl+V 를 눌러 붙여넣으세요',
  accent = 'green', // 'green' | 'sky'
  icon = '📋',
  size = 'md', // 'md' | 'lg'
  disabled = false,
  disabledReason = '',
  busy = false,
  busyLabel = '분석 중...',
  onPaste,
  onInput,
  title,
}) {
  const [received, setReceived] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const handlePaste = (e) => {
    // 이전 시도에서 남은 글자가 이번 붙여넣기에 섞이지 않게 먼저 비운다 (Vision SPC 는 textarea 값을 읽는다)
    e.currentTarget.value = '';
    onPaste?.(e);
    // 붙여넣기를 "받았다"는 즉각적인 반응 (분석 성공 여부는 각 화면의 메시지가 알려준다)
    setReceived(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setReceived(false), 1800);
  };

  const handleInput = (e) => {
    // 투명한 칸이라 타이핑은 의미가 없다. 붙여넣기/끌어놓기로 들어온 것만 처리한다
    const type = e.nativeEvent?.inputType || '';
    if (type && !/paste|drop/i.test(type)) {
      e.target.value = '';
      return;
    }
    onInput?.(e);
  };

  const cls = [
    'paste-zone',
    `pz-${accent}`,
    `pz-${size}`,
    disabled && 'pz-disabled',
    busy && 'pz-busy',
    received && !busy && !disabled && 'pz-received',
  ].filter(Boolean).join(' ');

  const shownLabel = busy ? busyLabel : received && !disabled ? '✓ 붙여넣기를 받았습니다' : label;

  return (
    <div className={cls} title={title}>
      <span className="pz-icon" aria-hidden="true">
        {busy ? <span className="pz-spinner" /> : icon}
      </span>
      <span className="pz-body" aria-hidden="true">
        <span className="pz-label">{shownLabel}</span>
        {disabled ? (
          <span className="pz-hint">{disabledReason}</span>
        ) : busy ? (
          <span className="pz-hint">잠시만 기다려 주세요</span>
        ) : (
          <>
            <span className="pz-hint pz-hint-idle">{hint}</span>
            <span className="pz-hint pz-hint-ready">{readyHint}</span>
          </>
        )}
      </span>
      <textarea
        className="paste-zone-input"
        aria-label={`${label}. ${disabled ? disabledReason : hint}`}
        disabled={disabled || busy}
        onPaste={handlePaste}
        onInput={handleInput}
        spellCheck={false}
        autoComplete="off"
      />
    </div>
  );
}

// 붙여넣기 칸(들) + "또는" + 파일 첨부 버튼을 한 줄(또는 세로)로 묶는 배치.
// 파일 첨부는 보조 버튼으로 두고, 눈에 띄는 쪽은 붙여넣기 칸이다.
//   file: { label, onClick, disabled, busy, busyLabel, title, icon }
//   align: 'start' | 'center' (줄 안에서 가운데 정렬) / block: 부모 폭 100% / wrap: false 면 한 줄 고정(좁은 헤더 안)
//   direction: 'row' | 'column' (좁은 사이드바)
export function PasteEntry({ children, file, drmNote = false, direction = 'row', align = 'start', block = false, wrap = true }) {
  const cls = ['paste-entry', `pe-${direction}`, `pe-${align}`, block && 'pe-block', !wrap && 'pe-nowrap'].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div className="paste-entry-row">
        {children}
        {file && (
          <>
            <span className="paste-entry-or" aria-hidden="true">또는</span>
            <button type="button" className="paste-entry-file" onClick={file.onClick} disabled={file.disabled} title={file.title}>
              <span aria-hidden="true">{file.busy ? '⏳' : file.icon || '📎'}</span>
              <span>{file.busy ? file.busyLabel || '처리 중...' : file.label}</span>
            </button>
          </>
        )}
      </div>
      {drmNote && (
        <div className="paste-entry-note">
          🔒 DRM 보안으로 파일 첨부가 안 되는 문서는 엑셀에서 표를 복사해 붙여넣으세요.
        </div>
      )}
    </div>
  );
}
