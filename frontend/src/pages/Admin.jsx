import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Activity, KeyRound, Mail, ShieldCheck, Trash2, Users } from "lucide-react";
import { api, del, post } from "../api";
import { useAuth } from "../auth";
import { Badge, Btn, Card, Field, Head, Notice, Page } from "../components/ui";

const STATUS_KIND = { active: "succeeded", revoked: "failed", expired: "sun", used_up: "sky" };
const fmt = iso => (iso ? new Date(iso).toLocaleDateString() : "never");
const expiry = d => (d ? `${d}T23:59:59Z` : null);

function HealthStrip() {
  const [h, setH] = useState(null);
  useEffect(() => { api("/health").then(setH).catch(e => setH({ error: e.message })); }, []);
  if (!h) return null;
  return (
    <Card testId="admin-health" className="row wrap">
      <Activity size={16} />
      {h.error ? <span data-testid="admin-health-error">{h.error}</span> : <>
        <Badge kind={h.browser_mode === "unavailable" ? "failed" : "succeeded"} testId="admin-browser-mode">browser: {h.browser_mode}{h.browser_installing ? " (installing…)" : ""}</Badge>
        <Badge kind="sky" testId="admin-registration-mode">registration: {h.registration_mode}</Badge>
        <Badge kind="lagoon">db: {h.db}</Badge>
      </>}
    </Card>
  );
}

function CodeForm({ onDone }) {
  const [f, setF] = useState({ code: "", max_uses: "", expires: "", note: "" });
  const [err, setErr] = useState("");
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const submit = async e => {
    e.preventDefault(); setErr("");
    try {
      await post("/admin/access/codes", { code: f.code.trim() || null, max_uses: f.max_uses ? Number(f.max_uses) : null, expires_at: expiry(f.expires), note: f.note });
      setF({ code: "", max_uses: "", expires: "", note: "" }); onDone();
    } catch (x) { setErr(x.message); }
  };
  return (
    <form onSubmit={submit} className="admin-form" data-testid="code-form">
      <Field label="Code (blank = random)"><input value={f.code} onChange={set("code")} placeholder="CRAB-FRIENDS" data-testid="code-input" /></Field>
      <Field label="Max uses"><input type="number" min="1" value={f.max_uses} onChange={set("max_uses")} placeholder="unlimited" data-testid="code-max-uses-input" /></Field>
      <Field label="Expires"><input type="date" value={f.expires} onChange={set("expires")} data-testid="code-expires-input" /></Field>
      <Field label="Note"><input value={f.note} onChange={set("note")} maxLength={120} data-testid="code-note-input" /></Field>
      <button className="btn btn-primary" type="submit" data-testid="code-create-btn">Create code</button>
      <Notice kind="error" testId="code-form-error">{err}</Notice>
    </form>
  );
}

function EmailForm({ onDone }) {
  const [f, setF] = useState({ email: "", expires: "", note: "" });
  const [err, setErr] = useState("");
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const submit = async e => {
    e.preventDefault(); setErr("");
    try { await post("/admin/access/emails", { email: f.email.trim(), expires_at: expiry(f.expires), note: f.note }); setF({ email: "", expires: "", note: "" }); onDone(); }
    catch (x) { setErr(x.message); }
  };
  return (
    <form onSubmit={submit} className="admin-form" data-testid="email-form">
      <Field label="Email"><input type="email" required value={f.email} onChange={set("email")} placeholder="friend@example.com" data-testid="allow-email-input" /></Field>
      <Field label="Expires"><input type="date" value={f.expires} onChange={set("expires")} data-testid="allow-email-expires-input" /></Field>
      <Field label="Note"><input value={f.note} onChange={set("note")} maxLength={120} data-testid="allow-email-note-input" /></Field>
      <button className="btn btn-primary" type="submit" data-testid="allow-email-btn">Allow email</button>
      <Notice kind="error" testId="email-form-error">{err}</Notice>
    </form>
  );
}

