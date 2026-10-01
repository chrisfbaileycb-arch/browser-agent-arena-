import { useEffect, useState } from "react";
import { Copy, Crown, Share2, Shield, Trophy } from "lucide-react";
import { api, del, post } from "../api";
import CrabCard, { useCards } from "./CrabCard";
import { Btn, Card, Notice } from "./ui";
import Crab2D from "./Crab2D";
import { COURSES, courseOf } from "./courses";

const ROUND_NAMES = { 4: "Round of 8", 2: "Semifinals", 1: "Final" };
const Crest = ({ e }) => e?.relay
  ? <i className="crest squad-crest" title="Squad Relay" style={{ "--c": e.color || "#FFD23F" }}><Shield size={11} /></i>
  : <i className="crest" style={{ background: e?.color || "#3A3360" }} />;

const MiniSquad = ({ squad = [], testId }) => (
  <span className="mini-squad" data-testid={testId}>
    {squad.map((m, i) => <span key={i} title={`${m.role}: ${m.name}`}><Crab2D size={22} color={m.color} accent={m.accent} accessory={m.accessory} /></span>)}
  </span>
);

function SquadEntrantCard({ e, testId }) {
  return (
    <div className="squad-entrant" data-testid={testId}>
      <div className="squad-entrant-crest" style={{ "--c": e.color || "#FFD23F" }}><Shield size={34} /><b>SQUAD</b></div>
      <strong>{e.name}</strong>
      <div className="squad-entrant-crabs">
        {(e.squad || []).map((m, i) => (
          <span key={i}><Crab2D size={44} color={m.color} accent={m.accent} accessory={m.accessory} /><small>{m.role}</small><em>{m.name}</em></span>
        ))}
      </div>
    </div>
  );
}

