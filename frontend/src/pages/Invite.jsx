import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Flag, Timer, Trophy } from "lucide-react";
import { api, post } from "../api";
import { googleLogin, useAuth } from "../auth";
import Crab from "../components/Crab";
import SelfReport from "../components/SelfReport";
import { COURSES } from "../components/courses";
import { Btn, Card, Notice, Page } from "../components/ui";

const LOOK = { copilot: ["#2F6BFF", "#7CF5E4", "headset"], comet: ["#14B8A6", "#FFD23F", "goggles"], other: ["#9A8FB0", "#FFD23F", "cap"] };

export default function Invite() {
  const { slug } = useParams();
  const { user } = useAuth();
  const [inv, setInv] = useState(null);
  const [error, setError] = useState("");
  const [started, setStarted] = useState(0);
  useEffect(() => { api(`/public/c/${slug}`).then(setInv).catch(e => setError(e.message)); }, [slug, user]);
  const accept = () => { setError(""); post(`/invites/${slug}/accept`).then(() => setStarted(n => n + 1)).catch(e => setError(e.message)); };
  if (error && !inv) return <Page testId="invite-page"><Card><h2>Challenge not found</h2><Notice kind="error" testId="invite-error">{error}</Notice></Card></Page>;
  if (!inv) return <Page testId="invite-page"><div className="card shimmer">Loading challenge…</div></Page>;
  const [color, accent, accessory] = LOOK[inv.agent_kind];
  const course = COURSES[inv.course_id];
  const active = inv.status === "active";
  return (
    <Page testId="invite-page">
      <section className={`invite-hero theme-${course.theme}`}>
        <Crab size={150} color={color} accent={accent} accessory={accessory} mood="snap" />
        <div>
          <p className="eyebrow">Challenge</p>
          <h1 data-testid="invite-title"><span>{inv.inviter}</span> challenged you</h1>
          <p>Run <b data-testid="invite-agent">{inv.agent_label}</b> through <b data-testid="invite-course">{course.short}</b>.</p>
          <div className="invite-beat" data-testid="invite-time-to-beat"><Timer size={18} />{inv.time_to_beat ? <>Time to beat: <b>{inv.time_to_beat.elapsed_s}s</b> <small>({inv.time_to_beat.agent_label}, score {inv.time_to_beat.score})</small></> : "No time set yet. Set the first one."}</div>
          {!active && <Notice kind="error" testId="invite-status">This challenge link is {inv.status}.</Notice>}
        </div>
      </section>
      <div className="grid-3 invite-how">
        <Card><Flag size={18} /><h3>1. Get your attempt link</h3><p className="muted">A one-time link to the course, valid for 2 hours.</p></Card>
        <Card><Trophy size={18} /><h3>2. Run {inv.agent_label}</h3><p className="muted">Point your agent at the link in its own browser. Our server times it from start line to finish flag.</p></Card>
        <Card><Timer size={18} /><h3>3. Submit the finish code</h3><p className="muted">Paste the code to land on the leaderboard with a Self-reported badge. Doesn't use your free run.</p></Card>
      </div>
      {active && !user && (
        <Card testId="invite-signin">
          <h3>Sign up to accept</h3>
          <div className="row wrap">
            <Link className="btn btn-primary" to="/login" state={{ from: `/c/${slug}` }} data-testid="invite-login-btn">Sign up or sign in with email</Link>
            <Btn kind="ghost" onClick={() => googleLogin(`/c/${slug}`)} testId="invite-google-btn">Continue with Google</Btn>
          </div>
        </Card>
      )}
      {active && user && inv.is_inviter && <Notice testId="invite-own">This is your challenge. Share the link with a friend.</Notice>}
      {active && user && !inv.is_inviter && !started && <Btn onClick={accept} testId="invite-accept-btn">Start my {inv.agent_label} attempt</Btn>}
      <Notice kind="error" testId="invite-accept-error">{error}</Notice>
      {started > 0 && <SelfReport key={started} courseId={inv.course_id} />}
    </Page>
  );
}
