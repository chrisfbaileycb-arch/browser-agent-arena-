import type { JevChoice, JevNoul, JevScore, JsonSchema } from "../types";
function clamp(n: number, a=0, b=1){ return Math.max(a, Math.min(b, n)); }
export function tokenize(s: string){ return String(s||"").toLowerCase().match(/[a-z0-9]+/g) ?? []; }
export function noulLocal(payload: unknown, schema: JsonSchema | null | undefined): JevNoul {
 const violations: string[] = [];
 const walk = (val: unknown, sch: JsonSchema | undefined, path: string): void => {
 if (!sch) return;
 if (sch.type === "object") {
 if (typeof val !== "object" || val === null || Array.isArray(val)) { violations.push(path + " expected object"); return; }
 const rec = val as Record<string, unknown>;
 for (const r of sch.required ?? []) if (rec[r] === undefined || rec[r] === null || rec[r] === "") violations.push(path + "." + r + " required");
 for (const [k, sub] of Object.entries(sch.properties ?? {})) if (rec[k] !== undefined) walk(rec[k], sub, path + "." + k);
 return;
 }
 if (sch.type === "number") {
 if (typeof val !== "number" || Number.isNaN(val)) { violations.push(path + " expected number"); return; }
 if (sch.minimum !== undefined && val < sch.minimum) violations.push(path + " below " + sch.minimum);
 if (sch.maximum !== undefined && val > sch.maximum) violations.push(path + " above " + sch.maximum);
 return;
 }
 if (sch.type === "string") {
 if (typeof val !== "string") { violations.push(path + " expected string"); return; }
 if (sch.minLength && val.length < sch.minLength) violations.push(path + " too short");
 return;
 }
 if (sch.type === "boolean") { if (typeof val !== "boolean") violations.push(path + " expected boolean"); return; }
 if (sch.type === "array") {
 if (!Array.isArray(val)) violations.push(path + " expected array");
 else if (sch.minItems && val.length < sch.minItems) violations.push(path + " minItems " + sch.minItems);
 }
 };
 walk(payload, schema ?? undefined, "$");
 return { pass: violations.length === 0, violations };
}
export function scoreLocal(payload: unknown, rubric?: { required?: string[] }): JevScore {
 const required = rubric?.required ?? [];
 const rec = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
 const filled = required.filter(k => rec && rec[k] !== undefined && rec[k] !== null && rec[k] !== "");
 const completeness = required.length ? filled.length / required.length : rec && Object.keys(rec).length ? 0.86 : 0.2;
 const toks = tokenize(JSON.stringify(payload ?? {}));
 const density = clamp(0.35 + (new Set(toks).size / Math.max(toks.length, 1)) * 0.7);
 let consistency = 0.9;
 if (rec) for (const v of Object.values(rec)) if (typeof v === "number" && !Number.isFinite(v)) consistency -= 0.4;
 const value = clamp(completeness * 0.42 + density * 0.28 + clamp(consistency) * 0.3);
 return { value, dimensions: { completeness, density, consistency: clamp(consistency) } };
}
export function choiceLocal(candidates: string[], context: { score?: number; scoreMin?: number; noul?: JevNoul }): JevChoice {
 const opts = candidates.length ? candidates : ["proceed", "human_review", "abort"];
 const noulPass = context.noul?.pass !== false;
 const sc = typeof context.score === "number" ? context.score : 0.7;
 const scoreMin = context.scoreMin ?? 0.62;
 if (!noulPass) return { selected: "abort", confidence: 0.97, rationale: "Noul assertion failed" };
 if (sc < scoreMin && opts.includes("human_review")) return { selected: "human_review", confidence: 0.8, rationale: "Score below readiness band" };
 if (sc >= scoreMin && opts.includes("proceed")) return { selected: "proceed", confidence: clamp(0.58 + sc * 0.38), rationale: "Score and schema cleared the gate" };
 return { selected: opts[0], confidence: clamp(0.55 + sc * 0.3), rationale: "Local fallback Choice" };
}
export async function jevChoice(c: string[], ctx: { score?: number; scoreMin?: number; noul?: JevNoul }) { return choiceLocal(c, ctx); }
export async function jevScore(p: unknown, r?: { required?: string[] }) { return scoreLocal(p, r); }
export async function jevNoul(p: unknown, s: JsonSchema | null | undefined) { return noulLocal(p, s); }
export const Jev = { Choice: jevChoice, Score: jevScore, Noul: jevNoul };
