import asyncio
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from bson import ObjectId  # noqa: E402
from bson.errors import InvalidId  # noqa: E402
from fastapi import APIRouter, Depends, FastAPI, HTTPException  # noqa: E402
from fastapi.responses import FileResponse, JSONResponse  # noqa: E402
import logging  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402
from starlette.middleware.cors import CORSMiddleware  # noqa: E402

from adapters import ADAPTERS  # noqa: E402
from arena_api import public_router, relay_profile, router as arena_router  # noqa: E402
from auth import current_user, is_pro, optional_user, router as auth_router, seed_users  # noqa: E402
from billing import router as billing_router  # noqa: E402
from course_api import router as course_router  # noqa: E402
from course_store import course_exists, create_attempt  # noqa: E402
from courses import COURSES  # noqa: E402
from db import client, db  # noqa: E402
from jev import jev_status  # noqa: E402
from endpoints import router as endpoints_router  # noqa: E402
from keys import PROVIDERS, KeyMissing, resolve_key, router as keys_router  # noqa: E402
from models import Run, RunCreate, SafetyRequest  # noqa: E402
from platform_api import router as platform_router  # noqa: E402
from quota import consume_execution  # noqa: E402
from runner import DATA_DIR, MAX_STEPS, TIMEOUT_S, execute_run  # noqa: E402
from safety import check_url  # noqa: E402
from security import rate_limit  # noqa: E402
from workflow import router as workflow_router  # noqa: E402

INTERNAL_BASE_URL = os.environ["INTERNAL_BASE_URL"]
TASKS: set[asyncio.Task] = set()

app = FastAPI(title="Steps of Execution — Browser Agent Arena API", version="1.0.0",
              openapi_url="/api/openapi.json", docs_url="/api/docs", redoc_url=None)
api = APIRouter(prefix="/api")


def to_oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(404, "Run not found")


def can_view(doc: dict, user: Optional[dict]) -> bool:
    return doc.get("is_public") or (user is not None and (doc.get("user_id") == str(user["_id"]) or user.get("role") == "admin"))


@api.get("/")
async def root():
    return {"service": "steps-of-execution", "product": "Browser Agent Arena"}


@api.get("/adapters")
async def list_adapters():
    return [a.info() for a in ADAPTERS.values()]


@api.get("/jev/status")
async def get_jev_status(user: Optional[dict] = Depends(optional_user)):
    return await jev_status(user)


@api.post("/safety/check")
async def safety_check(body: SafetyRequest, user: dict = Depends(current_user)):
    rate_limit("safety", str(user["_id"]), 20)
    return await check_url(body.url)


