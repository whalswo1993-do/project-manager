import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import {
  requestPasswordReset,
  recordUserAccess,
  validateSignupProfile,
} from "./authService";
import { Icon } from "./icons";
import "./Login.css";

// 왼쪽 장식에 쓰는 가짜 막대 (실제 프로젝트 이름이 아니다. 로그인 전 화면이라 내부 정보를 넣지 않는다)
const ART_ROWS = [
  ["STK-01", 4, 68, 88],
  ["STK-02", 10, 70, 74],
  ["NCH-01", 18, 74, 38],
  ["VIS-03", 30, 82, 33],
  ["STK-04", 6, 58, 93],
  ["NCH-02", 46, 90, 12],
];

export default function Login() {
  const [mode, setMode] = useState("login"); // "login" | "signup" | "reset"
  const [emailInput, setEmailInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [teamInput, setTeamInput] = useState("");
  const [password, setPassword] = useState("");
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

    setSubmitting(true);

    try {
      // Supabase Auth 로그인 (최대 10초 타임아웃 보호)
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
        } else if (lowerMessage.includes("invalid login credentials")) {
          setMessage("이메일 또는 비밀번호가 올바르지 않습니다.");
        } else {
          setMessage(error.message);
        }
        return;
      }

      if (data?.user) {
        await recordUserAccess(true);
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

    setSubmitting(true);

    try {
      // 1. 회원가입 모드 — 이름과 소속팀은 필수 (DB 가입 트리거가 같은 규칙을 한 번 더 강제한다)
      if (mode === "signup") {
        const problem = validateSignupProfile(nameInput, teamInput);
        if (problem) {
          setMessage(problem);
          return;
        }

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
          if (/database error saving new user/i.test(error.message)) {
            setMessage("가입 정보를 저장하지 못했습니다. 이름과 소속팀을 정확히 입력했는지, 회사 이메일(@twgroup.co.kr)이 맞는지 확인해 주세요.");
          } else {
            setMessage(error.message);
          }
          return;
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

        setMessage("비밀번호 재설정 링크가 발송되었습니다. 회사 메일함을 확인하여 링크를 클릭해 주세요.");
        return;
      }

      // 3. 일반 로그인 모드
      await performLogin(emailInput, password);
    } finally {
      setSubmitting(false);
    }
  }

  const isResetMode = mode === "reset";
  const isSignupMode = mode === "signup";

  const logoBase = import.meta.env.BASE_URL || "/";
  const logoSrc = (dark) => `${logoBase}/${dark ? "tw-logo-dark.png" : "tw-logo.png"}`.replace("//", "/");

  return (
    <main className="login-page">
      <button
        type="button"
        className="login-theme-toggle"
        onClick={toggleTheme}
        title={currentTheme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
        aria-label={currentTheme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
      >
        <Icon name={currentTheme === "dark" ? "sun" : "moon"} size={17} />
      </button>

      {/* 왼쪽: 제품을 추상화한 장식 (간트 막대). 로그인과 무관한 순수 장식이라 보조기기에서는 숨긴다 */}
      <aside className="login-art" aria-hidden="true">
        <img src={logoSrc(true)} alt="" className="login-art-logo" />
        <div className="login-art-chart">
          {ART_ROWS.map(([label, start, end, done], i) => (
            <div className="login-art-row" key={label}>
              <span className="login-art-label">{label}</span>
              <div className="login-art-track">
                <div
                  className={`login-art-bar ${i % 3 === 2 ? "alt" : ""}`}
                  style={{ left: `${start}%`, width: `${end - start}%` }}
                >
                  <i style={{ width: `${done}%` }} />
                </div>
              </div>
            </div>
          ))}
          <div className="login-art-today" />
        </div>
        <div className="login-art-copy">
          <span className="login-art-eyebrow">AX Intelligence</span>
          <h2>일정 · 공수 · 견적을<br />하나의 정밀한 화면에서</h2>
          <p>프로젝트 일정 · 공수 통합 · 이슈 · 공사일보 · 견적 · Vision SPC</p>
        </div>
      </aside>

      <div className="login-panel">
        <form className="login-card" onSubmit={submit}>
          {/* 왼쪽 장식이 숨겨지는 좁은 화면에서만 로고를 보여준다 */}
          <div className="login-logo-container">
            <img src={logoSrc(currentTheme === "dark")} alt="(주)TW 로고" className="login-logo-img" />
          </div>

          <div className="login-card-header">
            <span className="login-badge-label">
              {isSignupMode ? "Sign up" : isResetMode ? "Reset password" : "Sign in"}
            </span>
            <h1>
              {isSignupMode
                ? "신규 임직원 회원가입"
                : isResetMode
                ? "비밀번호 찾기 / 재설정"
                : "로그인"}
            </h1>
            <p className="login-subtext">
              {isResetMode
                ? "비밀번호를 재설정할 사내 이메일을 입력해 주세요."
                : isSignupMode
                ? "TW Group 임직원 계정을 생성합니다. 이름과 소속팀은 반드시 입력해야 합니다."
                : "회사 이메일 계정(@twgroup.co.kr)으로 로그인하세요."}
            </p>
          </div>

          <div className="login-fields">
            <label className="login-field">
              <Icon name="user" size={17} />
              <input
                type="email"
                value={emailInput}
                onChange={(event) => setEmailInput(event.target.value)}
                placeholder="회사 이메일 (@twgroup.co.kr)"
                autoComplete="email"
                required
              />
            </label>

            {isSignupMode && (
              <>
                <label className="login-field">
                  <Icon name="user" size={17} />
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(event) => setNameInput(event.target.value)}
                    placeholder="이름 * (필수, 예: 홍길동)"
                    autoComplete="name"
                    minLength={2}
                    required
                  />
                </label>
                <label className="login-field">
                  <Icon name="building" size={17} />
                  <input
                    type="text"
                    value={teamInput}
                    onChange={(event) => setTeamInput(event.target.value)}
                    placeholder="소속팀 * (필수, 예: PM팀, 설계팀, 제어팀)"
                    autoComplete="organization"
                    minLength={2}
                    required
                  />
                </label>
              </>
            )}

            {!isResetMode && (
              <label className="login-field">
                <Icon name="lock" size={17} />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="비밀번호 입력"
                  autoComplete={isSignupMode ? "new-password" : "current-password"}
                  minLength={6}
                  required
                />
              </label>
            )}

            <button className="primary" disabled={submitting}>
              {submitting
                ? "처리 중..."
                : isResetMode
                ? "재설정 링크 메일 발송"
                : isSignupMode
                ? "회원가입 신청"
                : "로그인"}
              {!submitting && <Icon name="arrowRight" size={16} stroke={1.8} />}
            </button>
          </div>

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
                  <span>처음이신가요?</span> <strong>회원가입 신청</strong>
                </button>
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    setMode("reset");
                    setMessage("");
                  }}
                  disabled={submitting}
                >
                  <span>비밀번호를 잊으셨나요?</span> <strong>비밀번호 재설정</strong>
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
                <span>이미 계정이 있으신가요?</span> <strong>로그인</strong>
              </button>
            )}

            {isResetMode && (
              <button
                type="button"
                className="link"
                onClick={() => {
                  setMode("login");
                  setMessage("");
                }}
                disabled={submitting}
              >
                <span>비밀번호가 기억나셨나요?</span> <strong>로그인으로 돌아가기</strong>
              </button>
            )}
          </div>

          {isSignupMode && (
            <p className="login-guide-box">
              TW Group 임직원만 가입 가능합니다.<br />
              이름과 소속팀은 필수 입력이며, 회원가입 후 회사 이메일 인증을 완료해야 서비스를 이용할 수 있습니다.
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
      </div>
    </main>
  );
}
