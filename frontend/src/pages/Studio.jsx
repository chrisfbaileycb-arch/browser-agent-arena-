import { useEffect, useRef, useState } from "react";
import { api, del, post } from "../api";
import { compileMission, defaultMission } from "../lib/core/challengeStudio";
import { createDuel, tickDuel } from "../lib/core/arenaEngine";
import { Badge, Btn, Card, Field, Head, Notice, Page } from "../components/ui";

const ROLES = ["button", "input", "table", "modal", "banner", "link", "text", "select", "row"];

function SimDuel({ challenge }) {
  const [duel, setDuel] = useState(() => createDuel(challenge));
  const [playing, setPlaying] = useState(true);
  const ref = useRef(challenge);
  useEffect(() => { ref.current = challenge; setDuel(createDuel(challenge)); setPlaying(true); }, [challenge]);
  useEffect(() => {
    if (!playing || duel.winner) return;
    const t = setTimeout(() => setDuel(d => tickDuel(d, ref.current)), 700);
    return () => clearTimeout(t);
  }, [duel, playing]);
  const lane = l => <div className="lane"><b>{l.lane === "A" ? "Solo" : "Relay"}</b><span className="mono">{l.pointer.selector}</span><Badge kind={l.settled ? "succeeded" : l.crashed || l.failed ? "failed" : "running"}>{l.lastBadge}</Badge><small>{l.tokens} tokens</small></div>;
  return (
    <Card testId="sim-duel">
      <h3>Simulated preview <Badge>authored routes, not a live browser</Badge></h3>
      {lane(duel.laneA)}{lane(duel.laneB)}
      <p data-testid="sim-duel-winner">Step {duel.step} · {duel.winner ? `Winner: ${duel.winner === "draw" ? "draw" : duel.winner === "A" ? "Solo" : "Relay"}` : "running"}</p>
      <div className="row">
        <Btn kind="ghost" onClick={() => setPlaying(!playing)} testId="sim-pause-btn">{playing ? "Pause" : "Play"}</Btn>
        <Btn kind="ghost" onClick={() => setDuel(d => tickDuel(d, ref.current))} testId="sim-step-btn">Step</Btn>
        <Btn kind="ghost" onClick={() => { setDuel(createDuel(ref.current)); setPlaying(true); }} testId="sim-replay-btn">Replay</Btn>
      </div>
    </Card>
  );
}

