import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

// public/cs 는 앱에 끼워 넣은 CS 통합 관리 프로그램(직접 고치는 원본)이다. 연결이 빠지지 않았는지 확인한다.
const read = (f) => readFileSync(`public/cs/${f}`, 'utf8');
const html = read('index.html');
const app = read('cs-app.js');

describe('CS 통합 관리 프로그램', () => {
  it('앱 디자인·테마 동기화·저장소 어댑터가 연결되어 있다', () => {
    expect(html).toContain('./cs-theme.css');
    expect(html).toContain('./cs-store.js');
    expect(html).toContain('./cs-theme-sync.js');
    expect(read('cs-theme-sync.js')).toContain('pm_theme_mode');
    expect(read('material.html')).toContain('cs-material-theme.css');
  });

  it('저장은 Supabase 어댑터만 쓴다(브라우저 IndexedDB/localStorage 저장소를 직접 열지 않는다)', () => {
    expect(app).toContain('csStore.facade()');
    expect(app).not.toContain('indexedDB.open');
    expect(read('material.html')).not.toContain('indexedDB.open');
    expect(app).not.toMatch(/localStorage\.(get|set)Item\('gacs_v1'/);
  });
  it('JSON 저장/가져오기 단추는 없다', () => {
    expect(html).not.toContain('>JSON 저장<');
    expect(html).not.toContain('importJSON');
  });

  it('쓰지 않는 옛 구역(SKO·규격·출하·이슈·품질 등)이 남아 있지 않다', () => {
    ['sko', 'specs', 'shipping'].forEach((id) => expect(html).not.toContain(`<section id="${id}"`));
    ['renderIssues', 'renderQuality', 'renderSKO', 'renderExecutive', 'exportJSON'].forEach((n) => expect(app).not.toContain(n));
  });

  it('자재현황은 srcdoc/base64 가 아니라 별도 파일로 불러온다', () => {
    expect(app).not.toContain('MATERIAL_APP_HTML_B64');
    expect(app).toContain("frame.src='./material.html");
    expect(existsSync('public/cs/material.html')).toBe(true);
  });
});
