import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { api, del, post, put } from "../api";
import Crab from "../components/Crab";
import CrabCard, { useCards } from "../components/CrabCard";
import { Badge, Btn, Card, Field, Head, Notice, Page } from "../components/ui";

const BLANK = { name: "", color: "#FF5A4E", accent: "#FFD23F", accessory: "cap", skills: [], personality: "curious but careful", system_prompt: "", provider: "gemini", model: "gemini-3-flash-preview" };
const SKILLS = ["scroll scouting", "decoy detection", "form filling", "patience", "precise clicking", "reading fine print"];
const ACCESSORIES = ["none", "cap", "crown", "goggles", "headset", "bow", "helmet"];

export default function Builder() {
  const [crabs, setCrabs] = useState([]);
  const [models, setModels] = useState({});
  const [form, setForm] = useState(BLANK);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState("");
  const cards = useCards(crabs.map(c => `${c.id}`));
  const load = () => api("/crabs").then(setCrabs);
  useEffect(() => { load(); api("/models").then(setModels); }, []);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v, ...(k === "provider" ? { model: models[v]?.[0] } : {}) }));
  const save = async () => {
    try {
      const body = Object.fromEntries(Object.keys(BLANK).map(k => [k, form[k]]));
      if (editing) await put(`/crabs/${editing}`, body); else await post("/crabs", body);
      setMsg("Crab saved."); setForm(BLANK); setEditing(null); load();
    } catch (e) { setMsg(e.message); }
  };
  return (
    <Page testId="builder-page">
      <Head eyebrow="Crab Builder" title="Design your browser agent">Every field below changes how your crab behaves in real runs. It earns XP from scores and remembers what worked.</Head>
      <div className="grid two">
        <Card testId="crab-form">
          <div className="builder-preview" title="Drag to rotate"><Crab size={220} interactive mood="snap" color={form.color} accent={form.accent} accessory={form.accessory} /></div>
          <Field label="Name"><input value={form.name} onChange={e => set("name", e.target.value)} maxLength={40} data-testid="crab-name-input" /></Field>
          <div className="row">
            <Field label="Shell"><input type="color" value={form.color} onChange={e => set("color", e.target.value)} data-testid="crab-color-input" /></Field>
            <Field label="Accent"><input type="color" value={form.accent} onChange={e => set("accent", e.target.value)} data-testid="crab-accent-input" /></Field>
            <Field label="Accessory"><select value={form.accessory} onChange={e => set("accessory", e.target.value)} data-testid="crab-accessory-select">{ACCESSORIES.map(a => <option key={a}>{a}</option>)}</select></Field>
          </div>
          <Field label="Skills">
            <div className="row wrap">{SKILLS.map(s => (
              <button key={s} className={`chip ${form.skills.includes(s) ? "on" : ""}`} onClick={() => set("skills", form.skills.includes(s) ? form.skills.filter(x => x !== s) : [...form.skills, s])} data-testid={`skill-${s.replace(/\s/g, "-")}`}>{s}</button>
            ))}</div>
          </Field>
          <Field label="Personality"><input value={form.personality} onChange={e => set("personality", e.target.value)} maxLength={120} data-testid="crab-personality-input" /></Field>
          <Field label="System prompt (your extra instructions)"><textarea rows={4} value={form.system_prompt} onChange={e => set("system_prompt", e.target.value)} maxLength={1500} data-testid="crab-prompt-input" /></Field>
          <div className="row">
            <Field label="Provider (uses your key)"><select value={form.provider} onChange={e => set("provider", e.target.value)} data-testid="crab-provider-select">{Object.keys(models).map(p => <option key={p}>{p}</option>)}</select></Field>
            <Field label="Model"><select value={form.model} onChange={e => set("model", e.target.value)} data-testid="crab-model-select">{(models[form.provider] || []).map(m => <option key={m}>{m}</option>)}</select></Field>
          </div>
          <Notice testId="crab-form-message">{msg}</Notice>
          <Btn onClick={save} disabled={!form.name.trim()} testId="save-crab-btn">{editing ? "Update crab" : "Create crab"}</Btn>
        </Card>
        <div className="card-grid">
          {crabs.map(c => (
            <CrabCard key={c.id} crab={c} card={cards[c.id]} size={240} testId={`crab-card-${c.id}`}>
              <Btn kind="ghost" onClick={() => { setEditing(c.id); setForm({ ...BLANK, ...c }); }} testId={`edit-crab-${c.id}`}>Edit</Btn>
              <button className="icon-btn" onClick={() => del(`/crabs/${c.id}`).then(load)} aria-label="Delete crab" data-testid={`delete-crab-${c.id}`}><Trash2 size={16} /></button>
            </CrabCard>
          ))}
          {!crabs.length && <Card><p className="muted">Your crabs will appear here.</p></Card>}
        </div>
      </div>
    </Page>
  );
}
