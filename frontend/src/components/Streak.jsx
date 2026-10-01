import { Swords } from "lucide-react";

export default function Streak({ s, testId = "streak" }) {
  if (!s) return null;
  return (
    <div className="streak" data-testid={testId}>
      <div className="streak-head">
        <Swords size={14} /><b data-testid={`${testId}-score`}>{s.score_text}</b>
        {s.streak_text && <span className="streak-run" data-testid={`${testId}-run`}>{s.streak_text}</span>}
        {s.biggest_margin && <small className="muted" data-testid={`${testId}-margin`}>Biggest margin {s.biggest_margin.margin_s}s ({s.biggest_margin.winner}, round {s.biggest_margin.round + 1})</small>}
      </div>
      <ol className="streak-rounds" data-testid={`${testId}-rounds`}>
        {s.rounds.map(r => (
          <li key={r.slug} className={`round ${r.status}`} title={`${r.setter} set ${r.setter_time_s ?? "no time"}s · ${r.invitee} ${r.invitee_time_s != null ? `ran ${r.invitee_time_s}s` : r.status}`}>
            <span className="round-n">{r.n === 0 ? "Orig" : `#${r.n}`}</span>
            <span className="mono">{r.setter_time_s ?? "—"}s vs {r.invitee_time_s ?? "—"}s</span>
            <em>{r.status === "done" ? `${r.winner} won` : r.status}</em>
          </li>
        ))}
      </ol>
    </div>
  );
}
