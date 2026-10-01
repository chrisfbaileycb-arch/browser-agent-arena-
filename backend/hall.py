from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

from arena_api import SHOT_RE, card_for, public_rate_limit, strip_run
from courses import COURSES
from db import db
from runner import DATA_DIR
from weekly import badge_view, ensure_awards, week_index, week_start

router = APIRouter(prefix="/api")


def first_name(user: Optional[dict]) -> str:
    name = ((user or {}).get("name") or "").strip()
    return name.split()[0][:30] if name and "@" not in name else "A racer"


async def entry_of(b: dict) -> dict:
    user = await db.users.find_one({"_id": ObjectId(b["user_id"])}, {"name": 1}) if ObjectId.is_valid(b["user_id"]) else None
    out = {**badge_view(b), "winner": first_name(user), "user_key": b["user_id"][-6:], "course": COURSES[b["course_id"]]["name"].split("—")[-1].strip(),
           "replay": False, "recording_url": None, "card": None, "look": None, "agent_label": b.get("agent_label")}
    if b["category"] == "verified" and b.get("run_id") and ObjectId.is_valid(b["run_id"]):
        run = await db.runs.find_one({"_id": ObjectId(b["run_id"])}, {"crab_id": 1, "profile": 1, "adapter": 1, "steps": {"$slice": 1}})
        if run:
            out["replay"] = True
            out["adapter"] = run.get("adapter")
            prof = run.get("profile") or {}
            out["look"] = {k: prof.get(k) for k in ("name", "color", "accent", "accessory")}
            crab = await db.crabs.find_one({"_id": ObjectId(run["crab_id"])}) if run.get("crab_id") and ObjectId.is_valid(run["crab_id"]) else None
            if crab:
                out["card"] = await card_for(crab)
    elif b.get("attempt_id") and ObjectId.is_valid(b["attempt_id"]):
        att = await db.course_attempts.find_one({"_id": ObjectId(b["attempt_id"])}, {"recording_url": 1})
        url = (att or {}).get("recording_url") or ""
        out["recording_url"] = url if url.startswith(("https://", "http://")) else None
    return out


@router.get("/hall")
async def hall(request: Request, course_id: Optional[str] = None, category: Optional[str] = None):
    await public_rate_limit(request, "hall", 60)
    await ensure_awards()
    all_badges = [b async for b in db.weekly_badges.find({"revoked": False}).sort([("week", -1), ("category", -1)])]
    crowns: dict = {}
    for b in all_badges:
        crowns[b["user_id"]] = crowns.get(b["user_id"], 0) + 1
    users = {str(u["_id"]): u async for u in db.users.find({"_id": {"$in": [ObjectId(u) for u in crowns if ObjectId.is_valid(u)]}}, {"name": 1})}
    reigning: dict = {}
    for b in all_badges:  # newest week first, "verified" sorts before "self_reported"
        reigning.setdefault(b["course_id"], {"week": b["week"], "badge_id": str(b["_id"]), "winner": first_name(users.get(b["user_id"])),
                                             "label": b["label"], "category": b["category"]})
    shown = [b for b in all_badges if (not course_id or b["course_id"] == course_id) and (not category or b["category"] == category)]
    return {"entries": [await entry_of(b) for b in shown[:60]],
            "stats": {"total_weeks": len({b["week"] for b in all_badges}),
                      "most_crowns": [{"winner": first_name(users.get(u)), "user_key": u[-6:], "crowns": n} for u, n in sorted(crowns.items(), key=lambda x: -x[1])[:5]],
                      "reigning": [{"course_id": c, **r} for c, r in reigning.items()]},
            "first_close_at": week_start(week_index() + 1).isoformat()}


async def hall_badge(badge_id: str) -> dict:
    b = await db.weekly_badges.find_one({"_id": ObjectId(badge_id), "revoked": False, "category": "verified"}) if ObjectId.is_valid(badge_id) else None
    run = await db.runs.find_one({"_id": ObjectId(b["run_id"])}) if b and b.get("run_id") and ObjectId.is_valid(b["run_id"]) else None
    if not run:
        raise HTTPException(404, "No replay for this champion")
    return run


@router.get("/hall/runs/{badge_id}")
async def hall_run(badge_id: str, request: Request):
    await public_rate_limit(request, "hall", 60)
    run = await hall_badge(badge_id)
    return strip_run(run, badge_id, f"/api/hall/runs/{badge_id}/screenshots")


@router.get("/hall/runs/{badge_id}/screenshots/{name}")
async def hall_shot(badge_id: str, name: str, request: Request):
    await public_rate_limit(request, "shots", 600)
    run = await hall_badge(badge_id)
    path = DATA_DIR / "runs" / str(run["_id"]) / name
    if not SHOT_RE.fullmatch(name) or not path.is_file():
        raise HTTPException(404, "Screenshot not found")
    return FileResponse(path, media_type="image/jpeg")
