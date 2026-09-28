# NexusRelay

NexusRelay is an **interactive agent development studio and browser agent arena**. Its first playable version lets visitors meet four specialist minds, design a simulated browser challenge, pit a solo agent against a relay squad, tune the squad, and export a TypeScript starter. It is an original product experiment informed by the creator's vision for a playful agent lab. The arena experience is the product; the fixture engine makes that experience repeatable while real integrations are still future work.

This is a single Vite/React/TypeScript project reconstructed from Venice chat exports. The maintained source is in `src/`, `server/`, and `tests/`. The original chat export is excluded from this public repository.

## Run and verify

```bash
npm ci
npm test
npm run build
npm run dev
```

The Export view's **Download full source ZIP** button packages the source, tests, server, configs, lockfile, and documentation. `scripts/generate-project-manifest.mjs` refreshes the embedded file list before `dev` and `build`; generated files are excluded from Git and from the archive. The optional `server` script starts a local fixture endpoint at `127.0.0.1:8787`.

## What is implemented

- An original illustrated squad, large arena entry point, four designed duels, and eight research scenes form the visual world. The arena provides pause, step, replay, winner state, and a trace. The browser pages and agent behavior are simulations, not live DOM or model sessions.
- **Challenge Studio** lets visitors edit page elements and selectors, mark decoys, arrange each lane's route, author a JSON extraction fixture, and set existence/equality success assertions. Invalid routes and data are rejected before launch. The draft is kept in the visitor's browser storage.
- **Squad Studio** offers eight objectives mapped to four specialist stages. Visitors edit each mind's name, prompt, score floor, and pruning budget, then run a local fixture simulation.
- The export view packages the current squad and most recently launched custom mission into a modular TypeScript starter with browser, mind, and gate interfaces. Its runnable demo adapter uses fixture data. There are no bundled API keys or provider calls.
- A fixture corpus drives simulated research, token pruning, and simple field extraction. The in-studio REST stage creates a simulated `201` result in memory.
- The ten-trial harness produces simulated monolith and relay records for four enterprise scenarios. Its modeled failure times and dollar values are illustrative constants in code, not measured performance, current provider pricing, or billing.
- The ZIP button packages the repository's text files as of the last `dev` or `build` start.

## Product assessment

**Playable experimental studio, with a clear path to a deeper platform.** The custom duel can produce a solo win, relay win, or mutual failure based on authored routes and assertions. Built-in challenges are scripted examples; the benchmark still uses modeled assumptions. Neither demonstrates measured superiority of a real agent architecture. The local `Choice/Score/Noul` functions approximate gate behavior and are not TypeSafe AI's official Jev primitives.

The next product milestones are a canvas for changing squad topology, versioned/shareable challenges, genuine browser and model adapters, an optional Jev gate integration, and evidence-based duel replay and evaluation. A research provider could supply grounded observations through an adapter once its contract is chosen. The export deliberately leaves those connectors for developers to implement with their own credentials. The current arena does not execute edited squad prompts; those edits appear in the export. No live Tavily/research call, Jev gateway, authenticated dispatch, real browser agent, hosted user accounts, or community challenge publishing exists today.

See `docs/EXTRACTION.md` for the reconstruction record.
