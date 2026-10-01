import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, Flag } from "lucide-react";
import { api, put } from "../api";
import { useAuth } from "../auth";
import Broadcast from "./Broadcast";
import { COURSES, COURSE_IDS } from "./courses";
import { Badge } from "./ui";

function useCountdown(iso) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((new Date(iso) - now) / 1000));
  return `${Math.floor(s / 86400)}d ${Math.floor(s / 3600) % 24}h ${String(Math.floor(s / 60) % 60).padStart(2, "0")}m ${String(s % 60).padStart(2, "0")}s`;
}

function AdminOverride({ data, onChange }) {
  const set = v => put("/admin/featured", { course_id: v || null }).then(onChange).catch(() => {});
  return (
    <label className="cow-admin" data-testid="cow-admin">Admin override
      <select value={data.source === "override" ? data.course_id : ""} onChange={e => set(e.target.value)} data-testid="cow-admin-select">
        <option value="">Automatic weekly rotation</option>
        {COURSE_IDS.map(id => <option key={id} value={id}>{COURSES[id].short}</option>)}
      </select>
    </label>
  );
}

export default function CourseOfWeek() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const load = () => api("/featured").then(setData).catch(() => {});
  useEffect(() => { load(); }, []);
  const left = useCountdown(data?.next_rotation_at);
  if (!data) return <div className="cow shimmer" data-testid="cow-loading" />;
  const c = COURSES[data.course_id];
  return (
    <section className={`cow theme-${c.theme}`} data-testid="course-of-week">
      <div className="cow-info">
        <p className="eyebrow"><CalendarClock size={14} /> Course of the week {data.source === "override" && <Badge kind="sun" testId="cow-override-badge">Featured by admins</Badge>}</p>
        <h2 data-testid="cow-name">{c.short}</h2>
        <p className="muted">{data.stations} stations · rotates every Monday 00:00 UTC · next in <b className="mono" data-testid="cow-countdown">{left}</b></p>
        {data.top.length ? (
          <ol className="cow-top" data-testid="cow-top">
            {data.top.map((r, i) => (
              <li key={i} data-testid={`cow-top-${i}`}><span className="mono">#{i + 1}</span><b>{r.agent}</b>
                <Badge kind={r.badge === "verified" ? "succeeded" : "sun"}>{r.badge === "verified" ? "Verified" : "Self-reported"}</Badge>
                <span className="mono">{r.elapsed_s}s · {r.score?.total ?? r.score}</span></li>
            ))}
          </ol>
        ) : <p className="cow-empty" data-testid="cow-empty">No finishes on this course yet. Be the first on the board.</p>}
        <div className="row wrap">
          <Link className="btn btn-primary" to={`/arena?course=${data.course_id}`} data-testid="cow-race-btn"><Flag size={15} /> Race it now</Link>
          {user?.role === "admin" && <AdminOverride data={data} onChange={load} />}
        </div>
      </div>
      <div className="cow-replay" data-testid="cow-replay">
        {data.replay_run_id ? <Broadcast key={data.replay_run_id} runIds={[data.replay_run_id]} title="Best verified run" spectator />
          : <div className="cow-empty-art"><p>No champion replay yet for this course.</p></div>}
      </div>
    </section>
  );
}
