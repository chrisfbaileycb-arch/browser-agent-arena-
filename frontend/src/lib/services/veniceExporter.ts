import type { WorkflowDag } from "../types";

export function exportBundle(dag: WorkflowDag): Record<string, string> {
  const pkg = {
    name: "nexusrelay-vessel",
    private: true,
    type: "module",
    version: "1.0.0",
    scripts: { start: "tsx runner.ts", dry: "tsx runner.ts --dry-run" },
    dependencies: { tsx: "^4.19.0", typescript: "^5.6.0" },
  };

  const slim = {
    objective: dag.objective,
    intent: dag.intent,
    nodes: dag.nodes.map((n) => ({
      id: n.id,
      title: n.title,
      channel: n.channel,
      dependsOn: n.dependsOn,
      pruneBudget: n.pruneBudget,
      jev: n.jev,
      rest: n.rest ?? null,
    })),
  };

  const runner = `/**
 * NexusRelay execution vessel — generated from DAG ${dag.id}
 * Objective: ${dag.objective.replace(/\n/g, " ")}
 */
export type Channel = "TAVILY_RESEARCH" | "REST_API_DISPATCH" | "TRANSFORMATION" | "HUMAN_GATE";

export interface JevChoice { selected: string; confidence: number; rationale: string }
export interface JevScore { value: number; dimensions: Record<string, number> }
export interface JevNoul { pass: boolean; violations: string[] }

const DAG = ${JSON.stringify(slim, null, 2)} as const;

function clamp(n: number, a = 0, b = 1) { return Math.max(a, Math.min(b, n)); }
function tokenize(s: string) { return String(s || "").toLowerCase().match(/[a-z0-9]+/g) || []; }

export async function jevChoice(candidates: string[], context: { score?: number; scoreMin?: number; noul?: JevNoul }, gateway?: string): Promise<JevChoice> {
  if (gateway) {
    try {
      const res = await fetch(gateway, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + (process.env.JEV_API_KEY || "") },
        body: JSON.stringify({ kind: "Choice", candidates, context }),
      });
      if (res.ok) return await res.json() as JevChoice;
    } catch { /* local fallback */ }
  }
  const score = typeof context.score === "number" ? context.score : 0.7;
  const noulPass = !context.noul || context.noul.pass !== false;
  if (!noulPass) return { selected: "abort", confidence: 0.97, rationale: "Noul assertion failed" };
  if (score < (context.scoreMin ?? 0.7) && candidates.includes("human_review")) {
    return { selected: "human_review", confidence: 0.8, rationale: "Below readiness band" };
  }
  return {
    selected: candidates.includes("proceed") ? "proceed" : candidates[0],
    confidence: clamp(0.58 + score * 0.38),
    rationale: "Local fallback Choice",
  };
}

export async function jevScore(payload: unknown): Promise<JevScore> {
  const keys = payload && typeof payload === "object" ? Object.keys(payload as object) : [];
  const rec = payload as Record<string, unknown> | null;
  const completeness = keys.length ? keys.filter((k) => rec && rec[k] !== "" && rec[k] != null).length / keys.length : 0.2;
  const toks = tokenize(JSON.stringify(payload ?? {}));
  const density = clamp(0.35 + (new Set(toks).size / Math.max(toks.length, 1)) * 0.7);
  const value = clamp(completeness * 0.5 + density * 0.5);
  return { value, dimensions: { completeness, density, consistency: 0.9 } };
}

export async function jevNoul(payload: Record<string, unknown> | null, schema: { required?: string[] }): Promise<JevNoul> {
  const violations: string[] = [];
  for (const r of schema.required ?? []) {
    if (payload?.[r] == null || payload?.[r] === "") violations.push("$." + r + " required");
  }
  return { pass: violations.length === 0, violations };
}

export async function tavilySearch(query: string) {
  const key = process.env.TAVILY_API_KEY;
  const base = process.env.TAVILY_API_URL;
  if (!key || !base) return { results: [], note: "Tavily credentials missing — dry corpus" };
  const res = await fetch(base.replace(/\\/$/, "") + "/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ api_key: key, query, max_results: 6, include_raw_content: false }),
  });
  if (!res.ok) throw new Error("Tavily " + res.status);
  return await res.json();
}

export function pruneTokens(text: string, budget = 900) {
  const parts = text.split(/(?<=[.!?])\\s+/).filter((s) => !/cookie|subscribe|advertisement/i.test(s));
  let used = 0;
  const kept: string[] = [];
  for (const p of parts) {
    const t = Math.ceil(p.length / 4);
    if (used + t > budget) continue;
    kept.push(p);
    used += t;
  }
  return { markdown: kept.join(" "), tokens: used };
}

async function dispatch(node: (typeof DAG.nodes)[number], payload: unknown) {
  if (process.env.DRY_RUN === "true") return { ok: true, dry: true, url: node.rest?.url };
  if (!node.rest) return { ok: true, skipped: true };
  const res = await fetch(node.rest.url, {
    method: node.rest.method || "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + (process.env.WEBHOOK_BEARER || ""),
      ...(node.rest.headers || {}),
    },
    body: JSON.stringify(payload),
  });
  return { ok: res.ok, status: res.status };
}

export async function run() {
  let ctx: Record<string, unknown> = {};
  for (const node of DAG.nodes) {
    if (node.channel === "TAVILY_RESEARCH") {
      const found = await tavilySearch(DAG.objective);
      const pruned = pruneTokens(JSON.stringify(found), node.pruneBudget);
      ctx = { ...ctx, ...pruned };
    }
    const sc = await jevScore(ctx);
    const nu = await jevNoul(ctx, node.jev?.noul || { required: [] });
    const ch = await jevChoice(node.jev?.choice || ["proceed", "abort"], {
      score: sc.value,
      scoreMin: node.jev?.scoreMin,
      noul: nu,
    }, process.env.JEV_GATEWAY_URL);
    if (!nu.pass || ch.selected === "abort") {
      throw new Error("Gate halt at " + node.id + ": " + (nu.violations.join("; ") || ch.rationale));
    }
    if (node.channel === "REST_API_DISPATCH") ctx = await dispatch(node, ctx) as Record<string, unknown>;
  }
  return ctx;
}

if (process.argv[1] && /runner\\.ts$/.test(process.argv[1])) {
  run()
    .then((r) => { console.log(JSON.stringify(r, null, 2)); })
    .catch((e) => { console.error(e); process.exit(1); });
}
`;

  return {
    "package.json": JSON.stringify(pkg, null, 2),
    ".env.example": ["TAVILY_API_KEY=", "TAVILY_API_URL=", "JEV_GATEWAY_URL=", "JEV_API_KEY=", "WEBHOOK_BEARER=", "DRY_RUN=true"].join("\n"),
    "runner.ts": runner,
  };
}
