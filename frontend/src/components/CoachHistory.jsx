import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { History, Undo2 } from "lucide-react";
import { api } from "../api";
import { COURSES } from "./courses";
import { Badge } from "./ui";

const KIND = { improved: "succeeded", worse: "failed", pending: "sun", undone: "neutral", no_baseline: "neutral", undo: "neutral" };

function Bars({ before, after }) {
  const max = Math.max(before.avg_time_s || 0, after.avg_time_s || 0) || 1;
  const bar = (v, label, cls) => (
    <div className="ch-bar">
      <small>{label}</small>
      <motion.i className={cls} initial={{ width: 0 }} animate={{ width: `${Math.max(4, (v / max) * 100)}%` }} transition={{ duration: 0.8 }} />
      <span className="mono">{v}s</span>
    </div>
  );
  return <div className="ch-bars">{bar(before.avg_time_s, `Before (${before.n} runs)`, "before")}{bar(after.avg_time_s, `After (${after.n} runs)`, "after")}</div>;
}

function Entry({ h, names, onUndo }) {
  const label = list => list.map(s => names.names[names.stations.indexOf(s)] || s).join(", ");
  const res = h.result;
  return (
    <li className={`ch-entry ${h.status}`} data-testid={`coach-history-${h.id}`}>
      <div className="row wrap between">
        <span><b>{h.kind === "undo" ? "Undo" : "Swap"}</b> · {label(h.stations)}: {h.old_crab?.name || "?"} → <b>{h.new_crab?.name || "?"}</b></span>
        <Badge kind={KIND[h.status]} testId={`coach-history-status-${h.id}`}>{h.status.replace("_", " ")}</Badge>
      </div>
      <small className="muted">{new Date(h.at).toLocaleString()}{h.kind === "swap" && ` · predicted gain ${h.predicted_gain_s}s based on ${h.basis_runs} runs · baseline ${h.before.n ? `${h.before.avg_time_s}s / ${h.before.avg_steps} steps over ${h.before.n} runs` : "none"}`}</small>
      {h.kind === "swap" && res && (
        <>
          <p className="ch-result" data-testid={`coach-history-result-${h.id}`}>{res.saved_s > 0 ? `Saved ${res.saved_s}s (predicted ${h.predicted_gain_s}s)` : `Lost ${Math.abs(res.saved_s)}s — consider undo`} — based on {res.runs} runs</p>
          <Bars before={h.before} after={h.after} />
        </>
      )}
      {h.kind === "swap" && !res && h.status === "pending" && <p className="muted" data-testid={`coach-history-waiting-${h.id}`}>Waiting for {h.waiting.need} relay runs ({h.waiting.have}/{h.waiting.need})</p>}
      {h.status === "no_baseline" && <p className="muted">No relay runs on these stations before the swap, so there's nothing to compare against.</p>}
      {h.kind === "swap" && !h.undone_at && <button className="link" onClick={() => onUndo(h.id)} data-testid={`coach-history-undo-${h.id}`}><Undo2 size={12} /> Undo this swap</button>}
    </li>
  );
}

export default function CoachHistory({ courseId, tick, onUndo }) {
  const [list, setList] = useState(null);
  useEffect(() => { api(`/squad/coach/history?course_id=${courseId}`).then(setList).catch(() => setList([])); }, [courseId, tick]);
  if (!list) return null;
  return (
    <div className="coach-history" data-testid="coach-history">
      <h5><History size={14} /> Coach history · {COURSES[courseId].short}</h5>
      {list.length ? <ol>{list.map(h => <Entry key={h.id} h={h} names={COURSES[courseId]} onUndo={onUndo} />)}</ol>
        : <p className="muted" data-testid="coach-history-empty">No swaps applied on this course yet.</p>}
    </div>
  );
}
