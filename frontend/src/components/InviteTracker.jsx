import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { api, del } from "../api";
import { useAuth } from "../auth";
import { COURSES } from "./courses";
import { ShareLinks } from "./ChallengeInvite";
import { Badge, Card } from "./ui";

export default function InviteTracker({ compact = false }) {
  const { user } = useAuth();
  const [invites, setInvites] = useState(null);
  const load = () => api("/invites").then(setInvites).catch(() => setInvites([]));
  useEffect(() => { if (user) load(); }, [user]);
  if (!user || !invites?.length) return null;
  const results = invites.flatMap(i => i.friends.filter(f => f.verified).map(f => ({ ...f, invite: i })));
  if (compact) {
    return results.length ? (
      <Card className="invite-notice" testId="invite-notifications">
        <h3><Bell size={16} /> Challenge results</h3>
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
      {invites.map(inv => (
        <details key={inv.id} className="invite-row" data-testid={`invite-row-${inv.slug}`}>
          <summary>
            <Badge kind={inv.status === "active" ? "succeeded" : "neutral"}>{inv.status}</Badge>
            <b>{inv.agent_label}</b> on {COURSES[inv.course_id].short}
            <span className="mono small" data-testid={`invite-counts-${inv.slug}`}>{inv.counts.accepted} accepted · {inv.counts.started} started · {inv.counts.finished} finished · {inv.uses}/{inv.max_uses} uses</span>
          </summary>
          {inv.status === "active" && <ShareLinks invite={inv} />}
          <ul className="invite-friends">{inv.friends.map((f, k) => (
            <li key={k}><b>{f.name}</b> · {f.verified ? `finished in ${f.elapsed_s}s (score ${f.score})` : f.finished ? "reached the finish, code not submitted" : f.started ? "racing…" : "accepted"}</li>
          ))}{!inv.friends.length && <li className="muted">No one has accepted yet.</li>}</ul>
          {inv.status === "active" && <button className="link" onClick={() => revoke(inv.id)} data-testid={`invite-revoke-${inv.slug}`}><X size={12} /> Revoke link</button>}
        </details>
      ))}
    </Card>
  );
}
