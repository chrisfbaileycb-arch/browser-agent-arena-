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
  const field = (pattern: RegExp) => text.match(pattern)?.[1];
  const number = (pattern: RegExp) => { const v = field(pattern); return v === undefined ? undefined : Number(v); };
  const boolean = (pattern: RegExp) => { const v = field(pattern); return v === undefined ? undefined : v === "true"; };
  if (intent === "price") return { sku: field(/\bSKU\s+([\w-]+)/i), currency: field(/\bcurrency\s+([A-Z]{3})/i), price: number(/\bUSD\s+([\d.]+)/i), deltaPct: number(/\bdelta\s+(-?[\d.]+)/i) };
  if (intent === "news") return { supplier: field(/\b([A-Z][A-Za-z]+)\s+severity/), severity: field(/\bseverity\s+(\w+)/i), sentiment: field(/\bsentiment\s+(\w+)/i), etaSlipDays: number(/\bETA\s+slip\s+(\d+)/i) };
  if (intent === "compliance") return { framework: field(/\bframework\s+(\w+)/i), controlId: field(/\bcontrolId\s+([\w-]+)/i), status: field(/\bstatus\s+(\w+)/i) };
  if (intent === "lead") return { domain: field(/\bdomain\s+([\w.-]+)/i), email: field(/\bemail\s+([\w.+-]+@[\w.-]+)/i), employees: number(/\bemployees\s+(\d+)/i) };
  if (intent === "vat") return { hs: field(/\bhs\s+(\d+)/i), euVat: number(/\beuVat\s+([\d.]+)/i), ukVat: number(/\bukVat\s+([\d.]+)/i), landedUsd: number(/\blandedUsd\s+([\d.]+)/i), compliant: boolean(/\bcompliant\s+(true|false)/i) };
  if (intent === "outage") return { sev: field(/\bsev\s+(\w+)/i), provider: field(/\bprovider\s+(\w+)/i), region: field(/\bregion\s+([\w-]+)/i), incidentId: field(/\bincidentId\s+([\w-]+)/i), pageDegraded: boolean(/\bpageDegraded\s+(true|false)/i) };
  if (intent === "leak") return { domain: field(/\bdomain\s+([\w.-]+)/i), findings: number(/\bfindings\s+(\d+)/i), redacted: boolean(/\bredacted\s+(true|false)/i), ticket: field(/\bticket\s+([\w-]+)/i) };
  return { winner: field(/\bwinner\s+(\w+)/i), vendors: number(/\bvendors\s+(\d+)/i), deltaUsd: number(/\bdeltaUsd\s+(-?[\d.]+)/i), complete: boolean(/\bcomplete\s+(true|false)/i) };
}
