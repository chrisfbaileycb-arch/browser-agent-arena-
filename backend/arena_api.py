import asyncio
import html
import io
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import FileResponse, HTMLResponse
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel, Field

from adapters import ADAPTERS
from adapters.relay import DEFAULT_ASSIGNMENTS, ROLE_NAMES
from auth import current_user, require_pro
from courses import COURSES
from db import db
from models import RunCreate
from runner import DATA_DIR
from security import client_ip

router = APIRouter(prefix="/api")
logger = logging.getLogger("tournaments")
ROLES = ("scout", "extract", "gate", "settle")
TASKS: set[asyncio.Task] = set()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def to_oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(404, "Not found")


class Entrant(BaseModel):
    crab_id: Optional[str] = Field(default=None, max_length=40)
    adapter: Optional[str] = Field(default=None, max_length=40)


class TournamentCreate(BaseModel):
    name: str = Field(default="Tidepool Cup", min_length=1, max_length=60)
    entrants: list[Entrant] = Field(min_length=2, max_length=8)


class SquadBody(BaseModel):
    slots: dict[str, Optional[str]]
    formation: str = Field(default="1-2-1", pattern=r"^(1-2-1|2-2|1-3)$")
    assignments: Optional[dict[str, str]] = None


def squad_assignments(raw: Optional[dict]) -> dict:
    merged = {**DEFAULT_ASSIGNMENTS, **{k: v for k, v in (raw or {}).items() if k in DEFAULT_ASSIGNMENTS and v in ROLES}}
    return merged


async def relay_profile(user: dict) -> dict:
    uid = str(user["_id"])
    squad = await db.squads.find_one({"user_id": uid}) or {}
    slots, assignments = squad.get("slots") or {}, squad_assignments(squad.get("assignments"))
    legs = []
    for role in [r for r in ROLES if r in assignments.values()]:
        crab = await db.crabs.find_one({"_id": to_oid(slots[role]), "user_id": uid}) if slots.get(role) else None
        if not crab:
            raise HTTPException(409, f"Your squad's {ROLE_NAMES[role]} slot is empty. Fill it on the squad card to start a relay.")
        legs.append({"role": role, "crab_id": str(crab["_id"]),
                     **{k: crab.get(k) for k in ("name", "provider", "model", "personality", "system_prompt", "memory", "color", "accent", "accessory")}})
    lead = next(leg for leg in legs if leg["role"] == assignments["start"])
    return {"name": "Squad Relay", "color": lead["color"], "accent": lead["accent"], "accessory": lead["accessory"], "legs": legs, "assignments": assignments}


def view(doc: dict) -> dict:
    return {"id": str(doc.pop("_id")), **doc}


@router.get("/stats")
async def stats():
    return {"crabs_registered": await db.crabs.count_documents({"is_champion": {"$ne": True}}), "goal": 1000,
            "runs": await db.runs.count_documents({})}


async def entrant_of(e: Entrant, user: dict) -> dict:
    if e.crab_id:
        crab = await db.crabs.find_one({"_id": to_oid(e.crab_id), "$or": [{"user_id": str(user["_id"])}, {"is_champion": True}]})
        if not crab:
            raise HTTPException(404, "Crab not found")
        return {"crab_id": e.crab_id, "adapter": "crab", "name": crab["name"], "champion": bool(crab.get("is_champion")),
                **{k: crab.get(k) for k in ("color", "accent", "accessory")}}
    adapter = ADAPTERS.get(e.adapter or "")
    if not adapter or adapter.id == "crab":
        raise HTTPException(422, "Each entrant needs a crab_id or a champion adapter id.")
    return {"crab_id": None, "adapter": adapter.id, "name": adapter.name, "champion": True, **adapter.look}


