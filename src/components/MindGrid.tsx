import { useState, type CSSProperties } from "react";
import type { MindId } from "../types";
import { MINDS } from "../data/presets";
import PersonaPortrait from "./PersonaPortrait";
import MindSpecModal from "./MindSpecModal";
import { Info, Sparkles, Shield, Compass, Send, Terminal, Cpu, CheckCircle2 } from "lucide-react";

type Accessory = { name: string; detail: string; icon: "radar" | "scythe" | "prism" | "schema" | "shield" | "lock" | "case" | "arrow" };
const ACCESSORIES: Record<MindId, [Accessory, Accessory]> = {
  scout: [{ name: "Search radar", detail: "Tavily engine", icon: "radar" }, { name: "Noise scythe", detail: "Decoy filter", icon: "scythe" }],
  extractor: [{ name: "Signal prism", detail: "Tree flattener", icon: "prism" }, { name: "Schema stamp", detail: "Typed structurer", icon: "schema" }],
  gatekeeper: [{ name: "Decision shield", detail: "Idempotency guard", icon: "shield" }, { name: "Noul gate lock", detail: "Mock lock", icon: "lock" }],
  settlement: [{ name: "REST Case", detail: "ERP dispatcher", icon: "case" }, { name: "Webhook Signer", detail: "HMAC runner bundle", icon: "arrow" }],
};

const STATS: Record<MindId, { budget: number; keyStatLabel: string; keyStatValue: string; color: string; bgTint: string }> = {
  scout: { budget: 720, keyStatLabel: "Min Cleanliness", keyStatValue: "0.62", color: "#D97706", bgTint: "#FEF08A" },
  extractor: { budget: 480, keyStatLabel: "Target Fidelity", keyStatValue: "99.4%", color: "#7C3AED", bgTint: "#EDE9FE" },
  gatekeeper: { budget: 240, keyStatLabel: "Validation Gate", keyStatValue: "0.72", color: "#059669", bgTint: "#D1FAE5" },
  settlement: { budget: 200, keyStatLabel: "MTTF Reliability", keyStatValue: "99.98%", color: "#E11D48", bgTint: "#FFE4E6" },
};

const CAPABILITIES: Record<MindId, string[]> = {
  scout: ["Tavily Engine", "Noise Scythe", "Decoy Filter"],
  extractor: ["Signal Prism", "Tree Flattener", "Schema Structurer"],
  gatekeeper: ["Decision Shield", "Idempotency Guard", "Mock Lock"],
  settlement: ["REST Case", "ERP Dispatcher", "Webhook Signer"],
};

function AccessoryIcon({ kind }: { kind: Accessory["icon"] }) {
  const shared = { fill: "none", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="h-9 w-9">
      {kind === "radar" && <g {...shared}><circle cx="24" cy="24" r="17" /><circle cx="24" cy="24" r="9" /><path d="M24 24 37 11M24 5v5M5 24h5" /><circle cx="37" cy="11" r="3" fill="currentColor" /></g>}
      {kind === "scythe" && <g {...shared}><path d="M10 39 35 11M18 12c11-5 19-3 23 1-8 0-13 4-16 11" /><path d="M7 38 13 42" /></g>}
      {kind === "prism" && <g {...shared}><path d="m24 5 18 31H6Z" /><path d="M24 5v31M6 36h36M12 25h27" /></g>}
      {kind === "schema" && <g {...shared}><rect x="7" y="8" width="34" height="32" rx="5" /><path d="M14 18h20M14 25h20M14 32h12" /><circle cx="34" cy="32" r="2" fill="currentColor" /></g>}
      {kind === "shield" && <g {...shared}><path d="M24 4 40 10v13c0 11-6 17-16 21C14 40 8 34 8 23V10Z" /><path d="m16 24 6 6 11-13" /></g>}
      {kind === "lock" && <g {...shared}><rect x="10" y="21" width="28" height="23" rx="5" /><path d="M16 21v-6a8 8 0 0 1 16 0v6M24 29v7" /></g>}
      {kind === "case" && <g {...shared}><rect x="7" y="14" width="34" height="26" rx="4" /><path d="M18 14v-4h12v4M7 24h34M21 24v5h6v-5" /></g>}
      {kind === "arrow" && <g {...shared}><path d="M9 34h30M24 8v22m-9-9 9 9 9-9" /><path d="M9 34v6h30v-6" /></g>}
    </svg>
  );
}

