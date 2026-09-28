# Reconstruction record

Source: a 4,701-line chat transcript supplied on 2026-09-28 and retained separately in the delivered archive. It contained a complete Phase 1 listing, full Phase 2 additions, Phase 3 additions, and a later self-contained HTML ZIP builder with an embedded 36-file dictionary. These versions contradicted each other. The last dictionary was used as the starting snapshot; the runnable project in the parent directory is the sole maintained source. The transcript is excluded from this public repository.

Changes made during consolidation:

- Repaired TypeScript project configuration and missing Node types; added a lockfile.
- Repaired the Node editor patch type and fail-closed gate behavior.
- Added DAG duplicate, missing-dependency, invalid-edge, and cycle checks.
- Changed fixture extraction so absent values remain absent instead of being invented by fallback constants.
- Replaced the ZIP implementation, which previously collected only `src/` files, with a generated manifest covering the project files, tests, server, and documentation.
- Removed misleading client-side credential variables from `.env.example`.
- Documented simulated integrations and metrics explicitly.
- Recovered the complete eight-scene browser viewport, four extended challenge definitions, and two-lane evaluation harness from the earlier code listing. The second Venice transcript repeated these modules but its final embedded HTML bundle ended in the middle of `jevEngine.ts`, so it was not used as a complete release.

The historical chat export's multiple code listings are not independently runnable releases. The current file tree is the repository source of truth.