def bracket(entrants: list[dict]) -> list[list[dict]]:
    size = next(s for s in (2, 4, 8) if s >= len(entrants))
    seeds = entrants + [None] * (size - len(entrants))
    rounds, n = [], size
    while n > 1:
        rounds.append([{"a": None, "b": None, "run_a": None, "run_b": None, "score_a": None, "score_b": None, "winner": None, "error": None}
                       for _ in range(n // 2)])
        n //= 2
    for i, m in enumerate(rounds[0]):
        m["a"], m["b"] = seeds[2 * i], seeds[2 * i + 1]
    return rounds


async def wait_done(run_id: str) -> dict:
    while True:
        doc = await db.runs.find_one({"_id": ObjectId(run_id)}, {"steps": 0})
        if doc["status"] not in ("queued", "running"):
            return doc
        await asyncio.sleep(3)


def rank(doc: dict) -> tuple:
    return ((doc.get("score") or {}).get("total", 0), -(doc.get("steps_used") or 99))


async def play_match(tid: ObjectId, r: int, i: int, m: dict, user: dict) -> Optional[dict]:
    from server import start_run  # noqa: PLC0415 - server imports this router
    a, b = m["a"], m["b"]
    if not (a and b):
        return a or b
    key = f"rounds.{r}.{i}"
    try:
        ids = [await start_run(user, RunCreate(course_id="obstacle-1", crab_id=e["crab_id"], adapter=e["adapter"])) for e in (a, b)]
    except HTTPException as exc:
        await db.tournaments.update_one({"_id": tid}, {"$set": {f"{key}.error": str(exc.detail)[:200]}})
        return a
    await db.tournaments.update_one({"_id": tid}, {"$set": {f"{key}.run_a": ids[0], f"{key}.run_b": ids[1]}})
    ra, rb = await asyncio.gather(wait_done(ids[0]), wait_done(ids[1]))
    await db.tournaments.update_one({"_id": tid}, {"$set": {f"{key}.score_a": (ra.get("score") or {}).get("total", 0),
                                                            f"{key}.score_b": (rb.get("score") or {}).get("total", 0)}})
    return a if rank(ra) >= rank(rb) else b


async def run_tournament(tid: ObjectId, user: dict) -> None:
    try:
        rounds = (await db.tournaments.find_one({"_id": tid}))["rounds"]
        winner = None
        for r, matches in enumerate(rounds):
            for i, m in enumerate(matches):
                m = (await db.tournaments.find_one({"_id": tid}))["rounds"][r][i]
                winner = await play_match(tid, r, i, m, user)
                update = {f"rounds.{r}.{i}.winner": winner}
                if r + 1 < len(rounds):
                    update[f"rounds.{r + 1}.{i // 2}.{'a' if i % 2 == 0 else 'b'}"] = winner
                await db.tournaments.update_one({"_id": tid}, {"$set": update})
        await db.tournaments.update_one({"_id": tid}, {"$set": {"status": "done", "champion": winner, "finished_at": now_iso()}})
    except Exception as exc:  # noqa: BLE001
        logger.exception("tournament %s failed", tid)
        await db.tournaments.update_one({"_id": tid}, {"$set": {"status": "failed", "error": str(exc)[:200]}})


@router.post("/tournaments", status_code=201)
async def create_tournament(body: TournamentCreate, user: dict = Depends(require_pro)):
    if await db.tournaments.count_documents({"user_id": str(user["_id"]), "status": "running"}):
        raise HTTPException(409, "You already have a tournament in progress.")
    entrants = [await entrant_of(e, user) for e in body.entrants]
    doc = {"user_id": str(user["_id"]), "name": body.name, "status": "running", "entrants": entrants, "rounds": bracket(entrants),
           "champion": None, "created_at": now_iso()}
    tid = (await db.tournaments.insert_one(doc)).inserted_id
    task = asyncio.create_task(run_tournament(tid, user))
    TASKS.add(task)
    task.add_done_callback(TASKS.discard)
    return view(doc)


@router.get("/tournaments")
async def list_tournaments(user: dict = Depends(current_user)):
    return [view(d) async for d in db.tournaments.find({"user_id": str(user["_id"])}).sort("created_at", -1).limit(10)]


@router.get("/tournaments/{tournament_id}")
async def get_tournament(tournament_id: str, user: dict = Depends(current_user)):
    doc = await db.tournaments.find_one({"_id": to_oid(tournament_id), "user_id": str(user["_id"])})
    if not doc:
        raise HTTPException(404, "Tournament not found")
    return view(doc)


@router.get("/squad")
async def get_squad(user: dict = Depends(current_user)):
    doc = await db.squads.find_one({"user_id": str(user["_id"])}, {"_id": 0, "user_id": 0}) or {"slots": {r: None for r in ROLES}, "formation": "1-2-1"}
    return {**doc, "assignments": squad_assignments(doc.get("assignments"))}


@router.put("/squad")
async def save_squad(body: SquadBody, user: dict = Depends(current_user)):
    slots = {r: body.slots.get(r) or None for r in ROLES}
    for crab_id in filter(None, slots.values()):
        if not await db.crabs.find_one({"_id": to_oid(crab_id), "user_id": str(user["_id"])}):
            raise HTTPException(404, "Squad crabs must be your own crabs.")
    fields = {"slots": slots, "formation": body.formation, "assignments": squad_assignments(body.assignments)}
    await db.squads.update_one({"user_id": str(user["_id"])}, {"$set": fields}, upsert=True)
    return fields


# ---------- tournament sharing (public, read-only, sanitized) ----------
public_router = APIRouter(prefix="/api/public")
SHOT_RE = re.compile(r"[a-z0-9-]+\.jpg")


async def owned_tournament(tournament_id: str, user: dict) -> dict:
    doc = await db.tournaments.find_one({"_id": to_oid(tournament_id), "user_id": str(user["_id"])})
    if not doc:
        raise HTTPException(404, "Tournament not found")
    return doc


@router.post("/tournaments/{tournament_id}/share")
async def share_tournament(tournament_id: str, user: dict = Depends(current_user)):
    doc = await owned_tournament(tournament_id, user)
    slug = secrets.token_urlsafe(12)
    await db.tournaments.update_one({"_id": doc["_id"]}, {"$set": {"share_slug": slug, "share_enabled": True}})
    return {"slug": slug, "enabled": True, "views": doc.get("views", 0)}


@router.delete("/tournaments/{tournament_id}/share")
async def revoke_share(tournament_id: str, user: dict = Depends(current_user)):
    doc = await owned_tournament(tournament_id, user)
    await db.tournaments.update_one({"_id": doc["_id"]}, {"$set": {"share_enabled": False}, "$unset": {"share_slug": ""}})
    return {"slug": None, "enabled": False, "views": doc.get("views", 0)}


def clean_entrant(e: Optional[dict]) -> Optional[dict]:
    return {k: e.get(k) for k in ("name", "color", "accent", "accessory", "champion", "adapter")} if e else None


def clean_tournament(doc: dict) -> dict:
    rounds = [[{"a": clean_entrant(m["a"]), "b": clean_entrant(m["b"]), "run_a": m["run_a"], "run_b": m["run_b"], "score_a": m["score_a"],
                "score_b": m["score_b"], "winner": clean_entrant(m["winner"]), "error": "Match could not start" if m.get("error") else None}
               for m in rnd] for rnd in doc["rounds"]]
    return {"name": doc["name"], "status": doc["status"], "course": COURSES["obstacle-1"]["name"], "created_at": doc["created_at"],
            "finished_at": doc.get("finished_at"), "views": doc.get("views", 0), "champion": clean_entrant(doc.get("champion")),
            "entrants": [clean_entrant(e) for e in doc["entrants"]], "rounds": rounds}


async def public_rate_limit(request: Request, limit: int = 60, window_s: int = 60) -> None:
    # Stored in Mongo (TTL index) so the limit holds across backend replicas.
    key, now = f"public:{client_ip(request)}", datetime.now(timezone.utc)
    await db.rate_hits.insert_one({"key": key, "at": now})
    if await db.rate_hits.count_documents({"key": key, "at": {"$gt": now - timedelta(seconds=window_s)}}) > limit:
        raise HTTPException(429, f"Too many requests. Try again in {window_s}s.")


async def shared(slug: str, request: Request) -> dict:
    await public_rate_limit(request)
    doc = await db.tournaments.find_one({"share_slug": slug, "share_enabled": True})
    if not doc:
        raise HTTPException(404, "This shared tournament link is off or doesn't exist.")
    return doc


def run_in(doc: dict, run_id: str) -> bool:
    return any(run_id in (m.get("run_a"), m.get("run_b")) for rnd in doc["rounds"] for m in rnd)


def clean_step(s: dict, base: str) -> dict:
    station = re.search(r"/courses/([^/?]+)/([a-z]+)", s.get("url") or "")
    return {**{k: s.get(k) for k in ("n", "at", "action", "target_label", "value", "reasoning", "ok", "detail", "llm_ms", "leg", "role")},
            "url": f"/courses/{station.group(1)}/{station.group(2)}" if station else "",
            "screenshot": f"{base}/{s['screenshot'].rsplit('/', 1)[-1]}" if s.get("screenshot") else ""}


@public_router.get("/t/{slug}")
async def public_tournament(slug: str, request: Request):
    doc = await shared(slug, request)
    await db.tournaments.update_one({"_id": doc["_id"]}, {"$inc": {"views": 1}})
    doc["views"] = doc.get("views", 0) + 1
    return clean_tournament(doc)


@public_router.get("/t/{slug}/runs/{run_id}")
async def public_run(slug: str, run_id: str, request: Request):
    doc = await shared(slug, request)
    run = await db.runs.find_one({"_id": to_oid(run_id)}) if run_in(doc, run_id) else None
    if not run:
        raise HTTPException(404, "Run not found in this tournament")
    base = f"/api/public/t/{slug}/runs/{run_id}/screenshots"
    prof = run.get("profile") or {}
    return {"id": run_id, "kind": "course", "adapter": run["adapter"], "status": run["status"], "model": run.get("model"),
            "champion_label": run.get("champion_label"), "course_id": run.get("course_id"), "display_url": COURSES["obstacle-1"]["name"],
            "profile": {**{k: prof.get(k) for k in ("name", "color", "accent", "accessory")},
                        "legs": [{k: leg.get(k) for k in ("role", "name", "color", "accent", "accessory")} for leg in prof.get("legs", [])]},
            "steps": [clean_step(s, base) for s in run.get("steps", [])], "steps_used": run.get("steps_used", 0), "max_steps": run.get("max_steps"),
            "score": run.get("score"), "end_reason": run.get("end_reason"), "elapsed_s": run.get("elapsed_s"), "hints": [],
            "verification": {k: (run.get("verification") or {}).get(k) for k in ("verified", "stations_cleared", "stations_total", "decoys")},
            "legs": [{k: leg.get(k) for k in ("index", "role", "role_name", "name", "color", "status", "steps", "elapsed_s", "from_station", "to_station")}
                     for leg in run.get("legs", [])],
            "relay_failure": run.get("relay_failure"), "created_at": run["created_at"], "started_at": run.get("started_at"),
            "finished_at": run.get("finished_at"), "final_screenshot": f"{base}/final.jpg" if run.get("final_screenshot") else None, "is_public": True}


@public_router.get("/t/{slug}/runs/{run_id}/screenshots/{name}")
async def public_shot(slug: str, run_id: str, name: str, request: Request):
    doc = await shared(slug, request)
    path = DATA_DIR / "runs" / run_id / name
    if not run_in(doc, run_id) or not SHOT_RE.fullmatch(name) or not path.is_file():
        raise HTTPException(404, "Screenshot not found")
    return FileResponse(path, media_type="image/jpeg")


def origin_of(request: Request) -> str:
    return f"https://{request.headers.get('x-forwarded-host') or request.headers.get('host')}"


@public_router.get("/t/{slug}/card", response_class=HTMLResponse)
async def share_card(slug: str, request: Request):
    doc = await shared(slug, request)
    champ = (doc.get("champion") or {}).get("name")
    title = html.escape(f"{doc['name']} · {'Champion: ' + champ if champ else 'Live bracket'} | Browser Agent Arena")
    desc = html.escape(f"{len(doc['entrants'])} browser agents raced the {COURSES['obstacle-1']['name']}. Watch every duel replay.")
    origin, target = origin_of(request), f"/t/{slug}"
    return HTMLResponse(f"""<!doctype html><html><head><meta charset="utf-8"><title>{title}</title>
<meta property="og:type" content="website"><meta property="og:title" content="{title}"><meta property="og:description" content="{desc}">
<meta property="og:image" content="{origin}/api/public/t/{slug}/og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:url" content="{origin}{target}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{desc}"><meta name="twitter:image" content="{origin}/api/public/t/{slug}/og.png">
<meta http-equiv="refresh" content="0; url={target}"></head><body><a href="{target}">Open the bracket</a></body></html>""")


@public_router.get("/t/{slug}/og.png")
async def share_image(slug: str, request: Request):
    doc = await shared(slug, request)
    champ = doc.get("champion") or {}
    img = Image.new("RGB", (1200, 630), "#0A0820")
    d = ImageDraw.Draw(img)
    for i, c in enumerate(("#FF3DA5", "#8B5CF6", "#4D8BFF")):
        d.rounded_rectangle((24 + i * 4, 24 + i * 4, 1176 - i * 4, 606 - i * 4), radius=40, outline=c, width=4)
    font = lambda s: ImageFont.load_default(size=s)  # noqa: E731
    d.text((80, 80), "BROWSER AGENT ARENA", fill="#FF9F1C", font=font(34))
    d.text((80, 140), doc["name"].upper(), fill="#FFFFFF", font=font(64))
    d.text((80, 250), "CHAMPION" if champ else "BRACKET IN PROGRESS", fill="#7CF5E4", font=font(40))
    d.text((80, 310), champ.get("name", "To be decided"), fill="#FFD23F", font=font(84))
    d.text((80, 520), f"{len(doc['entrants'])} agents · {COURSES['obstacle-1']['name']}", fill="#BDB3E6", font=font(30))
    color = champ.get("color") or "#FF5A4E"
    d.ellipse((860, 190, 1100, 430), fill=color, outline="#FFFFFF", width=6)
    for x in (930, 1030):
        d.ellipse((x - 26, 250, x + 26, 302), fill="#FFFFFF")
        d.ellipse((x - 11, 266, x + 11, 288), fill="#1B1530")
    d.arc((930, 300, 1030, 380), 20, 160, fill="#1B1530", width=8)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return Response(buf.getvalue(), media_type="image/png", headers={"Cache-Control": "public, max-age=300"})
