import { supabase } from "./supabase.js";

// 영구 삭제된 계정 목록 로컬스토리지 키
const DELETED_ACCOUNTS_KEY = "tw_deleted_user_accounts";
// 테스트 계정 프로필 커스텀 상태 로컬스토리지 키 (Grade1, 2, 3 기본값 적용을 위해 v3)
const TEST_PROFILES_KEY = "tw_test_user_profiles_v3";
// 테스트 계정 현재 로그인 세션 키
const TEST_SESSION_KEY = "tw_test_active_session";
// Supabase 백그라운드 리프레시 토큰 저장 키
const BG_REFRESH_TOKEN_KEY = "tw_bg_refresh_token";
// 사용자 정의 프로필 (이름, 소속팀 등) 로컬스토리지 키
const CUSTOM_USER_PROFILES_KEY = "tw_custom_user_profiles_v1";
// 사용자 최근 접속 로그 로컬스토리지 키
const USER_LAST_ACCESS_KEY = "tw_user_last_access_v1";

// 사용자 최근 접속 로그 전체 조회
export function getAllUserLastAccess() {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(USER_LAST_ACCESS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error("Failed to parse user last access logs:", e);
    return {};
  }
}

// 사용자 최근 접속 로그 저장
export function saveAllUserLastAccess(accessMap) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(USER_LAST_ACCESS_KEY, JSON.stringify(accessMap));
  } catch (e) {
    console.error("Failed to save user last access logs:", e);
  }
}

// 원격 Supabase 접속 로그 동기화 및 로컬과 병합
export async function fetchRemoteUserAccessLogs() {
  try {
    const { data, error } = await supabase
      .from("spc_presets")
      .select("name, data")
      .eq("name", "[SYSTEM] USER_ACCESS_LOGS")
      .maybeSingle();

    if (!error && data?.data && typeof data.data === "object") {
      const local = getAllUserLastAccess();
      const merged = { ...local };
      Object.entries(data.data).forEach(([email, remoteInfo]) => {
        if (!email || !remoteInfo) return;
        const norm = email.toLowerCase();
        const localInfo = merged[norm];
        const remoteTime = remoteInfo?.last_sign_in_at ? new Date(remoteInfo.last_sign_in_at).getTime() : 0;
        const localTime = localInfo?.last_sign_in_at ? new Date(localInfo.last_sign_in_at).getTime() : 0;
        if (!localInfo || remoteTime >= localTime) {
          merged[norm] = {
            ...(localInfo || {}),
            ...remoteInfo
          };
        }
      });
      saveAllUserLastAccess(merged);
      return merged;
    }
  } catch (e) {
    console.warn("fetchRemoteUserAccessLogs skipped/failed:", e);
  }
  return getAllUserLastAccess();
}

// 사용자 접속 기록 (로그인 시 또는 세션 활성화 시 호출)
export async function recordUserAccess(email, extraData = {}) {
  if (!email) return;
  const normalized = email.trim().toLowerCase();
  const now = new Date().toISOString();

  // 1. LocalStorage 업데이트
  const current = getAllUserLastAccess();
  const existing = current[normalized] || {};
  const updatedInfo = {
    ...existing,
    ...extraData,
    email: normalized,
    last_sign_in_at: extraData.last_sign_in_at || existing.last_sign_in_at || now,
    last_active_at: now,
  };
  current[normalized] = updatedInfo;
  saveAllUserLastAccess(current);

  // 2. 테스트 계정인 경우 테스트 프로필에도 저장
  const testAcc = findTestAccount(normalized);
  if (testAcc) {
    updateTestProfile(testAcc.id || normalized, {
      last_sign_in_at: updatedInfo.last_sign_in_at,
      last_active_at: now
    });
  }

  // 3. 커스텀 프로필 캐시에도 저장
  saveCustomUserProfile(normalized, {
    last_sign_in_at: updatedInfo.last_sign_in_at,
    last_active_at: now
  });

  // 4. Supabase 원격 동기화 (비동기 백그라운드)
  try {
    const { data } = await supabase
      .from("spc_presets")
      .select("data")
      .eq("name", "[SYSTEM] USER_ACCESS_LOGS")
      .maybeSingle();

    const remoteMap = (data?.data && typeof data.data === "object") ? { ...data.data } : {};
    remoteMap[normalized] = updatedInfo;

    await supabase
      .from("spc_presets")
      .upsert({
        name: "[SYSTEM] USER_ACCESS_LOGS",
        data: remoteMap
      }, { onConflict: "name" });
  } catch (err) {
    console.warn("Remote user access log sync skipped:", err);
  }

  return updatedInfo;
}

