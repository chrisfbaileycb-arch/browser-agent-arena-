import { MINDS } from "../data/presets";
import type { MindId, WorkflowDag } from "../types";
export default function PipelineCanvas({ dag, selectedId, activeMind, onSelect }: { dag: WorkflowDag; selectedId: string; activeMind: MindId | null; onSelect: (id: string) => void }) {
 return (
 <div className="ml-3 border-l-2 border-stone-200/80 pl-3">
 {dag.nodes.map((n, i) => {
 const mind = MINDS.find(m => m.id === n.mind)!;
 return (
 <button key={n.id} type="button" onClick={() => onSelect(n.id)} className={"nr-card mb-2 w-full p-3 text-left " + (selectedId === n.id ? "ring-2 ring-amber-500" : "")}>
 <div className="flex items-center justify-between"><strong className="text-xs">{n.title}</strong><span className="text-[10px] text-stone-400">{i + 1}/{dag.nodes.length}</span></div>
 <div className="mt-1 text-[10px] text-stone-500">{n.channel} · {mind.name}{activeMind === n.mind ? " · live" : ""}</div>
 </button>
 );
 })}
 </div>
 );
}
