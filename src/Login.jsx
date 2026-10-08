import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import {
  isAccountDeleted,
  authenticateTestAccount,
  requestPasswordReset,
  updateTestAccountPassword,
  saveCustomUserProfile,
  recordUserAccess,
} from "./authService";
import "./Login.css";

export default function Login() {
  const [mode, setMode] = useState("login"); // "login" | "signup" | "reset" | "test-reset"
  const [emailInput, setEmailInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [teamInput, setTeamInput] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [currentTheme, setCurrentTheme] = useState(() => {
    try {
      return localStorage.getItem("pm_theme_mode") || "dark";
    } catch (e) {
      return "dark";
    }
  });

  useEffect(() => {
    try {
      document.documentElement.setAttribute("data-theme", currentTheme);
      document.body.className = `theme-${currentTheme}`;
      localStorage.setItem("pm_theme_mode", currentTheme);
    } catch (e) {}
  }, [currentTheme]);

  const toggleTheme = () => {
    setCurrentTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  async function performLogin(targetEmail, targetPassword) {
    setMessage("");
    const email = targetEmail.trim().toLowerCase();

    if (!email.endsWith("@twgroup.co.kr")) {
      setMessage("TW Group 임직원만 이용 가능합니다.");
      return;
    }

    // 1. 삭제 여부 확인
    if (isAccountDeleted(email)) {
      setMessage("삭제된 계정입니다. 해당 계정으로는 다시 로그인할 수 없습니다.");
      return;
    }

    setSubmitting(true);

    try {
      // 2. 테스트 계정 로그인 시도
      const testResult = await authenticateTestAccount(email, targetPassword);
      if (!testResult.isNotTestAccount) {
        if (!testResult.success) {
          setMessage(testResult.error || "테스트 계정 로그인에 실패했습니다.");
        }
        return;
      }

      // 3. 일반 Supabase Auth 로그인 (최대 10초 타임아웃 보호)
      const authPromise = supabase.auth.signInWithPassword({
        email,
        password: targetPassword,
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("서버 응답 시간이 초과되었습니다. 네트워크 상태를 확인해 주세요.")), 10000)
      );

      const { data, error } = await Promise.race([authPromise, timeoutPromise]);

      if (error) {
        const lowerMessage = error.message.toLowerCase();
        if (lowerMessage.includes("email not confirmed")) {
          setMessage("회사 이메일 인증을 완료한 후 로그인해 주세요.");
        } else {
          setMessage(error.message);
        }
        return;
      }

      // 로그인 성공 후 삭제 여부 재검사
      if (data?.user?.email && isAccountDeleted(data.user.email)) {
        await supabase.auth.signOut();
        setMessage("삭제된 계정입니다. 해당 계정으로는 다시 로그인할 수 없습니다.");
        return;
      }

      if (data?.user?.email) {
        await recordUserAccess(data.user.email, {
          name: data.user.user_metadata?.name,
          team: data.user.user_metadata?.team,
          department: data.user.user_metadata?.department,
          last_sign_in_at: data.user.last_sign_in_at || new Date().toISOString()
        });
      }
    } catch (err) {
      setMessage(err.message || "로그인 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setMessage("");

    const email = emailInput.trim().toLowerCase();

    if (!email.endsWith("@twgroup.co.kr")) {
      setMessage("TW Group 임직원만 이용 가능합니다.");
      return;
    }

    // 삭제된 계정 차단
    if (isAccountDeleted(email)) {
      setMessage("삭제된 계정입니다. 해당 계정으로는 이용할 수 없습니다.");
      return;
    }

    setSubmitting(true);

    try {
      // 1. 회원가입 모드
      if (mode === "signup") {
        if (!nameInput.trim()) {
          setMessage("이름을 입력해 주세요 (예: 홍길동).");
          return;
        }
        if (!teamInput.trim()) {
          setMessage("소속팀을 입력해 주세요 (예: PM팀, 설계팀, 제어팀 등).");
          return;
        }

        // 로컬 커스텀 프로필 캐시에 즉시 저장
        saveCustomUserProfile(email, {
          name: nameInput.trim(),
          team: teamInput.trim(),
          department: teamInput.trim()
        });

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + window.location.pathname,
            data: {
              name: nameInput.trim(),
              team: teamInput.trim(),
              department: teamInput.trim(),
              displayName: `${nameInput.trim()} (${teamInput.trim()})`
            }
          },
        });

        if (error) {
          setMessage(error.message);
          return;
        }

        try {
          if (data?.user?.id) {
            await supabase.from("profiles").upsert({
              id: data.user.id,
              email: email.toLowerCase(),
              name: nameInput.trim(),
              team: teamInput.trim(),
              department: teamInput.trim(),
              role: "grade1",
              active: true
            });
          }
        } catch (pe) {
          console.warn("Profiles upsert fallback:", pe);
        }

        if (data.session) {
          await supabase.auth.signOut();
          setMessage("회원가입이 완료되었습니다. 관리자 승인 후 로그인하실 수 있습니다.");
          setMode("login");
          setNameInput("");
          setTeamInput("");
          setPassword("");
          return;
        }

        setMessage("인증 메일이 발송되었습니다. 회사 이메일에서 인증을 완료한 후 로그인해 주세요.");
        setMode("login");
        setNameInput("");
        setTeamInput("");
        setPassword("");
        return;
      }

      // 2. 비밀번호 재설정 이메일 요청 모드
      if (mode === "reset") {
        const result = await requestPasswordReset(email);
        if (!result.success) {
          setMessage(result.error || "비밀번호 재설정 요청에 실패했습니다.");
          return;
        }

        if (result.isTestAccount) {
          // 테스트 계정은 바로 재설정 폼으로 이동
          setMessage("사내 테스트 계정입니다. 새 비밀번호를 바로 설정할 수 있습니다.");
          setMode("test-reset");
          setPassword("");
          setConfirmPassword("");
          return;
        }

        setMessage("비밀번호 재설정 링크가 발송되었습니다. 회사 메일함을 확인하여 링크를 클릭해 주세요.");
        return;
      }

      // 3. 테스트 계정 직접 재설정 모드
      if (mode === "test-reset") {
        if (password.length < 6) {
          setMessage("비밀번호는 최소 6자 이상이어야 합니다.");
          return;
        }
        if (password !== confirmPassword) {
          setMessage("새 비밀번호와 비밀번호 확인이 일치하지 않습니다.");
          return;
        }

        const res = updateTestAccountPassword(email, password);
        if (!res.success) {
          setMessage(res.error || "비밀번호 재설정에 실패했습니다.");
          return;
        }

        setMessage("비밀번호가 성공적으로 재설정되었습니다! 새 비밀번호로 로그인해 주세요.");
        setMode("login");
        setConfirmPassword("");
        return;
      }

      // 4. 일반 로그인 모드
      await performLogin(emailInput, password);
    } finally {
      setSubmitting(false);
    }
  }

  const isResetMode = mode === "reset";
  const isTestResetMode = mode === "test-reset";
  const isSignupMode = mode === "signup";

  return (
    <main className="login-page">
      <button
        type="button"
        className="login-theme-toggle"
        onClick={toggleTheme}
        title={currentTheme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
      >
        <span>{currentTheme === "dark" ? "☀️ 라이트 모드" : "🌙 다크 모드"}</span>
      </button>

      <form className="login-card" onSubmit={submit}>
        <div className="login-logo-container">
          <img
            src={
              currentTheme === "dark"
                ? `${import.meta.env.BASE_URL || "/"}/tw-logo-dark.png`.replace("//", "/")
                : `${import.meta.env.BASE_URL || "/"}/tw-logo.png`.replace("//", "/")
            }
            alt="(주)TW 로고"
            className="login-logo-img"
          />
        </div>

        <div className="login-card-header">
          <span className="login-badge-label">Project Management</span>
          <h1>
            {isSignupMode
              ? "신규 임직원 회원가입"
              : isResetMode
              ? "비밀번호 찾기 / 재설정"
              : isTestResetMode
              ? "새 비밀번호 설정"
              : "프로젝트 관리 시스템"}
          </h1>
          <p className="login-subtext">
            {isResetMode
              ? "비밀번호를 재설정할 사내 이메일을 입력해 주세요."
              : isTestResetMode
              ? `사내 테스트 계정 (${emailInput}) 새 비밀번호를 설정합니다.`
              : isSignupMode
              ? "TW Group 임직원 계정을 생성합니다."
              : "회사 이메일 계정(@twgroup.co.kr)으로 로그인하세요."}
          </p>
        </div>

        <input
          type="email"
          value={emailInput}
          onChange={(event) => setEmailInput(event.target.value)}
          placeholder="회사 이메일 (@twgroup.co.kr)"
          autoComplete="email"
          disabled={isTestResetMode}
          required
        />

        {isSignupMode && (
          <>
            <input
              type="text"
              value={nameInput}
              onChange={(event) => setNameInput(event.target.value)}
              placeholder="이름 (예: 홍길동)"
              autoComplete="name"
              required
            />
            <input
              type="text"
              value={teamInput}
              onChange={(event) => setTeamInput(event.target.value)}
              placeholder="소속팀 (예: PM팀, 설계팀, 제어팀 등)"
              autoComplete="organization"
              required
            />
          </>
        )}

        {!isResetMode && (
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={isTestResetMode ? "새 비밀번호 (6자리 이상)" : "비밀번호 입력"}
            autoComplete={isSignupMode || isTestResetMode ? "new-password" : "current-password"}
            minLength={6}
            required
          />
        )}

        {isTestResetMode && (
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="새 비밀번호 확인"
            autoComplete="new-password"
            minLength={6}
            required
          />
        )}

        <button className="primary" disabled={submitting}>
          {submitting
            ? "처리 중..."
            : isResetMode
            ? "재설정 링크 메일 발송"
            : isTestResetMode
            ? "비밀번호 재설정 완료"
            : isSignupMode
            ? "회원가입 신청"
            : "로그인"}
        </button>

        {/* 하단 모드 전환 네비게이션 */}
        <div className="login-links-container">
          {mode === "login" && (
            <>
              <button
                type="button"
                className="link"
                onClick={() => {
                  setMode("signup");
                  setMessage("");
                }}
                disabled={submitting}
              >
                처음이신가요? <strong>회원가입 신청</strong>
              </button>
              <button
                type="button"
                className="link link-subtle"
                onClick={() => {
                  setMode("reset");
                  setMessage("");
                }}
                disabled={submitting}
              >
                비밀번호를 잊으셨나요? 비밀번호 재설정
              </button>
            </>
          )}

          {mode === "signup" && (
            <button
              type="button"
              className="link"
              onClick={() => {
                setMode("login");
                setMessage("");
              }}
              disabled={submitting}
            >
              ← 이미 계정이 있으신가요? 로그인
            </button>
          )}

          {(isResetMode || isTestResetMode) && (
            <button
              type="button"
              className="link"
              onClick={() => {
                setMode("login");
                setMessage("");
              }}
              disabled={submitting}
            >
              ← 로그인으로 돌아가기
            </button>
          )}
        </div>

        {isSignupMode && (
          <p className="login-guide-box">
            TW Group 임직원만 가입 가능합니다.<br />
            회원가입 후 회사 이메일 인증을 완료해야 서비스를 이용할 수 있습니다.
          </p>
        )}

        {isResetMode && (
          <p className="login-guide-box">
            가입된 사내 이메일 주소로 안전한 비밀번호 재설정 링크가 전송됩니다.
          </p>
        )}

        {message && (
          <div
            className={`login-message-banner ${
              message.includes("완료") || message.includes("발송") || message.includes("성공")
                ? "info"
                : "danger"
            }`}
          >
            {message}
          </div>
        )}

        <div className="login-footer-copy">
          © (주)TW · 스마트 프로젝트 관리 시스템
        </div>
      </form>
    </main>
  );
}

