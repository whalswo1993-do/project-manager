import { useState } from "react";
import { supabase } from "./supabase";
import {
  isAccountDeleted,
  authenticateTestAccount,
} from "./authService";

export default function Login() {
  const [emailInput, setEmailInput] = useState("");
  const [password, setPassword] = useState("");
  const [signup, setSignup] = useState(false);
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

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <img src="/tw-logo.png" alt="TW 로고" />
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
    </main>
  );
}