async def start_run(user: dict, body: RunCreate, public: bool = False, champion_label: Optional[str] = None) -> str:
    adapter = ADAPTERS.get(body.adapter)
    if not adapter:
        raise HTTPException(404, "Unknown agent adapter")
    if not adapter.status()["available"]:
        raise HTTPException(409, f"{adapter.name}: {adapter.status()['message']}")
    if adapter.tier == "champion" and not is_pro(user):
        raise HTTPException(402, "Champion agent runs need the Pro plan.")
    profile = {}
    if adapter.id == "relay":
        profile = await relay_profile(user)
        for leg_provider in {leg.get("provider") or "gemini" for leg in profile["legs"]}:
            try:
                await resolve_key(user, leg_provider)
            except KeyMissing as exc:
                raise HTTPException(412, str(exc))
    elif body.crab_id:
        crab = await db.crabs.find_one({"_id": to_oid(body.crab_id), "$or": [{"user_id": str(user["_id"])}, {"is_champion": True}]})
        if not crab:
            raise HTTPException(404, "Crab not found")
        profile = {k: crab.get(k) for k in ("name", "provider", "model", "personality", "system_prompt", "memory", "color", "accent", "accessory")}
    else:
        profile = {"name": adapter.name, **adapter.look}
    provider = adapter.required_provider(profile)
    if provider:
        try:
            found = await resolve_key(user, provider)
        except KeyMissing as exc:
            raise HTTPException(412, str(exc))
        if found["source"] != "user" and not adapter.platform_key_ok:
            raise HTTPException(412, f"{adapter.name} runs only on your own {PROVIDERS[provider]} key. Add it in My Keys.")
    if adapter.id == "own_endpoint" and not await db.agent_endpoints.find_one({"user_id": str(user["_id"])}):
        raise HTTPException(412, "Connect your agent endpoint in My Keys first.")
    model_name = profile.get("model") or adapter.info().get("model", "")
    run = Run(kind="course" if body.course_id else "url", adapter=adapter.id, user_id=str(user["_id"]), crab_id=body.crab_id, profile=profile,
              is_public=public, champion_label=champion_label, assertions=body.assertions, course_id=body.course_id, target_url="",
              display_url="", goal="", max_steps=MAX_STEPS, timeout_s=TIMEOUT_S, created_at=datetime.now(timezone.utc).isoformat(),
              model=f"{provider}/{model_name}".rstrip("/") if provider else "")
    if body.course_id:
        if not course_exists(body.course_id):
            raise HTTPException(404, "Course not found")
        run.goal = (body.goal or "").strip() or COURSES[body.course_id]["default_goal"]
        run.safety = {"allowed": True, "reason": "Hosted obstacle course (trusted internal page).", "category": "course"}
    else:
        run.safety = await check_url(body.url)
        if not run.safety["allowed"]:
            raise HTTPException(403, {"error": "url_blocked", **run.safety})
        run.goal, run.target_url, run.display_url = body.goal.strip(), run.safety["url"], run.safety["url"]
    if not public:
        await consume_execution(user, "browser_run")
    run_id = str((await db.runs.insert_one(run.to_mongo())).inserted_id)
    if body.course_id:
        attempt = await create_attempt(db, body.course_id, f"run:{adapter.id}", run_id, str(user["_id"]))
        path = f"/api/courses/{body.course_id}/start?a={attempt.id}"
        await db.runs.update_one({"_id": ObjectId(run_id)}, {"$set": {"attempt_id": attempt.id, "target_url": INTERNAL_BASE_URL + path, "display_url": path}})
    task = asyncio.create_task(execute_run(db, run_id))
    TASKS.add(task)
    task.add_done_callback(TASKS.discard)
    return run_id


@api.post("/runs", status_code=201)
async def create_run(body: RunCreate, user: dict = Depends(current_user)):
    rate_limit("runs", str(user["_id"]), 6)
    return {"id": await start_run(user, body), "status": "queued"}


@api.post("/admin/champion-runs", status_code=201)
async def champion_runs(course_id: str = "obstacle-1", user: dict = Depends(current_user)):
    """Admin-only: executes REAL runs for every champion crab; results become public replays."""
    if user.get("role") != "admin":
        raise HTTPException(403, "Admins only")
    ids = []
    async for crab in db.crabs.find({"is_champion": True, "user_id": str(user["_id"])}):
        ids.append(await start_run(user, RunCreate(course_id=course_id, crab_id=str(crab["_id"])), public=True, champion_label=crab["name"]))
    return {"runs": ids}


@api.get("/runs")
async def list_runs(limit: int = 20, user: dict = Depends(current_user)):
    cursor = db.runs.find({"user_id": str(user["_id"])}, {"steps": 0}).sort("created_at", -1).limit(min(limit, 100))
    return [Run.from_mongo(d).model_dump(exclude={"steps", "target_url"}) async for d in cursor]


@api.get("/replays")
async def replays(course_id: Optional[str] = None):
    query = {"is_public": True, "status": {"$in": ["succeeded", "failed"]}}
    if course_id:
        query["course_id"] = course_id
    cursor = db.runs.find(query, {"steps": 0}).sort("created_at", -1).limit(30)
    return [Run.from_mongo(d).model_dump(exclude={"steps", "target_url"}) async for d in cursor]


@api.get("/runs/{run_id}")
async def get_run(run_id: str, user: Optional[dict] = Depends(optional_user)):
    doc = await db.runs.find_one({"_id": to_oid(run_id)})
    if not doc or not can_view(doc, user):
        raise HTTPException(404, "Run not found")
    return Run.from_mongo(doc).model_dump(exclude={"target_url"})


