import { detectIntent, liftStructured, pruneTokens, tavilySearch, tokensOf } from "./tavilyAdapter";
import { jevChoice, jevNoul, jevScore } from "./jevEngine";
import type { Intent, JsonSchema, RestSpec, VesselResult, WorkflowDag, WorkflowNode } from "../types";
export function schemaFor(intent: Intent): JsonSchema {
  if (intent === "price") return { type: "object", required: ["sku", "currency", "price"], properties: { sku: { type: "string", minLength: 2 }, currency: { type: "string", minLength: 3 }, price: { type: "number", minimum: 0 } } };
  if (intent === "news") return { type: "object", required: ["supplier", "severity", "sentiment"], properties: { supplier: { type: "string" }, severity: { type: "string" }, sentiment: { type: "string" } } };
  if (intent === "compliance") return { type: "object", required: ["framework", "controlId", "status"], properties: { framework: { type: "string" }, controlId: { type: "string" }, status: { type: "string" } } };
  if (intent === "lead") return { type: "object", required: ["domain", "email"], properties: { domain: { type: "string", minLength: 3 }, email: { type: "string", minLength: 5 } } };
  if (intent === "vat") return { type: "object", required: ["hs", "euVat", "ukVat", "landedUsd", "compliant"], properties: { hs: { type: "string" }, euVat: { type: "number" }, ukVat: { type: "number" }, landedUsd: { type: "number" }, compliant: { type: "boolean" } } };
  if (intent === "outage") return { type: "object", required: ["sev", "provider", "region", "incidentId", "pageDegraded"], properties: { sev: { type: "string" }, provider: { type: "string" }, region: { type: "string" }, incidentId: { type: "string" }, pageDegraded: { type: "boolean" } } };
  if (intent === "leak") return { type: "object", required: ["domain", "findings", "redacted", "ticket"], properties: { domain: { type: "string" }, findings: { type: "number" }, redacted: { type: "boolean" }, ticket: { type: "string" } } };
  return { type: "object", required: ["winner", "vendors", "deltaUsd", "complete"], properties: { winner: { type: "string" }, vendors: { type: "number" }, deltaUsd: { type: "number" }, complete: { type: "boolean" } } };
}
export function restFor(intent: Intent): RestSpec {
  if (intent === "price") return { method: "POST", url: "https://erp.internal/webhooks/price-delta", headers: { "X-Idempotency-Key": "nr-price" } };
  if (intent === "news") return { method: "POST", url: "https://hooks.slack.internal/nr", headers: { "Content-Type": "application/json" } };
  if (intent === "compliance") return { method: "POST", url: "https://audit.internal/v1/events", headers: { "X-Control-Plane": "noul" } };
  if (intent === "lead") return { method: "PUT", url: "https://crm.internal/api/leads/upsert", headers: { "X-Object": "Lead" } };
  if (intent === "vat") return { method: "POST", url: "https://sap.internal/api/tax/landed-cost", headers: { "X-SAP-Object": "LandedCost" } };
  if (intent === "outage") return { method: "POST", url: "https://api.pagerduty.internal/incidents", headers: { From: "nexusrelay@ops.internal" } };
  if (intent === "leak") return { method: "POST", url: "https://secops.internal/api/tickets", headers: { "X-Queue": "identity-threat" } };
  return { method: "POST", url: "https://exec.internal/api/summaries", headers: { "X-Doc-Type": "rfp-matrix" } };
}
export function synthesize(objective: string): WorkflowDag {
  const intent = detectIntent(objective);
  const schema = schemaFor(intent);
  const rest = restFor(intent);
  const nodes: WorkflowNode[] = [
    { id: "scout", title: "Tavily research", channel: "TAVILY_RESEARCH", mind: "scout", dependsOn: [], pruneBudget: 720, prompt: objective, jev: { scoreMin: 0.62, choice: ["proceed", "retry_extract", "abort"], noul: null } },
    { id: "extract", title: "Lift schema", channel: "TRANSFORMATION", mind: "extractor", dependsOn: ["scout"], pruneBudget: 480, prompt: "lift", jev: { scoreMin: 0.7, choice: ["proceed", "human_review", "abort"], noul: schema } },
    { id: "gate", title: "Jev gate", channel: "HUMAN_GATE", mind: "gatekeeper", dependsOn: ["extract"], pruneBudget: 240, prompt: "gate", jev: { scoreMin: 0.72, choice: ["proceed", "human_review", "abort"], noul: schema } },
    { id: "settle", title: "REST dispatch", channel: "REST_API_DISPATCH", mind: "settlement", dependsOn: ["gate"], pruneBudget: 200, prompt: "dispatch", rest, jev: { scoreMin: 0.65, choice: ["proceed", "abort"], noul: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } } } } }
  ];
  return { id: "dag_" + intent, objective, intent, nodes, edges: [["scout", "extract"], ["extract", "gate"], ["gate", "settle"]] };
}
export function topo(dag: WorkflowDag): WorkflowNode[] {
  const byId = Object.fromEntries(dag.nodes.map(n => [n.id, n]));
  const seen = new Set<string>(); const out: WorkflowNode[] = [];
  const visit = (id: string) => { if (seen.has(id)) return; seen.add(id); const n = byId[id]; if (!n) return; n.dependsOn.forEach(visit); out.push(n); };
  dag.nodes.forEach(n => visit(n.id));
  return out;
}
function sleep(ms: number){ return new Promise(r => setTimeout(r, ms)); }
export type VesselTick = { type: "node"; node: WorkflowNode } | { type: "gate"; node: WorkflowNode } | { type: "halt"; node: WorkflowNode } | { type: "done" };
export async function runVessel(dag: WorkflowDag, onTick: (e: VesselTick) => void): Promise<VesselResult> {
  let ctx: { markdown: string; structured: Record<string, unknown> | null } = { markdown: "", structured: null };
  const steps: VesselResult["steps"] = []; let totalIn = 0, totalOut = 0, lastScore = 0;
  let lastChoice: VesselResult["lastChoice"] = null; let lastNoul: VesselResult["lastNoul"] = null;
  for (const node of topo(dag)) {
    onTick({ type: "node", node }); await sleep(40);
    let out: VesselResult["steps"][number]["out"] = { ok: true, rawTokens: 400, tokens: 200, dropped: 200, markdown: ctx.markdown, structured: ctx.structured };
    if (node.channel === "TAVILY_RESEARCH") {
      const docs = await tavilySearch(dag.objective);
      const pruned = pruneTokens(docs, dag.objective, node.pruneBudget);
      out = { ok: true, rawTokens: docs.reduce((a, d) => a + tokensOf(d.markdown), 0), tokens: pruned.tokens, dropped: pruned.dropped, markdown: pruned.markdown, structured: null, sources: pruned.sources };
    } else if (node.channel === "TRANSFORMATION") {
      const structured = liftStructured(ctx.markdown, dag.intent);
      out = { ok: true, rawTokens: tokensOf(ctx.markdown), tokens: tokensOf(JSON.stringify(structured)), dropped: 0, markdown: ctx.markdown, structured };
    } else if (node.channel === "REST_API_DISPATCH") {
      const body = { ok: true, acceptedAt: new Date().toISOString(), route: node.rest?.url ?? "", payload: ctx.structured };
      out = { ok: true, rawTokens: 90, tokens: tokensOf(JSON.stringify(body)), dropped: 0, markdown: "", structured: body, restStatus: 201, rest: node.rest };
    }
    totalIn += out.rawTokens; totalOut += out.tokens;
    const payload = out.structured ?? { markdown: out.markdown };
    const sc = await jevScore(payload, { required: Object.keys(payload) });
    const nu = node.jev.noul ? await jevNoul(payload, node.jev.noul) : { pass: true, violations: [] as string[] };
    const ch = await jevChoice(node.jev.choice, { score: sc.value, scoreMin: node.jev.scoreMin, noul: nu });
    lastScore = sc.value; lastChoice = ch; lastNoul = nu;
    steps.push({ node, out, score: sc, noul: nu, choice: ch, at: Date.now() });
    onTick({ type: "gate", node });
    if (!nu.pass || ch.selected === "abort") { onTick({ type: "halt", node }); return { ok: false, steps, totalIn, totalOut, lastScore, lastChoice, lastNoul }; }
    ctx = { markdown: out.markdown || ctx.markdown, structured: out.structured || ctx.structured };
  }
  onTick({ type: "done" });
  return { ok: true, steps, totalIn, totalOut, lastScore, lastChoice, lastNoul, structured: ctx.structured };
}
export function simulateMonolith(dag: WorkflowDag, vessel: VesselResult) {
  const hops = dag.nodes.length;
  const tokens = Math.round((vessel.totalIn || 1800) * (1.85 + hops * 0.35));
  const drift = Math.max(0, Math.min(1, 0.18 + hops * 0.14 + (1 - (vessel.lastScore || 0.5)) * 0.25));
  const failAt = drift > 0.55 ? Math.max(1, hops - 1) : null;
  return { tokens, drift, failAt, hallucination: drift > 0.48, note: failAt ? "Context pollution at hop " + failAt : "Degraded but completed" };
}
