import type { MindPersona, Preset } from "../types";
export const PRESETS: Preset[] = [
  { id: "price", name: "Price maze", blurb: "Find the real offer", objective: "Compare Widget NX prices across storefront variants and explain the shipping difference" },
  { id: "news", name: "Headline hunt", blurb: "Separate signal from noise", objective: "Investigate the HelioParts supplier news trail and extract severity and sentiment" },
  { id: "compliance", name: "Rulebook puzzle", blurb: "Check the evidence", objective: "Compare DORA ICT-04 and SOC2 CC6.1 evidence against their control requirements" },
  { id: "lead", name: "Identity trail", blurb: "Enrich a profile", objective: "Find the Acme Robotics domain profile and identify a verified contact" },
  { id: "vat", name: "Tariff labyrinth", blurb: "Follow the numbers", objective: "Compare HS 8471 VAT tariff data for EU UK and US routes" },
  { id: "outage", name: "Status detective", blurb: "Trace an incident", objective: "Investigate multi-cloud status pages for incident INC-4419 and its affected region" },
  { id: "leak", name: "Signal sweep", blurb: "Redact and report", objective: "Review a simulated credential leak for acme-robotics.example and summarize redacted findings" },
  { id: "rfp", name: "Vendor showdown", blurb: "Pick a winner", objective: "Compare RFP vendors by line-item cost and explain the delta" }
];
export const MINDS: MindPersona[] = [
  { id: "scout", name: "Scout", role: "The pathfinder", color: "#F97316", channel: "TAVILY_RESEARCH", tag: "01 · discover", copy: "Finds the useful page element in a maze of noise and decoys." },
  { id: "extractor", name: "Extractor", role: "The pattern maker", color: "#8B5CF6", channel: "TRANSFORMATION", tag: "02 · shape", copy: "Turns a messy observation into clean, typed ingredients." },
  { id: "gatekeeper", name: "Gatekeeper", role: "The skeptic", color: "#10B981", channel: "HUMAN_GATE", tag: "03 · verify", copy: "Checks the evidence before the squad calls it a success." },
  { id: "settlement", name: "Settlement", role: "The finisher", color: "#F43F5E", channel: "REST_API_DISPATCH", tag: "04 · deliver", copy: "Packages the result for export. In this demo, nothing is sent outside." }
];
