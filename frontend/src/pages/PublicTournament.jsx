import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Eye } from "lucide-react";
import { api } from "../api";
import Broadcast from "../components/Broadcast";
import RunPlayer from "../components/RunPlayer";
import { Bracket } from "../components/Tournament";
import { Badge, Head, Page } from "../components/ui";

function setMeta(property, content) {
  let el = document.head.querySelector(`meta[property="${property}"]`);
  if (!el) { el = Object.assign(document.createElement("meta"), { content }); el.setAttribute("property", property); document.head.appendChild(el); }
  el.content = content;
}

export default function PublicTournament() {
  const { slug } = useParams();
  const [t, setT] = useState(null);
  const [error, setError] = useState("");
  const [duel, setDuel] = useState(null);
  useEffect(() => {
    api(`/public/t/${slug}`).then(d => {
      setT(d);
      document.title = `${d.name} · Browser Agent Arena`;
      setMeta("og:title", `${d.name}${d.champion ? ` · Champion: ${d.champion.name}` : ""}`);
      setMeta("og:image", `${window.location.origin}/api/public/t/${slug}/og.png`);
      const last = d.rounds.flat().reverse().find(m => m.run_a);
      if (last) setDuel([last.run_a, last.run_b].filter(Boolean));
    }).catch(e => setError(e.message));
  }, [slug]);
  const base = `/public/t/${slug}/runs`;
  if (error) return <Page testId="public-tournament-page"><Head eyebrow="Shared tournament" title="Link unavailable">{error}</Head></Page>;
  if (!t) return <Page testId="public-tournament-page"><div className="card shimmer">Loading bracket…</div></Page>;
  return (
    <Page testId="public-tournament-page">
      <Head eyebrow="Shared tournament · read-only" title={t.name}>{t.entrants.length} agents raced the {t.course}. Pick any duel to watch its real replay.</Head>
      <div className="row"><Badge kind="neutral"><Eye size={13} /> <span data-testid="public-views">{t.views}</span> views</Badge><Badge kind={t.status === "done" ? "succeeded" : "sun"}>{t.status}</Badge></div>
      <Bracket t={t} onWatch={ids => setDuel(ids.filter(Boolean))} />
      {duel && <Broadcast key={duel.join("-")} runIds={duel} base={base} spectator title="Duel replay" />}
      {duel && <div className={`grid ${duel.length > 1 ? "two" : ""}`}>{duel.map(id => <RunPlayer key={id} runId={id} base={base} compact={duel.length > 1} />)}</div>}
    </Page>
  );
}
