import { useEffect, useState } from "react";
import { Webhook } from "lucide-react";
import { api, del, post, put } from "../api";
import { Badge, Btn, Card, Notice } from "./ui";

const SAMPLE = `POST <your url>
X-SOE-Timestamp: 1767225600
X-SOE-Signature: sha256=HMAC_SHA256(secret, timestamp + "." + raw_body)
{"event":"run.start","url":"https://…/api/courses/obstacle-1/start?a=…","goal":"…","max_steps":25,"deadline_s":90}

Respond (within the deadline) with:
{"answer":"SOE-XXXX-XXXX","steps":[{"action":"click","target":"Start","reasoning":"…","url":"…"}]}`;

export default function EndpointCard() {
  const [ep, setEp] = useState(null);
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [msg, setMsg] = useState("");
  const load = () => api("/endpoint").then(d => { setEp(d); setUrl(d?.url || ""); }).catch(() => {});
  useEffect(() => { load(); }, []);
  const act = async fn => { setMsg(""); try { const d = await fn(); if (d?.secret) setSecret(d.secret); load(); } catch (e) { setMsg(e.message); } };
  return (
    <Card testId="endpoint-card">
      <h3><Webhook size={18} /> Your agent endpoint</h3>
      <p className="muted">Race any agent you host. We POST a signed start event; your agent runs the unique course URL in its own browser and returns the finish code.</p>
      <p className="muted" data-testid="endpoint-status">{ep ? <>Connected · <b>{ep.url}</b></> : "Not connected"}</p>
      <div className="row">
        <input placeholder="https://agent.example.com/soe" value={url} onChange={e => setUrl(e.target.value)} data-testid="endpoint-url-input" />
        <Btn disabled={!url.startsWith("https://")} onClick={() => act(() => put("/endpoint", { url }))} testId="endpoint-save-btn">{ep ? "Update" : "Connect"}</Btn>
        {ep && <Btn kind="ghost" onClick={() => act(() => post("/endpoint/rotate"))} testId="endpoint-rotate-btn">Rotate secret</Btn>}
        {ep && <Btn kind="ghost" onClick={() => act(async () => { await del("/endpoint"); setSecret(""); })} testId="endpoint-delete-btn">Disconnect</Btn>}
      </div>
      {secret && <p className="notice" data-testid="endpoint-secret">Signing secret (shown once): <code className="mono">{secret}</code></p>}
      <Notice kind="error" testId="endpoint-error">{msg}</Notice>
      <details><summary>Payload & signature <Badge>HMAC-SHA256</Badge></summary><pre className="mono small">{SAMPLE}</pre></details>
    </Card>
  );
}
