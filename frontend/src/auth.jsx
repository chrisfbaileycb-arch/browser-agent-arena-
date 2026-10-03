import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, clearTokens, post } from "./api";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// Emergent returns #session_id=…; also accept ?session_id= unless it's a Stripe checkout id (cs_…).
export function oauthSessionId(loc = window.location) {
  const fromHash = new URLSearchParams(loc.hash.replace(/^#/, "")).get("session_id");
  const fromQuery = new URLSearchParams(loc.search).get("session_id");
  return fromHash || (fromQuery && !fromQuery.startsWith("cs_") ? fromQuery : null);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = signed out
  const refresh = useCallback(() => api("/auth/me").then(u => { setUser(u); return u; }).catch(() => { setUser(false); return false; }), []);
  useEffect(() => {
    if (oauthSessionId()) return; // AuthCallback exchanges it first
    refresh();
  }, [refresh]);
  const logout = async () => { await post("/auth/logout").catch(() => {}); clearTokens(); setUser(false); };
  return <AuthContext.Provider value={{ user, setUser, refresh, logout }}>{children}</AuthContext.Provider>;
}

export function googleLogin(returnTo, accessCode) {
  if (typeof returnTo === "string") localStorage.setItem("after_login", returnTo); else localStorage.removeItem("after_login");
  if (accessCode) localStorage.setItem("access_code", accessCode); else localStorage.removeItem("access_code");
  // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
  const redirectUrl = window.location.origin + "/arena";
  window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
}

export function AuthCallback() {
  const { setUser, refresh } = useAuth();
  const navigate = useNavigate();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const sessionId = oauthSessionId();
    window.history.replaceState(null, "", window.location.pathname);
    const accessCode = localStorage.getItem("access_code") || undefined;
    localStorage.removeItem("access_code");
    post("/auth/google/session", { session_id: sessionId, access_code: accessCode })
      .then(async u => { setUser(u); const me = await refresh(); if (!me) throw new Error("Your browser blocked the session. Please try again.");
        const back = localStorage.getItem("after_login"); localStorage.removeItem("after_login");
        navigate(back && back.startsWith("/") ? back : "/arena", { replace: true }); })
      .catch(e => { setUser(false); navigate("/login", { replace: true, state: { error: e.message } }); });
  }, [navigate, setUser, refresh]);
  return <div className="page"><div className="card shimmer" data-testid="auth-callback">Signing you in with Google…</div></div>;
}
