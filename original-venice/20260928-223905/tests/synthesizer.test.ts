import { describe, expect, it } from "vitest";
import { runVessel, synthesize, topo } from "../src/core/synthesizer";
import { PRESETS } from "../src/data/presets";
describe("topo", () => { it("orders chain", () => { const d = synthesize("Track Widget NX street price and POST to ERP"); expect(topo(d).map(n => n.id)).toEqual(["scout", "extract", "gate", "settle"]); }); });
describe("all presets execute", () => { it("every preset synthesizes matching intent and settles", async () => { for (const p of PRESETS) { const d = synthesize(p.objective); expect(d.intent).toBe(p.id); const r = await runVessel(d, () => {}); expect(r.ok).toBe(true); expect(r.steps).toHaveLength(4); } }, 20000); });
