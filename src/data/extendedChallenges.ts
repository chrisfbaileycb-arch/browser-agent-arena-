import type { JsonSchema, RestSpec, WorkflowNode } from "../types";
import type { TavilyDoc } from "../core/tavilyAdapter";

export type BrowserSceneId =
  | "catalog"
  | "news"
  | "docs"
  | "profile"
  | "tax"
  | "status"
  | "leak"
  | "rfp";

export interface ChallengeDag {
  id: string;
  objective: string;
  intent: string;
  nodes: WorkflowNode[];
  edges: Array<[string, string]>;
}

export interface EnterpriseChallenge {
  id: string;
  name: string;
  blurb: string;
  objective: string;
  scene: BrowserSceneId;
  url: string;
  settlementUrl: string;
  scoreMin: number;
  choiceCandidates: string[];
  schema: JsonSchema;
  corpus: TavilyDoc[];
  samplePayload: Record<string, unknown>;
  lift: (markdown: string) => Record<string, unknown>;
  dag: ChallengeDag;
}

function node(
  partial: Omit<WorkflowNode, "jev"> & { jev: WorkflowNode["jev"]; rest?: RestSpec }
): WorkflowNode {
  return partial;
}

function num(text: string, re: RegExp, fallback: number): number {
  const m = text.match(re);
  return m ? parseFloat(m[1]) : fallback;
}

const vatSchema: JsonSchema = {
  type: "object",
  required: ["hs", "euVat", "ukVat", "usHts", "landedUsd", "compliant"],
  properties: {
    hs: { type: "string", minLength: 4 },
    euVat: { type: "number", minimum: 0 },
    ukVat: { type: "number", minimum: 0 },
    usHts: { type: "string", minLength: 4 },
    landedUsd: { type: "number", minimum: 0 },
    compliant: { type: "boolean" },
  },
};

const outageSchema: JsonSchema = {
  type: "object",
  required: ["sev", "provider", "region", "incidentId", "pageDegraded"],
  properties: {
    sev: { type: "string", minLength: 3 },
    provider: { type: "string", minLength: 3 },
    region: { type: "string", minLength: 3 },
    incidentId: { type: "string", minLength: 3 },
    latencyDeltaPct: { type: "number" },
    pageDegraded: { type: "boolean" },
  },
};

const leakSchema: JsonSchema = {
  type: "object",
  required: ["domain", "findings", "redacted", "ticket"],
  properties: {
    domain: { type: "string", minLength: 3 },
    findings: { type: "number", minimum: 0 },
    redacted: { type: "boolean" },
    ticket: { type: "string", minLength: 3 },
    secretPresent: { type: "boolean" },
  },
};

const rfpSchema: JsonSchema = {
  type: "object",
  required: ["winner", "vendors", "deltaUsd", "complete"],
  properties: {
    winner: { type: "string", minLength: 2 },
    vendors: { type: "number", minimum: 2 },
    deltaUsd: { type: "number" },
    storageDeltaPct: { type: "number" },
    complete: { type: "boolean" },
  },
};

