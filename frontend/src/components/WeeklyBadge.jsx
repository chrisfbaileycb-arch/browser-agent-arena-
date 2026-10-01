import { Link } from "react-router-dom";
import { Crown } from "lucide-react";

export default function WeeklyBadge({ b, testId, link = true }) {
  const body = <><Crown size={12} /> {b.label}{b.category === "self_reported" && <small>SR</small>}</>;
  const props = { className: `weekly-badge ${b.category === "self_reported" ? "self" : ""}`, "data-tip": b.tooltip, "aria-label": b.tooltip, "data-testid": testId };
  return link ? <Link to={`/hall#badge-${b.id}`} onClick={e => e.stopPropagation()} {...props}>{body}</Link> : <span tabIndex={0} {...props}>{body}</span>;
}

export const WeeklyBadges = ({ list = [], testId = "weekly-badge" }) => list.length
  ? <span className="weekly-badges">{list.map((b, i) => <WeeklyBadge key={b.id} b={b} testId={`${testId}-${i}`} />)}</span> : null;
