# NexusRelay

NexusRelay is an **interactive agent development studio and browser agent arena**. Visitors meet four specialist minds, design a browser challenge, pit a solo agent against a relay squad, tune the squad, execute a live research workflow, and export a TypeScript runner. The visual arena remains an authored simulation; the live workflow uses actual provider calls.

This is a single Vite/React/TypeScript project reconstructed from Venice chat exports. The maintained source is in `src/`, `server/`, and `tests/`. Two complete Venice code snapshots and its original standalone runner exporter are preserved verbatim in `original-venice/`; the chat text itself is excluded from this public repository.

## Run and verify

```bash
npm ci
npm test
npm run build
npm run dev
```

For live execution, copy `.env.example` to `.env`, fill the Tavily, Gemini, and TypeSafe AI keys, and start `npm run server` in another terminal. The Vite dev server proxies `/api/workflow` and `/api/arena` to the workflow server at `127.0.0.1:8787`. In Squad Studio, **Run live workflow** calls the three providers. To dispatch after the gate passes, configure `WORKFLOW_WEBHOOK_URL_<INTENT>` and check **Send to configured destination**. The result shows provider errors, source citations, gate values, and the destination's actual status. Without the keys the live path reports missing configuration. The exported runner uses the same engine and reads keys from its process environment.

To run a real browser duel, run `npm run browser:install` on the server once. In Challenge Studio, enter a real `https://` URL, configure selectors and assertions, launch the mission, then choose **Run on live site** in the arena. Two separate Chromium contexts inspect and act on the opened page using Gemini; Jev evaluates fresh extracted values. The arena displays captured page images, events, actual prompt token counts returned by Gemini, and the gate outcomes. Built-in `.example` challenges remain illustrated play-set scenarios. A browser binary could not be downloaded in this execution workspace, so actual Chromium navigation has not been verified here; the code and orchestration tests pass.

The Export view's **Full source ZIP** button packages source, original Venice snapshots, tests, server, configs, lockfile, and documentation. `scripts/generate-project-manifest.mjs` refreshes the embedded file list before `dev`, `test`, and `build`; generated files are excluded from Git. Node 24 or newer is recommended for the server script's optional `.env` loading.

## What is implemented

- An original illustrated squad appears as collectible cards with peg slots, clear figure bubbles, and conceptual accessory wells. The warm play-set arena has four designed duels and eight research scenes. Visitors can inspect selectors, pause, step, replay, follow the handoff track, and read the trace. Browser pages and agent behavior are simulations, not live DOM or model sessions.
- **Challenge Studio** lets visitors edit page elements and selectors, mark decoys, arrange each illustrated lane's route, define an extraction shape, and set existence/equality success assertions. The live browser run uses these selectors and assertions against the real URL. The draft is kept in the visitor's browser storage.
- **Squad Studio** offers eight objectives mapped to Scout, Extractor, Gatekeeper, and Settlement. It executes Tavily search, Gemini structured extraction, TypeSafe Jev Choice/Score/Noul, and an optional configured REST dispatch. It also retains the local fixture run for the authored arena.
- The "Package your squad" view exports the full edited DAG with a runnable live `runner.ts`, a `browser-runner.ts` for authored missions, source modules, and the challenge and adapter interfaces. The original Venice runner is included unchanged as `venice-runner.ts`. No credentials are bundled.
- A fixture corpus drives simulated research, token pruning, and simple field extraction. The in-studio REST stage creates a simulated `201` result in memory.
- The ten-trial harness produces simulated monolith and relay records for four enterprise scenarios. Its modeled failure times and dollar values are illustrative constants in code, not measured performance, current provider pricing, or billing.
- The ZIP button packages the repository's text files as of the last `dev` or `build` start.

## Product assessment

**Playable experimental studio, with a clear path to a deeper platform.** The custom duel can produce a solo win, relay win, or mutual failure based on authored routes and assertions. Built-in challenges are scripted examples; the benchmark still uses modeled assumptions. Neither demonstrates measured superiority of a real agent architecture. The local `Choice/Score/Noul` functions approximate gate behavior and are not TypeSafe AI's official Jev primitives.

The original Venice runner lacked its `TRANSFORMATION` implementation. The new live runner adds that stage and uses a real Jev call and a destination configured per workflow intent. The original remains available for comparison. Live provider credentials have not been supplied to this repository, so provider integration has been verified with controlled HTTP responses rather than charged production calls. The visual play-set and local ten-trial benchmark still use their authored simulation engine; they do not claim measured agent performance. A separate Playwright browser path is implemented for live challenges, but Chromium could not be installed in this workspace. See `docs/RESTORED_VENICE_SOURCE.md` for the exact original source locations.

See `docs/EXTRACTION.md` for the reconstruction record.
