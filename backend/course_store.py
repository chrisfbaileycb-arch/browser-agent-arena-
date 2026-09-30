import re
import secrets
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from bson.errors import InvalidId

from courses import COURSES, station_ids
from models import CourseAttempt
from scoring import score_run

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_RE = re.compile(r"SOE-[A-Z0-9]{4}-[A-Z0-9]{4}")
SUBMIT_MAX_STEPS = 25
SUBMIT_TIMEOUT_S = 90.0


class AttemptError(Exception):
    pass


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _seconds_between(a: Optional[str], b: Optional[str]) -> Optional[float]:
    if not a or not b:
        return None
    return (datetime.fromisoformat(b) - datetime.fromisoformat(a)).total_seconds()


async def create_attempt(db, course_id: str, agent_label: str, run_id: Optional[str] = None, user_id: Optional[str] = None) -> CourseAttempt:
    attempt = CourseAttempt(course_id=course_id, agent_label=agent_label, run_id=run_id, user_id=user_id, created_at=now_iso(),
                            nonces={s: secrets.token_urlsafe(8) for s in station_ids(course_id)})
    result = await db.course_attempts.insert_one(attempt.to_mongo())
    attempt.id = str(result.inserted_id)
    return attempt


async def get_attempt(db, attempt_id: str) -> Optional[CourseAttempt]:
    try:
        oid = ObjectId(attempt_id)
    except (InvalidId, TypeError):
        return None
    doc = await db.course_attempts.find_one({"_id": oid})
    return CourseAttempt.from_mongo(doc) if doc else None


def public_view(attempt: CourseAttempt) -> dict:
    order = station_ids(attempt.course_id)
    data = attempt.model_dump(exclude={"nonces", "code", "events"})
    data.update({"stations_total": len(order), "stations_cleared": len(attempt.cleared), "finished": bool(attempt.code),
                 "next_station": order[len(attempt.cleared)] if len(attempt.cleared) < len(order) else None,
                 "start_path": f"/api/courses/{attempt.course_id}/start?a={attempt.id}"})
    return data


def _check(attempt: CourseAttempt, station: str, nonce: str) -> list[str]:
    order = station_ids(attempt.course_id)
    if station not in order or not secrets.compare_digest(attempt.nonces.get(station, ""), nonce):
        raise AttemptError("Invalid station token.")
    if attempt.code:
        raise AttemptError("This attempt is already finished.")
    if attempt.cleared != order[:order.index(station)]:
        raise AttemptError("Stations must be cleared in order.")
    return order


async def clear_station(db, attempt: CourseAttempt, station: str, nonce: str) -> dict:
    order = _check(attempt, station, nonce)
    at = now_iso()
    update = {"$push": {"cleared": station, "events": {"type": "clear", "station": station, "at": at}}, "$set": {}}
    if station == order[0]:
        update["$set"]["started_at"] = at
    code = None
    if station == order[-1]:
        code = "SOE-" + "".join(secrets.choice(CODE_ALPHABET) for _ in range(4)) + "-" + "".join(secrets.choice(CODE_ALPHABET) for _ in range(4))
        update["$set"].update({"code": code, "finished_at": at})
    if not update["$set"]:
        del update["$set"]
    result = await db.course_attempts.update_one({"_id": ObjectId(attempt.id), "cleared": attempt.cleared, "code": None}, update)
    if result.modified_count != 1:
        raise AttemptError("Attempt changed concurrently; reload the station.")
    if code:
        return {"finished": True, "code": code}
    return {"finished": False, "next_path": f"/api/courses/{attempt.course_id}/{order[order.index(station) + 1]}?a={attempt.id}"}


async def hit_decoy(db, attempt: CourseAttempt, station: str, nonce: str) -> int:
    _check(attempt, station, nonce)
    await db.course_attempts.update_one({"_id": ObjectId(attempt.id)}, {
        "$inc": {"decoys": 1}, "$push": {"events": {"type": "decoy", "station": station, "at": now_iso()}}})
    return attempt.decoys + 1


async def submit_code(db, attempt: CourseAttempt, submitted: str, steps: Optional[int], elapsed: Optional[float] = None,
                      recording_url: Optional[str] = None) -> dict:
    if attempt.submitted_at:
        return {"already_submitted": True, **verification_of(attempt)}
    match = CODE_RE.search(submitted.upper())
    code = match.group(0) if match else submitted.strip()[:40]
    verified = bool(attempt.code) and secrets.compare_digest(code, attempt.code)
    total = len(station_ids(attempt.course_id))
    if elapsed is None:
        elapsed = _seconds_between(attempt.started_at or attempt.created_at, attempt.finished_at or now_iso()) or 0.0
    score = score_run(verified, steps, elapsed, attempt.decoys, len(attempt.cleared), total, SUBMIT_MAX_STEPS, SUBMIT_TIMEOUT_S)
    fields = {"recording_url": recording_url, "submitted_code": code, "submitted_at": now_iso(), "verified": verified, "score": score}
    await db.course_attempts.update_one({"_id": ObjectId(attempt.id)}, {"$set": fields})
    return verification_of(attempt.model_copy(update=fields))


def verification_of(attempt: CourseAttempt) -> dict:
    total = len(station_ids(attempt.course_id))
    return {"attempt_id": attempt.id, "course_id": attempt.course_id, "stations_cleared": len(attempt.cleared),
            "stations_total": total, "cleared": attempt.cleared, "decoys": attempt.decoys, "finished": bool(attempt.code),
            "code_issued": attempt.code if attempt.submitted_at else None, "submitted_code": attempt.submitted_code,
            "verified": attempt.verified, "score": attempt.score}


def course_exists(course_id: str) -> bool:
    return course_id in COURSES
