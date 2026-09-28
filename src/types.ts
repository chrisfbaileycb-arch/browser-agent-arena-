export type Channel = "TAVILY_RESEARCH" | "REST_API_DISPATCH" | "TRANSFORMATION" | "HUMAN_GATE";
export type MindId = "scout" | "extractor" | "gatekeeper" | "settlement";
export type Intent = "price" | "news" | "compliance" | "lead" | "vat" | "outage" | "leak" | "rfp";
export interface JsonSchema { type?: "object"|"string"|"number"|"boolean"|"array"; required?: string[]; properties?: Record<string, JsonSchema>; minLength?: number; minimum?: number; maximum?: number; minItems?: number; }
export interface JevGate { scoreMin: number; choice: string[]; noul: JsonSchema | null; }
export interface RestSpec { method: "GET"|"POST"|"PUT"|"PATCH"; url: string; headers: Record<string,string>; }
export interface WorkflowNode { id: string; title: string; channel: Channel; mind: MindId; dependsOn: string[]; pruneBudget: number; prompt: string; jev: JevGate; rest?: RestSpec; }
export interface WorkflowDag { id: string; objective: string; intent: Intent; nodes: WorkflowNode[]; edges: Array<[string, string]>; }
export interface JevChoice { selected: string; confidence: number; rationale: string; }
export interface JevScore { value: number; dimensions: { completeness: number; density: number; consistency: number }; }
export interface JevNoul { pass: boolean; violations: string[]; }
export interface NodeOutput { ok: boolean; rawTokens: number; tokens: number; dropped: number; markdown: string; structured: Record<string, unknown> | null; sources?: string[]; restStatus?: number; rest?: RestSpec; }
export interface ExecutionStep { node: WorkflowNode; out: NodeOutput; score: JevScore; noul: JevNoul; choice: JevChoice; at: number; }
export interface VesselResult { ok: boolean; steps: ExecutionStep[]; totalIn: number; totalOut: number; lastScore: number; lastChoice: JevChoice | null; lastNoul: JevNoul | null; structured?: Record<string, unknown> | null; }
export interface MonolithTelemetry { tokens: number; drift: number; failAt: number | null; hallucination: boolean; note: string; }
export interface Preset { id: Intent; name: string; blurb: string; objective: string; }
export interface MindPersona { id: MindId; name: string; role: string; color: string; channel: Channel; tag: string; copy: string; }
