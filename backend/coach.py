import statistics
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from adapters.relay import ROLE_NAMES
from arena_api import squad_assignments
from auth import current_user
from courses import COURSES, station_ids
from db import db
from relay_legs import visible_query

router = APIRouter(prefix="/api")
MIN_RUNS = 2


def segments(assign: dict, order: list) -> list:
    """Contiguous stations handled by one role, keyed like recorded relay legs (from_station -> baton station)."""
    segs: list = []
    for st in order:
        if segs and segs[-1]["role"] == assign.get(st):
            segs[-1]["stations"].append(st)
        else:
            segs.append({"role": assign.get(st), "stations": [st]})
    for k, s in enumerate(segs):
        s["from"], s["to"] = s["stations"][0], segs[k + 1]["stations"][0] if k + 1 < len(segs) else s["stations"][0]
    return segs


def avg(xs: list) -> Optional[float]:
    return round(sum(xs) / len(xs), 1) if xs else None


def station_times(run: dict, order: list) -> dict:
    """{station: (seconds, crab_id)} from the first step seen on each station to the first step on the next one."""
    first: dict = {}
    legs = {leg["index"]: leg.get("crab_id") for leg in run.get("legs", [])}
    for s in run.get("steps", []):
        st = next((x for x in order if f"/{x}?" in (s.get("url") or "") or (s.get("url") or "").endswith(f"/{x}")), None)
        if st and st not in first and s.get("at"):
            first[st] = (datetime.fromisoformat(s["at"]), legs.get(s.get("leg")) if s.get("leg") is not None else run.get("crab_id"))
    out = {}
    for i, st in enumerate(order[:-1]):
        if st in first and order[i + 1] in first:
            out[st] = ((first[order[i + 1]][0] - first[st][0]).total_seconds(), first[st][1])
    return out


async def crab_station_record(user: dict, crab_ids: list, course_id: str) -> dict:
    """{crab_id: {station: [seconds,...]}} from the user's visible solo + relay runs on this course."""
    order = station_ids(course_id)
    rec: dict = {c: {} for c in crab_ids}
    q = {"course_id": course_id, "status": {"$in": ["succeeded", "failed"]}, "$or": [{"user_id": str(user["_id"])}, {"is_public": True}],
         "$and": [{"$or": [{"crab_id": {"$in": crab_ids}}, {"legs.crab_id": {"$in": crab_ids}}]}]}
    async for run in db.runs.find(q, {"steps.url": 1, "steps.at": 1, "steps.leg": 1, "legs": 1, "crab_id": 1}).limit(200):
        for st, (secs, crab) in station_times(run, order).items():
            if crab in rec:
                rec[crab].setdefault(st, []).append(secs)
    return rec


def expected(rec: dict, stations: list) -> tuple[Optional[float], int]:
    if not all(len(rec.get(s, [])) >= MIN_RUNS for s in stations):
        return None, min((len(rec.get(s, [])) for s in stations), default=0)
    return round(sum(statistics.mean(rec[s]) for s in stations), 1), min(len(rec[s]) for s in stations)


