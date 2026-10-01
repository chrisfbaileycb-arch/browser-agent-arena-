import html
import io
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, Response
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel, Field

from arena_api import origin_of, public_rate_limit
from auth import current_user, optional_user
from course_store import AGENT_NAMES, create_attempt, is_expired, public_view
from courses import COURSES
from db import db
from models import CourseAttempt
from platform_api import leaderboard
from security import rate_limit

router = APIRouter(prefix="/api")
INVITE_TTL = timedelta(days=14)
MAX_USES = 25
DAILY_INVITES = 30
EPOCH_MONDAY = datetime(1970, 1, 5, tzinfo=timezone.utc)


class InviteCreate(BaseModel):
    course_id: str = Field(default="obstacle-1", max_length=60)
    agent_kind: str = Field(default="copilot", pattern=r"^(copilot|comet|other)$")
    max_uses: int = Field(default=MAX_USES, ge=1, le=MAX_USES)


class FeaturedSet(BaseModel):
    course_id: Optional[str] = Field(default=None, max_length=60)


def display_name(user: Optional[dict]) -> str:
    name = ((user or {}).get("name") or "").strip()
    return (name.split()[0] if name and "@" not in name else "A rival")[:30]


def invite_status(inv: dict) -> str:
    if inv.get("revoked"):
        return "revoked"
    if datetime.now(timezone.utc).isoformat() > inv["expires_at"]:
        return "expired"
    return "full" if inv["uses"] >= inv["max_uses"] else "active"


async def time_to_beat(inv: dict) -> Optional[dict]:
    base = {"user_id": inv["user_id"], "course_id": inv["course_id"], "verified": True}
    for q in ({**base, "agent_kind": inv["agent_kind"]}, base):
        doc = await db.course_attempts.find_one(q, sort=[("score.elapsed_s", 1)])
        if doc:
            return {"elapsed_s": doc["score"]["elapsed_s"], "score": doc["score"]["total"],
                    "agent_label": "Harness-verified run" if doc.get("run_id") else doc.get("agent_label"), "self_reported": not doc.get("run_id")}
    return None


async def public_invite(inv: dict) -> dict:
    return {"slug": inv["slug"], "inviter": inv["inviter_name"], "course_id": inv["course_id"], "course": COURSES[inv["course_id"]]["name"],
            "agent_kind": inv["agent_kind"], "agent_label": AGENT_NAMES.get(inv["agent_kind"], "Other agent"), "status": invite_status(inv),
            "expires_at": inv["expires_at"], "uses_left": max(0, inv["max_uses"] - inv["uses"]), "time_to_beat": await time_to_beat(inv)}


async def find_invite(slug: str) -> dict:
    inv = await db.invites.find_one({"slug": slug[:20]})
    if not inv:
        raise HTTPException(404, "This challenge link doesn't exist.")
    return inv


@router.post("/invites", status_code=201)
async def create_invite(body: InviteCreate, user: dict = Depends(current_user)):
    uid = str(user["_id"])
    rate_limit("invite", uid, 5)
    if body.course_id not in COURSES:
        raise HTTPException(404, "Course not found")
    since = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    if await db.invites.count_documents({"user_id": uid, "created_at": {"$gt": since}}) >= DAILY_INVITES:
        raise HTTPException(429, f"You can create up to {DAILY_INVITES} challenge links per day.")
    now = datetime.now(timezone.utc)
    doc = {"slug": secrets.token_urlsafe(6), "user_id": uid, "inviter_name": display_name(user), "course_id": body.course_id,
           "agent_kind": body.agent_kind, "max_uses": body.max_uses, "uses": 0, "revoked": False,
           "created_at": now.isoformat(), "expires_at": (now + INVITE_TTL).isoformat()}
    res = await db.invites.insert_one(doc)
    return {"id": str(res.inserted_id), **await public_invite(doc)}


