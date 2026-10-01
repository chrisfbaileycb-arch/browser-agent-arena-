import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from bson import ObjectId
from bson.errors import InvalidId

from courses import COURSES, expected_answer, station_ids
from models import CourseAttempt
from scoring import score_run

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_RE = re.compile(r"SOE-[A-Z0-9]{4}-[A-Z0-9]{4}")


SELF_REPORT_TTL = timedelta(hours=2)
SUBMIT_GRACE = timedelta(hours=24)
MAX_BAD_CODES = 5
AGENT_NAMES = {"copilot": "Copilot", "comet": "Comet"}


class AttemptError(Exception):
    def __init__(self, message: str, status: int = 409):
        super().__init__(message)
        self.status = status


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def is_expired(attempt: CourseAttempt) -> bool:
    return bool(attempt.expires_at) and not attempt.code and now_iso() > attempt.expires_at


def _seconds_between(a: Optional[str], b: Optional[str]) -> Optional[float]:
    if not a or not b:
        return None
    return (datetime.fromisoformat(b) - datetime.fromisoformat(a)).total_seconds()


async def create_attempt(db, course_id: str, agent_label: str, run_id: Optional[str] = None, user_id: Optional[str] = None,
                         agent_kind: Optional[str] = None) -> CourseAttempt:
    expires = (datetime.now(timezone.utc) + SELF_REPORT_TTL).isoformat() if agent_kind else None
    attempt = CourseAttempt(course_id=course_id, agent_label=agent_label, run_id=run_id, user_id=user_id, created_at=now_iso(),
                            agent_kind=agent_kind, expires_at=expires, seed=secrets.token_hex(8),
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
                 "expired": is_expired(attempt), "server_elapsed_s": _round(_seconds_between(attempt.started_at, attempt.finished_at)),
                 "next_station": order[len(attempt.cleared)] if len(attempt.cleared) < len(order) else None,
                 "start_path": f"/api/courses/{attempt.course_id}/{order[0]}?a={attempt.id}"})
    return data


def _check(attempt: CourseAttempt, station: str, nonce: str) -> list[str]:
    order = station_ids(attempt.course_id)
    if station not in order or not secrets.compare_digest(attempt.nonces.get(station, ""), nonce):
        raise AttemptError("Invalid station token.")
    if attempt.code:
        raise AttemptError("This attempt is already finished.")
    if is_expired(attempt):
        raise AttemptError("This attempt link has expired. Start a new attempt.")
    if attempt.cleared != order[:order.index(station)]:
        raise AttemptError("Stations must be cleared in order.")
    return order


async def clear_station(db, attempt: CourseAttempt, station: str, nonce: str, answer: Optional[str] = None) -> dict:
    order = _check(attempt, station, nonce)
    at = now_iso()
    expected = expected_answer(attempt.course_id, attempt.seed, station)
    if expected is not None and (answer or "").strip().lower() != expected.lower():
        await db.course_attempts.update_one({"_id": ObjectId(attempt.id)}, {
            "$inc": {"decoys": 1}, "$push": {"events": {"type": "wrong_answer", "station": station, "at": at}}})
        raise AttemptError("Not quite. That answer doesn't match this station's instructions (counted as a decoy hit).")
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
    course = COURSES[attempt.course_id]
    score = score_run(verified, steps, elapsed, attempt.decoys, len(attempt.cleared), total, course["max_steps"], course["timeout_s"])
    fields = {"recording_url": recording_url, "submitted_code": code, "submitted_at": now_iso(), "verified": verified, "score": score}
    await db.course_attempts.update_one({"_id": ObjectId(attempt.id)}, {"$set": fields})
    return verification_of(attempt.model_copy(update=fields))


def _round(value: Optional[float]) -> Optional[float]:
    return round(value, 1) if value is not None else None


async def submit_self_report(db, attempt: CourseAttempt, submitted: str, reported: Optional[float], recording_url: Optional[str]) -> dict:
    if attempt.submitted_at:
        raise AttemptError("This attempt's finish code has already been used.")
    if not attempt.code:
        if is_expired(attempt):
            raise AttemptError("This attempt expired before reaching the finish flag. Start a new attempt.", 410)
        raise AttemptError("This attempt hasn't reached the finish flag yet, so no finish code exists for it.")
    if now_iso() > (datetime.fromisoformat(attempt.finished_at) + SUBMIT_GRACE).isoformat():
        raise AttemptError("The submission window for this attempt has closed.", 410)
    match = CODE_RE.search(submitted.upper())
    code = match.group(0) if match else submitted.strip()[:40]
    if not secrets.compare_digest(code.encode(), attempt.code.encode()):
        bad = attempt.failed_submits + 1
        update = {"$inc": {"failed_submits": 1}}
        if bad >= MAX_BAD_CODES:
            update["$set"] = {"submitted_at": now_iso(), "submitted_code": code, "verified": False}
        await db.course_attempts.update_one({"_id": ObjectId(attempt.id), "submitted_at": None}, update)
        left = MAX_BAD_CODES - bad
        raise AttemptError(f"Invalid finish code. {left} tries left." if left > 0 else "Invalid finish code. This attempt is now locked.", 422)
    elapsed = _seconds_between(attempt.started_at or attempt.created_at, attempt.finished_at)
    course = COURSES[attempt.course_id]
    score = score_run(True, None, elapsed, attempt.decoys, len(attempt.cleared), len(station_ids(attempt.course_id)), course["max_steps"], course["timeout_s"])
    fields = {"recording_url": recording_url, "submitted_code": code, "submitted_at": now_iso(), "verified": True, "score": score,
              "reported_elapsed_s": reported}
    result = await db.course_attempts.update_one({"_id": ObjectId(attempt.id), "submitted_at": None}, {"$set": fields})
    if result.modified_count != 1:
        raise AttemptError("This attempt's finish code has already been used.")
    return {**verification_of(attempt.model_copy(update=fields)), "server_elapsed_s": _round(elapsed), "reported_elapsed_s": reported}


def verification_of(attempt: CourseAttempt) -> dict:
    total = len(station_ids(attempt.course_id))
    return {"attempt_id": attempt.id, "course_id": attempt.course_id, "stations_cleared": len(attempt.cleared),
            "stations_total": total, "cleared": attempt.cleared, "decoys": attempt.decoys, "finished": bool(attempt.code),
            "code_issued": attempt.code if attempt.submitted_at else None, "submitted_code": attempt.submitted_code,
            "verified": attempt.verified, "score": attempt.score}


def course_exists(course_id: str) -> bool:
    return course_id in COURSES