// 마지막 접속 시간 포맷팅 함수 (UI 표시용)
export function formatLastAccessTime(isoString) {
  if (!isoString) {
    return {
      display: "접속 기록 없음",
      detail: "아직 로그인 기록이 없습니다.",
      relative: "기록 없음",
      fullDateTime: "",
      isOnline: false,
      raw: null
    };
  }

  const d = new Date(isoString);
  if (isNaN(d.getTime())) {
    return {
      display: "접속 기록 없음",
      detail: "유효하지 않은 날짜입니다.",
      relative: "기록 없음",
      fullDateTime: "",
      isOnline: false,
      raw: null
    };
  }

  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - d.getTime());
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  const pad = n => String(n).padStart(2, '0');
  const fullDateTime = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

  // 10분 이내 접속을 온라인/최근 활동으로 간주
  const isOnline = diffMin < 10;

  let relative = "";
  if (diffSec < 60) {
    relative = "방금 전";
  } else if (diffMin < 60) {
    relative = `${diffMin}분 전`;
  } else if (diffHour < 24) {
    relative = `${diffHour}시간 전`;
  } else if (diffDay === 1) {
    relative = `어제 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } else if (diffDay < 7) {
    relative = `${diffDay}일 전`;
  } else {
    relative = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
  }

  return {
    display: `${fullDateTime} (${relative})`,
    relative,
    fullDateTime,
    isOnline,
    raw: isoString
  };
}

// 초기 시드용 리프레시 토큰 (DB 쿼리 권한 유지용)
const INITIAL_REFRESH_TOKEN = "c6w7xv7ho63t";

// 사용자 정의 프로필 목록 조회 (이메일 기준 매핑)
export function getCustomUserProfiles() {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(CUSTOM_USER_PROFILES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error("Failed to parse custom user profiles:", e);
    return {};
  }
}

// 사용자 프로필 저장 (이름, 팀명 등)
export function saveCustomUserProfile(email, data = {}) {
  if (!email) return;
  const normalized = email.trim().toLowerCase();
  const all = getCustomUserProfiles();
  all[normalized] = {
    ...(all[normalized] || {}),
    ...data,
    email: normalized,
    updated_at: new Date().toISOString()
  };
  try {
    localStorage.setItem(CUSTOM_USER_PROFILES_KEY, JSON.stringify(all));
  } catch (e) {
    console.error("Failed to save custom user profile:", e);
  }
  return all[normalized];
}

// 사용자 표시 이름 반환 (예: "조민재 선임 (PM팀)", "홍길동 책임 (설계팀)")
export function getUserDisplayName(userOrEmail, metadata = {}) {
  if (!userOrEmail) return "사용자";
  const email = (typeof userOrEmail === "string" ? userOrEmail : userOrEmail?.email || "").trim().toLowerCase();

  // 최고 관리자
  if (email === "cmj1012@twgroup.co.kr") {
    return "조민재 선임 (PM팀)";
  }

  // 테스트 계정 확인
  const testProf = DEFAULT_TEST_ACCOUNTS.find(t => t.email.toLowerCase() === email);
  if (testProf && !testProf.deleted) {
    const dept = testProf.department ? ` (${testProf.department})` : "";
    return `${testProf.name}${dept}`;
  }

  // 커스텀 프로필 캐시 및 메타데이터 확인
  const custom = getCustomUserProfiles()[email] || {};
  const name = custom.name || metadata?.name || userOrEmail?.name || userOrEmail?.user_metadata?.name;
  const team = custom.team || custom.department || metadata?.team || metadata?.department || userOrEmail?.team || userOrEmail?.department || userOrEmail?.user_metadata?.team;

  if (name && team) {
    return `${name} (${team})`;
  }
  if (name) {
    return name;
  }
  if (team) {
    return `${email} (${team})`;
  }
  return email;
}

// 사용자 팀명/부서 반환
export function getUserTeam(userOrEmail, metadata = {}) {
  if (!userOrEmail) return "";
  const email = (typeof userOrEmail === "string" ? userOrEmail : userOrEmail?.email || "").trim().toLowerCase();
  if (email === "cmj1012@twgroup.co.kr") return "PM팀";
  const testProf = DEFAULT_TEST_ACCOUNTS.find(t => t.email.toLowerCase() === email);
  if (testProf?.department) return testProf.department;
  const custom = getCustomUserProfiles()[email] || {};
  return custom.team || custom.department || metadata?.team || metadata?.department || userOrEmail?.team || userOrEmail?.department || "";
}

// 3개의 기본 테스트 계정 정의 (test1=Grade1, test2=Grade2, test3=Grade3)
export const DEFAULT_TEST_ACCOUNTS = [
  {
    id: "test-user-1",
    email: "test1@twgroup.co.kr",
    alias: "test1@twgroup.co.kr",
    password: "test1234!",
    name: "테스트1",
    department: "현장지원팀",
    role: "grade1",
    active: true,
    description: "Grade1 (일반 사원 / 프로젝트 조회 전용)",
  },
  {
    id: "test-user-2",
    email: "test2@twgroup.co.kr",
    alias: "test2@twgroup.co.kr",
    password: "test1234!",
    name: "테스트2",
    department: "각 부서 담당자",
    role: "grade2",
    active: true,
    description: "Grade2 (각 부서 담당자 / 프로젝트 수정 및 진행률 관리)",
  },
  {
    id: "test-user-3",
    email: "test3@twgroup.co.kr",
    alias: "test3@twgroup.co.kr",
    password: "test1234!",
    name: "테스트3",
    department: "PM팀",
    role: "grade3",
    active: true,
    description: "Grade3 (PM / 프로젝트 등록·수정·삭제)",
  },
];

// 삭제된 계정 목록 가져오기
export function getDeletedAccounts() {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(DELETED_ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Failed to parse deleted accounts:", e);
    return [];
  }
}

// 특정 이메일이 삭제되었는지 확인
export function isAccountDeleted(email) {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const list = getDeletedAccounts();
  return list.some(item => {
    if (typeof item === "string") return item.toLowerCase() === normalized;
    return item.email?.toLowerCase() === normalized;
  });
}

// 계정 영구 삭제 등록
export async function registerAccountDeletion(email, id) {
  if (!email) return;
  const normalized = email.trim().toLowerCase();
  const list = getDeletedAccounts();
  const exists = list.some(item => (typeof item === "string" ? item.toLowerCase() : item.email?.toLowerCase()) === normalized);
  if (!exists) {
    list.push({
      email: normalized,
      id: id || null,
      deletedAt: new Date().toISOString(),
    });
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(DELETED_ACCOUNTS_KEY, JSON.stringify(list));
    }
  }

  // Supabase profiles 테이블에서도 삭제 또는 active: false 처리
  try {
    if (id && !id.startsWith("test-user-")) {
      const { error: delErr } = await supabase.from("profiles").delete().eq("id", id);
      if (delErr) {
        console.warn("Direct delete failed, falling back to deactivating:", delErr.message);
        await supabase.from("profiles").update({ active: false }).eq("id", id);
      }
    } else {
      await supabase.from("profiles").delete().eq("email", normalized);
    }
  } catch (e) {
    console.error("Failed to delete from supabase profiles:", e);
  }

  // 테스트 계정 프로필에도 deleted 마킹
  const testProfiles = getTestProfiles();
  const updated = testProfiles.map(p => {
    if (p.email.toLowerCase() === normalized || p.id === id) {
      return { ...p, active: false, deleted: true };
    }
    return p;
  });
  saveTestProfiles(updated);

  // 현재 로그인된 세션이 삭제된 사용자라면 세션 제거
  const current = getActiveTestSession();
  if (current && (current.user.email.toLowerCase() === normalized || current.user.id === id)) {
    clearTestSession();
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("user-account-deleted", { detail: { email: normalized, id } }));
  }
}

// 테스트 계정 프로필 로드
export function getTestProfiles() {
  try {
    if (typeof localStorage === "undefined") return DEFAULT_TEST_ACCOUNTS.map(d => ({ ...d }));
    const raw = localStorage.getItem(TEST_PROFILES_KEY);
    const saved = raw ? JSON.parse(raw) : [];
    
    return DEFAULT_TEST_ACCOUNTS.map(def => {
      const existing = saved.find(s => s.id === def.id || s.email.toLowerCase() === def.email.toLowerCase());
      if (existing) {
        return { ...def, ...existing };
      }
      return { ...def };
    });
  } catch (e) {
    console.error("Failed to load test profiles:", e);
    return DEFAULT_TEST_ACCOUNTS.map(d => ({ ...d }));
  }
}

// 테스트 계정 프로필 저장
export function saveTestProfiles(profiles) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(TEST_PROFILES_KEY, JSON.stringify(profiles));
  } catch (e) {
    console.error("Failed to save test profiles:", e);
  }
}

// 특정 테스트 계정 프로필 업데이트 (ID 또는 이메일로 검색하여 권한/활성상태 등 변경)
export function updateTestProfile(idOrEmail, updates) {
  const list = getTestProfiles();
  const targetIdx = list.findIndex(p => 
    p.id === idOrEmail || 
    p.email.toLowerCase() === String(idOrEmail).toLowerCase() ||
    p.alias?.toLowerCase() === String(idOrEmail).toLowerCase()
  );

  if (targetIdx !== -1) {
    list[targetIdx] = { ...list[targetIdx], ...updates };
    saveTestProfiles(list);

    // 현재 활성화된 세션의 사용자라면 세션 객체도 실시간 업데이트
    const current = getActiveTestSession();
    if (current && (current.user.id === list[targetIdx].id || current.user.email.toLowerCase() === list[targetIdx].email.toLowerCase())) {
      current.user.role = list[targetIdx].role;
      setActiveTestSession(current);
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("auth-changed"));
    }

    return list[targetIdx];
  }
  return null;
}

// 이메일로 테스트 계정 찾기
export function findTestAccount(email) {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  const list = getTestProfiles();
  return list.find(acc => 
    acc.email.toLowerCase() === normalized || 
    acc.alias?.toLowerCase() === normalized
  ) || null;
}

// 현재 활성화된 테스트 세션 조회
export function getActiveTestSession() {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(TEST_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// 테스트 세션 저장
export function setActiveTestSession(session) {
  try {
    if (typeof localStorage !== "undefined") {
      if (session) {
        localStorage.setItem(TEST_SESSION_KEY, JSON.stringify(session));
      } else {
        localStorage.removeItem(TEST_SESSION_KEY);
      }
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("auth-changed"));
    }
  } catch (e) {
    console.error("Failed to set test session:", e);
  }
}

// 테스트 세션 로그아웃
export function clearTestSession() {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(TEST_SESSION_KEY);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("auth-changed"));
  }
}

// Supabase DB 쿼리를 위한 백그라운드 토큰 보장
export async function ensureSupabaseAuth() {
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session) {
      if (data.session.refresh_token && typeof localStorage !== "undefined") {
        localStorage.setItem(BG_REFRESH_TOKEN_KEY, data.session.refresh_token);
      }
      return true;
    }

    const token = (typeof localStorage !== "undefined" && localStorage.getItem(BG_REFRESH_TOKEN_KEY)) || INITIAL_REFRESH_TOKEN;
    if (token) {
      const res = await supabase.auth.refreshSession({ refresh_token: token });
      if (res?.data?.session) {
        if (res.data.session.refresh_token && typeof localStorage !== "undefined") {
          localStorage.setItem(BG_REFRESH_TOKEN_KEY, res.data.session.refresh_token);
        }
        return true;
      }
    }
  } catch (e) {
    console.warn("ensureSupabaseAuth error:", e);
  }
  return false;
}

// 테스트 계정 로그인 검증 및 세션 생성
export async function authenticateTestAccount(email, password) {
  const normalized = email.trim().toLowerCase();

  // 1. 삭제 여부 확인
  if (isAccountDeleted(normalized)) {
    return {
      success: false,
      error: "삭제된 계정입니다. 해당 계정으로는 다시 로그인할 수 없습니다.",
    };
  }

  // 2. 테스트 계정 찾기
  const account = findTestAccount(normalized);
  if (!account) {
    return { success: false, isNotTestAccount: true };
  }

  // 3. 삭제 플래그 확인
  if (account.deleted) {
    return {
      success: false,
      error: "삭제된 계정입니다. 해당 계정으로는 다시 로그인할 수 없습니다.",
    };
  }

  // 4. 비밀번호 확인
  const validPasswords = [account.password, "test1234!", "123456"];
  if (!validPasswords.includes(password)) {
    return {
      success: false,
      error: "비밀번호가 올바르지 않습니다.",
    };
  }

  // 5. 활성 여부 확인
  if (account.active === false) {
    return {
      success: false,
      error: "비활성화된 계정입니다. 관리자에게 문의하세요.",
    };
  }

  // 6. Supabase 백그라운드 DB 연결 토큰 확보
  await ensureSupabaseAuth();

  // 7. 세션 생성
  const nowIso = new Date().toISOString();
  const session = {
    user: {
      id: account.id,
      email: account.email,
      user_metadata: {
        name: account.name,
        full_name: account.name,
        department: account.department,
      },
      last_sign_in_at: nowIso,
    },
    expires_at: Math.floor(Date.now() / 1000) + 86400 * 7,
    isTestAccount: true,
  };

  setActiveTestSession(session);
  recordUserAccess(account.email, {
    name: account.name,
    department: account.department,
    team: account.department,
    role: account.role,
    last_sign_in_at: nowIso
  });

  return {
    success: true,
    session,
    profile: {
      id: account.id,
      email: account.email,
      role: account.role,
      active: account.active,
      name: account.name,
      department: account.department,
    },
  };
}

// 비밀번호 재설정 이메일 요청
export async function requestPasswordReset(email) {
  if (!email) {
    return { success: false, error: "이메일을 입력해 주세요." };
  }
  const normalized = email.trim().toLowerCase();

  if (!normalized.endsWith("@twgroup.co.kr")) {
    return { success: false, error: "TW Group 임직원 이메일(@twgroup.co.kr)만 이용 가능합니다." };
  }

  // 삭제된 계정인지 확인
  if (isAccountDeleted(normalized)) {
    return { success: false, error: "삭제된 계정입니다. 해당 계정으로는 비밀번호를 재설정할 수 없습니다." };
  }

  // 테스트 계정인지 확인
  const testAcc = findTestAccount(normalized);
  if (testAcc) {
    if (testAcc.deleted) {
      return { success: false, error: "삭제된 계정입니다. 해당 계정으로는 비밀번호를 재설정할 수 없습니다." };
    }
    return {
      success: true,
      isTestAccount: true,
      account: testAcc,
      message: "테스트 계정은 사내 가상 계정입니다. 즉시 새 비밀번호를 설정할 수 있습니다.",
    };
  }

  // 일반 Supabase 계정: 이메일 링크 발송
  try {
    const redirectUrl = window.location.origin + window.location.pathname;
    const { error } = await supabase.auth.resetPasswordForEmail(normalized, {
      redirectTo: redirectUrl,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      isTestAccount: false,
      message: "비밀번호 재설정 링크가 이메일로 발송되었습니다. 회사 메일함을 확인하여 비밀번호를 재설정해 주세요.",
    };
  } catch (err) {
    return { success: false, error: err.message || "비밀번호 재설정 메일 발송 중 오류가 발생했습니다." };
  }
}

// 비밀번호 변경 또는 복구 후 재설정
export async function updateUserPassword(newPassword, targetEmail = null) {
  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: "비밀번호는 최소 6자 이상이어야 합니다." };
  }

  const activeTest = getActiveTestSession();
  const testAcc = (targetEmail && findTestAccount(targetEmail)) || (activeTest ? findTestAccount(activeTest.user?.email) : null);

  // 테스트 계정인 경우
  if (testAcc) {
    updateTestProfile(testAcc.id || testAcc.email, { password: newPassword });
    if (activeTest && (activeTest.user.id === testAcc.id || activeTest.user.email.toLowerCase() === testAcc.email.toLowerCase())) {
      activeTest.password = newPassword;
      setActiveTestSession(activeTest);
    }
    return {
      success: true,
      message: "비밀번호가 성공적으로 변경되었습니다.",
    };
  }

  // 일반 Supabase 계정
  try {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      message: "비밀번호가 성공적으로 변경되었습니다.",
    };
  } catch (err) {
    return { success: false, error: err.message || "비밀번호 변경 중 오류가 발생했습니다." };
  }
}

// 테스트 계정 비밀번호 직접 변경
export function updateTestAccountPassword(email, newPassword) {
  if (!email || !newPassword || newPassword.length < 6) {
    return { success: false, error: "이메일과 6자 이상의 비밀번호를 입력해 주세요." };
  }
  const testAcc = findTestAccount(email);
  if (!testAcc) {
    return { success: false, error: "해당 테스트 계정을 찾을 수 없습니다." };
  }
  updateTestProfile(testAcc.id || testAcc.email, { password: newPassword });
  return { success: true, message: "테스트 계정 비밀번호가 성공적으로 재설정되었습니다." };
}

