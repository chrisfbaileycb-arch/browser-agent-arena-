import Crab2D from "./Crab2D";
import { courseOf } from "./courses";

export const legRange = (run, leg) => {
  const idx = run.steps.map((s, i) => (s.leg === leg ? i : -1)).filter(i => i >= 0);
  return idx.length ? [idx[0], idx[idx.length - 1]] : null;
};
export const pickLeg = (runId, leg) => window.dispatchEvent(new CustomEvent("relay-leg", { detail: { runId, leg } }));
export const onLeg = (fn) => { const h = e => fn(e.detail); window.addEventListener("relay-leg", h); return () => window.removeEventListener("relay-leg", h); };

export default function LegStrip({ run, activeLeg, testId = "leg-strip" }) {
  if (!run?.legs?.length) return null;
  const names = courseOf(run.course_id);
  const label = id => names.names[names.stations.indexOf(id)] || id || "…";
  return (
    <div className="leg-strip" role="tablist" aria-label="Relay legs" data-testid={testId}>
      {run.legs.map(l => (
        <button key={l.index} role="tab" aria-selected={activeLeg === l.index} disabled={!legRange(run, l.index)}
          className={`leg-chip leg-${l.status} ${activeLeg === l.index ? "on" : ""}`} onClick={() => pickLeg(run.id, l.index)}
          data-testid={`${testId}-${l.index}`} title={`Play leg ${l.index + 1} only`}>
          <span className="leg-n">{l.index + 1}</span>
          <Crab2D size={26} color={l.color} accent={l.accent} accessory={l.accessory} />
          <span className="leg-info"><b>{l.role_name || l.role}</b><small>{label(l.from_station)} → {label(l.to_station)}</small></span>
          <span className="mono leg-stats">{l.elapsed_s ?? "…"}s · {l.steps ?? "…"} st</span>
          <em>{l.status === "passed" ? "baton" : l.status}</em>
        </button>
      ))}
    </div>
  );
}
