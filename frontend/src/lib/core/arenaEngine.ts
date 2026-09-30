import { choiceLocal, noulLocal, scoreLocal } from "./jevEngine";
import type { ArenaChallenge, ArenaDomNode } from "../data/arenaChallenges";
export type LaneId = "A" | "B";
export type ArenaKind = "navigate" | "click" | "type" | "extract" | "gate" | "api" | "crash" | "loop";
export interface ArenaEvent { t: number; lane: LaneId; step: number; kind: ArenaKind; selector: string; coords: { x: number; y: number }; jevCertainty: number; driftIndex: number; latencyMs: number; memoryKb: number; tokens: number; message: string; badge: string; }
export interface LaneRuntime { lane: LaneId; url: string; tokens: number; drift: number; memoryKb: number; crashed: boolean; settled: boolean; failed: boolean; loops: number; pointer: { x: number; y: number; selector: string; valid: boolean }; inspector: string; lastBadge: string; events: ArenaEvent[]; activeId: string; }
export interface DuelState { challengeId: string; step: number; playing: boolean; winner: LaneId | "draw" | null; laneA: LaneRuntime; laneB: LaneRuntime; }
export const TOKEN_BLOAT_PER_TURN = 12000;
function center(n: ArenaDomNode){ return { x: n.bounds.x + n.bounds.w / 2, y: n.bounds.y + n.bounds.h / 2 }; }
function find(ch: ArenaChallenge, id: string){ return ch.nodes.find(n => n.id === id); }
function seedLane(lane: LaneId, ch: ArenaChallenge): LaneRuntime {
  const first = ch.nodes[0];
  return { lane, url: ch.url, tokens: lane === "A" ? 2400 : 420, drift: lane === "A" ? 0.18 : 0.08, memoryKb: lane === "A" ? 52 : 16, crashed: false, settled: false, failed: false, loops: 0, pointer: { ...center(first), selector: first.selector, valid: !first.decoy }, inspector: lane === "A" ? ch.rawDom.slice(0, 900) : JSON.stringify(ch.cleanPayload, null, 2), lastBadge: "idle", events: [], activeId: first.id };
}
export function createDuel(ch: ArenaChallenge): DuelState { return { challengeId: ch.id, step: 0, playing: true, winner: null, laneA: seedLane("A", ch), laneB: seedLane("B", ch) }; }
function pushEvent(lane: LaneRuntime, step: number, kind: ArenaKind, jev: number): ArenaEvent {
  return { t: Date.now(), lane: lane.lane, step, kind, selector: lane.pointer.selector, coords: { x: lane.pointer.x, y: lane.pointer.y }, jevCertainty: jev, driftIndex: lane.drift, latencyMs: lane.lane === "A" ? 180 + step * 40 : 42 + step * 6, memoryKb: lane.memoryKb, tokens: lane.tokens, message: lane.lastBadge, badge: lane.lastBadge };
}
export function checkAssertions(ch: ArenaChallenge): string[] {
  return (ch.assertions ?? []).flatMap(assertion => {
    const value = ch.cleanPayload[assertion.field];
    const exists = Object.hasOwn(ch.cleanPayload, assertion.field) && value !== null && value !== undefined;
    const pass = assertion.operator === "exists" ? exists : exists && String(value) === assertion.value;
    return pass ? [] : [`${assertion.field}: ${assertion.operator === "exists" ? "missing" : `expected ${assertion.value}`}`];
  });
}
function apply(ch: ArenaChallenge, lane: LaneRuntime, step: number, seq: string[]): LaneRuntime {
  if (lane.crashed || lane.settled || lane.failed) return lane;
  const act = seq[step];
  const next: LaneRuntime = { ...lane, events: lane.events.slice() };
  if (!act) { next.failed = true; next.lastBadge = "route ended without settlement"; return next; }
  if (lane.lane === "A") {
    next.tokens += TOKEN_BLOAT_PER_TURN; next.drift = Math.min(1, next.drift + 0.14); next.memoryKb += 24;
  } else { next.tokens += 160; next.memoryKb += 2; next.drift = Math.max(0.03, next.drift - 0.03); }
  if (act === "api") {
    const sc = scoreLocal(ch.cleanPayload, { required: Object.keys(ch.cleanPayload) });
    const nu = noulLocal(ch.cleanPayload, ch.schema);
    const chs = choiceLocal(["proceed", "abort"], { score: sc.value, scoreMin: 0.7, noul: nu });
    const violations = checkAssertions(ch);
    next.settled = nu.pass && chs.selected === "proceed" && violations.length === 0 && next.loops === 0;
    next.failed = !next.settled;
    next.lastBadge = next.settled ? "assertions passed · settled" : `failed · ${violations[0] ?? (next.loops ? "decoy trap" : nu.violations[0] ?? "score gate")}`;
    next.inspector = JSON.stringify(ch.cleanPayload, null, 2);
    next.events.push(pushEvent(next, step, "api", sc.value)); return next;
  }
  const node = find(ch, act === "crash" ? lane.activeId : act);
  if (act === "crash" || !node || (lane.lane === "A" && node.decoy && step >= 3)) {
    next.crashed = true; next.lastBadge = !node ? `selector missing: ${act}` : "crash";
    if (node) { next.activeId = node.id; next.pointer = { ...center(node), selector: node.selector, valid: false }; }
    next.events.push(pushEvent(next, step, "crash", 0.2)); return next;
  }
  if (lane.lane === "A") {
    if (node.decoy) next.loops += 1;
    next.activeId = node.id; next.pointer = { ...center(node), selector: "html>body>div:nth-child(" + (step + 2) + ") " + node.tag, valid: false };
    next.lastBadge = node.decoy ? "invalid click" : "raw scrape"; next.inspector = ch.rawDom.slice(0, 400) + "\n<!-- +" + next.tokens + " tokens -->";
    next.events.push(pushEvent(next, step, node.decoy ? "loop" : "click", 0.28)); return next;
  }
  const sc = scoreLocal({ id: node.id, text: node.text }, { required: ["id", "text"] });
  next.activeId = node.id; next.pointer = { ...center(node), selector: node.selector, valid: !node.decoy };
  if (node.decoy) next.loops += 1;
  next.lastBadge = node.decoy ? "decoy trap" : "Choice: Proceed (" + Math.round((0.86 + step * 0.02) * 100) + "%)";
  next.inspector = JSON.stringify(ch.cleanPayload, null, 2);
  next.events.push(pushEvent(next, step, node.decoy ? "click" : "extract", sc.value)); return next;
}
export function tickDuel(state: DuelState, ch: ArenaChallenge): DuelState {
  if (state.winner || (state.laneA.failed || state.laneA.crashed || state.laneA.settled) && (state.laneB.failed || state.laneB.crashed || state.laneB.settled)) return state;
  const laneA = apply(ch, state.laneA, state.step, ch.scriptA);
  const laneB = apply(ch, state.laneB, state.step, ch.scriptB);
  let winner: DuelState["winner"] = state.winner;
  if (!winner && laneA.settled && laneB.settled) winner = laneA.tokens < laneB.tokens ? "A" : "B";
  else if (!winner && laneA.settled) winner = "A";
  else if (!winner && laneB.settled) winner = "B";
  else if (!winner && (laneA.crashed || laneA.failed) && (laneB.crashed || laneB.failed)) winner = "draw";
  return { ...state, step: state.step + 1, laneA, laneB, winner };
}
export function flattenNodes(nodes: ArenaDomNode[]){ return nodes.slice(); }
