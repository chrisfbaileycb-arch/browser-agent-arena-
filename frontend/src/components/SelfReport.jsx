import { useEffect, useState } from "react";
import { BadgeCheck, Bot, Clock, ExternalLink, Globe, RotateCcw, Sparkles } from "lucide-react";
import { api, BACKEND, post } from "../api";
import { useAuth } from "../auth";
import { Badge, Btn, Card, Notice, SignInModal } from "./ui";
import { COURSES } from "./courses";

const AGENTS = [["copilot", "Copilot", Bot], ["comet", "Comet", Sparkles], ["other", "Other", Globe]];

function useCountdown(iso) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!iso) return null;
  const s = Math.max(0, Math.floor((new Date(iso) - now) / 1000));
  return `${Math.floor(s / 3600)}h ${String(Math.floor(s / 60) % 60).padStart(2, "0")}m ${String(s % 60).padStart(2, "0")}s`;
}

function AgentPicker({ kind, setKind, name, setName, onStart }) {
  return (
    <div className="self-picker">
      <div className="row wrap">
        {AGENTS.map(([id, label, Icon]) => (
          <button key={id} className={`chip ${kind === id ? "on" : ""}`} onClick={() => setKind(id)} data-testid={`self-report-agent-${id}`}><Icon size={14} /> {label}</button>
        ))}
      </div>
      <div className="row wrap">
        {kind === "other" && <input placeholder="Agent name" maxLength={80} value={name} onChange={e => setName(e.target.value)} data-testid="self-report-label-input" />}
        <Btn onClick={onStart} testId="self-report-start-btn">Get my attempt link</Btn>
      </div>
    </div>
  );
}

function Result({ r }) {
  return (
    <div className="self-result" data-testid="self-report-result">
      <Badge kind="succeeded"><BadgeCheck size={13} /> Code verified</Badge>
      <b data-testid="self-report-result-score">Score {r.score?.total}</b>
      <span className="mono" data-testid="self-report-result-time">Server time {r.server_elapsed_s}s{r.reported_elapsed_s != null ? ` · you reported ${r.reported_elapsed_s}s` : ""}</span>
    </div>
  );
}

export default function SelfReport({ courseId = "obstacle-1" }) {
  const { user } = useAuth();
  const [ask, setAsk] = useState(false);
  const [kind, setKind] = useState("copilot");
  const [name, setName] = useState("");
  const [attempt, setAttempt] = useState(null);
  const [form, setForm] = useState({ code: "", time: "", recording: "" });
  const [msg, setMsg] = useState("");
  const [result, setResult] = useState(null);
  const left = useCountdown(attempt && !attempt.finished ? attempt.expires_at : null);
  const live = attempt && !attempt.submitted_at && !attempt.expired;

  useEffect(() => {
    if (user) api("/course-attempts/mine").then(list => setAttempt(list.find(a => !a.submitted_at && !a.expired) || null)).catch(() => {});
  }, [user]);
  useEffect(() => {
    if (!live || attempt.finished) return undefined;
    const t = setInterval(() => api(`/course-attempts/${attempt.id}`).then(setAttempt).catch(() => {}), 5000);
    return () => clearInterval(t);
  }, [live, attempt?.id, attempt?.finished]);

  const start = () => {
    if (!user) return setAsk(true);
    setMsg(""); setResult(null); setForm({ code: "", time: "", recording: "" });
    return post("/course-attempts", { course_id: courseId, agent_kind: kind, agent_label: name }).then(setAttempt).catch(e => setMsg(e.message));
  };
  const submit = () => {
    setMsg("");
    post(`/course-attempts/${attempt.id}/submit`, { code: form.code, reported_elapsed_s: form.time ? Number(form.time) : undefined, recording_url: form.recording || undefined })
      .then(r => { setResult(r); setAttempt(a => ({ ...a, submitted_at: r.submitted_at || "now" })); })
      .catch(e => setMsg(e.message));
  };
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const url = attempt ? `${BACKEND}${attempt.start_path}` : "";

  return (
    <Card testId="self-report-panel">
      <h3>Self-reported run: Copilot, Comet or any agent</h3>
      <p className="muted">Course: <b data-testid="self-report-course-name">{COURSES[courseId].short}</b>. Pick your agent and get a one-time attempt link. Run your agent on that link in its own browser, then submit the finish code it gets. We time the run on our server from the start line to the finish flag, so your entered time is only shown next to ours.</p>
      {!live && !result && <AgentPicker kind={kind} setKind={setKind} name={name} setName={setName} onStart={start} />}
      {live && (
        <div className="self-live" data-testid="self-report-attempt">
          <div className="row wrap">
            <Badge kind="sun" testId="self-report-agent-badge">{attempt.agent_label}</Badge>
            <span className="mono small" data-testid="self-report-course">{COURSES[attempt.course_id]?.short}</span>
            <span className="mono small" data-testid="self-report-progress">{attempt.stations_cleared}/{attempt.stations_total} stations{attempt.finished ? ` · finished in ${attempt.server_elapsed_s}s` : ""}</span>
            {left && <span className="mono small" data-testid="self-report-expiry"><Clock size={12} /> expires in {left}</span>}
          </div>
          <a className="link" href={url} target="_blank" rel="noreferrer" data-testid="self-report-course-link">Open your attempt link <ExternalLink size={13} /></a>
          <code className="mono small course-url" data-testid="self-report-course-url">{url}</code>
          <div className="row wrap">
            <input placeholder="SOE-XXXX-XXXX" value={form.code} onChange={set("code")} data-testid="self-report-code-input" />
            <input type="number" min="0" step="0.1" placeholder="Your time (s)" value={form.time} onChange={set("time")} data-testid="self-report-time-input" />
            <input placeholder="Recording link (optional)" value={form.recording} onChange={set("recording")} data-testid="self-report-recording-input" />
            <Btn onClick={submit} disabled={!form.code} testId="self-report-submit-btn">Submit code</Btn>
            <Btn kind="ghost" onClick={() => { setAttempt(null); setMsg(""); }} testId="self-report-new-btn"><RotateCcw size={14} /> New attempt</Btn>
          </div>
        </div>
      )}
      {result && <><Result r={result} /><Btn kind="ghost" onClick={() => { setResult(null); setAttempt(null); }} testId="self-report-again-btn">Run another agent</Btn></>}
      <Notice kind="error" testId="self-report-message">{msg}</Notice>
      <SignInModal open={ask} onClose={() => setAsk(false)} why="Sign in to get your own attempt link and a verifiable finish code." />
    </Card>
  );
}