function AccessTable({ rows, label, idKey, onRevoke, testId }) {
  if (!rows.length) return <p className="muted" data-testid={`${testId}-empty`}>Nothing here yet.</p>;
  return (
    <div className="access-table" data-testid={testId}>
      {rows.map(r => (
        <div className="access-row" key={r.id} data-testid={`${testId}-row-${r[idKey]}`}>
          <b className="mono">{r[idKey]}</b>
          <Badge kind={STATUS_KIND[r.status]} testId={`${testId}-status-${r[idKey]}`}>{r.status.replace("_", " ")}</Badge>
          <span className="small muted" data-testid={`${testId}-uses-${r[idKey]}`}>{r.uses || 0}{r.max_uses ? ` / ${r.max_uses}` : ""} uses</span>
          <span className="small muted">expires {fmt(r.expires_at)}</span>
          <span className="small muted grow">{r.note}</span>
          {r.status !== "revoked" && <Btn kind="ghost" onClick={() => onRevoke(r[idKey])} testId={`${testId}-revoke-${r[idKey]}`}>Revoke</Btn>}
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

function UsersCard({ me }) {
  const [users, setUsers] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [msg, setMsg] = useState({ kind: "info", text: "" });
  const load = useCallback(() => api("/admin/users").then(setUsers).catch(e => setMsg({ kind: "error", text: e.message })), []);
  useEffect(() => { load(); }, [load]);
  const remove = async u => {
    try { const r = await del(`/admin/users/${u.id}`); setMsg({ kind: "info", text: `Deleted ${r.deleted} (${r.removed.runs} runs, ${r.removed.crabs} crabs, ${r.removed.attempts} attempts).` }); }
    catch (e) { setMsg({ kind: "error", text: e.message }); }
    setConfirm(null); load();
  };
  return (
    <Card testId="admin-users-card">
      <h3><Users size={16} /> Users</h3>
      <Notice kind={msg.kind} testId="admin-users-msg">{msg.text}</Notice>
      <div className="access-table" data-testid="users-table">
        {(users || []).map(u => (
          <div className="access-row" key={u.id} data-testid={`user-row-${u.email}`}>
            <b className="mono">{u.email}</b>
            <Badge kind={u.role === "admin" ? "sun" : "sky"}>{u.role}</Badge>
            <span className="small muted">{u.plan} · {u.runs} runs · joined {fmt(u.created_at)}{u.joined_via ? ` via ${u.joined_via}` : ""}</span>
            <span className="grow" />
            {u.id === me.id ? <span className="small muted">you</span> : confirm === u.id ? <>
              <Btn kind="primary" onClick={() => remove(u)} testId={`user-delete-confirm-${u.email}`}>Delete everything</Btn>
              <Btn kind="ghost" onClick={() => setConfirm(null)} testId={`user-delete-cancel-${u.email}`}>Cancel</Btn>
            </> : <Btn kind="ghost" onClick={() => setConfirm(u.id)} testId={`user-delete-${u.email}`}><Trash2 size={14} /> Delete</Btn>}
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function Admin() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => api("/admin/access").then(setData).catch(e => setErr(e.message)), []);
  useEffect(() => { if (user?.role === "admin") load(); }, [user, load]);
  if (user && user.role !== "admin") return <Navigate to="/" replace />;
  const revoke = path => async id => { try { await del(`/admin/access/${path}/${encodeURIComponent(id)}`); load(); } catch (e) { setErr(e.message); } };
  return (
    <Page testId="admin-page">
      <Head eyebrow={<><ShieldCheck size={14} /> Admin</>} title="Beta access">Invite testers without a redeploy. Codes and allow-listed emails only gate brand-new accounts.</Head>
      <HealthStrip />
      <Notice kind="error" testId="admin-error">{err}</Notice>
      <Card testId="admin-codes-card">
        <h3><KeyRound size={16} /> Access codes</h3>
        <CodeForm onDone={load} />
        {data && <AccessTable rows={data.codes} label="codes" idKey="code" onRevoke={revoke("codes")} testId="codes-table" />}
      </Card>
      <Card testId="admin-emails-card">
        <h3><Mail size={16} /> Allow-listed emails</h3>
        <EmailForm onDone={load} />
        {data && <AccessTable rows={data.emails} label="emails" idKey="email" onRevoke={revoke("emails")} testId="emails-table" />}
      </Card>
      {user?.role === "admin" && <UsersCard me={user} />}
    </Page>
  );
}