export default function MindGrid({ activeMind, onSelect }: { activeMind: MindId | null; onSelect: (mind: MindId) => void }) {
  const [inspectedMind, setInspectedMind] = useState<MindId | null>(null);

  return (
    <section aria-label="Meet the specialist squad" className="mb-7">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="nr-eyebrow">Tactile Collectible Studio / Series 01</span>
          <h2 className="nr-display text-3xl sm:text-4xl text-ink">Meet the Specialist Cast</h2>
        </div>
        <p className="max-w-md text-xs leading-relaxed text-stone-600">
          Partitioning cognition across four equipped specialists maintains 92%+ context preservation and zero token drift.
          Click any card to inspect its full Mind Spec or tune it in the studio.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {MINDS.map((mind, index) => {
          const stats = STATS[mind.id];
          const isActive = activeMind === mind.id;

          return (
            <div
              key={mind.id}
              className="nr-blister-card group flex flex-col justify-between text-left transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl"
              style={{ "--pack-accent": stats.color } as CSSProperties}
            >
              {/* Top Toy Blister Card Window */}
              <div className="nr-pack-board">
                <div className="nr-peg-hole" aria-hidden="true" />
                <div className="nr-pack-topline">
                  <span>N/R · FIELD SERIES</span>
                  <span>COLLECTOR 0{index + 1}</span>
                </div>

                <div className="nr-pack-name">
                  <span>{mind.name}</span>
                  <small style={{ color: stats.color }}>{mind.role}</small>
                </div>

                <div className="nr-pack-window">
                  <div
                    className="nr-figure-bubble cursor-pointer"
                    onClick={() => setInspectedMind(mind.id)}
                    title={`Click to inspect ${mind.name} Mind Spec`}
                  >
                    <PersonaPortrait mind={mind.id} active={isActive} />
                    <span className="nr-bubble-glint" aria-hidden="true" />
                    {isActive && (
                      <span className="absolute bottom-2 left-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[8px] font-mono font-bold text-white shadow-xs">
                        ACTIVE IN RELAY
                      </span>
                    )}
                  </div>

                  <div className="nr-accessories" aria-label="Equipped Toolbelt">
                    {ACCESSORIES[mind.id].map(accessory => (
                      <div key={accessory.name} className="nr-accessory-slot">
                        <div className="nr-accessory-icon">
                          <AccessoryIcon kind={accessory.icon} />
                        </div>
                        <strong>{accessory.name}</strong>
                        <small>{accessory.detail}</small>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="nr-pack-footer">
                  <span>TACTILE EDITION</span>
                  <span>✦ NEXUSRELAY</span>
                </div>
              </div>

              {/* Lower Details & Live Stats */}
              <div className="p-3 pt-4 flex flex-col justify-between flex-1">
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="nr-display text-2xl font-bold text-ink">
                      {mind.name}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setInspectedMind(mind.id)}
                      className="rounded-full p-1 text-stone-400 hover:text-stone-700 hover:bg-stone-200/50 transition-colors"
                      title="Inspect Mind Spec"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  </div>

                  <span className="text-[11px] font-semibold text-stone-500 block mb-2">
                    {mind.role}
                  </span>

                  <p className="min-h-11 text-xs leading-relaxed text-stone-600">
                    {mind.copy}
                  </p>

                  {/* Dynamic Stats Badges */}
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl border border-stone-200/80 bg-white p-2">
                      <span className="text-[9px] uppercase font-bold text-stone-400 block">Prune Budget</span>
                      <strong className="font-mono text-xs" style={{ color: stats.color }}>
                        {stats.budget} tok
                      </strong>
                    </div>
                    <div className="rounded-xl border border-stone-200/80 bg-white p-2">
                      <span className="text-[9px] uppercase font-bold text-stone-400 block">{stats.keyStatLabel}</span>
                      <strong className="font-mono text-xs text-stone-800">
                        {stats.keyStatValue}
                      </strong>
                    </div>
                  </div>

                  {/* Toolbelt Pills */}
                  <div className="mt-3 flex flex-wrap gap-1">
                    {CAPABILITIES[mind.id].map(cap => (
                      <span
                        key={cap}
                        className="rounded-md border border-stone-200 bg-white/80 px-2 py-0.5 text-[9px] font-semibold text-stone-600"
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-4 pt-3 border-t border-stone-200/70 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setInspectedMind(mind.id)}
                    className="text-xs font-bold text-stone-700 hover:text-ink underline decoration-stone-300 underline-offset-4"
                  >
                    Mind Spec ↗
                  </button>

                  <button
                    type="button"
                    onClick={() => onSelect(mind.id)}
                    className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-white shadow-xs transition-transform hover:scale-105 active:scale-95"
                    style={{ backgroundColor: stats.color }}
                  >
                    <span>Tune in Studio</span>
                    <span>→</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Mind Spec Modal */}
      <MindSpecModal
        mindId={inspectedMind}
        onClose={() => setInspectedMind(null)}
        onSelectInStudio={mindId => {
          onSelect(mindId);
          setInspectedMind(null);
        }}
      />
    </section>
  );
}
