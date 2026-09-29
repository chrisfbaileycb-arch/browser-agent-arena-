import { choiceLocal, noulLocal, scoreLocal } from "./jevEngine";
import type { ArenaChallenge, ArenaDomNode } from "../data/arenaChallenges";
export type LaneId = "A" | "B";
export type ArenaKind = "navigate" | "click" | "type" | "extract" | "gate" | "api" | "crash" | "loop";
export interface ArenaEvent { t: number; lane: LaneId; step: number; kind: ArenaKind; selector: string; coords: { x: number; y: number }; jevCertainty: number; driftIndex: number; latencyMs: number; memoryKb: number; tokens: number; message: string; badge: string; }
export interface LaneRuntime { lane: LaneId; url: string; tokens: number; drift: number; memoryKb: number; crashed: boolean; settled: boolean; loops: number; pointer: { x: number; y: number; selector: string; valid: boolean }; inspector: string; lastBadge: string; events: ArenaEvent[]; activeId: string; }
export interface DuelState { challengeId: string; step: number; playing: boolean; winner: LaneId | "draw" | null; laneA: LaneRuntime; laneB: LaneRuntime; }
export const TOKEN_BLOAT_PER_TURN = 12000;
function center(n: ArenaDomNode){ return { x: n.bounds.x + n.bounds.w / 2, y: n.bounds.y + n.bounds.h / 2 }; }
function find(ch: ArenaChallenge, id: string){ return ch.nodes.find(n => n.id === id) ?? ch.nodes[0]; }
function seedLane(lane: LaneId, ch: ArenaChallenge): LaneRuntime {
 const first = ch.nodes[0];
 return { lane, url: ch.url, tokens: lane === "A" ? 2400 : 420, drift: lane === "A" ? 0.18 : 0.08, memoryKb: lane === "A" ? 52 : 16, crashed: false, settled: false, loops: 0, pointer: { ...center(first), selector: first.selector, valid: !first.decoy }, inspector: lane === "A" ? ch.rawDom.slice(0, 900) : JSON.stringify(ch.cleanPayload, null, 2), lastBadge: "idle", events: [], activeId: first.id };
}
export function createDuel(ch: ArenaChallenge): DuelState { return { challengeId: ch.id, step: 0, playing: true, winner: null, laneA: seedLane("A", ch), laneB: seedLane("B", ch) }; }
function pushEvent(lane: LaneRuntime, step: number, kind: ArenaKind, jev: number): ArenaEvent {
 return { t: Date.now(), lane: lane.lane, step, kind, selector: lane.pointer.selector, coords: { x: lane.pointer.x, y: lane.pointer.y }, jevCertainty: jev, driftIndex: lane.drift, latencyMs: lane.lane === "A" ? 180 + step * 40 : 42 + step * 6, memoryKb: lane.memoryKb, tokens: lane.tokens, message: lane.lastBadge, badge: lane.lastBadge };
}
function apply(ch: ArenaChallenge, lane: LaneRuntime, step: number, seq: string[]): LaneRuntime {
 if (lane.crashed || lane.settled) return lane;
 const act = seq[Math.min(step, seq.length - 1)];
 const node = act === "crash" || act === "api" ? find(ch, lane.activeId) : find(ch, act);
 const next: LaneRuntime = { ...lane, events: lane.events.slice() };
 if (lane.lane === "A") {
 next.tokens += TOKEN_BLOAT_PER_TURN; next.drift = Math.min(1, next.drift + 0.14); next.memoryKb += 24;
 if (act === "crash" || (node.decoy && step >= 3)) { next.crashed = true; next.lastBadge = "crash"; next.activeId = node.id; next.pointer = { ...center(node), selector: node.selector, valid: false }; next.events.push(pushEvent(next, step, "crash", 0.2)); return next; }
 if (node.decoy) next.loops += 1;
 next.activeId = node.id; next.pointer = { ...center(node), selector: "html>body>div:nth-child(" + (step + 2) + ") " + node.tag, valid: false };
 next.lastBadge = node.decoy ? "invalid click" : "raw scrape"; next.inspector = ch.rawDom.slice(0, 400) + "\n<!-- +" + next.tokens + " tokens -->";
 next.events.push(pushEvent(next, step, node.decoy ? "loop" : "click", 0.28)); return next;
 }
 if (act === "api") {
 const sc = scoreLocal(ch.cleanPayload, { required: Object.keys(ch.cleanPayload) });
 const nu = noulLocal(ch.cleanPayload, ch.schema);
 const chs = choiceLocal(["proceed", "abort"], { score: sc.value, scoreMin: 0.7, noul: nu });
 next.settled = nu.pass && chs.selected === "proceed";
 next.lastBadge = nu.pass ? "Noul: Passed · Choice: Proceed (" + Math.round(chs.confidence * 100) + "%)" : "Noul failed";
 next.tokens += 180; next.drift = Math.max(0.03, next.drift - 0.02); next.inspector = JSON.stringify(ch.cleanPayload, null, 2);
 next.events.push(pushEvent(next, step, "api", sc.value)); return next;
 }
 const target = find(ch, act);
 const sc = scoreLocal({ id: target.id, text: target.text }, { required: ["id", "text"] });
 next.activeId = target.id; next.pointer = { ...center(target), selector: target.selector, valid: !target.decoy };
 next.tokens += 160; next.memoryKb += 2; next.drift = Math.max(0.03, next.drift - 0.03);
 next.lastBadge = "Choice: Proceed (" + Math.round((0.86 + step * 0.02) * 100) + "%)";
 next.inspector = JSON.stringify(ch.cleanPayload, null, 2);
 next.events.push(pushEvent(next, step, target.decoy ? "click" : "extract", sc.value)); return next;
}
export function tickDuel(state: DuelState, ch: ArenaChallenge): DuelState {
 const laneA = apply(ch, state.laneA, state.step, ch.scriptA);
 const laneB = apply(ch, state.laneB, state.step, ch.scriptB);
 let winner = state.winner; if (!winner && (laneB.settled || laneA.crashed)) winner = "B";
 return { ...state, step: state.step + 1, laneA, laneB, winner };
}
export function flattenNodes(nodes: ArenaDomNode[]){ return nodes.slice(); }
