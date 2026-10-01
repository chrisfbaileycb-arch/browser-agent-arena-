import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Crown, PlayCircle, Video } from "lucide-react";
import { api } from "../api";
import Broadcast from "../components/Broadcast";
import RunPlayer from "../components/RunPlayer";
import CrabCard from "../components/CrabCard";
import Crab2D from "../components/Crab2D";
import WeeklyBadge from "../components/WeeklyBadge";
import { COURSES, COURSE_IDS } from "../components/courses";
import { Badge, Card, Head, Page } from "../components/ui";

function Stats({ stats }) {
  return (
    <div className="hall-stats" data-testid="hall-stats">
      <Card testId="hall-total-weeks"><small>Weeks crowned</small><b>{stats.total_weeks}</b></Card>
      <Card testId="hall-most-crowns"><small>Most crowns</small>
        {stats.most_crowns.length ? <ol>{stats.most_crowns.map((u, i) => <li key={u.user_key} data-testid={`hall-crowns-${i}`}><b>{u.winner}</b> · <Crown size={12} /> {u.crowns} {u.crowns === 1 ? "crown" : "crowns"}</li>)}</ol> : <p className="muted">—</p>}
      </Card>
      <Card testId="hall-reigning"><small>Reigning champions</small>
        {COURSE_IDS.map(id => { const r = stats.reigning.find(x => x.course_id === id); return (
          <p key={id} data-testid={`hall-reigning-${id}`}>{COURSES[id].short}: {r ? <a href={`#badge-${r.badge_id}`}><b>{r.winner}</b> · {r.label}</a> : <span className="muted">no champion yet</span>}</p>); })}
      </Card>
    </div>
  );
}

function Entry({ e, active, onWatch }) {
  return (
    <article id={`badge-${e.id}`} className={`hall-entry theme-${COURSES[e.course_id]?.theme} ${active ? "focus" : ""}`} data-testid={`hall-entry-${e.id}`}>
      <div className="hall-art">
        {e.card ? <CrabCard crab={e.card} card={e.card} size={170} testId={`hall-card-${e.id}`} />
          : <div className="hall-crab"><Crab2D size={110} color={e.look?.color || "#FFD23F"} accent={e.look?.accent || "#FF9F1C"} accessory={e.look?.accessory || "crown"} /></div>}
      </div>
      <div className="hall-body">
        <div className="row wrap"><WeeklyBadge b={e} testId={`hall-badge-${e.id}`} link={false} /><Badge kind={e.category === "verified" ? "succeeded" : "sun"}>{e.category === "verified" ? "Verified" : "Self-reported"}</Badge></div>
        <h3><Crown size={18} /> {e.winner}</h3>
        <p className="muted">{e.course} · {e.title}{e.agent_label ? ` · ${e.agent_label}` : ""}</p>
        <p className="mono" data-testid={`hall-score-${e.id}`}>Score {e.score} · server time {e.elapsed_s}s</p>
        {e.replay ? <button className="btn btn-primary" onClick={() => onWatch(e.id)} data-testid={`hall-watch-${e.id}`}><PlayCircle size={15} /> Watch replay</button>
          : e.recording_url ? <a className="btn btn-ghost" href={e.recording_url} target="_blank" rel="noreferrer nofollow" data-testid={`hall-recording-${e.id}`}><Video size={15} /> Watch recording</a>
            : <span className="muted" data-testid={`hall-no-replay-${e.id}`}>No replay — self-reported</span>}
      </div>
    </article>
  );
}

export default function Hall() {
  const { hash } = useLocation();
  const [course, setCourse] = useState("");
  const [category, setCategory] = useState("");
  const [data, setData] = useState(null);
  const [watch, setWatch] = useState(null);
  useEffect(() => {
    const q = new URLSearchParams(Object.entries({ course_id: course, category }).filter(([, v]) => v)).toString();
    api(`/hall${q ? `?${q}` : ""}`).then(setData).catch(() => setData({ entries: [], stats: { total_weeks: 0, most_crowns: [], reigning: [] } }));
  }, [course, category]);
  const focus = hash.startsWith("#badge-") ? hash.slice(7) : null;
  useEffect(() => { if (focus && data) document.getElementById(`badge-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [focus, data]);
  const chip = (v, cur, set, label, id) => <button key={id} className={`chip ${cur === v ? "on" : ""}`} onClick={() => set(v)} data-testid={id}>{label}</button>;
  return (
    <Page testId="hall-page">
      <Head eyebrow="Hall of Champions" title="Every weekly crown, ever">Winners of each week's Course of the Week, in two categories: harness-verified and self-reported. Platform champion crabs don't compete.</Head>
      {data && <Stats stats={data.stats} />}
      <div className="row wrap">
        {chip("", course, setCourse, "All courses", "hall-course-all")}{COURSE_IDS.map(id => chip(id, course, setCourse, COURSES[id].short, `hall-course-${id}`))}
        <span className="sep" />
        {chip("", category, setCategory, "Both categories", "hall-cat-all")}{chip("verified", category, setCategory, "Verified", "hall-cat-verified")}{chip("self_reported", category, setCategory, "Self-reported", "hall-cat-self_reported")}
      </div>
      {watch && (
        <section className="hall-replay" data-testid="hall-replay">
          <Broadcast key={watch} runIds={[watch]} base="/hall/runs" spectator title="Champion replay" />
          <RunPlayer runId={watch} base="/hall/runs" />
          <button className="btn btn-ghost" onClick={() => setWatch(null)} data-testid="hall-replay-close">Close replay</button>
        </section>
      )}
      {!data && <div className="card shimmer" style={{ minHeight: 200 }} />}
      {data && !data.entries.length && (
        <div className="h2h-empty light" data-testid="hall-empty"><b>No champions crowned yet — first week closes {new Date(data.first_close_at).toUTCString().replace(":00 GMT", " UTC")}</b></div>
      )}
      <div className="hall-list">{data?.entries.map(e => <Entry key={e.id} e={e} active={focus === e.id} onWatch={id => { setWatch(id); window.scrollTo({ top: 0, behavior: "smooth" }); }} />)}</div>
    </Page>
  );
}
