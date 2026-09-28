import { useEffect, useMemo, useState } from "react";
import MindGrid from "./components/MindGrid";
import ArenaViewport from "./components/ArenaViewport";
import ChallengeStudio from "./components/ChallengeStudio";
import BrowserSimulationViewport from "./components/BrowserSimulationViewport";
import PipelineCanvas from "./components/PipelineCanvas";
import NodeEditor, { type NodePatch } from "./components/NodeEditor";
import { runVessel, synthesize } from "./core/synthesizer";
import { runEvalHarness, verifyAllWorkflows, type HarnessReport } from "./core/evalHarness";
import { ARENA_CHALLENGES, type ArenaChallenge } from "./data/arenaChallenges";
import { EXTENDED_CHALLENGES } from "./data/extendedChallenges";
import { PRESETS } from "./data/presets";
import { exportBundle } from "./services/vesselExporter";
import type { MindId, WorkflowDag } from "./types";

type Tab = "arena" | "challenge" | "browser" | "studio" | "bench" | "export";
const MIND_IDS: MindId[] = ["scout", "extractor", "gatekeeper", "settlement"];

export default function App() {
  const [tab, setTab] = useState<Tab>("arena");
  const [arenaId, setArenaId] = useState(ARENA_CHALLENGES[0].id);
  const [customChallenge, setCustomChallenge] = useState<ArenaChallenge | null>(null);
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
  const files = useMemo(() => exportBundle(dag, customChallenge), [dag, customChallenge]);
  const selectedNode = dag.nodes.find(node => node.id === selectedId) ?? dag.nodes[0];
  const openView = (view: Tab) => { setTab(view); window.setTimeout(() => document.getElementById("studio-views")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); };

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
    try { const { downloadCompleteWorkspace } = await import("./services/zipPackager"); await downloadCompleteWorkspace(); setNote("Workspace ZIP downloaded."); }
    catch (error) { setNote(error instanceof Error ? error.message : "Download failed"); }
    finally { setBusy(false); }
  };
  const downloadStarter = async () => {
    setBusy(true);
    try { const { downloadFiles } = await import("./services/zipPackager"); await downloadFiles(files, "nexusrelay-agent-starter.zip"); setNote("Agent starter ZIP downloaded."); }
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
    <div className="mx-auto min-h-screen max-w-7xl px-4 pb-12 pt-4 sm:px-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 py-2">
        <div className="flex items-center gap-3"><span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-2xl bg-ink text-xl text-white">✦</span><div><h1 className="nr-display text-xl leading-tight text-ink">NexusRelay</h1><p className="text-[10px] font-semibold uppercase tracking-[.22em] text-amber-700">Agent playground</p></div></div>
        <button type="button" onClick={() => openView("challenge")} className="rounded-full bg-ink px-5 py-2.5 text-xs font-bold text-white shadow-luxury">Build a challenge ↗</button>
      </header>
      {note && <p className="mb-4 text-xs text-stone-600" role="status">{note}</p>}
      <section className="nr-hero relative mb-7 overflow-hidden rounded-[36px] px-6 py-9 text-white sm:px-10 sm:py-12 lg:min-h-[360px] lg:px-14">
        <div aria-hidden="true" className="nr-hero-orbit nr-hero-orbit-one" /><div aria-hidden="true" className="nr-hero-orbit nr-hero-orbit-two" />
        <div className="relative z-10 max-w-2xl"><p className="mb-3 text-[11px] font-bold uppercase tracking-[.3em] text-amber-300">Enter the browser agent arena</p><h2 className="nr-display text-4xl leading-[1.05] sm:text-5xl lg:text-6xl">Small mission.<br /><em className="not-italic text-[#FFB65C]">Big minds.</em><br />Your rules.</h2><p className="mt-5 max-w-lg text-sm leading-relaxed text-stone-200">Build a browser challenge, plant a decoy, and watch a solo agent race a relay of specialists. Then tune the squad and take the runner home.</p><div className="mt-6 flex flex-wrap gap-2"><button type="button" onClick={() => openView("arena")} className="rounded-full bg-[#FF9B31] px-6 py-3 text-xs font-bold text-ink transition-transform hover:scale-105">Watch a duel →</button><button type="button" onClick={() => openView("challenge")} className="rounded-full border border-white/40 px-6 py-3 text-xs font-bold text-white hover:bg-white/10">Design a mission</button></div></div>
        <div aria-hidden="true" className="nr-hero-glyph hidden lg:flex"><span>SCOUT</span><b>01</b><span>EXTRACT</span><b>02</b><span>GATE</span><b>03</b><span>DELIVER</span></div>
        <div className="relative z-10 mt-8 flex flex-wrap gap-5 border-t border-white/20 pt-4 text-[10px] font-semibold uppercase tracking-widest text-stone-300"><span>04 specialist minds</span><span>02 rival architectures</span><span>∞ possible missions</span></div>
      </section>
      <MindGrid activeMind={activeMind} onSelect={mind => { setSelectedId(mind === "extractor" ? "extract" : mind === "gatekeeper" ? "gate" : mind === "settlement" ? "settle" : "scout"); openView("studio"); }} />
      <div id="studio-views" className="my-5 flex scroll-mt-4 flex-wrap items-center justify-between gap-2">
        <nav aria-label="Studio views" className="flex flex-wrap rounded-full border border-stone-200/80 bg-white p-1">
          {(["arena", "challenge", "studio", "browser", "bench", "export"] as Tab[]).map(view => (
            <button key={view} type="button" onClick={() => setTab(view)}
              aria-current={tab === view ? "page" : undefined}
              className={"rounded-full px-3 py-1.5 text-xs font-semibold " + (tab === view ? "bg-ink text-canvas" : "text-stone-500")}>{view === "challenge" ? "challenge studio" : view === "studio" ? "squad studio" : view}</button>
          ))}
        </nav>
        <button type="button" className="rounded-full bg-amber-600 px-4 py-2 text-xs font-semibold text-white"
          onClick={() => setPlaying(value => !value)}>{playing ? "Pause simulations" : "Resume simulations"}</button>
      </div>

      {tab === "arena" && <section>
        <p className="mb-2 text-xs text-stone-600">Four designed challenges and your custom mission · simulated rules, replayable outcomes</p>
        <div className="mb-3 flex flex-wrap gap-1.5">{ARENA_CHALLENGES.map(challenge => (
          <button key={challenge.id} type="button" onClick={() => setArenaId(challenge.id)}
            className={"rounded-full border border-stone-200/80 px-3 py-1 text-[11px] font-semibold " + (arenaId === challenge.id ? "bg-ink text-canvas" : "bg-white text-stone-700")}>{challenge.name}</button>
        ))}{customChallenge && <button type="button" onClick={() => setArenaId("custom")} className={"rounded-full border border-amber-400 px-3 py-1 text-[11px] font-semibold " + (arenaId === "custom" ? "bg-ink text-canvas" : "bg-amber-50")}>★ {customChallenge.name}</button>}
          <button type="button" onClick={() => setTab("challenge")} className="rounded-full border border-stone-200 bg-white px-3 py-1 text-[11px] font-semibold">+ Build a challenge</button></div>
        <ArenaViewport challengeId={arenaId} challenge={arenaId === "custom" ? customChallenge ?? undefined : undefined} playing={playing} />
      </section>}

      {tab === "challenge" && <ChallengeStudio onLaunch={challenge => { setCustomChallenge(challenge); setArenaId("custom"); setTab("arena"); }} />}

      {tab === "browser" && <section>
        <p className="mb-2 text-xs text-stone-600">Eight simulated research scenes with selector traces</p>
        <div className="mb-3 flex flex-wrap gap-1.5">{PRESETS.map(preset => (
          <button key={preset.id} type="button" onClick={() => setBrowserId(preset.id)}
            className={"rounded-full px-3 py-1 text-[11px] font-semibold " + (browserId === preset.id ? "bg-ink text-canvas" : "bg-white text-stone-700")}>{preset.name}</button>
        ))}</div>
        <BrowserSimulationViewport challengeId={browserId} running={playing} />
      </section>}

      {tab === "studio" && <section>
        <div className="nr-card mb-3 bg-gradient-to-r from-[#fff3dc] to-[#e5f5ef] p-4"><h2 className="nr-display text-xl">Assemble your specialist squad</h2><p className="mt-1 text-xs text-stone-600">Pick an objective, then tune each mind’s instructions, pruning budget, and score gate before exporting. Prompt edits are carried into the starter; this local dry run still uses fixture behavior.</p></div>
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

      {tab === "export" && <section>
        <div className="nr-kit-box">
          <div className="nr-kit-lid"><span>✦ N/R · BUILD YOUR OWN SERIES</span><span>STARTER KIT / 001</span></div>
          <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-[1.15fr_1fr] lg:items-center">
            <div><p className="nr-eyebrow">Ready for the workbench</p><h2 className="nr-display text-4xl sm:text-5xl">Package your squad.</h2><p className="mt-3 max-w-lg text-sm leading-relaxed text-stone-600">Your four edited Minds and {customChallenge ? `“${customChallenge.name}”` : "the starter price maze"} are packed into a modular TypeScript runner. Open the box, try the local demo, and bring your own browser and model adapters when you are ready.</p><div className="mt-5 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void downloadStarter()} className="rounded-full bg-ink px-6 py-3 text-xs font-bold text-white disabled:opacity-40">{busy ? "Packing…" : "Unbox starter kit (.ZIP) ↗"}</button><button type="button" disabled={busy} onClick={() => void download()} className="rounded-full border border-stone-400 bg-white px-5 py-3 text-xs font-bold disabled:opacity-40">Full source ZIP</button></div><p className="mt-3 text-[11px] text-stone-500">Includes a runnable fixture and adapter interfaces. No live credentials or provider calls are bundled.</p>{note && <p className="mt-2 text-xs font-semibold text-emerald-800" role="status">{note}</p>}</div>
            <div className="nr-kit-tray"><span className="nr-kit-tray-label">INSIDE THE BOX · FOUR SPECIALISTS</span><div className="grid grid-cols-2 gap-2">{dag.nodes.map((node, index) => <div key={node.id} className="nr-kit-mini"><span>0{index + 1}</span><strong>{node.mind}</strong><small>{node.title}</small></div>)}</div><div className="nr-kit-ticket">✦ MISSION CARD <strong>{customChallenge?.name ?? "Price maze"}</strong></div></div>
          </div>
        </div>
        <div className="nr-card mt-5 p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="nr-display text-xl">Peek inside the kit</h3><p className="text-[11px] text-stone-500">Select a file to inspect the code before download.</p></div><select aria-label="Exported file" value={exportFile} onChange={event => setExportFile(event.target.value)} className="rounded-full border border-stone-200 bg-white px-3 py-2 text-xs">{Object.keys(files).map(file => <option key={file} value={file}>{file}</option>)}</select></div><pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-2xl bg-[#25221e] p-4 font-mono text-[10px] text-stone-100">{files[exportFile]}</pre></div>
      </section>}
    </div>
  );
}
