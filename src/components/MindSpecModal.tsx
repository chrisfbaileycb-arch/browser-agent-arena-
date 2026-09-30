import { useEffect } from "react";
import type { MindId } from "../types";
import { MINDS } from "../data/presets";
import PersonaPortrait from "./PersonaPortrait";
import { Shield, Compass, Sparkles, Send, X, Copy, Check, Terminal, Cpu, CheckCircle2 } from "lucide-react";
import { useState } from "react";

interface MindSpecModalProps {
  mindId: MindId | null;
  onClose: () => void;
  onSelectInStudio?: (mindId: MindId) => void;
}

interface MindSpecDetail {
  id: MindId;
  name: string;
  archetype: string;
  tag: string;
  accentColor: string;
  tintBg: string;
  toolbelt: Array<{ name: string; desc: string; icon: string }>;
  pruneBudget: number;
  statLabel: string;
  statValue: string;
  promptGate: string;
  zeroShotFallback: string;
  pruningThreshold: string;
  idempotencyRule: string;
}

const MIND_SPECS: Record<MindId, MindSpecDetail> = {
  scout: {
    id: "scout",
    name: "Scout",
    archetype: "The Pathfinder",
    tag: "01 · DISCOVER & FILTER",
    accentColor: "#E08A28",
    tintBg: "#FEF7EE",
    toolbelt: [
      { name: "Tavily Engine", desc: "Live multi-source web crawl & DOM collector", icon: "compass" },
      { name: "Noise Scythe", desc: "Prunes cookie banners, navigation links & ad wrappers", icon: "scissors" },
      { name: "Decoy Filter", desc: "Identifies sticky tar pits and misdirection buttons", icon: "shield" }
    ],
    pruneBudget: 720,
    statLabel: "Min Cleanliness Score",
    statValue: "0.62",
    promptGate: "Scout only navigates to relevant target zones. If noise exceeds 80% of page text, prune non-content containers prior to handoff.",
    zeroShotFallback: "Fall back to ranked sentence extraction using inverse query term frequencies; never pass raw HTML into downstream steps.",
    pruningThreshold: "Aggressively trim raw DOM payloads from 60KB to < 3KB (~720 tokens) with 0 semantic loss.",
    idempotencyRule: "Deterministic page hashing: identical HTML trees yield identical token excerpt sets."
  },
  extractor: {
    id: "extractor",
    name: "Extractor",
    archetype: "The Pattern Maker",
    tag: "02 · SHAPE & TYPE",
    accentColor: "#7C3AED",
    tintBg: "#F5F3FF",
    toolbelt: [
      { name: "Signal Prism", desc: "Separates primary facts from peripheral prose", icon: "sparkles" },
      { name: "Tree Flattener", desc: "Transforms nested DOM hierarchies into flat rows", icon: "cpu" },
      { name: "Schema Structurer", desc: "Lifts string excerpts into strictly typed JSON", icon: "terminal" }
    ],
    pruneBudget: 480,
    statLabel: "Schema Target Fidelity",
    statValue: "99.4%",
    promptGate: "Extractor accepts Scout's pruned excerpts and emits strictly valid JSON satisfying target schema. Missing fields are coerced to null; never invented.",
    zeroShotFallback: "Regex heuristics and typed pattern matching (ISO currencies, HS numbers, SKU strings) if LLM formatting falters.",
    pruningThreshold: "Maximum 480 prompt tokens for extraction prompt; eliminates all secondary adjectives.",
    idempotencyRule: "Strict JSON key ordering with typed type casting (number, boolean, string)."
  },
  gatekeeper: {
    id: "gatekeeper",
    name: "Gatekeeper",
    archetype: "The Skeptic",
    tag: "03 · VERIFY & ATTEST",
    accentColor: "#059669",
    tintBg: "#ECFDF5",
    toolbelt: [
      { name: "Decision Shield", desc: "Dual-score threshold check (choice & noul)", icon: "shield" },
      { name: "Idempotency Guard", desc: "Rejects unverified state mutations & loops", icon: "lock" },
      { name: "Mock Lock", desc: "Attests that non-null fields match source evidence text", icon: "check" }
    ],
    pruneBudget: 240,
    statLabel: "Min Validation Gate",
    statValue: "0.72",
    promptGate: "Gatekeeper independently reviews extracted JSON against cited text excerpts. Returns proceed, human_review, or abort.",
    zeroShotFallback: "Deterministic schema validator (noulLocal). If assertions fail or required fields are null, halt immediately.",
    pruningThreshold: "Fast verification under 240 tokens; evaluate only field claims and evidence spans.",
    idempotencyRule: "Zero hallucination tolerance: unsupported claims trigger instant abort with zero side-effects."
  },
  settlement: {
    id: "settlement",
    name: "Settlement",
    archetype: "The Finisher",
    tag: "04 · PACK & DELIVER",
    accentColor: "#E11D48",
    tintBg: "#FFF1F2",
    toolbelt: [
      { name: "REST Case", desc: "Guaranteed HTTP idempotent delivery package", icon: "send" },
      { name: "ERP Dispatcher", desc: "Formats payloads for SAP, ERP, Slack, or PagerDuty", icon: "terminal" },
      { name: "Webhook Signer", desc: "Appends HMAC auth header and correlation UUID", icon: "shield" }
    ],
    pruneBudget: 200,
    statLabel: "MTTF Reliability",
    statValue: "99.98%",
    promptGate: "Settlement executes REST payload dispatch only after Gatekeeper returns proceed with score >= 0.70.",
    zeroShotFallback: "Local simulation bundle and runner file exporter if outbound HTTP target is unconfigured.",
    pruningThreshold: "Zero LLM tokens during final hop; 100% deterministic TypeScript/REST execution.",
    idempotencyRule: "X-Idempotency-Key and UUID correlation tracking prevent duplicate dispatches."
  }
};