@router.get("/squad/coach")
async def squad_coach(course_id: str = "obstacle-1", user: dict = Depends(current_user)):
    if course_id not in COURSES:
        raise HTTPException(404, "Course not found")
    uid, order = str(user["_id"]), station_ids(course_id)
    squad = await db.squads.find_one({"user_id": uid}) or {}
    slots = {r: c for r, c in (squad.get("slots") or {}).items() if c}
    assign = {k: v for k, v in squad_assignments(squad.get("assignments")).items() if k in order}
    crabs = {str(c["_id"]): c["name"] async for c in db.crabs.find({"_id": {"$in": [ObjectId(c) for c in slots.values() if ObjectId.is_valid(c)]}, "user_id": uid})}
    mine: dict = {}
    others: dict = {}
    async for run in db.runs.find({**await visible_query(user), "course_id": course_id}, {"legs": 1, "user_id": 1}).limit(200):
        bucket = mine if run.get("user_id") == uid else others
        for leg in run.get("legs", []):
            if leg.get("status") in ("passed", "finished") and leg.get("elapsed_s") is not None:
                bucket.setdefault((leg.get("role"), leg["from_station"], leg.get("to_station")), []).append(leg)
                if bucket is others:
                    bucket.setdefault((None, leg["from_station"], leg.get("to_station")), []).append(leg)
    legs = []
    for seg in segments(assign, order):
        m = mine.get((seg["role"], seg["from"], seg["to"]), [])
        o = others.get((None, seg["from"], seg["to"]), [])
        enough = len(m) >= MIN_RUNS and len(o) >= MIN_RUNS
        legs.append({"role": seg["role"], "role_name": ROLE_NAMES.get(seg["role"], seg["role"]), "stations": seg["stations"],
                     "from_station": seg["from"], "to_station": seg["to"], "crab_id": slots.get(seg["role"]), "crab_name": crabs.get(slots.get(seg["role"])),
                     "mine": {"n": len(m), "avg_time_s": avg([x["elapsed_s"] for x in m]), "avg_steps": avg([x.get("steps") or 0 for x in m])},
                     "others": {"n": len(o), "median_time_s": round(statistics.median([x["elapsed_s"] for x in o]), 1) if o else None,
                                "median_steps": statistics.median([x.get("steps") or 0 for x in o]) if o else None},
                     "enough": enough})
        if enough:
            legs[-1]["lost_s"] = round(legs[-1]["mine"]["avg_time_s"] - legs[-1]["others"]["median_time_s"], 1)
    ranked = sorted((leg for leg in legs if leg.get("lost_s", 0) > 0), key=lambda leg: -leg["lost_s"])
    if not ranked:
        status = "even" if any(leg["enough"] for leg in legs) else "not_enough"
        return {"course_id": course_id, "status": status, "legs": legs, "worst": None, "suggestion": None}
    worst = ranked[0]
    names = COURSES[course_id]["stations"]
    label = lambda s: next((x["name"] for x in names if x["id"] == s), s)  # noqa: E731
    worst["message"] = f"{worst['role_name']} leg on {', '.join(label(s) for s in worst['stations'])} loses {worst['lost_s']}s vs median"
    rec = await crab_station_record(user, list(crabs), course_id)
    current, cur_n = expected(rec.get(worst["crab_id"], {}), worst["stations"])
    best = None
    for role, crab_id in slots.items():
        if crab_id == worst["crab_id"] or crab_id not in crabs:
            continue
        exp, n = expected(rec.get(crab_id, {}), worst["stations"])
        if exp is not None and current is not None and exp < current and (best is None or exp < best["candidate_expected_s"]):
            best = {"crab_id": crab_id, "crab_name": crabs[crab_id], "role": role, "role_name": ROLE_NAMES[role], "stations": worst["stations"],
                    "candidate_expected_s": exp, "current_expected_s": current, "gain_s": round(current - exp, 1), "basis_runs": min(n, cur_n)}
    return {"course_id": course_id, "status": "ok", "legs": legs, "worst": worst, "suggestion": best,
            "suggestion_note": None if best else "None of your other squad crabs has at least 2 recorded runs on these stations that beat the current crab."}


BASELINE_N = 5
AFTER_MIN = 2


class ApplyBody(BaseModel):
    course_id: str = Field(max_length=60)
    stations: list[str] = Field(min_length=1, max_length=10)
    role: str = Field(pattern=r"^(scout|gate|extract|settle)$")


class UndoBody(BaseModel):
    history_id: str = Field(max_length=40)


async def leg_measure(uid: str, course_id: str, stations: list, after: Optional[str] = None, before: Optional[str] = None, last: Optional[int] = None) -> dict:
    """Server time and steps spent on these stations in the user's own relay runs within a time window."""
    order = station_ids(course_id)
    window = {k: v for k, v in (("$gt", after), ("$lt", before)) if v}
    q = {"user_id": uid, "course_id": course_id, "adapter": "relay", "status": {"$in": ["succeeded", "failed"]}, **({"created_at": window} if window else {})}
    cursor = db.runs.find(q, {"steps.url": 1, "steps.at": 1, "steps.leg": 1, "legs": 1, "crab_id": 1}).sort("created_at", -1 if last else 1).limit(last or 50)
    times, steps = [], []
    async for run in cursor:
        st = station_times(run, order)
        if all(x in st for x in stations):
            times.append(sum(st[x][0] for x in stations))
            steps.append(sum(1 for s in run.get("steps", []) if any(f"/{x}?" in (s.get("url") or "") for x in stations)))
    return {"n": len(times), "avg_time_s": avg(times), "avg_steps": avg(steps)}