@router.get("/invites")
async def my_invites(user: dict = Depends(current_user)):
    out = []
    async for inv in db.invites.find({"user_id": str(user["_id"])}).sort("created_at", -1).limit(20):
        attempts = [a async for a in db.course_attempts.find({"invite_id": str(inv["_id"])}).sort("created_at", 1)]
        names = {str(u["_id"]): display_name(u) async for u in db.users.find({"_id": {"$in": [ObjectId(a["user_id"]) for a in attempts]}}, {"name": 1})}
        friends = [{"name": names.get(a["user_id"], "A rival"), "accepted_at": a["created_at"], "started": bool(a.get("started_at")),
                    "finished": bool(a.get("code")), "verified": bool(a.get("verified")), "submitted_at": a.get("submitted_at"),
                    "elapsed_s": (a.get("score") or {}).get("elapsed_s") if a.get("verified") else None,
                    "score": (a.get("score") or {}).get("total") if a.get("verified") else None} for a in attempts]
        out.append({"id": str(inv["_id"]), **await public_invite(inv), "uses": inv["uses"], "max_uses": inv["max_uses"], "created_at": inv["created_at"],
                    "counts": {"accepted": len(friends), "started": sum(f["started"] for f in friends), "finished": sum(f["verified"] for f in friends)},
                    "friends": friends})
    return out


@router.delete("/invites/{invite_id}")
async def revoke_invite(invite_id: str, user: dict = Depends(current_user)):
    if not ObjectId.is_valid(invite_id):
        raise HTTPException(404, "Invite not found")
    res = await db.invites.update_one({"_id": ObjectId(invite_id), "user_id": str(user["_id"])}, {"$set": {"revoked": True}})
    if not res.matched_count:
        raise HTTPException(404, "Invite not found")
    return {"revoked": True}


@router.post("/invites/{slug}/accept", status_code=201)
async def accept_invite(slug: str, user: dict = Depends(current_user)):
    uid = str(user["_id"])
    rate_limit("attempt", uid, 10)
    inv = await find_invite(slug)
    status = invite_status(inv)
    if inv["user_id"] == uid:
        raise HTTPException(409, "This is your own challenge. Share the link with a friend.")
    iid = str(inv["_id"])
    open_doc = await db.course_attempts.find_one({"invite_id": iid, "user_id": uid, "submitted_at": None}, sort=[("created_at", -1)])
    if open_doc and not is_expired(CourseAttempt.from_mongo(open_doc)):
        return public_view(CourseAttempt.from_mongo(open_doc))
    if status in ("revoked", "expired"):
        raise HTTPException(410, f"This challenge link has been {status}.")
    if not await db.course_attempts.find_one({"invite_id": iid, "user_id": uid}):
        res = await db.invites.update_one({"_id": inv["_id"], "revoked": False, "uses": {"$lt": inv["max_uses"]}}, {"$inc": {"uses": 1}})
        if not res.modified_count:
            raise HTTPException(409, "This challenge has reached its maximum number of players.")
    kind = inv["agent_kind"]
    return public_view(await create_attempt(db, inv["course_id"], AGENT_NAMES.get(kind) or "Other agent", user_id=uid, agent_kind=kind, invite_id=iid))


@router.get("/public/c/{slug}")
async def invite_landing(slug: str, request: Request, user: Optional[dict] = Depends(optional_user)):
    await public_rate_limit(request, "invite", 60)
    inv = await find_invite(slug)
    out = await public_invite(inv)
    out["is_inviter"] = bool(user and str(user["_id"]) == inv["user_id"])
    return out


