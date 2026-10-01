import { useEffect, useState } from "react";
import { api, put } from "../api";
import Crab from "./Crab";
import { Btn, Notice } from "./ui";

const ROLES = [["scout", "Scout"], ["extract", "Extractor"], ["gate", "Gatekeeper"], ["settle", "Settlement"]];
const FORMATIONS = {
  "1-2-1": { scout: [50, 16], extract: [24, 48], gate: [76, 48], settle: [50, 78] },
  "2-2": { scout: [28, 28], extract: [72, 28], gate: [28, 72], settle: [72, 72] },
  "1-3": { scout: [50, 22], extract: [18, 72], gate: [50, 72], settle: [82, 72] },
};

import { courseOf } from "./courses";

function RelayControls({ squad, setSquad, crabs, champions, onRelay, save, courseId }) {
  const { stations: STATIONS, short } = courseOf(courseId);
  const [opponent, setOpponent] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const setStation = (st, role) => setSquad(s => ({ ...s, assignments: { ...s.assignments, [st]: role } }));
  const go = async () => {
    setBusy(true); setMsg("");
    try { await save(); await onRelay(opponent); } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="relay-box" data-testid="relay-controls">
      <h4>Squad Relay · station assignments · <span data-testid="relay-course-name">{short}</span></h4>
      <div className="assign-grid">
        {STATIONS.map(st => (
          <label key={st}><small>{st}</small>
            <select value={squad.assignments?.[st] || ""} onChange={e => setStation(st, e.target.value)} data-testid={`relay-assign-${st}`}>
              {ROLES.map(([r, label]) => <option key={r} value={r}>{label}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="row">
        <select value={opponent} onChange={e => setOpponent(e.target.value)} data-testid="relay-opponent-select">
          <option value="">Solo relay (no opponent)</option>
          {crabs.map(c => <option key={c.id} value={c.id}>vs {c.name}</option>)}
          {champions.map(c => <option key={c.id} value={c.id}>vs {c.name} (champion)</option>)}
        </select>
        <button className="btn btn-glow" onClick={go} disabled={busy} data-testid="relay-start-btn">{busy ? "Starting…" : "Start relay"}</button>
      </div>
      <Notice kind="error" testId="relay-error">{msg}</Notice>
    </div>
  );
}

export default function SquadCard({ crabs, champions = [], onEnter, onRelay, courseId }) {
  const [squad, setSquad] = useState({ slots: {}, formation: "1-2-1", assignments: {} });
  const [msg, setMsg] = useState("");
  useEffect(() => { api("/squad").then(setSquad).catch(() => {}); }, []);
  const byId = id => crabs.find(c => c.id === id);
  const pos = FORMATIONS[squad.formation];
  const set = (role, id) => setSquad(s => ({ ...s, slots: { ...s.slots, [role]: id || null } }));
  const persist = () => put("/squad", squad).then(s => { setSquad(s); return s; });
  const save = () => persist().then(() => setMsg("Squad saved.")).catch(e => setMsg(e.message));
  const members = ROLES.map(([r]) => squad.slots[r]).filter(Boolean);
  return (
    <section className="squad" data-testid="squad-card">
      <span className="squad-tag">My Squad</span>
      <div className="squad-grid">
        <svg className="formation" viewBox="0 0 100 100" data-testid="formation-diagram">
          <rect x="2" y="2" width="96" height="96" rx="10" />
          <line x1="2" y1="50" x2="98" y2="50" /><circle cx="50" cy="50" r="12" />
          {ROLES.map(([r, label]) => {
            const c = byId(squad.slots[r]);
            return <g key={r}><circle cx={pos[r][0]} cy={pos[r][1]} r="7" fill={c?.color || "#3A3360"} /><text x={pos[r][0]} y={pos[r][1] + 13}>{label}</text></g>;
          })}
        </svg>
        <div className="squad-slots">
          {ROLES.map(([r, label]) => {
            const c = byId(squad.slots[r]);
            return (
              <label key={r} className="slot">
                <span className="slot-crab">{c ? <Crab size={40} color={c.color} accent={c.accent} accessory={c.accessory} /> : <i />}</span>
                <span><small>{label}</small>
                  <select value={squad.slots[r] || ""} onChange={e => set(r, e.target.value)} data-testid={`squad-slot-${r}`}>
                    <option value="">Empty</option>{crabs.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </span>
              </label>
            );
          })}
          <div className="row">
            <select value={squad.formation} onChange={e => setSquad(s => ({ ...s, formation: e.target.value }))} data-testid="squad-formation-select">
              {Object.keys(FORMATIONS).map(f => <option key={f}>{f}</option>)}
            </select>
            <Btn onClick={save} testId="squad-save-btn">Save squad</Btn>
            <Btn kind="ghost" disabled={members.length < 1} onClick={() => onEnter(members)} testId="squad-enter-btn">Enter tournament</Btn>
            <Btn kind="ghost" disabled={members.length < 1} onClick={() => onEnter(["relay"])} testId="squad-enter-relay-btn">Enter squad as relay</Btn>
          </div>
          <Notice testId="squad-msg">{msg}</Notice>
        </div>
      </div>
      <RelayControls squad={squad} setSquad={setSquad} crabs={crabs} champions={champions} onRelay={onRelay} save={persist} courseId={courseId} />
    </section>
  );
}
