import type { CSSProperties } from "react";
import type { MindId } from "../types";
import { MINDS } from "../data/presets";
import PersonaPortrait from "./PersonaPortrait";

type Accessory = { name: string; detail: string; icon: "radar" | "scythe" | "prism" | "schema" | "shield" | "lock" | "case" | "arrow" };
const ACCESSORIES: Record<MindId, [Accessory, Accessory]> = {
  scout: [{ name: "Search radar", detail: "Tavily-ready prop", icon: "radar" }, { name: "Noise scythe", detail: "Trim the clutter", icon: "scythe" }],
  extractor: [{ name: "Signal prism", detail: "Find the pattern", icon: "prism" }, { name: "Schema stamp", detail: "Shape the clues", icon: "schema" }],
  gatekeeper: [{ name: "Decision shield", detail: "Jev-ready prop", icon: "shield" }, { name: "Noul gate lock", detail: "Check the claim", icon: "lock" }],
  settlement: [{ name: "Result case", detail: "Pack the output", icon: "case" }, { name: "Export arrow", detail: "Take it with you", icon: "arrow" }],
};
const CAPABILITIES: Record<MindId, string[]> = {
  scout: ["selector clues", "noise filter"], extractor: ["token pruning", "typed payload"],
  gatekeeper: ["score gate", "assertions"], settlement: ["runner export", "result bundle"],
};

function AccessoryIcon({ kind }: { kind: Accessory["icon"] }) {
  const shared = { fill: "none", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <svg viewBox="0 0 48 48" aria-hidden="true" className="h-10 w-10">
    {kind === "radar" && <g {...shared}><circle cx="24" cy="24" r="17" /><circle cx="24" cy="24" r="9" /><path d="M24 24 37 11M24 5v5M5 24h5" /><circle cx="37" cy="11" r="3" fill="currentColor" /></g>}
    {kind === "scythe" && <g {...shared}><path d="M10 39 35 11M18 12c11-5 19-3 23 1-8 0-13 4-16 11" /><path d="M7 38 13 42" /></g>}
    {kind === "prism" && <g {...shared}><path d="m24 5 18 31H6Z" /><path d="M24 5v31M6 36h36M12 25h27" /></g>}
    {kind === "schema" && <g {...shared}><rect x="7" y="8" width="34" height="32" rx="5" /><path d="M14 18h20M14 25h20M14 32h12" /><circle cx="34" cy="32" r="2" fill="currentColor" /></g>}
    {kind === "shield" && <g {...shared}><path d="M24 4 40 10v13c0 11-6 17-16 21C14 40 8 34 8 23V10Z" /><path d="m16 24 6 6 11-13" /></g>}
    {kind === "lock" && <g {...shared}><rect x="10" y="21" width="28" height="23" rx="5" /><path d="M16 21v-6a8 8 0 0 1 16 0v6M24 29v7" /></g>}
    {kind === "case" && <g {...shared}><rect x="7" y="14" width="34" height="26" rx="4" /><path d="M18 14v-4h12v4M7 24h34M21 24v5h6v-5" /></g>}
    {kind === "arrow" && <g {...shared}><path d="M9 34h30M24 8v22m-9-9 9 9 9-9" /><path d="M9 34v6h30v-6" /></g>}
  </svg>;
}

export default function MindGrid({ activeMind, onSelect }: { activeMind: MindId | null; onSelect: (mind: MindId) => void }) {
  return <section aria-label="Meet the specialist squad" className="mb-7">
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2"><div><p className="nr-eyebrow">The NexusRelay collection / Series 01</p><h2 className="nr-display text-3xl sm:text-4xl">Meet the minds. Pick your squad.</h2></div><p className="max-w-xs text-xs leading-relaxed text-stone-600">Each specialist has a job and a kit of conceptual tools. Open a pack to tune its place in the relay.</p></div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {MINDS.map((mind, index) => <button key={mind.id} type="button" onClick={() => onSelect(mind.id)} aria-label={`Open ${mind.name} in Squad Studio`} className="nr-blister-card group text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-600" style={{ "--pack-accent": mind.color } as CSSProperties}>
        <div className="nr-pack-board">
          <div className="nr-peg-hole" aria-hidden="true" />
          <div className="nr-pack-topline"><span>N/R · FIELD SERIES</span><span>COLLECTOR NO. 0{index + 1}</span></div>
          <div className="nr-pack-name"><span>{mind.name}</span><small>{mind.role}</small></div>
          <div className="nr-pack-window">
            <div className="nr-figure-bubble"><PersonaPortrait mind={mind.id} active={activeMind === mind.id} /><span className="nr-bubble-glint" aria-hidden="true" /></div>
            <div className="nr-accessories" aria-label="Conceptual accessories">
              {ACCESSORIES[mind.id].map(accessory => <div key={accessory.name} className="nr-accessory-slot"><div className="nr-accessory-icon"><AccessoryIcon kind={accessory.icon} /></div><strong>{accessory.name}</strong><small>{accessory.detail}</small></div>)}
            </div>
          </div>
          <div className="nr-pack-footer"><span>SIMULATION EDITION</span><span>✦ NEXUSRELAY</span></div>
        </div>
        <div className="px-1 pb-1 pt-4"><h3 className="nr-display text-2xl">{mind.name} <span className="text-base font-normal text-stone-500">/ {mind.role}</span></h3><p className="mt-1 min-h-10 text-xs leading-relaxed text-stone-600">{mind.copy}</p><div className="mt-3 flex flex-wrap gap-1.5">{CAPABILITIES[mind.id].map(capability => <span key={capability} className="rounded-full border border-stone-300 bg-white px-2.5 py-1 text-[10px] font-semibold text-stone-700">{capability}</span>)}</div><span className="mt-4 inline-flex text-xs font-bold" style={{ color: mind.color }}>Open this Mind <span className="ml-1 transition-transform group-hover:translate-x-1">→</span></span></div>
      </button>)}
    </div>
  </section>;
}
