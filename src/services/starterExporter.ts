import type { WorkflowDag } from "../types";
import { ECOM_CHALLENGE, type ArenaChallenge } from "../data/arenaChallenges";

/** A self-contained starter with developer-owned adapter seams. */
export function exportBundle(dag: WorkflowDag, challenge: ArenaChallenge | null = null): Record<string, string> {
  const mission = challenge ?? ECOM_CHALLENGE;
  return {
    "package.json": JSON.stringify({ name: "nexusrelay-agent-starter", version: "0.1.0", private: true, type: "module", scripts: { start: "node --import tsx runner.ts", check: "tsc --noEmit" }, devDependencies: { "@types/node": "^22.0.0", tsx: "^4.19.0", typescript: "^5.6.3" } }, null, 2) + "\n",
    "tsconfig.json": JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, skipLibCheck: true, noEmit: true } }, null, 2) + "\n",
    ".env.example": "# Supply your own provider credentials when implementing live adapters.\n# MODEL_API_KEY=\n# BROWSER_API_KEY=\n# JEV_API_KEY=\n",
    "workflow.json": JSON.stringify(dag, null, 2) + "\n",
    "mission.json": JSON.stringify(mission, null, 2) + "\n",
    "src/types.ts": `export interface WorkflowNode {
  id: string; title: string; mind: string; channel: string; dependsOn: string[];
  prompt: string; pruneBudget: number; jev: { scoreMin: number; choice: string[]; noul: { required?: string[] } | null };
}
export interface WorkflowDag { id: string; objective: string; nodes: WorkflowNode[]; edges: [string, string][] }
export interface MissionNode { id: string; text: string; selector: string; decoy: boolean }
export interface Mission { name: string; url: string; nodes: MissionNode[]; scriptB: string[];
  cleanPayload: Record<string, unknown>; assertions?: Array<{ field: string; operator: "exists" | "equals"; value?: string }> }
export interface Observation { url: string; selectors: string[]; text: string }
export interface MindOutput { structured: Record<string, unknown>; notes: string }
`,
    "src/adapters.ts": `import type { MindOutput, Mission, Observation, WorkflowNode } from "./types.js";

// Implement these ports with your own browser, model, and optional Jev client.
export interface BrowserAdapter { inspect(mission: Mission): Promise<Observation> }
export interface MindAdapter { execute(node: WorkflowNode, observation: Observation, previous: MindOutput | null): Promise<MindOutput> }
export interface GateAdapter { evaluate(node: WorkflowNode, output: MindOutput): Promise<{ pass: boolean; reason: string }> }
export interface Adapters { browser: BrowserAdapter; mind: MindAdapter; gate: GateAdapter }
`,
    "src/pipeline.ts": `import type { Adapters } from "./adapters.js";
import type { Mission, MindOutput, WorkflowDag, WorkflowNode } from "./types.js";

function ordered(nodes: WorkflowNode[]): WorkflowNode[] {
  const pending = new Map(nodes.map(node => [node.id, node]));
  if (pending.size !== nodes.length) throw new Error("Duplicate squad stage ID");
  const result: WorkflowNode[] = [];
  while (pending.size) {
    const ready = [...pending.values()].find(node => node.dependsOn.every(id => result.some(done => done.id === id)));
    if (!ready) throw new Error("Missing dependency or cycle in squad workflow");
    result.push(ready); pending.delete(ready.id);
  }
  return result;
}
export function checkMission(mission: Mission, payload: Record<string, unknown>): string[] {
  return (mission.assertions ?? []).flatMap(rule => {
    const value = payload[rule.field];
    const exists = Object.prototype.hasOwnProperty.call(payload, rule.field) && value !== null && value !== undefined;
    return (rule.operator === "exists" ? exists : exists && String(value) === rule.value)
      ? [] : [rule.field + ": " + (rule.operator === "exists" ? "missing" : "expected " + rule.value)];
  });
}
export async function runPipeline(dag: WorkflowDag, mission: Mission, adapters: Adapters) {
  const observation = await adapters.browser.inspect(mission);
  const trace: Array<{ stage: string; mind: string; gate: string }> = [];
  let previous: MindOutput | null = null;
  for (const node of ordered(dag.nodes)) {
    const output = await adapters.mind.execute(node, observation, previous);
    const gate = await adapters.gate.evaluate(node, output);
    trace.push({ stage: node.title, mind: node.mind, gate: gate.reason });
    if (!gate.pass) return { ok: false, trace, violations: [gate.reason], payload: output.structured };
    previous = output;
  }
  const payload = previous?.structured ?? {};
  const violations = checkMission(mission, payload);
  return { ok: violations.length === 0, trace, violations, payload };
}
`,
    "src/demoAdapters.ts": `import type { Adapters } from "./adapters.js";
import type { Mission, Observation } from "./types.js";

// Deterministic fixture adapter. Replace with your own adapter implementation.
export function createDemoAdapters(mission: Mission): Adapters {
  return {
    browser: { async inspect(input: Mission): Promise<Observation> {
      const selected = input.scriptB.filter(id => id !== "api").map(id => {
        const node = input.nodes.find(item => item.id === id);
        if (!node) throw new Error("Unknown route element: " + id);
        if (node.decoy) throw new Error("Relay route entered decoy trap: " + id);
        return node;
      });
      return { url: input.url, selectors: selected.map(node => node.selector), text: selected.map(node => node.text).join(" | ") };
    } },
    mind: { async execute(node, observation, previous) {
      return { structured: { ...previous?.structured, ...mission.cleanPayload, ...(node.mind === "settlement" ? { ok: true } : {}) }, notes: node.mind + " saw " + observation.selectors.length + " selectors" };
    } },
    gate: { async evaluate(node, output) {
      const required = node.jev.noul?.required ?? [];
      const missing = required.filter(key => output.structured[key] === undefined || output.structured[key] === null);
      const completeness = required.length ? (required.length - missing.length) / required.length : 1;
      const pass = missing.length === 0 && completeness >= node.jev.scoreMin;
      return { pass, reason: pass ? "local demo gate passed" : "local demo gate failed: " + missing.join(", ") };
    } },
  };
}
`,
    "runner.ts": `import { readFile } from "node:fs/promises";
import { createDemoAdapters } from "./src/demoAdapters.js";
import { runPipeline } from "./src/pipeline.js";
import type { Mission, WorkflowDag } from "./src/types.js";

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(new URL(file, import.meta.url), "utf8")) as T;
}
const dag = await readJson<WorkflowDag>("./workflow.json");
const mission = await readJson<Mission>("./mission.json");
const result = await runPipeline(dag, mission, createDemoAdapters(mission));
console.log(JSON.stringify({ mode: "local fixture demo", mission: mission.name, ...result }, null, 2));
if (!result.ok) process.exitCode = 1;
`,
    "README.md": `# NexusRelay agent starter

This export contains your edited specialist squad and the ${mission.name} mission. It is a **developer starting template**, with a deterministic demo adapter. It makes no browser, model, Jev, research-provider, or webhook calls.

## Try the fixture

Run npm install, then npm start. Run npm run check to type check. Edit workflow.json for squad instructions and gates, and mission.json for selectors, route, payload, and assertions.

## Wire your services

Implement BrowserAdapter.inspect, MindAdapter.execute, and GateAdapter.evaluate from src/adapters.ts, then pass your implementations to runPipeline in runner.ts. The browser adapter should visit and inspect a permitted environment; the mind adapter should invoke your model; the gate adapter can call your Jev service or enforce your own validation. Handle timeouts, credentials, provenance, and any external writes in your deployment. Keep keys in server environment variables and out of the browser and repository.

The exported scriptB is the relay route used by the demo browser adapter; the solo duel is an in-studio simulation. The JSON payload is a fixture, not a captured website result. No external provider implementation is implied by this template.
`,
  };
}
