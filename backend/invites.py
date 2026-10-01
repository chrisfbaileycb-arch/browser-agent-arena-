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
from weekly import ensure_awards, note_featured, week_index, winners_of

router = APIRouter(prefix="/api")
INVITE_TTL = timedelta(days=14)
MAX_USES = 25
DAILY_INVITES = 30
EPOCH_MONDAY = datetime(1970, 1, 5, tzinfo=timezone.utc)


class InviteCreate(BaseModel):
    course_id: str = Field(default="obstacle-1", max_length=60)
    agent_kind: str = Field(default="copilot", pattern=r"^(copilot|comet|other)$")
    max_uses: int = Field(default=MAX_USES, ge=1, le=MAX_USES)


class AcceptBody(BaseModel):
    agent_kind: Optional[str] = Field(default=None, pattern=r"^(copilot|comet|other)$")


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
    if inv.get("fixed_beat"):
        return inv["fixed_beat"]
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
            "expires_at": inv["expires_at"], "uses_left": max(0, inv["max_uses"] - inv["uses"]), "time_to_beat": await time_to_beat(inv),
            "rematch_n": inv.get("rematch_n", 0), "is_rematch": bool(inv.get("parent_id")), "beat_margin_s": inv.get("beat_margin_s")}


async def result_for(inv: dict, uid: str) -> Optional[dict]:
    best = await db.course_attempts.find_one({"invite_id": str(inv["_id"]), "user_id": uid, "verified": True}, sort=[("score.elapsed_s", 1)])
    if not best:
        return None
    tt = await time_to_beat(inv)
    child = await db.invites.find_one({"parent_id": str(inv["_id"]), "user_id": uid}, {"slug": 1, "rematch_n": 1})
    elapsed = best["score"]["elapsed_s"]
    return {"elapsed_s": elapsed, "score": best["score"]["total"], "beat": bool(tt and elapsed < tt["elapsed_s"]),
            "margin_s": round(tt["elapsed_s"] - elapsed, 1) if tt else None, "rematch_slug": child["slug"] if child else None}


async def root_of(inv: dict) -> dict:
    for _ in range(60):
        if not inv.get("parent_id"):
            return inv
        parent = await db.invites.find_one({"_id": ObjectId(inv["parent_id"])})
        if not parent:
            return inv
        inv = parent
    return inv


async def round_of(inv: dict, invitee: str) -> dict:
    tt = await time_to_beat(inv)
    att = await db.course_attempts.find_one({"invite_id": str(inv["_id"]), "user_id": invitee, "verified": True}, sort=[("score.elapsed_s", 1)])
    t = att["score"]["elapsed_s"] if att else None
    out = {"n": inv.get("rematch_n", 0), "slug": inv["slug"], "course_id": inv["course_id"], "setter": inv["user_id"], "invitee": invitee,
           "setter_time_s": tt["elapsed_s"] if tt else None, "invitee_time_s": t, "winner": None, "margin_s": None}
    if t is None:
        out["status"] = "pending" if invite_status(inv) in ("active", "full") else "expired"
    else:
        win = tt is None or t < tt["elapsed_s"]
        out.update(status="done", winner=invitee if win else inv["user_id"], margin_s=round(abs(tt["elapsed_s"] - t), 1) if tt else None)
    return out


async def streak_for(root: dict, friend: str, viewer: str) -> Optional[dict]:
    a = root["user_id"]
    if viewer not in (a, friend):
        return None
    rounds, cur, invitee = [], root, friend
    while cur and len(rounds) < 50:
        rounds.append(await round_of(cur, invitee))
        nxt = await db.invites.find_one({"parent_id": str(cur["_id"]), "user_id": invitee})
        cur, invitee = nxt, cur["user_id"]
    names = {u: display_name(await db.users.find_one({"_id": ObjectId(u)}, {"name": 1})) for u in (a, friend)}
    other = friend if viewer == a else a
    done = [r for r in rounds if r["winner"]]
    score = {u: sum(r["winner"] == u for r in done) for u in (a, friend)}
    run = 0
    for r in reversed(done):
        if r["winner"] != done[-1]["winner"]:
            break
        run += 1
    margins = [r for r in done if r["margin_s"] is not None]
    big = max(margins, key=lambda r: r["margin_s"]) if margins else None
    label = lambda u: "You" if u == viewer else names[u]  # noqa: E731
    lead = "Tied" if score[viewer] == score[other] else f"{label(viewer if score[viewer] > score[other] else other)} lead{'' if score[viewer] > score[other] else 's'}"
    return {"you": score[viewer], "them": score[other], "them_name": names[other], "score_text": f"You {score[viewer]} – {score[other]} {names[other]}",
            "lead_text": f"{lead} {max(score.values())}–{min(score.values())}" if lead != "Tied" else f"Tied {score[viewer]}–{score[other]}",
            "streak_text": f"{label(done[-1]['winner'])} won the last {run}" if done else None,
            "biggest_margin": {"winner": label(big["winner"]), "margin_s": big["margin_s"], "round": big["n"]} if big else None,
            "rounds": [{**{k: r[k] for k in ("n", "slug", "course_id", "status", "margin_s", "setter_time_s", "invitee_time_s")},
                        "setter": label(r["setter"]), "invitee": label(r["invitee"]), "winner": label(r["winner"]) if r["winner"] else None} for r in rounds]}


