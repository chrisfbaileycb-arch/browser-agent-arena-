import { useEffect, useMemo, useRef, useState } from "react";
import {
  EXTENDED_CHALLENGES,
  type BrowserSceneId,
  type EnterpriseChallenge,
} from "../data/extendedChallenges";

export interface BrowserSimulationViewportProps {
  challengeId?: string;
  running?: boolean;
  tickMs?: number;
  challenge?: EnterpriseChallenge;
}

interface SceneEl {
  id: string;
  kind: "search" | "card" | "table" | "modal";
  label: string;
  detail: string;
  valid: boolean;
  selector: string;
}

interface Scene {
  title: string;
  url: string;
  els: SceneEl[];
  payload: Record<string, unknown>;
}

const STYLE_ID = "nr-browser-sim-css";

function ensureCss(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
    @keyframes nr-sel-jitter {
      0% { transform: translate(0,0); }
      25% { transform: translate(2px,-2px); }
      50% { transform: translate(-2px,1px); }
      75% { transform: translate(1px,2px); }
      100% { transform: translate(0,0); }
    }
  `;
  document.head.appendChild(s);
}

const BASE_SCENES: Record<string, Scene> = {
  price: {
    title: "Merchant catalog",
    url: "vendor-a.example/pricing",
    payload: { sku: "NX-428", currency: "USD", price: 428, deltaPct: -3.8 },
    els: [
      { id: "q", kind: "search", label: "Search Widget NX", detail: "q=widget+nx", valid: false, selector: "input.search" },
      { id: "c1", kind: "card", label: "Vendor A · USD 428.00 · SKU NX-428", detail: "in stock", valid: true, selector: "[data-sku='NX-428']" },
      { id: "c2", kind: "card", label: "Sponsored buy-now bait", detail: "affiliate modal", valid: false, selector: ".ad-slot > button.cta" },
      { id: "tb", kind: "table", label: "Street index 419 · delta -3.8%", detail: "6 merchants", valid: true, selector: "table.street-index tbody tr[data-sku='NX-428']" },
    ],
  },
  news: {
    title: "Risk wires",
    url: "wires.example/risk",
    payload: { supplier: "HelioParts", severity: "high", sentiment: "negative" },
    els: [
      { id: "n1", kind: "card", label: "HelioParts cyber + port congestion", detail: "severity high", valid: true, selector: "article[data-entity='HelioParts']" },
      { id: "n2", kind: "card", label: "Subscribe for alerts", detail: "newsletter", valid: false, selector: "#subscribe-modal button" },
      { id: "n3", kind: "table", label: "ETA slip 9–14 days", detail: "APAC lane", valid: true, selector: "table.eta td[data-field='slip']" },
    ],
  },
  compliance: {
    title: "Control excerpts",
    url: "regs.example/dora",
    payload: { framework: "DORA", controlId: "ICT-04", status: "partial" },
    els: [
      { id: "d1", kind: "card", label: "DORA ICT-04 · 24h incident report", detail: "runbook present", valid: true, selector: "section#ICT-04" },
      { id: "d2", kind: "card", label: "Cookie policy", detail: "consent wall", valid: false, selector: "#consent-accept" },
      { id: "d3", kind: "table", label: "SOC2 CC6.1 · 3 orphaned accounts", detail: "last review 2026-06-02", valid: true, selector: "table.exceptions tr[data-id='orphan']" },
    ],
  },
  lead: {
    title: "Company profile",
    url: "acme-robotics.example",
    payload: { domain: "acme-robotics.example", email: "hello@acme-robotics.example", icpFit: "high" },
    els: [
      { id: "p1", kind: "search", label: "acme-robotics.example", detail: "canonical domain", valid: true, selector: "header [data-domain]" },
      { id: "p2", kind: "card", label: "Series B · 180 employees · Austin", detail: "ROS2 / k8s", valid: true, selector: "dl.firmographics" },
      { id: "p3", kind: "card", label: "Related startups carousel", detail: "recirc", valid: false, selector: ".recirc-rail .card:nth-child(2)" },
    ],
  },
  vat: {
    title: "HS 8471 tariff desk",
    url: "tariff.example/hs-8471",
    payload: { hs: "8471", euVat: 0, ukVat: 0.02, landedUsd: 441.2, compliant: true },
    els: [
      { id: "t1", kind: "search", label: "HS 8471 · EU / UK / US", detail: "multi-jurisdiction", valid: true, selector: "input#hs-code" },
      { id: "t2", kind: "table", label: "EU 0% · UK 2% · US HTS 8471.30", detail: "duty matrix", valid: true, selector: "table#vat-matrix tbody" },
      { id: "t3", kind: "card", label: "Broker upsell checkout", detail: "decoy CTA", valid: false, selector: ".broker-upsell button.checkout" },
      { id: "t4", kind: "modal", label: "Bonded warehouse modal", detail: "overlay", valid: false, selector: "dialog#bonded-wh" },
    ],
  },
  outage: {
    title: "Multi-cloud status",
    url: "status.cloud.example",
    payload: { sev: "SEV2", region: "us-east-1", provider: "aws", page: "INC-4419" },
    els: [
      { id: "s1", kind: "table", label: "AWS us-east-1 elevated · GCP ok · Azure ok", detail: "poll 15s", valid: true, selector: "table.status tr[data-region='us-east-1']" },
      { id: "s2", kind: "card", label: "Marketing banner: new regions", detail: "promo", valid: false, selector: ".promo-banner a" },
      { id: "s3", kind: "card", label: "Incident INC-4419 latency 18%", detail: "open", valid: true, selector: "[data-incident='INC-4419']" },
    ],
  },
  leak: {
    title: "Leak intel (redacted)",
    url: "intel.secops.example/acme",
    payload: { domain: "acme-robotics.example", findings: 2, redacted: true, ticket: "SEC-918" },
    els: [
      { id: "l1", kind: "table", label: "acme-robotics.example · 2 stealer logs", detail: "first-seen 2026-09-21", valid: true, selector: "table.findings tr[data-domain]" },
      { id: "l2", kind: "card", label: "Raw secret dump (blocked)", detail: "do not click", valid: false, selector: "pre.raw-secret" },
      { id: "l3", kind: "card", label: "Sanitized hash + first-seen", detail: "sha256 prefix", valid: true, selector: "[data-redacted='true']" },
    ],
  },
  rfp: {
    title: "Vendor matrix",
    url: "rfp.example/matrix",
    payload: { winner: "North", deltaUsd: -140000, complete: true, vendors: 3 },
    els: [
      { id: "r1", kind: "table", label: "Acme 1.12M · Helio 1.31M · North 0.98M", detail: "line items", valid: true, selector: "table.rfp-matrix" },
      { id: "r2", kind: "card", label: "Download gated PDF modal", detail: "leadwall", valid: false, selector: "#gate-pdf button" },
      { id: "r3", kind: "card", label: "Line-item delta: storage -12%", detail: "exec extract", valid: true, selector: "[data-line='storage']" },
    ],
  },
};

function sceneFor(id: string, challenge?: EnterpriseChallenge): Scene {
  const base = BASE_SCENES[id] ?? BASE_SCENES.vat;
  if (!challenge) return base;
  return {
    ...base,
    url: challenge.url || base.url,
    title: challenge.name || base.title,
    payload: challenge.samplePayload ?? base.payload,
  };
}

function kindBadge(kind: SceneEl["kind"]): string {
  if (kind === "search") return "input";
  if (kind === "table") return "table";
  if (kind === "modal") return "dialog";
  return "article";
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

function Lane({
  lane,
  scene,
  running,
  step,
}: {
  lane: "A" | "B";
  scene: Scene;
  running: boolean;
  step: number;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const elRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [box, setBox] = useState<Box | null>(null);

  const valid = scene.els.filter((e) => e.valid);
  const decoy = scene.els.filter((e) => !e.valid);
  const active =
    lane === "A"
      ? decoy.length
        ? decoy[step % decoy.length]
        : scene.els[0]
      : valid.length
        ? valid[Math.min(step, valid.length - 1)]
        : scene.els[0];

  useEffect(() => {
    const page = pageRef.current;
    const el = elRefs.current[active.id];
    if (!page || !el) return;
    const a = el.getBoundingClientRect();
    const b = page.getBoundingClientRect();
    setBox({
      top: a.top - b.top,
      left: a.left - b.left,
      width: a.width,
      height: a.height,
    });
  }, [active.id, scene.url, running, step]);

  const monoSelector =
    lane === "A"
      ? `html > body > div:nth-child(${(step % 7) + 2}) > ${active.kind}:nth-of-type(${(step % 4) + 1})`
      : active.selector;

  return (
    <div className="overflow-hidden rounded-3xl border border-stone-200/60 bg-white shadow-card">
      <div className="flex items-center justify-between px-3 pt-3">
        <strong className="text-xs text-ink">
          {lane === "A" ? "Lane A · monolithic DOM" : "Lane B · NexusRelay"}
        </strong>
        <span
          className="rounded-full px-3 py-1 text-[11px] font-semibold"
          style={{
            background: lane === "A" ? "#FEE2E2" : "#D1FAE5",
            color: lane === "A" ? "#991B1B" : "#065F46",
          }}
        >
          {lane === "A" ? "selector jitter" : "target lock"}
        </span>
      </div>
      <div className="p-2.5">
        <div className="flex items-center gap-1.5 rounded-t-2xl bg-stone-100 px-2.5 py-2">
          <span className="h-2 w-2 rounded-full bg-rose-600" />
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          <span className="h-2 w-2 rounded-full bg-emerald-600" />
          <div className="font-mono ml-1 flex-1 truncate rounded-lg border border-stone-200 bg-white px-2 py-1 text-[10px] text-stone-600">
            {scene.url}
          </div>
        </div>
        <div ref={pageRef} className="relative min-h-[220px] overflow-hidden rounded-b-2xl bg-sand p-2.5">
          {running && box ? (
            <div
              className="pointer-events-none absolute z-10 rounded-xl"
              style={{
                top: box.top,
                left: box.left,
                width: box.width,
                height: box.height,
                border: lane === "A" ? "2px solid #E11D48" : "2px solid #059669",
                boxShadow:
                  lane === "A"
                    ? "0 0 0 3px rgba(225,29,72,0.16)"
                    : "0 0 0 3px rgba(5,150,105,0.16)",
                animation: lane === "A" ? "nr-sel-jitter 0.28s linear infinite" : undefined,
              }}
            />
          ) : null}

          {scene.els.map((el) => (
            <div
              key={el.id}
              ref={(n) => {
                elRefs.current[el.id] = n;
              }}
              className="relative mb-1.5 rounded-xl border border-stone-200 bg-white px-2.5 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-ink">{el.label}</span>
                <span className="font-mono text-[10px] text-stone-400">
                  {kindBadge(el.kind)}
                  {el.valid ? "" : " · decoy"}
                </span>
              </div>
              <div className="mt-0.5 text-[10px] text-stone-500">{el.detail}</div>
            </div>
          ))}

          {lane === "A" && running ? (
            <div className="absolute bottom-2 left-2 z-20 rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-semibold text-red-800">
              invalid click · {active.kind} · {monoSelector}
            </div>
          ) : null}

          {lane === "B" && running ? (
            <div className="absolute bottom-2 right-2 z-20 w-[48%] rounded-2xl bg-ink p-2.5 font-mono text-[9px] leading-snug text-canvas">
              <div className="mb-1 text-[10px] font-semibold text-emerald-300">pruned payload overlay</div>
              <div className="mb-1 truncate text-amber-200">{active.selector}</div>
              {JSON.stringify(scene.payload, null, 2)}
            </div>
          ) : null}
        </div>
      </div>
      <div className="font-mono px-3 pb-3 text-[10px] text-stone-500">
        {running ? (lane === "A" ? "hunting " : "locked ") : "idle "}
        {monoSelector}
      </div>
    </div>
  );
}

export default function BrowserSimulationViewport({
  challengeId = "vat",
  running = true,
  tickMs = 420,
  challenge,
}: BrowserSimulationViewportProps) {
  const [step, setStep] = useState(0);
  const resolved = useMemo(() => {
    const fromProp = challenge ?? EXTENDED_CHALLENGES.find((c) => c.id === challengeId);
    const id = fromProp?.id ?? challengeId;
    return sceneFor(id, fromProp);
  }, [challenge, challengeId]);

  useEffect(() => {
    ensureCss();
  }, []);

  useEffect(() => {
    setStep(0);
  }, [challengeId, challenge?.id]);

  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setStep((s) => s + 1), tickMs);
    return () => window.clearInterval(t);
  }, [running, tickMs]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[11px] text-stone-500">
          Browser simulation viewport · {resolved.title}
        </div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-semibold text-amber-800">
          {running ? "live trace" : "paused"}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Lane lane="A" scene={resolved} running={running} step={step} />
        <Lane lane="B" scene={resolved} running={running} step={step} />
      </div>
    </div>
  );
}

export const BROWSER_SCENE_IDS: BrowserSceneId[] = ["catalog", "news", "docs", "profile", "tax", "status", "leak", "rfp"];
