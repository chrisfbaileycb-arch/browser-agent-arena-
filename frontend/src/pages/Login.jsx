import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { post } from "../api";
import { googleLogin, useAuth } from "../auth";
import Crab from "../components/Crab";
import { Btn, Card, Field, Notice, Page } from "../components/ui";

export default function Login() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState(location.state?.error || "");
  const submit = async e => {
    e.preventDefault(); setError("");
    try {
      setUser(await post(`/auth/${mode}`, mode === "login" ? { email: form.email, password: form.password } : form));
      navigate(location.state?.from || "/arena");
    } catch (err) { setError(err.message); }
  };
  const set = k => e => setForm({ ...form, [k]: e.target.value });
  return (
    <Page testId="login-page">
      <Card className="auth-card">
        <Crab size={110} mood={error ? "stumble" : "snap"} accessory="headset" color="#12B5A5" />
        <h2>{mode === "login" ? "Welcome back" : "Join the Arena"}</h2>
        {location.state?.from?.startsWith("/c/") && <p className="muted" data-testid="login-invite-note">Sign in or create an account to accept your challenge. We'll bring you right back.</p>}
        <form onSubmit={submit} className="stack">
          {mode === "register" && <Field label="Name"><input value={form.name} onChange={set("name")} required data-testid="register-name-input" /></Field>}
          <Field label="Email"><input type="email" value={form.email} onChange={set("email")} required data-testid="login-email-input" /></Field>
          <Field label="Password"><input type="password" value={form.password} onChange={set("password")} minLength={8} required data-testid="login-password-input" /></Field>
          <Notice kind="error" testId="login-error">{error}</Notice>
          <button className="btn btn-primary" type="submit" data-testid="login-submit-btn">{mode === "login" ? "Sign in" : "Create account"}</button>
        </form>
        <Btn kind="ghost" onClick={() => googleLogin(location.state?.from)} testId="google-login-btn">Continue with Google</Btn>
        <button className="link" onClick={() => setMode(mode === "login" ? "register" : "login")} data-testid="toggle-auth-mode-btn">
          {mode === "login" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      </Card>
    </Page>
  );
}
