import { useEffect, useState } from "react";
import { Crown, Trophy } from "lucide-react";
import { api, post } from "../api";
import Crab from "./Crab";
import { Btn, Card, Notice } from "./ui";

const ROUND_NAMES = { 4: "Round of 8", 2: "Semifinals", 1: "Final" };
const Crest = ({ e }) => <i className="crest" style={{ background: e?.color || "#3A3360" }} />;

function Match({ m, onWatch, testId }) {
  const row = (e, score, side) => (
    <div className={`m-row ${m.winner && e && m.winner.name === e.name ? "win" : ""}`}>
      <Crest e={e} /><span>{e ? e.name : "bye"}</span><b>{score ?? (m[`run_${side}`] ? "…" : "")}</b>
    </div>
  );
  return (
    <div className="match" data-testid={testId}>
      {row(m.a, m.score_a, "a")}{row(m.b, m.score_b, "b")}
      {m.error && <small className="m-err">{m.error}</small>}
      {m.run_a && <button className="link" onClick={() => onWatch([m.run_a, m.run_b])} data-testid={`${testId}-watch`}>Watch</button>}
    </div>
  );
}

export function Bracket({ t, onWatch }) {
  return (
    <div className="bracket" data-testid="bracket">
      {t.rounds.map((round, r) => (
        <div className="b-col" key={r}>
          <h4>{ROUND_NAMES[round.length] || `Round ${r + 1}`}</h4>
          {round.map((m, i) => <Match key={i} m={m} onWatch={onWatch} testId={`match-${r}-${i}`} />)}
        </div>
      ))}
      <div className="b-col">
        <h4>Champion</h4>
        <div className="champion-card" data-testid="champion-card">
          {t.champion ? <><Crab size={110} mood="celebrate" color={t.champion.color} accent={t.champion.accent} accessory={t.champion.accessory} /><Crown size={18} /><b>{t.champion.name}</b></>
            : <><Trophy size={30} /><small>{t.status === "running" ? "Matches in progress…" : t.error || "No champion"}</small></>}
        </div>
      </div>
    </div>
  );
}

export default function TournamentPanel({ crabs, champions, adapters, preset, onWatch }) {
  const [picked, setPicked] = useState([]);
  const [list, setList] = useState([]);
  const [current, setCurrent] = useState(null);
  const [error, setError] = useState("");
  const load = () => api("/tournaments").then(l => { setList(l); setCurrent(c => l.find(x => x.id === c?.id) || l[0] || null); }).catch(() => {});
  useEffect(() => { load(); }, []);
  useEffect(() => { if (preset?.length) setPicked(p => [...new Set([...preset, ...p])].slice(0, 8)); }, [preset]);
  useEffect(() => { if (current?.status !== "running") return undefined; const t = setInterval(load, 4000); return () => clearInterval(t); }, [current?.status]);
  const pool = [...crabs.map(c => ({ key: c.id, label: c.name, color: c.color, body: { crab_id: c.id } })),
    ...champions.map(c => ({ key: c.id, label: `${c.name} (champion)`, color: c.color, body: { crab_id: c.id } })),
    ...adapters.filter(a => a.tier === "champion").map(a => ({ key: a.id, label: a.name, color: a.look?.color, body: { adapter: a.id } }))];
  const toggle = k => setPicked(p => p.includes(k) ? p.filter(x => x !== k) : [...p, k].slice(0, 8));
  const start = async () => {
    setError("");
    try { const t = await post("/tournaments", { name: "Tidepool Cup", entrants: picked.map(k => pool.find(p => p.key === k).body) }); setCurrent(t); load(); }
    catch (e) { setError(e.message); }
  };
  return (
    <Card testId="tournament-panel" className="tournament">
      <div className="row between"><h3><Trophy size={18} /> Arena tournament</h3><small className="muted">Pro · up to 8 entrants · real runs on your keys</small></div>
      <div className="row wrap">
        {pool.map(p => (
          <button key={p.key} className={`chip ${picked.includes(p.key) ? "on" : ""}`} onClick={() => toggle(p.key)} data-testid={`entrant-${p.key}`}>
            <Crest e={{ color: p.color }} /> {p.label}
          </button>
        ))}
      </div>
      <Btn onClick={start} disabled={picked.length < 2} testId="start-tournament-btn">Start tournament ({picked.length})</Btn>
      <Notice kind="error" testId="tournament-error">{error}</Notice>
      {list.length > 1 && <div className="row wrap">{list.map(t => <button key={t.id} className={`chip ${current?.id === t.id ? "on" : ""}`} onClick={() => setCurrent(t)}>{t.name} · {t.status}</button>)}</div>}
      {current && <Bracket t={current} onWatch={onWatch} />}
    </Card>
  );
}
