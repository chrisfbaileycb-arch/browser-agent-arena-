import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, Linkedin, Mail, Send, Twitter } from "lucide-react";
import { BACKEND, post } from "../api";
import { useAuth } from "../auth";
import { COURSES, CoursePicker } from "./courses";
import { Btn, Notice, SignInModal } from "./ui";

const KINDS = [["copilot", "Copilot"], ["comet", "Comet"], ["other", "Other"]];

export function ShareLinks({ invite }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/c/${invite.slug}`;
  const card = `${BACKEND}/api/public/c/${invite.slug}/card`;
  const text = `I challenge you: run ${invite.agent_label} through the ${COURSES[invite.course_id].short}${invite.time_to_beat ? ` and beat my ${invite.time_to_beat.elapsed_s}s` : ""}.`;
  const copy = () => navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); });
  return (
    <div className="share-links" data-testid="invite-share">
      <code className="mono course-url" data-testid="invite-link">{url}</code>
      <div className="row wrap">
        <Btn kind="ghost" onClick={copy} testId="invite-copy-btn"><Copy size={14} /> {copied ? "Copied!" : "Copy link"}</Btn>
        <a className="btn btn-ghost" target="_blank" rel="noreferrer" data-testid="invite-share-x" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(card)}`}><Twitter size={14} /> X</a>
        <a className="btn btn-ghost" target="_blank" rel="noreferrer" data-testid="invite-share-linkedin" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(card)}`}><Linkedin size={14} /> LinkedIn</a>
        <a className="btn btn-ghost" data-testid="invite-share-email" href={`mailto:?subject=${encodeURIComponent("Browser agent challenge")}&body=${encodeURIComponent(`${text}\n\n${url}`)}`}><Mail size={14} /> Email</a>
      </div>
    </div>
  );
}

export default function ChallengeInvite({ defaultCourse = "obstacle-1", defaultKind = "copilot", testId = "challenge-btn" }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState(false);
  const [course, setCourse] = useState(defaultCourse);
  const [kind, setKind] = useState(defaultKind);
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState("");
  const show = () => { if (!user) return setAsk(true); setCourse(defaultCourse); setInvite(null); setError(""); return setOpen(true); };
  const create = () => { setError(""); post("/invites", { course_id: course, agent_kind: kind }).then(setInvite).catch(e => setError(e.message)); };
  return (
    <>
      <Btn kind="ghost" onClick={show} testId={testId}><Send size={14} /> Challenge a friend</Btn>
      <SignInModal open={ask} onClose={() => setAsk(false)} why="Sign in to create a challenge link for a friend." />
      {open && (
        <div className="modal-back" onClick={() => setOpen(false)} data-testid="challenge-modal">
          <motion.div className="modal card challenge-modal" role="dialog" aria-modal="true" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={e => e.stopPropagation()}>
            <h3>Challenge a friend</h3>
            <p className="muted">They get a link, run the agent in their own browser and submit the finish code. Self-submitted runs never use up their free run. Links last 14 days and allow up to 25 friends.</p>
            {!invite ? (
              <>
                <CoursePicker value={course} onChange={setCourse} testId="challenge-course" />
                <div className="row wrap">{KINDS.map(([id, n]) => <button key={id} className={`chip ${kind === id ? "on" : ""}`} onClick={() => setKind(id)} data-testid={`challenge-kind-${id}`}>{n}</button>)}</div>
                <div className="row"><Btn onClick={create} testId="challenge-create-btn">Create challenge link</Btn></div>
              </>
            ) : <ShareLinks invite={invite} />}
            <Notice kind="error" testId="challenge-error">{error}</Notice>
            <button className="btn btn-ghost" onClick={() => setOpen(false)} data-testid="challenge-close-btn">Close</button>
          </motion.div>
        </div>
      )}
    </>
  );
}
