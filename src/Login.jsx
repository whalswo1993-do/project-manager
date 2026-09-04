import { useState } from "react";
import { supabase } from "./supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    if (isSignup) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      setMessage(error ? error.message : "가입 확인 이메일을 보냈습니다. 받은 편지함에서 확인 링크를 눌러주세요.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
    }

    setLoading(false);
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <p className="login-label">TEAM PROJECT HUB</p>
        <h1>{isSignup ? "팀원 회원가입" : "팀원 로그인"}</h1>
        <p className="login-description">회사 이메일과 비밀번호를 입력하세요.</p>
        <label><span>이메일</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" required /></label>
        <label><span>비밀번호</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6자 이상 입력" minLength="6" required /></label>
        <button className="login-button" type="submit" disabled={loading}>{loading ? "처리 중..." : isSignup ? "회원가입" : "로그인"}</button>
        <button className="login-switch" type="button" onClick={() => { setIsSignup(!isSignup); setMessage(""); }}>{isSignup ? "이미 계정이 있나요? 로그인" : "처음 사용하시나요? 회원가입"}</button>
        {message && <p className="login-message">{message}</p>}
      </form>
    </main>
  );
}
