import { describe, expect, it } from "vitest";
import { compileMission, defaultMission } from "../src/core/challengeStudio";
import { createDuel, tickDuel } from "../src/core/arenaEngine";
import { synthesize } from "../src/core/synthesizer";
import { exportBundle } from "../src/services/vesselExporter";

function finish(challenge: ReturnType<typeof compileMission>) {
  let duel = createDuel(challenge);
  for (let i = 0; i < 16 && !duel.winner; i++) duel = tickDuel(duel, challenge);
  return duel;
}

describe("custom challenge studio", () => {
  it("lets a clean solo route win when it finishes first", () => {
    const draft = defaultMission();
    draft.soloRoute = ["var"];
    draft.relayRoute = ["var", "ship"];
    const duel = finish(compileMission(draft));
    expect(duel.winner).toBe("A");
    expect(duel.laneA.settled).toBe(true);
  });
  it("catches relay decoys and failed assertions", () => {
    const draft = defaultMission();
    draft.soloRoute = ["var"];
    draft.relayRoute = ["cookie"];
    let duel = finish(compileMission(draft));
    expect(duel.winner).toBe("A");
    expect(duel.laneB.failed).toBe(true);
    draft.relayRoute = ["var"];
    draft.assertions = [{ field: "price", operator: "equals", value: "999" }];
    duel = finish(compileMission(draft));
    expect(duel.winner).toBe("draw");
    expect(duel.laneA.lastBadge).toContain("expected 999");
  });
  it("rejects broken routes and preserves custom mission in the modular export", () => {
    const draft = defaultMission();
    draft.relayRoute = ["missing"];
    expect(() => compileMission(draft)).toThrow("missing element");
    draft.relayRoute = ["var"];
    const challenge = compileMission(draft);
    const dag = synthesize("check price");
    dag.nodes[0].prompt = "Inspect the offer carefully";
    const bundle = exportBundle(dag, challenge);
    expect(JSON.parse(bundle["mission.json"]).assertions).toEqual(challenge.assertions);
    expect(JSON.parse(bundle["workflow.json"]).nodes[0].prompt).toBe("Inspect the offer carefully");
    expect(bundle["src/adapters.ts"]).toContain("interface BrowserAdapter");
    expect(bundle["src/pipeline.ts"]).toContain("checkMission");
  });
});
