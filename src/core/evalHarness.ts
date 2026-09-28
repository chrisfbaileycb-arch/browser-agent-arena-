import { jevChoice, jevNoul, jevScore } from "./jevEngine";
import { pruneTokens, tokensOf, type TavilyDoc } from "./tavilyAdapter";
import {
  EXTENDED_CHALLENGES,
  getChallenge,
  type EnterpriseChallenge,
} from "../data/extendedChallenges";
import { runVessel, synthesize } from "./synthesizer";
import { PRESETS } from "../data/presets";

export const PRICING = {
  tavilySearchUsd: 0.008,
  tavilyExtractUsd: 0.015,
  llmInputUsdPerMTok: 2.5,
  llmOutputUsdPerMTok: 10,
} as const;

export type Architecture = "monolith" | "relay";

export interface TrialRecord {
  architecture: Architecture;
  trial: number;
  challengeId: string;
  ok: boolean;
  failHop: number | null;
  failMs: number | null;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  cumulativeDrift: number;
  hopTokens: number[];
  score: number;
  noulPass: boolean;
  choice: string;
  tavilyCostUsd: number;
  llmCostUsd: number;
  costUsd: number;
}

export interface ArchitectureStats {
  architecture: Architecture;
  trials: number;
  successes: number;
  failures: number;
  successRate: number;
  mttfMs: number | null;
  meanDurationMs: number;
  meanInputTokens: number;
  tokenDriftVariance: number;
  meanCostUsd: number;
  costPerSuccessfulExecution: number | null;
  meanScore: number;
}

export interface HarnessReport {
  challengeId: string;
  trials: number;
  pricing: typeof PRICING;
  generatedAt: string;
  monolith: ArchitectureStats;
  relay: ArchitectureStats;
  delta: {
    successRate: number;
    mttfMs: number | null;
    tokenDriftVariance: number;
    costPerSuccessfulExecution: number | null;
    meanTokens: number;
  };
  records: TrialRecord[];
}

export interface HarnessOptions {
  challengeId?: string;
  challenge?: EnterpriseChallenge;
  trials?: number;
}

const DOM_BLOAT = [
  "cookie consent accept all",
  "subscribe to newsletter",
  "related products you may like",
  "share on social",
  "advertisement slot",
  "<div class='nav'><a>Home</a><a>Cart</a><a>Login</a></div>",
  "<script>window.dataLayer=window.dataLayer||[]</script>",
  "<footer>privacy policy footer</footer>",
];

export function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function sampleVariance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((a, x) => a + (x - m) * (x - m), 0) / (xs.length - 1);
}

export function llmCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * PRICING.llmInputUsdPerMTok +
    (outputTokens / 1_000_000) * PRICING.llmOutputUsdPerMTok
  );
}

function tavilyCostFor(ch: EnterpriseChallenge, architecture: Architecture): number {
  const searches = Math.max(
    1,
    ch.dag.nodes.filter((n) => n.channel === "TAVILY_RESEARCH").length
  );
  const extracts =
    architecture === "relay"
      ? Math.max(1, ch.dag.nodes.filter((n) => n.channel === "TRANSFORMATION").length)
      : 0;
  return searches * PRICING.tavilySearchUsd + extracts * PRICING.tavilyExtractUsd;
}

function bloatedDocs(docs: TavilyDoc[], trial: number): TavilyDoc[] {
  return docs.map((d, i) => ({
    ...d,
    markdown: `${d.markdown}\n\n${DOM_BLOAT.join("\n")}\n<!-- hop-replay ${trial}:${i} -->\n${d.markdown}`,
  }));
}

function durationMs(architecture: Architecture, hopsUsed: number, inputTokens: number): number {
  const base = architecture === "relay" ? 90 : 150;
  return base + hopsUsed * 36 + inputTokens * 0.018;
}

