import type { MindId } from "../types";
import { MINDS } from "../data/presets";
export default function MindGrid({ activeMind }: { activeMind: MindId | null }) {
 return (
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
 {MINDS.map(m => (
 <div key={m.id} className="nr-card p-3.5" style={{ borderColor: activeMind === m.id ? m.color : "rgba(231,229,228,0.8)" }}>
 <div className="flex items-center gap-3">
 <div className={"relative grid h-12 w-12 place-items-center rounded-full " + (activeMind === m.id ? "nr-halo-live" : "")} style={{ background: m.color + "22", color: m.color, boxShadow: "0 0 0 6px " + m.color + "14" }}>
 <svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="currentColor" opacity="0.25" /><circle cx="18" cy="20" r="2" fill="#18181B" /><circle cx="30" cy="20" r="2" fill="#18181B" /><path d="M17 29 Q24 34 31 29" fill="none" stroke="#18181B" strokeWidth="1.7" strokeLinecap="round" /></svg>
 </div>
 <div>
 <div className="flex items-center gap-2"><strong className="text-xs">{m.name}</strong><span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: m.color + "22", color: m.color }}>{m.tag}</span></div>
 <div className="text-[11px] text-stone-500">{m.role}</div>
 </div>
 </div>
 <p className="mt-2 text-[11px] text-stone-500">{m.copy}</p>
 </div>
 ))}
 </div>
 );
}
