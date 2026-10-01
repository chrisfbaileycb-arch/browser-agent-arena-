import { useEffect, useState } from "react";
import { GitCompare } from "lucide-react";
import { api, asset } from "../api";
import Crab2D from "./Crab2D";
import { COURSES, CoursePicker } from "./courses";
import { Badge } from "./ui";

const ROLES = [["scout", "Scout"], ["gate", "Gatekeeper"], ["extract", "Extractor"], ["settle", "Settler"]];

function useLegSteps(item) {
  const [steps, setSteps] = useState([]);
  useEffect(() => {
    setSteps([]);
    if (item) api(`/relay/legs/${item.run_id}/${item.leg}`).then(d => setSteps(d.steps)).catch(() => {});
  }, [item]);
  return steps;
}

function SyncedReplay({ pair }) {
  const a = useLegSteps(pair[0]), b = useLegSteps(pair[1]);
  const [i, setI] = useState(0);
  const total = Math.max(a.length, b.length);
  useEffect(() => { setI(0); }, [pair]);
  useEffect(() => {
    if (!total) return undefined;
    const t = setInterval(() => setI(x => (x + 1) % total), 1200);
    return () => clearInterval(t);
  }, [total]);
  const pane = (steps, item, k) => {
    const s = steps[Math.min(i, steps.length - 1)];
    return (
      <div className="lc-pane" key={k} data-testid={`leg-compare-pane-${k}`}>
        <div className="lc-pane-head"><Crab2D size={28} color={item.color} accent={item.accent} accessory={item.accessory} /><b>{item.name}</b><small>leg {item.leg + 1} · {item.role_name}</small></div>
        {s?.screenshot ? <img src={asset(s.screenshot)} alt={`Step ${s.n}`} /> : <div className="shot-empty">No screenshot</div>}
        <small className="mono">{s ? `step ${Math.min(i, steps.length - 1) + 1}/${steps.length} · ${s.action} ${s.target_label || ""}` : "loading…"}</small>
      </div>
    );
  };
  return <div className="lc-replay" data-testid="leg-compare-replay">{pane(a, pair[0], 0)}{pane(b, pair[1], 1)}</div>;
}

export default function LegCompare() {
  const [course, setCourse] = useState("obstacle-1");
  const [by, setBy] = useState("role:gate");
  const [data, setData] = useState(null);
  const [pick, setPick] = useState([]);
  const stations = COURSES[course].stations;
  useEffect(() => {
    setData(null); setPick([]);
    const [k, v] = by.split(":");
    api(`/relay/legs?course_id=${course}&${k}=${v}`).then(d => { setData(d); setPick(d.items.slice(0, 2)); }).catch(() => setData({ items: [] }));
  }, [course, by]);
  const toggle = it => setPick(p => (p.includes(it) ? p.filter(x => x !== it) : [...p, it].slice(-2)));
  return (
    <section className="leg-compare card" data-testid="leg-compare">
      <div className="row between wrap">
        <h2 className="section-title"><GitCompare size={20} /> Relay leg compare</h2>
        <CoursePicker value={course} onChange={c => { setCourse(c); setBy("role:gate"); }} testId="leg-compare-course" />
      </div>
      <div className="row wrap">
        <select value={by} onChange={e => setBy(e.target.value)} data-testid="leg-compare-select">
          <optgroup label="By role">{ROLES.map(([id, n]) => <option key={id} value={`role:${id}`}>{n} legs</option>)}</optgroup>
          <optgroup label="By station">{stations.map((s, i) => <option key={s} value={`station:${s}`}>Leg covering {COURSES[course].names[i]}</option>)}</optgroup>
        </select>
        <small className="muted">Real recorded relay runs only: your own, public, and those in shared tournaments. Pick two rows to replay side by side.</small>
      </div>
      {!data && <div className="shimmer lc-loading">Gathering relay legs…</div>}
      {data && data.items.length < 2 && (
        <div className="h2h-empty light" data-testid="leg-compare-empty"><b>Not enough relay data yet</b><p className="muted">Run a Squad Relay on the {COURSES[course].short} (or open a shared tournament) to compare legs. Found {data.items.length}.</p></div>
      )}
      {data && data.items.length >= 2 && (
        <>
          <table className="lc-table" data-testid="leg-compare-table">
            <thead><tr><th /><th>Crab · leg</th><th>Stations</th><th>Time</th><th>Steps</th><th>Decoys</th><th>Result</th></tr></thead>
            <tbody>{data.items.map((it, k) => (
              <tr key={`${it.run_id}-${it.leg}`} className={pick.includes(it) ? "on" : ""} onClick={() => toggle(it)} data-testid={`leg-compare-row-${k}`}>
                <td><input type="checkbox" readOnly checked={pick.includes(it)} aria-label="Compare this leg" /></td>
                <td><Crab2D size={24} color={it.color} accent={it.accent} accessory={it.accessory} /> {it.name} <small className="muted">#{it.leg + 1} {it.own ? "· yours" : ""}</small></td>
                <td className="mono">{it.from_station} → {it.to_station}</td>
                <td className="mono">{it.elapsed_s ?? "—"}s</td><td className="mono">{it.steps ?? "—"}</td><td className="mono">{it.decoys}</td>
                <td><Badge kind={it.success ? "succeeded" : "failed"}>{it.success ? (it.status === "finished" ? "finished" : "baton passed") : it.status}</Badge></td>
              </tr>
            ))}</tbody>
          </table>
          {pick.length === 2 && <SyncedReplay pair={pick} />}
        </>
      )}
    </section>
  );
}
