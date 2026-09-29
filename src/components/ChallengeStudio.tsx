import { useEffect, useState } from "react";
import { compileMission, defaultMission, loadMission, type MissionDraft, type MissionNode } from "../core/challengeStudio";
import type { ArenaChallenge, SuccessAssertion } from "../data/arenaChallenges";

const field = "w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs outline-amber-500";
const button = "rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[11px] font-semibold hover:border-amber-500";
const roles: MissionNode["role"][] = ["button", "input", "table", "modal", "banner", "link", "text", "select", "row"];
type RouteKey = "soloRoute" | "relayRoute";

export default function ChallengeStudio({ onLaunch }: { onLaunch: (challenge: ArenaChallenge) => void }) {
  const [draft, setDraft] = useState<MissionDraft>(() => loadMission(window.localStorage.getItem("nexusrelay-mission-v1")));
  const [message, setMessage] = useState("Your changes are saved in this browser.");
  useEffect(() => { window.localStorage.setItem("nexusrelay-mission-v1", JSON.stringify(draft)); }, [draft]);
  const set = (patch: Partial<MissionDraft>) => setDraft(current => ({ ...current, ...patch }));
  const editNode = (index: number, patch: Partial<MissionNode>) => setDraft(current => {
    const nodes = current.nodes.map((node, i) => i === index ? { ...node, ...patch } : node);
    const before = current.nodes[index].id;
    const after = patch.id ?? before;
    return { ...current, nodes, soloRoute: current.soloRoute.map(id => id === before ? after : id), relayRoute: current.relayRoute.map(id => id === before ? after : id) };
  });
  const addNode = () => setDraft(current => {
    let index = current.nodes.length + 1;
    while (current.nodes.some(node => node.id === `element-${index}`)) index++;
    return { ...current, nodes: [...current.nodes, { id: `element-${index}`, role: "button", text: "New page element", selector: `#element-${index}`, decoy: false }] };
  });
  const removeNode = (id: string) => setDraft(current => ({ ...current, nodes: current.nodes.filter(node => node.id !== id), soloRoute: current.soloRoute.filter(value => value !== id), relayRoute: current.relayRoute.filter(value => value !== id) }));
  const editAssertion = (index: number, patch: Partial<SuccessAssertion>) => set({ assertions: draft.assertions.map((item, i) => i === index ? { ...item, ...patch } : item) });
  const changeRoute = (key: RouteKey, route: string[]) => set({ [key]: route });
  const launch = () => {
    try { const challenge = compileMission(draft); onLaunch(challenge); setMessage(`“${challenge.name}” is ready in the arena. ${/^https?:\/\//.test(challenge.url) ? "Choose Run on live site to test the actual page." : "The illustrated routes use your assertions."}`); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Mission is incomplete."); }
  };
  return <section>
    <div className="nr-card mb-4 overflow-hidden bg-gradient-to-r from-[#fff3dc] via-white to-[#e5f5ef] p-5">
      <p className="text-[10px] font-bold uppercase tracking-[.22em] text-amber-700">Challenge Studio / Your world, your rules</p>
      <h2 className="nr-display mt-1 text-2xl">Build the browser mission</h2>
      <p className="mt-1 max-w-2xl text-xs text-stone-600">Design the play-set and define the selectors and success assertions. Enter a real HTTPS URL to unlock a live Chromium duel in the arena; the agent will act on the actual page.</p>
    </div>
    <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
      <div className="space-y-4">
        <div className="nr-card p-4">
          <h3 className="mb-3 font-semibold">01 · Mission identity</h3>
          <label className="mb-2 block text-xs">Name<input className={field} maxLength={90} value={draft.name} onChange={e => set({ name: e.target.value })} /></label>
          <label className="mb-2 block text-xs">Scenario description<input className={field} maxLength={180} value={draft.blurb} onChange={e => set({ blurb: e.target.value })} /></label>
          <label className="block text-xs">Address / live site URL<input className={field} maxLength={180} value={draft.url} onChange={e => set({ url: e.target.value })} /></label>
        </div>
        <div className="nr-card p-4">
          <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">02 · Page elements</h3><button className={button} onClick={addNode} type="button">+ Add element</button></div>
          <div className="space-y-3">{draft.nodes.map((node, index) => <div key={index} className={"rounded-2xl border p-3 " + (node.decoy ? "border-rose-200 bg-rose-50" : "border-stone-200 bg-sand")}>
            <div className="mb-2 flex items-center justify-between"><b className="text-xs">{node.decoy ? "◉ Decoy trap" : "◇ Target"} {index + 1}</b><button type="button" className="text-[11px] text-rose-700" onClick={() => removeNode(node.id)}>Remove</button></div>
            <div className="grid gap-2 sm:grid-cols-2"><label className="text-[10px]">ID<input className={field} value={node.id} onChange={e => editNode(index, { id: e.target.value })} /></label><label className="text-[10px]">Role<select className={field} value={node.role} onChange={e => editNode(index, { role: e.target.value as MissionNode["role"] })}>{roles.map(role => <option key={role}>{role}</option>)}</select></label></div>
            <label className="mt-2 block text-[10px]">Visible label<input className={field} value={node.text} onChange={e => editNode(index, { text: e.target.value })} /></label>
            <label className="mt-2 block text-[10px]">CSS selector<input className={field + " font-mono"} value={node.selector} onChange={e => editNode(index, { selector: e.target.value })} /></label>
            <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={node.decoy} onChange={e => editNode(index, { decoy: e.target.checked })} /> This is a decoy</label>
          </div>)}</div>
        </div>
      </div>
      <div className="space-y-4">
        <div className="nr-card p-4">
          <h3 className="mb-1 font-semibold">03 · Script the play-set</h3><p className="mb-3 text-[11px] text-stone-500">Arrange the illustrated route for each lane. A live run lets both agents decide their own browser actions against the configured selectors.</p>
          {(["soloRoute", "relayRoute"] as RouteKey[]).map(key => <div key={key} className="mb-4 rounded-2xl border border-stone-200 p-3">
            <strong className="text-xs">{key === "soloRoute" ? "Solo agent · Lane A" : "Relay squad · Lane B"}</strong>
            <ol className="mt-2 space-y-1">{draft[key].map((id, index) => <li key={index} className="flex items-center justify-between rounded-lg bg-sand px-2 py-1 text-xs"><span>{index + 1}. {draft.nodes.find(node => node.id === id)?.text ?? id}</span><span className="flex gap-1"><button type="button" aria-label={`Move ${key} step ${index + 1} up`} disabled={index === 0} onClick={() => { const route = [...draft[key]]; [route[index - 1], route[index]] = [route[index], route[index - 1]]; changeRoute(key, route); }}>↑</button><button type="button" aria-label={`Remove ${key} step ${index + 1}`} onClick={() => changeRoute(key, draft[key].filter((_, i) => i !== index))}>×</button></span></li>)}</ol>
            <select aria-label={`Add step to ${key}`} className={field + " mt-2"} value="" onChange={e => { if (e.target.value) changeRoute(key, [...draft[key], e.target.value]); }}><option value="">+ Add route step…</option>{draft.nodes.map(node => <option key={node.id} value={node.id}>{node.text} {node.decoy ? "(decoy)" : ""}</option>)}</select>
          </div>)}
        </div>
        <div className="nr-card p-4">
          <h3 className="mb-1 font-semibold">04 · Define victory</h3><p className="mb-3 text-[11px] text-stone-500">This JSON defines the target field types and the play-set example. A live run extracts fresh values from the opened page and checks these assertions against them.</p>
          <label className="block text-xs">Extraction payload<textarea spellCheck={false} className={field + " mt-1 min-h-32 font-mono"} value={draft.payloadText} onChange={e => set({ payloadText: e.target.value })} /></label>
          {draft.assertions.map((assertion, index) => <div key={index} className="mt-2 flex flex-wrap items-center gap-1"><input aria-label={`Assertion ${index + 1} field`} placeholder="field" className={field + " w-32"} value={assertion.field} onChange={e => editAssertion(index, { field: e.target.value })} /><select aria-label={`Assertion ${index + 1} comparison`} className={field + " w-24"} value={assertion.operator} onChange={e => editAssertion(index, { operator: e.target.value as SuccessAssertion["operator"] })}><option value="exists">exists</option><option value="equals">equals</option></select>{assertion.operator === "equals" && <input aria-label={`Assertion ${index + 1} expected value`} placeholder="expected" className={field + " w-28"} value={assertion.value ?? ""} onChange={e => editAssertion(index, { value: e.target.value })} />}<button type="button" className="px-2 text-rose-700" aria-label={`Remove assertion ${index + 1}`} onClick={() => set({ assertions: draft.assertions.filter((_, i) => i !== index) })}>×</button></div>)}
          <button type="button" className={button + " mt-3"} onClick={() => set({ assertions: [...draft.assertions, { field: "", operator: "exists" }] })}>+ Add assertion</button>
        </div>
        <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={launch} className="rounded-full bg-ink px-5 py-2.5 text-xs font-semibold text-white">Launch in arena →</button><button type="button" className={button} onClick={() => { setDraft(defaultMission()); setMessage("Starter mission restored."); }}>Restore starter</button></div>
        <p role="status" className="text-xs text-stone-600">{message}</p>
      </div>
    </div>
  </section>;
}
