import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { api, post } from "../api";
import { googleLogin, useAuth } from "../auth";
import Crab from "../components/Crab";
import { Btn, Card, Field, Notice, Page } from "../components/ui";

function BetaLock({ access }) {
  if (access === "invite_only") return (
    <div className="beta-lock" data-testid="beta-lock">
      <Lock size={16} /><span><b>Private beta.</b> New accounts need an access code, or an email the admin has allow-listed. Already have an account? Just sign in.</span>
    </div>
  );
  if (access === "admin_only") return (
    <div className="beta-lock" data-testid="beta-lock">
      <Lock size={16} /><span><b>Sign-ups are closed.</b> Existing accounts can still sign in. Ask the Arena admin for an account.</span>
    </div>
  );
  return null;
}

export default function Login() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState("login");
  const [access, setAccess] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", access_code: "" });
  const [error, setError] = useState(location.state?.error || "");
  useEffect(() => { api("/access/mode").then(d => setAccess(d.mode)).catch(() => setAccess(null)); }, []);
  const closed = access === "admin_only";
  const submit = async e => {
    e.preventDefault(); setError("");
    try {
      const body = mode === "login" ? { email: form.email, password: form.password } : { ...form, access_code: form.access_code.trim() || undefined };
      setUser(await post(`/auth/${mode}`, body));
      navigate(location.state?.from || "/arena");
    } catch (err) { setError(err.message); }
  };
  const set = k => e => setForm({ ...form, [k]: e.target.value });
  const registering = mode === "register" && !closed;
  return (
    <Page testId="login-page">
      <Card className="auth-card">
        <Crab size={110} mood={error ? "stumble" : "snap"} accessory="headset" color="#12B5A5" />
        <h2>{registering ? "Join the Arena" : "Welcome back"}</h2>
        <BetaLock access={access} />
        {location.state?.from?.startsWith("/c/") && <p className="muted" data-testid="login-invite-note">Sign in or create an account to accept your challenge. We'll bring you right back.</p>}
        <form onSubmit={submit} className="stack">
          {registering && <Field label="Name"><input value={form.name} onChange={set("name")} required data-testid="register-name-input" /></Field>}
          <Field label="Email"><input type="email" value={form.email} onChange={set("email")} required data-testid="login-email-input" /></Field>
          <Field label="Password"><input type="password" value={form.password} onChange={set("password")} minLength={8} required data-testid="login-password-input" /></Field>
          {registering && access === "invite_only" && <Field label="Access code (skip if your email is allow-listed)">
            <input value={form.access_code} onChange={set("access_code")} placeholder="BETA-XXXXXX" maxLength={40} data-testid="register-access-code-input" /></Field>}
          <Notice kind="error" testId="login-error">{error}</Notice>
          <button className="btn btn-primary" type="submit" data-testid="login-submit-btn">{registering ? "Create account" : "Sign in"}</button>
        </form>
        <Btn kind="ghost" onClick={() => googleLogin(location.state?.from, registering ? form.access_code.trim() : "")} testId="google-login-btn">Continue with Google</Btn>
        {!closed && <button className="link" onClick={() => setMode(mode === "login" ? "register" : "login")} data-testid="toggle-auth-mode-btn">
          {mode === "login" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>}
      </Card>
    </Page>
  );
}
