from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from course_store import (AttemptError, clear_station, course_exists, create_attempt, get_attempt, hit_decoy,
                          public_view, submit_code)
from courses import COURSES, render_notice, render_station, station_ids
from auth import current_user
from db import db
from security import client_ip, rate_limit
from models import AttemptCreate, CodeSubmission, StationAction

router = APIRouter(prefix="/api")
NO_STORE = {"Cache-Control": "no-store"}


async def load_attempt(attempt_id: str):
    attempt = await get_attempt(db, attempt_id)
    if not attempt:
        raise HTTPException(404, "Attempt not found")
    return attempt


@router.get("/courses")
async def list_courses():
    return list(COURSES.values())


@router.get("/courses/{course_id}")
async def course_entry(course_id: str):
    if not course_exists(course_id):
        raise HTTPException(404, "Course not found")
    return RedirectResponse(f"/api/courses/{course_id}/start", status_code=302)


@router.get("/courses/{course_id}/{station}", response_class=HTMLResponse)
async def course_station(course_id: str, station: str, a: str = ""):
    if not course_exists(course_id) or station not in station_ids(course_id):
        raise HTTPException(404, "Station not found")
    order = station_ids(course_id)
    attempt = await get_attempt(db, a) if a else None
    if not attempt or attempt.course_id != course_id:
        if station == order[0]:
            attempt = await create_attempt(db, course_id, "anonymous")
            return RedirectResponse(f"/api/courses/{course_id}/{station}?a={attempt.id}", status_code=302)
        return HTMLResponse(render_notice(course_id, "No valid attempt", "Every run starts at the start line.",
                                          f"/api/courses/{course_id}/start", "Go to the start line"), headers=NO_STORE)
    expected = order[len(attempt.cleared)] if len(attempt.cleared) < len(order) else order[-1]
    if station != expected:
        return HTMLResponse(render_notice(course_id, "Out of order", f"Stations must be run in order. This attempt's next station is {expected}.",
                                          f"/api/courses/{course_id}/{expected}?a={attempt.id}", "Go to the correct station"), headers=NO_STORE)
    return HTMLResponse(render_station(course_id, station, attempt), headers=NO_STORE)


@router.post("/course-attempts", status_code=201)
async def new_attempt(body: AttemptCreate, user: dict = Depends(current_user)):
    rate_limit("attempt", str(user["_id"]), 10)
    if not course_exists(body.course_id):
        raise HTTPException(404, "Course not found")
    return public_view(await create_attempt(db, body.course_id, body.agent_label.strip(), user_id=str(user["_id"])))


@router.get("/course-attempts/{attempt_id}")
async def attempt_status(attempt_id: str):
    return public_view(await load_attempt(attempt_id))


@router.post("/course-attempts/{attempt_id}/clear")
async def attempt_clear(attempt_id: str, body: StationAction, request: Request):
    rate_limit("clear", client_ip(request), 120)
    try:
        return await clear_station(db, await load_attempt(attempt_id), body.station, body.nonce)
    except AttemptError as exc:
        raise HTTPException(409, str(exc))


@router.post("/course-attempts/{attempt_id}/decoy")
async def attempt_decoy(attempt_id: str, body: StationAction):
    try:
        return {"decoys": await hit_decoy(db, await load_attempt(attempt_id), body.station, body.nonce)}
    except AttemptError as exc:
        raise HTTPException(409, str(exc))


@router.post("/course-attempts/{attempt_id}/submit")
async def attempt_submit(attempt_id: str, body: CodeSubmission, user: dict = Depends(current_user)):
    rate_limit("submit", str(user["_id"]), 10)
    attempt = await load_attempt(attempt_id)
    if attempt.run_id or attempt.user_id != str(user["_id"]):
        raise HTTPException(403, "Only the owner of a self-reported attempt can submit its code.")
    return await submit_code(db, attempt, body.code, body.steps, recording_url=body.recording_url)
