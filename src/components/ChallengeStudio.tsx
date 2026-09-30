import { useEffect, useState } from "react";
import { compileMission, defaultMission, loadMission, type MissionDraft, type MissionNode } from "../core/challengeStudio";
import type { ArenaChallenge, SuccessAssertion } from "../data/arenaChallenges";
import { PRESETS } from "../data/presets";
import { Plus, Trash2, ArrowUp, ArrowDown, Play, Copy, Check, Terminal, Code2, ShieldAlert, Sparkles, Layers, RefreshCw } from "lucide-react";

const PRESET_SCENARIOS = [
  { id: "price", name: "Price Maze", url: "https://shop.example/widget-nx", blurb: "Traverse variant selectors while avoiding cookie decoys", payload: { sku: "NX-428", currency: "USD", price: 428 }, field: "price", val: "428" },
  { id: "news", name: "Headline Hunt", url: "https://news.example/helioparts", blurb: "Filter ad banners to extract supplier severity and sentiment", payload: { supplier: "HelioParts", severity: "high", sentiment: "negative" }, field: "severity", val: "high" },
  { id: "compliance", name: "Rulebook Puzzle", url: "https://regs.example/dora", blurb: "Check DORA control requirements against decoy audit tables", payload: { framework: "DORA", controlId: "ICT-04", status: "partial" }, field: "controlId", val: "ICT-04" },
  { id: "vat", name: "Tariff Labyrinth", url: "https://customs.example/hs-8471", blurb: "Extract HS 8471 landed cost and tax exemptions", payload: { hs: "8471", euVat: 0, ukVat: 0.02, landedUsd: 441.2 }, field: "hs", val: "8471" },
  { id: "leak", name: "Signal Sweep", url: "https://intel.secops.example/acme", blurb: "Redact credential leaks while evading honeypot fields", payload: { domain: "acme-robotics.example", findings: 2, ticket: "SEC-918" }, field: "ticket", val: "SEC-918" },
  { id: "rfp", name: "Vendor Showdown", url: "https://rfp.example/matrix", blurb: "Compare RFP bids across vendors and calculate cost delta", payload: { winner: "North", vendors: 3, deltaUsd: -140000 }, field: "winner", val: "North" }
];

const roles: MissionNode["role"][] = ["button", "input", "table", "modal", "banner", "link", "text", "select", "row"];
type RouteKey = "soloRoute" | "relayRoute";