@router.post("/squad/coach/apply", status_code=201)
async def apply_swap(body: ApplyBody, user: dict = Depends(current_user)):
    uid = str(user["_id"])
    advice = await squad_coach(body.course_id, user)
    s = advice.get("suggestion")
    if not s or s["stations"] != body.stations or s["role"] != body.role:
        raise HTTPException(409, "That swap is no longer the coach's current suggestion. Refresh the coach.")
    squad = await db.squads.find_one({"user_id": uid}) or {}
    assign = squad_assignments(squad.get("assignments"))
    from_role = assign.get(body.stations[0])
    now = datetime.now(timezone.utc).isoformat()
    doc = {"user_id": uid, "course_id": body.course_id, "kind": "swap", "stations": body.stations, "from_role": from_role, "to_role": body.role,
           "old_crab": {"id": advice["worst"]["crab_id"], "name": advice["worst"]["crab_name"]}, "new_crab": {"id": s["crab_id"], "name": s["crab_name"]},
           "at": now, "predicted_gain_s": s["gain_s"], "basis_runs": s["basis_runs"], "undone_at": None,
           "before": await leg_measure(uid, body.course_id, body.stations, before=now, last=BASELINE_N)}
    await db.squads.update_one({"user_id": uid}, {"$set": {"assignments": {**assign, **{st: body.role for st in body.stations}}}}, upsert=True)
    res = await db.coach_history.insert_one(doc)
    saved = await db.squads.find_one({"user_id": uid}, {"_id": 0, "user_id": 0})
    return {"history_id": str(res.inserted_id), "squad": saved}


@router.post("/squad/coach/undo", status_code=201)
async def undo_swap(body: UndoBody, user: dict = Depends(current_user)):
    uid = str(user["_id"])
    doc = await db.coach_history.find_one({"_id": ObjectId(body.history_id), "user_id": uid, "kind": "swap"}) if ObjectId.is_valid(body.history_id) else None
    if not doc:
        raise HTTPException(404, "Swap not found")
    if doc.get("undone_at"):
        raise HTTPException(409, "This swap was already undone.")
    now = datetime.now(timezone.utc).isoformat()
    squad = await db.squads.find_one({"user_id": uid}) or {}
    assign = squad_assignments(squad.get("assignments"))
    await db.squads.update_one({"user_id": uid}, {"$set": {"assignments": {**assign, **{st: doc["from_role"] for st in doc["stations"]}}}})
    await db.coach_history.update_one({"_id": doc["_id"]}, {"$set": {"undone_at": now}})
    await db.coach_history.insert_one({"user_id": uid, "course_id": doc["course_id"], "kind": "undo", "ref_id": str(doc["_id"]), "stations": doc["stations"],
                                       "from_role": doc["to_role"], "to_role": doc["from_role"], "old_crab": doc["new_crab"], "new_crab": doc["old_crab"], "at": now})
    return {"undone": True, "squad": await db.squads.find_one({"user_id": uid}, {"_id": 0, "user_id": 0})}


async def history_view(doc: dict) -> dict:
    out = {k: doc.get(k) for k in ("kind", "course_id", "stations", "from_role", "to_role", "old_crab", "new_crab", "at", "predicted_gain_s",
                                   "basis_runs", "before", "undone_at", "ref_id")}
    out["id"] = str(doc["_id"])
    if doc["kind"] != "swap":
        out["status"] = "undo"
        return out
    after = await leg_measure(doc["user_id"], doc["course_id"], doc["stations"], after=doc["at"], before=doc.get("undone_at"))
    out["after"] = after
    if after["n"] >= AFTER_MIN and doc["before"]["n"] >= 1:
        saved = round(doc["before"]["avg_time_s"] - after["avg_time_s"], 1)
        out["result"] = {"saved_s": saved, "runs": after["n"]}
        out["status"] = "undone" if doc.get("undone_at") else "improved" if saved > 0 else "worse"
    elif doc.get("undone_at"):
        out["status"] = "undone"
    else:
        out["status"] = "no_baseline" if doc["before"]["n"] < 1 else "pending"
    out["waiting"] = {"have": min(after["n"], AFTER_MIN), "need": AFTER_MIN}
    return out


@router.get("/squad/coach/history")
async def coach_history(course_id: str = "obstacle-1", user: dict = Depends(current_user)):
    return [await history_view(d) async for d in db.coach_history.find({"user_id": str(user["_id"]), "course_id": course_id}).sort("at", -1).limit(20)]