export const VAT_CHALLENGE: EnterpriseChallenge = {
  id: "vat",
  name: "Cross-border VAT & tariff audit",
  blurb: "Multi-jurisdiction tax scrape → Jev compliance score → SAP webhook",
  objective:
    "Scrape EU, UK, and US tariff/VAT rules for HS 8471 notebook computers, score landed-cost compliance, and POST a schema-valid payload to the SAP tax webhook.",
  scene: "tax",
  url: "tariff.example/hs-8471",
  settlementUrl: "https://sap.internal/api/tax/landed-cost",
  scoreMin: 0.8,
  choiceCandidates: ["proceed", "human_review", "abort"],
  schema: vatSchema,
  samplePayload: { hs: "8471", euVat: 0, ukVat: 0.02, usHts: "8471.30", landedUsd: 441.2, compliant: true },
  corpus: [
    {
      url: "https://ec.example/vat/hs-8471",
      title: "EU VAT — HS 8471 data-processing machines",
      markdown:
        "# EU\nHS **8471** portable ADP machines. Intra-community VAT **0%** on B2B reverse charge. List price basis USD 428. Cookie consent. Subscribe to newsletter.",
    },
    {
      url: "https://govuk.example/trade/8471",
      title: "UK Global Tariff 8471",
      markdown:
        "# UK\nUKGT **8471**. Third-country duty **2%**. VAT on import 20% recoverable. Landed indication USD 441.20 including duty on 428.",
    },
    {
      url: "https://usitc.example/hts/8471.30",
      title: "US HTS 8471.30",
      markdown:
        "# US\nHTS **8471.30** portable digital ADP. General duty free. Related products you may like. Advertisement slot.",
    },
  ],
  lift: (markdown) => {
    const text = markdown.replace(/\n/g, " ");
    const euVat = /0%/.test(text) ? 0 : 0.2;
    const ukVat = num(text, /duty \*\*?([0-9]+(?:\.[0-9]+)?)%/, 2) / 100;
    const list = num(text, /USD ([0-9]+(?:\.[0-9]+)?)/, 428);
    const landedUsd = num(text, /USD (441(?:\.[0-9]+)?)/, Number((list * (1 + ukVat)).toFixed(2)));
    return {
      hs: "8471",
      euVat,
      ukVat,
      usHts: "8471.30",
      landedUsd,
      compliant: euVat === 0 && ukVat <= 0.03 && landedUsd > 0,
    };
  },
  dag: {
    id: "dag_vat",
    objective:
      "Scrape EU, UK, and US tariff/VAT rules for HS 8471 notebook computers, score landed-cost compliance, and POST a schema-valid payload to the SAP tax webhook.",
    intent: "vat",
    nodes: [
      node({
        id: "scout",
        title: "Scrape EU / UK / US tariff desks",
        channel: "TAVILY_RESEARCH",
        mind: "scout",
        dependsOn: [],
        pruneBudget: 780,
        prompt: "HS 8471 VAT duty EU UK USITC",
        jev: { scoreMin: 0.7, choice: ["proceed", "retry_extract", "abort"], noul: null },
      }),
      node({
        id: "extract",
        title: "Lift jurisdiction duty matrix",
        channel: "TRANSFORMATION",
        mind: "extractor",
        dependsOn: ["scout"],
        pruneBudget: 420,
        prompt: "euVat ukVat usHts landedUsd",
        jev: { scoreMin: 0.78, choice: ["proceed", "human_review", "abort"], noul: vatSchema },
      }),
      node({
        id: "gate",
        title: "Jev compliance score",
        channel: "HUMAN_GATE",
        mind: "gatekeeper",
        dependsOn: ["extract"],
        pruneBudget: 200,
        prompt: "Score ≥ 0.80 and Noul HS/landed schema",
        jev: { scoreMin: 0.8, choice: ["proceed", "human_review", "abort"], noul: vatSchema },
      }),
      node({
        id: "settle",
        title: "SAP landed-cost webhook",
        channel: "REST_API_DISPATCH",
        mind: "settlement",
        dependsOn: ["gate"],
        pruneBudget: 160,
        prompt: "POST SAP tax API",
        rest: {
          method: "POST",
          url: "https://sap.internal/api/tax/landed-cost",
          headers: { "X-SAP-Object": "LandedCost", "Idempotency-Key": "nr-vat-8471" },
        },
        jev: {
          scoreMin: 0.7,
          choice: ["proceed", "abort"],
          noul: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } } },
        },
      }),
    ],
    edges: [
      ["scout", "extract"],
      ["extract", "gate"],
      ["gate", "settle"],
    ],
  },
};