export default function ChallengeStudio({ onLaunch }: { onLaunch: (challenge: ArenaChallenge) => void }) {
  const [draft, setDraft] = useState<MissionDraft>(() => loadMission(window.localStorage.getItem("nexusrelay-mission-v1")));
  const [message, setMessage] = useState("Draft saved automatically to browser storage.");
  const [activeCodeTab, setActiveCodeTab] = useState<"node" | "python" | "docker">("node");
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    window.localStorage.setItem("nexusrelay-mission-v1", JSON.stringify(draft));
  }, [draft]);

  const set = (patch: Partial<MissionDraft>) => setDraft(current => ({ ...current, ...patch }));

  const loadPresetScenario = (scenario: typeof PRESET_SCENARIOS[0]) => {
    const nodes: MissionNode[] = [
      { id: "target-elem", role: "button", text: `${scenario.name} Primary Value`, selector: ".primary-target", decoy: false },
      { id: "cookie-trap", role: "modal", text: "Accept All Cookies (Trap)", selector: "#cookie-wall button.accept", decoy: true },
      { id: "newsletter-ad", role: "banner", text: "Subscribe for 10% Off", selector: ".newsletter-popup", decoy: true },
      { id: "spec-row", role: "row", text: "Verified Specification Row", selector: "table.specs tr.active", decoy: false }
    ];

    setDraft({
      name: scenario.name,
      blurb: scenario.blurb,
      url: scenario.url,
      nodes,
      soloRoute: ["cookie-trap", "newsletter-ad", "target-elem"],
      relayRoute: ["target-elem", "spec-row"],
      payloadText: JSON.stringify(scenario.payload, null, 2),
      assertions: [{ field: scenario.field, operator: "equals", value: scenario.val }]
    });
    setMessage(`Loaded preset: ${scenario.name}`);
  };

  const editNode = (index: number, patch: Partial<MissionNode>) => {
    setDraft(current => {
      const nodes = current.nodes.map((node, i) => (i === index ? { ...node, ...patch } : node));
      const before = current.nodes[index].id;
      const after = patch.id ?? before;
      return {
        ...current,
        nodes,
        soloRoute: current.soloRoute.map(id => (id === before ? after : id)),
        relayRoute: current.relayRoute.map(id => (id === before ? after : id))
      };
    });
  };

  const addNode = () => {
    setDraft(current => {
      let index = current.nodes.length + 1;
      while (current.nodes.some(node => node.id === `element-${index}`)) index++;
      return {
        ...current,
        nodes: [...current.nodes, { id: `element-${index}`, role: "button", text: "New Page Element", selector: `#element-${index}`, decoy: false }]
      };
    });
  };

  const removeNode = (id: string) => {
    setDraft(current => ({
      ...current,
      nodes: current.nodes.filter(node => node.id !== id),
      soloRoute: current.soloRoute.filter(val => val !== id),
      relayRoute: current.relayRoute.filter(val => val !== id)
    }));
  };

  const editAssertion = (index: number, patch: Partial<SuccessAssertion>) => {
    set({ assertions: draft.assertions.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  };

  const changeRoute = (key: RouteKey, route: string[]) => set({ [key]: route });

  const launch = () => {
    try {
      const challenge = compileMission(draft);
      onLaunch(challenge);
      setMessage(`"${challenge.name}" compiled and launched into the arena.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Mission compilation failed.");
    }
  };

  // Generate runnable code snippets
  const runnerNodeCode = `import { chromium } from "playwright";

async function runMission() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("${draft.url}");

  // Execute Relay Route Specialist Steps
  const selectors = ${JSON.stringify(draft.nodes.map(n => ({ selector: n.selector, decoy: n.decoy })), null, 2)};
  
  console.log("Navigating to target mission...");
  for (const item of selectors) {
    if (item.decoy) {
      console.log("Scout filtered decoy:", item.selector);
      continue;
    }
    const locator = page.locator(item.selector).first();
    if (await locator.count() > 0) {
      console.log("Extractor locked onto:", item.selector);
    }
  }

  await browser.close();
}

runMission();
`;

  const runnerPythonCode = `from playwright.sync_api import sync_playwright
import json

def run_mission():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("${draft.url}")
        
        selectors = ${JSON.stringify(draft.nodes.map(n => ({ selector: n.selector, decoy: n.decoy })))}
        for item in selectors:
            if item["decoy"]:
                print(f"Scout ignored decoy: {item['selector']}")
                continue
            print(f"Extractor verified: {item['selector']}")
            
        browser.close()

if __name__ == "__main__":
    run_mission()
`;

  const runnerDockerCode = `FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ENV MISSION_URL="${draft.url}"
CMD ["npx", "tsx", "runner.ts"]
`;

  const copyCodeSnippet = () => {
    const code = activeCodeTab === "node" ? runnerNodeCode : activeCodeTab === "python" ? runnerPythonCode : runnerDockerCode;
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <section className="space-y-6">
      {/* Studio Banner */}
      <div className="nr-card p-6 bg-gradient-to-r from-[#FFFBEB] via-[#FEF3C7] to-[#ECFDF5] border-2 border-stone-900 shadow-[5px_5px_0px_#18181B]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <span className="nr-eyebrow">Module C · Mission Builder Studio · Agent Training Gym</span>
            <h2 className="nr-display text-2xl sm:text-3xl text-ink font-black">Design Browser Missions & Decoy Traps</h2>
            <p className="mt-2 text-xs text-stone-700 font-medium leading-relaxed">
              Construct real-world research missions with interactive DOM nodes, plant sticky tar pit decoys to test Solo Bot context bloat, and compile victory assertions.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={launch}
              className="nr-arcade-btn bg-[#FFE135] text-stone-900 px-6 py-2.5 text-xs font-black flex items-center gap-1.5"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Launch in Arena →</span>
            </button>
          </div>
        </div>

        {/* Preset Scenarios Strip */}
        <div className="mt-5 border-t-2 border-stone-900/40 pt-4">
          <span className="text-xs font-black uppercase tracking-wider text-stone-800 block mb-2">
            🎮 Quick-Load Scenarios:
          </span>
          <div className="flex flex-wrap gap-2">
            {[
              { id: "price", name: "Price Maze", btn: "bg-[#FFE135] text-stone-900" },
              { id: "news", name: "Headline Hunt", btn: "bg-[#A78BFA] text-white" },
              { id: "compliance", name: "Rulebook Puzzle", btn: "bg-[#34D399] text-stone-900" },
              { id: "vat", name: "Tariff Labyrinth", btn: "bg-[#FB7185] text-white" },
              { id: "leak", name: "Signal Sweep", btn: "bg-[#F87171] text-white" },
              { id: "rfp", name: "Vendor Showdown", btn: "bg-[#2DD4BF] text-stone-900" }
            ].map(sc => {
              const fullSc = PRESET_SCENARIOS.find(s => s.id === sc.id);
              if (!fullSc) return null;
              return (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => loadPresetScenario(fullSc)}
                  className={`nr-arcade-btn px-3.5 py-1 text-xs font-bold ${sc.btn}`}
                >
                  {sc.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Grid: Card Builders */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        {/* Left Column: Mission Identity & Page Elements */}
        <div className="space-y-5">
          {/* Card 1: Identity */}
          <div className="nr-card p-5 bg-white border border-stone-200/80 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <strong className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-amber-600" />
                01 · Mission Identity
              </strong>
            </div>

            <div>
              <label htmlFor="mission-name" className="block text-[11px] font-semibold text-stone-600 mb-1">Mission Name</label>
              <input
                id="mission-name"
                className="w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-2 text-xs focus:border-amber-600 focus:bg-white focus:outline-none"
                maxLength={90}
                value={draft.name}
                onChange={e => set({ name: e.target.value })}
              />
            </div>

            <div>
              <label htmlFor="mission-scenario" className="block text-[11px] font-semibold text-stone-600 mb-1">Scenario Blurb</label>
              <input
                id="mission-scenario"
                className="w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-2 text-xs focus:border-amber-600 focus:bg-white focus:outline-none"
                maxLength={180}
                value={draft.blurb}
                onChange={e => set({ blurb: e.target.value })}
              />
            </div>

            <div>
              <label htmlFor="mission-url" className="block text-[11px] font-semibold text-stone-600 mb-1">Target Address / Live URL</label>
              <input
                id="mission-url"
                className="w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-2 text-xs font-mono focus:border-amber-600 focus:bg-white focus:outline-none"
                maxLength={180}
                value={draft.url}
                onChange={e => set({ url: e.target.value })}
              />
            </div>
          </div>

          {/* Card 2: Modular Page Elements */}
          <div className="nr-card p-5 bg-white border border-stone-200/80 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <strong className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-purple-600" />
                02 · Modular DOM Elements ({draft.nodes.length})
              </strong>
              <button
                type="button"
                onClick={addNode}
                className="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-bold text-stone-700 hover:bg-stone-50 shadow-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Element</span>
              </button>
            </div>

            <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
              {draft.nodes.map((node, index) => (
                <div
                  key={index}
                  className={"rounded-2xl border p-3.5 transition-all space-y-2.5 " + (node.decoy ? "border-rose-300 bg-rose-50/60 shadow-xs" : "border-stone-200 bg-stone-50/40")}
                >
                  <div className="flex items-center justify-between">
                    <span className={"text-xs font-bold " + (node.decoy ? "text-rose-700 flex items-center gap-1" : "text-stone-800")}>
                      {node.decoy ? <ShieldAlert className="h-3.5 w-3.5" /> : null}
                      {node.decoy ? "Decoy Trap Node" : "Verified Target Node"} 0{index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeNode(node.id)}
                      className="text-stone-400 hover:text-rose-700 transition-colors p-1"
                      title="Remove Element"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-semibold text-stone-500 block mb-0.5">Element ID</label>
                      <input
                        className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-mono"
                        value={node.id}
                        onChange={e => editNode(index, { id: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-stone-500 block mb-0.5">Role Type</label>
                      <select
                        className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-semibold"
                        value={node.role}
                        onChange={e => editNode(index, { role: e.target.value as MissionNode["role"] })}
                      >
                        {roles.map(role => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-stone-500 block mb-0.5">Visible UI Label</label>
                    <input
                      className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium"
                      value={node.text}
                      onChange={e => editNode(index, { text: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-stone-500 block mb-0.5">CSS Selector</label>
                    <input
                      className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-mono text-emerald-800"
                      value={node.selector}
                      onChange={e => editNode(index, { selector: e.target.value })}
                    />
                  </div>

                  <label className="flex items-center gap-2 pt-1 text-xs font-semibold text-stone-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={node.decoy}
                      onChange={e => editNode(index, { decoy: e.target.checked })}
                      className="rounded border-stone-300 text-rose-600 focus:ring-rose-500"
                    />
                    <span>Flag as Decoy Trap (Triggers Solo Bot Tar Pit)</span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Route Steps, Assertions & Export */}
        <div className="space-y-5">
          {/* Card 3: Interactive Route Steps */}
          <div className="nr-card p-5 bg-white border border-stone-200/80 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <strong className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
                <Terminal className="h-4 w-4 text-emerald-600" />
                03 · Script Arena Routes
              </strong>
            </div>

            {(["soloRoute", "relayRoute"] as RouteKey[]).map(key => (
              <div key={key} className="rounded-2xl border border-stone-200 bg-stone-50/50 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-800">
                    {key === "soloRoute" ? "Lane A Route (Solo Monolith)" : "Lane B Route (Specialist Relay)"}
                  </span>
                  <span className="text-[10px] font-mono text-stone-400">
                    {draft[key].length} steps
                  </span>
                </div>

                <ol className="space-y-1.5">
                  {draft[key].map((id, index) => {
                    const node = draft.nodes.find(n => n.id === id);
                    return (
                      <li
                        key={index}
                        className="flex items-center justify-between rounded-xl bg-white border border-stone-200 px-3 py-1.5 text-xs shadow-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-stone-400 font-bold">0{index + 1}.</span>
                          <span className="font-semibold text-stone-800">{node?.text ?? id}</span>
                          {node?.decoy && (
                            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-800">
                              DECOY
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => {
                              const route = [...draft[key]];
                              [route[index - 1], route[index]] = [route[index], route[index - 1]];
                              changeRoute(key, route);
                            }}
                            className="rounded p-1 text-stone-400 hover:text-stone-700 disabled:opacity-30"
                            title="Move Up"
                          >
                            <ArrowUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            disabled={index === draft[key].length - 1}
                            onClick={() => {
                              const route = [...draft[key]];
                              [route[index + 1], route[index]] = [route[index], route[index + 1]];
                              changeRoute(key, route);
                            }}
                            className="rounded p-1 text-stone-400 hover:text-stone-700 disabled:opacity-30"
                            title="Move Down"
                          >
                            <ArrowDown className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => changeRoute(key, draft[key].filter((_, i) => i !== index))}
                            className="rounded p-1 text-stone-400 hover:text-rose-700"
                            title="Remove Step"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ol>

                <select
                  aria-label={`Add step to ${key}`}
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 focus:outline-none"
                  value=""
                  onChange={e => {
                    if (e.target.value) changeRoute(key, [...draft[key], e.target.value]);
                  }}
                >
                  <option value="">+ Append Node to Route…</option>
                  {draft.nodes.map(n => (
                    <option key={n.id} value={n.id}>
                      {n.text} {n.decoy ? "(Decoy)" : ""} ({n.id})
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* Card 4: Define Victory Assertions */}
          <div className="nr-card p-5 bg-white border border-stone-200/80 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <strong className="text-xs font-bold uppercase tracking-wider text-stone-700">
                04 · Define Victory Assertions
              </strong>
              <button
                type="button"
                onClick={() => set({ assertions: [...draft.assertions, { field: "", operator: "exists" }] })}
                className="text-xs font-bold text-amber-700 hover:underline"
              >
                + Add Assertion
              </button>
            </div>

            <div>
              <label htmlFor="payload-target" className="block text-[11px] font-semibold text-stone-600 mb-1">
                Target Schema Lift (Clean Payload JSON)
              </label>
              <textarea
                id="payload-target"
                spellCheck={false}
                className="w-full min-h-24 rounded-xl border border-stone-200 bg-stone-50/50 p-2.5 font-mono text-[11px] focus:bg-white focus:outline-none"
                value={draft.payloadText}
                onChange={e => set({ payloadText: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              {draft.assertions.map((assertion, index) => (
                <div key={index} className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 p-2 text-xs">
                  <input
                    aria-label={`Assertion ${index + 1} field`}
                    placeholder="Field name"
                    className="w-32 rounded-lg border border-stone-200 bg-white px-2 py-1 font-mono text-xs"
                    value={assertion.field}
                    onChange={e => editAssertion(index, { field: e.target.value })}
                  />
                  <select
                    aria-label={`Assertion ${index + 1} operator`}
                    className="w-24 rounded-lg border border-stone-200 bg-white px-2 py-1 font-semibold text-xs"
                    value={assertion.operator}
                    onChange={e => editAssertion(index, { operator: e.target.value as SuccessAssertion["operator"] })}
                  >
                    <option value="exists">exists</option>
                    <option value="equals">equals</option>
                  </select>
                  {assertion.operator === "equals" && (
                    <input
                      aria-label={`Assertion ${index + 1} value`}
                      placeholder="Expected value"
                      className="w-28 rounded-lg border border-stone-200 bg-white px-2 py-1 font-mono text-xs"
                      value={assertion.value ?? ""}
                      onChange={e => editAssertion(index, { value: e.target.value })}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => set({ assertions: draft.assertions.filter((_, i) => i !== index) })}
                    className="p-1 text-stone-400 hover:text-rose-700 ml-auto"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Card 5: Live Runner Code Exporter */}
          <div className="nr-card p-5 bg-[#18191E] border border-stone-800 text-white shadow-lg space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <strong className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                <Code2 className="h-4 w-4" />
                Standalone Runner Exporter
              </strong>
              <div className="flex items-center gap-1">
                {(["node", "python", "docker"] as const).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveCodeTab(tab)}
                    className={"rounded-full px-2.5 py-0.5 text-[10px] font-mono uppercase font-bold transition-colors " + (activeCodeTab === tab ? "bg-amber-500 text-black" : "bg-white/10 text-stone-400 hover:text-white")}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <pre className="max-h-48 overflow-auto rounded-xl bg-black/50 p-3 font-mono text-[10px] text-emerald-300 leading-relaxed">
              {activeCodeTab === "node" ? runnerNodeCode : activeCodeTab === "python" ? runnerPythonCode : runnerDockerCode}
            </pre>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-stone-400">One-click standalone execution script</span>
              <button
                type="button"
                onClick={copyCodeSnippet}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 px-3 py-1 text-xs font-semibold text-white transition-colors"
              >
                {copiedCode ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                <span>{copiedCode ? "Copied!" : "Copy Snippet"}</span>
              </button>
            </div>
          </div>

          {/* Launch Controls & Message */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={launch}
                className="flex items-center gap-1.5 rounded-full bg-ink px-6 py-2.5 text-xs font-bold text-white shadow-luxury hover:bg-stone-800 transition-all hover:scale-105"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>Launch in Arena →</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(defaultMission());
                  setMessage("Default mission restored.");
                }}
                className="rounded-full border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
              >
                Reset Starter
              </button>
            </div>
            <p className="text-xs text-stone-600 font-medium" role="status">{message}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
