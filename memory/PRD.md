# Steps of Execution / Browser Agent Arena — PRD

## Original problem statement
Build a full-stack platform (FARM: FastAPI + React(Vite) + MongoDB) where custom browser agents ("crabs") and third-party computer-use agents (Claude, OpenAI, Gemini) race real, agent-readable HTML obstacle courses via Playwright. BYOK (Fernet-encrypted user keys: Anthropic, OpenAI, Gemini, OpenRouter, Tavily); the platform never pays for runs. Stripe subscriptions (Free = 1 run, Pro = unlimited). Bold, animated design with procedural 3D toon crabs (react-three-fiber) that animate idle/walk/snap/celebrate/stumble. Pages: Home, Arena, Course, Crab Builder, Workflow Lab, Challenge Studio, Leaderboard, Tutorials, Export, Keys, Pricing. SSRF + blocklist safety.
Design reference (later): a sports-broadcast spectator arena (3D stadium, HUD scoreboard, minimap, coach command bar, callouts, tournament bracket, squad card, night-stadium Home hero + carousel), with no copied branding. Course pages stay real DOM.

## Personas
- Agent builders racing their own crabs; AI enthusiasts comparing computer-use models; spectators watching replays.

## Architecture
- backend: server.py (runs, hints, CORS, JSON-error middleware), auth.py (JWT cookies SameSite=None + body tokens, Emergent Google), adapters/ (crab, computer_use: Claude/OpenAI/Gemini + OwnEndpoint webhook), arena_api.py (stats, tournaments, squad), endpoints.py (webhook CRUD), runner.py (Playwright, pull_hints), course_api/course_store (real station pages + verified finish codes), keys.py (BYOK), billing.py (Stripe).
- frontend: api.js (same-origin on Emergent hosts, Bearer fallback), auth.jsx (OAuth callback before guards), components: Crab3D (toon + rim + gloss shader), Stadium3D, Broadcast (HUD, callouts, coach, minimap), Tournament (bracket), SquadCard, EndpointCard, RunPlayer.

## Implemented
- 2026-09 (session 1): Full platform port, auth, BYOK, Stripe, Playwright runner, all 11 pages, first 3D crabs.
- 2026-09-30: Crab polish (toon ramp, fresnel rim, gloss, blink, run-reactive moods); Claude/OpenAI/Gemini computer-use adapters (user key only; verified with mocked providers); own-agent webhook (HMAC-signed); CORS/auth fixes (SameSite=None, token fallback, OAuth callback race, /login redirect for signed-in users, guest sign-in modal, same-origin API on Emergent hosts); broadcast stadium spectator view on Course + Arena; coach "Shout!" live hints (delivered to the crab, logged in trace); tournaments (2–8 entrants, real runs, bracket + champion card); squad card; night Home hero + stats bar + carousel.

## Backlog
- P1: Real-key validation of the computer-use adapters (needs user keys; model ids are in env CLAUDE_CU_MODEL / OPENAI_CU_MODEL / GEMINI_CU_MODEL).
- P1: Real Google login check by the user (only simulated in tests).
- P2: Public tournament spectating/sharing; step-level decoy detection for more accurate "DECOY DODGED" callouts; more courses.