export const OUTAGE_CHALLENGE: EnterpriseChallenge = {
  id: "outage",
  name: "Multi-cloud outage triage",
  blurb: "Status page polling → incident severity Choice → PagerDuty REST",
  objective:
    "Poll AWS, GCP, and Azure status surfaces, classify INC-4419 severity with Jev Choice, and dispatch PagerDuty if SEV2 or worse.",
  scene: "status",
  url: "status.cloud.example",
  settlementUrl: "https://api.pagerduty.internal/incidents",
  scoreMin: 0.76,
  choiceCandidates: ["page_sev1", "page_sev2", "watch", "abort"],
  schema: outageSchema,
  samplePayload: {
    sev: "SEV2",
    provider: "aws",
    region: "us-east-1",
    incidentId: "INC-4419",
    latencyDeltaPct: 18,
    pageDegraded: true,
  },
  corpus: [
    {
      url: "https://status.aws.example",
      title: "AWS service health us-east-1",
      markdown:
        "# AWS\n**us-east-1** API latency elevated **18%**. Incident **INC-4419**. Status: degraded. Share on social. Advertisement slot.",
    },
    {
      url: "https://status.gcp.example",
      title: "Google Cloud status",
      markdown: "# GCP\nAll regions **ok**. No open incidents. Cookie consent.",
    },
    {
      url: "https://status.azure.example",
      title: "Azure status",
      markdown: "# Azure\nEast US **ok**. Advisory only. Related products you may like.",
    },
  ],
  lift: (markdown) => {
    const text = markdown.replace(/\n/g, " ");
    const latencyDeltaPct = num(text, /([0-9]+)%/, 18);
    const degraded = /degraded|elevated/i.test(text);
    const sev = latencyDeltaPct >= 30 ? "SEV1" : degraded ? "SEV2" : "SEV4";
    return {
      sev,
      provider: "aws",
      region: "us-east-1",
      incidentId: "INC-4419",
      latencyDeltaPct,
      pageDegraded: degraded,
    };
  },
  dag: {
    id: "dag_outage",
    objective:
      "Poll AWS, GCP, and Azure status surfaces, classify INC-4419 severity with Jev Choice, and dispatch PagerDuty if SEV2 or worse.",
    intent: "outage",
    nodes: [
      node({
        id: "scout",
        title: "Poll multi-cloud status pages",
        channel: "TAVILY_RESEARCH",
        mind: "scout",
        dependsOn: [],
        pruneBudget: 700,
        prompt: "AWS GCP Azure status INC-4419 us-east-1",
        jev: { scoreMin: 0.68, choice: ["proceed", "retry_extract", "abort"], noul: null },
      }),
      node({
        id: "extract",
        title: "Normalize incident timeline",
        channel: "TRANSFORMATION",
        mind: "extractor",
        dependsOn: ["scout"],
        pruneBudget: 360,
        prompt: "provider region latency incidentId",
        jev: { scoreMin: 0.74, choice: ["proceed", "human_review", "abort"], noul: outageSchema },
      }),
      node({
        id: "gate",
        title: "Severity Choice gate",
        channel: "HUMAN_GATE",
        mind: "gatekeeper",
        dependsOn: ["extract"],
        pruneBudget: 180,
        prompt: "Choice page_sev1 | page_sev2 | watch | abort",
        jev: { scoreMin: 0.76, choice: ["proceed", "human_review", "abort"], noul: outageSchema },
      }),
      node({
        id: "settle",
        title: "PagerDuty incident dispatch",
        channel: "REST_API_DISPATCH",
        mind: "settlement",
        dependsOn: ["gate"],
        pruneBudget: 140,
        prompt: "POST PagerDuty",
        rest: {
          method: "POST",
          url: "https://api.pagerduty.internal/incidents",
          headers: { From: "nexusrelay@ops.internal", "X-Routing-Key": "pd-nr-cloud" },
        },
        jev: {
          scoreMin: 0.7,
          choice: ["proceed", "abort"],
          noul: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } } },
        },
      }),
    ],
    edges: [
      ["scout", "extract"],
      ["extract", "gate"],
      ["gate", "settle"],
    ],
  },
};

