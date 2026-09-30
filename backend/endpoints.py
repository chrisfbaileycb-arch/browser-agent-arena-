import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import current_user
from db import db
from safety import request_blocked
from security import encrypt

router = APIRouter(prefix="/api/endpoint")


class EndpointBody(BaseModel):
    url: str = Field(min_length=10, max_length=500, pattern=r"^https://")


def view(doc: dict, secret=None) -> dict:
    return {"url": doc["url"], "updated_at": doc["updated_at"], "secret": secret}


@router.get("")
async def get_endpoint(user: dict = Depends(current_user)):
    doc = await db.agent_endpoints.find_one({"user_id": str(user["_id"])})
    return view(doc) if doc else None


@router.put("")
async def save_endpoint(body: EndpointBody, user: dict = Depends(current_user)):
    reason = await request_blocked(body.url)
    if reason:
        raise HTTPException(422, f"Endpoint URL not allowed: {reason}")
    uid = str(user["_id"])
    existing = await db.agent_endpoints.find_one({"user_id": uid})
    secret = None if existing else secrets.token_urlsafe(32)
    fields = {"url": body.url, "updated_at": datetime.now(timezone.utc).isoformat()}
    if secret:
        fields["secret_cipher"] = encrypt(secret)
    await db.agent_endpoints.update_one({"user_id": uid}, {"$set": fields}, upsert=True)
    return view(fields, secret)


@router.post("/rotate")
async def rotate_secret(user: dict = Depends(current_user)):
    doc = await db.agent_endpoints.find_one({"user_id": str(user["_id"])})
    if not doc:
        raise HTTPException(404, "No endpoint connected.")
    secret = secrets.token_urlsafe(32)
    await db.agent_endpoints.update_one({"_id": doc["_id"]}, {"$set": {"secret_cipher": encrypt(secret)}})
    return view(doc, secret)


@router.delete("")
async def delete_endpoint(user: dict = Depends(current_user)):
    await db.agent_endpoints.delete_one({"user_id": str(user["_id"])})
    return {"deleted": True}
