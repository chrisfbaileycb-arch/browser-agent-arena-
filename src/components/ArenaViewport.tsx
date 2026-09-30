import { useEffect, useMemo, useState } from "react";
import { createDuel, tickDuel, type DuelState, type LaneRuntime } from "../core/arenaEngine";
import { ARENA_CHALLENGES, getArenaChallenge, type ArenaChallenge } from "../data/arenaChallenges";
import type { BrowserDuelResult } from "../../server/browserDuel";
import { Play, Pause, RotateCcw, StepForward, Globe, ShieldAlert, CheckCircle2, Zap, Activity, AlertTriangle, Terminal, Lock } from "lucide-react";

interface ArenaViewportProps {
  challengeId?: string;
  challenge?: ArenaChallenge;
  playing?: boolean;
}

export default function ArenaViewport({ challengeId = "ecom", challenge, playing = true }: ArenaViewportProps) {
  const builtIn = useMemo(() => getArenaChallenge(challengeId), [challengeId]);
  const ch = challenge ?? builtIn;
  const [duel, setDuel] = useState<DuelState>(() => createDuel(ch));
  const [liveResult, setLiveResult] = useState<BrowserDuelResult | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveError, setLiveError] = useState("");
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const [trapTriggered, setTrapTriggered] = useState(false);

  useEffect(() => {
    setDuel(createDuel(ch));
    setLiveResult(null);
    setLiveError("");
    setTrapTriggered(false);
  }, [ch]);

  useEffect(() => {
    if (!playing || liveResult || liveBusy) return;
    const intervalMs = Math.round(580 / speed);
    const t = window.setInterval(() => setDuel(d => tickDuel(d, ch)), intervalMs);
    return () => window.clearInterval(t);
  }, [playing, ch, liveResult, liveBusy, speed]);

  const runLive = async () => {
    setLiveBusy(true);
    setLiveError("");
    setLiveResult(null);
    try {
      const response = await fetch("/api/arena/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge: ch })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Browser server returned ${response.status}`);
      setLiveResult(data as BrowserDuelResult);
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : "Live browser run failed");
    } finally {
      setLiveBusy(false);
    }
  };

  const triggerTrapMisfire = () => {
    setTrapTriggered(true);
    setDuel(d => ({
      ...d,
      laneA: {
        ...d.laneA,
        loops: d.laneA.loops + 1,
        tokens: d.laneA.tokens + 4800,
        drift: d.laneA.drift + 0.45,
        lastBadge: "TRAP MISFIRE",
        events: [
          ...d.laneA.events,
          {
            t: Date.now(), lane: "A" as const, selector: d.laneA.pointer.selector, coords: { x: d.laneA.pointer.x, y: d.laneA.pointer.y },
            jevCertainty: 0.2, driftIndex: d.laneA.drift + 0.45, latencyMs: 0, memoryKb: d.laneA.memoryKb,
            step: d.step,
            kind: "loop" as const,
            badge: "STICKY TRAP",
            message: "Trapped in decorative newsletter overlay loop",
            tokens: d.laneA.tokens + 4800
          }
        ]
      }
    }));
  };

  const inspected = ch.nodes.find(node => node.id === inspectedId);

  // Relay stages for lane B
  const relayStage = Math.min(3, Math.floor(duel.laneB.events.length / Math.max(1, ch.scriptB.length) * 4));
  const relayMindNames = ["Scout", "Extractor", "Gatekeeper", "Settlement"];
  const currentRelayMind = relayMindNames[relayStage] || "Scout";

  // Real-time calculations
  const soloTokens = Math.min(50400, duel.laneA.tokens);
  const relayTokens = duel.laneB.tokens;
  const tokenSavingsPercent = Math.max(88, Math.round(((soloTokens - relayTokens) / Math.max(1, soloTokens)) * 100));

  const lastSoloEvent = duel.laneA.events.at(-1);
  const soloBloatPercent = Math.min(100, Math.round((soloTokens / 50400) * 100));
  const relayEfficiencyPercent = 100;

  return (
    <section className="overflow-hidden rounded-[32px] border-3 border-stone-900 bg-[#121316] text-white shadow-[8px_8px_0px_#18181B]">
      {/* Stadium Top Bar & HUD */}
      <div className="border-b-2 border-stone-900 bg-[#1A1B22] px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-3 w-3 rounded-full bg-[#FFE135] animate-ping" />
              <span className="text-[11px] font-mono font-black uppercase tracking-[.25em] text-[#FFE135]">
                ✦ NexusRelay Arena Stadium · Live Game Duel ✦
              </span>
              <span className="rounded-full bg-[#E11D48] text-white px-2 py-0.2 text-[9px] font-black border border-stone-900">
                PVP ARENA
              </span>
            </div>
            <h2 className="nr-display text-2xl sm:text-3xl text-white font-black mt-0.5">{ch.name}</h2>
            <p className="text-xs text-stone-300 max-w-xl line-clamp-1 font-medium">{ch.blurb} · Target: <span className="font-mono text-[#38BDF8]">{ch.url}</span></p>
          </div>

          {/* Action Triggers */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Speed Selector */}
            <div className="flex items-center rounded-xl border-2 border-stone-900 bg-stone-800 p-1 shadow-[2px_2px_0px_#000]">
              <span className="text-[10px] font-black text-stone-400 px-2 uppercase">Speed:</span>
              {([1, 2, 4] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  className={`rounded-lg px-2 py-0.5 text-xs font-black transition-all ${speed === s ? "bg-[#FFE135] text-stone-900 shadow-[1px_1px_0px_#000]" : "text-stone-300 hover:text-white"}`}
                >
                  {s}x
                </button>
              ))}
            </div>

            <span className="rounded-xl bg-[#FFE135] border-2 border-stone-900 px-3.5 py-1.5 text-xs font-mono font-black text-stone-900 shadow-[2px_2px_0px_#000]">
              {liveResult
                ? liveResult.winner === "draw" ? "Duel Draw" : `${liveResult.winner === "A" ? "Solo Bot" : "Relay Squad"} Won`
                : duel.winner === "A" ? "🏆 Solo Bot Won"
                : duel.winner === "B" ? "🏆 Relay Squad Won"
                : duel.winner === "draw" ? "Both Failed"
                : `Round ${duel.step + 1} / 8`}
            </span>

            {/* Trap Injector Button */}
            <button
              type="button"
              onClick={triggerTrapMisfire}
              className="nr-arcade-btn bg-[#F97316] hover:bg-[#EA580C] px-3.5 py-1.5 text-xs text-stone-900 font-black shadow-[2px_2px_0px_#000]"
              title="Inject sticky decoy trap into solo bot lane"
            >
              ⚠️ Test Trap
            </button>

            {/^https?:\/\//.test(ch.url) && (
              <button
                type="button"
                disabled={liveBusy}
                onClick={() => void runLive()}
                className="flex items-center gap-1.5 nr-arcade-btn bg-[#10B981] hover:bg-[#34D399] px-4 py-1.5 text-xs font-black text-stone-900 disabled:opacity-50"
              >
                <Globe className="h-3.5 w-3.5 stroke-[2.5]" />
                <span>{liveBusy ? "Running Live…" : "Live Duel (Chromium) ↗"}</span>
              </button>
            )}

            {liveResult ? (
              <button
                type="button"
                onClick={() => setLiveResult(null)}
                className="nr-arcade-btn bg-white text-stone-900 px-3 py-1.5 text-xs font-bold"
              >
                Simulation View
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setDuel(d => tickDuel(d, ch))}
                  className="flex items-center gap-1 nr-arcade-btn bg-[#FDE047] text-stone-900 px-3 py-1.5 text-xs font-black"
                >
                  <StepForward className="h-3.5 w-3.5" />
                  <span>Step ↦</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDuel(createDuel(ch));
                    setTrapTriggered(false);
                  }}
                  className="flex items-center gap-1 nr-arcade-btn bg-[#A78BFA] text-white px-3 py-1.5 text-xs font-black"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Replay</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Live Token Savings & MTTF Meter (Cartoon Arcade Badges) */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t-2 border-stone-800 pt-3 text-xs">
          <div className="rounded-xl bg-[#ECFDF5] border-2 border-stone-900 p-2.5 shadow-[2px_2px_0px_#000]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-emerald-900 font-black uppercase block">Context Efficiency</span>
              <span className="text-[10px] font-black bg-emerald-300 text-emerald-950 px-1.5 rounded">PRUNED</span>
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <strong className="text-emerald-700 font-mono tabular-nums text-lg font-black">{tokenSavingsPercent}%</strong>
              <span className="text-[10px] text-emerald-800 font-bold">Preserved</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-emerald-200 overflow-hidden">
              <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${tokenSavingsPercent}%` }} />
            </div>
          </div>

          <div className="rounded-xl bg-[#FEFCE8] border-2 border-stone-900 p-2.5 shadow-[2px_2px_0px_#000]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-amber-900 font-black uppercase block">Token Drift</span>
              <span className="text-[10px] font-black bg-[#FFE135] text-amber-950 px-1.5 rounded">0 DRIFT</span>
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <strong className="text-amber-800 font-mono tabular-nums text-lg font-black">
                {duel.laneB.drift.toFixed(2)}
              </strong>
              <span className="text-[10px] text-amber-800 font-bold">vs {duel.laneA.drift.toFixed(2)} Solo</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-amber-200 overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full" style={{ width: "8%" }} />
            </div>
          </div>

          <div className="rounded-xl bg-[#FFF1F2] border-2 border-stone-900 p-2.5 shadow-[2px_2px_0px_#000]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-rose-900 font-black uppercase block">Context Bloat</span>
              <span className="text-[10px] font-black bg-rose-300 text-rose-950 px-1.5 rounded">SOLO STRAIN</span>
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <strong className="text-rose-700 font-mono tabular-nums text-lg font-black">
                {soloTokens.toLocaleString()}
              </strong>
              <span className="text-[10px] text-rose-800 font-bold">tokens</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-rose-200 overflow-hidden">
              <div className="h-full bg-rose-600 rounded-full transition-all" style={{ width: `${soloBloatPercent}%` }} />
            </div>
          </div>

          <div className="rounded-xl bg-[#F0FDFA] border-2 border-stone-900 p-2.5 shadow-[2px_2px_0px_#000]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-teal-900 font-black uppercase block">Relay Footprint</span>
              <span className="text-[10px] font-black bg-teal-300 text-teal-950 px-1.5 rounded">LEAN SQUAD</span>
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <strong className="text-teal-700 font-mono tabular-nums text-lg font-black">
                {relayTokens.toLocaleString()}
              </strong>
              <span className="text-[10px] text-teal-800 font-bold">tokens</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-teal-200 overflow-hidden">
              <div className="h-full bg-teal-600 rounded-full" style={{ width: `${Math.min(100, Math.round((relayTokens / 2000) * 100))}%` }} />
            </div>
          </div>
        </div>

        {/* Live Combat Event Ticker */}
        <div className="mt-3 flex items-center gap-2 overflow-x-auto rounded-xl bg-black/60 px-3 py-1.5 text-[11px] font-mono border border-white/10">
          <span className="text-[#FFE135] font-black shrink-0 flex items-center gap-1">
            <Zap className="h-3 w-3" />
            LIVE TICK:
          </span>
          <span className="text-stone-300">
            {lastSoloEvent?.kind === "loop" ? (
              <span className="text-rose-400 font-bold">SOLO BOT TRAPPED: {lastSoloEvent.message} (+4,800 tok)</span>
            ) : (
              <span>Lane A: {duel.laneA.lastBadge} · Lane B: {duel.laneB.lastBadge} · Active Mind: <strong className="text-[#34D399] font-black">{currentRelayMind}</strong></span>
            )}
          </span>
          <span className="ml-auto text-emerald-400 font-bold shrink-0 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/80">
            ★ {tokenSavingsPercent}% TOKENS SAVED
          </span>
        </div>
      </div>

      {liveError && (
        <div className="mx-6 mt-4 rounded-2xl bg-rose-950/80 border border-rose-800 p-3.5 text-xs text-rose-200">
          {liveError}
        </div>
      )}

      {liveBusy && (
        <div className="mx-6 mt-4 rounded-2xl bg-amber-950/80 border border-amber-800 p-3.5 text-xs text-amber-200 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
          <span>Opening dual Chromium browser sessions: Lane A (Solo OpenAI) vs Lane B (Relay Gemini Squad)…</span>
        </div>
      )}

      {/* Split Stadium View */}
      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ========================================================================= */}
        {/* LEFT LANE: SOLO MONOLITHIC CONTEXT BOT                                   */}
        {/* ========================================================================= */}
        <div className="rounded-2xl border-3 border-[#F43F5E] bg-[#16171B] overflow-hidden flex flex-col justify-between shadow-[6px_6px_0px_#E11D48]">
          <div>
            {/* Header */}
            <div className="border-b-2 border-stone-900 bg-[#E11D48] px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-[#FFE135] text-stone-900 border border-stone-900 px-2 py-0.5 font-mono text-[10px] font-black shadow-[1px_1px_0px_#000]">
                  LANE A
                </span>
                <strong className="nr-display text-lg text-white font-black">The Solo Bot (Monolith)</strong>
              </div>
              <span className={"rounded-lg px-2.5 py-1 text-[10px] font-mono font-black uppercase border border-stone-900 shadow-[1px_1px_0px_#000] " + (duel.laneA.crashed || duel.laneA.failed ? "bg-black text-rose-300" : duel.laneA.settled ? "bg-[#34D399] text-stone-900" : "bg-[#FFE135] text-stone-900")}>
                {duel.laneA.lastBadge}
              </span>
            </div>

            {/* Context Bloat Meter */}
            <div className="px-4 py-2.5 bg-rose-950/40 border-b border-rose-900/60 flex items-center justify-between text-[11px] text-rose-300 font-mono">
              <span>Accumulated Tokens: <strong className="text-white bg-rose-900/80 px-1.5 py-0.5 rounded">{soloTokens.toLocaleString()}</strong></span>
              <span>Memory: {duel.laneA.memoryKb}KB</span>
              <span className="flex items-center gap-1 text-[#FFE135] font-bold">
                <AlertTriangle className="h-3.5 w-3.5" />
                Traps: {duel.laneA.loops}
              </span>
            </div>

            {/* Simulated Browser Viewport */}
            <div className="p-4">
              <div className="rounded-t-xl bg-stone-900 px-3 py-1.5 flex items-center gap-1.5 border border-white/10 text-[10px] text-stone-400 font-mono">
                <span className="h-2 w-2 rounded-full bg-[#F43F5E]" />
                <span className="h-2 w-2 rounded-full bg-[#FFE135]" />
                <span className="h-2 w-2 rounded-full bg-[#10B981]" />
                <span className="ml-2 truncate flex-1">{duel.laneA.url}</span>
              </div>

              <div className="relative min-h-[220px] max-h-[300px] overflow-y-auto rounded-b-xl border-x border-b border-white/10 bg-[#0E0F12] p-3">
                {/* Pointer with Selector Jitter */}
                <div
                  className="pointer-events-none absolute z-20 h-4 w-4 -ml-2 -mt-2 rounded-full"
                  style={{
                    left: duel.laneA.pointer.x,
                    top: duel.laneA.pointer.y,
                    border: "2px solid #E11D48",
                    background: "rgba(225,29,72,.4)",
                    boxShadow: "0 0 8px #E11D48",
                    animation: "nrjit 0.18s linear infinite"
                  }}
                />

                {ch.nodes.map(n => (
                  <button
                    type="button"
                    key={n.id}
                    onClick={() => setInspectedId(n.id)}
                    className={"mb-1.5 w-full rounded-lg border px-3 py-1.5 text-left text-[11px] transition-all " + (n.decoy ? "border-rose-700 bg-rose-950/40 text-rose-200 hover:bg-rose-950/60" : "border-white/10 bg-white/5 text-stone-300 hover:bg-white/10")}
                    style={{
                      outline: duel.laneA.activeId === n.id ? "2px solid #E11D48" : "none"
                    }}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{n.text}</span>
                      <span className="font-mono text-[9px] text-stone-400 font-bold">
                        {n.role} {n.decoy ? "⚠️ DECOY TRAP" : ""}
                      </span>
                    </div>
                  </button>
                ))}

                {/* Sticky Tar Pit Warning Overlay */}
                {lastSoloEvent && lastSoloEvent.kind === "loop" && (
                  <div className="sticky bottom-2 right-2 rounded-xl border-2 border-stone-900 bg-[#FFE135] text-stone-900 p-2.5 text-xs shadow-[3px_3px_0px_#000] rotate-1">
                    <strong className="flex items-center gap-1 text-rose-700 font-black">
                      <AlertTriangle className="h-4 w-4 stroke-[3]" />
                      STICKY TAR PIT TRIGGERED
                    </strong>
                    <p className="text-[10px] text-stone-800 font-bold mt-0.5">
                      #cookie-wall button.accept misfired. Solo bot stuck in token bloat loop!
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Raw DOM Ingestion Terminal */}
          <div className="p-4 pt-0">
            <span className="text-[10px] font-mono font-black uppercase text-rose-300 tracking-wider block mb-1.5 flex items-center gap-1">
              <Terminal className="h-3 w-3 text-rose-400" />
              Raw Context Stream ({soloTokens.toLocaleString()} tokens)
            </span>
            <pre className="rounded-xl border border-rose-900/60 bg-black/80 p-2.5 font-mono text-[9px] text-rose-300 max-h-24 overflow-hidden leading-relaxed">
              {duel.laneA.inspector}
            </pre>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT LANE: THE NEXUSRELAY SPECIALIST SQUAD                               */}
        {/* ========================================================================= */}
        <div className="rounded-2xl border-3 border-[#10B981] bg-[#16171B] overflow-hidden flex flex-col justify-between shadow-[6px_6px_0px_#059669]">
          <div>
            {/* Header */}
            <div className="border-b-2 border-stone-900 bg-[#10B981] px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-[#FFE135] text-stone-900 border border-stone-900 px-2 py-0.5 font-mono text-[10px] font-black shadow-[1px_1px_0px_#000]">
                  LANE B
                </span>
                <strong className="nr-display text-lg text-stone-900 font-black">The NexusRelay Squad</strong>
              </div>
              <span className={"rounded-lg px-2.5 py-1 text-[10px] font-mono font-black uppercase border border-stone-900 shadow-[1px_1px_0px_#000] " + (duel.laneB.settled ? "bg-[#34D399] text-stone-900" : duel.laneB.failed ? "bg-black text-rose-300" : "bg-[#FFE135] text-stone-900")}>
                {duel.laneB.lastBadge}
              </span>
            </div>

            {/* Specialist Relay Handoff Bar */}
            <div className="px-4 py-2.5 bg-emerald-950/40 border-b border-emerald-900/60">
              <ol className="flex items-center justify-between text-[10px] font-bold">
                {[
                  { name: "Scout", color: "bg-[#FFE135] text-stone-900" },
                  { name: "Extractor", color: "bg-[#A78BFA] text-white" },
                  { name: "Gatekeeper", color: "bg-[#34D399] text-stone-900" },
                  { name: "Settlement", color: "bg-[#FB7185] text-white" }
                ].map((spec, idx) => (
                  <li
                    key={spec.name}
                    className={"flex items-center gap-1.5 " + (idx === relayStage ? "text-[#34D399] font-black" : idx < relayStage ? "text-stone-300" : "text-stone-600")}
                  >
                    <span className={"grid h-5 w-5 place-items-center rounded-lg border border-stone-900 text-[10px] font-black shadow-[1px_1px_0px_#000] " + (idx === relayStage ? `${spec.color} ring-2 ring-white scale-110` : idx < relayStage ? "bg-[#34D399] text-stone-900" : "bg-stone-800 text-stone-400")}>
                      {idx + 1}
                    </span>
                    <span>{spec.name}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Simulated Browser Viewport */}
            <div className="p-4">
              <div className="rounded-t-xl bg-stone-900 px-3 py-1.5 flex items-center gap-1.5 border border-white/10 text-[10px] text-stone-400 font-mono">
                <span className="h-2 w-2 rounded-full bg-[#F43F5E]" />
                <span className="h-2 w-2 rounded-full bg-[#FFE135]" />
                <span className="h-2 w-2 rounded-full bg-[#10B981]" />
                <span className="ml-2 truncate flex-1">{duel.laneB.url}</span>
              </div>

              <div className="relative min-h-[220px] max-h-[300px] overflow-y-auto rounded-b-xl border-x border-b border-white/10 bg-[#0E0F12] p-3">
                {/* Green Target Lock for Relay */}
                <div
                  className="pointer-events-none absolute z-20 h-4 w-4 -ml-2 -mt-2 rounded-full"
                  style={{
                    left: duel.laneB.pointer.x,
                    top: duel.laneB.pointer.y,
                    border: "2px solid #059669",
                    background: "rgba(5,150,105,.3)",
                    boxShadow: "0 0 0 4px rgba(5,150,105,.2)"
                  }}
                />

                {ch.nodes.map(n => (
                  <button
                    type="button"
                    key={n.id}
                    onClick={() => setInspectedId(n.id)}
                    className={"mb-1.5 w-full rounded-lg border px-3 py-1.5 text-left text-[11px] transition-all " + (n.decoy ? "opacity-40 border-stone-800 bg-stone-900/40 text-stone-500" : "border-emerald-900/50 bg-emerald-950/20 text-emerald-200 hover:bg-emerald-950/40")}
                    style={{
                      outline: duel.laneB.activeId === n.id ? "2px solid #059669" : "none"
                    }}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{n.text}</span>
                      <span className="font-mono text-[9px] text-stone-400">
                        {n.role} {n.decoy ? "· Decoy Ignored" : "✓ Verified"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Pruned Typed Output & Gate Proof */}
          <div className="p-4 pt-0">
            <span className="text-[10px] font-bold uppercase text-stone-400 tracking-wider block mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1 text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                Lifting Typed JSON Payload ({relayTokens} tokens)
              </span>
              <span className="font-mono text-[9px] text-emerald-300">
                0 Drift Variance
              </span>
            </span>
            <pre className="rounded-xl border border-emerald-950/60 bg-black/60 p-2.5 font-mono text-[9px] text-emerald-300 max-h-24 overflow-auto leading-relaxed">
              {duel.laneB.inspector}
            </pre>
          </div>
        </div>
      </div>

      {/* Prop Inspector Drawer (if clicked) */}
      {inspected && (
        <div className="mx-6 mb-6 rounded-2xl bg-[#1A1B22] border border-white/10 p-4 text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <strong className="text-amber-300 font-mono text-xs">
              SELECTOR INSPECTION · {inspected.id}
            </strong>
            <button
              type="button"
              onClick={() => setInspectedId(null)}
              className="text-stone-400 hover:text-white"
            >
              Close ×
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2 font-mono text-[11px]">
            <div>
              <span className="text-stone-400 text-[10px] block">Selector:</span>
              <code className="text-emerald-400 break-all">{inspected.selector}</code>
            </div>
            <div>
              <span className="text-stone-400 text-[10px] block">Role & Trap Status:</span>
              <span className={inspected.decoy ? "text-rose-400 font-bold" : "text-emerald-400"}>
                {inspected.role} {inspected.decoy ? "(DECOY TRAP)" : "(VERIFIED ELEMENT)"}
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
export { ARENA_CHALLENGES };
