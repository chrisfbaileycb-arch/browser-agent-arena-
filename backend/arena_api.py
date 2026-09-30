import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from adapters import ADAPTERS
from auth import current_user, require_pro
from db import db
from models import RunCreate

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
    doc = await db.squads.find_one({"user_id": str(user["_id"])}, {"_id": 0, "user_id": 0})
    return doc or {"slots": {r: None for r in ROLES}, "formation": "1-2-1"}


@router.put("/squad")
async def save_squad(body: SquadBody, user: dict = Depends(current_user)):
    slots = {r: body.slots.get(r) or None for r in ROLES}
    for crab_id in filter(None, slots.values()):
        if not await db.crabs.find_one({"_id": to_oid(crab_id), "user_id": str(user["_id"])}):
            raise HTTPException(404, "Squad crabs must be your own crabs.")
    await db.squads.update_one({"user_id": str(user["_id"])}, {"$set": {"slots": slots, "formation": body.formation}}, upsert=True)
    return {"slots": slots, "formation": body.formation}
