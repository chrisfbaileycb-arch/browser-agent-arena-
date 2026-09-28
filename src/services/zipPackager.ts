import { PROJECT_FILES } from "../generated/projectFiles";

/** The manifest is regenerated before dev/build from the repository text files. */
export function collectProjectFiles(): Record<string, string> {
  return { ...PROJECT_FILES };
}
export async function downloadCompleteWorkspace(): Promise<void> {
  const zip = new (await import("jszip")).default();
  const root = zip.folder("nexus-relay");
  if (!root) throw new Error("Unable to create ZIP root");
  for (const [p, c] of Object.entries(PROJECT_FILES)) root.file(p, c);
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = "nexusrelay-enterprise-vessel.zip";
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
