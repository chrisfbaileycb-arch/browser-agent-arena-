import { useEffect, useState } from "react";
import { Lightbulb, Undo2, Wand2 } from "lucide-react";
import { api, post } from "../api";
import CoachHistory from "./CoachHistory";
import { COURSES } from "./courses";
import { Btn, Notice } from "./ui";

const num = v => (v == null ? "—" : v);

export default function SquadCoach({ courseId = "obstacle-1", squad, setSquad }) {
  const [data, setData] = useState(null);
  const [undo, setUndo] = useState(null);
  const [msg, setMsg] = useState("");
  const [tick, setTick] = useState(0);
  const load = () => api(`/squad/coach?course_id=${courseId}`).then(setData).catch(e => setData({ status: "error", error: e.message, legs: [] }));
  useEffect(() => { setData(null); setUndo(null); setMsg(""); load(); }, [courseId]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = (r, note) => { setSquad(s => ({ ...s, ...r.squad })); setMsg(note); setTick(t => t + 1); load(); };
  const apply = () => {
    const s = data.suggestion;
    post("/squad/coach/apply", { course_id: courseId, stations: s.stations, role: s.role })
      .then(r => { setUndo(r.history_id); done(r, `${s.crab_name} now runs ${s.stations.join(", ")}.`); }).catch(e => setMsg(e.message));
  };
  const revert = (id = undo) => post("/squad/coach/undo", { history_id: id }).then(r => { setUndo(null); done(r, "Swap undone."); }).catch(e => setMsg(e.message));
  if (!data) return <div className="coach-panel shimmer" data-testid="squad-coach-loading">Coach is reviewing your legs…</div>;
  const names = COURSES[courseId];
  const label = s => names.names[names.stations.indexOf(s)] || s;
  return (
    <div className="coach-panel" data-testid="squad-coach">
      <h4><Lightbulb size={16} /> Leg coach · {names.short}</h4>
      {data.status === "error" && <Notice kind="error">{data.error}</Notice>}
      {data.status === "not_enough" && <p className="coach-empty" data-testid="squad-coach-empty">Not enough runs to coach yet. Each leg needs at least 2 recorded runs from your squad and 2 from other squads you can see (public runs and shared tournaments).</p>}
      {data.status === "even" && <p className="coach-empty" data-testid="squad-coach-even">No leg is losing time versus other squads right now.</p>}
      {data.worst && <p className="coach-worst" data-testid="squad-coach-worst"><b>{data.worst.message}</b> <small className="muted">(your avg {data.worst.mine.avg_time_s}s over {data.worst.mine.n} runs vs median {data.worst.others.median_time_s}s over {data.worst.others.n})</small></p>}
      {data.suggestion && (
        <div className="coach-swap" data-testid="squad-coach-suggestion">
          <span>Swap in <b>{data.suggestion.crab_name}</b> ({data.suggestion.role_name}) for {data.suggestion.stations.map(label).join(", ")}: expected gain <b>{data.suggestion.gain_s}s</b> <small className="muted">based on {data.suggestion.basis_runs} runs ({data.suggestion.current_expected_s}s → {data.suggestion.candidate_expected_s}s)</small></span>
          <Btn onClick={apply} testId="squad-coach-apply-btn"><Wand2 size={14} /> Apply swap</Btn>
        </div>
      )}
      {data.worst && !data.suggestion && <small className="muted" data-testid="squad-coach-no-swap">{data.suggestion_note}</small>}
      {undo && <Btn kind="ghost" onClick={() => revert()} testId="squad-coach-undo-btn"><Undo2 size={14} /> Undo swap</Btn>}
      {msg && <small data-testid="squad-coach-msg">{msg}</small>}
      {data.legs?.length > 0 && (
        <table className="lc-table coach-table" data-testid="squad-coach-table">
          <thead><tr><th>Leg</th><th>Stations</th><th>Yours (avg)</th><th>Others (median)</th><th>Δ</th></tr></thead>
          <tbody>{data.legs.map((l, i) => (
            <tr key={i} className={data.worst && l.from_station === data.worst.from_station ? "on" : ""} data-testid={`squad-coach-leg-${i}`}>
              <td><b>{l.role_name}</b> <small className="muted">{l.crab_name || "empty slot"}</small></td>
              <td className="mono">{l.stations.map(label).join(", ")}</td>
              <td className="mono">{num(l.mine.avg_time_s)}s · {num(l.mine.avg_steps)} st <small>n={l.mine.n}</small></td>
              <td className="mono">{num(l.others.median_time_s)}s · {num(l.others.median_steps)} st <small>n={l.others.n}</small></td>
              <td className="mono">{l.enough ? `${l.lost_s > 0 ? "+" : ""}${l.lost_s}s` : "not enough"}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <CoachHistory courseId={courseId} tick={tick} onUndo={revert} />
    </div>
  );
}
