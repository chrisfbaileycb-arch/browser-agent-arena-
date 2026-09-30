import { ECOM_CHALLENGE, type ArenaChallenge, type ArenaDomNode, type SuccessAssertion } from "../data/arenaChallenges";
import type { JsonSchema } from "../types";

export type MissionNode = Pick<ArenaDomNode, "id" | "role" | "text" | "selector" | "decoy">;
export interface MissionDraft {
  name: string;
  blurb: string;
  url: string;
  nodes: MissionNode[];
  soloRoute: string[];
  relayRoute: string[];
  payloadText: string;
  assertions: SuccessAssertion[];
}

export function defaultMission(): MissionDraft {
  return {
    name: "Build your own browser mission", blurb: "Edit the page, routes, and outcome rules below.",
    url: "demo.example/custom", nodes: ECOM_CHALLENGE.nodes.slice(0, 4).map(({ id, role, text, selector, decoy }) => ({ id, role, text, selector, decoy })),
    soloRoute: ["cookie", "news", "cookie", "news"], relayRoute: ["var", "ship"],
    payloadText: JSON.stringify(ECOM_CHALLENGE.cleanPayload, null, 2),
    assertions: [{ field: "price", operator: "equals", value: "428" }],
  };
}

const roles: ArenaDomNode["role"][] = ["button", "input", "table", "modal", "banner", "link", "text", "select", "row"];
function schemaFor(value: unknown): JsonSchema {
  if (Array.isArray(value)) return { type: "array" };
  if (value === null) return {};
  if (typeof value === "string") return { type: "string" };
  if (typeof value === "number") return { type: "number" };
  if (typeof value === "boolean") return { type: "boolean" };
  return { type: "object" };
}
export function compileMission(draft: MissionDraft): ArenaChallenge {
  if (!draft.name.trim() || !draft.url.trim()) throw new Error("Add a mission name and a display URL.");
  if (draft.nodes.length < 1 || draft.nodes.length > 12) throw new Error("A mission needs 1–12 page elements.");
  const ids = new Set<string>();
  for (const node of draft.nodes) {
    if (!node.id.trim() || !node.selector.trim() || !node.text.trim() || !roles.includes(node.role)) throw new Error("Every page element needs an ID, selector, label, and role.");
    if (node.id === "api" || node.id === "crash" || /\s/.test(node.id)) throw new Error("Element IDs cannot contain spaces or use the reserved route words api/crash.");
    if (ids.has(node.id)) throw new Error(`Duplicate element ID: ${node.id}`);
    ids.add(node.id);
  }
  if (!draft.soloRoute.length || !draft.relayRoute.length) throw new Error("Give each lane at least one route step.");
  for (const id of [...draft.soloRoute, ...draft.relayRoute]) if (!ids.has(id)) throw new Error(`Route references a missing element: ${id}`);
  let payload: unknown;
  try { payload = JSON.parse(draft.payloadText); } catch { throw new Error("The extraction payload must be valid JSON."); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("The extraction payload must be a JSON object.");
  if (draft.assertions.length < 1) throw new Error("Add at least one success assertion.");
  for (const assertion of draft.assertions) {
    if (!assertion.field.trim() || !["exists", "equals"].includes(assertion.operator)) throw new Error("Each assertion needs a field and comparison.");
    if (assertion.field.includes(".")) throw new Error("Assertions currently support top-level JSON fields only.");
    if (assertion.operator === "equals" && assertion.value === undefined) throw new Error("Equality assertions need an expected value.");
  }
  const cleanPayload = payload as Record<string, unknown>;
  const tags: Record<ArenaDomNode["role"], string> = { button: "button", input: "input", table: "table", modal: "dialog", banner: "div", link: "a", text: "p", select: "select", row: "tr" };
  const nodes: ArenaDomNode[] = draft.nodes.map((node, index) => ({ ...node, tag: tags[node.role], visible: true, bounds: { x: 16, y: 12 + index * 40, w: 280, h: 32 } }));
  return {
    id: "custom", name: draft.name.trim(), blurb: draft.blurb.trim(), url: draft.url.trim(), title: draft.name.trim(), nodes,
    scriptA: [...draft.soloRoute, "api"], scriptB: [...draft.relayRoute, "api"],
    rawDom: nodes.map(node => `<${node.tag} data-selector=${JSON.stringify(node.selector)}>${node.text.replaceAll("<", "&lt;")}</${node.tag}>`).join("\n"),
    cleanPayload, schema: { type: "object", required: Object.keys(cleanPayload), properties: Object.fromEntries(Object.entries(cleanPayload).map(([key, value]) => [key, schemaFor(value)])) },
    assertions: draft.assertions.map(assertion => ({ ...assertion, field: assertion.field.trim() })),
  };
}

export function loadMission(raw: string | null): MissionDraft {
  if (!raw) return defaultMission();
  try {
    const parsed = JSON.parse(raw) as MissionDraft;
    return typeof parsed.name === "string" && typeof parsed.payloadText === "string" && Array.isArray(parsed.nodes) && Array.isArray(parsed.soloRoute) && Array.isArray(parsed.relayRoute) && Array.isArray(parsed.assertions) ? parsed : defaultMission();
  } catch { return defaultMission(); }
}
