import asyncio
import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path

from bson import ObjectId
from playwright.async_api import async_playwright

from adapters import ADAPTERS, BrowserSession
from course_store import get_attempt, submit_code, verification_of
from jev import jev_gate
from keys import KeyMissing, resolve_key
from models import Run, Step
from safety import request_blocked
from scoring import score_run

logger = logging.getLogger("runner")
MAX_STEPS = int(os.environ["RUN_MAX_STEPS"])
TIMEOUT_S = float(os.environ["RUN_TIMEOUT_S"])
DATA_DIR = Path(os.environ["DATA_DIR"])
PUBLIC_URL = os.environ["FRONTEND_URL"]
SEM = asyncio.Semaphore(int(os.environ["MAX_CONCURRENT_RUNS"]))
CDP_URL = os.environ["BROWSER_CDP_URL"].strip()
NEEDS_CLOUD = ("This run needs a cloud browser connection: no local Chromium can start on this server. "
               "Ask the Arena admin to set BROWSER_CDP_URL to a hosted browser (e.g. Browserless).")
_probe = {"mode": None, "at": 0.0}
_probe_lock = asyncio.Lock()


class BrowserUnavailable(Exception):
    pass


async def _launch_local(pw):
    return await pw.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])


async def open_browser(pw):
    """CDP endpoint if configured, else local Chromium if it launches, else a clear error."""
    if CDP_URL:
        try:
            return await pw.chromium.connect_over_cdp(CDP_URL, timeout=20000)
        except Exception as exc:  # noqa: BLE001
            raise BrowserUnavailable(f"Could not reach the cloud browser at BROWSER_CDP_URL: {str(exc).splitlines()[0][:160]}")
    try:
        return await _launch_local(pw)
    except Exception as exc:  # noqa: BLE001
        logger.warning("local chromium failed to launch: %s", str(exc).splitlines()[0][:200])
        _probe.update(mode="unavailable", at=time.monotonic())
        raise BrowserUnavailable(NEEDS_CLOUD)


async def browser_mode(max_age_s: float = 300) -> str:
    if CDP_URL:
        return "cdp"
    async with _probe_lock:
        if _probe["mode"] and time.monotonic() - _probe["at"] < max_age_s:
            return _probe["mode"]
        try:
            async with async_playwright() as pw:
                await (await _launch_local(pw)).close()
            mode = "local"
        except Exception:  # noqa: BLE001
            mode = "unavailable"
        _probe.update(mode=mode, at=time.monotonic())
        return mode


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def guard(route):
    reason = await request_blocked(route.request.url)
    if reason:
        await route.abort("blockedbyclient")
    else:
        await route.continue_()


async def browse(db, run: Run, user: dict, oid: ObjectId, folder: Path, started: float) -> dict:
    adapter = ADAPTERS[run.adapter]
    remaining = lambda: run.timeout_s - (time.monotonic() - started)  # noqa: E731
    async with async_playwright() as pw:
        browser = await open_browser(pw)
        try:
            context = await browser.new_context(viewport={"width": 1280, "height": 800})
            if run.kind == "url":
                await context.route("**/*", guard)
            page = await context.new_page()

            async def screenshot(name: str) -> tuple[str, bytes]:
                shot = await page.screenshot(type="jpeg", quality=60)
                (folder / name).write_bytes(shot)
                return f"/api/runs/{oid}/screenshots/{name}", shot

            async def record(step: Step) -> None:
                await db.runs.update_one({"_id": oid}, {"$push": {"steps": step.model_dump()}, "$set": {"steps_used": step.n}})

            async def pull_hints() -> list:
                doc = await db.runs.find_one_and_update({"_id": oid, "pending_hints.0": {"$exists": True}}, {"$set": {"pending_hints": []}},
                                                        projection={"pending_hints": 1})
                return doc["pending_hints"] if doc else []

            await page.goto(run.target_url, wait_until="domcontentloaded", timeout=25000)
            session = BrowserSession(page=page, goal=run.goal, max_steps=run.max_steps, remaining=remaining, screenshot=screenshot,
                                     record=record, resolve_key=lambda p: resolve_key(user, p), profile=run.profile, user_id=run.user_id, pull_hints=pull_hints, run_id=str(oid),
                                     public_url=PUBLIC_URL + run.display_url if run.kind == "course" else run.target_url)
            try:
                outcome = await asyncio.wait_for(adapter.run(session), timeout=run.timeout_s + 10)
                end_reason, answer = outcome.end_reason, outcome.answer
            except asyncio.TimeoutError:
                end_reason, answer = "timeout", None
            if remaining() < 0:
                end_reason = "timeout"
            final_url, _ = await screenshot("final.jpg")
            return {"end_reason": end_reason, "agent_result": answer, "final_screenshot": final_url, "error": None}
        finally:
            await browser.close()