class HintBody(BaseModel):
    text: str = Field(min_length=1, max_length=200)


@api.post("/runs/{run_id}/hint")
async def shout_hint(run_id: str, body: HintBody, user: dict = Depends(current_user)):
    rate_limit("hint", str(user["_id"]), 10)
    doc = await db.runs.find_one({"_id": to_oid(run_id), "user_id": str(user["_id"])}, {"status": 1, "adapter": 1, "steps_used": 1})
    if not doc:
        raise HTTPException(404, "Run not found")
    if doc["status"] not in ("queued", "running"):
        raise HTTPException(409, "This run has already finished.")
    if doc["adapter"] != "crab":
        raise HTTPException(409, "Only your own crab agents take coaching.")
    hint = {"at": datetime.now(timezone.utc).isoformat(), "text": body.text.strip(), "after_step": doc.get("steps_used", 0)}
    await db.runs.update_one({"_id": doc["_id"]}, {"$push": {"hints": hint, "pending_hints": hint["text"]}})
    return hint


@api.get("/runs/{run_id}/screenshots/{name}")
async def get_screenshot(run_id: str, name: str, user: Optional[dict] = Depends(optional_user)):
    doc = await db.runs.find_one({"_id": to_oid(run_id)}, {"is_public": 1, "user_id": 1})
    path = DATA_DIR / "runs" / run_id / name
    if not doc or not can_view(doc, user) or not re.fullmatch(r"[a-z0-9-]+\.jpg", name) or not path.is_file():
        raise HTTPException(404, "Screenshot not found")
    return FileResponse(path, media_type="image/jpeg")


for r in (api, arena_router, public_router, auth_router, keys_router, endpoints_router, billing_router, course_router, platform_router, workflow_router):
    app.include_router(r)
@app.middleware("http")
async def json_errors(request, call_next):
    # Registered before CORS so unexpected 500s still carry CORS headers (otherwise browsers report "Failed to fetch").
    try:
        return await call_next(request)
    except Exception:  # noqa: BLE001
        logging.getLogger("server").exception("Unhandled error on %s", request.url.path)
        return JSONResponse({"detail": "Something went wrong on our side. Please try again."}, status_code=500)


app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=os.environ["CORS_ORIGINS"].split(","),
                   allow_origin_regex=os.environ["CORS_ORIGIN_REGEX"],
                   allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"], allow_headers=["Content-Type", "Authorization"])


CHAMPIONS = [("Gemini Scuttler", "gemini", "gemini-3-flash-preview", "#12B5A5", "#FFD23F", "goggles", "quick and literal"),
             ("GPT Pincer", "openai", "gpt-5.4-mini", "#4D8BFF", "#FF9F1C", "headset", "methodical planner"),
             ("Claude Clawdia", "anthropic", "claude-sonnet-4-6", "#FF5A4E", "#FFF1D6", "crown", "careful reader of every sign")]


@app.on_event("startup")
async def startup():
    await seed_users()
    await db.rate_hits.create_index("at", expireAfterSeconds=120)
    await db.user_keys.create_index([("user_id", 1), ("provider", 1)], unique=True)
    await db.course_attempts.create_index([("course_id", 1), ("verified", 1)])
    admin = await db.users.find_one({"email": os.environ["ADMIN_EMAIL"]})
    for name, provider, model, color, accent, accessory, personality in CHAMPIONS:
        await db.crabs.update_one({"name": name, "is_champion": True}, {"$setOnInsert": {
            "user_id": str(admin["_id"]), "provider": provider, "model": model, "color": color, "accent": accent, "accessory": accessory,
            "personality": personality, "skills": ["scroll scouting", "decoy detection", "form filling"], "system_prompt": "", "xp": 0,
            "runs": 0, "wins": 0, "memory": [], "created_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    await db.runs.update_many({"status": {"$in": ["queued", "running"]}},
                              {"$set": {"status": "failed", "end_reason": "interrupted", "error": "Server restarted during run"}})
    await db.tournaments.update_many({"status": "running"}, {"$set": {"status": "failed", "error": "Server restarted during the tournament"}})


@app.on_event("shutdown")
async def shutdown():
    client.close()
