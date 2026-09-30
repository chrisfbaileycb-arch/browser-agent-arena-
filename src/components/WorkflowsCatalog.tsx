import { useState, useMemo } from "react";
import { PRESETS } from "../data/presets";
import { synthesize, schemaFor, restFor, runVessel, type VesselTick } from "../core/synthesizer";
import { selectCorpus, liftStructured } from "../core/tavilyAdapter";
import type { Intent, WorkflowDag, VesselResult } from "../types";

interface WorkflowsCatalogProps {
  onOpenInStudio: (presetId: string) => void;
  onOpenInBrowser: (presetId: string) => void;
}

interface WorkflowRunState {
  running: boolean;
  result: VesselResult | null;
  error?: string;
}

export default function WorkflowsCatalog({ onOpenInStudio, onOpenInBrowser }: WorkflowsCatalogProps) {
  const [filterIntent, setFilterIntent] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [runStates, setRunStates] = useState<Record<string, WorkflowRunState>>({});
  const [expandedWorkflow, setExpandedWorkflow] = useState<string | null>("price");
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchScorecard, setBatchScorecard] = useState<{ total: number; passed: number; results: Array<{ id: string; name: string; intent: string; ok: boolean; durationMs: number; tokens: number; payload: Record<string, unknown> | null }> } | null>(null);

  // Precompute DAGs for all 8 presets
  const workflows = useMemo(() => {
    return PRESETS.map(preset => {
      const dag = synthesize(preset.objective);
      const schema = schemaFor(preset.id);
      const rest = restFor(preset.id);
      const corpus = selectCorpus(preset.objective);
      const samplePayload = liftStructured(corpus.map(c => c.markdown).join(" "), preset.id);
      return {
        preset,
        dag,
        schema,
        rest,
        corpus,
        samplePayload,
      };
    });
  }, []);

  const filteredWorkflows = useMemo(() => {
    return workflows.filter(wf => {
      if (filterIntent !== "all" && wf.preset.id !== filterIntent) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = wf.preset.name.toLowerCase().includes(q);
        const matchesObjective = wf.preset.objective.toLowerCase().includes(q);
        const matchesBlurb = wf.preset.blurb.toLowerCase().includes(q);
        const matchesIntent = wf.preset.id.toLowerCase().includes(q);
        if (!matchesName && !matchesObjective && !matchesBlurb && !matchesIntent) return false;
      }
      return true;
    });
  }, [workflows, filterIntent, searchQuery]);

  const executeWorkflow = async (presetId: string, dag: WorkflowDag) => {
    setRunStates(prev => ({ ...prev, [presetId]: { running: true, result: null } }));
    try {
      const result = await runVessel(dag, () => {});
      setRunStates(prev => ({ ...prev, [presetId]: { running: false, result } }));
    } catch (err) {
      setRunStates(prev => ({ ...prev, [presetId]: { running: false, result: null, error: err instanceof Error ? err.message : "Run failed" } }));
    }
  };

  const executeAllWorkflows = async () => {
    setBatchRunning(true);
    setBatchScorecard(null);
    const scorecardResults: Array<{ id: string; name: string; intent: string; ok: boolean; durationMs: number; tokens: number; payload: Record<string, unknown> | null }> = [];

    for (const wf of workflows) {
      setRunStates(prev => ({ ...prev, [wf.preset.id]: { running: true, result: null } }));
      try {
        const start = Date.now();
        const result = await runVessel(wf.dag, () => {});
        const totalDuration = Date.now() - start;
        const totalTokens = result.totalIn + result.totalOut;
        setRunStates(prev => ({ ...prev, [wf.preset.id]: { running: false, result } }));
        scorecardResults.push({
          id: wf.preset.id,
          name: wf.preset.name,
          intent: wf.preset.id,
          ok: result.ok,
          durationMs: totalDuration,
          tokens: totalTokens,
          payload: result.structured ?? null,
        });
      } catch (err) {
        setRunStates(prev => ({ ...prev, [wf.preset.id]: { running: false, result: null, error: err instanceof Error ? err.message : "Run failed" } }));
        scorecardResults.push({
          id: wf.preset.id,
          name: wf.preset.name,
          intent: wf.preset.id,
          ok: false,
          durationMs: 0,
          tokens: 0,
          payload: null,
        });
      }
    }

    setBatchScorecard({
      total: scorecardResults.length,
      passed: scorecardResults.filter(r => r.ok).length,
      results: scorecardResults,
    });
    setBatchRunning(false);
  };

  const INTENT_THEMES: Record<string, { border: string; bg: string; badge: string; text: string; iconBg: string }> = {
    price: { border: "border-[#EAB308]", bg: "bg-[#FEFCE8]", badge: "bg-[#FFE135] text-stone-900", text: "text-amber-900", iconBg: "bg-[#FFE135] text-stone-900 border-[#18181B]" },
    news: { border: "border-[#8B5CF6]", bg: "bg-[#FAF5FF]", badge: "bg-[#A78BFA] text-white", text: "text-purple-900", iconBg: "bg-[#8B5CF6] text-white border-[#18181B]" },
    compliance: { border: "border-[#10B981]", bg: "bg-[#ECFDF5]", badge: "bg-[#34D399] text-stone-900", text: "text-emerald-900", iconBg: "bg-[#10B981] text-white border-[#18181B]" },
    lead: { border: "border-[#06B6D4]", bg: "bg-[#F0FDFA]", badge: "bg-[#38BDF8] text-stone-900", text: "text-cyan-900", iconBg: "bg-[#06B6D4] text-white border-[#18181B]" },
    vat: { border: "border-[#F43F5E]", bg: "bg-[#FFF1F2]", badge: "bg-[#FB7185] text-white", text: "text-rose-900", iconBg: "bg-[#F43F5E] text-white border-[#18181B]" },
    outage: { border: "border-[#F97316]", bg: "bg-[#FFF7ED]", badge: "bg-[#FDBA74] text-stone-900", text: "text-orange-900", iconBg: "bg-[#F97316] text-white border-[#18181B]" },
    leak: { border: "border-[#EF4444]", bg: "bg-[#FEF2F2]", badge: "bg-[#F87171] text-white", text: "text-red-900", iconBg: "bg-[#EF4444] text-white border-[#18181B]" },
    rfp: { border: "border-[#14B8A6]", bg: "bg-[#F0FDFA]", badge: "bg-[#2DD4BF] text-stone-900", text: "text-teal-900", iconBg: "bg-[#14B8A6] text-white border-[#18181B]" },
  };

  const intentColor = (intent: Intent) => {
    switch (intent) {
      case "price": return "text-amber-900 bg-[#FFE135] border-stone-900";
      case "news": return "text-white bg-[#8B5CF6] border-stone-900";
      case "compliance": return "text-stone-900 bg-[#34D399] border-stone-900";
      case "lead": return "text-stone-900 bg-[#38BDF8] border-stone-900";
      case "vat": return "text-white bg-[#F43F5E] border-stone-900";
      case "outage": return "text-stone-900 bg-[#FB923C] border-stone-900";
      case "leak": return "text-white bg-[#EF4444] border-stone-900";
      case "rfp": return "text-stone-900 bg-[#2DD4BF] border-stone-900";
      default: return "text-stone-800 bg-stone-100 border-stone-900";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="nr-card p-6 bg-gradient-to-r from-[#FFFBEB] via-[#FEF3C7] to-[#ECFDF5]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <span className="nr-eyebrow">Enterprise Relay Directory · Multi-Agent Gym</span>
            <h2 className="nr-display text-3xl sm:text-4xl text-ink font-black">All 8 Original Specialized Workflows</h2>
            <p className="mt-2 text-sm text-stone-700 leading-relaxed font-medium">
              Every workflow in NexusRelay is a deterministically compiled 4-stage Directed Acyclic Graph (DAG).
              Each executes through a dedicated specialist relay: <strong>Scout</strong> (Noise Filter) → <strong>Extractor</strong> (Schema Lifting) → <strong>Gatekeeper</strong> (Evidence Gate) → <strong>Settlement</strong> (REST Delivery).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={batchRunning}
              onClick={() => void executeAllWorkflows()}
              className="nr-arcade-btn bg-[#FFE135] text-stone-900 px-6 py-3 text-xs font-black shadow-[4px_4px_0px_#18181B] hover:scale-105 active:scale-95 disabled:opacity-50"
            >
              {batchRunning ? "Simulating all 8 workflows…" : "▶ Execute All 8 Workflows"}
            </button>
          </div>
        </div>

        {/* Global Filter & Search Bar */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t-2 border-stone-900/40 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-stone-700 mr-1 uppercase">Filter:</span>
            <button
              type="button"
              onClick={() => setFilterIntent("all")}
              className={`nr-arcade-btn px-3.5 py-1 text-xs transition-colors ${filterIntent === "all" ? "bg-stone-900 text-white" : "bg-white text-stone-800"}`}
            >
              All (8)
            </button>
            {PRESETS.map(p => {
              const t = INTENT_THEMES[p.id];
              const isActive = filterIntent === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setFilterIntent(p.id)}
                  className={`nr-arcade-btn px-3 py-1 text-xs font-bold transition-all ${isActive ? `${t.badge} shadow-[2px_2px_0px_#000]` : "bg-white text-stone-700"}`}
                >
                  {p.name}
                </button>
              );
            })}
          </div>

          <div className="w-full sm:w-64">
            <input
              type="search"
              placeholder="Search workflows, schemas, intent…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border-2 border-stone-900 bg-white px-3.5 py-1.5 text-xs font-medium placeholder:text-stone-400 focus:outline-none shadow-[2px_2px_0px_#18181B]"
            />
          </div>
        </div>
      </div>

      {/* Batch Scorecard (if executed) */}
      {batchScorecard && (
        <div className="nr-card p-5 bg-[#ECFDF5] border-2 border-stone-900 shadow-[5px_5px_0px_#18181B] animate-fadeIn">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-stone-900 pb-3">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">Verification Report</span>
              <h3 className="nr-display text-xl text-ink font-black">
                All 8 Workflows Completed: {batchScorecard.passed}/{batchScorecard.total} Passed Evidence Gates
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setBatchScorecard(null)}
              className="nr-arcade-btn bg-white text-stone-900 px-3 py-1 text-xs"
            >
              Dismiss ✕
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {batchScorecard.results.map(item => (
              <div key={item.id} className="rounded-xl border-2 border-stone-900 bg-white p-3 text-xs shadow-[2px_2px_0px_#18181B]">
                <div className="flex items-center justify-between">
                  <strong className="font-bold text-stone-900">{item.name}</strong>
                  <span className={`font-mono font-black text-[10px] px-1.5 py-0.5 rounded border border-stone-900 ${item.ok ? "bg-[#34D399] text-stone-900" : "bg-[#F43F5E] text-white"}`}>
                    {item.ok ? "✓ SETTLED" : "✗ HELD"}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-stone-600 font-medium">
                  <span>Intent: {item.intent}</span>
                  <span className="font-mono">{item.tokens} tokens</span>
                </div>
                {item.payload && (
                  <pre className="mt-2 max-h-20 overflow-auto rounded-lg bg-stone-900 p-2 font-mono text-[9px] text-[#34D399]">
                    {JSON.stringify(item.payload, null, 1)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grid of All Workflows */}
      <div className="space-y-4">
        {filteredWorkflows.map(({ preset, dag, schema, rest, corpus, samplePayload }) => {
          const runState = runStates[preset.id];
          const isExpanded = expandedWorkflow === preset.id;
          const requiredFields = (schema?.required as string[]) || [];
          const theme = INTENT_THEMES[preset.id] || { border: "border-stone-900", bg: "bg-white", badge: "bg-stone-200 text-stone-900", text: "text-stone-900", iconBg: "bg-stone-900 text-white border-stone-900" };

          return (
            <article
              key={preset.id}
              className={`nr-arcade-card transition-all overflow-hidden border-2 ${theme.border} ${theme.bg}`}
            >
              {/* Header Bar */}
              <div className="p-5 flex flex-wrap items-center justify-between gap-3 bg-white/80">
                <div className="flex items-center gap-3.5">
                  <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border-2 text-xs font-black uppercase shadow-[2px_2px_0px_#18181B] ${theme.iconBg}`}>
                    {preset.id.slice(0, 3)}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="nr-display text-xl text-ink font-black">{preset.name}</h3>
                      <span aria-hidden="true" className="text-stone-400">·</span>
                      <span className="text-xs text-stone-600 font-semibold">{preset.blurb}</span>
                      <span aria-hidden="true" className="text-stone-400">·</span>
                      <span className="font-mono text-[11px] text-amber-900 font-bold">intent: {preset.id}</span>
                    </div>
                    <p className="mt-1 text-xs text-stone-700 max-w-2xl leading-relaxed">{preset.objective}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={runState?.running}
                    onClick={() => void executeWorkflow(preset.id, dag)}
                    className="nr-arcade-btn bg-[#FFE135] text-stone-900 px-4 py-1.5 text-xs font-bold disabled:opacity-50"
                  >
                    {runState?.running ? "Simulating…" : "▶ Simulate"}
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenInStudio(preset.id)}
                    className="nr-arcade-btn bg-white text-stone-800 px-3.5 py-1.5 text-xs"
                  >
                    Edit in Studio ↗
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenInBrowser(preset.id)}
                    className="nr-arcade-btn bg-[#38BDF8] text-stone-900 px-3.5 py-1.5 text-xs"
                  >
                    Browser Scene ↗
                  </button>

                  <button
                    type="button"
                    onClick={() => setExpandedWorkflow(isExpanded ? null : preset.id)}
                    className="nr-arcade-btn bg-white text-stone-700 px-3 py-1.5 text-xs"
                    aria-expanded={isExpanded}
                  >
                    {isExpanded ? "Collapse ▲" : "Inspect DAG ▼"}
                  </button>
                </div>
              </div>

              {/* Execution Result Banner (if run) */}
              {runState && (
                <div className={"border-t px-5 py-3 text-xs " + (runState.result?.ok ? "bg-emerald-50/70 border-emerald-200 text-emerald-900" : runState.error ? "bg-rose-50 border-rose-200 text-rose-900" : "bg-stone-50 border-stone-200 text-stone-700")}>
                  {runState.running && (
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                      <span>Specialist squad executing 4-stage pipeline for {preset.name}…</span>
                    </div>
                  )}

                  {runState.error && (
                    <div className="font-semibold">Execution error: {runState.error}</div>
                  )}

                  {runState.result && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-emerald-800">
                          ✓ Relay execution successful · Settled across {runState.result.steps.length} hops
                        </span>
                        <span className="text-[11px] text-stone-500">
                          Gate Decision: {runState.result.lastChoice?.selected ?? "proceed"} (Score: {runState.result.steps[2]?.score?.value?.toFixed(2) ?? "1.00"})
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Execution Hops</span>
                          <ol className="mt-1 space-y-1 font-mono text-[10px] text-stone-700">
                            {runState.result.steps.map((step, idx) => (
                              <li key={idx} className="flex justify-between border-b border-stone-200/50 pb-0.5">
                                <span>{step.node.mind} ({step.node.id})</span>
                                <span>{step.choice.selected} · {step.out.tokens} tokens</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Structured Payload</span>
                          <pre className="mt-1 max-h-24 overflow-auto rounded bg-ink p-2 font-mono text-[10px] text-stone-100">
                            {JSON.stringify(runState.result.structured, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Expanded Pipeline Details */}
              {isExpanded && (
                <div className="border-t border-stone-200 bg-stone-50/50 p-5 space-y-5 animate-fadeIn">
                  {/* 4 Pipeline Stages Cards */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3">
                      Compiled 4-Stage Specialist Pipeline (DAG)
                    </h4>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {dag.nodes.map((node, idx) => (
                        <div key={node.id} className="rounded-xl border border-stone-200 bg-white p-3.5 shadow-sm space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase text-stone-400">Hop 0{idx + 1}</span>
                            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[9px] font-mono font-semibold text-stone-600">
                              {node.channel}
                            </span>
                          </div>

                          <div>
                            <strong className="block text-sm font-semibold capitalize text-stone-900">{node.mind}</strong>
                            <span className="text-xs text-stone-500">{node.title}</span>
                          </div>

                          <div className="border-t border-stone-100 pt-2 text-[11px] text-stone-600 space-y-1">
                            <div className="flex justify-between">
                              <span className="text-stone-400">Prune Budget:</span>
                              <span className="font-mono">{node.pruneBudget} tokens</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-stone-400">Min Score:</span>
                              <span className="font-mono">{node.jev.scoreMin}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-stone-400">Choices:</span>
                              <span className="font-mono">{node.jev.choice.slice(0, 2).join(", ")}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Schema & Corpus Row */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Schema Definition */}
                    <div className="rounded-xl border border-stone-200 bg-white p-4">
                      <div className="flex items-center justify-between mb-2">
                        <strong className="text-xs font-bold uppercase tracking-wider text-stone-700">
                          Target JSON Schema & Typed Fields
                        </strong>
                        <span className="text-[10px] text-stone-500 font-mono">
                          {requiredFields.length} required fields
                        </span>
                      </div>
                      <div className="space-y-1.5 mt-2">
                        {Object.entries(schema.properties || {}).map(([key, prop]: [string, any]) => (
                          <div key={key} className="flex items-center justify-between text-xs py-1 border-b border-stone-100 font-mono">
                            <span className="font-semibold text-stone-800">
                              {key} {requiredFields.includes(key) && <span className="text-rose-600">*</span>}
                            </span>
                            <span className="text-stone-500">
                              type: {prop.type}{prop.minimum !== undefined ? ` (min: ${prop.minimum})` : ""}{prop.minLength !== undefined ? ` (minLen: ${prop.minLength})` : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* REST Settlement Dispatch */}
                    <div className="rounded-xl border border-stone-200 bg-white p-4">
                      <div className="flex items-center justify-between mb-2">
                        <strong className="text-xs font-bold uppercase tracking-wider text-stone-700">
                          Settlement REST Dispatch Spec
                        </strong>
                        <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-800 font-mono">
                          {rest.method}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-xs text-stone-800 break-all bg-stone-50 p-2 rounded border border-stone-200">
                        {rest.url}
                      </p>
                      <div className="mt-3">
                        <span className="text-[10px] font-semibold text-stone-500 uppercase">Headers</span>
                        <div className="mt-1 space-y-1 font-mono text-[11px] text-stone-600">
                          {Object.entries(rest.headers).map(([hK, hV]) => (
                            <div key={hK} className="flex justify-between bg-stone-50 px-2 py-1 rounded">
                              <span className="font-medium text-stone-700">{hK}:</span>
                              <span>{hV}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Research Corpus & Sample Extraction */}
                  <div className="rounded-xl border border-stone-200 bg-white p-4">
                    <strong className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-2">
                      Tavily Domain Corpus & Sample Structured Lift
                    </strong>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[11px] font-semibold text-stone-500">Research Documents:</span>
                        <div className="mt-1.5 space-y-2">
                          {corpus.map((doc, dIdx) => (
                            <div key={dIdx} className="rounded bg-stone-50 p-2 border border-stone-200/60">
                              <div className="font-semibold text-stone-800">{doc.title}</div>
                              <div className="font-mono text-[10px] text-blue-700 truncate">{doc.url}</div>
                              <div className="mt-1 text-[11px] text-stone-600 line-clamp-2">{doc.markdown}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <span className="text-[11px] font-semibold text-stone-500">Deterministic Lifted Payload:</span>
                        <pre className="mt-1.5 max-h-36 overflow-auto rounded bg-ink p-2.5 font-mono text-[10px] text-stone-100">
                          {JSON.stringify(samplePayload, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