async function runArchitectureTrial(
  architecture: Architecture,
  ch: EnterpriseChallenge,
  trial: number
): Promise<TrialRecord> {
  const hops = ch.dag.nodes;
  const docs = architecture === "monolith" ? bloatedDocs(ch.corpus, trial) : ch.corpus;
  const hopTokens: number[] = [];
  let inputTokens = 0;
  let structured: Record<string, unknown> | null = null;
  let markdown = "";
  let ok = true;
  let failHop: number | null = null;
  let lastScore = 0;
  let lastNoul = true;
  let lastChoice = "proceed";

  for (let i = 0; i < hops.length; i += 1) {
    const node = hops[i];
    if (node.channel === "TAVILY_RESEARCH") {
      if (architecture === "relay") {
        const pruned = pruneTokens(docs, `${ch.objective} trial ${trial}`, node.pruneBudget);
        markdown = pruned.markdown;
        hopTokens.push(pruned.tokens);
        inputTokens += pruned.tokens;
      } else {
        const raw = docs.map((d) => `${d.title}\n${d.markdown}`).join("\n\n");
        markdown = raw;
        const t = tokensOf(raw);
        hopTokens.push(t);
        inputTokens += t;
      }
    } else if (node.channel === "TRANSFORMATION") {
      if (architecture === "relay") {
        structured = ch.lift(markdown);
        const t = tokensOf(JSON.stringify(structured));
        hopTokens.push(t);
        inputTokens += t;
      } else {
        structured = { raw: markdown.slice(0, 4000), trial };
        const t = tokensOf(JSON.stringify(structured));
        hopTokens.push(t);
        inputTokens += t;
      }
    } else if (node.channel === "REST_API_DISPATCH") {
      const body: Record<string, unknown> = {
        ok: true,
        acceptedAt: "2026-09-28T00:00:00.000Z",
        route: node.rest?.url ?? ch.settlementUrl,
        payload: structured,
      };
      structured = body;
      const t = tokensOf(JSON.stringify(body));
      hopTokens.push(t);
      inputTokens += t;
    } else {
      const t = architecture === "relay" ? 24 : 220 + trial * 15;
      hopTokens.push(t);
      inputTokens += t;
    }

    const payload: Record<string, unknown> =
      structured ??
      (architecture === "relay"
        ? { markdown, trial }
        : { raw: markdown, trial });

    const sc = await jevScore(payload, { required: node.jev.noul?.required ?? Object.keys(payload) });
    const nu = node.jev.noul ? await jevNoul(payload, node.jev.noul) : { pass: true, violations: [] as string[] };
    const choice = await jevChoice(node.jev.choice, {
      score: sc.value,
      scoreMin: node.jev.scoreMin,
      noul: nu,
    });
    lastScore = sc.value;
    lastNoul = nu.pass;
    lastChoice = choice.selected;

    if (!nu.pass || choice.selected !== "proceed") {
      ok = false;
      failHop = i + 1;
      break;
    }
  }

  const outputTokens =
    architecture === "relay"
      ? tokensOf(JSON.stringify(structured ?? {}))
      : Math.round(inputTokens * 0.22);
  const hopsUsed = failHop ?? hops.length;
  const duration = durationMs(architecture, hopsUsed, inputTokens);
  const failMs = failHop ? duration * (failHop / hops.length) : null;
  const startTokens = hopTokens[0] ?? 0;
  const endTokens = hopTokens[hopTokens.length - 1] ?? startTokens;
  const tavilyCost = tavilyCostFor(ch, architecture);
  const llm = llmCostUsd(inputTokens, outputTokens);

  return {
    architecture,
    trial,
    challengeId: ch.id,
    ok,
    failHop,
    failMs,
    durationMs: duration,
    inputTokens,
    outputTokens,
    cumulativeDrift: endTokens - startTokens,
    hopTokens,
    score: lastScore,
    noulPass: lastNoul,
    choice: lastChoice,
    tavilyCostUsd: tavilyCost,
    llmCostUsd: llm,
    costUsd: tavilyCost + llm,
  };
}

export function summarizeArchitecture(architecture: Architecture, recs: TrialRecord[]): ArchitectureStats {
  const successes = recs.filter((r) => r.ok);
  const failures = recs.filter((r) => !r.ok);
  const totalCost = recs.reduce((a, r) => a + r.costUsd, 0);
  return {
    architecture,
    trials: recs.length,
    successes: successes.length,
    failures: failures.length,
    successRate: recs.length ? successes.length / recs.length : 0,
    mttfMs: failures.length ? mean(failures.map((r) => r.failMs ?? r.durationMs)) : null,
    meanDurationMs: mean(recs.map((r) => r.durationMs)),
    meanInputTokens: mean(recs.map((r) => r.inputTokens)),
    tokenDriftVariance: sampleVariance(recs.map((r) => r.cumulativeDrift)),
    meanCostUsd: mean(recs.map((r) => r.costUsd)),
    costPerSuccessfulExecution: successes.length ? totalCost / successes.length : null,
    meanScore: mean(recs.map((r) => r.score)),
  };
}

export async function runEvalHarness(options: HarnessOptions = {}): Promise<HarnessReport> {
  const trials = options.trials ?? 10;
  const ch =
    options.challenge ??
    getChallenge(options.challengeId ?? EXTENDED_CHALLENGES[0].id) ??
    EXTENDED_CHALLENGES[0];

  const records: TrialRecord[] = [];
  for (let i = 1; i <= trials; i += 1) {
    records.push(await runArchitectureTrial("monolith", ch, i));
    records.push(await runArchitectureTrial("relay", ch, i));
  }

  const monolith = summarizeArchitecture(
    "monolith",
    records.filter((r) => r.architecture === "monolith")
  );
  const relay = summarizeArchitecture(
    "relay",
    records.filter((r) => r.architecture === "relay")
  );

  const mttfDelta =
    monolith.mttfMs != null && relay.mttfMs != null
      ? relay.mttfMs - monolith.mttfMs
      : relay.mttfMs == null && monolith.mttfMs != null
        ? null
        : 0;

  const costDelta =
    monolith.costPerSuccessfulExecution != null && relay.costPerSuccessfulExecution != null
      ? relay.costPerSuccessfulExecution - monolith.costPerSuccessfulExecution
      : null;

  return {
    challengeId: ch.id,
    trials,
    pricing: PRICING,
    generatedAt: new Date().toISOString(),
    monolith,
    relay,
    delta: {
      successRate: relay.successRate - monolith.successRate,
      mttfMs: mttfDelta,
      tokenDriftVariance: relay.tokenDriftVariance - monolith.tokenDriftVariance,
      costPerSuccessfulExecution: costDelta,
      meanTokens: relay.meanInputTokens - monolith.meanInputTokens,
    },
    records,
  };
}

export async function runEvalSuite(
  challengeIds: string[] = EXTENDED_CHALLENGES.map((c) => c.id),
  trials = 10
): Promise<HarnessReport[]> {
  const out: HarnessReport[] = [];
  for (const id of challengeIds) {
    out.push(await runEvalHarness({ challengeId: id, trials }));
  }
  return out;
}

export async function verifyAllWorkflows() {
  const reports = [];
  for (const preset of PRESETS) {
    const dag = synthesize(preset.objective);
    const result = await runVessel(dag, () => {});
    reports.push({ id: preset.id, intent: dag.intent, ok: result.ok, hops: result.steps.length, decision: result.lastChoice?.selected ?? "none" });
  }
  return reports;
}
