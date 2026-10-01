import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, post } from "../api";
import { useAuth } from "../auth";
import Crab from "../components/Crab";
import RunPlayer from "../components/RunPlayer";
import Broadcast from "../components/Broadcast";
import SquadCard from "../components/SquadCard";
import TournamentPanel from "../components/Tournament";
import SelfReport from "../components/SelfReport";
import { Btn, Card, Head, Notice, Page } from "../components/ui";

export default function Arena() {
  const { user } = useAuth();
  const [crabs, setCrabs] = useState([]);
  const [adapters, setAdapters] = useState([]);
  const [picked, setPicked] = useState([]);
  const [runs, setRuns] = useState([]);
  const [replays, setReplays] = useState([]);
  const [watch, setWatch] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [champions, setChampions] = useState([]);
  const [preset, setPreset] = useState([]);
  const startRelay = async opponent => {
    const ids = [(await post("/runs", { course_id: "obstacle-1", adapter: "relay" })).id];
    if (opponent) ids.push((await post("/runs", { course_id: "obstacle-1", crab_id: opponent, adapter: "crab" })).id);
    setRuns(ids);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  useEffect(() => {
    api("/adapters").then(setAdapters).catch(() => {});
    api("/champions").then(setChampions).catch(() => {});
    api("/replays?course_id=obstacle-1").then(r => { setReplays(r); setWatch(w => w || r[0]?.id); }).catch(() => {});
    if (user) api("/crabs").then(setCrabs).catch(() => {});
  }, [user]);
  const toggle = id => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id].slice(-2));
  const start = async () => {
    setBusy(true); setError("");
    try {
      const ids = [];
      for (const id of picked) {
        const body = id.startsWith("adapter:") ? { course_id: "obstacle-1", adapter: id.slice(8) } : { course_id: "obstacle-1", crab_id: id, adapter: "crab" };
        ids.push((await post("/runs", body)).id);
      }
      setRuns(ids);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <Page testId="arena-page">
      <Head eyebrow="Arena" title="Duel on the Tidepool Gauntlet">Pick up to two of your crabs. Each runs in its own real Chromium browser, with your own keys, on a fresh attempt with its own finish code.</Head>
      {runs.length > 0 ? (
        <section className="stack">
          <div className="row"><Btn kind="ghost" onClick={() => setRuns([])} testId="new-duel-btn">New duel</Btn></div>
          <Broadcast key={runs.join("-")} runIds={runs} title="Live duel" />
          <div className={`grid ${runs.length > 1 ? "two" : ""}`}>{runs.map(id => <RunPlayer key={id} runId={id} compact={runs.length > 1} />)}</div>
        </section>
      ) : (
        <div className="grid two">
          <Card testId="competitor-picker">
            <h3>Competitors</h3>
            {!user && <Notice>Sign in to race your own crabs. <Link to="/login">Sign in</Link></Notice>}
            {user && !crabs.length && <Notice>No crabs yet. <Link to="/builder">Build one in the Crab Builder</Link>.</Notice>}
            <div className="picker">
              {crabs.map(c => (
                <button key={c.id} className={`pick ${picked.includes(c.id) ? "on" : ""}`} onClick={() => toggle(c.id)} data-testid={`pick-crab-${c.id}`}>
                  <Crab size={54} color={c.color} accent={c.accent} accessory={c.accessory} mood={picked.includes(c.id) ? "snap" : "idle"} />
                  <span><b>{c.name}</b><small>{c.provider} · Lv {c.level}</small></span>
                </button>
              ))}
            </div>
            <h4>Champion agents <small className="muted">Pro · your own key</small></h4>
            <div className="picker">
              {adapters.filter(a => a.id !== "crab").map(a => {
                const id = `adapter:${a.id}`, on = picked.includes(id), look = a.look || {};
                return (
                  <button key={a.id} className={`pick ${on ? "on" : ""}`} disabled={!user || !a.available} onClick={() => toggle(id)} data-testid={`adapter-${a.id}`}>
                    <Crab size={54} color={look.color} accent={look.accent} accessory={look.accessory} mood={on ? "snap" : "idle"} />
                    <span><b>{a.name}</b><small>{a.model || a.vendor} · {a.tier === "external" ? "your webhook" : a.provider}</small></span>
                  </button>
                );
              })}
            </div>
            <Notice kind="error" testId="arena-error">{error}</Notice>
            <Btn onClick={start} disabled={!picked.length || busy} testId="start-duel-btn">{busy ? "Launching…" : picked.length > 1 ? "Start duel" : "Start run"}</Btn>
          </Card>
          <SelfReport />
        </div>
      )}
      {user && (
        <>
          <SquadCard crabs={crabs} champions={champions} onRelay={startRelay}
            onEnter={ids => { setPreset(ids); document.getElementById("tournament")?.scrollIntoView({ behavior: "smooth" }); }} />
          <div id="tournament">
            <TournamentPanel crabs={crabs} champions={champions} adapters={adapters} preset={preset}
              onWatch={ids => { setRuns(ids.filter(Boolean)); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
          </div>
        </>
      )}
      <section className="stack">
        <h2 className="section-title">Champion replays</h2>
        <div className="row wrap">
          {replays.map(r => (
            <button key={r.id} className={`chip ${watch === r.id ? "on" : ""}`} onClick={() => setWatch(r.id)} data-testid={`replay-chip-${r.id}`}>
              {r.champion_label} · {r.score?.total ?? "—"} pts
            </button>
          ))}
          {!replays.length && <p className="muted">Champion replays are being recorded.</p>}
        </div>
        {watch && <Broadcast key={`b-${watch}`} runIds={[watch]} title="Champion replay" />}
        {watch && <RunPlayer key={watch} runId={watch} />}
      </section>
    </Page>
  );
}
