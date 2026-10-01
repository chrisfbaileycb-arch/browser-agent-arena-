import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Megaphone, Move3d, RotateCcw, Video, Volume2, VolumeX } from "lucide-react";
import Crab, { REDUCED_MOTION, WEBGL } from "./Crab";
import { LIVE, moodFor, stationOf, useRun } from "./RunPlayer";
import { useSfx } from "./sfx";
import { useQuality } from "./quality";
import { post } from "../api";
import { useAuth } from "../auth";

const Stadium3D = lazy(() => import("./Stadium3D"));
import { courseOf } from "./courses";
const fmt = s => `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;

// Live runs follow the newest step; finished runs replay their real trace once.
function usePlayhead(run) {
  const [i, setI] = useState(0);
  const total = run?.steps.length || 0;
  const live = run && LIVE.includes(run.status);
  useEffect(() => { if (live) setI(Math.max(0, total - 1)); }, [live, total]);
  useEffect(() => {
    if (live || !total) return undefined;
    const t = setInterval(() => setI(x => Math.min(x + 1, total - 1)), 1300);
    return () => clearInterval(t);
  }, [live, total, run?.id]);
  return [i, setI];
}

function racerOf(run, i, now) {
  if (!run) return null;
  const last = courseOf(run.course_id).stations.length - 1;
  const step = run.steps[i], isLast = i >= run.steps.length - 1, finished = run.status === "succeeded" && isLast;
  const live = LIVE.includes(run.status), start = Date.parse(run.started_at || run.created_at);
  const clock = live ? (now - start) / 1000 : step ? (Date.parse(step.at) - start) / 1000 : 0;
  const relay = run.adapter === "relay", legs = run.profile?.legs || [];
  const leg = relay ? legs.find(l => l.role === step?.role) || legs[0] : null;
  return { id: run.id, run, step, stepN: step?.n || 0, at: finished ? last : stationOf(step?.url, run.course_id), mood: moodFor(run, step, isLast), finished, live,
    relay, leg: relay ? step?.leg ?? null : null, look: leg || run.profile || {},
    name: leg ? `Relay · ${leg.name}` : run.profile?.name || run.champion_label || "Crab", clock: Math.max(0, clock), score: isLast ? run.score?.total : null };
}

function FxOverlay({ reaction }) {
  if (!reaction) return null;
  return (
    <div className="fx-layer" key={reaction.id} aria-hidden>
      <i className={`fx-flash ${reaction.kind}`} style={{ "--c": reaction.color }} />
      {reaction.kind === "finish" && !REDUCED_MOTION && [...Array(28)].map((_, i) => (
        <i key={i} className="fx-confetti" style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.12}s`, background: ["#FF5A4E", "#12B5A5", "#FFD23F", "#4D8BFF", "#FF3DA5"][i % 5] }} />
      ))}
    </div>
  );
}

function Side({ r, right, total }) {
  return (
    <div className={`sb-side ${right ? "right" : ""}`} data-testid={`scoreboard-${right ? "b" : "a"}`}>
      <div className="sb-crest" style={{ "--c": r.look.color || "#FF5A4E" }}><Crab size={44} color={r.look.color} accent={r.look.accent} accessory={r.look.accessory} mood={r.mood} /></div>
      <div><b>{r.name}</b><small>{r.live ? "LIVE" : r.finished ? "FINISHED" : "REPLAY"} · {r.finished ? total : r.at}/{total} stations</small></div>
      <strong className="sb-score">{r.score ?? "—"}</strong>
    </div>
  );
}

function Minimap({ racers, course }) {
  const STATIONS = course.stations, gap = 200 / (STATIONS.length - 1);
  return (
    <svg className="minimap" viewBox="0 0 240 70" data-testid="minimap">
      <rect x="1" y="1" width="238" height="68" rx="12" />
      <line x1="20" y1="35" x2="220" y2="35" />
      {STATIONS.map((s, i) => <g key={s}><circle cx={20 + i * gap} cy="35" r="4" /><text x={20 + i * gap} y="60">{s[0].toUpperCase()}</text></g>)}
      {racers.map((r, k) => <circle key={r.id} className="dot" cx={20 + r.at * gap} cy={k ? 44 : 26} r="6.5" style={{ fill: r.look.color || "#FF5A4E" }} />)}
    </svg>
  );
}

function CoachBar({ racers }) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const target = racers.find(r => r.live && r.run.adapter === "crab" && user && r.run.user_id === user.id);
  const shout = async () => {
    try { await post(`/runs/${target.id}/hint`, { text }); setMsg(`Shouted to ${target.name}!`); setText(""); } catch (e) { setMsg(e.message); }
  };
  return (
    <div className="coach" data-testid="coach-bar">
      <div className="coach-crab"><Crab size={64} mood={target ? "snap" : "idle"} color="#FF9F1C" accent="#1B1530" accessory="headset" label="Coach crab" /></div>
      <div className="coach-body">
        <small>{target ? `Coaching ${target.name}` : "Coach opens during your own crab's live run"}</small>
        <div className="coach-row">
          <input value={text} maxLength={200} disabled={!target} placeholder="Tell your crab what to do…" onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && text && shout()} data-testid="coach-input" />
          <button className="btn btn-glow" disabled={!target || !text} onClick={shout} data-testid="coach-shout-btn"><Megaphone size={15} /> Shout!</button>
        </div>
        {msg && <small data-testid="coach-msg">{msg}</small>}
      </div>
    </div>
  );
}

