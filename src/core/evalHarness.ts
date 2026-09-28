import { runVessel, synthesize } from "./synthesizer";
import { PRESETS } from "../data/presets";
import { createDuel, tickDuel } from "./arenaEngine";
import { ARENA_CHALLENGES } from "../data/arenaChallenges";
export const PRICING = { tavilySearchUsd: 0.008, tavilyExtractUsd: 0.015, llmInputUsdPerMTok: 2.5, llmOutputUsdPerMTok: 10 };
export function mean(xs: number[]){ return xs.length ? xs.reduce((a,b) => a+b, 0) / xs.length : 0; }
export function sampleVariance(xs: number[]){ if (xs.length < 2) return 0; const m = mean(xs); return xs.reduce((a,x) => a + (x-m)*(x-m), 0) / (xs.length - 1); }
export async function runEvalHarness(opts: { challengeId?: string; trials?: number } = {}) {
  const trials = opts.trials ?? 10;
  const preset = PRESETS.find(p => p.id === opts.challengeId) ?? PRESETS[0];
  const recs = [];
  for (let i = 1; i <= trials; i++) {
    const dag = synthesize(preset.objective);
    const vessel = await runVessel(dag, () => {});
    recs.push({ trial: i, ok: vessel.ok, tokens: vessel.totalOut, score: vessel.lastScore, cost: PRICING.tavilySearchUsd + PRICING.tavilyExtractUsd + (vessel.totalIn / 1e6) * PRICING.llmInputUsdPerMTok });
  }
  const ok = recs.filter(r => r.ok);
  return { challengeId: preset.id, trials, successRate: ok.length / trials, meanTokens: mean(recs.map(r => r.tokens)), meanCost: mean(recs.map(r => r.cost)), tokenDriftVariance: sampleVariance(recs.map(r => r.tokens)), mttfMs: null, records: recs };
}
export function duelSmoke(id?: string) {
  const ch = ARENA_CHALLENGES.find(c => c.id === id) ?? ARENA_CHALLENGES[0];
  let d = createDuel(ch);
  for (let i = 0; i < 6; i++) d = tickDuel(d, ch);
  return { id: ch.id, aTokens: d.laneA.tokens, bSettled: d.laneB.settled, aCrashed: d.laneA.crashed, winner: d.winner };
}
export async function verifyAllWorkflows() {
  const out = [];
  for (const p of PRESETS) {
    const dag = synthesize(p.objective);
    const vessel = await runVessel(dag, () => {});
    out.push({ id: p.id, intent: dag.intent, ok: vessel.ok, hops: vessel.steps.length, last: vessel.lastChoice?.selected ?? "none" });
  }
  return out;
}
