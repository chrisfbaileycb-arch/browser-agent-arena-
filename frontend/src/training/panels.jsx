import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, Download, Pause, Play, RotateCcw, Save, SkipForward, Send, Square, Sparkles } from "lucide-react";
import { api, downloadZip, post } from "../api";
import { Badge, Btn, Field, Notice } from "../components/ui";
import { sleep } from "./useYard";

const RESULT_KIND = { ok: "succeeded", success: "succeeded", stumble: "sun", fail: "failed", unclear: "sky", error: "failed" };
const QUICK = ["go right", "forward 2", "jump", "climb", "lift claw", "open claw", "grab notch 2", "pull lever"];
const MAX_LINE = 160;
const TOO_LONG = "Keep each command under 160 characters.";

export function CommandLog({ log, onPick }) {
  if (!log.length) return <p className="muted small" data-testid="command-log-empty">Your commands, the actions they became and the result show up here.</p>;
  return (
    <ol className="tg-log" data-testid="command-log">
      {log.map((e, i) => (
        <li key={i} data-testid={`command-log-row-${i}`}>
          <div className="row wrap">
            <b className="mono">{e.text}</b>
            {e.source === "local" && <Badge kind="lagoon" testId={`log-source-${i}`}>local</Badge>}
            {e.source === "ai" && <Badge kind="sky" testId={`log-source-${i}`}>AI</Badge>}
            {e.result && <Badge kind={RESULT_KIND[e.result] || "neutral"} testId={`log-result-${i}`}>{e.result}</Badge>}
          </div>
          {e.described?.length > 0 && <code className="small" data-testid={`log-actions-${i}`}>{e.described.join(" → ")}</code>}
          {e.reasoning && <p className="small muted tg-reason" data-testid={`log-reasoning-${i}`}><Bot size={13} /> {e.reasoning}</p>}
          {e.msg && <p className="small" data-testid={`log-msg-${i}`}>{e.msg}</p>}
          {e.noKey && <Link className="small link" to="/keys" data-testid={`log-add-key-${i}`}>Add your AI key in My Keys</Link>}
          {e.suggestions?.length > 0 && (
            <div className="row wrap"><span className="small muted">Did you mean</span>
              {e.suggestions.map(s => <button key={s} className="tg-chip" onClick={() => onPick?.(s)} data-testid={`suggestion-${i}-${s.replace(/\W+/g, "-")}`}>{s}</button>)}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

const noKey = e => /My Keys/.test(e.message);

export function CommandPanel({ yard, provider, addLog, onFinished, pick }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [tooLong, setTooLong] = useState(false);
  useEffect(() => { if (pick) send(pick.s); }, [pick]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async raw => {
    const t = raw.trim();
    if (!t || busy) return;
    if (t.length > MAX_LINE) { setTooLong(true); return; }
    setBusy(true); setText(""); setTooLong(false);
    try {
      const { results: [r] } = await post("/training/parse", { lines: [t], provider });
      if (!r.actions.length) addLog({ text: t, source: r.source, result: "unclear", msg: r.reason || "The crab shrugs.", noKey: r.error === "no_key", suggestions: r.suggestions });
      else {
        const evs = await yard.run(r.actions);
        addLog({ text: t, source: r.source, described: r.described, result: evs.at(-1)?.kind || "ok", msg: evs.map(e => e.msg).join(" ") });
        await onFinished("command");
      }
    } catch (e) { addLog({ text: t, result: "error", msg: e.message, noKey: noKey(e) }); }
    setBusy(false);
  };
  return (
    <div className="stack" data-testid="command-panel">
      <form className="tg-input" onSubmit={e => { e.preventDefault(); send(text); }}>
        <input value={text} onChange={e => { setText(e.target.value); setTooLong(e.target.value.trim().length > MAX_LINE); }} placeholder="go right 2, jump, grab two notches…" enterKeyHint="send"
          autoCapitalize="off" autoComplete="off" disabled={busy} aria-label="Command" data-testid="command-input" />
        <button className="btn btn-primary" disabled={busy || !text.trim() || tooLong} data-testid="command-send-btn"><Send size={15} /> Go</button>
      </form>
      {tooLong && <p className="notice notice-error" role="alert" data-testid="command-too-long">{TOO_LONG}</p>}
      <div className="row wrap">{QUICK.map(q => <button key={q} className="tg-chip" onClick={() => send(q)} disabled={busy} data-testid={`quick-${q.replace(/\W+/g, "-")}`}>{q}</button>)}</div>
      {busy && <p className="small muted" data-testid="command-busy">The crab is on it…</p>}
    </div>
  );
}

export function ScriptPanel({ yard, provider, addLog, onFinished }) {
  const [script, setScript] = useState("# one command per line\n");
  const [plan, setPlan] = useState(null);
  const [cur, setCur] = useState(-1);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const st = useRef({ plan: null, ptr: 0, go: false });
  const lines = script.split("\n").slice(0, 40);
  const compile = async () => {
    const long = lines.findIndex(l => l.trim().length > MAX_LINE);
    if (long >= 0) { setError(`Line ${long + 1}: ${TOO_LONG}`); return null; }
    const { results } = await post("/training/parse", { lines, provider });
    const bad = results.findIndex(r => r.source === "none");
    if (bad >= 0) { const r = results[bad]; setError(`Line ${bad + 1} ("${lines[bad]}") is unclear.${r.reason ? ` ${r.reason}` : ""} Did you mean: ${r.suggestions.join(", ")}?`); return null; }
    const p = results.map((r, i) => ({ ...r, i })).filter(r => r.actions.length);
    st.current = { ...st.current, plan: p, ptr: 0 }; setPlan(p);
    return p;
  };
  const stepOnce = async () => {
    const p = st.current.plan || await compile();
    if (!p) return false;
    const item = p[st.current.ptr];
    if (!item) return false;
    setCur(item.i);
    const evs = await yard.run(item.actions);
    const last = evs.at(-1);
    addLog({ text: `L${item.i + 1}: ${item.line}`, source: item.source, described: item.described, result: last?.kind || "ok", msg: evs.map(e => e.msg).join(" ") });
    st.current.ptr += 1;
    if (last && last.kind !== "ok" && last.kind !== "success") { setError(`Stopped at line ${item.i + 1}: ${last.msg}`); return false; }
    if (yard.live().status === "success") { await onFinished("script"); return false; }
    if (st.current.ptr >= p.length) { setError("Script finished but the crab hasn't reached the goal yet."); return false; }
    return true;
  };
  const guard = fn => async () => { setError(""); try { await fn(); } catch (e) { setError(e.message); st.current.go = false; setRunning(false); } };
  const run = guard(async () => {
    st.current.go = true; setRunning(true);
    while (st.current.go && await stepOnce()) await sleep(120);
    st.current.go = false; setRunning(false);
  });
  const reset = () => { st.current = { plan: null, ptr: 0, go: false }; setPlan(null); setCur(-1); setError(""); setRunning(false); yard.reset(); };
  return (
    <div className="stack" data-testid="script-panel">
      {plan ? (
        <ol className="tg-code" data-testid="script-view">
          {lines.map((l, i) => <li key={i} className={i === cur ? "current" : ""} data-testid={`script-line-${i + 1}`}>{l || " "}</li>)}
        </ol>
      ) : (
        <textarea className="tg-script" value={script} onChange={e => setScript(e.target.value)} rows={9} maxLength={4000} spellCheck={false}
          autoCapitalize="off" aria-label="Script" data-testid="script-input" />
      )}
      <div className="row wrap">
        <Btn kind="ghost" onClick={guard(stepOnce)} disabled={running} testId="script-step-btn"><SkipForward size={15} /> Step</Btn>
        {running ? <Btn kind="ghost" onClick={() => { st.current.go = false; }} testId="script-pause-btn"><Pause size={15} /> Pause</Btn>
          : <Btn onClick={run} testId="script-run-btn"><Play size={15} /> Run</Btn>}
        <Btn kind="ghost" onClick={reset} testId="script-reset-btn"><RotateCcw size={15} /> Reset</Btn>
      </div>
      <Notice kind="error" testId="script-error">{error}</Notice>
    </div>
  );
}

export function AgentPanel({ ch, yard, provider, addLog, onFinished }) {
  const [ins, setIns] = useState("");
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState({ kind: "info", text: "" });
  const [crab, setCrab] = useState(null);
  const go = useRef(false);
  const start = async () => {
    yard.reset(); go.current = true; setRunning(true); setMsg({ kind: "info", text: "" });
    const t0 = Date.now();
    while (go.current) {
      if (Date.now() - t0 > 180000) { setMsg({ kind: "error", text: "Timed out after 3 minutes." }); break; }
      const acts = yard.actions();
      if (acts.length >= 40) { setMsg({ kind: "error", text: "Step cap reached (40 actions)." }); break; }
      let r;
      try { r = await post("/training/agent/step", { challenge_id: ch.id, instructions: ins, actions: acts, provider }); }
      catch (e) { setMsg({ kind: "error", text: e.message }); addLog({ text: "agent", result: "error", msg: e.message, noKey: noKey(e) }); break; }
      const evs = r.actions.length ? await yard.run(r.actions) : [];
      addLog({ text: `Agent step (${r.provider})`, source: "ai", reasoning: r.reasoning, described: r.described, result: evs.at(-1)?.kind || "ok", msg: evs.map(e => e.msg).join(" ") });
      if (yard.live().status !== "playing") break;
      if (r.done) { setMsg({ kind: "info", text: `The agent stopped: ${r.reasoning}` }); break; }
    }
    go.current = false; setRunning(false);
    await onFinished("agent");
  };
  const save = async () => {
    try { const c = crab || await post("/training/save-crab", { name: `${ch.title} Crab`.slice(0, 40), instructions: ins, provider }); setCrab(c); setMsg({ kind: "info", text: `Saved as crab "${c.name}". Open Crab Builder to tweak it for the real Arena.` }); return c; }
    catch (e) { setMsg({ kind: "error", text: e.message }); return null; }
  };
  const download = async () => {
    const c = await save();
    if (!c) return;
    try { await downloadZip(await api(`/exports/crab/${c.id}`), `${c.name.replace(/\W+/g, "-")}-skill.zip`); setMsg({ kind: "info", text: `${c.name} skill downloaded.` }); }
    catch (e) { setMsg({ kind: "error", text: e.message }); }
  };
  return (
    <div className="stack" data-testid="agent-panel">
      <Field label="Goal instructions (plain English)">
        <textarea value={ins} onChange={e => { setIns(e.target.value); setCrab(null); }} rows={5} maxLength={1200} disabled={running}
          placeholder="Reach the flag without touching red tiles. Grab the key on the pole at notch 2 first." data-testid="agent-instructions-input" />
      </Field>
      <div className="row wrap">
        {running ? <Btn kind="ghost" onClick={() => { go.current = false; }} testId="agent-stop-btn"><Square size={15} /> Stop</Btn>
          : <Btn onClick={start} disabled={ins.trim().length < 3} testId="agent-start-btn"><Sparkles size={15} /> Run agent</Btn>}
        <Btn kind="ghost" onClick={save} disabled={running || ins.trim().length < 3} testId="agent-save-crab-btn"><Save size={15} /> Save as crab</Btn>
        <Btn kind="ghost" onClick={download} disabled={running || ins.trim().length < 3} testId="agent-download-skill-btn"><Download size={15} /> Download as skill</Btn>
      </div>
      <p className="small muted">Observe → plan → act on your own key. Max 40 actions, 3-minute timeout.</p>
      {crab && <Link to="/builder" className="small link" data-testid="agent-open-builder-link">Open Crab Builder</Link>}
      <Notice kind={msg.kind} testId="agent-msg">{msg.text}</Notice>
    </div>
  );
}
