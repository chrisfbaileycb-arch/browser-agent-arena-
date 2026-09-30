import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import Crab from "./Crab";
import { api, asset } from "../api";
import { Badge, Btn } from "./ui";

const STATIONS = ["start", "wall", "doors", "rope", "beam", "tunnel", "finish"];
const NAMES = ["Start", "Wall", "Doors", "Rope", "Beam", "Tunnel", "Finish"];
export const LIVE = ["queued", "running"];
export const stationOf = url => Math.max(0, STATIONS.findIndex(s => (url || "").includes(`/${s}?`) || (url || "").endsWith(`/${s}`)));

export function useRun(runId) {
  const [run, setRun] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!runId) { setRun(null); return undefined; }
    let alive = true, timer;
    const poll = () => api(`/runs/${runId}`).then(d => {
      if (!alive) return;
      setRun(d);
      if (LIVE.includes(d.status)) timer = setTimeout(poll, 1200);
    }).catch(e => alive && setError(e.message));
    poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [runId]);
  return { run, error };
}

// Crab mirrors the step being shown: pincer-snap on clicks/typing, stumble on errors, celebrate at the finish.
export function moodFor(run, step, isLast) {
  const live = LIVE.includes(run.status);
  if (!step) return live ? "walk" : "idle";
  if (isLast && run.status === "succeeded") return "celebrate";
  if (!step.ok || step.action === "fail") return "stumble";
  if (isLast && !live) return run.status === "failed" ? "stumble" : "idle";
  return /click|type|select|key|drag/.test(step.action) ? "snap" : "walk";
}

function Track({ run, index }) {
  const step = run.steps[index];
  const isLast = index >= run.steps.length - 1;
  const at = run.status === "succeeded" && isLast ? 6 : stationOf(step?.url);
  const mood = moodFor(run, step, isLast);
  const p = run.profile || {};
  return (
    <div className="track" data-testid="course-track">
      <div className="track-line" />
      {NAMES.map((n, i) => <div key={n} className={`station-dot ${i < at ? "cleared" : ""} ${i === at ? "here" : ""}`} style={{ left: `${(i / 6) * 100}%` }}><i />{n}</div>)}
      <motion.div className="track-crab" data-testid="track-crab" data-mood={mood} animate={{ left: `${(at / 6) * 100}%` }} transition={{ type: "spring", stiffness: 60, damping: 14 }}>
        <Crab size={58} mood={mood} color={p.color || "#FF5A4E"} accent={p.accent || "#FFD23F"} accessory={p.accessory || "none"} />
      </motion.div>
    </div>
  );
}

export default function RunPlayer({ runId, compact }) {
  const { run, error } = useRun(runId);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [follow, setFollow] = useState(true);
  const total = run?.steps.length || 0;
  useEffect(() => { if (follow && total) setIndex(total - 1); }, [total, follow]);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setIndex(i => { if (i >= total - 1) { setPlaying(false); return i; } return i + 1; }), 1100);
    return () => clearInterval(t);
  }, [playing, total]);
  const step = run?.steps[index];
  const live = run && LIVE.includes(run.status);
  const jevVerdict = useMemo(() => run?.jev?.status === "ok" ? run.jev.answers?.verdict?.choice : null, [run]);
  if (error) return <p className="notice notice-error">{error}</p>;
  if (!run) return <div className="card shimmer" data-testid="run-loading">Loading run…</div>;
  const go = i => { setFollow(false); setPlaying(false); setIndex(Math.max(0, Math.min(total - 1, i))); };
  return (
    <div className={`player card ${compact ? "compact" : ""}`} data-testid={`run-player-${run.id}`}>
      <div className="player-head">
        <div>
          <p className="eyebrow">{run.champion_label ? "Champion replay" : run.adapter} · {run.model || "—"}</p>
          <h3>{run.profile?.name || run.champion_label || "Crab"} <span className="muted">on {run.course_id || run.display_url}</span></h3>
        </div>
        <Badge kind={run.status} testId="run-status">{live && <i className="pulse" />}{run.status}</Badge>
      </div>
      {run.kind === "course" && <Track run={run} index={index} />}
      <div className="player-body">
        <div className="shot">
          {step?.screenshot ? <img src={asset(step.screenshot)} alt={`Step ${step.n}`} data-testid="step-screenshot" />
            : <div className="shot-empty">{step ? "Reported by an external agent (no screenshot)" : live ? "Crab is looking at the page…" : "No steps recorded"}</div>}
          <div className="controls">
            <button className="icon-btn" onClick={() => go(0)} aria-label="Restart" data-testid="replay-restart-btn"><RotateCcw size={16} /></button>
            <button className="icon-btn" onClick={() => go(index - 1)} aria-label="Previous step" data-testid="replay-prev-btn"><ChevronLeft size={16} /></button>
            <button className="icon-btn" onClick={() => { if (index >= total - 1) setIndex(0); setFollow(false); setPlaying(!playing); }} aria-label="Play or pause" data-testid="replay-play-btn">{playing ? <Pause size={16} /> : <Play size={16} />}</button>
            <button className="icon-btn" onClick={() => go(index + 1)} aria-label="Next step" data-testid="replay-next-btn"><ChevronRight size={16} /></button>
            <span className="mono">{total ? index + 1 : 0}/{total}</span>
          </div>
        </div>
        <div className="side">
          <div className="score-box" data-testid="run-score-box">
            <strong data-testid="run-score">{run.score ? run.score.total : "—"}</strong><small>/100</small>
            <ul>
              <li>Steps <b>{run.steps_used}</b></li><li>Time <b>{run.elapsed_s ? `${run.elapsed_s}s` : "…"}</b></li>
              <li>Decoys <b>{run.verification?.decoys ?? "…"}</b></li>
              <li>Stations <b>{run.verification ? `${run.verification.stations_cleared}/${run.verification.stations_total}` : "…"}</b></li>
            </ul>
            {run.verification?.verified && <Badge kind="succeeded" testId="run-verified-badge">Code verified {run.verification.code_issued}</Badge>}
            {run.error && <p className="notice notice-error" data-testid="run-error">{run.error}</p>}
            <p className="jev" data-testid="run-jev">Jev gate: {run.jev ? (run.jev.status === "ok" ? `${jevVerdict} · p(goal)=${run.jev.answers.goal_achieved.noul.toFixed(2)}` : run.jev.message) : "pending"}</p>
          </div>
          <ol className="steps" data-testid="step-list">
            {run.steps.map((s, i) => (
              <li key={s.n} className={`${i === index ? "on" : ""} ${s.ok ? "" : "bad"}`} onClick={() => go(i)} data-testid={`step-${s.n}`}>
                <span className="mono">{String(s.n).padStart(2, "0")}</span><Badge kind={`act-${s.action}`}>{s.action}</Badge>
                <span className="step-label">{s.target_label || s.value}</span>
                {i === index && <p className="reason">{s.reasoning}</p>}
              </li>
            ))}
          </ol>
          {run.hints?.length > 0 && (
            <ul className="coach-log" data-testid="coach-log">
              {run.hints.map((h, i) => <li key={i}><b>Coach</b> after step {h.after_step}: {h.text}</li>)}
            </ul>
          )}
        </div>
      </div>
      {run.final_screenshot && !compact && <a className="link" href={asset(run.final_screenshot)} target="_blank" rel="noreferrer" data-testid="final-screenshot-link">Open final screenshot</a>}
    </div>
  );
}

export const StartOver = ({ onClick }) => <Btn kind="ghost" onClick={onClick} testId="new-duel-btn">New duel</Btn>;