async def streak_at(inv: dict, viewer: str) -> Optional[dict]:
    """Streak for the pair this invite belongs to, if the viewer is one of the two participants."""
    root = await root_of(inv)
    if inv.get("parent_id"):
        pair = {inv["user_id"], inv.get("target_user_id")}
        friend = next((u for u in pair if u != root["user_id"]), None)
    else:
        friend = viewer if viewer != root["user_id"] else None
    return await streak_for(root, friend, viewer) if friend else None


async def check_invite_limits(uid: str) -> None:
    rate_limit("invite", uid, 5)
    since = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    if await db.invites.count_documents({"user_id": uid, "created_at": {"$gt": since}}) >= DAILY_INVITES:
        raise HTTPException(429, f"You can create up to {DAILY_INVITES} challenge links per day.")


async def find_invite(slug: str) -> dict:
    inv = await db.invites.find_one({"slug": slug[:20]})
    if not inv:
        raise HTTPException(404, "This challenge link doesn't exist.")
    return inv


@router.post("/invites", status_code=201)
async def create_invite(body: InviteCreate, user: dict = Depends(current_user)):
    uid = str(user["_id"])
    if body.course_id not in COURSES:
        raise HTTPException(404, "Course not found")
    await check_invite_limits(uid)
    now = datetime.now(timezone.utc)
    doc = {"slug": secrets.token_urlsafe(6), "user_id": uid, "inviter_name": display_name(user), "course_id": body.course_id,
           "agent_kind": body.agent_kind, "max_uses": body.max_uses, "uses": 0, "revoked": False,
           "created_at": now.isoformat(), "expires_at": (now + INVITE_TTL).isoformat()}
    doc["fixed_beat"] = await time_to_beat(doc)
    res = await db.invites.insert_one(doc)
    return {"id": str(res.inserted_id), **await public_invite(doc)}


