import type { WorkflowDag } from "../types";
import { PROJECT_FILES } from "../generated/projectFiles";
export function exportBundle(dag: WorkflowDag): Record<string, string> {
  const source = ["src/types.ts", "src/core/jevEngine.ts", "src/core/tavilyAdapter.ts", "src/core/synthesizer.ts"];
  const files = Object.fromEntries(source.map(path => [path, PROJECT_FILES[path]]));
  return {
    ...files,
    "package.json": JSON.stringify({ name: "nexusrelay-fixture-runner", private: true, type: "module", scripts: { start: "tsx runner.ts" }, dependencies: { tsx: "^4.19.0" } }, null, 2),
    "README.md": "Fixture simulation only. npm install && npm start. No network research or REST dispatch occurs.\n",
    "runner.ts": `import { runVessel } from "./src/core/synthesizer";\nimport type { WorkflowDag } from "./src/types";\nconst dag: WorkflowDag = ${JSON.stringify(dag, null, 2)};\nconst result = await runVessel(dag, () => {});\nconsole.log(JSON.stringify(result, null, 2));\nif (!result.ok) process.exitCode = 1;\n`
  };
}
