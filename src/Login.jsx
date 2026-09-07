import { useState } from "react";
import { supabase } from "./supabase";

export default function Login() {
  const [emailInput, setEmailInput] = useState("");
  const [password, setPassword] = useState("");
  const [signup, setSignup] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setMessage("");

    const email = emailInput.trim().toLowerCase();

    if (!email.endsWith("@twgroup.co.kr")) {
      setMessage("TW Group 임직원만 가입 가능합니다.");
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

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        const lowerMessage = error.message.toLowerCase();
        if (lowerMessage.includes("email not confirmed")) {
          setMessage("회사 이메일 인증을 완료한 후 로그인해 주세요.");
        } else {
          setMessage(error.message);
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <img src="/tw-logo.png" alt="TW 로고" />
        <h1>Project Management</h1>

        <input
          type="email"
          value={emailInput}
          onChange={(event) => setEmailInput(event.target.value)}
          placeholder="회사 이메일"
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

        <button className="primary" disabled={submitting}>
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
          {signup ? "로그인" : "회원가입"}
        </button>

        {signup && (
          <p className="signup-guide">
            TW Group 임직원만 가입 가능합니다.<br />
            회원가입 후 회사 이메일 인증을 완료해야 서비스를 이용할 수 있습니다.
          </p>
        )}

        {message && <p>{message}</p>}
      </form>
    </main>
  );
}