export default function MindSpecModal({ mindId, onClose, onSelectInStudio }: MindSpecModalProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!mindId) return null;
  const spec = MIND_SPECS[mindId];
  const persona = MINDS.find(m => m.id === mindId);

  const copySpec = () => {
    const text = JSON.stringify(spec, null, 2);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mind-spec-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/70 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl overflow-hidden rounded-[28px] border border-stone-200 bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
        style={{ borderColor: spec.accentColor }}
      >
        {/* Header Ribbon */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b text-xs font-bold uppercase tracking-widest text-ink"
          style={{ backgroundColor: spec.tintBg, borderColor: `${spec.accentColor}30` }}
        >
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full animate-pulse"
              style={{ backgroundColor: spec.accentColor }}
            />
            <span style={{ color: spec.accentColor }}>{spec.tag}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-full p-1 text-stone-500 hover:bg-stone-200/60 hover:text-stone-900 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="max-h-[80vh] overflow-y-auto p-6 sm:p-8 space-y-6">
          {/* Top Profile Header */}
          <div className="flex flex-wrap items-center gap-6">
            <div
              className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl border-2 shadow-inner grid place-items-center"
              style={{ backgroundColor: spec.tintBg, borderColor: spec.accentColor }}
            >
              <div className="scale-125 transform">
                <PersonaPortrait mind={mindId} active />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="mind-spec-title" className="nr-display text-3xl text-ink font-bold">
                  {spec.name}
                </h3>
                <span
                  className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{ backgroundColor: spec.tintBg, color: spec.accentColor }}
                >
                  {spec.archetype}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-stone-600 max-w-md leading-relaxed">
                {persona?.copy}
              </p>
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                <div className="rounded-lg bg-stone-100 px-3 py-1 font-mono text-[11px] text-stone-700">
                  Prune Budget: <strong style={{ color: spec.accentColor }}>{spec.pruneBudget} tokens</strong>
                </div>
                <div className="rounded-lg bg-stone-100 px-3 py-1 font-mono text-[11px] text-stone-700">
                  {spec.statLabel}: <strong style={{ color: spec.accentColor }}>{spec.statValue}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Equipped Toolbelt */}
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-stone-500 mb-2.5">
              Equipped Collectible Toolbelt
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {spec.toolbelt.map(tool => (
                <div
                  key={tool.name}
                  className="rounded-xl border p-3 bg-stone-50/60 flex flex-col justify-between"
                  style={{ borderColor: `${spec.accentColor}40` }}
                >
                  <strong className="text-xs font-bold text-stone-900 block" style={{ color: spec.accentColor }}>
                    {tool.name}
                  </strong>
                  <p className="mt-1 text-[11px] text-stone-600 leading-tight">
                    {tool.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Cognitive Rules & Injection Gates */}
          <div className="rounded-2xl border border-stone-200 bg-stone-50/80 p-4 space-y-3 text-xs">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5" style={{ color: spec.accentColor }} />
              Cognitive Specification & Guardrails
            </h4>

            <div className="space-y-2">
              <div className="rounded-xl bg-white p-3 border border-stone-200/80 shadow-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-0.5">
                  Prompt Injection Gate
                </span>
                <p className="font-mono text-[11px] text-stone-800 leading-relaxed">
                  {spec.promptGate}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="rounded-xl bg-white p-3 border border-stone-200/80 shadow-xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-0.5">
                    Zero-Shot Fallback
                  </span>
                  <p className="text-[11px] text-stone-700 leading-snug">
                    {spec.zeroShotFallback}
                  </p>
                </div>

                <div className="rounded-xl bg-white p-3 border border-stone-200/80 shadow-xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-0.5">
                    Idempotency & Type Rules
                  </span>
                  <p className="text-[11px] text-stone-700 leading-snug">
                    {spec.idempotencyRule}
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-white p-2.5 border border-stone-200/80 shadow-xs flex items-center justify-between text-[11px]">
                <span className="font-semibold text-stone-600">Mathematical Compression:</span>
                <span className="font-mono font-bold text-stone-800">{spec.pruningThreshold}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 bg-stone-50 px-6 py-4">
          <button
            type="button"
            onClick={copySpec}
            className="flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100 transition-colors"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied Spec JSON" : "Copy Spec JSON"}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-4 py-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900"
            >
              Close
            </button>
            {onSelectInStudio && (
              <button
                type="button"
                onClick={() => {
                  onSelectInStudio(mindId);
                  onClose();
                }}
                className="rounded-full px-4 py-2 text-xs font-bold text-white shadow-sm transition-transform hover:scale-105"
                style={{ backgroundColor: spec.accentColor }}
              >
                Tune {spec.name} in Squad Studio →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
