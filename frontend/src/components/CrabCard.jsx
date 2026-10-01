import { WeeklyBadges } from "./WeeklyBadge";
import { useEffect, useRef, useState } from "react";
import { RotateCw, Sparkles } from "lucide-react";
import { api } from "../api";
import Crab, { REDUCED_MOTION } from "./Crab";

const STADIUM = "https://static.prod-images.emergentagent.com/jobs/5b21c154-6c88-4ccc-a5ab-291d7867b4c8/images/03773c30492c21978d07ae5798ff702897779ada20c1791ac8dc2de2e6667e5e.jpeg";
const STATS = [["speed", "Speed"], ["accuracy", "Accuracy"], ["dodge", "Decoy dodge"]];

// One request per page for every card's stats.
export function useCards(ids) {
  const [cards, setCards] = useState({});
  const key = [...new Set(ids.filter(Boolean))].slice(0, 24).join(",");
  useEffect(() => {
    if (!key) return;
    api(`/cards?ids=${key}`).then(list => setCards(Object.fromEntries(list.map(c => [c.id, c])))).catch(() => {});
  }, [key]);
  return cards;
}

function Front({ look, card, size, flipped, extra }) {
  const xpPct = card ? Math.min(100, (card.xp / card.xp_next) * 100) : 0;
  return (
    <div className="cc-face cc-front">
      <div className="cc-bg" style={{ backgroundImage: `url(${STADIUM})` }} />
      <div className="cc-glow" />
      <div className="cc-crab">{!flipped && <Crab size={Math.round(size * 0.5)} mood="idle" color={look.color} accent={look.accent} accessory={look.accessory} label={`${look.name} 3D`} />}</div>
      <div className="cc-top"><span className="cc-rarity">{card?.rarity || look.tier || "rookie"}</span>{card && <span className="cc-level">LV {card.level}</span>}</div>
      <div className="cc-body">
        <h3 className="cc-name">{look.name}</h3>
        <small className="cc-sub">{extra || card?.subtitle || (look.champion ? "Champion agent" : "Arena crab")}</small>
        {card ? (
          <>
            {STATS.map(([k, label]) => (
              <div key={k} className="cc-stat"><span>{label}</span><i><b style={{ width: `${card.stats[k]}%` }} /></i><em>{card.stats[k]}</em></div>
            ))}
            <div className="cc-stat cc-xp"><span>XP</span><i><b style={{ width: `${xpPct}%` }} /></i><em>{card.xp}</em></div>
            {card.weekly_badges?.length > 0 && <div className="cc-weekly"><WeeklyBadges list={card.weekly_badges} testId={`cc-weekly-${card.id}`} /></div>}
            <div className="cc-foot"><span><b>{card.wins}</b>W · <b>{card.losses}</b>L</span>{card.badges.slice(0, 3).map(b => <span key={b} className="cc-badge">{b}</span>)}</div>
          </>
        ) : <p className="cc-empty">{look.champion ? "Computer-use champion · stats tracked per run" : "No runs yet"}</p>}
      </div>
    </div>
  );
}

function Back({ look, card }) {
  return (
    <div className="cc-face cc-back">
      <h4>{look.name} · run history</h4>
      <ol className="cc-history">
        {(card?.history || []).map((h, i) => (
          <li key={i} className={h.status}><span>{new Date(h.at).toLocaleDateString()}</span><b>{h.status === "succeeded" ? "Cleared" : "Failed"}</b><em>{h.score ?? "—"} pts · {h.steps} steps · {h.elapsed ?? "—"}s</em></li>
        ))}
        {!card?.history?.length && <li>No runs recorded yet.</li>}
      </ol>
      <h4><Sparkles size={13} /> Memory highlights</h4>
      <ul className="cc-memory">{(card?.memory || []).map((m, i) => <li key={i}>{m}</li>)}{!card?.memory?.length && <li>Nothing learned yet.</li>}</ul>
    </div>
  );
}

export default function CrabCard({ crab, card, size = 240, extra, testId, children }) {
  const ref = useRef(null);
  const [flipped, setFlipped] = useState(false);
  const look = { ...crab, ...(card || {}), name: card?.name || crab?.name || "Crab" };
  const move = e => {
    if (REDUCED_MOTION || !ref.current) return;
    const r = ref.current.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    const s = ref.current.style;
    s.setProperty("--rx", `${(0.5 - y) * 16}deg`); s.setProperty("--ry", `${(x - 0.5) * 20}deg`);
    s.setProperty("--mx", `${x * 100}%`); s.setProperty("--my", `${y * 100}%`); s.setProperty("--px", `${(x - 0.5) * 2}`); s.setProperty("--py", `${(y - 0.5) * 2}`);
  };
  const leave = () => ["--rx", "--ry", "--px", "--py"].forEach(p => ref.current?.style.setProperty(p, p.startsWith("--r") ? "0deg" : "0"));
  return (
    <div className={`ccard r-${card?.rarity || "bronze"} ${flipped ? "flipped" : ""}`} style={{ "--w": `${size}px`, "--c": look.color || "#FF5A4E" }}
      ref={ref} onPointerMove={move} onPointerLeave={leave} data-testid={testId}>
      <div className="cc-inner">
        <Front look={look} card={card} size={size} flipped={flipped} extra={extra} />
        <Back look={look} card={card} />
        <div className="cc-foil" />
      </div>
      <button className="cc-flip" onClick={() => setFlipped(f => !f)} aria-label="Flip card" data-testid={testId && `${testId}-flip`}><RotateCw size={14} /></button>
      {children && <div className="cc-actions">{children}</div>}
    </div>
  );
}
