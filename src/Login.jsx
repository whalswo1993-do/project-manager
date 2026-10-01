import { useState } from "react";
import { supabase } from "./supabase";
import {
  isAccountDeleted,
  authenticateTestAccount,
  requestPasswordReset,
  updateTestAccountPassword,
  saveCustomUserProfile,
} from "./authService";

export default function Login() {
  const [mode, setMode] = useState("login"); // "login" | "signup" | "reset" | "test-reset"
  const [emailInput, setEmailInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [teamInput, setTeamInput] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

      // 3. 일반 Supabase Auth 로그인
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: targetPassword,
      });

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
      <form className="login-card" onSubmit={submit}>
        <picture>
          <source srcSet={`${import.meta.env.BASE_URL || '/'}tw-logo-dark.png`.replace('//', '/')} media="(prefers-color-scheme: dark)" />
          <img src={`${import.meta.env.BASE_URL || '/'}tw-logo.png`.replace('//', '/')} alt="TW 로고" />
        </picture>
        <h1 style={{ fontSize: "22px", margin: "0 0 4px", textAlign: "center", color: "var(--text-primary)" }}>
          Project Management
        </h1>

        <div style={{ textAlign: "center", marginBottom: "8px" }}>
          {isResetMode && (
            <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
              비밀번호를 재설정할 회사 이메일을 입력해 주세요.
            </p>
          )}
          {isTestResetMode && (
            <p style={{ margin: 0, fontSize: "13px", color: "#0284c7", fontWeight: 600 }}>
              테스트 계정 ({emailInput}) 새 비밀번호 설정
            </p>
          )}
          {isSignupMode && (
            <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
              TW Group 신규 계정을 생성합니다.
            </p>
          )}
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
            placeholder={isTestResetMode ? "새 비밀번호 (6자리 이상)" : "비밀번호"}
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

        <button className="primary" disabled={submitting} style={{ height: "42px", fontWeight: "bold", fontSize: "14px" }}>
          {submitting
            ? "처리 중..."
            : isResetMode
            ? "재설정 인증 메일 발송"
            : isTestResetMode
            ? "비밀번호 재설정 완료"
            : isSignupMode
            ? "회원가입"
            : "로그인"}
        </button>

        {/* 하단 모드 전환 네비게이션 */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" }}>
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
                style={{ fontSize: "13px" }}
              >
                처음이신가요? 회원가입
              </button>
              <button
                type="button"
                className="link"
                onClick={() => {
                  setMode("reset");
                  setMessage("");
                }}
                disabled={submitting}
                style={{ fontSize: "12px", color: "#64748b" }}
              >
                비밀번호를 잊으셨나요? 비밀번호 찾기 / 재설정
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
              style={{ fontSize: "13px" }}
            >
              이미 계정이 있으신가요? 로그인
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
              style={{ fontSize: "13px", color: "#075ca8" }}
            >
              ← 로그인으로 돌아가기
            </button>
          )}
        </div>

        {isSignupMode && (
          <p className="signup-guide" style={{ fontSize: "12px", color: "#64748b", margin: "4px 0", lineHeight: "1.5" }}>
            TW Group 임직원만 가입 가능합니다.<br />
            회원가입 후 회사 이메일 인증을 완료해야 서비스를 이용할 수 있습니다.
          </p>
        )}

        {isResetMode && (
          <p style={{ fontSize: "12px", color: "#64748b", margin: "4px 0", lineHeight: "1.5", textAlign: "center" }}>
            가입된 사내 이메일 주소로 안전한 비밀번호 재설정 링크가 전송됩니다.
          </p>
        )}

        {message && (
          <div style={{
            padding: "10px 14px",
            borderRadius: "8px",
            background: message.includes("완료") || message.includes("발송") || message.includes("성공")
              ? "var(--info-muted)"
              : "var(--danger-muted)",
            border: `1px solid ${message.includes("완료") || message.includes("발송") || message.includes("성공")
              ? "rgba(2,132,199,0.25)"
              : "rgba(220,38,38,0.25)"}`,
            color: message.includes("완료") || message.includes("발송") || message.includes("성공")
              ? "var(--info)"
              : "var(--danger)",
            fontSize: "13px",
            lineHeight: "1.4",
            fontWeight: 500,
            textAlign: "center"
          }}>
            {message}
          </div>
        )}
      </form>
    </main>
  );
}

