import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// CS 통합 관리 프로그램(public/cs)은 원본 단일 HTML에 디자인 연결만 끼운 것이다.
// scripts/build-cs-program.cjs 로 다시 만들었을 때 연결이 빠지지 않았는지 확인한다.
const html = readFileSync('public/cs/index.html', 'utf8');

describe('CS 통합 관리 프로그램', () => {
  it('앱 디자인 파일과 테마 동기화가 연결되어 있다', () => {
    expect(html).toMatch(/href="\.\/cs-theme\.css\?v=[a-z0-9]+"/);
    expect(html).toContain("pm_theme_mode");
    expect(html).toContain('cs-material-theme.css');
  });

  it('내장 자재현황 앱 코드가 문서를 깨지 않게 </script> 를 이스케이프한다', () => {
    const fn = html.slice(html.indexOf('function materialAppHtml'));
    const line = fn.slice(0, fn.indexOf('\n'));
    expect(line.includes('</script>')).toBe(false);
  });

  it('없는 옛 구역 때문에 시작 코드가 멈추지 않도록 renderAll 이 오류를 걸러 낸다', () => {
    expect(html).toContain("const legacy=['renderIssues'");
  });

  it('디자인 파일이 있다', () => {
    expect(readFileSync('public/cs/cs-theme.css', 'utf8')).toContain('--brand');
    expect(readFileSync('public/cs/cs-material-theme.css', 'utf8')).toContain('--brand');
  });
});