export default function Studio() {
  const [draft, setDraft] = useState(defaultMission);
  const [saved, setSaved] = useState([]);
  const [crabs, setCrabs] = useState([]);
  const [crabId, setCrabId] = useState("");
  const [msg, setMsg] = useState("");
  const load = () => api("/challenges").then(setSaved).catch(() => {});
  useEffect(() => { load(); api("/crabs").then(c => { setCrabs(c); setCrabId(c[0]?.id || ""); }).catch(() => {}); }, []);
  let compiled = null, compileError = "";
  try { compiled = compileMission(draft); } catch (e) { compileError = e.message; }
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const setNode = (i, k, v) => set("nodes", draft.nodes.map((n, j) => j === i ? { ...n, [k]: v } : n));
  const runLive = async () => {
    try {
      const fields = Object.keys(compiled.cleanPayload).join(", ");
      const goal = `${draft.blurb} Using only these page elements (${draft.nodes.filter(n => !n.decoy).map(n => n.selector).join(", ")}), avoid decoys, then finish with done and value = a JSON object with fields: ${fields}.`;
      const r = await post("/runs", { url: draft.url, goal, crab_id: crabId, assertions: draft.assertions });
      setMsg(`Live run started (${r.id}). Watch it in your runs via the Arena.`);
    } catch (e) { setMsg(e.message); }
  };
  return (
    <Page testId="studio-page">
      <Head eyebrow="Challenge Studio" title="Author a browser mission">Define page elements, selectors, decoys, routes and success assertions. Preview with the authored simulation, save it, or send your crab to the real URL.</Head>
      <div className="grid two">
        <Card testId="mission-editor">
          <div className="row">
            <Field label="Mission name"><input value={draft.name} onChange={e => set("name", e.target.value)} data-testid="mission-name-input" /></Field>
            <Field label="URL"><input value={draft.url} onChange={e => set("url", e.target.value)} data-testid="mission-url-input" /></Field>
          </div>
          <Field label="Brief"><input value={draft.blurb} onChange={e => set("blurb", e.target.value)} data-testid="mission-blurb-input" /></Field>
          <h4>Page elements</h4>
          {draft.nodes.map((n, i) => (
            <div key={i} className="node-row" data-testid={`mission-node-${i}`}>
              <input value={n.id} onChange={e => setNode(i, "id", e.target.value)} aria-label="id" />
              <select value={n.role} onChange={e => setNode(i, "role", e.target.value)} aria-label="role">{ROLES.map(r => <option key={r}>{r}</option>)}</select>
              <input value={n.text} onChange={e => setNode(i, "text", e.target.value)} aria-label="label" />
              <input value={n.selector} onChange={e => setNode(i, "selector", e.target.value)} aria-label="selector" className="mono" />
              <label className="check"><input type="checkbox" checked={n.decoy} onChange={e => setNode(i, "decoy", e.target.checked)} />decoy</label>
            </div>
          ))}
          <Btn kind="ghost" onClick={() => set("nodes", [...draft.nodes, { id: `el${draft.nodes.length + 1}`, role: "button", text: "New element", selector: "button.new", decoy: false }])} testId="add-node-btn">Add element</Btn>
          <div className="row">
            <Field label="Solo route (ids)"><input value={draft.soloRoute.join(",")} onChange={e => set("soloRoute", e.target.value.split(",").map(s => s.trim()).filter(Boolean))} data-testid="solo-route-input" /></Field>
            <Field label="Relay route (ids)"><input value={draft.relayRoute.join(",")} onChange={e => set("relayRoute", e.target.value.split(",").map(s => s.trim()).filter(Boolean))} data-testid="relay-route-input" /></Field>
          </div>
          <Field label="Expected extraction (JSON)"><textarea rows={4} className="mono" value={draft.payloadText} onChange={e => set("payloadText", e.target.value)} data-testid="payload-input" /></Field>
          <h4>Assertions</h4>
          {draft.assertions.map((a, i) => (
            <div key={i} className="row">
              <input value={a.field} onChange={e => set("assertions", draft.assertions.map((x, j) => j === i ? { ...x, field: e.target.value } : x))} aria-label="field" />
              <select value={a.operator} onChange={e => set("assertions", draft.assertions.map((x, j) => j === i ? { ...x, operator: e.target.value } : x))}><option>equals</option><option>exists</option></select>
              {a.operator === "equals" && <input value={a.value || ""} onChange={e => set("assertions", draft.assertions.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} aria-label="value" />}
            </div>
          ))}
          <Notice kind="error" testId="mission-compile-error">{compileError}</Notice>
          <Notice testId="studio-message">{msg}</Notice>
          <div className="row wrap">
            <Btn disabled={!compiled} onClick={() => post("/challenges", { name: draft.name, draft }).then(() => { setMsg("Saved."); load(); }).catch(e => setMsg(e.message))} testId="save-challenge-btn">Save challenge</Btn>
            <select value={crabId} onChange={e => setCrabId(e.target.value)} data-testid="studio-crab-select">{crabs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <Btn kind="ghost" disabled={!compiled || !crabId || !/^https?:\/\//.test(draft.url)} onClick={runLive} testId="run-live-challenge-btn">Run live with crab</Btn>
          </div>
        </Card>
        <div className="stack">
          {compiled && <SimDuel challenge={compiled} />}
          <Card testId="saved-challenges">
            <h3>Saved challenges</h3>
            {saved.map(s => (
              <div key={s.id} className="adapter-row">
                <button className="link" onClick={() => setDraft(s.draft)} data-testid={`load-challenge-${s.id}`}>{s.name}</button>
                <button className="link" onClick={() => del(`/challenges/${s.id}`).then(load)} data-testid={`delete-challenge-${s.id}`}>delete</button>
              </div>
            ))}
            {!saved.length && <p className="muted">Nothing saved yet.</p>}
          </Card>
        </div>
      </div>
    </Page>
  );
}
