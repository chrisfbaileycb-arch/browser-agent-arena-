import { useEffect, useMemo, useState } from "react";
import MindGrid from "./components/MindGrid";
import ArenaViewport from "./components/ArenaViewport";
import ChallengeStudio from "./components/ChallengeStudio";
import BrowserSimulationViewport from "./components/BrowserSimulationViewport";
import PipelineCanvas from "./components/PipelineCanvas";
import NodeEditor, { type NodePatch } from "./components/NodeEditor";
import WorkflowsCatalog from "./components/WorkflowsCatalog";
import { runVessel, synthesize } from "./core/synthesizer";
import { runEvalHarness, verifyAllWorkflows, type HarnessReport } from "./core/evalHarness";
import { ARENA_CHALLENGES, type ArenaChallenge } from "./data/arenaChallenges";
import { EXTENDED_CHALLENGES } from "./data/extendedChallenges";
import { PRESETS } from "./data/presets";
import { exportBundle } from "./services/vesselExporter";
import type { MindId, WorkflowDag } from "./types";

const VALID_PAGES = ["home", "workflows", "studio", "arena", "challenge", "browser", "cast", "bench", "export"] as const;
type Page = typeof VALID_PAGES[number];

const MIND_IDS: MindId[] = ["scout", "extractor", "gatekeeper", "settlement"];

