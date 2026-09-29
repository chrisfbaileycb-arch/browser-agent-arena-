import type { WorkflowDag } from "../types";
export function exportBundle(dag: WorkflowDag): Record<string, string> {
 const slim = { objective: dag.objective, intent: dag.intent, nodes: dag.nodes.map(n => ({ id: n.id, channel: n.channel, dependsOn: n.dependsOn, jev: n.jev, rest: n.rest ?? null })) };
 return {
 "package.json": JSON.stringify({ name: "nexusrelay-vessel", private: true, type: "module", scripts: { start: "tsx runner.ts" }, dependencies: { tsx: "^4.19.0" } }, null, 2),
 ".env.example": "TAVILY_API_KEY=\nJEV_GATEWAY_URL=\nDRY_RUN=true\n",
 "runner.ts": "export const DAG = " + JSON.stringify(slim, null, 2) + ";\nexport async function run(){ return DAG; }\n"
 };
}
