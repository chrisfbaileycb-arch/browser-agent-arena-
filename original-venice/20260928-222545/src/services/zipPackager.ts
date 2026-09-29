export function collectProjectFiles(): Record<string, string> {
  const out: Record<string, string> = {};
  const src = import.meta.glob("../**/*.{ts,tsx,css}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  for (const [k, v] of Object.entries(src)) out[k.replace(/^\.\.\//, "src/")] = v;
  return out;
}
export async function downloadCompleteWorkspace(files?: Record<string, string>): Promise<void> {
  const map = files && Object.keys(files).length ? files : collectProjectFiles();
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const root = zip.folder("nexus-relay");
  if (!root) throw new Error("zip root");
  for (const [p, c] of Object.entries(map)) root.file(p, c);
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "nexusrelay-enterprise-vessel.zip";
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
