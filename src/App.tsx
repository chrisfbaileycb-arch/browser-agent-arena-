import { useEffect, useMemo, useState } from "react";
import MindGrid from "./components/MindGrid";
import ArenaViewport from "./components/ArenaViewport";
import BrowserSimulationViewport from "./components/BrowserSimulationViewport";
import PipelineCanvas from "./components/PipelineCanvas";
import NodeEditor, { type NodePatch } from "./components/NodeEditor";
import { runVessel, synthesize } from "./core/synthesizer";
import { runEvalHarness, verifyAllWorkflows, type HarnessReport } from "./core/evalHarness";
import { ARENA_CHALLENGES } from "./data/arenaChallenges";
import { EXTENDED_CHALLENGES } from "./data/extendedChallenges";
import { PRESETS } from "./data/presets";
import { downloadCompleteWorkspace, downloadFiles } from "./services/zipPackager";
import { exportBundle } from "./services/vesselExporter";
import type { MindId, WorkflowDag } from "./types";

type Tab = "arena" | "browser" | "studio" | "bench" | "export";
const MIND_IDS: MindId[] = ["scout", "extractor", "gatekeeper", "settlement"];

export default function App() {
  const [tab, setTab] = useState<Tab>("arena");
  const [arenaId, setArenaId] = useState(ARENA_CHALLENGES[0].id);
  const [browserId, setBrowserId] = useState(PRESETS[0].id);
  const [benchId, setBenchId] = useState(EXTENDED_CHALLENGES[0].id);
  const [playing, setPlaying] = useState(true);
  const [activeMind, setActiveMind] = useState<MindId | null>("scout");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [objective, setObjective] = useState(PRESETS[0].objective);
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [dag, setDag] = useState<WorkflowDag>(() => synthesize(PRESETS[0].objective));
  const [selectedId, setSelectedId] = useState("scout");
  const [report, setReport] = useState<HarnessReport | null>(null);
  const [verification, setVerification] = useState("");
  const [runLog, setRunLog] = useState("");
  const [exportFile, setExportFile] = useState("runner.ts");
  const files = useMemo(() => exportBundle(dag), [dag]);
  const selectedNode = dag.nodes.find(node => node.id === selectedId) ?? dag.nodes[0];

  useEffect(() => {
    if (!playing) { setActiveMind(null); return; }
    let index = 0;
    setActiveMind(MIND_IDS[index]);
    const timer = window.setInterval(() => {
      index = (index + 1) % MIND_IDS.length;
      setActiveMind(MIND_IDS[index]);
    }, 800);
    return () => window.clearInterval(timer);
  }, [playing]);

  const onPreset = (id: typeof presetId) => {
    const preset = PRESETS.find(item => item.id === id);
    if (!preset) return;
    const next = synthesize(preset.objective);
    setPresetId(id);
    setObjective(preset.objective);
    setDag(next);
    setSelectedId(next.nodes[0].id);
    setRunLog("");
  };
  const onSynthesize = () => {
    const next = synthesize(objective);
    setDag(next);
    setPresetId(next.intent);
    setSelectedId(next.nodes[0].id);
    setRunLog("");
  };
  const updateNode = (patch: NodePatch) => {
    setDag(current => ({
      ...current,
      nodes: current.nodes.map(node => node.id === selectedId
        ? { ...node, ...patch, jev: { ...node.jev, ...(patch.jev ?? {}) } }
        : node),
    }));
  };
  const dryRun = async () => {
    setBusy(true);
    try {
      const result = await runVessel(dag, () => {});
      setRunLog(JSON.stringify({ mode: "fixture simulation", ok: result.ok, intent: dag.intent,
        steps: result.steps.map(step => ({ node: step.node.id, decision: step.choice.selected, score: step.score.value })),
        payload: result.structured ?? null }, null, 2));
    } catch (error) {
      setRunLog(error instanceof Error ? error.message : "Simulation failed");
    } finally { setBusy(false); }
  };
  const download = async () => {
    setBusy(true);
    setNote("Packaging workspace…");
    try { await downloadCompleteWorkspace(); setNote("Workspace ZIP downloaded."); }
    catch (error) { setNote(error instanceof Error ? error.message : "Download failed"); }
    finally { setBusy(false); }
  };
  const benchmark = async () => {
    setBusy(true);
    try { setReport(await runEvalHarness({ challengeId: benchId, trials: 10 })); setVerification(""); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true);
    try { setVerification(JSON.stringify(await verifyAllWorkflows(), null, 2)); setReport(null); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto min-h-screen max-w-6xl bg-canvas px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="nr-display text-3xl text-ink">NexusRelay simulation studio</h1>
          <p className="mt-1 text-[11px] text-stone-500">Fixture-based demo · no live provider or webhook calls</p>
        </div>
        <button type="button" disabled={busy} onClick={() => void download()}
          className="rounded-full bg-ink px-5 py-2.5 text-xs font-semibold text-canvas shadow-luxury disabled:opacity-40">
          {busy ? "Working…" : "Download Complete Workspace (.ZIP)"}
        </button>
      </header>
      {note && <p className="mb-4 text-xs text-stone-600" role="status">{note}</p>}
      <MindGrid activeMind={activeMind} />
      <div className="my-4 flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Studio views" className="flex flex-wrap rounded-full border border-stone-200/80 bg-white p-1">
          {(["arena", "browser", "studio", "bench", "export"] as Tab[]).map(view => (
            <button key={view} type="button" onClick={() => setTab(view)}
              aria-current={tab === view ? "page" : undefined}
              className={"rounded-full px-3 py-1.5 text-xs font-semibold " + (tab === view ? "bg-ink text-canvas" : "text-stone-500")}>{view}</button>
          ))}
        </nav>
        <button type="button" className="rounded-full bg-amber-600 px-4 py-2 text-xs font-semibold text-white"
          onClick={() => setPlaying(value => !value)}>{playing ? "Pause simulations" : "Resume simulations"}</button>
      </div>

      {tab === "arena" && <section>
        <p className="mb-2 text-xs text-stone-600">Four scripted browser duels</p>
        <div className="mb-3 flex flex-wrap gap-1.5">{ARENA_CHALLENGES.map(challenge => (
          <button key={challenge.id} type="button" onClick={() => setArenaId(challenge.id)}
            className={"rounded-full border border-stone-200/80 px-3 py-1 text-[11px] font-semibold " + (arenaId === challenge.id ? "bg-ink text-canvas" : "bg-white text-stone-700")}>{challenge.name}</button>
        ))}</div>
        <ArenaViewport challengeId={arenaId} playing={playing} />
      </section>}

      {tab === "browser" && <section>
        <p className="mb-2 text-xs text-stone-600">Eight simulated research scenes with selector traces</p>
        <div className="mb-3 flex flex-wrap gap-1.5">{PRESETS.map(preset => (
          <button key={preset.id} type="button" onClick={() => setBrowserId(preset.id)}
            className={"rounded-full px-3 py-1 text-[11px] font-semibold " + (browserId === preset.id ? "bg-ink text-canvas" : "bg-white text-stone-700")}>{preset.name}</button>
        ))}</div>
        <BrowserSimulationViewport challengeId={browserId} running={playing} />
      </section>}

      {tab === "studio" && <section>
        <div className="mb-3 flex flex-wrap gap-1.5">{PRESETS.map(preset => (
          <button key={preset.id} type="button" onClick={() => onPreset(preset.id)}
            className={"rounded-full px-3 py-1 text-[11px] font-semibold " + (presetId === preset.id ? "bg-ink text-canvas" : "bg-white")}>{preset.name}</button>
        ))}</div>
        <label htmlFor="objective" className="text-xs font-semibold">Workflow objective</label>
        <textarea id="objective" value={objective} maxLength={2000} onChange={event => setObjective(event.target.value)}
          className="mt-1 min-h-24 w-full rounded-2xl border border-stone-200 bg-white p-3 text-sm" />
        <div className="my-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={onSynthesize} className="rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-semibold">Synthesize DAG</button>
          <button type="button" disabled={busy} onClick={() => void dryRun()} className="rounded-full bg-amber-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">Simulate workflow</button>
          <span className="text-[11px] text-stone-500">Detected intent: {dag.intent}</span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <PipelineCanvas dag={dag} selectedId={selectedId} activeMind={activeMind} onSelect={setSelectedId} />
          <NodeEditor node={selectedNode} onChange={updateNode} />
        </div>
        {runLog && <pre className="nr-card mt-3 whitespace-pre-wrap p-3 font-mono text-[10px]">{runLog}</pre>}
      </section>}

      {tab === "bench" && <section className="nr-card p-4">
        <p className="mb-3 text-xs text-stone-600">Illustrative fixture trials and fixed cost assumptions. These are not measured provider performance or billing.</p>
        <div className="flex flex-wrap gap-2">
          <select aria-label="Benchmark scenario" value={benchId} onChange={event => setBenchId(event.target.value)}
            className="rounded-full border border-stone-200 bg-white px-3 text-xs">
            {EXTENDED_CHALLENGES.map(challenge => <option key={challenge.id} value={challenge.id}>{challenge.name}</option>)}
          </select>
          <button type="button" disabled={busy} onClick={() => void benchmark()} className="rounded-full bg-amber-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">Run 10-trial duel</button>
          <button type="button" disabled={busy} onClick={() => void verify()} className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-canvas disabled:opacity-40">Verify all 8 DAGs</button>
        </div>
        {report && <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs">
          <thead><tr><th className="p-2">Lane</th><th className="p-2">Success</th><th className="p-2">Mean input tokens</th><th className="p-2">Cost per success</th><th className="p-2">Mean simulated time to failure</th></tr></thead>
          <tbody>{[report.monolith, report.relay].map(lane => <tr key={lane.architecture} className="border-t border-stone-200">
            <td className="p-2">{lane.architecture}</td><td className="p-2">{(lane.successRate * 100).toFixed(0)}%</td>
            <td className="p-2">{lane.meanInputTokens.toFixed(0)}</td><td className="p-2">{lane.costPerSuccessfulExecution == null ? "n/a" : `$${lane.costPerSuccessfulExecution.toFixed(4)}`}</td>
            <td className="p-2">{lane.mttfMs == null ? "n/a" : `${lane.mttfMs.toFixed(0)} ms`}</td>
          </tr>)}</tbody>
        </table></div>}
        {verification && <pre className="mt-3 whitespace-pre-wrap font-mono text-[10px]">{verification}</pre>}
      </section>}

      {tab === "export" && <section className="nr-card p-4">
        <p className="mb-3 text-xs text-stone-600">Executable fixture runner for the selected DAG. It does not contact live providers.</p>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select aria-label="Exported file" value={exportFile} onChange={event => setExportFile(event.target.value)}
            className="rounded-full border border-stone-200 bg-white px-3 py-2 text-xs">
            {Object.keys(files).map(file => <option key={file} value={file}>{file}</option>)}
          </select>
          <button type="button" onClick={() => void downloadFiles(files, "nexusrelay-fixture-runner.zip")}
            className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-canvas">Download workflow ZIP</button>
        </div>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-2xl bg-sand p-3 font-mono text-[10px]">{files[exportFile]}</pre>
      </section>}
    </div>
  );
}
