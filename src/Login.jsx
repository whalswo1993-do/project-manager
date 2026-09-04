import { useState } from "react";
import { supabase } from "./supabase";

const DOMAIN = "@twgroup.co.kr";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signup, setSignup] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized.endsWith(DOMAIN)) {
      setMessage(`회사 이메일(${DOMAIN})만 사용할 수 있습니다.`);
      return;
    }
    setBusy(true);
    setMessage("");
    const result = signup
      ? await supabase.auth.signUp({ email: normalized, password, options: { emailRedirectTo: window.location.origin } })
      : await supabase.auth.signInWithPassword({ email: normalized, password });
    setBusy(false);
    if (result.error) setMessage(result.error.message);
    else if (signup) setMessage("인증 메일을 보냈습니다. 메일의 확인 링크를 눌러주세요.");
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <b className="brand">TW PROJECT</b>
        <h1>Project Management</h1>
        <p>{signup ? "회사 계정 가입" : "팀원 로그인"}</p>
        <label>이메일<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>비밀번호<input type="password" minLength="6" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <button className="primary" disabled={busy}>{busy ? "처리 중..." : signup ? "회원가입" : "로그인"}</button>
        <button type="button" className="link" onClick={() => { setSignup(!signup); setMessage(""); }}>
          {signup ? "이미 계정이 있나요? 로그인" : "처음인가요? 회원가입"}
        </button>
        {message && <div className="notice">{message}</div>}
      </form>
    </main>
  );
}
