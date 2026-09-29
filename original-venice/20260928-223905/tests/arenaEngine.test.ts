import { describe, expect, it } from "vitest";
import { createDuel, tickDuel, TOKEN_BLOAT_PER_TURN } from "../src/core/arenaEngine";
import { ARENA_CHALLENGES, ECOM_CHALLENGE } from "../src/data/arenaChallenges";
describe("arenaEngine", () => { it("bloats lane A and settles lane B", () => { let d = createDuel(ECOM_CHALLENGE); const start = d.laneA.tokens; for (let i = 0; i < 6; i++) d = tickDuel(d, ECOM_CHALLENGE); expect(d.laneA.tokens).toBeGreaterThanOrEqual(start + TOKEN_BLOAT_PER_TURN); expect(d.laneB.settled || d.laneA.crashed).toBe(true); }); it("covers four battles", () => { expect(ARENA_CHALLENGES).toHaveLength(4); }); });
