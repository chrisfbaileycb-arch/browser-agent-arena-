import type { WorkflowDag } from "../types";
import type { ArenaChallenge } from "../data/arenaChallenges";
import { exportBundle as exportVeniceBundle } from "./veniceExporter";
import { exportBundle as exportChallengeFiles } from "./starterExporter";
import { EXPORT_SOURCES } from "../generated/exportSources";

/** Add a complete live runner while retaining the original Venice source and mission files. */
export function exportBundle(dag: WorkflowDag, challenge: ArenaChallenge | null = null): Record<string, string> {
  const challengeFiles = exportChallengeFiles(dag, challenge);
  const original = exportVeniceBundle(dag);
  return {
    "mission.json": challengeFiles["mission.json"],
    "workflow.json": challengeFiles["workflow.json"],
    "src/missionTypes.ts": challengeFiles["src/types.ts"],
    "src/adapters.ts": challengeFiles["src/adapters.ts"].replace('"./types.js"', '"./missionTypes.js"'),
    "src/pipeline.ts": challengeFiles["src/pipeline.ts"].replace('"./types.js"', '"./missionTypes.js"'),
    ...original,
    "package.json": JSON.stringify({ name: "nexusrelay-squad-runner", version: "1.1.0", private: true, type: "module", scripts: { start: "tsx runner.ts", browser: "tsx browser-runner.ts", "browser:install": "playwright install chromium --only-shell", check: "tsc --noEmit" }, dependencies: { tsx: "^4.19.0", typescript: "^5.6.3", "@types/node": "^22.0.0", playwright: "^1.62.1" } }, null, 2) + "\n",
    "tsconfig.json": JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, skipLibCheck: true, noEmit: true }, exclude: ["venice-runner.ts"] }, null, 2) + "\n",
    ".env.example": EXPORT_SOURCES[".env.example"],
    "server/liveWorkflow.ts": EXPORT_SOURCES["server/liveWorkflow.ts"],
    "server/browserDuel.ts": EXPORT_SOURCES["server/browserDuel.ts"],
    "src/types.ts": EXPORT_SOURCES["src/types.ts"],
    "src/data/arenaChallenges.ts": EXPORT_SOURCES["src/data/arenaChallenges.ts"],
    "src/core/jevEngine.ts": EXPORT_SOURCES["src/core/jevEngine.ts"],
    "src/core/synthesizer.ts": EXPORT_SOURCES["src/core/synthesizer.ts"],
    "src/core/tavilyAdapter.ts": EXPORT_SOURCES["src/core/tavilyAdapter.ts"],
    "venice-runner.ts": original["runner.ts"],
    "runner.ts": `import { readFile } from "node:fs/promises";
import { configFromEnv, runLiveWorkflow } from "./server/liveWorkflow";
import type { WorkflowDag } from "./src/types";

const dag = JSON.parse(await readFile(new URL("./workflow.json", import.meta.url), "utf8")) as WorkflowDag;
try {
  const result = await runLiveWorkflow(dag, configFromEnv(dag.intent), process.argv.includes("--dispatch"));
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
`,
    "browser-runner.ts": `import { readFile, mkdir, writeFile } from "node:fs/promises";
import { runBrowserDuel } from "./server/browserDuel";
import type { ArenaChallenge } from "./src/data/arenaChallenges";

const challenge = JSON.parse(await readFile(new URL("./mission.json", import.meta.url), "utf8")) as ArenaChallenge;
try {
  const result = await runBrowserDuel(challenge, {
    geminiKey: process.env.GEMINI_API_KEY || "",
    openaiKey: process.env.OPENAI_API_KEY || "",
    jevKey: process.env.TYPESAFE_API_KEY,
    geminiModel: process.env.GEMINI_MODEL,
    openaiModel: process.env.OPENAI_MODEL,
  });
  await mkdir("captures", { recursive: true });
  for (const lane of result.lanes) if (lane.screenshot) await writeFile("captures/lane-" + lane.lane + ".jpg", Buffer.from(lane.screenshot, "base64"));
  console.log(JSON.stringify({ ...result, lanes: result.lanes.map(({ screenshot, ...lane }) => lane) }, null, 2));
  if (!result.lanes.some(lane => lane.success)) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
`,
    "README.md": `# NexusRelay squad runner

This package contains the edited four stage DAG, live workflow and browser runners, the custom challenge definition, and the original Venice runner as venice-runner.ts.

Run npm install and npm run check. Set GEMINI_API_KEY (and optionally OPENAI_API_KEY for the Arena competition duel) in the process environment. Run npm start to run Gemini and print the gated result. Set WORKFLOW_WEBHOOK_URL_${dag.intent.toUpperCase()} to your real destination and run npm start -- --dispatch to send only after the gate passes. The destination returns its actual HTTP status. The .env file is not loaded automatically by Node; export variables in your shell or use Node's --env-file support.

Edit workflow.json to change the objective, prompts, pruning budget, and score floor. Live execution uses those edits. The source for every stage is server/liveWorkflow.ts. No fixture fallback runs on the live path. The challenge in mission.json and the original Venice runner are preserved separately. Browser arena duels in the web app still use their original simulation engine.

For a live browser duel, set mission.json url to a real HTTP(S) page and configure its selectors and success assertions. Run npm run browser:install once, then npm run browser. This opens two isolated Chromium contexts, invokes OpenAI / Gemini for each lane, and writes captures/lane-A.jpg and captures/lane-B.jpg. The built-in .example mission URL must be replaced. The visual play-set in the web app remains available separately.
`,
  };
}
