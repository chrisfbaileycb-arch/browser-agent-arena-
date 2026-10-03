import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import httpx
import jwt
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from access import admit
from db import db
from security import client_ip, rate_limit

router = APIRouter(prefix="/api/auth")
ALG = "HS256"
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
SESSION_DATA_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"


class Credentials(BaseModel):
    email: str = Field(max_length=200)
    password: str = Field(min_length=8, max_length=128)


class Register(Credentials):
    name: str = Field(min_length=1, max_length=80)
    access_code: Optional[str] = Field(default=None, max_length=40)


class GoogleSession(BaseModel):
    session_id: str = Field(min_length=4, max_length=500)
    access_code: Optional[str] = Field(default=None, max_length=40)


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    return bcrypt.checkpw(pw.encode(), hashed.encode())


def _token(user_id: str, kind: str, delta: timedelta) -> str:
    return jwt.encode({"sub": user_id, "type": kind, "exp": datetime.now(timezone.utc) + delta}, os.environ["JWT_SECRET"], algorithm=ALG)


COOKIE = {"httponly": True, "secure": True, "samesite": "none", "path": "/"}


def set_session(response: Response, user: dict) -> dict:
    """Sets cross-site-safe cookies and also returns the tokens for an Authorization-header fallback."""
    uid = str(user["_id"])
    access, refresh_tok = _token(uid, "access", timedelta(minutes=30)), _token(uid, "refresh", timedelta(days=7))
    response.set_cookie("access_token", access, max_age=1800, **COOKIE)
    response.set_cookie("refresh_token", refresh_tok, max_age=604800, **COOKIE)
    return {**public_user(user), "token": access, "refresh_token": refresh_tok}


def is_pro(user: dict) -> bool:
    if user.get("plan") != "pro":
        return False
    until = user.get("plan_until")
    return not until or datetime.fromisoformat(until) > datetime.now(timezone.utc)


def public_user(user: dict) -> dict:
    return {"id": str(user["_id"]), "email": user["email"], "name": user.get("name", ""), "picture": user.get("picture"),
            "role": user.get("role", "user"), "plan": "pro" if is_pro(user) else "free", "plan_until": user.get("plan_until"),
            "dev_platform_key": bool(user.get("dev_platform_key")) and os.environ["ALLOW_PLATFORM_KEY_FOR_DEV"] == "true"}


async def _user_from_token(token: Optional[str]) -> Optional[dict]:
    if not token:
        return None
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[ALG])
        if payload.get("type") != "access":
            return None
        return await db.users.find_one({"_id": ObjectId(payload["sub"])}, {"password_hash": 0})
    except (jwt.InvalidTokenError, InvalidId):
        return None


def _extract(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization", "")
    return request.cookies.get("access_token") or (auth[7:] if auth.startswith("Bearer ") else None)


async def optional_user(request: Request) -> Optional[dict]:
    return await _user_from_token(_extract(request))


async def current_user(request: Request) -> dict:
    user = await optional_user(request)
    if not user:
        raise HTTPException(401, "Not authenticated")
    return user


def require_pro(user: dict = Depends(current_user)) -> dict:
    if not is_pro(user):
        raise HTTPException(402, "This feature needs the Pro plan.")
    return user


@router.post("/register")
async def register(body: Register, request: Request, response: Response):
    rate_limit("register", client_ip(request), 5)
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(422, "Enter a valid email address.")
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "An account with this email already exists.")
    via = await admit(email, body.access_code)
    doc = {"email": email, "name": body.name.strip(), "password_hash": hash_password(body.password), "role": "user", "plan": "free",
           "joined_via": via, "created_at": datetime.now(timezone.utc).isoformat()}
    doc["_id"] = (await db.users.insert_one(doc)).inserted_id
    return set_session(response, doc)


@router.post("/login")
async def login(body: Credentials, request: Request, response: Response):
    ip = client_ip(request)
    rate_limit("login", ip, 10)
    email = body.email.strip().lower()
    ident = f"{ip}:{email}"
    lock = await db.login_attempts.find_one({"identifier": ident})
    if lock and lock.get("count", 0) >= 5 and datetime.fromisoformat(lock["last"]) > datetime.now(timezone.utc) - timedelta(minutes=15):
        raise HTTPException(429, "Too many failed attempts. Try again in 15 minutes.")
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        await db.login_attempts.update_one({"identifier": ident}, {"$inc": {"count": 1}, "$set": {"last": datetime.now(timezone.utc).isoformat()}}, upsert=True)
        raise HTTPException(401, "Invalid email or password.")
    await db.login_attempts.delete_one({"identifier": ident})
    return set_session(response, user)


@router.post("/google/session")
async def google_session(body: GoogleSession, request: Request, response: Response):
    rate_limit("google", client_ip(request), 10)
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(SESSION_DATA_URL, headers={"X-Session-ID": body.session_id})
        data = r.json() if r.status_code == 200 else None
    except (httpx.HTTPError, ValueError):
        raise HTTPException(502, "Google sign-in service is unreachable. Please try again.")
    if not data:
        raise HTTPException(401, "Google sign-in could not be verified. Please try again.")
    email = str(data.get("email", "")).lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(401, "Google sign-in returned no email.")
    profile = {"name": data.get("name") or email, "picture": data.get("picture")}
    if await db.users.find_one({"email": email}, {"_id": 1}):
        await db.users.update_one({"email": email}, {"$set": profile})
    else:
        via = await admit(email, body.access_code)
        await db.users.insert_one({"email": email, **profile, "role": "user", "plan": "free", "joined_via": via,
                                   "created_at": datetime.now(timezone.utc).isoformat()})
    user = await db.users.find_one({"email": email})
    return set_session(response, user)


class RefreshBody(BaseModel):
    refresh_token: Optional[str] = Field(default=None, max_length=1000)


@router.post("/refresh")
async def refresh(request: Request, response: Response, body: Optional[RefreshBody] = None):
    token = request.cookies.get("refresh_token") or (body.refresh_token if body else None) or ""
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[ALG])
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])}) if payload.get("type") == "refresh" else None
    except (jwt.InvalidTokenError, InvalidId):
        user = None
    if not user:
        raise HTTPException(401, "Session expired")
    return set_session(response, user)


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", **COOKIE)
    response.delete_cookie("refresh_token", **COOKIE)
    return {"ok": True}


@router.get("/me")
async def me(user: dict = Depends(current_user)):
    return public_user(user)


async def bootstrap_admin() -> None:
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    email, pw = os.environ["BOOTSTRAP_ADMIN_EMAIL"].strip().lower(), os.environ["BOOTSTRAP_ADMIN_PASSWORD"]
    if not email:
        return
    existing = await db.users.find_one({"email": email})
    fields = {"role": "admin", "plan": "pro", "dev_platform_key": False}
    if not existing:
        await db.users.insert_one({"email": email, "name": "Arena Admin", "password_hash": hash_password(pw), "joined_via": "bootstrap",
                                   "created_at": datetime.now(timezone.utc).isoformat(), **fields})
    else:
        if not verify_password(pw, existing.get("password_hash") or hash_password(secrets.token_hex(8))):
            fields["password_hash"] = hash_password(pw)
        await db.users.update_one({"_id": existing["_id"]}, {"$set": fields})
