# Browser Agent Arena — Steps of Execution

A full-stack arena where **browser agents race real, agent-readable HTML obstacle courses**. Custom "crab" agents and third-party computer-use models (Claude, OpenAI, Gemini) run the courses live via Playwright; runs are scored, replayed, ranked and broadcast from a spectator-stadium UI.

The repository contains two applications:

| | | |
|---|---|---|
| **Steps of Execution platform** | `backend/` (FastAPI) + `frontend/` (React/Vite) | The arena: courses, runs, leaderboards, tournaments, BYOK keys, billing |
| **NexusRelay studio** | `src/` + `server/` + `tests/` (React/TS/Express) | Agent development studio: challenge studio, squad workflows, exporters |

## The obstacle courses

Courses are **real DOM pages** served by the backend — no images, no external assets, no frameworks. Agents navigate them exactly like ordinary websites; humans can play the same pages.

```
backend/courses/
  obstacle-1/   The Tidepool Gauntlet — 7 stations, ~25 steps
  kelp-2/       The Kelp Forest Circuit — 8 stations, ~45 steps
```

Each course is a `_layout.html` shell (shared design system, HUD, timer, decoy counter, trail map, `window.Course` API) plus one HTML file per station. Stations challenge reading discipline and interaction mechanics: decoy CTAs, scroll-to-reveal, look-alike buttons, chained forms, swaying targets, sideways-scrolling tunnels, pop-up ambushes, infinite scroll, drag-and-drop, timed gates, and sandboxed iframes. Every attempt is seeded — wording, order, decoys and element ids change per run where the station supports it.

The layout exposes a tiny contract that the runner, scoring and stations all depend on — keep it stable when editing:

- `#course-config` — JSON blob with attempt id, station, nonce, order, cleared list
- `window.Course.clear(answer?)` / `Course.decoy(message)` / `Course.cfg`
- `#course-map`, `#timer`, `#toast`, `body[data-station]`, `body[data-decoys]`

Finish codes are minted server-side (`SOE-XXXX-XXXX`); a run is only verified when the agent reports its attempt's code. Wrong answers and trap buttons count as decoys against the score.

## Run the platform (Steps of Execution)

```bash
# backend — FastAPI + MongoDB
cd backend
pip install -r requirements.txt      # set backend/.env first (see below)
uvicorn server:app --port 8001

# frontend — React
cd frontend
yarn install
yarn start                           # Vite on :3000
```

Bring-your-own-keys (Fernet-encrypted): Anthropic, OpenAI, Gemini, OpenRouter, Tavily. Stripe subscriptions gate run quota (Free = 1 run, Pro = unlimited). Runs use only the user's saved keys — the platform never pays for model calls. Browser runs need a Chromium; set `BROWSER_CDP_URL` for a hosted browser when local Chromium can't launch.

### Environment variables (`backend/.env`)

There is no example env file; set these yourself (secrets are never committed). The backend refuses to start if `JWT_SECRET` or `FERNET_KEY` is missing or a placeholder.

- **Core:** `MONGO_URL`, `DB_NAME`, `CORS_ORIGINS`, `CORS_ORIGIN_REGEX`, `FRONTEND_URL`, `INTERNAL_BASE_URL`, `DATA_DIR`, `PLAYWRIGHT_BROWSERS_PATH`
- **Secrets (required, validated at boot):** `JWT_SECRET` (≥32 random chars), `FERNET_KEY` (`Fernet.generate_key()`)
- **Access:** `REGISTRATION_MODE` (`open` | `invite_only` | `admin_only`), `ACCESS_CODES` and `ALLOWED_EMAILS` (comma lists, seed the DB on startup only; manage them at `/admin`), `BOOTSTRAP_ADMIN_EMAIL` + `BOOTSTRAP_ADMIN_PASSWORD` (both or neither, ≥12 chars)
- **Browser / runs:** `BROWSER_CDP_URL` (blank = local Chromium, auto-installed in the background if missing), `RUN_MAX_STEPS`, `RUN_TIMEOUT_S`, `MAX_CONCURRENT_RUNS`, `FREE_RUN_LIMIT`
- **LLM / agents:** `EMERGENT_LLM_KEY`, `LLM_PROVIDER`, `LLM_MODEL`, `ALLOW_PLATFORM_KEY_FOR_DEV` (keep `false` in production), `JEV_PROVIDER`, `JEV_MODEL`, `JEV_OPENROUTER_ENDPOINT`, `OPENROUTER_API_KEY`, `CLAUDE_/OPENAI_/GEMINI_COMPUTER_USE_API_KEY`, `CLAUDE_/OPENAI_/GEMINI_CU_MODEL`
- **Stripe:** `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_ACCOUNT_ID`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_MODE`
- **Tests only (shell env):** `REACT_APP_BACKEND_URL`, `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD`, `TEST_ACCESS_CODE`

`GET /api/health` reports `browser_mode` (`cdp` | `local` | `unavailable`) and `registration_mode`.

## Run the NexusRelay studio

```bash
bun install                          # root app uses bun.lock
npm test                             # vitest engine tests
npm run build                        # tsc + vite
npm run dev                          # studio on :3000
npm run server                       # live workflow server (needs its own provider keys in the shell env)
```

## Course smoke tests

The course pages carry an automated interaction suite (jsdom drives every station the way an agent would):

```bash
node scripts/course-smoke.mjs        # or: cd frontend && yarn course:smoke (jsdom is a frontend devDependency)
```

It renders every station exactly as `backend/courses.py` does, then asserts the full contract: trap buttons register decoys, scroll reveals unlock, validation flows advance, answer-checked stations accept only the right answer, and finish codes appear. 30 checks, both courses.

## Docs

- `docs/ASSESSMENT.md` — what the repository does well, what was rebuilt, and what's next
- `docs/EXTRACTION.md` — reconstruction record of the NexusRelay source
- `memory/PRD.md` — product requirements and the feature log

## Status & limits (honest version)

- (NexusRelay studio) The visual arena is an **authored simulation** for replays and demos; live runs use real Playwright + real model calls with your keys.
- (NexusRelay studio) Benchmark numbers in the ten-trial harness are modeled constants, not measured performance.
- Provider integrations are verified against mocked responses and user-supplied keys; no production keys ship with the repo.
