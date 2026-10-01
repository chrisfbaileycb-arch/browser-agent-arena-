import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import InviteTracker from "../components/InviteTracker";
import WeeklyBadge from "../components/WeeklyBadge";
import { Card, Head, Page } from "../components/ui";

export default function Profile() {
  const { user } = useAuth();
  const [badges, setBadges] = useState(null);
  useEffect(() => { api("/me/badges").then(setBadges).catch(() => setBadges([])); }, []);
  return (
    <Page testId="profile-page">
      <Head eyebrow="Profile" title={user?.name || "My profile"}>{user?.email} · {user?.plan} plan</Head>
      <Card testId="profile-badges">
        <h3><Trophy size={16} /> Weekly champion badges</h3>
        {badges?.length ? <div className="row wrap">{badges.map((b, i) => <WeeklyBadge key={b.id} b={b} testId={`profile-badge-${i}`} />)}</div>
          : <p className="muted" data-testid="profile-badges-empty">No weekly titles yet. Win the Course of the Week to earn a crown.</p>}
      </Card>
      <InviteTracker />
    </Page>
  );
}
