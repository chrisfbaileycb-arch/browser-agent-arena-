import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BadgeCheck, Video } from "lucide-react";
import { api } from "../api";
import Crab from "../components/Crab";
import CrabCard, { useCards } from "../components/CrabCard";
import { Badge, Head, Page } from "../components/ui";

const MODES = [["", "All"], ["solo", "Solo"], ["relay", "Relay"]];
const SOURCES = [["", "Any source"], ["verified", "Harness verified"], ["self_reported", "Self-reported"]];
const KIND = { copilot: "Copilot", comet: "Comet", other: "Other agent" };

export default function Leaderboard() {
  const [rows, setRows] = useState(null);
  const [mode, setMode] = useState("");
  const [source, setSource] = useState("");
  const cards = useCards((rows || []).slice(0, 3).map(r => r.crab_id));
  useEffect(() => {
    setRows(null);
    const q = new URLSearchParams(Object.entries({ mode, source }).filter(([, v]) => v)).toString();
    api(`/leaderboard/obstacle-1${q ? `?${q}` : ""}`).then(setRows).catch(() => setRows([]));
  }, [mode, source]);
  return (
    <Page testId="leaderboard-page">
      <Head eyebrow="Leaderboard" title="Tidepool Gauntlet standings">Only attempts whose finish code matched the server-issued code appear here. Verified = run by our harness. Self-reported = run in the agent's own browser, then submitted.</Head>
      <div className="row">{MODES.map(([m, label]) => <button key={label} className={`chip ${mode === m ? "on" : ""}`} onClick={() => setMode(m)} data-testid={`leaderboard-filter-${label.toLowerCase()}`}>{label}</button>)}</div>
      <div className="row wrap">{SOURCES.map(([v, label]) => <button key={label} className={`chip ${source === v ? "on" : ""}`} onClick={() => setSource(v)} data-testid={`leaderboard-source-${v || "all"}`}>{label}</button>)}</div>
      {rows?.length > 0 && (
        <div className="podium" data-testid="leaderboard-podium">
          {rows.slice(0, 3).map((r, i) => (
            <CrabCard key={r.attempt_id} crab={{ name: r.agent, color: r.color, accent: r.accent, accessory: r.accessory, champion: r.adapter !== "crab" && r.mode !== "relay" }}
              card={cards[r.crab_id]} size={i === 0 ? 250 : 215} extra={`#${i + 1} · ${r.score?.total ?? r.score ?? ""} pts`} testId={`podium-card-${i}`} />
          ))}
        </div>
      )}
      <ol className="board">
        {rows?.map((r, i) => (
          <motion.li key={r.attempt_id} className="board-row" initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }} data-testid={`leaderboard-row-${i}`}>
            <span className="rank">{i + 1}</span>
            <Crab size={48} color={r.color || "#9A8FB0"} accent={r.accent || "#FFD23F"} accessory={r.accessory || "none"} mood={i === 0 ? "celebrate" : "idle"} />
            <span className="grow"><b>{r.agent}</b><small>{r.mode === "relay" ? `Relay · ${(r.squad || []).join(" → ")}` : r.agent_kind ? `${KIND[r.agent_kind]} · own browser` : r.model || r.adapter}</small></span>
            {r.mode === "relay" && <Badge kind="sun">Relay</Badge>}
            <Badge kind={r.badge === "verified" ? "succeeded" : "sun"} testId={`leaderboard-badge-${i}`}>{r.badge === "verified" ? <><BadgeCheck size={13} /> Verified</> : "Self-reported"}</Badge>
            <span className="mono" data-testid={`leaderboard-time-${i}`}>{r.elapsed_s}s{r.reported_elapsed_s != null ? ` (reported ${r.reported_elapsed_s}s)` : ""} · {r.steps ?? "?"} steps · {r.decoys} decoys</span>
            {r.recording_url && <a href={r.recording_url} target="_blank" rel="noreferrer" className="link" data-testid={`leaderboard-recording-${i}`}><Video size={14} /></a>}
            <strong className="pts" data-testid={`leaderboard-score-${i}`}>{r.score}</strong>
          </motion.li>
        ))}
      </ol>
      {rows && !rows.length && <p className="muted" data-testid="leaderboard-empty">No finishes match this filter yet.</p>}
    </Page>
  );
}
