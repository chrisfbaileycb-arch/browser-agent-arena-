import os
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

from db import db

router = APIRouter(prefix="/api")
EMAIL_RE = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


def registration_mode() -> str:
    return os.environ["REGISTRATION_MODE"]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _status(doc: dict) -> str:
    if doc.get("revoked"):
        return "revoked"
    if doc.get("expires_at") and doc["expires_at"] <= now_iso():
        return "expired"
    if doc.get("max_uses") is not None and doc.get("uses", 0) >= doc["max_uses"]:
        return "used_up"
    return "active"


def _view(doc: dict) -> dict:
    return {"id": str(doc.pop("_id")), **doc, "status": _status(doc)}


async def admit(email: str, code: Optional[str]) -> str:
    """Gate for brand-new accounts; records the use and returns how the user got in."""
    mode = registration_mode()
    if mode == "open":
        return "open"
    if mode == "admin_only":
        raise HTTPException(403, {"error": "registration_closed", "reason": "Sign-ups are closed right now. Ask the Arena admin to create your account."})
    live = {"revoked": {"$ne": True}, "$or": [{"expires_at": None}, {"expires_at": {"$gt": now_iso()}}]}
    if await db.access_emails.find_one_and_update({"email": email, **live}, {"$inc": {"uses": 1}, "$set": {"last_used_at": now_iso()}}):
        return "allow_list"
    code = (code or "").strip().upper()
    if code and await db.access_codes.find_one_and_update(
            {"code": code, **live, "$expr": {"$or": [{"$eq": [{"$ifNull": ["$max_uses", None]}, None]}, {"$lt": ["$uses", "$max_uses"]}]}},
            {"$inc": {"uses": 1}, "$set": {"last_used_at": now_iso()}}):
        return f"code:{code}"
    reason = "That access code is invalid, expired or used up." if code else "The Arena is in private beta. Enter an access code, or ask the admin to allow-list your email."
    raise HTTPException(403, {"error": "invite_required", "reason": reason})


async def seed_access() -> None:
    await db.access_codes.create_index("code", unique=True)
    await db.access_emails.create_index("email", unique=True)
    base = {"uses": 0, "revoked": False, "expires_at": None, "note": "seeded from env", "created_at": now_iso()}
    for code in filter(None, (c.strip().upper() for c in os.environ["ACCESS_CODES"].split(","))):
        await db.access_codes.update_one({"code": code}, {"$setOnInsert": {**base, "max_uses": None}}, upsert=True)
    for email in filter(None, (e.strip().lower() for e in os.environ["ALLOWED_EMAILS"].split(","))):
        await db.access_emails.update_one({"email": email}, {"$setOnInsert": base}, upsert=True)


async def admin_only(request: Request) -> dict:
    from auth import current_user  # lazy: auth imports this module
    user = await current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(403, "Admins only")
    return user


def _expiry(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    value = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if value <= datetime.now(timezone.utc):
        raise HTTPException(422, "Expiry must be in the future.")
    return value.astimezone(timezone.utc).isoformat()


class CodeBody(BaseModel):
    code: Optional[str] = Field(default=None, pattern=r"^[A-Za-z0-9-]{4,40}$")
    max_uses: Optional[int] = Field(default=None, ge=1, le=10000)
    expires_at: Optional[datetime] = None
    note: str = Field(default="", max_length=120)


class EmailBody(BaseModel):
    email: str = Field(max_length=200, pattern=EMAIL_RE)
    expires_at: Optional[datetime] = None
    note: str = Field(default="", max_length=120)


@router.get("/access/mode")
async def access_mode():
    return {"mode": registration_mode()}


@router.get("/admin/access")
async def list_access(_: dict = Depends(admin_only)):
    codes = [_view(d) async for d in db.access_codes.find().sort("created_at", -1)]
    emails = [_view(d) async for d in db.access_emails.find().sort("created_at", -1)]
    return {"mode": registration_mode(), "codes": codes, "emails": emails}


@router.post("/admin/access/codes", status_code=201)
async def create_code(body: CodeBody, user: dict = Depends(admin_only)):
    doc = {"code": (body.code or f"CRAB-{secrets.token_hex(3)}").upper(), "max_uses": body.max_uses, "expires_at": _expiry(body.expires_at),
           "note": body.note.strip(), "uses": 0, "revoked": False, "created_by": user["email"], "created_at": now_iso()}
    try:
        await db.access_codes.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(409, "That code already exists.")
    return _view(doc)


@router.delete("/admin/access/codes/{code}")
async def revoke_code(code: str, _: dict = Depends(admin_only)):
    res = await db.access_codes.update_one({"code": code.upper()}, {"$set": {"revoked": True, "revoked_at": now_iso()}})
    if not res.matched_count:
        raise HTTPException(404, "Code not found")
    return {"code": code.upper(), "revoked": True}


@router.post("/admin/access/emails", status_code=201)
async def allow_email(body: EmailBody, user: dict = Depends(admin_only)):
    email = body.email.strip().lower()
    fields = {"expires_at": _expiry(body.expires_at), "note": body.note.strip(), "revoked": False, "created_by": user["email"], "created_at": now_iso()}
    await db.access_emails.update_one({"email": email}, {"$set": fields, "$setOnInsert": {"uses": 0}}, upsert=True)
    return _view(await db.access_emails.find_one({"email": email}))


@router.delete("/admin/access/emails/{email}")
async def revoke_email(email: str, _: dict = Depends(admin_only)):
    res = await db.access_emails.update_one({"email": email.lower()}, {"$set": {"revoked": True, "revoked_at": now_iso()}})
    if not res.matched_count:
        raise HTTPException(404, "Email not found")
    return {"email": email.lower(), "revoked": True}
