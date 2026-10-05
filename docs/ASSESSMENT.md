# Repository Assessment — October 2026

This document records what the repository does well, what was judged weak ("cheap looking,
lacking luster and interaction"), what has been rebuilt, and what should come next.

## What the repository does well

- **The core product is real.** Playwright runner, BYOK (Fernet) keys, adapter layer for
  Crab / Claude / OpenAI / Gemini / own-endpoint webhooks, scoring, leaderboards, tournaments,
  relay squads, invites, weekly badges, hall of champions — with tests behind the important paths.
- **The course concept is genuinely good.** Real-DOM obstacle courses are the right way to
  benchmark browser agents: no fake APIs, no shortcuts, human-playable, seed-varied per attempt.
- **Server-side truth.** Finish codes are minted and checked server-side; single-use, ordered
  station clearing, per-station nonces, decoy accounting. The game cannot be cheated from the DOM.

## What was weak

1. **Course pages looked like unstyled 2003 HTML** — default Georgia serif, muddy brown/olive
   flat fills, no hierarchy, no motion, no state feedback beyond a red text box. This is the first
   thing both human players and reviewers see, and it undercut the whole product.
2. **No interaction language** — buttons had no press/hover states, success and failure were not
   felt, progress was a row of flat chips.
3. **The frontend design system was flat** — decent tokens, but generic shadows, no focus language,
   no motion polish, uneven hover behaviour.
4. **Repository storytelling** — the README described a different app (NexusRelay) and referenced
   folders that do not exist; the PRD told the real story. Newcomers could not tell what to run.

## What was rebuilt

### Both obstacle courses — complete visual & interaction redesign

`backend/courses/obstacle-1/` (The Tidepool Gauntlet) and `backend/courses/kelp-2/`
(The Kelp Forest Circuit) now share one design system with two themes:

- **Design language**: travel-poster palette (golden-hour tidepool) and bioluminescent deep-sea
  (kelp); layered CSS/SVG scenery, zero external assets, system-font typography tuned for the
  fallback fonts headless Chromium actually has.
- **Persistent HUD**: brand lockup, live elapsed timer, decoy counter that ignites when traps are
  hit, and an animated trail map showing cleared / current / upcoming stations.
- **Interaction feel**: chunky press-states on every control, hover lifts, decoy shake + callout
  toast, "station cleared" stamp on success, flag/buoy animations at the finish, focus-visible
  rings, `prefers-reduced-motion` support throughout.
- **Contract preserved byte-for-byte**: `window.Course` API, `#course-config`, all station element
  ids, reveal/validation mechanics, and the notice-page classes used by `courses.py`.
- **Copy kept agent-exact**: every instruction still describes the mechanic precisely; only
  the presentation was rewritten.

### Frontend design system polish

`frontend/src/styles.css`: refined elevation and colour on cards/buttons/topbar, consistent
focus language, tabular numerals, custom scrollbars, selection and form-control polish, hover
lifts on list rows and picker cards, animated hero accents, and a global reduced-motion policy.

### Tooling

- `scripts/course-smoke.mjs` + `scripts/kelp_puzzles.py` — a jsdom interaction suite that renders
  every station exactly as `backend/courses.py` does and drives it like an agent would
  (30 checks: traps count decoys, scrolls reveal, validation advances, answers verify,
  finish codes appear). Run with `npm run course:smoke`.
- README rewritten to describe what is actually in the repository and how to run it.

## Verified

- `npm run course:smoke` — 30/30 green (both courses, real kelp puzzle fixtures from `backend/kelp.py`).
- Existing vitest suites and builds re-run after the changes.

## Recommended next steps

1. **More courses, faster** — the design system makes a third theme a one-layout job; variety is
   the biggest lever on benchmark value now.
2. **Step-level decoy attribution** in replays ("DECOY DODGED" callouts need per-step data).
3. **Real-key validation pass** for the computer-use adapters (needs user keys).
4. **Screenshot QA** — done on integration (Chromium available in the Emergent preview).
5. **Split the two apps** (or rename one) — the repo hosts two products; a monorepo layout with a
   clear `apps/` structure would remove the persistent confusion.

## Integration notes (Steps of Execution, 2026-10)

Brought in file by file (no git merge). To keep the benchmark fair and comparable:
- removed added hint text (door "Read the plaque twice", start "Marshal's note", tide/look-alike notes, scroll/crawl notes);
- removed the 520 ms advance delay — stations navigate immediately after a clear;
- HUD labels, footer and step numbers are CSS-generated / `aria-hidden`, so agent-visible text stays within ~1% of the old pages
  (body innerText 6,547 vs 6,474 chars across all 15 stations; crab observation JSON 13,487 vs 13,505);
- the element ids, `window.Course`, `#course-config` and `/api/course-attempts/*` contract are unchanged;
- jsdom is a yarn devDependency of `frontend/`; no npm lockfiles. Env vars are documented in the README (no example env file).