function Match({ m, onWatch, testId }) {
  const row = (e, score, side) => (
    <div className={`m-row ${m.winner && e && m.winner.name === e.name ? "win" : ""}`}>
      <Crest e={e} /><span>{e ? e.name : "bye"}{e?.relay && <MiniSquad squad={e.squad} testId={`${testId}-squad-${side}`} />}</span><b>{score ?? (m[`run_${side}`] ? "…" : "")}</b>
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
  const cards = useCards(t.entrants.map(e => e?.crab_id));
  return (
    <>
    <div className="card-row" data-testid="entrant-cards">
      {t.entrants.map((e, i) => e.relay ? <SquadEntrantCard key={i} e={e} testId={`entrant-card-${i}`} />
        : <CrabCard key={i} crab={e} card={cards[e.crab_id]} size={180} testId={`entrant-card-${i}`} />)}
    </div>
    <small className="muted" data-testid="bracket-course">Course: {courseOf(t.course_id).short}</small>
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
          {t.champion ? <>{t.champion.relay ? <SquadEntrantCard e={t.champion} testId="champion-crab-card" /> : <CrabCard crab={t.champion} card={cards[t.champion.crab_id]} size={190} extra="Tournament champion" testId="champion-crab-card" />}<b><Crown size={16} /> {t.champion.name}</b></>
            : <><Trophy size={30} /><small>{t.status === "running" ? "Matches in progress…" : t.error || "No champion"}</small></>}
        </div>
      </div>
    </div>
    </>
  );
}

function ShareBar({ t, reload }) {
  const [msg, setMsg] = useState("");
  const link = t.share_enabled && t.share_slug ? `${window.location.origin}/t/${t.share_slug}` : null;
  const card = link && encodeURIComponent(`${window.location.origin}/api/public/t/${t.share_slug}/card`);
  const act = fn => fn().then(reload).catch(e => setMsg(e.message));
  const copy = () => navigator.clipboard.writeText(link).then(() => setMsg("Link copied!")).catch(() => setMsg(link));
  return (
    <div className="share-bar" data-testid="share-bar">
      <Share2 size={16} />
      {link ? (
        <>
          <code className="mono small" data-testid="share-link">{link}</code>
          <Btn onClick={copy} testId="share-copy-btn"><Copy size={14} /> Copy link</Btn>
          <a className="btn btn-ghost" href={`https://twitter.com/intent/tweet?url=${card}&text=${encodeURIComponent(`${t.name} on Browser Agent Arena`)}`} target="_blank" rel="noreferrer" data-testid="share-x-link">Post</a>
          <a className="btn btn-ghost" href={`https://www.linkedin.com/sharing/share-offsite/?url=${card}`} target="_blank" rel="noreferrer" data-testid="share-linkedin-link">LinkedIn</a>
          <Btn kind="ghost" onClick={() => act(() => post(`/tournaments/${t.id}/share`))} testId="share-regenerate-btn">Regenerate</Btn>
          <Btn kind="ghost" onClick={() => act(() => del(`/tournaments/${t.id}/share`))} testId="share-revoke-btn">Turn off</Btn>
        </>
      ) : <Btn onClick={() => act(() => post(`/tournaments/${t.id}/share`))} testId="share-create-btn">Create public link</Btn>}
      <small className="muted" data-testid="share-views">{t.views || 0} views</small>
      {msg && <small data-testid="share-msg">{msg}</small>}
    </div>
  );
}

export default function TournamentPanel({ crabs, champions, adapters, preset, onWatch, courseId = "obstacle-1" }) {
  const [picked, setPicked] = useState([]);
  const [list, setList] = useState([]);
  const [current, setCurrent] = useState(null);
  const [error, setError] = useState("");
  const load = () => api("/tournaments").then(l => { setList(l); setCurrent(c => l.find(x => x.id === c?.id) || l[0] || null); }).catch(() => {});
  useEffect(() => { load(); }, []);
  useEffect(() => { if (preset?.length) setPicked(p => [...new Set([...preset, ...p])].slice(0, 8)); }, [preset]);
  useEffect(() => { if (current?.status !== "running") return undefined; const t = setInterval(load, 4000); return () => clearInterval(t); }, [current?.status]);
  const pool = [{ key: "relay", label: "Squad Relay (my squad)", color: "#FFD23F", relay: true, body: { relay: true } },
    ...crabs.map(c => ({ key: c.id, label: c.name, color: c.color, body: { crab_id: c.id } })),
    ...champions.map(c => ({ key: c.id, label: `${c.name} (champion)`, color: c.color, body: { crab_id: c.id } })),
    ...adapters.filter(a => a.tier === "champion" || a.id === "own_endpoint").map(a => ({ key: a.id, label: a.name, color: a.look?.color, body: { adapter: a.id } }))];
  const toggle = k => setPicked(p => p.includes(k) ? p.filter(x => x !== k) : [...p, k].slice(0, 8));
  const start = async () => {
    setError("");
    try { const t = await post("/tournaments", { name: courseId === "kelp-2" ? "Kelp Cup" : "Tidepool Cup", course_id: courseId, entrants: picked.map(k => pool.find(p => p.key === k).body) }); setCurrent(t); load(); }
    catch (e) { setError(e.message); }
  };
  return (
    <Card testId="tournament-panel" className="tournament">
      <div className="row between"><h3><Trophy size={18} /> Arena tournament</h3><small className="muted" data-testid="tournament-course">{COURSES[courseId].short} · Pro · up to 8 entrants · real runs on your keys</small></div>
      <div className="row wrap">
        {pool.map(p => (
          <button key={p.key} className={`chip ${picked.includes(p.key) ? "on" : ""}`} onClick={() => toggle(p.key)} data-testid={`entrant-${p.key}`}>
            <Crest e={{ color: p.color, relay: p.relay }} /> {p.label}
          </button>
        ))}
      </div>
      <Btn onClick={start} disabled={picked.length < 2} testId="start-tournament-btn">Start tournament ({picked.length})</Btn>
      <Notice kind="error" testId="tournament-error">{error}</Notice>
      {list.length > 1 && <div className="row wrap">{list.map(t => <button key={t.id} className={`chip ${current?.id === t.id ? "on" : ""}`} onClick={() => setCurrent(t)}>{t.name} · {t.status}</button>)}</div>}
      {current && <ShareBar t={current} reload={load} />}
      {current && <Bracket t={current} onWatch={onWatch} />}
    </Card>
  );
}
