import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BadgeCheck, Swords } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import Crab from "./Crab";
import { COURSES, CoursePicker } from "./courses";
import { Badge } from "./ui";
import ChallengeInvite from "./ChallengeInvite";

const METRICS = [
  ["best_time_s", "Best time", v => `${v}s`, "low"], ["median_time_s", "Median time", v => `${v}s`, "low"],
  ["finish_rate", "Finish rate", v => `${Math.round(v * 100)}%`, "high"], ["avg_score", "Avg score", v => v, "high"],
  ["avg_decoys", "Decoys hit / run", v => v, "low"], ["runs", "Runs", v => v, "high"],
];

function Fighter({ side, data, mirror }) {
  const look = data?.look || {};
  return (
    <div className={`h2h-fighter ${mirror ? "mirror" : ""}`} data-testid={`h2h-fighter-${side}`}>
      <motion.div className="h2h-crab" initial={{ x: mirror ? 80 : -80, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 120, damping: 14 }}>
        <Crab size={120} color={look.color} accent={look.accent} accessory={look.accessory} mood="snap" />
      </motion.div>
      <b>{data?.name || "…"}</b>
      {data && <Badge kind={data.source === "verified" ? "succeeded" : "sun"} testId={`h2h-source-${side}`}>{data.source === "verified" ? <><BadgeCheck size={12} /> Harness verified</> : "Self-reported"}</Badge>}
    </div>
  );
}

function Bar({ metric, a, b }) {
  const [key, label, fmt, better] = metric;
  const va = a.stats[key], vb = b.stats[key];
  const max = Math.max(va || 0, vb || 0) || 1;
  const win = va == null || vb == null || va === vb ? null : (better === "low" ? va < vb : va > vb) ? "a" : "b";
  const cell = (v, side) => (
    <div className={`h2h-cell ${side} ${win === side ? "win" : ""}`}>
      {v == null ? <span className="muted">—</span> : <><motion.i style={{ background: (side === "a" ? a : b).look?.color }} initial={{ width: 0 }} animate={{ width: `${Math.max(6, (v / max) * 100)}%` }} transition={{ duration: 0.9 }} /><em>{fmt(v)}</em></>}
    </div>
  );
  return <div className="h2h-row" data-testid={`h2h-metric-${key}`}>{cell(va, "a")}<small>{label}</small>{cell(vb, "b")}</div>;
}

function Picker({ value, options, onChange, testId }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} data-testid={testId}>
      {options.map(o => <option key={o.key} value={o.key}>{o.name}{o.source === "self_reported" ? " · self-reported" : ""}</option>)}
    </select>
  );
}

export default function HeadToHead({ compact = false }) {
  const { user } = useAuth();
  const [course, setCourse] = useState("obstacle-1");
  const [a, setA] = useState("copilot");
  const [b, setB] = useState("comet");
  const [options, setOptions] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([api("/h2h/agents"), user ? api("/crabs").catch(() => []) : []])
      .then(([base, mine]) => setOptions([...base, ...mine.map(c => ({ key: `crab:${c.id}`, name: `${c.name} (my crab)`, source: "verified" }))])).catch(() => {});
  }, [user]);
  useEffect(() => {
    setData(null); setError("");
    api(`/h2h?course_id=${course}&a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`).then(setData).catch(e => setError(e.message));
  }, [course, a, b]);
  const enough = data && data.a.stats.enough && data.b.stats.enough;
  return (
    <section className={`h2h ${compact ? "compact" : ""}`} data-testid="h2h-panel">
      <div className="row between wrap">
        <h2 className="section-title"><Swords size={20} /> Agent head-to-head</h2>
        <CoursePicker value={course} onChange={setCourse} testId="h2h-course" />
      </div>
      <div className="h2h-pickers">
        <Picker value={a} options={options} onChange={setA} testId="h2h-select-a" />
        <span className="h2h-vs">VS</span>
        <Picker value={b} options={options} onChange={setB} testId="h2h-select-b" />
      </div>
      <div className="h2h-stage">
        <Fighter side="a" data={data?.a} />
        <div className="h2h-board">
          {error && <p className="notice notice-error">{error}</p>}
          {!data && !error && <div className="shimmer h2h-loading">Tallying real runs…</div>}
          {data && !enough && (
            <div className="h2h-empty" data-testid="h2h-empty">
              <b>Not enough runs yet</b>
              <p className="muted">We need at least {data.a.stats.min_runs} recorded runs per agent on the {COURSES[course].short} before comparing.
                {" "}{data.a.name}: {data.a.stats.runs} · {data.b.name}: {data.b.stats.runs}.</p>
            </div>
          )}
          {enough && METRICS.map(m => <Bar key={m[0]} metric={m} a={data.a} b={data.b} />)}
        </div>
        <Fighter side="b" data={data?.b} mirror />
      </div>
      <div className="row"><ChallengeInvite defaultCourse={course} defaultKind={["copilot", "comet", "other"].includes(a) ? a : "copilot"} testId="h2h-challenge-btn" /></div>
      <small className="muted">Built only from recorded runs: server-timed harness runs and finish-code-verified self-reported runs. Finish rate = finished ÷ attempts started.</small>
    </section>
  );
}