export default function App() {
  // Hash-based multi-page routing
  const [page, setPage] = useState<Page>(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.replace("#", "").toLowerCase() as Page;
      if (VALID_PAGES.includes(hash)) return hash;
    }
    return "home";
  });

  const navigateTo = (nextPage: Page) => {
    setPage(nextPage);
    if (typeof window !== "undefined") {
      window.location.hash = nextPage;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "").toLowerCase() as Page;
      if (VALID_PAGES.includes(hash)) {
        setPage(hash);
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

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
  const [liveLog, setLiveLog] = useState("");
  const [dispatchLive, setDispatchLive] = useState(false);
  const [liveStatus, setLiveStatus] = useState<{ gemini: boolean; openai?: boolean; firebase?: boolean; destinations: string[] } | null>(null);
  const [exportFile, setExportFile] = useState("runner.ts");
  const files = useMemo(() => exportBundle(dag, customChallenge), [dag, customChallenge]);
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

  useEffect(() => {
    fetch("/api/workflow/status").then(response => {
      if (!response.ok) throw new Error("Workflow server unavailable");
      return response.json();
    }).then(setLiveStatus).catch(() => setLiveStatus(null));
  }, []);

  const onPreset = (id: typeof presetId) => {
    const preset = PRESETS.find(item => item.id === id);
    if (!preset) return;
    const next = synthesize(preset.objective);
    setPresetId(id);
    setObjective(preset.objective);
    setDag(next);
    setSelectedId(next.nodes[0].id);
    setRunLog("");
    setLiveLog("");
  };

  const onSynthesize = () => {
    const next = synthesize(objective);
    setDag(next);
    setPresetId(next.intent);
    setSelectedId(next.nodes[0].id);
    setRunLog("");
    setLiveLog("");
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
      setRunLog(JSON.stringify({
        mode: "fixture simulation",
        ok: result.ok,
        intent: dag.intent,
        steps: result.steps.map(step => ({
          node: step.node.id,
          decision: step.choice.selected,
          score: step.score.value
        })),
        payload: result.structured ?? null
      }, null, 2));
    } catch (error) {
      setRunLog(error instanceof Error ? error.message : "Simulation failed");
    } finally { setBusy(false); }
  };

  const runLive = async () => {
    setBusy(true);
    setLiveLog("Calling live providers…");
    try {
      const workflow = { ...dag, objective };
      const response = await fetch("/api/workflow/live", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objective, workflow, dispatch: dispatchLive }),
      });
      const result = await response.json();
      setLiveLog(JSON.stringify(result, null, 2));
    } catch (error) {
      setLiveLog(error instanceof Error ? error.message : "Live workflow failed");
    } finally { setBusy(false); }
  };

  const download = async () => {
    setBusy(true);
    setNote("Packaging complete workspace…");
    try {
      const { downloadCompleteWorkspace } = await import("./services/zipPackager");
      await downloadCompleteWorkspace();
      setNote("Workspace ZIP downloaded successfully.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Download failed");
    } finally { setBusy(false); }
  };

  const downloadStarter = async () => {
    setBusy(true);
    try {
      const { downloadFiles } = await import("./services/zipPackager");
      await downloadFiles(files, "nexusrelay-agent-starter.zip");
      setNote("Agent starter ZIP downloaded.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Download failed");
    } finally { setBusy(false); }
  };

  const benchmark = async () => {
    setBusy(true);
    try {
      setReport(await runEvalHarness({ challengeId: benchId, trials: 10 }));
      setVerification("");
    } finally { setBusy(false); }
  };

  const verify = async () => {
    setBusy(true);
    try {
      setVerification(JSON.stringify(await verifyAllWorkflows(), null, 2));
      setReport(null);
    } finally { setBusy(false); }
  };

  const handleOpenInStudio = (pid: string) => {
    onPreset(pid as typeof presetId);
    navigateTo("studio");
  };

  const handleOpenInBrowser = (pid: string) => {
    setBrowserId(pid as typeof presetId);
    navigateTo("browser");
  };

  return (
    <div className="mx-auto min-h-screen max-w-7xl px-4 pb-14 pt-4 sm:px-6">
      {/* Cartoon Arcade Event Marquee */}
      <div className="mb-4 overflow-hidden rounded-xl border-2 border-stone-900 bg-[#FFE135] text-stone-900 shadow-[3px_3px_0px_#18181B]">
        <div className="flex items-center gap-3 py-1.5 px-3 text-xs font-mono font-black uppercase tracking-wider overflow-x-auto whitespace-nowrap">
          <span className="flex items-center gap-1 bg-white text-stone-900 px-2 py-0.5 rounded-lg border border-stone-900 shadow-[1px_1px_0px_#18181B] text-[10px]">
            ⚡ AGENT ARENA GYM
          </span>
          <span className="text-[#EA580C]">●</span>
          <span>🍌 SCOUT: TAVILY RADAR ENGAGED (-720 TOKENS)</span>
          <span className="text-[#7C3AED]">●</span>
          <span>🔮 EXTRACTOR: TYPED SCHEMA LOCK (99.4% FIDELITY)</span>
          <span className="text-[#059669]">●</span>
          <span>🛡️ GATEKEEPER: VERIFICATION SHIELD ARMED (0 DRIFT)</span>
          <span className="text-[#E11D48]">●</span>
          <span>🎯 SETTLEMENT: REST DISPATCH READY</span>
          <span className="text-[#0284C7]">●</span>
          <span>🎮 DUAL ARENA: OPENAI MONOLITH VS GEMINI RELAY</span>
        </div>
      </div>

      {/* Top Bar Contract: Zone 1 Wordmark, Zone 2 Navigation Links, Zone 3 Action */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b-2 border-stone-900 pb-4">
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => navigateTo("home")}
          className="group flex items-center gap-2.5 text-left focus:outline-none"
        >
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#FFE135] border-2 border-stone-900 shadow-[2px_2px_0px_#18181B] text-xl font-black text-stone-900 group-hover:rotate-6 transition-transform">
            ✦
          </span>
          <span className="nr-display text-2xl sm:text-3xl font-black tracking-tight text-ink group-hover:text-[#EA580C] transition-colors">
            NexusRelay Arena
          </span>
        </button>

        {/* Zone 2: Clean text navigation links with colorful active states */}
        <nav aria-label="Primary Navigation" className="hidden md:flex items-center gap-4 text-xs font-bold uppercase tracking-wider">
          <button
            type="button"
            onClick={() => navigateTo("home")}
            className={`px-3 py-1.5 rounded-xl border-2 transition-all ${page === "home" ? "bg-[#FFE135] text-stone-900 border-stone-900 shadow-[2px_2px_0px_#18181B]" : "border-transparent text-stone-600 hover:text-ink hover:bg-stone-100"}`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => navigateTo("workflows")}
            className={`px-3 py-1.5 rounded-xl border-2 transition-all ${page === "workflows" ? "bg-[#A78BFA] text-white border-stone-900 shadow-[2px_2px_0px_#18181B]" : "border-transparent text-stone-600 hover:text-ink hover:bg-stone-100"}`}
          >
            Workflows (8)
          </button>
          <button
            type="button"
            onClick={() => navigateTo("arena")}
            className={`px-3 py-1.5 rounded-xl border-2 transition-all ${page === "arena" ? "bg-[#F43F5E] text-white border-stone-900 shadow-[2px_2px_0px_#18181B]" : "border-transparent text-stone-600 hover:text-ink hover:bg-stone-100"}`}
          >
            Browser Arena
          </button>
          <button
            type="button"
            onClick={() => navigateTo("studio")}
            className={`px-3 py-1.5 rounded-xl border-2 transition-all ${page === "studio" ? "bg-[#34D399] text-stone-900 border-stone-900 shadow-[2px_2px_0px_#18181B]" : "border-transparent text-stone-600 hover:text-ink hover:bg-stone-100"}`}
          >
            Squad Studio
          </button>
          <button
            type="button"
            onClick={() => navigateTo("challenge")}
            className={`px-3 py-1.5 rounded-xl border-2 transition-all ${page === "challenge" ? "bg-[#FB923C] text-white border-stone-900 shadow-[2px_2px_0px_#18181B]" : "border-transparent text-stone-600 hover:text-ink hover:bg-stone-100"}`}
          >
            Mission Builder
          </button>
          <button
            type="button"
            onClick={() => navigateTo("cast")}
            className={`px-3 py-1.5 rounded-xl border-2 transition-all ${page === "cast" ? "bg-[#38BDF8] text-stone-900 border-stone-900 shadow-[2px_2px_0px_#18181B]" : "border-transparent text-stone-600 hover:text-ink hover:bg-stone-100"}`}
          >
            Specialist Cast
          </button>
          <button
            type="button"
            onClick={() => navigateTo("bench")}
            className={`hidden xl:inline-block px-3 py-1.5 rounded-xl border-2 transition-all ${page === "bench" ? "bg-[#F472B6] text-white border-stone-900 shadow-[2px_2px_0px_#18181B]" : "border-transparent text-stone-600 hover:text-ink hover:bg-stone-100"}`}
          >
            Eval Harness
          </button>
          <button
            type="button"
            onClick={() => navigateTo("export")}
            className={`hidden xl:inline-block px-3 py-1.5 rounded-xl border-2 transition-all ${page === "export" ? "bg-[#FDE047] text-stone-900 border-stone-900 shadow-[2px_2px_0px_#18181B]" : "border-transparent text-stone-600 hover:text-ink hover:bg-stone-100"}`}
          >
            Runner Export
          </button>
        </nav>

        {/* Zone 3: 1-2 primary actions */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setPlaying(value => !value)}
            className="hidden sm:inline-block nr-arcade-btn bg-white px-3.5 py-1.5 text-xs text-stone-800"
          >
            {playing ? "⏸ Pause" : "▶ Resume"}
          </button>
          <button
            type="button"
            onClick={() => navigateTo("workflows")}
            className="nr-arcade-btn bg-[#FFE135] text-stone-900 px-4 py-2 text-xs"
          >
            All 8 Workflows ↗
          </button>
        </div>
      </header>

      {/* Mobile secondary tab strip */}
      <nav aria-label="Mobile Navigation" className="md:hidden mb-5 overflow-x-auto pb-1">
        <div className="flex min-w-max items-center gap-1 rounded-xl border border-stone-200/90 bg-white p-1 text-xs">
          {(["home", "workflows", "arena", "studio", "challenge", "browser", "cast", "bench", "export"] as const).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => navigateTo(p)}
              className={`rounded-lg px-3 py-1 font-medium capitalize transition-colors ${page === p ? "bg-ink text-white" : "text-stone-600 hover:text-stone-900"}`}
            >
              {p === "home" ? "Overview" : p === "bench" ? "Harness" : p}
            </button>
          ))}
        </div>
      </nav>

      {note && (
        <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 flex items-center justify-between" role="status">
          <span>{note}</span>
          <button type="button" onClick={() => setNote("")} className="font-bold">✕</button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PAGE 1: HOME / OVERVIEW                                                  */}
      {/* ========================================================================= */}
      {page === "home" && (
        <div className="space-y-8 animate-fadeIn">
          {/* Hero Banner with Multi-Color Game Arcade Atmosphere */}
          <section className="nr-hero relative overflow-hidden rounded-[36px] px-6 py-10 text-white sm:px-10 sm:py-14 lg:min-h-[400px] lg:px-14">
            <div aria-hidden="true" className="nr-hero-orbit nr-hero-orbit-one" />
            <div aria-hidden="true" className="nr-hero-orbit nr-hero-orbit-two" />
            <div className="relative z-10 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFE135] text-stone-900 px-3 py-1 text-xs font-mono font-black uppercase tracking-wider border-2 border-stone-900 shadow-[2px_2px_0px_#000]">
                  🍌 MULTI-AGENT ARENA GYM
                </span>
                <span className="inline-flex items-center gap-1 rounded-lg bg-[#34D399] text-stone-900 px-2.5 py-1 text-xs font-mono font-black border-2 border-stone-900 shadow-[2px_2px_0px_#000]">
                  ⚡ 0 DRIFT
                </span>
                <span className="inline-flex items-center gap-1 rounded-lg bg-[#F43F5E] text-white px-2.5 py-1 text-xs font-mono font-black border-2 border-stone-900 shadow-[2px_2px_0px_#000]">
                  🛡️ 92% PRUNED
                </span>
              </div>
              <h2 className="nr-display text-4xl leading-[1.05] sm:text-5xl lg:text-6xl text-white font-black">
                Small mission.<br />
                <span className="text-[#FFE135] underline decoration-[#F43F5E] decoration-wavy">Big minds.</span><br />
                Your arena rules.
              </h2>
              <p className="mt-5 max-w-lg text-sm leading-relaxed text-stone-200 font-medium">
                Watch a solo monolithic agent race a relay of specialized minds through live browser traps and noise.
                Tune all 8 enterprise DAG workflows, customize prompt gates, and download production-ready runners.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => navigateTo("workflows")}
                  className="nr-arcade-btn bg-[#FFE135] text-stone-900 px-6 py-3 text-xs font-black transition-transform hover:scale-105"
                >
                  🍌 Explore All 8 Workflows →
                </button>
                <button
                  type="button"
                  onClick={() => navigateTo("arena")}
                  className="nr-arcade-btn bg-[#F43F5E] text-white px-6 py-3 text-xs font-black transition-transform hover:scale-105"
                >
                  🎮 Enter Browser Duel Arena
                </button>
                <button
                  type="button"
                  onClick={() => navigateTo("challenge")}
                  className="nr-arcade-btn bg-[#38BDF8] text-stone-900 px-5 py-3 text-xs font-black transition-transform hover:scale-105"
                >
                  ⚡ Build Custom Mission
                </button>
              </div>
            </div>
            <div aria-hidden="true" className="nr-hero-glyph hidden lg:flex">
              <span>SCOUT</span><b>01</b>
              <span>EXTRACT</span><b>02</b>
              <span>GATE</span><b>03</b>
              <span>DELIVER</span>
            </div>
            <div className="relative z-10 mt-8 flex flex-wrap gap-3 border-t-2 border-white/20 pt-4 text-xs font-mono font-bold uppercase tracking-wider text-stone-200">
              <span className="bg-[#FFE135] text-stone-900 px-2 py-0.5 rounded border border-stone-900">08 Workflows</span>
              <span className="bg-[#34D399] text-stone-900 px-2 py-0.5 rounded border border-stone-900">04 Specialist Minds</span>
              <span className="bg-[#A78BFA] text-white px-2 py-0.5 rounded border border-stone-900">02 Rival Lanes</span>
              <span className="bg-[#FB923C] text-stone-900 px-2 py-0.5 rounded border border-stone-900">OpenAI vs Gemini Duel</span>
            </div>
          </section>

          {/* Quick Showcase Grid: Multi-Color Workflows Cards */}
          <section className="nr-card p-6 bg-[#FFFDF0]">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5 border-b-2 border-stone-900 pb-4">
              <div>
                <span className="nr-eyebrow">Enterprise Pipeline Training Suite</span>
                <h3 className="nr-display text-2xl sm:text-3xl text-ink font-black">All 8 Specialized Agent Workflows</h3>
                <p className="text-xs text-stone-600 mt-1">Multi-colored training modules with live simulation, typed JSON schema validation, and REST delivery.</p>
              </div>
              <button
                type="button"
                onClick={() => navigateTo("workflows")}
                className="nr-arcade-btn bg-[#FFE135] text-stone-900 px-5 py-2 text-xs font-black"
              >
                Open Full Workflows Directory (8) →
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {PRESETS.map((preset, idx) => {
                const colors = [
                  { border: "border-[#EAB308]", bg: "bg-[#FEFCE8]", badge: "bg-[#FFE135] text-stone-900", tag: "Banana Yellow" },
                  { border: "border-[#8B5CF6]", bg: "bg-[#FAF5FF]", badge: "bg-[#A78BFA] text-white", tag: "Vivid Purple" },
                  { border: "border-[#10B981]", bg: "bg-[#ECFDF5]", badge: "bg-[#34D399] text-stone-900", tag: "Mint Emerald" },
                  { border: "border-[#06B6D4]", bg: "bg-[#F0FDFA]", badge: "bg-[#38BDF8] text-stone-900", tag: "Sky Cyan" },
                  { border: "border-[#F43F5E]", bg: "bg-[#FFF1F2]", badge: "bg-[#FB7185] text-white", tag: "Hot Coral" },
                  { border: "border-[#F97316]", bg: "bg-[#FFF7ED]", badge: "bg-[#FDBA74] text-stone-900", tag: "Tangerine" },
                  { border: "border-[#EF4444]", bg: "bg-[#FEF2F2]", badge: "bg-[#F87171] text-white", tag: "Crimson Red" },
                  { border: "border-[#14B8A6]", bg: "bg-[#F0FDFA]", badge: "bg-[#2DD4BF] text-stone-900", tag: "Teal Lime" },
                ][idx % 8];

                return (
                  <div
                    key={preset.id}
                    className={`rounded-2xl border-2 ${colors.border} ${colors.bg} p-4 shadow-[3px_3px_0px_#18181B] hover:shadow-[5px_5px_0px_#18181B] hover:-translate-y-1 transition-all flex flex-col justify-between`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <strong className="text-sm font-black text-stone-900">{preset.name}</strong>
                        <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-lg border border-stone-900 ${colors.badge}`}>
                          {preset.id}
                        </span>
                      </div>
                      <p className="text-xs text-stone-700 leading-relaxed line-clamp-2">{preset.objective}</p>
                    </div>
                    <div className="mt-4 pt-2.5 border-t border-stone-300 flex items-center justify-between">
                      <span className="text-[10px] text-stone-500 font-bold uppercase">{preset.blurb}</span>
                      <button
                        type="button"
                        onClick={() => handleOpenInStudio(preset.id)}
                        className="text-xs font-black text-amber-700 hover:text-amber-900 hover:underline flex items-center gap-1"
                      >
                        <span>Tune DAG</span>
                        <span>→</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* The Specialist Minds Preview */}
          <section>
            <MindGrid
              activeMind={activeMind}
              onSelect={mind => {
                setSelectedId(mind === "extractor" ? "extract" : mind === "gatekeeper" ? "gate" : mind === "settlement" ? "settle" : "scout");
                navigateTo("studio");
              }}
            />
          </section>

          {/* Featured Arena Competition Preview */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="nr-eyebrow">Live Simulation</span>
                <h3 className="nr-display text-2xl text-ink">The Arena Competition</h3>
                <p className="text-xs text-stone-600">Solo Bot (OpenAI) vs Specialist Relay Squad (Gemini)</p>
              </div>
              <button
                type="button"
                onClick={() => navigateTo("arena")}
                className="rounded-full bg-ink px-4 py-2 text-xs font-bold text-white shadow-sm"
              >
                Expand Arena to Full View →
              </button>
            </div>
            <ArenaViewport challengeId={arenaId} challenge={customChallenge ?? undefined} playing={playing} />
          </section>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PAGE 2: ALL 8 WORKFLOWS (Comprehensive Directory)                        */}
      {/* ========================================================================= */}
      {page === "workflows" && (
        <div className="space-y-6 animate-fadeIn">
          <WorkflowsCatalog
            onOpenInStudio={handleOpenInStudio}
            onOpenInBrowser={handleOpenInBrowser}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* PAGE 3: SQUAD STUDIO (DAG & Node Editor)                                 */}
      {/* ========================================================================= */}
      {page === "studio" && (
        <div className="space-y-6 animate-fadeIn">
          <div className="nr-card bg-gradient-to-r from-[#fff3dc] to-[#e5f5ef] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="nr-eyebrow">Visual DAG Studio</span>
                <h2 className="nr-display text-2xl sm:text-3xl text-ink">Assemble & Tune Your Specialist Squad</h2>
                <p className="mt-1 text-xs text-stone-600 max-w-xl">
                  Pick any of the 8 original enterprise objectives or write a custom goal. Edit prompts, pruning budgets, score thresholds, and REST dispatch specs in real time.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigateTo("workflows")}
                className="rounded-full border border-stone-300 bg-white px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50"
              >
                ← Back to All 8 Workflows
              </button>
            </div>
          </div>

          {/* Presets Bar */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-stone-600">Select Workflow to Tune:</span>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onPreset(preset.id)}
                  className={"rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors " + (presetId === preset.id ? "bg-ink text-white shadow-sm" : "bg-white border border-stone-200 text-stone-700 hover:bg-stone-50")}
                >
                  {preset.name} ({preset.id})
                </button>
              ))}
            </div>
          </div>

          {/* Objective Editor */}
          <div className="space-y-2">
            <label htmlFor="objective" className="text-xs font-bold text-stone-800">
              Workflow Objective Prompt
            </label>
            <textarea
              id="objective"
              value={objective}
              maxLength={2000}
              onChange={event => setObjective(event.target.value)}
              className="min-h-24 w-full rounded-2xl border border-stone-200 bg-white p-3.5 text-sm focus:border-amber-600 focus:outline-none shadow-inner"
            />
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onSynthesize}
                  className="rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-semibold hover:bg-stone-50"
                >
                  Synthesize DAG
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void dryRun()}
                  className="rounded-full bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-40"
                >
                  {busy ? "Running…" : "Simulate Workflow"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runLive()}
                  className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-stone-800 disabled:opacity-40"
                >
                  {busy ? "Calling Providers…" : "Run Live Workflow"}
                </button>
              </div>
              <span className="text-xs font-mono font-semibold text-stone-500">
                Detected Intent: <span className="text-amber-800 font-bold">{dag.intent}</span>
              </span>
            </div>
          </div>

          {/* Provider Status & Dispatch Checkbox */}
          <div className="nr-card flex flex-wrap items-center justify-between gap-3 p-3.5 text-xs bg-stone-50/70 border border-stone-200">
            <span>
              {liveStatus
                ? `Live Status · Gemini ${liveStatus.gemini ? "✓ Ready" : "Unset"} · OpenAI ${liveStatus.openai ? "✓ Ready" : "Optional"} · Firebase ${liveStatus.firebase ? "✓ Active" : "Optional"} · ${liveStatus.destinations.includes(dag.intent) ? `Destination for ${dag.intent} Ready` : "Destination Unset"}`
                : "Live server unavailable"}
            </span>
            <label className="flex items-center gap-2 font-semibold text-stone-700 cursor-pointer">
              <input
                type="checkbox"
                checked={dispatchLive}
                onChange={event => setDispatchLive(event.target.checked)}
                className="rounded border-stone-300 text-ink focus:ring-ink"
              />
              Send to configured REST destination if evidence gate passes
            </label>
          </div>

          {/* Interactive Visual Canvas & Node Inspector */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <PipelineCanvas dag={dag} selectedId={selectedId} activeMind={activeMind} onSelect={setSelectedId} />
            <NodeEditor node={selectedNode} onChange={updateNode} />
          </div>

          {/* Logs */}
          {runLog && (
            <div className="nr-card p-4">
              <h3 className="nr-display text-sm font-bold text-stone-800 mb-1">Workflow Simulation Record</h3>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-stone-700 bg-stone-50 p-3 rounded-xl border border-stone-200">
                {runLog}
              </pre>
            </div>
          )}

          {liveLog && (
            <div className="nr-card p-4">
              <h3 className="nr-display text-sm font-bold text-stone-800 mb-1">Live Provider Execution Record</h3>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-stone-100 bg-[#25221e] p-3 rounded-xl">
                {liveLog}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* PAGE 4: BROWSER ARENA (Agent Competition Duel)                           */}
      {/* ========================================================================= */}
      {page === "arena" && (
        <div className="space-y-6 animate-fadeIn">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="nr-eyebrow">Rival Architecture Duel</span>
              <h2 className="nr-display text-3xl text-ink">Browser Agent Arena</h2>
              <p className="text-xs text-stone-600 mt-1">
                Monolithic Solo Bot (OpenAI) vs 4-Stage Specialist Relay (Gemini) navigating traps, noise, and decoys.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigateTo("challenge")}
              className="rounded-full border border-stone-300 bg-white px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50"
            >
              + Build New Challenge
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-stone-500 mr-1">Select Challenge:</span>
            {ARENA_CHALLENGES.map(challenge => (
              <button
                key={challenge.id}
                type="button"
                onClick={() => setArenaId(challenge.id)}
                className={"rounded-full border px-3 py-1 text-xs font-semibold transition-colors " + (arenaId === challenge.id ? "bg-ink text-white border-ink shadow-sm" : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50")}
              >
                {challenge.name}
              </button>
            ))}
            {customChallenge && (
              <button
                type="button"
                onClick={() => setArenaId("custom")}
                className={"rounded-full border border-amber-400 px-3 py-1 text-xs font-semibold " + (arenaId === "custom" ? "bg-ink text-white" : "bg-amber-50 text-amber-900")}
              >
                ★ {customChallenge.name} (Custom)
              </button>
            )}
          </div>

          <ArenaViewport
            challengeId={arenaId}
            challenge={arenaId === "custom" ? customChallenge ?? undefined : undefined}
            playing={playing}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* PAGE 5: CHALLENGE STUDIO (Mission Designer)                              */}
      {/* ========================================================================= */}
      {page === "challenge" && (
        <div className="space-y-6 animate-fadeIn">
          <ChallengeStudio
            onLaunch={challenge => {
              setCustomChallenge(challenge);
              setArenaId("custom");
              navigateTo("arena");
            }}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* PAGE 6: BROWSER SCENES (Simulated DOM Research Viewport)                 */}
      {/* ========================================================================= */}
      {page === "browser" && (
        <div className="space-y-6 animate-fadeIn">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="nr-eyebrow">DOM Research Scenarios</span>
              <h2 className="nr-display text-3xl text-ink">Browser Simulation Scenes</h2>
              <p className="text-xs text-stone-600 mt-1">
                Explore real DOM elements, noise nodes, and extracted evidence across all 8 specialized workflows.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigateTo("workflows")}
              className="rounded-full border border-stone-300 bg-white px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50"
            >
              View Workflows Catalog →
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-stone-500 mr-1">Workflow Scene:</span>
            {PRESETS.map(preset => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setBrowserId(preset.id)}
                className={"rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors " + (browserId === preset.id ? "bg-ink text-white shadow-sm" : "bg-white border border-stone-200 text-stone-700 hover:bg-stone-50")}
              >
                {preset.name}
              </button>
            ))}
          </div>

          <BrowserSimulationViewport challengeId={browserId} running={playing} />
        </div>
      )}

      {/* ========================================================================= */}
      {/* PAGE 7: SPECIALIST CAST (Minds Showcase)                                  */}
      {/* ========================================================================= */}
      {page === "cast" && (
        <div className="space-y-8 animate-fadeIn">
          <div className="nr-card p-6 bg-gradient-to-r from-[#faf6ed] to-[#f4f7f5]">
            <span className="nr-eyebrow">The Specialist Squad</span>
            <h2 className="nr-display text-3xl sm:text-4xl text-ink">The Four Minds of NexusRelay</h2>
            <p className="mt-2 text-sm text-stone-600 max-w-2xl leading-relaxed">
              Monolithic bots crumble as context grows and hallucinations mount. NexusRelay partitions cognitive labour into four strict specialists, keeping token footprints lean and evidence verified.
            </p>
          </div>

          <MindGrid
            activeMind={activeMind}
            onSelect={mind => {
              setSelectedId(mind === "extractor" ? "extract" : mind === "gatekeeper" ? "gate" : mind === "settlement" ? "settle" : "scout");
              navigateTo("studio");
            }}
          />

          {/* Architecture Deep Dive */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="nr-card p-5 border-l-4 border-l-rose-500 bg-white">
              <h3 className="nr-display text-lg text-rose-900 font-bold mb-2">The Monolithic Failure Pattern</h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                A single prompt accumulates entire raw HTML payloads, navigation histories, and conflicting instructions.
                Token counts swell past 12,000 per turn, leading to context drift, trap loops, and hallucinations.
              </p>
              <ul className="mt-3 space-y-1.5 text-xs text-stone-700">
                <li>• Unfiltered noise pollution (cookie bars, ads, menus)</li>
                <li>• No boundary between exploration and extraction</li>
                <li>• Self-evaluates its own findings (no independent gatekeeper)</li>
              </ul>
            </div>

            <div className="nr-card p-5 border-l-4 border-l-emerald-500 bg-white">
              <h3 className="nr-display text-lg text-emerald-900 font-bold mb-2">The Specialist Relay Pattern</h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                Cognition is partitioned into discrete stages. Each mind receives only the pruned evidence it needs to perform its task, settling with 100% deterministic type safety.
              </p>
              <ul className="mt-3 space-y-1.5 text-xs text-stone-700">
                <li>• <strong>Scout</strong>: Prunes 80%+ of noise tokens before handoff</li>
                <li>• <strong>Extractor</strong>: Compiles into typed JSON schema</li>
                <li>• <strong>Gatekeeper</strong>: Scores source evidence before settlement</li>
                <li>• <strong>Settlement</strong>: Guaranteed idempotent REST dispatch</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PAGE 8: EVALUATION & BENCHMARKS (Eval Harness)                            */}
      {/* ========================================================================= */}
      {page === "bench" && (
        <div className="space-y-6 animate-fadeIn">
          <div className="nr-card p-6 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <span className="nr-eyebrow">Rigorous Benchmarks</span>
                <h2 className="nr-display text-2xl sm:text-3xl text-ink">Monte Carlo Evaluation Harness</h2>
                <p className="text-xs text-stone-600 mt-1">
                  Run multi-trial empirical tests comparing monolithic context bots vs specialist relays across failure rate, token drift, and mean-time-to-failure (MTTF).
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="scenario-select" className="text-xs font-semibold text-stone-700">
                Scenario:
              </label>
              <select
                id="scenario-select"
                aria-label="Benchmark scenario"
                value={benchId}
                onChange={event => setBenchId(event.target.value)}
                className="rounded-full border border-stone-200 bg-white px-3.5 py-1.5 text-xs font-semibold focus:outline-none"
              >
                {EXTENDED_CHALLENGES.map(challenge => (
                  <option key={challenge.id} value={challenge.id}>{challenge.name}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy}
                onClick={() => void benchmark()}
                className="rounded-full bg-amber-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-700 disabled:opacity-40 transition-colors"
              >
                {busy ? "Running Trials…" : "▶ Run 10-Trial Duel"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void verify()}
                className="rounded-full bg-ink px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-stone-800 disabled:opacity-40 transition-colors"
              >
                {busy ? "Verifying…" : "✓ Verify All 8 DAGs"}
              </button>
            </div>

            {report && (
              <div className="mt-6 overflow-x-auto rounded-2xl border border-stone-200">
                <table className="w-full text-left text-xs bg-white">
                  <thead className="bg-stone-50 border-b border-stone-200 text-stone-700 uppercase font-bold text-[10px]">
                    <tr>
                      <th className="p-3">Architecture</th>
                      <th className="p-3">Success Rate</th>
                      <th className="p-3">Mean Input Tokens</th>
                      <th className="p-3">Cost per Success</th>
                      <th className="p-3">Mean Time to Failure (MTTF)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {[report.monolith, report.relay].map(lane => (
                      <tr key={lane.architecture} className={lane.architecture === "relay" ? "bg-emerald-50/40" : ""}>
                        <td className="p-3 font-semibold capitalize flex items-center gap-2">
                          <span className={"h-2 w-2 rounded-full " + (lane.architecture === "relay" ? "bg-emerald-600" : "bg-rose-500")} />
                          {lane.architecture}
                        </td>
                        <td className="p-3 font-bold text-stone-900">{(lane.successRate * 100).toFixed(0)}%</td>
                        <td className="p-3 font-mono">{lane.meanInputTokens.toFixed(0)} tokens</td>
                        <td className="p-3 font-mono">{lane.costPerSuccessfulExecution == null ? "n/a" : `$${lane.costPerSuccessfulExecution.toFixed(4)}`}</td>
                        <td className="p-3 font-mono">{lane.mttfMs == null ? "n/a" : `${lane.mttfMs.toFixed(0)} ms`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {verification && (
              <div className="mt-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">8 DAGs Verification Output</span>
                <pre className="mt-1.5 max-h-60 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-stone-800 bg-stone-50 p-3 rounded-xl border border-stone-200">
                  {verification}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PAGE 9: EXPORT & RUNNER WORKBENCH                                         */}
      {/* ========================================================================= */}
      {page === "export" && (
        <div className="space-y-6 animate-fadeIn">
          <div className="nr-kit-box">
            <div className="nr-kit-lid">
              <span>✦ N/R · BUILD YOUR OWN SERIES</span>
              <span>STARTER KIT / 001</span>
            </div>
            <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.15fr_1fr] lg:items-center">
              <div>
                <p className="nr-eyebrow">Ready for the Workbench</p>
                <h2 className="nr-display text-4xl sm:text-5xl text-ink">Package Your Squad.</h2>
                <p className="mt-3 max-w-lg text-sm leading-relaxed text-stone-600">
                  Download your tuned squad with a runnable live research, extraction, Jev gate, and REST dispatch runner.
                  The package includes full mission files, configuration, and Playwright browser integration.
                </p>
                <div className="mt-5 flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void downloadStarter()}
                    className="rounded-full bg-ink px-6 py-3 text-xs font-bold text-white shadow-luxury hover:bg-stone-800 disabled:opacity-40 transition-colors"
                  >
                    {busy ? "Packing…" : "Unbox Runner (.ZIP) ↗"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void download()}
                    className="rounded-full border border-stone-400 bg-white px-5 py-3 text-xs font-bold text-stone-800 hover:bg-stone-50 disabled:opacity-40 transition-colors"
                  >
                    Full Source ZIP
                  </button>
                </div>
                <p className="mt-3 text-[11px] text-stone-500">
                  Runs locally with Node.js and Playwright. Set GEMINI_API_KEY (and optionally OPENAI_API_KEY) in your shell.
                </p>
              </div>

              <div className="nr-kit-tray">
                <span className="nr-kit-tray-label">INSIDE THE BOX · FOUR SPECIALISTS</span>
                <div className="grid grid-cols-2 gap-2">
                  {dag.nodes.map((node, index) => (
                    <div key={node.id} className="nr-kit-mini">
                      <span>0{index + 1}</span>
                      <strong>{node.mind}</strong>
                      <small>{node.title}</small>
                    </div>
                  ))}
                </div>
                <div className="nr-kit-ticket">
                  ✦ MISSION CARD <strong>{customChallenge?.name ?? "Price maze"}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Export Code Viewer */}
          <div className="nr-card p-5 bg-white">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="nr-display text-xl text-ink">Inspect Kit Code</h3>
                <p className="text-xs text-stone-500">Select any file to preview its runnable contents before downloading.</p>
              </div>
              <select
                aria-label="Exported file"
                value={exportFile}
                onChange={event => setExportFile(event.target.value)}
                className="rounded-full border border-stone-200 bg-white px-4 py-1.5 text-xs font-semibold focus:outline-none"
              >
                {Object.keys(files).map(file => (
                  <option key={file} value={file}>{file}</option>
                ))}
              </select>
            </div>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-2xl bg-[#25221e] p-4 font-mono text-[10px] text-stone-100">
              {files[exportFile]}
            </pre>
          </div>
        </div>
      )}

      {/* Editorial Footer */}
      <footer className="mt-16 border-t border-stone-200/80 pt-8 pb-12 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-500">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-stone-800">NexusRelay Arena</span>
          <span aria-hidden="true">·</span>
          <span>Tactile Specialist Agent Studio & Browser Arena</span>
        </div>
        <div className="flex items-center gap-4 text-stone-500">
          <button type="button" onClick={() => navigateTo("workflows")} className="hover:text-stone-900 transition-colors">8 Workflows</button>
          <span aria-hidden="true">·</span>
          <button type="button" onClick={() => navigateTo("arena")} className="hover:text-stone-900 transition-colors">Browser Duel</button>
          <span aria-hidden="true">·</span>
          <button type="button" onClick={() => navigateTo("cast")} className="hover:text-stone-900 transition-colors">Specialist Cast</button>
          <span aria-hidden="true">·</span>
          <button type="button" onClick={() => navigateTo("bench")} className="hover:text-stone-900 transition-colors">Eval Harness</button>
        </div>
      </footer>
    </div>
  );
}
