import { describe, it, expect } from 'vitest';
import { getIssueYear, ISSUE_START_YEAR } from '../src/issueService.js';

describe('이슈 연도 분류', () => {
  it('발생일 기준 연도를 쓰고, 없으면 등록일을 쓴다', () => {
    expect(getIssueYear({ occurredDate: '2026-10-12' })).toBe(2026);
    expect(getIssueYear({ createdAt: '2027-01-03T00:00:00.000Z' })).toBe(2027);
    expect(getIssueYear({ occurredDate: '2025-12-31', createdAt: '2026-01-02T00:00:00Z' })).toBe(2025);
  });

  it('날짜가 없거나 잘못되면 null', () => {
    expect(getIssueYear({})).toBeNull();
    expect(getIssueYear({ occurredDate: 'abc' })).toBeNull();
    expect(getIssueYear(null)).toBeNull();
  });

  it('시작 연도는 2026', () => {
    expect(ISSUE_START_YEAR).toBe(2026);
  });
});
