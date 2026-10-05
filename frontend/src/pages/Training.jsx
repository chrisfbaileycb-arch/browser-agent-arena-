import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Box, Dumbbell, Lock, Star, X } from "lucide-react";
import { api, post } from "../api";
import Crab, { WEBGL } from "../components/Crab";
import { useQuality } from "../components/quality";
import { Btn, Card, Head, Notice, Page } from "../components/ui";
import { useYard } from "../training/useYard";
import Yard2D from "../training/Yard2D";
import { AgentPanel, CommandLog, CommandPanel, ScriptPanel } from "../training/panels";

const Yard3D = lazy(() => import("../training/Yard3D"));
const PANELS = { 1: CommandPanel, 2: ScriptPanel, 3: AgentPanel };
const TIPS = [
  "Pick a challenge. Each one has a goal card and a par (the number of actions to beat).",
  "Type plain commands like \"go right 2\", \"jump\" or \"grab two notches\". Simple phrases are understood for free; only unclear ones use the AI on your own key.",
  "Reach the flag at or under par with no stumbles for 3 stars. This is practice only: there's no leaderboard.",
];

function Stars({ n, testId }) {
  return <span className="tg-stars" data-testid={testId} aria-label={`${n} of 3 stars`}>{[1, 2, 3].map(i => <Star key={i} size={14} className={i <= n ? "on" : ""} />)}</span>;
}

function Upgrade() {
  return (
    <Page testId="training-upgrade">
      <Card className="tg-upgrade">
        <Crab size={120} mood="snap" accessory="helmet" color="#12B5A5" />
        <h2><Lock size={20} /> Training Grounds is a Pro feature</h2>
        <p className="muted">Teach your crab in a 3D practice yard: single commands, scripts, then an AI agent on your own key. Save what works as a crab for the real Arena.</p>
        <Link to="/pricing" className="btn btn-primary" data-testid="training-upgrade-btn">See Pro plans</Link>
      </Card>
    </Page>
  );
}

function Tips() {
  const [i, setI] = useState(() => (localStorage.getItem("soe_training_tips") ? -1 : 0));
  if (i < 0) return null;
  const close = () => { localStorage.setItem("soe_training_tips", "1"); setI(-1); };
  return (
    <div className="tg-tip" role="dialog" aria-label="Training tips" data-testid="training-tip">
      <button className="icon-btn" onClick={close} aria-label="Close tips" data-testid="training-tip-close"><X size={14} /></button>
      <b>Tip {i + 1} of {TIPS.length}</b><p>{TIPS[i]}</p>
      <button className="tg-tip-next" onClick={() => (i + 1 < TIPS.length ? setI(i + 1) : close())} data-testid="training-tip-next">{i + 1 < TIPS.length ? "Next tip" : "Got it"}</button>
    </div>
  );
}

function Stage({ ch, yard, quality, view }) {
  const flat = view === "2d" || !WEBGL;
  return (
    <div className={`tg-stage fx-${yard.fx.kind}`} data-testid="training-stage">
      {flat ? <Yard2D ch={ch} pose={yard.shown} fx={yard.fx} />
        : <Suspense fallback={<div className="tg-loading">Loading yard…</div>}><Yard3D ch={ch} pose={yard.shown} fx={yard.fx} quality={quality} /></Suspense>}
      <div className="tg-goal" data-testid="training-goal-card"><b>{ch.title}</b><span>{ch.goal}</span><small>Par {ch.par}{ch.need_key ? " · needs the key" : ""}</small></div>
      {yard.fx.kind !== "idle" && yard.fx.kind !== "ok" && <div className={`tg-banner ${yard.fx.kind}`} data-testid="training-event-banner">{yard.fx.msg}</div>}
      <div className="tg-meter" data-testid="training-meter">actions {yard.state.actions} · stumbles {yard.state.stumbles}</div>
    </div>
  );
}

