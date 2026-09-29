# NexusRelay

NexusRelay is an **interactive agent development studio and browser agent arena**. Its first playable version lets visitors meet four specialist minds, design a simulated browser challenge, pit a solo agent against a relay squad, tune the squad, and export a TypeScript starter. It is an original product experiment informed by the creator's vision for a playful agent lab. The arena experience is the product; the fixture engine makes that experience repeatable while real integrations are still future work.

This is a single Vite/React/TypeScript project reconstructed from Venice chat exports. The maintained source is in `src/`, `server/`, and `tests/`. Two complete Venice code snapshots and its original standalone runner exporter are preserved verbatim in `original-venice/`; the chat text itself is excluded from this public repository.

## Run and verify

```bash
npm ci
npm test
npm run build
npm run dev
```

The Export view's **Download full source ZIP** button packages the source, original Venice snapshots, tests, server, configs, lockfile, and documentation. `scripts/generate-project-manifest.mjs` refreshes the embedded file list before `dev` and `build`; generated files are excluded from Git. The optional `server` script starts a local fixture endpoint at `127.0.0.1:8787`.

## What is implemented

- An original illustrated squad appears as collectible cards with peg slots, clear figure bubbles, and conceptual accessory wells. The warm play-set arena has four designed duels and eight research scenes. Visitors can inspect selectors, pause, step, replay, follow the handoff track, and read the trace. Browser pages and agent behavior are simulations, not live DOM or model sessions.
- **Challenge Studio** lets visitors edit page elements and selectors, mark decoys, arrange each lane's route, author a JSON extraction fixture, and set existence/equality success assertions. Invalid routes and data are rejected before launch. The draft is kept in the visitor's browser storage.
- **Squad Studio** offers eight objectives mapped to four specialist stages. Visitors edit each mind's name, prompt, score floor, and pruning budget, then run a local fixture simulation.
- The "Package your squad" view generates `runner.ts` using the original Venice exporter, with its Tavily request, optional Jev gateway call, and REST dispatch code unchanged. The package also includes the custom mission and workflow JSON and the browser adapter interfaces from the later studio. No credentials are bundled.
- A fixture corpus drives simulated research, token pruning, and simple field extraction. The in-studio REST stage creates a simulated `201` result in memory.
- The ten-trial harness produces simulated monolith and relay records for four enterprise scenarios. Its modeled failure times and dollar values are illustrative constants in code, not measured performance, current provider pricing, or billing.
- The ZIP button packages the repository's text files as of the last `dev` or `build` start.

## Product assessment

**Playable experimental studio, with a clear path to a deeper platform.** The custom duel can produce a solo win, relay win, or mutual failure based on authored routes and assertions. Built-in challenges are scripted examples; the benchmark still uses modeled assumptions. Neither demonstrates measured superiority of a real agent architecture. The local `Choice/Score/Noul` functions approximate gate behavior and are not TypeSafe AI's official Jev primitives.

The restored original runner contains live network call code, but its `TRANSFORMATION` stage does not populate the fields required by its next gate. With no credentials, it fails at that gate; supplying search credentials alone does not repair that missing transformation. It also retains its original local Jev fallback and example `.internal` REST destinations. Those limitations are in the Venice code as written. The arena and local vessel remain simulated. See `docs/RESTORED_VENICE_SOURCE.md` for the exact source locations and verification.

See `docs/EXTRACTION.md` for the reconstruction record.
