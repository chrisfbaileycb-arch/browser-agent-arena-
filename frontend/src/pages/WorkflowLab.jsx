import { useEffect, useState } from "react";
import { api, post } from "../api";
import { MINDS, PRESETS } from "../lib/data/presets";
import { runVessel, synthesize } from "../lib/core/synthesizer";
import { Badge, Btn, Card, Field, Head, Notice, Page } from "../components/ui";

function Result({ title, r, testId }) {
  if (!r) return null;
  return (
    <Card testId={testId}>
      <h3>{title} <Badge kind={r.ok ? "succeeded" : "failed"}>{r.ok ? "passed" : "held"}</Badge> <span className="muted mono">{r.duration_ms} ms</span></h3>
      <ol className="trace">{r.trace.map(t => <li key={t.stage + t.detail}><b>{t.stage}</b> {t.detail}</li>)}</ol>
      {r.gate && <p className="mono small">Gate: {r.gate.by} · {r.gate.choice} · score {Number(r.gate.score).toFixed(2)} · support {Number(r.gate.noul).toFixed(2)}</p>}
      <pre className="code">{JSON.stringify(r.payload, null, 2)}</pre>
      {r.citations?.length > 0 && <p className="small">Citations: {r.citations.join(", ")}</p>}
    </Card>
  );
}

export default function WorkflowLab() {
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [objective, setObjective] = useState(PRESETS[0].objective);
  const [targetUrl, setTargetUrl] = useState("");
  const [dispatchUrl, setDispatchUrl] = useState("");
  const [keys, setKeys] = useState(null);
  const [result, setResult] = useState(null);
  const [fixture, setFixture] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api("/workflow/status").then(setKeys).catch(() => {}); }, []);
  const pick = p => { setPresetId(p.id); setObjective(p.objective); setResult(null); };
  const dag = synthesize(objective);
  const runLive = async () => {
    setBusy(true); setError(""); setResult(null);
    try { setResult(await post("/workflow/live", { objective, workflow: { ...dag, objective }, target_url: targetUrl || undefined, dispatch_url: dispatchUrl || undefined })); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const dryRun = async () => {
    const r = await runVessel(dag, () => {});
    setFixture(JSON.stringify({ mode: "FIXTURE SIMULATION (local demo corpus, not live)", ok: r.ok, steps: r.steps.map(s => [s.node.id, s.choice.selected, s.score.value.toFixed(2)]), payload: r.structured }, null, 2));
  };
  return (
    <Page testId="workflow-page">
      <Head eyebrow="Workflow Lab" title="Squad vs solo, live">The relay squad (Scout via Tavily, Extractor, Jev Gatekeeper, Settlement) and a solo agent answer the same objective from the same live sources.</Head>
      <div className="row wrap">{PRESETS.map(p => <button key={p.id} className={`chip ${presetId === p.id ? "on" : ""}`} onClick={() => pick(p)} data-testid={`preset-${p.id}`}>{p.name}</button>)}</div>
      <div className="grid two">
        <Card testId="workflow-form">
          <Field label="Objective"><textarea rows={3} value={objective} onChange={e => setObjective(e.target.value)} maxLength={2000} data-testid="workflow-objective-input" /></Field>
          <Field label="Target site (optional, limits search to this domain)"><input value={targetUrl} onChange={e => setTargetUrl(e.target.value)} placeholder="https://…" data-testid="workflow-target-input" /></Field>
          <Field label="Dispatch webhook (optional, only after the gate passes)"><input value={dispatchUrl} onChange={e => setDispatchUrl(e.target.value)} placeholder="https://hooks.example.com/…" data-testid="workflow-dispatch-input" /></Field>
          {keys && <p className="small" data-testid="workflow-key-status">Keys: {Object.entries(keys).map(([k, v]) => `${k} ${v ? "ready" : "missing"}`).join(" · ")}</p>}
          <Notice kind="error" testId="workflow-error">{error}</Notice>
          <div className="row">
            <Btn onClick={runLive} disabled={busy || objective.length < 3} testId="workflow-run-live-btn">{busy ? "Running live…" : "Run live comparison"}</Btn>
            <Btn kind="ghost" onClick={dryRun} testId="workflow-dry-run-btn">Fixture dry run</Btn>
          </div>
        </Card>
        <Card testId="workflow-dag">
          <h3>Squad pipeline · intent <Badge kind="sky">{dag.intent}</Badge></h3>
          <ol className="dag">{dag.nodes.map((n, i) => (
            <li key={n.id} style={{ borderColor: MINDS[i].color }}><b style={{ color: MINDS[i].color }}>{MINDS[i].name}</b> {n.title}<small>{n.channel} · floor {n.jev.scoreMin}</small></li>
          ))}</ol>
          {fixture && <pre className="code" data-testid="workflow-fixture-output">{fixture}</pre>}
        </Card>
      </div>
      {result && <div className="grid two"><Result title="Relay squad" r={result.squad} testId="workflow-squad-result" /><Result title="Solo agent" r={result.solo} testId="workflow-solo-result" /></div>}
    </Page>
  );
}