export const LEAK_CHALLENGE: EnterpriseChallenge = {
  id: "leak",
  name: "Credential leak scan",
  blurb: "Domain crawl → schema sanitization → security ops ticket",
  objective:
    "Crawl public leak-intel mentions of acme-robotics.example, redact secrets before they enter context, Noul-assert redacted=true, and open a SecOps ticket.",
  scene: "leak",
  url: "intel.secops.example/acme",
  settlementUrl: "https://secops.internal/api/tickets",
  scoreMin: 0.82,
  choiceCandidates: ["proceed", "human_review", "abort"],
  schema: leakSchema,
  samplePayload: {
    domain: "acme-robotics.example",
    findings: 2,
    redacted: true,
    ticket: "SEC-918",
    secretPresent: false,
  },
  corpus: [
    {
      url: "https://intel.example/stealer/acme",
      title: "Stealer log index (metadata only)",
      markdown:
        "# Intel\nDomain **acme-robotics.example**. Findings **2** stealer logs. First-seen 2026-09-21. Hashes sha256:9f2c… Redact secrets. Cookie consent. Advertisement slot.",
    },
    {
      url: "https://haveibeen.example/domain/acme-robotics.example",
      title: "Domain breach catalog",
      markdown:
        "# Catalog\nNo plaintext passwords in this extract. ticket candidate **SEC-918**. Subscribe to newsletter.",
    },
  ],
  lift: (markdown) => {
    const text = markdown.replace(/\n/g, " ");
    const findings = num(text, /Findings \*\*?([0-9]+)/, 2);
    const secretPresent = /(password|api[_-]?key|secret=)\s*[:=]\s*\S+/i.test(text);
    return {
      domain: "acme-robotics.example",
      findings,
      redacted: !secretPresent,
      ticket: "SEC-918",
      secretPresent,
    };
  },
  dag: {
    id: "dag_leak",
    objective:
      "Crawl public leak-intel mentions of acme-robotics.example, redact secrets before they enter context, Noul-assert redacted=true, and open a SecOps ticket.",
    intent: "leak",
    nodes: [
      node({
        id: "scout",
        title: "Crawl domain leak intel",
        channel: "TAVILY_RESEARCH",
        mind: "scout",
        dependsOn: [],
        pruneBudget: 640,
        prompt: "acme-robotics.example stealer metadata hashes",
        jev: { scoreMin: 0.7, choice: ["proceed", "retry_extract", "abort"], noul: null },
      }),
      node({
        id: "extract",
        title: "Sanitize and redact secrets",
        channel: "TRANSFORMATION",
        mind: "extractor",
        dependsOn: ["scout"],
        pruneBudget: 300,
        prompt: "redacted findings ticket domain",
        jev: { scoreMin: 0.8, choice: ["proceed", "abort"], noul: leakSchema },
      }),
      node({
        id: "gate",
        title: "Noul: no raw secrets in payload",
        channel: "HUMAN_GATE",
        mind: "gatekeeper",
        dependsOn: ["extract"],
        pruneBudget: 160,
        prompt: "Assert redacted true and secretPresent false",
        jev: { scoreMin: 0.82, choice: ["proceed", "human_review", "abort"], noul: leakSchema },
      }),
      node({
        id: "settle",
        title: "Open SecOps ticket",
        channel: "REST_API_DISPATCH",
        mind: "settlement",
        dependsOn: ["gate"],
        pruneBudget: 140,
        prompt: "POST secops tickets",
        rest: {
          method: "POST",
          url: "https://secops.internal/api/tickets",
          headers: { "X-Queue": "identity-threat", "X-Severity": "high" },
        },
        jev: {
          scoreMin: 0.7,
          choice: ["proceed", "abort"],
          noul: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } } },
        },
      }),
    ],
    edges: [
      ["scout", "extract"],
      ["extract", "gate"],
      ["gate", "settle"],
    ],
  },
};

