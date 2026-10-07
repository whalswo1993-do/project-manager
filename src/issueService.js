import { supabase } from './supabase.js';
import { normalizeJVName } from './utils.js';

// v3: 이전 테스트용 샘플 데이터(v2)가 로컬에 남지 않도록 키를 변경
const LOCAL_STORAGE_KEY = 'pm_integrated_issues_v3';
const SYSTEM_RECORD_NAME = '[SYSTEM] INTEGRATED_ISSUES';

// 과거 테스트용 샘플 이슈(issue-seed-*)는 어디서 불러오든 항상 제외
const stripSeedIssues = (list) =>
  (Array.isArray(list) ? list : []).filter(i => !String(i?.id || '').startsWith('issue-seed-'));

// 로컬 스토리지에서 이슈 목록 가져오기
export function getLocalIssues() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) return stripSeedIssues(JSON.parse(raw));
  } catch (e) {
    console.warn('[issueService] Local storage read error:', e);
  }
  return [];
}

// 로컬 스토리지에 저장
export function saveLocalIssues(issues) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(issues));
  } catch (e) {
    console.warn('[issueService] Local storage write error:', e);
  }
}

// 원격 Supabase spc_presets 테이블과 동기화
export async function fetchRemoteIssues() {
  try {
    const { data, error } = await supabase
      .from('spc_presets')
      .select('name, data')
      .eq('name', SYSTEM_RECORD_NAME)
      .maybeSingle();

    if (!error && data && Array.isArray(data.data)) {
      const cleaned = stripSeedIssues(data.data);
      saveLocalIssues(cleaned);
      return cleaned;
    }
  } catch (e) {
    console.warn('[issueService] Remote fetch error, fallback to local:', e);
  }
  return getLocalIssues();
}

// 원격 Supabase에 전체 동기화 저장
export async function syncRemoteIssues(issues) {
  saveLocalIssues(issues);
  try {
    const { data: existing, error: findErr } = await supabase
      .from('spc_presets')
      .select('id')
      .eq('name', SYSTEM_RECORD_NAME)
      .maybeSingle();

    if (existing?.id) {
      await supabase
        .from('spc_presets')
        .update({ data: issues })
        .eq('id', existing.id);
    } else if (!findErr) {
      await supabase
        .from('spc_presets')
        .insert({
          name: SYSTEM_RECORD_NAME,
          data: issues
        });
    }
  } catch (e) {
    console.warn('[issueService] Remote sync save error (local saved):', e);
  }
}

// 이슈 추가 또는 수정
export async function upsertIssue(issueData) {
  const current = getLocalIssues();
  const now = new Date().toISOString();
  let updatedList = [];

  const existingIndex = current.findIndex(i => i.id === issueData.id);
  if (existingIndex >= 0) {
    const updated = {
      ...current[existingIndex],
      ...issueData,
      updatedAt: now
    };
    updatedList = [...current];
    updatedList[existingIndex] = updated;
  } else {
    const newIssue = {
      ...issueData,
      id: issueData.id || `issue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: issueData.createdAt || now,
      updatedAt: now,
      status: issueData.status || 'open'
    };
    updatedList = [newIssue, ...current];
  }

  await syncRemoteIssues(updatedList);
  return updatedList;
}

// 이슈 삭제
export async function deleteIssue(issueId) {
  const current = getLocalIssues();
  const filtered = current.filter(i => i.id !== issueId);
  await syncRemoteIssues(filtered);
  return filtered;
}

// 사용자가 등록한 기본 핵심 SITE 목록 (사용자가 직접 명시한 표준 사이트)
export const CORE_REGISTERED_SITES = [
  'SKOJ',
  'SKOY',
  'SKBM',
  'SKOH',
  'SKOH2',
  'SKBA',
  'SKOT(TN1)',
  'HSBMA'
];

// 사용자가 [Site 관리] 및 프로젝트에 등록한 SITE 이름 목록 (LGE, 삼성SDI, 현대 등 미등록 사이트는 완전 배제)
export function getRegisteredSiteNames(sites = [], projects = []) {
  const seen = new Set();
  const names = [];

  const add = (raw) => {
    const name = normalizeJVName(String(raw || '')).trim();
    if (!name) return;
    const key = name.toLowerCase();
    // LGE, SAMSUNG, 현대 등 사용자가 등록하지 않은 사이트는 완전 배제
    if (key.includes('lge') || key.includes('sdi') || key.includes('현대') || key.includes('hyundai')) return;
    if (seen.has(key)) return;
    seen.add(key);
    names.push(name);
  };

  (sites || []).forEach(s => add(s?.name ?? s));
  (projects || []).forEach(p => add(p?.site));

  // 등록된 사이트가 없거나 초기 로딩 시 기본 사용자 등록 사이트 제공
  if (names.length === 0) {
    CORE_REGISTERED_SITES.forEach(add);
  }

  return names;
}

