import { Crown } from "lucide-react";

export default function WeeklyBadge({ b, testId }) {
  return (
    <span className={`weekly-badge ${b.category === "self_reported" ? "self" : ""}`} tabIndex={0} data-tip={b.tooltip} aria-label={b.tooltip} data-testid={testId}>
      <Crown size={12} /> {b.label}{b.category === "self_reported" && <small>SR</small>}
    </span>
  );
}

export const WeeklyBadges = ({ list = [], testId = "weekly-badge" }) => list.length
  ? <span className="weekly-badges">{list.map((b, i) => <WeeklyBadge key={b.id} b={b} testId={`${testId}-${i}`} />)}</span> : null;
