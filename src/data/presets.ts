import type { MindPersona, Preset } from "../types";
export const PRESETS: Preset[] = [
  { id: "price", name: "Competitive intelligence", blurb: "Tavily to Jev to ERP", objective: "Track Widget NX street price versus Vendor A/B list and POST to ERP" },
  { id: "news", name: "Supplier risk audit", blurb: "News to Slack", objective: "Audit HelioParts supplier risk from recent wires and dispatch Slack" },
  { id: "compliance", name: "Regulatory monitor", blurb: "DORA to audit log", objective: "Monitor DORA ICT-04 and SOC2 CC6.1 with Noul audit event" },
  { id: "lead", name: "Lead enrichment", blurb: "Domain to CRM", objective: "Enrich Acme Robotics domain profile and upsert the CRM lead" },
  { id: "vat", name: "VAT and tariff audit", blurb: "HS 8471 to SAP", objective: "HS 8471 VAT tariff scrape EU UK US to SAP landed-cost webhook" },
  { id: "outage", name: "Multi-cloud outage triage", blurb: "Status to PagerDuty", objective: "Multi-cloud status page poll INC-4419 to PagerDuty" },
  { id: "leak", name: "Credential leak scan", blurb: "Intel to SecOps", objective: "Credential leak crawl acme-robotics.example redacted to SecOps ticket" },
  { id: "rfp", name: "RFP vendor matrix", blurb: "Extract to exec summary", objective: "RFP vendor matrix line-item delta math to executive summary" }
];
export const MINDS: MindPersona[] = [
  { id: "scout", name: "Scout mind", role: "Web extraction and search", color: "#D97706", channel: "TAVILY_RESEARCH", tag: "research", copy: "Reads the live page, ignores chrome, returns high-signal markdown." },
  { id: "extractor", name: "Extractor mind", role: "Token prune and schema lift", color: "#7C3AED", channel: "TRANSFORMATION", tag: "transform", copy: "Prunes tokens and lifts a typed payload the rest of the squad can trust." },
  { id: "gatekeeper", name: "Gatekeeper mind", role: "Jev Choice / Score / Noul", color: "#059669", channel: "HUMAN_GATE", tag: "gates", copy: "Deterministic gates. If the schema lies, the hop never fires." },
  { id: "settlement", name: "Settlement mind", role: "Authenticated REST vessel", color: "#E11D48", channel: "REST_API_DISPATCH", tag: "dispatch", copy: "Authenticated write to ERP, PagerDuty, SecOps, or SAP." }
];
