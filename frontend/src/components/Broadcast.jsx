import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Megaphone, RotateCcw } from "lucide-react";
import Crab, { WEBGL } from "./Crab";
import { LIVE, moodFor, stationOf, useRun } from "./RunPlayer";
import { post } from "../api";
import { useAuth } from "../auth";

const Stadium3D = lazy(() => import("./Stadium3D"));
const STATIONS = ["start", "wall", "doors", "rope", "beam", "tunnel", "finish"];
const CLEARED = { start: "OFF THE LINE!", wall: "WALL CLEARED!", doors: "DECOY DODGED!", rope: "ROPE CLIMBED!", beam: "BEAM BALANCED!", tunnel: "TUNNEL CRAWLED!" };
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
  const step = run.steps[i], isLast = i >= run.steps.length - 1, finished = run.status === "succeeded" && isLast;
  const live = LIVE.includes(run.status), start = Date.parse(run.started_at || run.created_at);
  const clock = live ? (now - start) / 1000 : step ? (Date.parse(step.at) - start) / 1000 : 0;
  return { id: run.id, run, step, stepN: step?.n || 0, at: finished ? 6 : stationOf(step?.url), mood: moodFor(run, step, isLast), finished, live,
    look: run.profile || {}, name: run.profile?.name || run.champion_label || "Crab", clock: Math.max(0, clock), score: isLast ? run.score?.total : null };
}

function Side({ r, right }) {
  return (
    <div className={`sb-side ${right ? "right" : ""}`} data-testid={`scoreboard-${right ? "b" : "a"}`}>
      <div className="sb-crest" style={{ "--c": r.look.color || "#FF5A4E" }}><Crab size={44} color={r.look.color} accent={r.look.accent} accessory={r.look.accessory} mood={r.mood} /></div>
      <div><b>{r.name}</b><small>{r.live ? "LIVE" : r.finished ? "FINISHED" : "REPLAY"} · {r.finished ? 7 : r.at}/7 stations</small></div>
      <strong className="sb-score">{r.score ?? "—"}</strong>
    </div>
  );
}

function Minimap({ racers }) {
  return (
    <svg className="minimap" viewBox="0 0 240 70" data-testid="minimap">
      <rect x="1" y="1" width="238" height="68" rx="12" />
      <line x1="20" y1="35" x2="220" y2="35" />
      {STATIONS.map((s, i) => <g key={s}><circle cx={20 + i * 33.3} cy="35" r="4" /><text x={20 + i * 33.3} y="60">{s[0].toUpperCase()}</text></g>)}
      {racers.map((r, k) => <circle key={r.id} className="dot" cx={20 + r.at * 33.3} cy={k ? 44 : 26} r="6.5" style={{ fill: r.look.color || "#FF5A4E" }} />)}
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

export default function Broadcast({ runIds, title = "Tidepool Gauntlet" }) {
  const { run: a } = useRun(runIds[0]);
  const { run: b } = useRun(runIds[1]);
  const [ia, setIa] = usePlayhead(a);
  const [ib, setIb] = usePlayhead(b);
  const [now, setNow] = useState(Date.now());
  const [calls, setCalls] = useState([]);
  const prev = useRef({});
  const racers = [racerOf(a, ia, now), racerOf(b, ib, now)].filter(Boolean);
  const live = racers.some(r => r.live);
  useEffect(() => { if (!live) return undefined; const t = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(t); }, [live]);
  const key = racers.map(r => `${r.id}:${r.at}:${r.stepN}:${r.finished}`).join("|");
  useEffect(() => {
    const add = (text, kind) => {
      const id = Math.random();
      setCalls(c => [...c.slice(-2), { id, text, kind }]);
      setTimeout(() => setCalls(c => c.filter(x => x.id !== id)), 2300);
    };
    racers.forEach(r => {
      const p = prev.current[r.id] || { at: r.at, n: r.stepN, finished: r.finished };
      if (r.at > p.at && r.at <= 6) add(`${r.name} · ${CLEARED[STATIONS[r.at - 1]]}`, "good");
      if (r.stepN !== p.n && r.step && !r.step.ok) add(`${r.name} · STUMBLE!`, "bad");
      if (r.finished && !p.finished) add(`${r.name} · FINISH · CODE VERIFIED!`, "gold");
      prev.current[r.id] = { at: r.at, n: r.stepN, finished: r.finished };
    });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const clock = useMemo(() => Math.max(0, ...racers.map(r => r.clock)), [racers]);
  if (!racers.length) return <div className="broadcast shimmer" data-testid="broadcast-loading">Warming up the stadium…</div>;
  return (
    <section className="broadcast" data-testid="broadcast">
      {WEBGL ? <Suspense fallback={<div className="stadium-flat">Loading stadium…</div>}><Stadium3D racers={racers} /></Suspense>
        : <div className="stadium-flat">3D stadium unavailable on this device — follow the minimap.</div>}
      <div className="scoreboard">
        <Side r={racers[0]} />
        <div className="sb-clock"><small>{title}</small><strong data-testid="run-timer">{fmt(clock)}</strong>{live && <i className="live-pill">LIVE</i>}</div>
        {racers[1] ? <Side r={racers[1]} right /> : <div className="sb-side right empty">Solo run</div>}
      </div>
      <div className="callouts" aria-live="polite">
        <AnimatePresence>{calls.map(c => (
          <motion.div key={c.id} className={`callout ${c.kind}`} data-testid="callout" initial={{ x: -320, opacity: 0, skewX: -12 }} animate={{ x: 0, opacity: 1, skewX: -12 }} exit={{ x: 320, opacity: 0 }} transition={{ type: "spring", stiffness: 260, damping: 22 }}>{c.text}</motion.div>
        ))}</AnimatePresence>
      </div>
      <CoachBar racers={racers} />
      <Minimap racers={racers} />
      {!live && <button className="icon-btn replay-btn" onClick={() => { setIa(0); setIb(0); prev.current = {}; }} aria-label="Replay broadcast" data-testid="broadcast-replay-btn"><RotateCcw size={16} /></button>}
    </section>
  );
}