export const RFP_CHALLENGE: EnterpriseChallenge = {
  id: "rfp",
  name: "RFP vendor matrix comparison",
  blurb: "PDF/web extraction → line-item delta math → executive summary payload",
  objective:
    "Extract three vendor RFP responses, compute line-item deltas versus Acme baseline, pick a winner, and POST an executive summary payload.",
  scene: "rfp",
  url: "rfp.example/matrix",
  settlementUrl: "https://exec.internal/api/summaries",
  scoreMin: 0.77,
  choiceCandidates: ["proceed", "human_review", "abort"],
  schema: rfpSchema,
  samplePayload: { winner: "North", vendors: 3, deltaUsd: -140000, storageDeltaPct: -12, complete: true },
  corpus: [
    {
      url: "https://rfp.example/acme.pdf",
      title: "Acme Robotics commercial response",
      markdown:
        "# Acme\nTotal **USD 1120000**. Storage line **USD 250000**. Compute 410000. Support 180000. Privacy policy footer.",
    },
    {
      url: "https://rfp.example/helio.pdf",
      title: "HelioParts commercial response",
      markdown: "# Helio\nTotal **USD 1310000**. Storage **USD 280000**. Compute 470000. Support 190000. Subscribe to newsletter.",
    },
    {
      url: "https://rfp.example/north.pdf",
      title: "North Mill commercial response",
      markdown:
        "# North\nTotal **USD 980000**. Storage **USD 220000**. Compute 390000. Support 160000. Storage delta vs Acme **-12%**.",
    },
  ],
  lift: (markdown) => {
    const text = markdown.replace(/\n/g, " ");
    const totals = {
      Acme: num(text, /Acme[\s\S]*?USD ([0-9]+)/, 1_120_000),
      Helio: num(text, /Helio[\s\S]*?USD ([0-9]+)/, 1_310_000),
      North: num(text, /North[\s\S]*?USD ([0-9]+)/, 980_000),
    };
    const acmeStorage = 250000;
    const northStorage = 220000;
    const winner = Object.entries(totals).sort((a, b) => a[1] - b[1])[0][0];
    return {
      winner,
      vendors: 3,
      deltaUsd: totals[winner as keyof typeof totals] - totals.Acme,
      storageDeltaPct: Number((((northStorage - acmeStorage) / acmeStorage) * 100).toFixed(2)),
      complete: true,
      totals,
    };
  },
  dag: {
    id: "dag_rfp",
    objective:
      "Extract three vendor RFP responses, compute line-item deltas versus Acme baseline, pick a winner, and POST an executive summary payload.",
    intent: "rfp",
    nodes: [
      node({
        id: "scout",
        title: "Extract vendor RFP packages",
        channel: "TAVILY_RESEARCH",
        mind: "scout",
        dependsOn: [],
        pruneBudget: 860,
        prompt: "Acme Helio North RFP totals storage compute support",
        jev: { scoreMin: 0.7, choice: ["proceed", "retry_extract", "abort"], noul: null },
      }),
      node({
        id: "extract",
        title: "Line-item delta math",
        channel: "TRANSFORMATION",
        mind: "extractor",
        dependsOn: ["scout"],
        pruneBudget: 400,
        prompt: "winner deltaUsd storageDeltaPct",
        jev: { scoreMin: 0.76, choice: ["proceed", "human_review", "abort"], noul: rfpSchema },
      }),
      node({
        id: "gate",
        title: "Completeness Score gate",
        channel: "HUMAN_GATE",
        mind: "gatekeeper",
        dependsOn: ["extract"],
        pruneBudget: 180,
        prompt: "Three vendors and numeric deltas required",
        jev: { scoreMin: 0.77, choice: ["proceed", "human_review", "abort"], noul: rfpSchema },
      }),
      node({
        id: "settle",
        title: "Executive summary payload",
        channel: "REST_API_DISPATCH",
        mind: "settlement",
        dependsOn: ["gate"],
        pruneBudget: 150,
        prompt: "POST exec summaries",
        rest: {
          method: "POST",
          url: "https://exec.internal/api/summaries",
          headers: { "X-Audience": "cfo", "X-Doc-Type": "rfp-matrix" },
        },
        jev: {
          scoreMin: 0.7,
          choice: ["proceed", "abort"],
          noul: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } } },
        },
      }),
    ],
    edges: [
      ["scout", "extract"],
      ["extract", "gate"],
      ["gate", "settle"],
    ],
  },
};

export const EXTENDED_CHALLENGES: EnterpriseChallenge[] = [
  VAT_CHALLENGE,
  OUTAGE_CHALLENGE,
  LEAK_CHALLENGE,
  RFP_CHALLENGE,
];

export function getChallenge(id: string): EnterpriseChallenge | undefined {
  return EXTENDED_CHALLENGES.find((c) => c.id === id);
}