function Session({ ch, level, provider, quality, view, onProgress, next }) {
  const yard = useYard(ch);
  const [log, setLog] = useState([]);
  const [result, setResult] = useState(null);
  const [pick, setPick] = useState(null);
  const addLog = useCallback(e => setLog(l => [e, ...l].slice(0, 60)), []);
  const onFinished = useCallback(async mode => {
    if (yard.live().status !== "success") return;
    try { const r = await post("/training/complete", { challenge_id: ch.id, actions: yard.actions(), mode }); setResult(r); onProgress(ch.id, r.best); }
    catch (e) { setResult({ error: e.message }); }
  }, [ch.id, yard, onProgress]);
  const Panel = PANELS[level];
  const reset = () => { yard.reset(); setResult(null); };
  return (
    <div className="tg-main">
      <Stage ch={ch} yard={yard} quality={quality} view={view} />
      <section className="tg-side">
        <Card testId="training-panel">
          <Panel ch={ch} yard={yard} provider={provider} addLog={addLog} onFinished={onFinished} pick={pick} />
          {level !== 2 && <Btn kind="ghost" onClick={reset} testId="training-reset-btn">Reset yard</Btn>}
          {result?.success && (
            <div className="tg-result" data-testid="training-result">
              <Stars n={result.stars} testId="training-result-stars" />
              <span>{result.actions} actions (par {result.par}) · {result.stumbles} stumbles</span>
              {next && <Btn onClick={next} testId="training-next-btn">Next challenge</Btn>}
            </div>
          )}
          <Notice kind="error" testId="training-result-error">{result?.error}</Notice>
        </Card>
        <Card testId="training-log-card"><h3>Command log</h3><CommandLog log={log} onPick={level === 1 ? s => setPick({ s, n: Date.now() }) : null} /></Card>
      </section>
    </div>
  );
}

export default function Training() {
  const [data, setData] = useState(null);
  const [locked, setLocked] = useState(false);
  const [err, setErr] = useState("");
  const [level, setLevel] = useState(1);
  const [cid, setCid] = useState(null);
  const [view, setView] = useState(WEBGL ? "3d" : "2d");
  const [provider, setProvider] = useState(() => localStorage.getItem("soe_train_provider") || "auto");
  const quality = useQuality();
  useEffect(() => { api("/training").then(setData).catch(e => (/Pro plan/.test(e.message) ? setLocked(true) : setErr(e.message))); }, []);
  const list = useMemo(() => (data ? data.challenges.filter(c => c.level === level) : []), [data, level]);
  const ch = list.find(c => c.id === cid) || list[0];
  const onProgress = useCallback((id, best) => setData(d => ({ ...d, progress: { ...d.progress, [id]: best } })), []);
  if (locked) return <Upgrade />;
  if (!data) return <Page testId="training-page"><Notice kind="error" testId="training-error">{err}</Notice>{!err && <p className="muted">Loading the yard…</p>}</Page>;
  const idx = list.indexOf(ch);
  const pickProvider = p => { localStorage.setItem("soe_train_provider", p); setProvider(p); };
  return (
    <Page testId="training-page">
      <Head eyebrow={<><Dumbbell size={14} /> Training Grounds · Pro</>} title="Practice yard">Teach your crab with commands, then scripts, then an AI agent. Practice only: no leaderboard.</Head>
      <Tips />
      <div className="tg-levels" role="tablist">
        {data.levels.map(l => (
          <button key={l.n} role="tab" aria-selected={l.n === level} className={`tg-level ${l.n === level ? "on" : ""}`} onClick={() => { setLevel(l.n); setCid(null); }} data-testid={`training-level-${l.n}`}>
            <b>Level {l.n} · {l.name}</b><small>{l.blurb}</small>
          </button>
        ))}
      </div>
      <div className="row wrap tg-bar">
        {list.map(c => (
          <button key={c.id} className={`tg-chal ${c.id === ch.id ? "on" : ""}`} onClick={() => setCid(c.id)} data-testid={`training-challenge-${c.id}`}>
            {c.title} <Stars n={data.progress[c.id]?.stars || 0} testId={`training-stars-${c.id}`} />
          </button>
        ))}
        <span className="grow" />
        <select value={provider} onChange={e => pickProvider(e.target.value)} aria-label="AI key preference" data-testid="training-provider-select">
          <option value="auto">AI key: auto</option>
          {["gemini", "openai", "anthropic"].map(p => <option key={p} value={p} disabled={!data.providers.includes(p)}>{p}{data.providers.includes(p) ? "" : " (no key)"}</option>)}
        </select>
        {WEBGL && <button className="tg-chip" onClick={() => setView(view === "3d" ? "2d" : "3d")} data-testid="training-view-toggle"><Box size={13} /> {view === "3d" ? "2D view" : "3D view"}</button>}
        {view === "3d" && WEBGL && (
          <select value={quality.choice} onChange={e => quality.choose(e.target.value)} aria-label="Render quality" data-testid="training-quality-select">
            {["auto", "high", "medium", "low"].map(q => <option key={q} value={q}>{q === "auto" ? `auto (${quality.level})` : q}</option>)}
          </select>
        )}
      </div>
      {!data.providers.length && <p className="small muted" data-testid="training-no-key-note">No AI key saved: simple commands still work for free. <Link className="link" to="/keys">Add a key</Link> for free-form commands and Level 3.</p>}
      <Session key={`${ch.id}-${level}`} ch={ch} level={level} provider={provider} quality={quality} view={view} onProgress={onProgress}
        next={idx + 1 < list.length ? () => setCid(list[idx + 1].id) : null} />
    </Page>
  );
}
