import { describe, expect, it } from "vitest";
import { runVessel, synthesize, topo } from "../src/core/synthesizer";
import { PRESETS } from "../src/data/presets";
import { liftStructured } from "../src/core/tavilyAdapter";
import { noulLocal, choiceLocal } from "../src/core/jevEngine";
import { schemaFor } from "../src/core/synthesizer";
describe("topo", () => { it("orders chain", () => { const d = synthesize("Track Widget NX street price and POST to ERP"); expect(topo(d).map(n => n.id)).toEqual(["scout", "extract", "gate", "settle"]); }); });
describe("all presets execute", () => { it("every preset synthesizes matching intent and settles", async () => { for (const p of PRESETS) { const d = synthesize(p.objective); expect(d.intent).toBe(p.id); const r = await runVessel(d, () => {}); expect(r.ok).toBe(true); expect(r.steps).toHaveLength(4); } }, 20000); });
describe("fail closed", () => {
  it("rejects absent source values instead of inventing a valid price", () => {
    expect(noulLocal(liftStructured("no price data", "price"), schemaFor("price")).pass).toBe(false);
  });
  it("stops an unreviewed low score", () => {
    expect(choiceLocal(["proceed", "human_review", "abort"], { score: 0.2, scoreMin: 0.7 }).selected).toBe("human_review");
    expect(choiceLocal(["proceed", "abort"], { score: 0.2, scoreMin: 0.7 }).selected).toBe("abort");
  });
  it("rejects a cycle or missing dependency", () => {
    const d = synthesize(PRESETS[0].objective);
    d.nodes[0].dependsOn = ["settle"];
    expect(() => topo(d)).toThrow(/Cycle/);
    d.nodes[0].dependsOn = ["missing"];
    expect(() => topo(d)).toThrow(/Unknown DAG dependency/);
  });
});
