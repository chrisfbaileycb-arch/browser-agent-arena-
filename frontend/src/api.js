const ENV_BACKEND = import.meta.env.REACT_APP_BACKEND_URL;
const EMERGENT_HOST = /\.(emergentagent\.com|emergent\.host|emergentcf\.cloud)$/;
// The Emergent edge rewrites CORS headers per host, so on a sibling Emergent host call that host's own /api (same-origin).
export const BACKEND = EMERGENT_HOST.test(window.location.hostname) && new URL(ENV_BACKEND).host !== window.location.host
  ? window.location.origin : ENV_BACKEND;
const TOKEN = "soe_token", REFRESH = "soe_refresh";

// Header fallback for when cross-site cookies are blocked by the browser.
export function saveTokens(data) {
  if (data?.token) localStorage.setItem(TOKEN, data.token);
  if (data?.refresh_token) localStorage.setItem(REFRESH, data.refresh_token);
}
export function clearTokens() { localStorage.removeItem(TOKEN); localStorage.removeItem(REFRESH); }
const authHeader = () => { const t = localStorage.getItem(TOKEN); return t ? { Authorization: `Bearer ${t}` } : {}; };

async function refreshSession() {
  const res = await fetch(`${BACKEND}/api/auth/refresh`, {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: localStorage.getItem(REFRESH) || undefined }),
  }).catch(() => null);
  if (!res?.ok) return false;
  saveTokens(await res.json());
  return true;
}

export function errorText(detail, status) {
  if (!detail) return `Request failed (HTTP ${status})`;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map(e => e?.msg || JSON.stringify(e)).join(" ");
  return detail.reason || detail.msg || JSON.stringify(detail);
}

export async function api(path, options = {}, retry = true) {
  let res;
  try {
    res = await fetch(`${BACKEND}/api${path}`, {
      credentials: "include", ...options, headers: { "Content-Type": "application/json", ...authHeader(), ...options.headers },
    });
  } catch {
    throw Object.assign(new Error("Can't reach the Arena server. Check your connection and try again."), { status: 0 });
  }
  if (res.status === 401 && retry && !path.startsWith("/auth/") && await refreshSession()) return api(path, options, false);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(errorText(data.detail, res.status)), { status: res.status, data });
  saveTokens(data);
  return data;
}

export const post = (path, body) => api(path, { method: "POST", body: JSON.stringify(body ?? {}) });
export const put = (path, body) => api(path, { method: "PUT", body: JSON.stringify(body) });
export const del = path => api(path, { method: "DELETE" });
export const asset = path => `${BACKEND}${path}`;

export async function downloadZip(files, name) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  Object.entries(files).forEach(([file, content]) => zip.file(file, content ?? ""));
  const blob = await zip.generateAsync({ type: "blob" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
  a.click();
  URL.revokeObjectURL(a.href);
}
