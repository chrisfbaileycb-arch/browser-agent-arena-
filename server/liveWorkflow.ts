import { noulLocal } from "../src/core/jevEngine";
import { schemaFor, topo } from "../src/core/synthesizer";
import type { Intent, WorkflowDag } from "../src/types";

export interface LiveConfig {
  tavilyKey: string;
  geminiKey: string;
  jevKey: string;
  geminiModel?: string;
  webhookUrl?: string;
  webhookBearer?: string;
  fetcher?: typeof fetch;
}

export interface LiveResult {
  mode: "live";
  ok: boolean;
  intent: Intent;
  objective: string;
  payload: Record<string, unknown>;
  citations: string[];
  evidence: string;
  gate: { choice: string; score: number; noul: number; schemaPass: boolean; violations: string[] };
  dispatch: { attempted: boolean; url?: string; status?: number; ok?: boolean; response?: string };
  trace: Array<{ stage: string; detail: string }>;
}

const intents: Intent[] = ["price", "news", "compliance", "lead", "vat", "outage", "leak", "rfp"];

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required for live execution.`);
  return value;
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, client: typeof fetch): Promise<Record<string, unknown>> {
  const response = await client(url, {
    method: "POST", headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body), signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`${new URL(url).hostname} returned HTTP ${response.status}: ${(await response.text()).slice(0, 240)}`);
  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Provider returned an invalid JSON object.");
  return value as Record<string, unknown>;
}

/** Calls each provider. Missing credentials and failed requests never fall back to fixture data. */
export async function runLiveWorkflow(dag: WorkflowDag, config: LiveConfig, send = false): Promise<LiveResult> {
  if (!intents.includes(dag.intent) || !dag.objective.trim()) throw new Error("Invalid workflow objective or intent.");
  const nodes = topo(dag);
  if (nodes.length !== 4 || nodes.some((node, i) => node.id !== ["scout", "extract", "gate", "settle"][i])) {
    throw new Error("Live execution requires Scout, Extractor, Gatekeeper, and Settlement in order.");
  }
  required(config.tavilyKey, "TAVILY_API_KEY");
  required(config.geminiKey, "GEMINI_API_KEY");
  required(config.jevKey, "TYPESAFE_API_KEY");
  if (send) required(config.webhookUrl, `WORKFLOW_WEBHOOK_URL_${dag.intent.toUpperCase()}`);
  const client = config.fetcher ?? fetch;
  const trace: LiveResult["trace"] = [];

  const search = await postJson("https://api.tavily.com/search", { Authorization: `Bearer ${required(config.tavilyKey, "TAVILY_API_KEY")}` }, {
    query: dag.objective, search_depth: "basic", max_results: 6, include_raw_content: true,
  }, client);
  const docs = (Array.isArray(search.results) ? search.results : []).map(item => {
    const row = item as Record<string, unknown>;
    return { url: String(row.url ?? ""), title: String(row.title ?? ""), text: String(row.raw_content || row.content || "") };
  }).filter(doc => /^https?:\/\//.test(doc.url) && doc.text.trim());
  if (!docs.length) throw new Error("Tavily returned no source content for this objective.");
  let remaining = Math.max(200, nodes[0].pruneBudget) * 4;
  const excerpts = docs.map(doc => {
    const text = doc.text.slice(0, Math.max(0, Math.min(remaining, 4500)));
    remaining -= text.length;
    return { url: doc.url, title: doc.title, text };
  }).filter(doc => doc.text);
  const sources = excerpts.map(doc => doc.url);
  trace.push({ stage: "Scout", detail: `${docs.length} live Tavily results; ${excerpts.length} source excerpts retained.` });

  const schema = nodes[1].jev.noul ?? schemaFor(dag.intent);
  const extraction = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.geminiModel || "gemini-2.5-flash")}:generateContent`,
    { "x-goog-api-key": required(config.geminiKey, "GEMINI_API_KEY") },
    { contents: [{ parts: [{ text: `Objective: ${dag.objective}\nExtractor instructions: ${nodes[1].prompt}\nReturn a JSON object with payload, citations, and evidence. payload must satisfy ${JSON.stringify(schema)}. citations must be an array of source URLs from the excerpts that directly support the populated fields. evidence must explain support for each populated field. Use null for unavailable fields; never invent values.\nSources:\n${excerpts.map(doc => `URL: ${doc.url}\nTitle: ${doc.title}\nText: ${doc.text}`).join("\n\n")}` }] }], generationConfig: { responseMimeType: "application/json" } },
    client,
  );
  const candidates = extraction.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
  const generated = candidates?.[0]?.content?.parts?.map(part => part.text ?? "").join("");
  if (!generated) throw new Error("Gemini returned no extraction content.");
  const parsed = JSON.parse(generated) as { payload?: unknown; citations?: unknown; evidence?: unknown };
  if (!parsed.payload || typeof parsed.payload !== "object" || Array.isArray(parsed.payload)) throw new Error("Gemini returned no structured payload.");
  const payload = parsed.payload as Record<string, unknown>;
  const citations = Array.isArray(parsed.citations) ? parsed.citations.filter((url): url is string => typeof url === "string" && sources.includes(url)) : [];
  const evidence = typeof parsed.evidence === "string" ? parsed.evidence : "";
  const local = noulLocal(payload, schema);
  trace.push({ stage: "Extractor", detail: `${Object.keys(payload).length} fields extracted; ${citations.length} source URLs cited; ${local.violations.length} schema violations.` });

  const jev = await postJson("https://api.typesafe.ai/v1/systemone", { Authorization: `Bearer ${required(config.jevKey, "TYPESAFE_API_KEY")}` }, {
    model: "jev-latest",
    state: JSON.stringify({ objective: dag.objective, payload, evidence, citations, sources: excerpts }),
    questions: {
      route: { type: "choice", instructions: `${nodes[2].prompt}. Decide whether the payload is supported by the cited source text.`, criteria: { proceed: "All required data is supported", review: "Some evidence is ambiguous", abort: "Claims are contradicted or unsupported" } },
      quality: { type: "score", instructions: "Completeness and source support of the structured payload", criteria: ["Unsupported", "Weak", "Partial", "Mostly supported", "Fully supported"] },
      supported: { type: "noul", instructions: "Every non-null payload field is directly supported by the cited source excerpts" },
    },
  }, client);
  const answers = jev.answers as Record<string, Record<string, unknown>> | undefined;
  if (!answers?.route || !answers.quality || !answers.supported) throw new Error("Jev returned incomplete answers.");
  const choice = String(answers.route.choice ?? "abort");
  const score = Number(answers.quality.score) / 4;
  const noul = Number(answers.supported.noul);
  if (![score, noul].every(n => Number.isFinite(n) && n >= 0 && n <= 1)) throw new Error("Jev returned invalid gate values.");
  const gate = { choice, score, noul, schemaPass: local.pass, violations: local.violations };
  const passed = local.pass && citations.length > 0 && evidence.trim().length > 0 && choice === "proceed" && score >= nodes[2].jev.scoreMin && noul >= nodes[2].jev.scoreMin;
  trace.push({ stage: "Gatekeeper", detail: `Jev ${choice}; score ${score.toFixed(2)}, source support ${noul.toFixed(2)}; ${passed ? "passed" : "held"}.` });

  const dispatch: LiveResult["dispatch"] = { attempted: false };
  if (send && passed) {
    const destination = required(config.webhookUrl, `WORKFLOW_WEBHOOK_URL_${dag.intent.toUpperCase()}`);
    if (!/^https?:$/.test(new URL(destination).protocol)) throw new Error("Destination URL must use HTTP or HTTPS.");
    const response = await client(destination, {
      method: nodes[3].rest?.method ?? "POST",
      headers: { "Content-Type": "application/json", ...(config.webhookBearer ? { Authorization: `Bearer ${config.webhookBearer}` } : {}) },
      body: JSON.stringify({ intent: dag.intent, objective: dag.objective, payload, citations, evidence }),
      signal: AbortSignal.timeout(45_000),
    });
    Object.assign(dispatch, { attempted: true, url: destination, status: response.status, ok: response.ok, response: (await response.text()).slice(0, 1000) });
    trace.push({ stage: "Settlement", detail: `${nodes[3].rest?.method ?? "POST"} to configured destination returned HTTP ${response.status}.` });
  } else {
    trace.push({ stage: "Settlement", detail: send ? "Gate held the result; no request sent." : "Live result ready; dispatch was not requested." });
  }
  return { mode: "live", ok: passed && (!send || dispatch.ok === true), intent: dag.intent, objective: dag.objective, payload, citations, evidence, gate, dispatch, trace };
}

export function configFromEnv(intent: Intent): LiveConfig {
  return {
    tavilyKey: process.env.TAVILY_API_KEY || "",
    geminiKey: process.env.GEMINI_API_KEY || "",
    jevKey: process.env.TYPESAFE_API_KEY || "",
    geminiModel: process.env.GEMINI_MODEL,
    webhookUrl: process.env[`WORKFLOW_WEBHOOK_URL_${intent.toUpperCase()}`],
    webhookBearer: process.env.WORKFLOW_WEBHOOK_BEARER,
  };
}
