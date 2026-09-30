import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { api, downloadZip } from "../api";
import { useAuth } from "../auth";
import { PRESETS } from "../lib/data/presets";
import { synthesize } from "../lib/core/synthesizer";
import { exportBundle } from "../lib/services/vesselExporter";
import Crab from "../components/Crab";
import { Btn, Card, Head, Notice, Page } from "../components/ui";

export default function ExportPage() {
  const { user } = useAuth();
  const [crabs, setCrabs] = useState([]);
  const [preset, setPreset] = useState(PRESETS[0].id);
  const [msg, setMsg] = useState("");
  useEffect(() => { api("/crabs").then(setCrabs).catch(() => {}); }, []);
  const pro = user?.plan === "pro";
  const crabZip = async c => {
    try { await downloadZip(await api(`/exports/crab/${c.id}`), `${c.name.replace(/\W+/g, "-")}-skill.zip`); setMsg(`${c.name} skill downloaded.`); }
    catch (e) { setMsg(e.message); }
  };
  const workflowZip = async () => {
    try {
      await api("/exports/entitlement");
      const p = PRESETS.find(x => x.id === preset);
      await downloadZip(exportBundle(synthesize(p.objective)), `workflow-${p.id}.zip`);
      setMsg("Workflow bundle downloaded (runner.ts, browser-runner.ts, sources).");
    } catch (e) { setMsg(e.message); }
  };
  return (
    <Page testId="export-page">
      <Head eyebrow="Export" title="Take your skills home">Download real, runnable packages. They use your own keys from your environment; nothing is bundled.</Head>
      {!pro && <Notice testId="export-pro-notice">Exports are a Pro feature. Upgrade on the Pricing page.</Notice>}
      <Notice testId="export-message">{msg}</Notice>
      <div className="grid two">
        <Card testId="crab-exports">
          <h3>Crab skills (Python + Playwright)</h3>
          {crabs.map(c => (
            <div key={c.id} className="adapter-row">
              <Crab size={44} color={c.color} accent={c.accent} accessory={c.accessory} /><b className="grow">{c.name}</b>
              <Btn kind="ghost" disabled={!pro} onClick={() => crabZip(c)} testId={`export-crab-${c.id}`}><Download size={15} /> ZIP</Btn>
            </div>
          ))}
          {!crabs.length && <p className="muted">Build a crab first.</p>}
        </Card>
        <Card testId="workflow-exports">
          <h3>Workflow bundle (TypeScript)</h3>
          <select value={preset} onChange={e => setPreset(e.target.value)} data-testid="export-preset-select">{PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <p className="muted">runner.ts, browser-runner.ts, the original Venice runner and the live source modules.</p>
          <Btn disabled={!pro} onClick={workflowZip} testId="export-workflow-btn"><Download size={15} /> Download bundle</Btn>
        </Card>
      </div>
    </Page>
  );
}
