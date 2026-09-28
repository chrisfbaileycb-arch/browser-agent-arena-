import type { MindId } from "../types";
import { MINDS } from "../data/presets";
import PersonaPortrait from "./PersonaPortrait";
export default function MindGrid({ activeMind, onSelect }: { activeMind: MindId | null; onSelect: (mind: MindId) => void }) {
  return (
    <section aria-label="Meet the specialist squad" className="mb-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><p className="nr-eyebrow">A neighborhood of specialist minds</p><h2 className="nr-display text-2xl sm:text-3xl">Meet your relay squad.</h2></div><p className="max-w-xs text-xs text-stone-500">Four minds, one baton. Select one to tune its role in Squad Studio.</p></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {MINDS.map((m, i) => <button type="button" key={m.id} onClick={() => onSelect(m.id)} className="nr-persona-card group overflow-hidden rounded-[28px] border border-stone-200 bg-white text-left shadow-luxury transition-transform hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600" style={{ borderColor: activeMind === m.id ? m.color : undefined }}>
          <div className="nr-persona-stage" style={{ background: `linear-gradient(145deg, ${m.color}25, #fff 68%)` }}><span className="absolute left-4 top-4 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: m.color }}>{m.tag}</span><PersonaPortrait mind={m.id} active={activeMind === m.id} /></div>
          <div className="p-4"><div className="flex items-baseline justify-between"><h3 className="nr-display text-2xl">{m.name}</h3><span className="font-mono text-[10px] text-stone-400">0{i + 1}</span></div><p className="mt-0.5 text-xs font-semibold" style={{ color: m.color }}>{m.role}</p><p className="mt-2 min-h-10 text-xs leading-relaxed text-stone-500">{m.copy}</p><span className="mt-3 inline-flex items-center text-[11px] font-bold text-ink">Tune this mind <span className="ml-1 transition-transform group-hover:translate-x-1">→</span></span></div>
        </button>)}
      </div>
    </section>
  );
}
