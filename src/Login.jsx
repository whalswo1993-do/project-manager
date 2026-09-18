import { useState } from "react";
import { supabase } from "./supabase";
import {
  isAccountDeleted,
  authenticateTestAccount,
  DEFAULT_TEST_ACCOUNTS,
  getTestProfiles,
} from "./authService";

export default function Login() {
  const [emailInput, setEmailInput] = useState("");
  const [password, setPassword] = useState("");
  const [signup, setSignup] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const activeTestProfiles = getTestProfiles().filter(p => !p.deleted);

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
      setMessage("TW Group 임직원만 가입 가능합니다.");
      return;
    }

    // 삭제된 계정 가입/로그인 차단
    if (isAccountDeleted(email)) {
      setMessage("삭제된 계정입니다. 해당 계정으로는 다시 로그인할 수 없습니다.");
      return;
    }

    setSubmitting(true);

    try {
      if (signup) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
          },
        });

        if (error) {
          setMessage(error.message);
          return;
        }

        if (data.session) {
          await supabase.auth.signOut();
          setMessage("Supabase 이메일 인증 설정을 확인해 주세요. 회사 이메일 인증 후 로그인할 수 있도록 Confirm email을 활성화해야 합니다.");
          return;
        }

        setMessage("인증 메일이 발송되었습니다. 회사 이메일에서 인증을 완료한 후 로그인해 주세요.");
        setSignup(false);
        setPassword("");
        return;
      }

      await performLogin(emailInput, password);
    } finally {
      setSubmitting(false);
    }
  }

  // 테스트 계정 원클릭 빠른 로그인
  async function handleQuickLogin(acc) {
    setEmailInput(acc.email);
    setPassword(acc.password || "test1234!");
    await performLogin(acc.email, acc.password || "test1234!");
  }

  return (
    <main className="login-page">
      <div className="login-container" style={{ width: "min(460px, 94vw)", display: "flex", flexDirection: "column", gap: "16px" }}>
        <form className="login-card" onSubmit={submit} style={{ width: "100%", margin: 0 }}>
          <img src="/tw-logo.png" alt="TW 로고" style={{ maxWidth: "180px", margin: "0 auto 8px" }} />
          <h1 style={{ fontSize: "22px", margin: "0 0 12px", textAlign: "center", color: "#1e293b" }}>Project Management</h1>

          <input
            type="email"
            value={emailInput}
            onChange={(event) => setEmailInput(event.target.value)}
            placeholder="회사 이메일 (@twgroup.co.kr)"
            autoComplete="email"
            required
          />

          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="비밀번호"
            autoComplete={signup ? "new-password" : "current-password"}
            minLength={6}
            required
          />

          <button className="primary" disabled={submitting} style={{ height: "42px", fontWeight: "bold", fontSize: "14px" }}>
            {submitting ? "처리 중..." : signup ? "회원가입" : "로그인"}
          </button>

          <button
            type="button"
            className="link"
            onClick={() => {
              setSignup(!signup);
              setMessage("");
            }}
            disabled={submitting}
          >
            {signup ? "이미 계정이 있으신가요? 로그인" : "처음이신가요? 회원가입"}
          </button>

          {signup && (
            <p className="signup-guide" style={{ fontSize: "12px", color: "#64748b", margin: "4px 0", lineHeight: "1.5" }}>
              TW Group 임직원만 가입 가능합니다.<br />
              회원가입 후 회사 이메일 인증을 완료해야 서비스를 이용할 수 있습니다.
            </p>
          )}

          {message && (
            <div style={{
              padding: "10px 14px",
              borderRadius: "8px",
              background: message.includes("완료") || message.includes("발송") ? "#eff6ff" : "#fef2f2",
              border: `1px solid ${message.includes("완료") || message.includes("발송") ? "#bfdbfe" : "#fecaca"}`,
              color: message.includes("완료") || message.includes("발송") ? "#1d4ed8" : "#dc2626",
              fontSize: "13px",
              lineHeight: "1.4",
              fontWeight: 500,
              textAlign: "center"
            }}>
              {message}
            </div>
          )}
        </form>

        {/* 테스트 계정 빠른 로그인 카드 */}
        <div style={{
          background: "#ffffff",
          borderRadius: "16px",
          padding: "18px 20px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)"
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: "bold", color: "#334155" }}>
              <span>⚡</span>
              <span>테스트 계정 바로 로그인 (3종)</span>
            </div>
            <span style={{ fontSize: "11px", color: "#64748b", background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px" }}>
              PW: test1234!
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {activeTestProfiles.map((acc, idx) => {
              const roleBadge = acc.role === "admin"
                ? { label: "관리자 (Admin)", color: "#b91c1c", bg: "#fef2f2", icon: "👑" }
                : acc.role === "grade3"
                ? { label: "PM 매니저 (Grade3)", color: "#1d4ed8", bg: "#eff6ff", icon: "📋" }
                : acc.role === "grade2"
                ? { label: "설계/담당 (Grade2)", color: "#7c3aed", bg: "#f5f3ff", icon: "📐" }
                : { label: "일반 사원 (Grade1)", color: "#047857", bg: "#ecfdf5", icon: "👤" };

              return (
                <button
                  key={acc.id}
                  type="button"
                  disabled={submitting || !acc.active}
                  onClick={() => handleQuickLogin(acc)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "9px 12px",
                    background: acc.active ? "#f8fafc" : "#f1f5f9",
                    border: "1px solid #e2e8f0",
                    borderRadius: "10px",
                    cursor: acc.active ? "pointer" : "not-allowed",
                    opacity: acc.active ? 1 : 0.6,
                    transition: "all 0.15s ease",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    if (acc.active) {
                      e.currentTarget.style.background = "#eef2ff";
                      e.currentTarget.style.borderColor = "#c7d2fe";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (acc.active) {
                      e.currentTarget.style.background = "#f8fafc";
                      e.currentTarget.style.borderColor = "#e2e8f0";
                    }
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "14px" }}>{roleBadge.icon}</span>
                      <span style={{ fontSize: "13px", fontWeight: "bold", color: "#1e293b" }}>{acc.name}</span>
                      <span style={{
                        fontSize: "10px",
                        fontWeight: "600",
                        padding: "1px 6px",
                        borderRadius: "10px",
                        background: roleBadge.bg,
                        color: roleBadge.color,
                      }}>
                        {roleBadge.label}
                      </span>
                    </div>
                    <span style={{ fontSize: "11px", color: "#64748b", marginLeft: "20px" }}>{acc.email}</span>
                  </div>
                  <span style={{ fontSize: "12px", color: "#2563eb", fontWeight: "bold" }}>
                    {acc.active ? "로그인 →" : "비활성"}
                  </span>
                </button>
              );
            })}
          </div>
          <p style={{ margin: "10px 0 0", fontSize: "11px", color: "#94a3b8", textAlign: "center", lineHeight: "1.4" }}>
            * 테스트 계정은 회원가입 계정과 동일하게 권한별 기능, 비활성화 및 삭제가 지원됩니다.
          </p>
        </div>
      </div>
    </main>
  );
}
