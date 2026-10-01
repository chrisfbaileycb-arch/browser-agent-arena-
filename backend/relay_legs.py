from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse

from arena_api import SHOT_RE, clean_step, public_rate_limit
from auth import optional_user
from courses import COURSES, station_ids
from db import db
from runner import DATA_DIR

router = APIRouter(prefix="/api")


async def visible_query(user: Optional[dict]) -> dict:
    shared = {m.get(k) for t in await db.tournaments.find({"share_enabled": True}, {"rounds": 1}).to_list(200)
              for rnd in t["rounds"] for m in rnd for k in ("run_a", "run_b")}
    ors = [{"is_public": True}, {"_id": {"$in": [ObjectId(i) for i in shared if i and ObjectId.is_valid(i)]}}]
    if user:
        ors.append({"user_id": str(user["_id"])})
    return {"adapter": "relay", "status": {"$in": ["succeeded", "failed"]}, "$or": ors}


def covers(leg: dict, station: str, order: list) -> bool:
    if station not in order or leg.get("from_station") not in order:
        return False
    lo, hi = order.index(leg["from_station"]), order.index(leg.get("to_station") or leg["from_station"])
    return lo <= order.index(station) < hi or (lo == hi == order.index(station))


async def leg_decoys(run: dict, leg: dict) -> int:
    if not run.get("attempt_id") or not ObjectId.is_valid(run["attempt_id"]):
        return 0
    att = await db.course_attempts.find_one({"_id": ObjectId(run["attempt_id"])}, {"events": 1})
    end = leg.get("finished_at") or "9999"
    return sum(1 for e in (att or {}).get("events", []) if e.get("type") in ("decoy", "wrong_answer") and leg.get("started_at", "") <= e.get("at", "") <= end)


@router.get("/relay/legs")
async def compare_legs(request: Request, course_id: str = "obstacle-1", station: Optional[str] = None, role: Optional[str] = None,
                       user: Optional[dict] = Depends(optional_user)):
    await public_rate_limit(request, "relay-legs", 60)
    if course_id not in COURSES:
        raise HTTPException(404, "Course not found")
    order = station_ids(course_id)
    items = []
    async for run in db.runs.find({**await visible_query(user), "course_id": course_id}, {"steps": 0}).sort("created_at", -1).limit(60):
        for leg in run.get("legs", []):
            if (station and covers(leg, station, order)) or (role and leg.get("role") == role) or (not station and not role):
                items.append({"run_id": str(run["_id"]), "leg": leg["index"], "own": bool(user and run.get("user_id") == str(user["_id"])),
                              "created_at": run["created_at"], "decoys": await leg_decoys(run, leg),
                              "success": leg.get("status") in ("passed", "finished"),
                              **{k: leg.get(k) for k in ("role", "role_name", "name", "color", "accent", "accessory", "from_station", "to_station", "steps", "elapsed_s", "status")}})
    return {"course_id": course_id, "stations": order, "items": items[:40]}


async def visible_run(run_id: str, user: Optional[dict]) -> dict:
    run = await db.runs.find_one({**await visible_query(user), "_id": ObjectId(run_id)}) if ObjectId.is_valid(run_id) else None
    if not run:
        raise HTTPException(404, "Relay run not found")
    return run


@router.get("/relay/legs/{run_id}/{leg}")
async def leg_steps(run_id: str, leg: int, request: Request, user: Optional[dict] = Depends(optional_user)):
    await public_rate_limit(request, "relay-legs", 60)
    run = await visible_run(run_id, user)
    base = f"/api/relay/shots/{run_id}"
    return {"run_id": run_id, "leg": leg, "steps": [clean_step(s, base) for s in run.get("steps", []) if s.get("leg") == leg]}


@router.get("/relay/shots/{run_id}/{name}")
async def leg_shot(run_id: str, name: str, request: Request, user: Optional[dict] = Depends(optional_user)):
    await public_rate_limit(request, "shots", 600)
    await visible_run(run_id, user)
    path = DATA_DIR / "runs" / run_id / name
    if not SHOT_RE.fullmatch(name) or not path.is_file():
        raise HTTPException(404, "Screenshot not found")
    return FileResponse(path, media_type="image/jpeg")
