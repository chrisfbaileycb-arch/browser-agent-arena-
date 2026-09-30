import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { api, del, post, put } from "../api";
import { Badge, Btn, Card, Head, Page } from "../components/ui";
import EndpointCard from "../components/EndpointCard";

function KeyRow({ k, reload }) {
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState("");
  const act = async fn => { try { setMsg(await fn()); reload(); } catch (e) { setMsg(e.message); } };
  return (
    <Card className="key-row" testId={`key-row-${k.provider}`}>
      <div className="grow">
        <h3>{k.label}</h3>
        <p className="muted" data-testid={`key-status-${k.provider}`}>
          {k.saved ? `Saved · ending ${k.last4}` : k.platform_dev ? "Not saved · dev/test mode uses the platform key" : "Not saved"}
          {k.last_test && <> · last test: {k.last_test.ok ? "works" : "failed"}</>}
        </p>
      </div>
      <input type="password" placeholder="Paste key" value={value} onChange={e => setValue(e.target.value)} autoComplete="off" data-testid={`key-input-${k.provider}`} />
      <Btn disabled={value.length < 8} onClick={() => act(async () => { await put(`/keys/${k.provider}`, { key: value }); setValue(""); return "Saved (encrypted)."; })} testId={`key-save-${k.provider}`}>Save</Btn>
      {k.saved && <Btn kind="ghost" onClick={() => act(async () => (await post(`/keys/${k.provider}/test`)).message)} testId={`key-test-${k.provider}`}>Test</Btn>}
      {k.saved && <Btn kind="ghost" onClick={() => act(async () => { await del(`/keys/${k.provider}`); return "Deleted."; })} testId={`key-delete-${k.provider}`}>Delete</Btn>}
      {msg && <Badge testId={`key-msg-${k.provider}`}>{msg}</Badge>}
    </Card>
  );
}

export default function Keys() {
  const [keys, setKeys] = useState([]);
  const load = () => api("/keys").then(setKeys).catch(() => {});
  useEffect(() => { load(); }, []);
  return (
    <Page testId="keys-page">
      <Head eyebrow="My Keys" title="Bring your own keys">Keys are encrypted at rest, never shown again in full, and used only for your own runs. Missing a key? The run stops and tells you which one to add.</Head>
      <p className="small"><ShieldCheck size={15} /> Fernet-encrypted · masked to the last 4 characters · deletable anytime</p>
      <div className="stack">{keys.map(k => <KeyRow key={k.provider} k={k} reload={load} />)}</div>
      <p className="small">Claude, OpenAI and Gemini computer-use champions run only on your own saved key for that provider.</p>
      <EndpointCard />
    </Page>
  );
}
