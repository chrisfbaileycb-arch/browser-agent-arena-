import { describe, expect, it } from "vitest";
import { BROWSER_SCENE_IDS } from "../src/components/BrowserSimulationViewport";
import { runEvalHarness } from "../src/core/evalHarness";
import { EXTENDED_CHALLENGES } from "../src/data/extendedChallenges";
import { noulLocal } from "../src/core/jevEngine";

describe("recovered Venice simulations", () => {
  it("covers eight browser scenes and four enterprise challenges", () => {
    expect(BROWSER_SCENE_IDS).toHaveLength(8);
    expect(EXTENDED_CHALLENGES.map(challenge => challenge.id)).toEqual(["vat", "outage", "leak", "rfp"]);
    for (const challenge of EXTENDED_CHALLENGES) {
      const payload = challenge.lift(challenge.corpus.map(doc => doc.markdown).join("\n"));
      expect(noulLocal(payload, challenge.schema).pass).toBe(true);
    }
  });

  it("runs both scripted lanes for ten trials instead of reporting an empty benchmark", async () => {
    const report = await runEvalHarness({ challengeId: "vat", trials: 10 });
    expect(report.records).toHaveLength(20);
    expect(report.monolith.failures).toBe(10);
    expect(report.relay.successes).toBe(10);
    expect(report.monolith.mttfMs).toBeGreaterThan(0);
    expect(report.relay.costPerSuccessfulExecution).toBeGreaterThan(0);
  });
});
