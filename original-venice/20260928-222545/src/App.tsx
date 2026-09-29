import { useMemo, useState } from "react";
import MindGrid from "./components/MindGrid";
import ArenaViewport from "./components/ArenaViewport";
import PipelineCanvas from "./components/PipelineCanvas";
import NodeEditor from "./components/NodeEditor";
import { runVessel, synthesize } from "./core/synthesizer";
import { ARENA_CHALLENGES } from "./data/arenaChallenges";
import { PRESETS } from "./data/presets";
import { downloadCompleteWorkspace } from "./services/zipPackager";
import { runEvalHarness, verifyAllWorkflows } from "./core/evalHarness";
import type { MindId, WorkflowDag, WorkflowNode } from "./types";
type Tab = "arena" | "studio" | "bench";
export default function App() {
  const [tab, setTab] = useState<Tab>("arena");
  const [cid, setCid] = useState("ecom");
  const [playing, setPlaying] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [dag, setDag] = useState<WorkflowDag>(() => synthesize(PRESETS[0].objective));
  const [sel, setSel] = useState("scout");
  const [bench, setBench] = useState("");
  const [runLog, setRunLog] = useState("");
  const selected = dag.nodes.find(n => n.id === sel) ?? dag.nodes[0];
  const activeMind = useMemo<MindId | null>(() => playing ? (["scout", "extractor", "gatekeeper", "settlement"][Math.floor(Date.now() / 800) % 4] as MindId) : null, [playing]);
  const zip = async () => { setBusy(true); setNote("Packaging workspace..."); try { await downloadCompleteWorkspace(); setNote("Downloaded nexusrelay-enterprise-vessel.zip"); } catch { setNote("Allow downloads and retry."); } setBusy(false); };
  const updateNode = (patch: Partial<WorkflowNode> & { jev?: Partial<WorkflowNode["jev"]> }) => { setDag(d => ({ ...d, nodes: d.nodes.map(n => n.id === sel ? { ...n, ...patch, jev: { ...n.jev, ...(patch.jev ?? {}) } } : n) })); };
  const dryRun = async () => { const r = await runVessel(dag, () => {}); setRunLog(JSON.stringify({ ok: r.ok, intent: dag.intent, hops: r.steps.map(s => s.node.id + ":" + s.choice.selected), payload: r.structured }, null, 2)); };
  return (
    <div className="mx-auto min-h-screen max-w-6xl bg-canvas px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="nr-display text-3xl text-ink">A cast who gets work done.</h1><p className="mt-1 text-[11px] text-stone-500">NexusRelay complete vessel</p></div>
        <button type="button" disabled={busy} onClick={() => void zip()} className="rounded-full bg-ink px-5 py-2.5 text-xs font-semibold text-canvas shadow-luxury disabled:opacity-40">{busy ? "Packaging..." : "Download Complete Workspace (.ZIP)"}</button>
      </header>
      {note ? <p className="mb-4 text-[11px] text-stone-500">{note}</p> : null}
      <MindGrid activeMind={activeMind} />
      <div className="my-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-full border border-stone-200/80 bg-white p-1">{(["arena", "studio", "bench"] as Tab[]).map(t => (<button key={t} type="button" onClick={() => setTab(t)} className={"rounded-full px-3 py-1.5 text-xs font-semibold " + (tab === t ? "bg-ink text-canvas" : "text-stone-500")}>{t}</button>))}</div>
        <button type="button" className="rounded-full bg-amber-600 px-4 py-2 text-xs font-semibold text-white" onClick={() => setPlaying(p => !p)}>{playing ? "Pause duel" : "Resume duel"}</button>
      </div>
      {tab === "arena" ? (<div><div className="mb-3 flex flex-wrap gap-1.5">{ARENA_CHALLENGES.map(c => (<button key={c.id} type="button" onClick={() => setCid(c.id)} className={"rounded-full border border-stone-200/80 px-3 py-1 text-[11px] font-semibold " + (cid === c.id ? "bg-ink text-canvas" : "bg-white text-stone-700")}>{c.name}</button>))}</div><ArenaViewport challengeId={cid} playing={playing} /></div>) : null}
      {tab === "studio" ? (<div><div className="mb-3 flex flex-wrap gap-1.5">{PRESETS.map(p => (<button key={p.id} type="button" onClick={() => { setPresetId(p.id); const d = synthesize(p.objective); setDag(d); setSel(d.nodes[0].id); setRunLog(""); }} className={"rounded-full px-3 py-1 text-[11px] font-semibold " + (presetId === p.id ? "bg-ink text-canvas" : "bg-white")}>{p.name}</button>))}</div><div className="mb-3 flex gap-2"><button type="button" className="rounded-full bg-amber-600 px-4 py-2 text-xs font-semibold text-white" onClick={() => void dryRun()}>Execute workflow</button><span className="text-[11px] text-stone-500">intent {dag.intent}</span></div><div className="grid grid-cols-1 gap-4 md:grid-cols-2"><PipelineCanvas dag={dag} selectedId={sel} activeMind={activeMind} onSelect={setSel} /><NodeEditor node={selected} onChange={updateNode} /></div>{runLog ? <pre className="font-mono mt-3 nr-card whitespace-pre-wrap p-3 text-[10px]">{runLog}</pre> : null}</div>) : null}
      {tab === "bench" ? (<div className="nr-card p-4"><div className="flex flex-wrap gap-2"><button type="button" className="rounded-full bg-amber-600 px-4 py-2 text-xs font-semibold text-white" onClick={() => void runEvalHarness({ challengeId: presetId, trials: 10 }).then(r => setBench(JSON.stringify(r, null, 2)))}>10-trial harness</button><button type="button" className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-canvas" onClick={() => void verifyAllWorkflows().then(r => setBench(JSON.stringify(r, null, 2)))}>Verify all 8 DAGs</button></div><pre className="font-mono mt-3 whitespace-pre-wrap text-[10px] text-stone-600">{bench || "Idle."}</pre></div>) : null}
    </div>
  );
}
