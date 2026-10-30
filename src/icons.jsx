// 이모지 대신 쓰는 통일된 선 아이콘 (24px 격자, 1.6 선). 새 화면에서도 이모지를 쓰지 말고 여기에 추가해서 쓴다.
const PATHS = {
  calendar: '<rect x="3" y="4.5" width="18" height="17" rx="2.2"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/>',
  users: '<path d="M16 20.5v-1.6a3.9 3.9 0 0 0-3.9-3.9H7.4a3.9 3.9 0 0 0-3.9 3.9v1.6"/><circle cx="9.75" cy="7.6" r="3.6"/><path d="M21 20.5v-1.6a3.9 3.9 0 0 0-2.9-3.75M15.6 4.1a3.6 3.6 0 0 1 0 6.9"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21v-1a5 5 0 0 1 5-5h5a5 5 0 0 1 5 5v1"/>',
  alert: '<circle cx="12" cy="12" r="9.5"/><path d="M12 7.6v5M12 16.2h.01"/>',
  info: '<circle cx="12" cy="12" r="9.5"/><path d="M12 11v5.5M12 7.6h.01"/>',
  file: '<path d="M14.2 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8L14.2 2.5Z"/><path d="M14 2.5V8h5.5M8.5 13h7M8.5 17h5"/>',
  receipt: '<path d="M5 2.5v19l2.3-1.5 2.4 1.5 2.3-1.5 2.3 1.5 2.4-1.5L19 21.5v-19l-2.3 1.4-2.4-1.4L12 3.9l-2.3-1.4-2.4 1.4Z"/><path d="M8.6 9h6.8M8.6 13h6.8"/>',
  activity: '<path d="M21.5 12h-4.2l-3 8.5-4.6-17-3 8.5H2.5"/>',
  search: '<circle cx="11" cy="11" r="7.5"/><path d="m20.5 20.5-4.3-4.3"/>',
  bell: '<path d="M6 8.5a6 6 0 0 1 12 0c0 6.5 2.6 8.5 2.6 8.5H3.4S6 15 6 8.5"/><path d="M10.2 20.5a2 2 0 0 0 3.6 0"/>',
  chevDown: '<path d="m6 9.5 6 6 6-6"/>',
  chevUp: '<path d="m6 14.5 6-6 6 6"/>',
  chevRight: '<path d="m9.5 6 6 6-6 6"/>',
  chevLeft: '<path d="m14.5 6-6 6 6 6"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"/>',
  clipboard: '<rect x="8.5" y="2.5" width="7" height="4" rx="1.2"/><path d="M15.5 4.5H18a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h2.5"/><path d="M8.5 12h7M8.5 16h4.5"/>',
  paperclip: '<path d="m20.4 11.3-8.6 8.6a5.4 5.4 0 0 1-7.6-7.6l8.6-8.6a3.6 3.6 0 0 1 5.1 5.1l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l8-8"/>',
  download: '<path d="M20.5 15v4a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-4M7.5 10.5 12 15l4.5-4.5M12 15V3"/>',
  upload: '<path d="M20.5 15v4a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-4M7.5 8.5 12 4l4.5 4.5M12 4v11"/>',
  sliders: '<path d="M4 6.5h16M7 12h10M10 17.5h4"/>',
  more: '<circle cx="5.5" cy="12" r="1.1"/><circle cx="12" cy="12" r="1.1"/><circle cx="18.5" cy="12" r="1.1"/>',
  key: '<circle cx="7.6" cy="15.4" r="4.9"/><path d="m11.1 11.9 9.4-9.4M16.5 6.5l3 3M14 9l2 2"/>',
  logout: '<path d="M9.5 21h-4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M15.5 16.5 20 12l-4.5-4.5M20 12H9"/>',
  refresh: '<path d="M3.5 12a8.5 8.5 0 0 1 14.6-5.9L20.5 8.5M20.5 3.5v5h-5M20.5 12a8.5 8.5 0 0 1-14.6 5.9L3.5 15.5M3.5 20.5v-5h5"/>',
  lock: '<rect x="4" y="10.5" width="16" height="11" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  folder: '<path d="M20 20.5a2 2 0 0 0 2-2V8.5a2 2 0 0 0-2-2h-7.6a2 2 0 0 1-1.7-.9l-.7-1.2a2 2 0 0 0-1.7-1H4a2 2 0 0 0-2 2v13.1a2 2 0 0 0 2 2Z"/>',
  arrowUpRight: '<path d="M7 17 17 7M8 7h9v9"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  layers: '<path d="m12 2.8 9.2 4.7L12 12.2 2.8 7.5 12 2.8Z"/><path d="m2.8 12.2 9.2 4.7 9.2-4.7M2.8 16.9l9.2 4.7 9.2-4.7"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.4"/>',
  shield: '<path d="M12 2.8 4.5 5.6v5.7c0 4.6 3.1 8.4 7.5 9.9 4.4-1.5 7.5-5.3 7.5-9.9V5.6L12 2.8Z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  clock: '<circle cx="12" cy="12" r="9.5"/><path d="M12 6.8V12l3.4 2"/>',
  filter: '<path d="M3.5 5h17l-6.6 8v5.8l-3.8 1.7V13L3.5 5Z"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9.5h18M3 14.5h18M9.5 4v16"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 13a1 1 0 0 0 1 .9h9a1 1 0 0 0 1-.9l1-13M9 7V4h6v3"/>',
  pencil: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m14.5 7.5 3 3"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  building: '<path d="M5 21V4.5A1.5 1.5 0 0 1 6.5 3h8A1.5 1.5 0 0 1 16 4.5V21M16 9h2.5A1.5 1.5 0 0 1 20 10.5V21M3 21h18M9 7.5h3M9 11.5h3M9 15.5h3"/>',
  box: '<path d="m12 2.8 8.5 4.2v10L12 21.2 3.5 17V7L12 2.8Z"/><path d="m3.5 7 8.5 4.2L20.5 7M12 11.2v10"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5l-9.4 9.4a2.1 2.1 0 0 1-3-3l9.4-9.4a4 4 0 0 0-2-2Z"/>',
  barChart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  list: '<path d="M8.5 6h12M8.5 12h12M8.5 18h12M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  globe: '<circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M12 2.5c2.6 2.8 4 6 4 9.5s-1.4 6.7-4 9.5c-2.6-2.8-4-6-4-9.5s1.4-6.7 4-9.5Z"/>',
  save: '<path d="M5 3h11l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M8 3v5h7V3M7.5 21v-7h9v7"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5v-3a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
  camera: '<path d="M3.5 8.5a2 2 0 0 1 2-2h2l1.4-2h6.2l1.4 2h2a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/><circle cx="12" cy="13" r="3.6"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.4 2.4M15.6 15.6 18 18M18 6l-2.4 2.4M8.4 15.6 6 18"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  briefcase: '<rect x="3" y="7.5" width="18" height="12.5" rx="2"/><path d="M8.5 7.5V5.2a1.7 1.7 0 0 1 1.7-1.7h3.6a1.7 1.7 0 0 1 1.7 1.7v2.3M3 13h18M10.5 13v1.6h3V13"/>',
  swap: '<path d="M4 8h14.5M14.5 4l4 4-4 4M20 16H5.5M9.5 12l-4 4 4 4"/>',
  home: '<path d="m3.5 11 8.5-7.5 8.5 7.5M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5M10 21v-6h4v6"/>',
};

export function Icon({ name, size = 16, stroke = 1.6, className = '', ...rest }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg
      className={`ui-icon${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
      dangerouslySetInnerHTML={{ __html: d }}
    />
  );
}

