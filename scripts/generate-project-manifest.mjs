import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const excluded = new Set(["node_modules", "dist", ".git", "coverage", "generated"]);
const topFiles = ["package.json", "package-lock.json", "vite.config.ts", "vitest.config.ts", "tsconfig.json", "tsconfig.node.json", "tailwind.config.js", "postcss.config.js", "index.html", ".env.example", ".gitignore", "README.md"];
const files = {};
for (const filename of topFiles) files[filename] = await readFile(path.join(root, filename), "utf8");
async function walk(relative) {
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const name = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) await walk(name);
    else if (entry.isFile() && (/\.(?:ts|tsx|css|md|txt|mjs|json|js|html)$/.test(entry.name) || entry.name === "SHA256SUMS")) files[name] = await readFile(path.join(root, name), "utf8");
  }
}
for (const dir of ["src", "server", "tests", "scripts", "docs", "original-venice"]) await walk(dir);
const dest = path.join(root, "src/generated/projectFiles.ts");
await mkdir(path.dirname(dest), { recursive: true });
await writeFile(dest, "// Generated before dev/build. Edit the source files instead.\nexport const PROJECT_FILES: Record<string, string> = " + JSON.stringify(files) + ";\n");
const exportNames = [".env.example", "server/liveWorkflow.ts", "server/browserDuel.ts", "src/types.ts", "src/data/arenaChallenges.ts", "src/core/jevEngine.ts", "src/core/synthesizer.ts", "src/core/tavilyAdapter.ts"];
await writeFile(path.join(root, "src/generated/exportSources.ts"), "// Generated from the current live runner source.\nexport const EXPORT_SOURCES: Record<string, string> = " + JSON.stringify(Object.fromEntries(exportNames.map(name => [name, files[name]]))) + ";\n");
console.log(`ZIP manifest: ${Object.keys(files).length} project files`);
