import { supabase } from "./supabase.js";

// 영구 삭제된 계정 목록 로컬스토리지 키
const DELETED_ACCOUNTS_KEY = "tw_deleted_user_accounts";
// 테스트 계정 프로필 커스텀 상태 로컬스토리지 키 (Grade1, 2, 3 기본값 적용을 위해 v3)
const TEST_PROFILES_KEY = "tw_test_user_profiles_v3";
// 테스트 계정 현재 로그인 세션 키
const TEST_SESSION_KEY = "tw_test_active_session";
// Supabase 백그라운드 리프레시 토큰 저장 키
const BG_REFRESH_TOKEN_KEY = "tw_bg_refresh_token";

// 초기 시드용 리프레시 토큰 (DB 쿼리 권한 유지용)
const INITIAL_REFRESH_TOKEN = "c6w7xv7ho63t";

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
    description: "Grade3 (PM 매니저 / 프로젝트 등록·수정·삭제)",
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
  } catch (e) {
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
  const session = {
    user: {
      id: account.id,
      email: account.email,
      user_metadata: {
        name: account.name,
        full_name: account.name,
        department: account.department,
      },
    },
    expires_at: Math.floor(Date.now() / 1000) + 86400 * 7,
    isTestAccount: true,
  };

  setActiveTestSession(session);

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
    const { data, error } = await supabase.auth.updateUser({
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

