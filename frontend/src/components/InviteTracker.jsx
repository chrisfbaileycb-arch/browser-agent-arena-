import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Swords, X } from "lucide-react";
import { api, del } from "../api";
import { useAuth } from "../auth";
import { COURSES } from "./courses";
import { ShareLinks } from "./ChallengeInvite";
import { Badge, Card } from "./ui";

export default function InviteTracker({ compact = false }) {
  const { user } = useAuth();
  const [invites, setInvites] = useState(null);
  const [inbox, setInbox] = useState([]);
  const load = () => { api("/invites").then(setInvites).catch(() => setInvites([])); api("/invites/inbox").then(setInbox).catch(() => {}); };
  useEffect(() => { if (user) load(); }, [user]);
  const Inbox = () => inbox.length > 0 && (
    <div className="rematch-inbox" data-testid="rematch-inbox">
      {inbox.map((m, k) => <Link key={m.slug} to={`/c/${m.slug}`} className="rematch-note" data-testid={`rematch-note-${k}`}><Swords size={14} /> {m.message} <small>Rematch #{m.rematch_n} · {COURSES[m.course_id].short}</small></Link>)}
    </div>
  );
  if (!user || (!invites?.length && !inbox.length)) return null;
  const results = invites.flatMap(i => i.friends.filter(f => f.verified).map(f => ({ ...f, invite: i })));
  if (compact) {
    return results.length || inbox.length ? (
      <Card className="invite-notice" testId="invite-notifications">
        <h3><Bell size={16} /> Challenge results</h3>
        <Inbox />
        <ul>{results.slice(0, 4).map((r, k) => (
          <li key={k} data-testid={`invite-result-${k}`}><b>{r.name}</b> finished your {COURSES[r.invite.course_id].short} challenge in <b>{r.elapsed_s}s</b> (score {r.score})
            {r.invite.time_to_beat && <> · {r.elapsed_s < r.invite.time_to_beat.elapsed_s ? "beat your time!" : "your time holds"}</>}</li>
        ))}</ul>
      </Card>
    ) : null;
  }
  const revoke = id => del(`/invites/${id}`).then(load).catch(() => {});
  return (
    <Card testId="invite-tracker">
      <h3>My challenges</h3>
      <Inbox />
      {(invites || []).map(inv => (
        <details key={inv.id} className="invite-row" data-testid={`invite-row-${inv.slug}`}>
          <summary>
            <Badge kind={inv.status === "active" ? "succeeded" : "neutral"}>{inv.status}</Badge>
            {inv.rematch_n > 0 && <span className="chain-tag" data-testid={`invite-chain-${inv.slug}`}>Rematch #{inv.rematch_n} · {inv.direction === "received" ? `from ${inv.inviter}` : "sent"}</span>}
            <b>{inv.agent_label}</b> on {COURSES[inv.course_id].short}
            <span className="mono small" data-testid={`invite-counts-${inv.slug}`}>{inv.counts.accepted} accepted · {inv.counts.started} started · {inv.counts.finished} finished · {inv.uses}/{inv.max_uses} uses</span>
          </summary>
          {inv.status === "active" && inv.direction === "sent" && <ShareLinks invite={inv} />}
          {inv.direction === "received" && <Link className="link" to={`/c/${inv.slug}`}>Open rematch</Link>}
          <ul className="invite-friends">{inv.friends.map((f, k) => (
            <li key={k}><b>{f.name}</b> · {f.verified ? `finished in ${f.elapsed_s}s (score ${f.score})` : f.finished ? "reached the finish, code not submitted" : f.started ? "racing…" : "accepted"}
              {f.rematch && <> · <Link to={`/c/${f.rematch.slug}`} data-testid={`invite-chain-link-${f.rematch.slug}`}>sent you Rematch #{f.rematch.n}</Link></>}</li>
          ))}{!inv.friends.length && <li className="muted">No one has accepted yet.</li>}</ul>
          {inv.status === "active" && inv.direction === "sent" && <button className="link" onClick={() => revoke(inv.id)} data-testid={`invite-revoke-${inv.slug}`}><X size={12} /> Revoke link</button>}
        </details>
      ))}
    </Card>
  );
}
