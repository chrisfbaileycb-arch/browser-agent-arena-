import os
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import current_user
from db import db
from security import decrypt, encrypt, rate_limit

router = APIRouter(prefix="/api/keys")
PROVIDERS = {"anthropic": "Anthropic", "openai": "OpenAI", "gemini": "Google Gemini", "openrouter": "OpenRouter (Jev)", "tavily": "Tavily"}
PLATFORM_DEV_PROVIDERS = {"anthropic", "openai", "gemini", "openrouter"}


class KeyMissing(Exception):
    pass


class KeyBody(BaseModel):
    key: str = Field(min_length=8, max_length=400)


def dev_allowed(user: dict) -> bool:
    return os.environ["ALLOW_PLATFORM_KEY_FOR_DEV"] == "true" and bool(user.get("dev_platform_key"))


async def resolve_key(user: dict, provider: str) -> dict:
    """Returns {'key', 'source'}; only the user's own key, or the platform key for flagged dev/test accounts."""
    doc = await db.user_keys.find_one({"user_id": str(user["_id"]), "provider": provider})
    if doc:
        return {"key": decrypt(doc["cipher"]), "source": "user"}
    if provider in PLATFORM_DEV_PROVIDERS and dev_allowed(user):
        return {"key": os.environ["EMERGENT_LLM_KEY"], "source": "platform_dev"}
    raise KeyMissing(f"Add your {PROVIDERS[provider]} key in My Keys to run this.")


async def has_key(user: dict, provider: str) -> bool:
    try:
        await resolve_key(user, provider)
        return True
    except KeyMissing:
        return False


def _check_provider(provider: str) -> None:
    if provider not in PROVIDERS:
        raise HTTPException(404, "Unknown provider")


async def validate(provider: str, key: str) -> tuple[bool, str]:
    requests = {
        "openai": ("GET", "https://api.openai.com/v1/models", {"Authorization": f"Bearer {key}"}, None),
        "anthropic": ("GET", "https://api.anthropic.com/v1/models", {"x-api-key": key, "anthropic-version": "2023-06-01"}, None),
        "gemini": ("GET", "https://generativelanguage.googleapis.com/v1beta/models", {"x-goog-api-key": key}, None),
        "openrouter": ("GET", "https://openrouter.ai/api/v1/key", {"Authorization": f"Bearer {key}"}, None),
        "tavily": ("POST", "https://api.tavily.com/search", {"Authorization": f"Bearer {key}"}, {"query": "key check", "max_results": 1}),
    }
    method, url, headers, body = requests[provider]
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.request(method, url, headers=headers, json=body)
    except httpx.HTTPError as exc:
        return False, f"Could not reach {PROVIDERS[provider]}: {exc}"[:200]
    if r.status_code == 200:
        return True, f"{PROVIDERS[provider]} accepted the key (HTTP 200)."
    return False, f"{PROVIDERS[provider]} rejected the key (HTTP {r.status_code}): {provider_error(r)}"[:400]


def provider_error(r: httpx.Response) -> str:
    """The provider's own error message, verbatim when it sends one."""
    try:
        data = r.json()
    except ValueError:
        return r.text.strip()[:300] or r.reason_phrase
    err = data.get("error", data) if isinstance(data, dict) else data
    if isinstance(err, dict):
        return str(err.get("message") or err.get("detail") or err)[:300]
    return str(data.get("detail") or err)[:300] if isinstance(data, dict) else str(err)[:300]


@router.get("")
async def list_keys(user: dict = Depends(current_user)):
    saved = {d["provider"]: d async for d in db.user_keys.find({"user_id": str(user["_id"])})}
    return [{"provider": p, "label": label, "saved": p in saved, "last4": saved[p]["last4"] if p in saved else None,
             "updated_at": saved[p]["updated_at"] if p in saved else None, "last_test": saved[p].get("last_test") if p in saved else None,
             "platform_dev": p not in saved and p in PLATFORM_DEV_PROVIDERS and dev_allowed(user)} for p, label in PROVIDERS.items()]


@router.put("/{provider}")
async def save_key(provider: str, body: KeyBody, user: dict = Depends(current_user)):
    _check_provider(provider)
    key = body.key.strip()
    await db.user_keys.update_one({"user_id": str(user["_id"]), "provider": provider},
                                  {"$set": {"cipher": encrypt(key), "last4": key[-4:], "updated_at": datetime.now(timezone.utc).isoformat(), "last_test": None}},
                                  upsert=True)
    return {"provider": provider, "saved": True, "last4": key[-4:]}


@router.post("/{provider}/test")
async def test_key(provider: str, user: dict = Depends(current_user)):
    _check_provider(provider)
    rate_limit("keytest", str(user["_id"]), 10)
    doc = await db.user_keys.find_one({"user_id": str(user["_id"]), "provider": provider})
    if not doc:
        raise HTTPException(404, f"No {PROVIDERS[provider]} key saved.")
    ok, message = await validate(provider, decrypt(doc["cipher"]))
    result = {"ok": ok, "message": message, "at": datetime.now(timezone.utc).isoformat()}
    await db.user_keys.update_one({"_id": doc["_id"]}, {"$set": {"last_test": result}})
    return result


@router.delete("/{provider}")
async def delete_key(provider: str, user: dict = Depends(current_user)):
    _check_provider(provider)
    await db.user_keys.delete_one({"user_id": str(user["_id"]), "provider": provider})
    return {"provider": provider, "saved": False}
