import type { Intent } from "../types";
export interface TavilyDoc { url: string; title: string; markdown: string; }
const NOISE = ["cookie consent", "subscribe to newsletter", "advertisement slot"];
const CORPUS: Record<Intent, TavilyDoc[]> = {
  price: [{ url: "https://vendor-a.example/pricing", title: "Widget NX", markdown: "SKU NX-428 list USD 428 delta -3.8% currency USD" }],
  news: [{ url: "https://wires.example/risk", title: "HelioParts", markdown: "HelioParts severity high ETA slip 9 days sentiment negative" }],
  compliance: [{ url: "https://regs.example/dora", title: "DORA", markdown: "framework DORA controlId ICT-04 status partial" }],
  lead: [{ url: "https://acme-robotics.example", title: "Acme", markdown: "domain acme-robotics.example email hello@acme-robotics.example employees 180" }],
  vat: [{ url: "https://tariff.example/hs-8471", title: "HS 8471", markdown: "hs 8471 euVat 0 ukVat 0.02 landedUsd 441.2 compliant true" }],
  outage: [{ url: "https://status.cloud.example", title: "AWS", markdown: "sev SEV2 provider aws region us-east-1 incidentId INC-4419 pageDegraded true" }],
  leak: [{ url: "https://intel.secops.example/acme", title: "Intel", markdown: "domain acme-robotics.example findings 2 redacted true ticket SEC-918" }],
  rfp: [{ url: "https://rfp.example/matrix", title: "RFP", markdown: "winner North vendors 3 deltaUsd -140000 complete true" }]
};
export function tokensOf(s: string){ return Math.max(1, Math.ceil(String(s||"").length / 4)); }
export function detectIntent(text: string): Intent {
  const s = text.toLowerCase();
  if (/vat|tariff|hs 8471|landed/.test(s)) return "vat";
  if (/outage|pagerduty|multi-cloud|inc-4419/.test(s)) return "outage";
  if (/leak|credential|secops|stealer/.test(s)) return "leak";
  if (/rfp|vendor matrix|line-item/.test(s)) return "rfp";
  if (/price|competitor|sku|delta|erp/.test(s)) return "price";
  if (/supplier|risk|news|slack/.test(s)) return "news";
  if (/regulat|compliance|audit|dora|soc/.test(s)) return "compliance";
  if (/lead|crm|enrich|domain/.test(s)) return "lead";
  return "price";
}
export function selectCorpus(q: string){ return CORPUS[detectIntent(q)]; }
export function pruneTokens(docs: TavilyDoc[], query: string, budget = 900) {
  const qset = new Set(query.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  const sentences: { sent: string; weight: number; url: string }[] = [];
  for (const d of docs) {
    const parts = (d.title + ". " + d.markdown).split(/\. /);
    for (const sent of parts) {
      const low = sent.toLowerCase();
      if (NOISE.some(n => low.includes(n))) continue;
      const toks = low.match(/[a-z0-9]+/g) ?? [];
      sentences.push({ sent: sent.trim(), weight: toks.filter(t => qset.has(t)).length, url: d.url });
    }
  }
  sentences.sort((a,b) => b.weight - a.weight);
  let used = 0; const kept: typeof sentences = [];
  for (const s of sentences) { const t = tokensOf(s.sent); if (used + t > budget) continue; kept.push(s); used += t; }
  const raw = docs.reduce((a,d) => a + tokensOf(d.markdown), 0);
  return { markdown: kept.map(k => "- " + k.sent).join("\n"), tokens: used, dropped: Math.max(0, raw - used), sources: [...new Set(kept.map(k => k.url))] };
}
export async function tavilySearch(query: string){ return selectCorpus(query); }
export async function tavilyExtract(urls: string[]): Promise<TavilyDoc[]> { return selectCorpus(urls.join(" ")); }
export function liftStructured(markdown: string, intent: Intent): Record<string, unknown> {
  const text = markdown.replace(/\n/g, " ");
  const num = (re: RegExp, d: number) => { const m = text.match(re); return m ? parseFloat(m[1]) : d; };
  if (intent === "price") return { sku: "NX-428", currency: "USD", price: num(/USD\s*([0-9]+)/, 428), deltaPct: -3.8 };
  if (intent === "news") return { supplier: "HelioParts", severity: "high", sentiment: "negative", etaSlipDays: 9 };
  if (intent === "compliance") return { framework: "DORA", controlId: "ICT-04", status: "partial", gaps: ["orphans"] };
  if (intent === "lead") return { domain: "acme-robotics.example", email: "hello@acme-robotics.example", employees: 180, icpFit: "high" };
  if (intent === "vat") return { hs: "8471", euVat: 0, ukVat: 0.02, landedUsd: 441.2, compliant: true };
  if (intent === "outage") return { sev: "SEV2", provider: "aws", region: "us-east-1", incidentId: "INC-4419", pageDegraded: true };
  if (intent === "leak") return { domain: "acme-robotics.example", findings: 2, redacted: true, ticket: "SEC-918" };
  return { winner: "North", vendors: 3, deltaUsd: -140000, complete: true };
}
