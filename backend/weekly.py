from datetime import datetime, timedelta, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pymongo.errors import DuplicateKeyError

from auth import current_user
from courses import COURSES
from db import db

router = APIRouter(prefix="/api")
EPOCH_MONDAY = datetime(1970, 1, 5, tzinfo=timezone.utc)
WEEK = timedelta(weeks=1)
SHORT = {"tidepool": "Tidepool", "kelp": "Kelp"}
TITLES = {"verified": "Weekly Champion", "self_reported": "Weekly Champion – Self-reported"}
LOOKBACK_WEEKS = 4


def week_index(dt: Optional[datetime] = None) -> int:
    return ((dt or datetime.now(timezone.utc)) - EPOCH_MONDAY) // WEEK


def week_start(n: int) -> datetime:
    return EPOCH_MONDAY + n * WEEK


def rotation_course(n: int) -> str:
    ids = sorted(COURSES)
    return ids[n % len(ids)]


def week_label(n: int, course_id: str) -> str:
    return f"{SHORT[COURSES[course_id]['theme']]} · Wk {week_start(n).isocalendar().week}"


async def course_for_week(n: int) -> str:
    doc = await db.featured_weeks.find_one({"_id": n})
    return doc["course_id"] if doc and doc.get("course_id") in COURSES else rotation_course(n)


async def note_featured(n: int, course_id: str, force: bool = False) -> None:
    await db.featured_weeks.update_one({"_id": n}, {"$set" if force else "$setOnInsert": {"course_id": course_id}}, upsert=True)


async def _winner(collection, query: dict) -> Optional[dict]:
    return await collection.find_one(query, sort=[("score.total", -1), ("score.elapsed_s", 1)])


async def award_week(n: int) -> None:
    """Idempotent: the first caller after the week closes claims the marker and stores the winners."""
    if n >= week_index() or await db.weekly_awards.find_one({"_id": n}):
        return
    try:
        await db.weekly_awards.insert_one({"_id": n, "at": datetime.now(timezone.utc).isoformat()})
    except DuplicateKeyError:
        return
    try:
        course = await course_for_week(n)
        lo, hi = week_start(n).isoformat(), week_start(n + 1).isoformat()
        champs = [str(c["_id"]) async for c in db.crabs.find({"is_champion": True}, {"_id": 1})]
        run = await _winner(db.runs, {"course_id": course, "status": "succeeded", "finished_at": {"$gte": lo, "$lt": hi},
                                      "champion_label": None, "crab_id": {"$nin": champs}, "score.total": {"$gt": 0}})
        att = await _winner(db.course_attempts, {"course_id": course, "run_id": None, "verified": True, "finished_at": {"$gte": lo, "$lt": hi}})
        base = {"week": n, "course_id": course, "label": week_label(n, course), "revoked": False, "awarded_at": datetime.now(timezone.utc).isoformat()}
        docs = []
        if run and run.get("user_id"):
            docs.append({**base, "category": "verified", "user_id": run["user_id"], "run_id": str(run["_id"]),
                         "score": run["score"]["total"], "elapsed_s": run["score"].get("elapsed_s")})
        if att and att.get("user_id"):
            docs.append({**base, "category": "self_reported", "user_id": att["user_id"], "attempt_id": str(att["_id"]),
                         "score": att["score"]["total"], "elapsed_s": att["score"].get("elapsed_s"), "agent_label": att.get("agent_label")})
        if docs:
            await db.weekly_badges.insert_many(docs)
    except Exception:
        await db.weekly_awards.delete_one({"_id": n})
        raise


async def ensure_awards() -> None:
    cur = week_index()
    for n in range(cur - LOOKBACK_WEEKS, cur):
        await award_week(n)


def badge_view(b: dict) -> dict:
    return {"id": str(b["_id"]), "week": b["week"], "course_id": b["course_id"], "label": b["label"], "category": b["category"],
            "title": TITLES[b["category"]], "score": b.get("score"), "elapsed_s": b.get("elapsed_s"),
            "tooltip": f"{TITLES[b['category']]} · {COURSES[b['course_id']]['name'].split('—')[-1].strip()} · week of {week_start(b['week']).date().isoformat()}"
                       f" · score {b.get('score')} in {b.get('elapsed_s')}s"}


async def badges_by_user(user_ids: list, course_id: Optional[str] = None) -> dict:
    q = {"user_id": {"$in": [u for u in user_ids if u]}, "revoked": False}
    if course_id:
        q["course_id"] = course_id
    out: dict = {}
    async for b in db.weekly_badges.find(q).sort("week", -1):
        out.setdefault(b["user_id"], []).append(badge_view(b))
    return out


async def winners_of(n: int) -> list:
    out = []
    async for b in db.weekly_badges.find({"week": n, "revoked": False}):
        user = await db.users.find_one({"_id": ObjectId(b["user_id"])}, {"name": 1}) if ObjectId.is_valid(b["user_id"]) else None
        name = ((user or {}).get("name") or "").strip()
        out.append({**badge_view(b), "winner": name.split()[0] if name and "@" not in name else "A racer"})
    return sorted(out, key=lambda b: b["category"] != "verified")


@router.get("/me/badges")
async def my_badges(user: dict = Depends(current_user)):
    await ensure_awards()
    return (await badges_by_user([str(user["_id"])])).get(str(user["_id"]), [])


@router.get("/badges/weekly")
async def recent_badges():
    await ensure_awards()
    weeks = sorted({b["week"] async for b in db.weekly_badges.find({"revoked": False}, {"week": 1})}, reverse=True)[:6]
    return [{"week": n, "winners": await winners_of(n)} for n in weeks]


@router.delete("/admin/badges/{badge_id}")
async def revoke_badge(badge_id: str, user: dict = Depends(current_user)):
    if user.get("role") != "admin":
        raise HTTPException(403, "Admins only")
    if not ObjectId.is_valid(badge_id):
        raise HTTPException(404, "Badge not found")
    res = await db.weekly_badges.update_one({"_id": ObjectId(badge_id)}, {"$set": {"revoked": True, "revoked_by": str(user["_id"]),
                                                                                  "revoked_at": datetime.now(timezone.utc).isoformat()}})
    if not res.matched_count:
        raise HTTPException(404, "Badge not found")
    return {"revoked": True}