@router.get("/public/c/{slug}/card", response_class=HTMLResponse)
async def invite_card(slug: str, request: Request):
    await public_rate_limit(request, "invite", 60)
    inv = await public_invite(await find_invite(slug))
    beat = f" Time to beat: {inv['time_to_beat']['elapsed_s']}s." if inv["time_to_beat"] else ""
    title = html.escape(f"{inv['inviter']} challenged you on {COURSES[inv['course_id']]['name'].split('—')[-1].strip()} | Browser Agent Arena")
    desc = html.escape(f"Run {inv['agent_label']} through a real browser obstacle course and submit your finish code.{beat}")
    origin, target = origin_of(request), f"/c/{slug}"
    img = f"{origin}/api/public/c/{slug}/og.png"
    return HTMLResponse(f"""<!doctype html><html><head><meta charset="utf-8"><title>{title}</title>
<meta property="og:type" content="website"><meta property="og:title" content="{title}"><meta property="og:description" content="{desc}">
<meta property="og:image" content="{img}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:url" content="{origin}{target}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{desc}"><meta name="twitter:image" content="{img}">
<meta http-equiv="refresh" content="0; url={target}"></head><body><a href="{target}">Accept the challenge</a></body></html>""")


@router.get("/public/c/{slug}/og.png")
async def invite_image(slug: str, request: Request):
    await public_rate_limit(request, "invite", 60)
    inv = await public_invite(await find_invite(slug))
    img = Image.new("RGB", (1200, 630), "#04303D" if inv["course_id"] == "kelp-2" else "#0A0820")
    d = ImageDraw.Draw(img)
    font = lambda s: ImageFont.load_default(size=s)  # noqa: E731
    d.rounded_rectangle((24, 24, 1176, 606), radius=40, outline="#FFD23F", width=6)
    d.text((80, 80), "BROWSER AGENT ARENA · CHALLENGE", fill="#FF9F1C", font=font(34))
    d.text((80, 150), f"{inv['inviter']} challenged you", fill="#FFFFFF", font=font(66))
    d.text((80, 250), COURSES[inv["course_id"]]["name"].split("—")[-1].strip(), fill="#7CF5E4", font=font(46))
    d.text((80, 330), f"Agent: {inv['agent_label']}", fill="#FFD23F", font=font(40))
    beat = inv["time_to_beat"]
    d.text((80, 470), f"Time to beat: {beat['elapsed_s']}s" if beat else "Be the first to set a time", fill="#FFFFFF", font=font(54))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return Response(buf.getvalue(), media_type="image/png", headers={"Cache-Control": "public, max-age=300"})


async def featured_course() -> tuple[str, str]:
    override = await db.settings.find_one({"_id": "featured"})
    if override and override.get("course_id") in COURSES:
        return override["course_id"], "override"
    ids = sorted(COURSES)
    return ids[((datetime.now(timezone.utc) - EPOCH_MONDAY) // timedelta(weeks=1)) % len(ids)], "rotation"


@router.get("/featured")
async def featured(request: Request):
    await public_rate_limit(request, "featured", 90)
    course_id, source = await featured_course()
    weeks = (datetime.now(timezone.utc) - EPOCH_MONDAY) // timedelta(weeks=1)
    rows = await leaderboard(course_id)
    best = next((r for r in rows if r["badge"] == "verified" and r.get("run_id")), None)
    c = COURSES[course_id]
    return {"course_id": course_id, "name": c["name"], "theme": c["theme"], "stations": len(c["stations"]), "source": source,
            "next_rotation_at": (EPOCH_MONDAY + (weeks + 1) * timedelta(weeks=1)).isoformat(), "top": rows[:5],
            "replay_run_id": best["run_id"] if best else None}


@router.put("/admin/featured")
async def set_featured(body: FeaturedSet, user: dict = Depends(current_user)):
    if user.get("role") != "admin":
        raise HTTPException(403, "Admins only")
    if body.course_id and body.course_id not in COURSES:
        raise HTTPException(404, "Course not found")
    await db.settings.update_one({"_id": "featured"}, {"$set": {"course_id": body.course_id}}, upsert=True)
    course_id, source = await featured_course()
    return {"course_id": course_id, "source": source}
