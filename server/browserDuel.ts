import { chromium, type Browser } from "playwright";
import { noulLocal } from "../src/core/jevEngine";
import type { ArenaChallenge } from "../src/data/arenaChallenges";

export interface BrowserDuelConfig {
  geminiKey: string;
  jevKey: string;
  geminiModel?: string;
  fetcher?: typeof fetch;
  launchBrowser?: () => Promise<Browser>;
}

export interface BrowserLaneResult {
  lane: "A" | "B";
  success: boolean;
  durationMs: number;
  promptTokens: number;
  screenshot: string;
  payload: Record<string, unknown> | null;
  events: Array<{ stage: string; action: string; selector?: string; detail: string }>;
  gate?: { choice: string; score: number; noul: number; violations: string[] };
  error?: string;
}

export interface BrowserDuelResult {
  mode: "live browser";
  url: string;
  winner: "A" | "B" | "draw";
  lanes: [BrowserLaneResult, BrowserLaneResult];
}

function jsonObject(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Model returned an invalid JSON object.");
  return parsed as Record<string, unknown>;
}

async function provider(url: string, key: string, body: unknown, client: typeof fetch, authHeader: string) {
  const response = await client(url, {
    method: "POST", headers: { "Content-Type": "application/json", [authHeader]: authHeader === "Authorization" ? `Bearer ${key}` : key },
    body: JSON.stringify(body), signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`${new URL(url).hostname} returned HTTP ${response.status}: ${(await response.text()).slice(0, 180)}`);
  return jsonObject(await response.text());
}

async function model(prompt: string, config: BrowserDuelConfig): Promise<{ output: Record<string, unknown>; tokens: number }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.geminiModel || "gemini-2.5-flash")}:generateContent`;
  const response = await provider(url, config.geminiKey, { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } }, config.fetcher ?? fetch, "x-goog-api-key");
  const candidates = response.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
  const text = candidates?.[0]?.content?.parts?.map(part => part.text ?? "").join("");
  if (!text) throw new Error("Gemini returned no browser decision.");
  const usage = response.usageMetadata as { promptTokenCount?: number } | undefined;
  return { output: jsonObject(text), tokens: Number(usage?.promptTokenCount) || 0 };
}

function assertPayload(challenge: ArenaChallenge, payload: Record<string, unknown>): string[] {
  return (challenge.assertions ?? []).flatMap(assertion => {
    const value = payload[assertion.field];
    const exists = Object.hasOwn(payload, assertion.field) && value !== null && value !== undefined;
    return (assertion.operator === "exists" ? exists : exists && String(value) === assertion.value)
      ? [] : [`${assertion.field}: ${assertion.operator === "exists" ? "missing" : `expected ${assertion.value}`}`];
  });
}

async function lane(challenge: ArenaChallenge, config: BrowserDuelConfig, browser: Browser, id: "A" | "B"): Promise<BrowserLaneResult> {
  const started = Date.now();
  const result: BrowserLaneResult = { lane: id, success: false, durationMs: 0, promptTokens: 0, screenshot: "", payload: null, events: [] };
  const context = await browser.newContext({ viewport: { width: 1050, height: 720 } });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  try {
    await page.goto(challenge.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    result.events.push({ stage: "Scout", action: "navigate", detail: `Opened ${page.url()} in a real Chromium page.` });
    const history: string[] = [];
    const observations: string[] = [];
    const selectors = challenge.nodes.map(node => ({ selector: node.selector, label: node.text }));
    for (let step = 0; step < 6; step++) {
      const available = await Promise.all(selectors.map(async node => {
        const locator = page.locator(node.selector).first();
        const count = await locator.count().catch(() => 0);
        const visible = count ? await locator.isVisible().catch(() => false) : false;
        return { ...node, visible, text: visible ? (await locator.innerText({ timeout: 1500 }).catch(() => node.label)).slice(0, 200) : "" };
      }));
      const pageText = (await page.locator("body").innerText().catch(() => "")).slice(0, 6000);
      observations.push(pageText);
      const prompt = id === "A"
        ? `You are one browser agent responsible for all navigation and extraction. Mission: ${challenge.blurb}. Current URL: ${page.url()}. All previous observations: ${history.join("\n").slice(-9000)}. Current page text: ${pageText}. Available mission selectors: ${JSON.stringify(available)}. Choose ONE action using JSON {"action":"click|fill|select|inspect|done","selector":"an exact selector from the list or empty for done","value":"input value if needed","reason":"short explanation"}. Choose done when the page provides enough evidence for ${JSON.stringify(challenge.schema)}.`
        : `You are the Scout specialist in a relay team. Mission: ${challenge.blurb}. Current URL: ${page.url()}. Current page text: ${pageText.slice(0, 3000)}. Available mission selectors: ${JSON.stringify(available)}. Choose ONE action using JSON {"action":"click|fill|select|inspect|done","selector":"an exact selector from the list or empty for done","value":"input value if needed","reason":"short explanation"}. Choose done when the Extractor has enough page evidence for ${JSON.stringify(challenge.schema)}. Use only the current observation.`;
      const decision = await model(prompt, config);
      result.promptTokens += decision.tokens;
      const action = String(decision.output.action ?? "done");
      const selector = String(decision.output.selector ?? "");
      const value = String(decision.output.value ?? "");
      const reason = String(decision.output.reason ?? "").slice(0, 240);
      if (action === "done") { result.events.push({ stage: "Scout", action, detail: reason || "Ready to extract." }); break; }
      if (!selectors.some(node => node.selector === selector)) throw new Error(`Agent chose an unconfigured selector: ${selector}`);
      const locator = page.locator(selector).first();
      if (action === "click") await locator.click();
      else if (action === "fill") await locator.fill(value);
      else if (action === "select") await locator.selectOption(value);
      else if (action === "inspect") observations.push((await locator.innerText()).slice(0, 1200));
      else throw new Error(`Agent chose an unknown browser action: ${action}`);
      history.push(`${action} ${selector}: ${reason}; page: ${pageText.slice(0, 1200)}`);
      result.events.push({ stage: "Scout", action, selector, detail: reason });
    }

    const evidenceText = (await page.locator("body").innerText().catch(() => "")).slice(0, 9000);
    const extraction = await model(`You are the ${id === "B" ? "Extractor specialist" : "same solo agent"}. Extract a JSON object {"payload":{},"evidence":"which visible page text supports the fields"} from this actual browser observation. Schema: ${JSON.stringify(challenge.schema)}. URL: ${page.url()}. Visible page text: ${evidenceText}. Inspected text: ${observations.slice(-2).join("\n").slice(0, 2500)}. Use null when a field is unsupported. Do not use a prewritten fixture.`, config);
    result.promptTokens += extraction.tokens;
    if (!extraction.output.payload || typeof extraction.output.payload !== "object" || Array.isArray(extraction.output.payload)) throw new Error("Extractor returned no payload.");
    const payload = extraction.output.payload as Record<string, unknown>;
    const evidence = String(extraction.output.evidence ?? "");
    result.payload = payload;
    result.events.push({ stage: "Extractor", action: "extract", detail: `${Object.keys(payload).length} fields read from the opened page.` });

    const jev = await provider("https://api.typesafe.ai/v1/systemone", config.jevKey, {
      model: "jev-latest", state: JSON.stringify({ mission: challenge.blurb, url: page.url(), payload, evidence, pageText: evidenceText }),
      questions: {
        route: { type: "choice", instructions: "Should this browser extraction proceed based on visible evidence?", criteria: { proceed: "Supported", review: "Ambiguous", abort: "Unsupported" } },
        quality: { type: "score", instructions: "Completeness and accuracy of browser extraction", criteria: ["Invalid", "Weak", "Partial", "Mostly complete", "Complete"] },
        supported: { type: "noul", instructions: "Every non-null payload field is supported by the observed page text" },
      },
    }, config.fetcher ?? fetch, "Authorization");
    const answers = jev.answers as Record<string, Record<string, unknown>> | undefined;
    if (!answers?.route || !answers.quality || !answers.supported) throw new Error("Jev returned incomplete browser evaluation.");
    const choice = String(answers.route.choice ?? "abort");
    const score = Number(answers.quality.score) / 4;
    const noul = Number(answers.supported.noul);
    if (![score, noul].every(n => Number.isFinite(n) && n >= 0 && n <= 1)) throw new Error("Jev returned invalid browser gate values.");
    const local = noulLocal(payload, challenge.schema);
    const violations = [...local.violations, ...assertPayload(challenge, payload)];
    result.gate = { choice, score, noul, violations };
    result.success = violations.length === 0 && evidence.trim().length > 0 && choice === "proceed" && score >= 0.7 && noul >= 0.7;
    result.events.push({ stage: "Gatekeeper", action: result.success ? "proceed" : "hold", detail: `Jev ${choice}; score ${score.toFixed(2)}, support ${noul.toFixed(2)}; ${violations.join("; ") || "assertions checked"}.` });
    result.events.push({ stage: "Settlement", action: result.success ? "complete" : "halt", detail: result.success ? "Live browser mission passed." : "Mission did not pass the evidence gate." });
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Browser run failed";
    result.events.push({ stage: "Browser", action: "error", detail: result.error });
  } finally {
    try { result.screenshot = (await page.screenshot({ type: "jpeg", quality: 60 })).toString("base64"); } catch { /* The page may have closed after a navigation error. */ }
    result.durationMs = Date.now() - started;
    await context.close();
  }
  return result;
}

export async function runBrowserDuel(challenge: ArenaChallenge, config: BrowserDuelConfig): Promise<BrowserDuelResult> {
  const target = new URL(challenge.url);
  if (!/^https?:$/.test(target.protocol)) throw new Error("A real HTTP or HTTPS challenge URL is required.");
  if (!config.geminiKey || !config.jevKey) throw new Error("GEMINI_API_KEY and TYPESAFE_API_KEY are required for live browser duels.");
  if (!challenge.nodes.length || challenge.nodes.length > 30) throw new Error("Configure between 1 and 30 browser elements.");
  const browser = await (config.launchBrowser?.() ?? chromium.launch({ headless: true }));
  try {
    const [a, b] = await Promise.all([lane(challenge, config, browser, "A"), lane(challenge, config, browser, "B")]);
    const winner = a.success && b.success ? (a.durationMs <= b.durationMs ? "A" : "B") : a.success ? "A" : b.success ? "B" : "draw";
    return { mode: "live browser", url: target.href, winner, lanes: [a, b] };
  } finally { await browser.close(); }
}