@router.get("/invites")
async def my_invites(user: dict = Depends(current_user)):
    out, uid = [], str(user["_id"])
    async for inv in db.invites.find({"$or": [{"user_id": uid}, {"target_user_id": uid}]}).sort("created_at", -1).limit(30):
        attempts = [a async for a in db.course_attempts.find({"invite_id": str(inv["_id"])}).sort("created_at", 1)]
        names = {str(u["_id"]): display_name(u) async for u in db.users.find({"_id": {"$in": [ObjectId(a["user_id"]) for a in attempts]}}, {"name": 1})}
        friends = [{"name": names.get(a["user_id"], "A rival"), "accepted_at": a["created_at"], "started": bool(a.get("started_at")),
                    "finished": bool(a.get("code")), "verified": bool(a.get("verified")), "submitted_at": a.get("submitted_at"),
                    "elapsed_s": (a.get("score") or {}).get("elapsed_s") if a.get("verified") else None,
                    "score": (a.get("score") or {}).get("total") if a.get("verified") else None} for a in attempts]
        children = {c["user_id"]: c async for c in db.invites.find({"parent_id": str(inv["_id"])}, {"slug": 1, "user_id": 1, "rematch_n": 1})}
        for f, a in zip(friends, attempts):
            c = children.get(a["user_id"])
            f["rematch"] = {"slug": c["slug"], "n": c.get("rematch_n")} if c else None
            f["streak"] = await streak_for(await root_of(inv), a["user_id"], uid) if not inv.get("parent_id") and c else None
        parent = await db.invites.find_one({"_id": ObjectId(inv["parent_id"])}, {"slug": 1}) if inv.get("parent_id") else None
        out.append({"id": str(inv["_id"]), **await public_invite(inv), "uses": inv["uses"], "max_uses": inv["max_uses"], "created_at": inv["created_at"],
                    "direction": "sent" if inv["user_id"] == uid else "received", "parent_slug": (parent or {}).get("slug"),
                    "streak": await streak_at(inv, uid) if inv.get("parent_id") else None,
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
async def accept_invite(slug: str, body: Optional[AcceptBody] = None, user: dict = Depends(current_user)):
    uid = str(user["_id"])
    rate_limit("attempt", uid, 10)
    inv = await find_invite(slug)
    status = invite_status(inv)
    if inv["user_id"] == uid:
        raise HTTPException(409, "This is your own challenge. Share the link with a friend.")
    if inv.get("target_user_id") and inv["target_user_id"] != uid:
        raise HTTPException(403, f"This rematch is reserved for the racer {inv['inviter_name']} challenged back.")
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
    kind = (body.agent_kind if body and body.agent_kind and inv.get("parent_id") else None) or inv["agent_kind"]
    return public_view(await create_attempt(db, inv["course_id"], AGENT_NAMES.get(kind) or "Other agent", user_id=uid, agent_kind=kind, invite_id=iid))


@router.get("/public/c/{slug}")
async def invite_landing(slug: str, request: Request, user: Optional[dict] = Depends(optional_user)):
    await public_rate_limit(request, "invite", 60)
    inv = await find_invite(slug)
    out = await public_invite(inv)
    out["is_inviter"] = bool(user and str(user["_id"]) == inv["user_id"])
    out["is_target"] = bool(user and str(user["_id"]) == inv.get("target_user_id"))
    out["reserved"] = bool(inv.get("target_user_id"))
    out["my_result"] = await result_for(inv, str(user["_id"])) if user else None
    out["streak"] = await streak_at(inv, str(user["_id"])) if user and (inv.get("parent_id") or out["my_result"]) else None
    return out


@router.post("/invites/{slug}/rematch", status_code=201)
async def send_rematch(slug: str, user: dict = Depends(current_user)):
    uid = str(user["_id"])
    inv = await find_invite(slug)
    res = await result_for(inv, uid)
    if not res or not res["beat"]:
        raise HTTPException(409, "A rematch unlocks only after your server-timed finish beats the time to beat.")
    existing = await db.invites.find_one({"parent_id": str(inv["_id"]), "user_id": uid})
    if existing:
        return {"id": str(existing["_id"]), **await public_invite(existing)}
    await check_invite_limits(uid)
    now = datetime.now(timezone.utc)
    best = await db.course_attempts.find_one({"invite_id": str(inv["_id"]), "user_id": uid, "verified": True}, sort=[("score.elapsed_s", 1)])
    doc = {"slug": secrets.token_urlsafe(6), "user_id": uid, "inviter_name": display_name(user), "course_id": inv["course_id"],
           "agent_kind": inv["agent_kind"], "max_uses": 1, "uses": 0, "revoked": False, "created_at": now.isoformat(),
           "expires_at": (now + INVITE_TTL).isoformat(), "parent_id": str(inv["_id"]), "rematch_n": inv.get("rematch_n", 0) + 1,
           "target_user_id": inv["user_id"], "beat_margin_s": res["margin_s"],
           "fixed_beat": {"elapsed_s": res["elapsed_s"], "score": res["score"], "agent_label": best.get("agent_label"), "self_reported": True}}
    result = await db.invites.insert_one(doc)
    return {"id": str(result.inserted_id), **await public_invite(doc)}


@router.get("/invites/inbox")
async def rematch_inbox(user: dict = Depends(current_user)):
    uid, out = str(user["_id"]), []
    async for inv in db.invites.find({"target_user_id": uid, "revoked": False}).sort("created_at", -1).limit(10):
        if invite_status(inv) != "active" or await db.course_attempts.find_one({"invite_id": str(inv["_id"]), "user_id": uid, "verified": True}):
            continue
        st = await streak_at(inv, uid)
        msg = f"{inv['inviter_name']} beat you by {inv.get('beat_margin_s')}s"
        if st:
            msg += f" · {st['lead_text']}"
        out.append({"slug": inv["slug"], "rematch_n": inv.get("rematch_n"), "course_id": inv["course_id"], "from": inv["inviter_name"],
                    "margin_s": inv.get("beat_margin_s"), "streak": st, "message": f"{msg} — rematch?"})
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
    return ids[week_index() % len(ids)], "rotation"


@router.get("/featured")
async def featured(request: Request):
    await public_rate_limit(request, "featured", 90)
    course_id, source = await featured_course()
    weeks = week_index()
    await note_featured(weeks, course_id)
    await ensure_awards()
    rows = await leaderboard(course_id)
    best = next((r for r in rows if r["badge"] == "verified" and r.get("run_id")), None)
    c = COURSES[course_id]
    return {"course_id": course_id, "name": c["name"], "theme": c["theme"], "stations": len(c["stations"]), "source": source,
            "next_rotation_at": (EPOCH_MONDAY + (weeks + 1) * timedelta(weeks=1)).isoformat(), "top": rows[:5],
            "replay_run_id": best["run_id"] if best else None, "last_week": await winners_of(weeks - 1)}


@router.put("/admin/featured")
async def set_featured(body: FeaturedSet, user: dict = Depends(current_user)):
    if user.get("role") != "admin":
        raise HTTPException(403, "Admins only")
    if body.course_id and body.course_id not in COURSES:
        raise HTTPException(404, "Course not found")
    await db.settings.update_one({"_id": "featured"}, {"$set": {"course_id": body.course_id}}, upsert=True)
    course_id, source = await featured_course()
    await note_featured(week_index(), course_id, force=True)
    return {"course_id": course_id, "source": source}
