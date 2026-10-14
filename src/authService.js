import { supabase } from "./supabase.js";

// 인증/사용자 프로필 서비스.
// 모든 로그인은 Supabase Auth 로만 이루어지고, 이름·팀·접속 기록·권한은 DB(profiles)가 정본이다.
// (예전에는 이 정보를 브라우저 로컬 저장소에 두어 컴퓨터마다 달랐고, 테스트 계정은 코드 안의 가짜 로그인이었다.)

const SUPER_ADMIN_EMAIL = "cmj1012@twgroup.co.kr";

// 예전 버전이 브라우저에 남겨 둔 값들 (로그인 정보·가짜 세션·접속 기록 등)
const LEGACY_KEYS_TO_PURGE = [
  "tw_bg_refresh_token",
  "tw_test_active_session",
  "tw_test_user_profiles_v3",
  "tw_deleted_user_accounts",
  "tw_user_last_access_v1",
];
// 관리자가 예전에 이 브라우저에서 입력한 이름/팀 — 서버로 한 번 이관한 뒤에는 쓰지 않는다
const LEGACY_CUSTOM_PROFILES_KEY = "tw_custom_user_profiles_v1";
const LEGACY_IMPORT_DONE_KEY = "tw_custom_profiles_imported_v1";

const clean = (value) => (typeof value === "string" ? value.trim() : "");

/** 앱 시작 시 한 번: 예전 방식이 남긴 민감한 로컬 데이터(가짜 세션, 별도 저장된 리프레시 토큰 등)를 지운다. */
export function purgeLegacyLocalAuthData() {
  try {
    if (typeof localStorage === "undefined") return;
    LEGACY_KEYS_TO_PURGE.forEach((key) => localStorage.removeItem(key));
  } catch (e) {
    console.warn("purgeLegacyLocalAuthData skipped:", e);
  }
}

/** 로그인된 Supabase 세션이 있는지 확인한다. */
export async function ensureSupabaseAuth() {
  try {
    const { data } = await supabase.auth.getSession();
    return Boolean(data?.session);
  } catch (e) {
    console.warn("ensureSupabaseAuth warning:", e);
    return false;
  }
}

/** 본인의 접속 시각을 서버(profiles)에 기록한다. signedIn=true 이면 로그인 시각도 갱신한다. */
export async function recordUserAccess(signedIn = false) {
  try {
    const { error } = await supabase.rpc("record_my_access", { p_signed_in: Boolean(signedIn) });
    if (error) console.warn("record_my_access skipped:", error.message);
  } catch (e) {
    console.warn("record_my_access skipped:", e);
  }
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

  let relative;
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

/**
 * 회원가입 입력 검증 — 이름과 소속팀은 필수. 문제가 있으면 안내 문구를, 없으면 빈 문자열을 돌려준다.
 * (DB 의 가입 트리거가 같은 규칙을 한 번 더 강제한다.)
 */
export function validateSignupProfile(name, team) {
  const n = clean(name);
  const t = clean(team);
  if (!n) return "이름을 입력해 주세요 (예: 홍길동).";
  if (n.length < 2) return "이름은 2자 이상 입력해 주세요.";
  if (!t) return "소속팀을 입력해 주세요 (예: PM팀, 설계팀, 제어팀 등).";
  if (t.length < 2) return "소속팀은 2자 이상 입력해 주세요.";
  return "";
}

/**
 * 사용자 표시 이름 (예: "조민재 선임 (PM팀)").
 * source 는 profiles 행({name, team}) 또는 로그인 메타데이터({user_metadata}) 어느 쪽이든 된다.
 */
export function getUserDisplayName(userOrEmail, source = {}) {
  const email = clean(typeof userOrEmail === "string" ? userOrEmail : userOrEmail?.email).toLowerCase();
  if (!email && !source?.name && !source?.user_metadata?.name) return "사용자";

  const meta = source?.user_metadata || userOrEmail?.user_metadata || {};
  const name = clean(source?.name) || clean(meta.name) || clean(userOrEmail?.name);
  const team = clean(source?.team) || clean(source?.department) || clean(meta.team) || clean(meta.department);

  if (name && team) return `${name} (${team})`;
  if (name) return name;
  if (team) return `${email} (${team})`;
  return email;
}

/** 사용자 소속팀 */
export function getUserTeam(userOrEmail, source = {}) {
  const meta = source?.user_metadata || userOrEmail?.user_metadata || {};
  return clean(source?.team) || clean(source?.department) || clean(meta.team) || clean(meta.department) || "";
}

/**
 * [관리자 전용] 이 브라우저에 남아 있던 예전 이름/팀 데이터를 서버(profiles)로 한 번 이관한다.
 * 서버에 값이 이미 있으면 덮어쓰지 않고, 비어 있는 항목만 채운다. 모두 성공하면 다시 실행하지 않는다.
 * @returns {Promise<number>} 이관한 사용자 수
 */
export async function importLegacyLocalProfiles(serverProfiles = []) {
  try {
    if (typeof localStorage === "undefined") return 0;
    if (localStorage.getItem(LEGACY_IMPORT_DONE_KEY) === "1") return 0;

    const raw = localStorage.getItem(LEGACY_CUSTOM_PROFILES_KEY);
    if (!raw) {
      localStorage.setItem(LEGACY_IMPORT_DONE_KEY, "1");
      return 0;
    }

    const local = JSON.parse(raw) || {};
    let imported = 0;
    let failed = 0;

    for (const profile of serverProfiles) {
      const entry = local[clean(profile.email).toLowerCase()];
      if (!entry) continue;

      const patch = {};
      const localName = clean(entry.name);
      const localTeam = clean(entry.team) || clean(entry.department);
      if (!clean(profile.name) && localName) patch.name = localName;
      if (!clean(profile.team) && localTeam) patch.team = localTeam;
      if (Object.keys(patch).length === 0) continue;

      const { error } = await supabase.from("profiles").update(patch).eq("id", profile.id);
      if (error) failed += 1;
      else imported += 1;
    }

    if (failed === 0) localStorage.setItem(LEGACY_IMPORT_DONE_KEY, "1");
    return imported;
  } catch (e) {
    console.warn("importLegacyLocalProfiles skipped:", e);
    return 0;
  }
}

/** [최고 관리자 전용] 계정을 서버에서 영구 삭제한다. */
export async function deleteUserAccount(userId) {
  if (!userId) return { success: false, error: "삭제할 사용자를 확인할 수 없습니다." };
  try {
    const { error } = await supabase.rpc("admin_delete_user", { p_user_id: userId });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message || "사용자 삭제 중 오류가 발생했습니다." };
  }
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
      message: "비밀번호 재설정 링크가 이메일로 발송되었습니다. 회사 메일함을 확인하여 비밀번호를 재설정해 주세요.",
    };
  } catch (err) {
    return { success: false, error: err.message || "비밀번호 재설정 메일 발송 중 오류가 발생했습니다." };
  }
}

// 비밀번호 변경 또는 복구 후 재설정 (현재 로그인된 본인 계정)
export async function updateUserPassword(newPassword) {
  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: "비밀번호는 최소 6자 이상이어야 합니다." };
  }

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

export { SUPER_ADMIN_EMAIL };