export default function Broadcast({ runIds, title, base = "/runs", spectator = false }) {
  const { run: a } = useRun(runIds[0], base);
  const { run: b } = useRun(runIds[1], base);
  const [ia, setIa] = usePlayhead(a);
  const [ib, setIb] = usePlayhead(b);
  const [now, setNow] = useState(Date.now());
  const [calls, setCalls] = useState([]);
  const [reaction, setReaction] = useState(null);
  const sfx = useSfx();
  const quality = useQuality();
  const [camMode, setCamMode] = useState("cinematic");
  const playRef = useRef(sfx.play);
  playRef.current = sfx.play;
  const prev = useRef({});
  const racers = [racerOf(a, ia, now), racerOf(b, ib, now)].filter(Boolean);
  const course = courseOf(a?.course_id);
  const live = racers.some(r => r.live);
  useEffect(() => { if (!live) return undefined; const t = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(t); }, [live]);
  const key = racers.map(r => `${r.id}:${r.at}:${r.stepN}:${r.finished}:${r.leg}`).join("|");
  useEffect(() => {
    const add = (text, kind, color) => {
      const id = Math.random();
      setCalls(c => [...c.slice(-2), { id, text, kind }]);
      setTimeout(() => setCalls(c => c.filter(x => x.id !== id)), 2300);
      const react = kind === "bad" ? "groan" : kind === "gold" && text.includes("FINISH") ? "finish" : "cheer";
      setReaction({ id, kind: react, color });
      playRef.current(react);
    };
    racers.forEach(r => {
      const p = prev.current[r.id] || { at: r.at, n: r.stepN, finished: r.finished, leg: r.leg };
      if (r.relay && r.leg != null && p.leg != null && r.leg !== p.leg) add(`${r.name} · BATON PASSED!`, "baton", r.look.color);
      if (r.at > p.at && r.at < course.stations.length) add(`${r.name} · ${course.cleared[course.stations[r.at - 1]] || "STATION CLEARED!"}`, "good", r.look.color);
      if (r.stepN !== p.n && r.step && !r.step.ok) add(`${r.name} · STUMBLE!`, "bad", r.look.color);
      if (r.finished && !p.finished) add(`${r.name} · FINISH · CODE VERIFIED!`, "gold", r.look.color);
      prev.current[r.id] = { at: r.at, n: r.stepN, finished: r.finished, leg: r.leg };
    });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const clock = useMemo(() => Math.max(0, ...racers.map(r => r.clock)), [racers]);
  if (!racers.length) return <div className="broadcast shimmer" data-testid="broadcast-loading">Warming up the stadium…</div>;
  return (
    <section className={`broadcast theme-${course.theme}`} data-testid="broadcast" data-course={course.id} data-reaction={reaction?.kind || ""} data-quality={quality.level} data-camera={camMode}>
      {WEBGL ? <Suspense fallback={<div className="stadium-flat">Loading stadium…</div>}><Stadium3D racers={racers} reaction={reaction} quality={quality} camMode={camMode} replay={!live} course={course} /></Suspense>
        : <><div className="stadium-flat">3D stadium unavailable on this device — follow the minimap.</div><FxOverlay reaction={reaction} /></>}
      <div className="scoreboard">
        <Side r={racers[0]} total={course.stations.length} />
        <div className="sb-clock"><small>{title || course.short}</small><strong data-testid="run-timer">{fmt(clock)}</strong>{live && <i className="live-pill">LIVE</i>}</div>
        {racers[1] ? <Side r={racers[1]} right total={course.stations.length} /> : <div className="sb-side right empty">Solo run</div>}
      </div>
      <div className="callouts" aria-live="polite">
        <AnimatePresence>{calls.map(c => (
          <motion.div key={c.id} className={`callout ${c.kind}`} data-testid="callout" initial={{ x: -320, opacity: 0, skewX: -12 }} animate={{ x: 0, opacity: 1, skewX: -12 }} exit={{ x: 320, opacity: 0 }} transition={{ type: "spring", stiffness: 260, damping: 22 }}>{c.text}</motion.div>
        ))}</AnimatePresence>
      </div>
      {!spectator && <CoachBar racers={racers} />}
      <Minimap racers={racers} course={course} />
      <div className="hud-tools">
        {WEBGL && (
          <>
            <select value={quality.choice} onChange={e => quality.choose(e.target.value)} aria-label="Render quality" data-testid="broadcast-quality-select">
              <option value="auto">Auto ({quality.level})</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
            </select>
            <button className="icon-btn" onClick={() => setCamMode(m => (m === "cinematic" ? "free" : "cinematic"))} aria-label="Toggle camera" title={camMode === "cinematic" ? "Cinematic camera (click for free orbit)" : "Free orbit (click for cinematic)"} data-testid="broadcast-camera-btn">
              {camMode === "cinematic" ? <Video size={16} /> : <Move3d size={16} />}
            </button>
          </>
        )}
        <button className="icon-btn" onClick={sfx.toggle} aria-label={sfx.muted ? "Turn crowd sound on" : "Mute crowd sound"} data-testid="broadcast-mute-btn" data-muted={sfx.muted}>
          {sfx.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      </div>
      {!live && <button className="icon-btn replay-btn" onClick={() => { setIa(0); setIb(0); prev.current = {}; }} aria-label="Replay broadcast" data-testid="broadcast-replay-btn"><RotateCcw size={16} /></button>}
    </section>
  );
}
