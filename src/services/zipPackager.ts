import { PROJECT_FILES } from "../generated/projectFiles";

/** The manifest is regenerated before dev/build from the repository text files. */
export function collectProjectFiles(): Record<string, string> {
  return { ...PROJECT_FILES };
}
export async function downloadFiles(files: Record<string, string>, filename: string, folder?: string): Promise<void> {
  const zip = new (await import("jszip")).default();
  const root = folder ? zip.folder(folder) : zip;
  if (!root) throw new Error("Unable to create ZIP root");
  for (const [p, c] of Object.entries(files)) root.file(p, c);
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
export async function downloadCompleteWorkspace(): Promise<void> {
  await downloadFiles(PROJECT_FILES, "nexusrelay-enterprise-vessel.zip", "nexus-relay");
}
