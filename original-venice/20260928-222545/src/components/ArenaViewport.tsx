import { useEffect, useMemo, useState } from "react";
import { createDuel, tickDuel, type DuelState, type LaneRuntime } from "../core/arenaEngine";
import { ARENA_CHALLENGES, getArenaChallenge, type ArenaChallenge } from "../data/arenaChallenges";
function LaneView({ ch, lane, rt }: { ch: ArenaChallenge; lane: "A" | "B"; rt: LaneRuntime }) {
  return (
    <div className="nr-card overflow-hidden p-0">
      <div className="flex items-center justify-between px-3 pt-3">
        <strong className="text-xs">{lane === "A" ? "Lane A · Solo monolithic" : "Lane B · Minds relay squad"}</strong>
        <span className={"rounded-full px-3 py-1 text-[10px] font-semibold " + (rt.crashed ? "bg-red-100 text-red-800" : lane === "B" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800")}>{rt.lastBadge}</span>
      </div>
      <div className="p-2.5">
        <div className="flex items-center gap-1.5 rounded-t-2xl bg-stone-100 px-2 py-2">
          <span className="h-2 w-2 rounded-full bg-rose-600" /><span className="h-2 w-2 rounded-full bg-amber-500" /><span className="h-2 w-2 rounded-full bg-emerald-600" />
          <div className="font-mono ml-1 flex-1 truncate rounded-lg border border-stone-200 bg-white px-2 py-0.5 text-[10px] text-stone-600">{rt.url}</div>
        </div>
        <div className="relative min-h-[210px] overflow-hidden rounded-b-2xl bg-[#fffdf8] p-2">
          <div className="absolute z-10 h-4 w-4 -ml-2 -mt-2 rounded-full" style={{ left: rt.pointer.x, top: rt.pointer.y, border: lane === "A" ? "2px solid #E11D48" : "2px solid #059669", background: lane === "A" ? "rgba(225,29,72,.2)" : "rgba(5,150,105,.2)", animation: lane === "A" ? "nrjit 0.22s linear infinite" : undefined, boxShadow: lane === "B" ? "0 0 0 4px rgba(5,150,105,.14)" : undefined }} />
          {ch.nodes.map(n => (
            <div key={n.id} className="mb-1.5 rounded-xl border border-stone-200 bg-white px-2 py-1.5 text-[11px]" style={{ outline: rt.activeId === n.id ? (n.decoy ? "2px solid #E11D48" : "2px solid #059669") : "none", opacity: n.decoy && lane === "B" ? 0.4 : 1 }}>
              <div className="flex justify-between gap-2"><span>{n.text}</span><span className="font-mono text-[10px] text-stone-400">{n.role}{n.decoy ? " · decoy" : ""}</span></div>
            </div>
          ))}
        </div>
        <pre className="font-mono mt-2 max-h-28 overflow-hidden whitespace-pre-wrap rounded-2xl bg-ink p-2 text-[9px] leading-relaxed text-stone-200">{rt.inspector}</pre>
        <div className="mt-2 flex justify-between text-[10px] text-stone-500"><span>{rt.tokens.toLocaleString()} tok</span><span>drift {(rt.drift * 100).toFixed(0)}%</span><span>{rt.memoryKb}kb</span></div>
      </div>
    </div>
  );
}
export default function ArenaViewport({ challengeId = "ecom", playing = true }: { challengeId?: string; playing?: boolean }) {
  const ch = useMemo(() => getArenaChallenge(challengeId), [challengeId]);
  const [duel, setDuel] = useState<DuelState>(() => createDuel(ch));
  useEffect(() => { setDuel(createDuel(ch)); }, [ch]);
  useEffect(() => { if (!playing) return; const t = window.setInterval(() => setDuel(d => tickDuel(d, ch)), 520); return () => window.clearInterval(t); }, [playing, ch]);
  return (
    <div>
      <div className="mb-2 text-[11px] text-stone-500">Browser agent arena · {ch.name}</div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <LaneView ch={ch} lane="A" rt={duel.laneA} />
        <LaneView ch={ch} lane="B" rt={duel.laneB} />
      </div>
    </div>
  );
}
export { ARENA_CHALLENGES };
