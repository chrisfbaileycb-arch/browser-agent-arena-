# NexusRelay

NexusRelay is a **working simulation and UI prototype** recovered from Venice chat exports. It is a single Vite/React/TypeScript project with eight fixture-based workflow DAGs, eight research browser scenes, four scripted browser arena challenges, and four extended enterprise fixtures. The files in `src/`, `server/`, and `tests/` are the maintained version. The original chat export is retained separately in the delivered archive and is excluded from this public repository.

## Run and verify

```bash
npm ci
npm test
npm run build
npm run dev
```

The browser header's **Download Complete Workspace** button packages the source, tests, server, configs, lockfile, and documentation. `scripts/generate-project-manifest.mjs` refreshes the embedded file list before `dev` and `build`; generated files are excluded from Git and from the archive. The optional `server` script starts a local demo endpoint at `127.0.0.1:8787`.

## What is implemented

- Eight objective presets map to typed four-step DAGs with topological ordering and local schema/score/choice gates. Missing required data and a review decision stop progression.
- A fixture corpus drives research, token pruning, and simple field extraction. REST dispatch creates a simulated `201` result in memory.
- Four browser challenge scripts and eight research scenes drive animated lanes. The arena operates on scripted states, never a live browser DOM.
- The studio accepts a typed objective, synthesizes a DAG, and runs it with fixtures. The export view packages an executable **fixture runner** for that DAG.
- The ten-trial harness produces simulated monolith and relay records for four enterprise scenarios. Its modeled failure times and dollar values are illustrative constants in code, not measured performance, current provider pricing, or billing.
- The ZIP button packages the repository's text files as of the last `dev` or `build` start.

## Product assessment

**Workable interactive proof of concept; not a production automation product.** There is no Tavily network call, external Jev SDK/gateway connection, authenticated REST dispatch, live browser agent, human approval workflow, real regression benchmark, or credential storage. The local `Choice/Score/Noul` functions are this project's approximations and must not be represented as TypeSafe AI's official primitives. The arena and benchmark are scripted to favor Lane B; their metrics cannot establish that one real architecture outperforms another. The original export claimed a production-ready implementation, but the code did not support that claim and initially failed its TypeScript build.

Before operational use, choose and document provider contracts, put credentials and outbound integrations on a secured server, add explicit review and authorization for writes, replace fixtures with real sourced data, add rate limits and observability, and test with representative workflows. The procurement, security, compliance, pricing, and outage examples are demonstrations only. Do not make decisions or dispatch actions based on their fabricated sample data.

See `docs/EXTRACTION.md` for the reconstruction record.
