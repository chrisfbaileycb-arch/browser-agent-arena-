import { describe, expect, it } from "vitest";
import { choiceLocal, noulLocal, scoreLocal } from "../src/core/jevEngine";
describe("noulLocal", () => { it("nested required", () => { const schema = { type: "object" as const, required: ["a"], properties: { a: { type: "object" as const, required: ["b"], properties: { b: { type: "number" as const, minimum: 0 } } } } }; expect(noulLocal({ a: { b: 1 } }, schema).pass).toBe(true); expect(noulLocal({ a: {} }, schema).pass).toBe(false); }); });
describe("scoreLocal", () => { it("complete required", () => { const r = scoreLocal({ sku: "NX", currency: "USD" }, { required: ["sku", "currency"] }); expect(r.dimensions.completeness).toBe(1); expect(r.value).toBeGreaterThan(0.6); }); });
describe("choiceLocal", () => { it("abort on noul fail", () => { expect(choiceLocal(["proceed", "abort"], { score: 0.99, noul: { pass: false, violations: ["x"] } }).selected).toBe("abort"); }); });
