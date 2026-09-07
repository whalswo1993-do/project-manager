import { useState } from "react";
import { supabase } from "./supabase";
export default function Login() {
  const [email,setEmail]=useState(""); const [password,setPassword]=useState("");
  const [signup,setSignup]=useState(false); const [message,setMessage]=useState("");
  async function submit(e){e.preventDefault();const normalized=email.trim().toLowerCase();if(!normalized.endsWith("@twgroup.co.kr"))return setMessage("@twgroup.co.kr 이메일만 가능합니다.");const {error}=signup?await supabase.auth.signUp({email:normalized,password,options:{emailRedirectTo:window.location.origin}}):await supabase.auth.signInWithPassword({email:normalized,password});setMessage(error?error.message:signup?"인증 메일을 확인하세요.":"");}
  return <main className="login-page"><form className="login-card" onSubmit={submit}><img src="/tw-logo.png" alt="TW 로고"/><h1>Project Management</h1><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="회사 이메일" required/><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="비밀번호" required/><button className="primary">{signup?"회원가입":"로그인"}</button><button type="button" className="link" onClick={()=>setSignup(!signup)}>{signup?"로그인":"회원가입"}</button><p>{message}</p></form></main>;
}