def check_assertions(answer: str, assertions: list[dict]) -> dict:
    try:
        payload = json.loads(answer[answer.index("{"):answer.rindex("}") + 1])
    except (ValueError, AttributeError):
        return {"passed": False, "violations": ["agent answer was not a JSON object"], "payload": None}
    violations = []
    for a in assertions:
        value = payload.get(a.get("field"))
        exists = value is not None
        ok = exists if a.get("operator") == "exists" else exists and str(value) == str(a.get("value"))
        if not ok:
            violations.append(f"{a.get('field')}: {'missing' if a.get('operator') == 'exists' else 'expected ' + str(a.get('value'))}")
    return {"passed": not violations, "violations": violations, "payload": payload}


async def evaluate(db, run: Run, out: dict, steps: int, elapsed: float) -> dict:
    if run.kind == "course":
        attempt = await get_attempt(db, run.attempt_id)
        if out["end_reason"] == "agent_done" and out["agent_result"]:
            verification = await submit_code(db, attempt, out["agent_result"], steps, elapsed)
        else:
            verification = verification_of(attempt)
        success = bool(verification["verified"])
        score = verification["score"] or score_run(False, steps, elapsed, attempt.decoys, len(attempt.cleared),
                                                   verification["stations_total"], run.max_steps, run.timeout_s)
        return {"status": "succeeded" if success else "failed", "score": score, "verification": verification}
    done = out["end_reason"] == "agent_done" and bool(out["agent_result"])
    verification = check_assertions(out["agent_result"] or "", run.assertions) if run.assertions and done else None
    success = done and (verification is None or verification["passed"])
    score = {**score_run(success, steps, elapsed, 0, 0, 0, run.max_steps, run.timeout_s), "verified": verification is not None}
    return {"status": "succeeded" if success else "failed", "score": score, "verification": verification}


async def update_crab(db, run: Run, result: dict, steps: int) -> None:
    if not run.crab_id:
        return
    score = (result.get("score") or {}).get("total", 0)
    inc = {"runs": 1, "xp": 10 + score, "wins": 1 if result["status"] == "succeeded" else 0}
    update = {"$inc": inc}
    if result["status"] == "succeeded":
        note = f"{run.course_id or run.display_url}: cleared in {steps} steps (score {score})"
        update["$push"] = {"memory": {"$each": [note], "$slice": -10}}
    await db.crabs.update_one({"_id": ObjectId(run.crab_id)}, update)


async def execute_run(db, run_id: str) -> None:
    oid = ObjectId(run_id)
    async with SEM:
        run = Run.from_mongo(await db.runs.find_one({"_id": oid}))
        user = await db.users.find_one({"_id": ObjectId(run.user_id)})
        folder = DATA_DIR / "runs" / run_id
        folder.mkdir(parents=True, exist_ok=True)
        started = time.monotonic()
        await db.runs.update_one({"_id": oid}, {"$set": {"status": "running", "started_at": now_iso()}})
        try:
            out = await browse(db, run, user, oid, folder, started)
        except BrowserUnavailable as exc:
            out = {"end_reason": "browser_unavailable", "agent_result": None, "final_screenshot": None, "error": str(exc)}
        except KeyMissing as exc:
            out = {"end_reason": "missing_key", "agent_result": None, "final_screenshot": None, "error": str(exc)}
        except Exception as exc:  # noqa: BLE001
            logger.exception("run %s failed", run_id)
            out = {"end_reason": "error", "agent_result": None, "final_screenshot": None, "error": str(exc).split("\n")[0][:300]}
        elapsed = time.monotonic() - started
        steps = (await db.runs.find_one({"_id": oid}, {"steps_used": 1})).get("steps_used", 0)
        try:
            result = await evaluate(db, run, out, steps, elapsed)
            doc = await db.runs.find_one({"_id": oid}, {"steps": {"$slice": -6}})
            result["jev"] = await jev_gate(user, {
                "goal": run.goal, "agent_answer": out["agent_result"], "end_reason": out["end_reason"], "steps_used": steps,
                "elapsed_s": round(elapsed, 1), "verification": {k: v for k, v in (result["verification"] or {}).items() if k != "payload"},
                "last_steps": [f"{s['action']} {s['target_label']} {'ok' if s['ok'] else s['detail']}" for s in doc.get("steps", [])]})
            await update_crab(db, run, result, steps)
        except Exception as exc:  # noqa: BLE001
            logger.exception("evaluation failed for run %s", run_id)
            result = {"status": "failed", "score": None, "verification": None}
            out["error"] = f"evaluation failed: {exc}"[:300]
        await db.runs.update_one({"_id": oid}, {"$set": {**out, **result, "elapsed_s": round(elapsed, 2), "finished_at": now_iso()}})
