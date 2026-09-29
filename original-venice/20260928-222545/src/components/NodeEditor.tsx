import type { WorkflowNode } from "../types";
export default function NodeEditor({ node, onChange }: { node: WorkflowNode; onChange: (p: Partial<WorkflowNode> & { jev?: Partial<WorkflowNode["jev"]> }) => void }) {
  return (
    <div className="nr-card p-3.5">
      <div className="text-xs font-semibold">{node.title}</div>
      <p className="mb-2 text-[11px] text-stone-500">{node.channel} · {node.mind}</p>
      <label className="text-[11px] text-stone-500">Score floor</label>
      <input type="number" step="0.01" className="mb-2 mt-1 w-full rounded-2xl border border-stone-200 px-3 py-2 text-xs" value={node.jev.scoreMin} onChange={e => onChange({ jev: { scoreMin: Number(e.target.value) || 0 } })} />
      <label className="text-[11px] text-stone-500">Prune budget</label>
      <input type="number" className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-2 text-xs" value={node.pruneBudget} onChange={e => onChange({ pruneBudget: Number(e.target.value) || 80 })} />
    </div>
  );
}
