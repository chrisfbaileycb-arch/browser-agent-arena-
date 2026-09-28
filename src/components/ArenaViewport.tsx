import { useEffect, useMemo, useState } from "react";
import { createDuel, tickDuel, type DuelState, type LaneRuntime } from "../core/arenaEngine";
import { ARENA_CHALLENGES, getArenaChallenge, type ArenaChallenge } from "../data/arenaChallenges";
function LaneView({ ch, lane, rt }: { ch: ArenaChallenge; lane: "A" | "B"; rt: LaneRuntime }) {
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const inspected = ch.nodes.find(node => node.id === inspectedId);
  const last = rt.events.at(-1);
  const relayStage = Math.min(3, Math.floor(rt.events.length / Math.max(1, ch.scriptB.length) * 4));
  return (
    <div className={"nr-lane-card " + (lane === "A" ? "nr-lane-solo" : "nr-lane-relay")}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <div><span className="text-[10px] font-bold uppercase tracking-[.2em] text-stone-500">Lane {lane} / {lane === "A" ? "One big context" : "Four specialist minds"}</span><strong className="nr-display block text-xl">{lane === "A" ? "The Solo Bot" : "The Relay Squad"}</strong></div>
        <span className={"rounded-full px-3 py-1 text-[10px] font-semibold " + (rt.crashed || rt.failed ? "bg-red-100 text-red-800" : rt.settled ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800")}>{rt.lastBadge}</span>
      </div>
      {lane === "A" ? <div className="nr-solo-track mx-4 mt-3 flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-[10px] font-bold"><span>◉ Generic bot</span><span>Sticky traps: {rt.loops}</span><span>Context load: {Math.min(100, Math.round(rt.tokens / 600))}%</span></div>
        : <div className="mx-4 mt-3"><ol aria-label="Visual relay handoffs" className="nr-handoff-track">{["Scout", "Extractor", "Gatekeeper", "Settlement"].map((name, index) => <li key={name} className={index === relayStage ? "nr-handoff-active" : index < relayStage ? "nr-handoff-done" : ""}><span>{index + 1}</span><b>{name}</b></li>)}</ol></div>}
      <div className="p-3.5">
        <div className="flex items-center gap-1.5 rounded-t-2xl bg-stone-100 px-2 py-2">
          <span className="h-2 w-2 rounded-full bg-rose-600" /><span className="h-2 w-2 rounded-full bg-amber-500" /><span className="h-2 w-2 rounded-full bg-emerald-600" />
          <div className="font-mono ml-1 flex-1 truncate rounded-lg border border-stone-200 bg-white px-2 py-0.5 text-[10px] text-stone-600">{rt.url}</div>
        </div>
        <div className="nr-browser-page relative min-h-[220px] max-h-[360px] overflow-y-auto rounded-b-2xl p-2">
          <div className="pointer-events-none absolute z-10 h-4 w-4 -ml-2 -mt-2 rounded-full" style={{ left: rt.pointer.x, top: rt.pointer.y, border: lane === "A" ? "2px solid #E11D48" : "2px solid #059669", background: lane === "A" ? "rgba(225,29,72,.2)" : "rgba(5,150,105,.2)", animation: lane === "A" ? "nrjit 0.22s linear infinite" : undefined, boxShadow: lane === "B" ? "0 0 0 4px rgba(5,150,105,.14)" : undefined }} />
          {ch.nodes.map(n => (
            <button type="button" key={n.id} onClick={() => setInspectedId(n.id)} aria-label={`Inspect ${n.text} selector`} className={"nr-page-element mb-1.5 w-full rounded-xl border px-2 py-1.5 text-left text-[11px] " + (n.decoy ? "nr-element-trap" : "border-stone-200 bg-white")} style={{ outline: rt.activeId === n.id ? (n.decoy ? "2px solid #E11D48" : "2px solid #059669") : "none", opacity: n.decoy && lane === "B" ? 0.55 : 1 }}>
              <span className="flex justify-between gap-2"><span>{n.text}</span><span className="font-mono text-[10px] text-stone-500">{n.role}{n.decoy ? " · trap" : ""}</span></span>
            </button>
          ))}
          {lane === "A" && last && last.kind === "loop" && <div className="nr-tar-warning">Sticky tar pit<br /><small>Decoy caught the bot</small></div>}
        </div>
        {inspected ? <div className="mt-2 rounded-2xl bg-[#25221e] p-2.5 text-[10px] text-stone-100"><div className="flex justify-between"><b>PROP INSPECTION · {inspected.id}</b><button type="button" onClick={() => setInspectedId(null)} className="text-stone-300">Close ×</button></div><p className="mt-1 font-mono break-all text-amber-200">{inspected.selector}</p><p className="mt-1 text-stone-300">{inspected.decoy ? "Decoy trap" : "Target element"} · {inspected.role}</p></div>
          : <pre className="font-mono mt-2 max-h-28 overflow-hidden whitespace-pre-wrap rounded-2xl bg-ink p-2.5 text-[9px] leading-relaxed text-stone-200">{rt.inspector}</pre>}
        <div className="mt-2 flex justify-between text-[10px] font-semibold text-stone-500"><span>{rt.tokens.toLocaleString()} tokens</span><span>drift {(rt.drift * 100).toFixed(0)}%</span><span>{rt.memoryKb}kb</span></div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-stone-200"><div className={"h-full rounded-full transition-all duration-500 " + (lane === "A" ? "bg-rose-500" : "bg-emerald-500")} style={{ width: `${Math.min(100, lane === "A" ? rt.tokens / 600 : rt.tokens / 25)}%` }} /></div>
      </div>
    </div>
  );
}
export default function ArenaViewport({ challengeId = "ecom", challenge, playing = true }: { challengeId?: string; challenge?: ArenaChallenge; playing?: boolean }) {
  const builtIn = useMemo(() => getArenaChallenge(challengeId), [challengeId]);
  const ch = challenge ?? builtIn;
  const [duel, setDuel] = useState<DuelState>(() => createDuel(ch));
  useEffect(() => { setDuel(createDuel(ch)); }, [ch]);
  useEffect(() => { if (!playing) return; const t = window.setInterval(() => setDuel(d => tickDuel(d, ch)), 520); return () => window.clearInterval(t); }, [playing, ch]);
  return (
    <section className="nr-battle-mat">
      <div className="relative z-10 mb-5 flex flex-wrap items-center justify-between gap-3">
        <div><span className="nr-eyebrow">NexusRelay / Arena play-set</span><h2 className="nr-display text-2xl sm:text-3xl">{ch.name}</h2><p className="text-xs text-stone-600">{ch.blurb} · simulated browser duel</p></div>
        <div className="flex items-center gap-2">
          <span role="status" className="rounded-full bg-ink px-4 py-2 text-[11px] font-bold text-white">{duel.winner === "A" ? "Solo wins" : duel.winner === "B" ? "Relay wins" : duel.winner === "draw" ? "Both routes failed" : `Round ${duel.step + 1}`}</span>
          <button type="button" onClick={() => setDuel(d => tickDuel(d, ch))} className="rounded-full border border-stone-300 bg-white px-4 py-2 text-[11px] font-bold">Step ↦</button>
          <button type="button" onClick={() => setDuel(createDuel(ch))} className="rounded-full border border-stone-300 bg-white px-4 py-2 text-[11px] font-bold">↺ Replay</button>
        </div>
      </div>
      <div className="relative z-10 grid grid-cols-1 gap-4 md:grid-cols-2">
        <LaneView ch={ch} lane="A" rt={duel.laneA} />
        <LaneView ch={ch} lane="B" rt={duel.laneB} />
      </div>
      <div className="nr-card relative z-10 mt-4 p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><strong className="nr-display text-lg">The round, step by step</strong><span className="text-[10px] text-stone-500">Scripted handoff cues · no live model calls</span></div>
        <ol className="grid max-h-40 gap-1 overflow-y-auto text-[11px] md:grid-cols-2">
          {[...duel.laneA.events, ...duel.laneB.events].sort((a, b) => a.step - b.step || a.lane.localeCompare(b.lane)).map((event, index) => <li key={`${event.lane}-${index}`} className="rounded-lg bg-sand px-2 py-1"><b>{event.lane} · {event.kind}</b> <span className="text-stone-500">{event.selector} · {event.message}</span></li>)}
        </ol>
      </div>
    </section>
  );
}
export { ARENA_CHALLENGES };
