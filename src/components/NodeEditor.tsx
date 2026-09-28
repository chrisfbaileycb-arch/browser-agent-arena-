import type { WorkflowNode } from "../types";
export type NodePatch = Omit<Partial<WorkflowNode>, "jev"> & { jev?: Partial<WorkflowNode["jev"]> };
export default function NodeEditor({ node, onChange }: { node: WorkflowNode; onChange: (p: NodePatch) => void }) {
  return (
    <div className="nr-card p-3.5">
      <div className="text-xs font-semibold">Configure {node.mind}</div>
      <p className="mb-2 text-[11px] text-stone-500">{node.channel} · {node.mind}</p>
      <label htmlFor={`title-${node.id}`} className="text-[11px] text-stone-500">Stage name</label>
      <input id={`title-${node.id}`} maxLength={80} className="mb-2 mt-1 w-full rounded-2xl border border-stone-200 px-3 py-2 text-xs" value={node.title} onChange={e => onChange({ title: e.target.value })} />
      <label htmlFor={`prompt-${node.id}`} className="text-[11px] text-stone-500">Specialist instructions</label>
      <textarea id={`prompt-${node.id}`} maxLength={3000} className="mb-2 mt-1 min-h-28 w-full rounded-2xl border border-stone-200 px-3 py-2 text-xs" value={node.prompt} onChange={e => onChange({ prompt: e.target.value })} />
      <label htmlFor={`score-${node.id}`} className="text-[11px] text-stone-500">Score floor (0–1)</label>
      <input id={`score-${node.id}`} type="number" min="0" max="1" step="0.01" className="mb-2 mt-1 w-full rounded-2xl border border-stone-200 px-3 py-2 text-xs" value={node.jev.scoreMin} onChange={e => onChange({ jev: { scoreMin: Math.min(1, Math.max(0, Number(e.target.value) || 0)) } })} />
      <label htmlFor={`budget-${node.id}`} className="text-[11px] text-stone-500">Prune budget (tokens)</label>
      <input id={`budget-${node.id}`} type="number" min="1" max="10000" className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-2 text-xs" value={node.pruneBudget} onChange={e => onChange({ pruneBudget: Math.min(10000, Math.max(1, Number(e.target.value) || 1)) })} />
    </div>
  );
}
