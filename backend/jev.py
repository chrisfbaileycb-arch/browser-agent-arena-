import os
from typing import Optional

import httpx

from keys import KeyMissing, resolve_key

QUESTIONS = {
    "goal_achieved": {"type": "noul", "instructions": "Did the agent achieve its goal, with its final answer supported by the recorded evidence?"},
    "execution_quality": {"type": "score", "instructions": "How clean was the agent's execution: few wasted steps, no traps, no errors?",
                          "criteria": ["poor", "fair", "good", "excellent"]},
    "verdict": {"type": "choice", "instructions": "What should happen with this run's result?",
                "criteria": {"accept": "Goal clearly achieved with evidence", "review": "Unclear or partially supported",
                             "reject": "Goal not achieved or answer unsupported"}},
}


async def _endpoint(user: dict) -> dict:
    resolved = await resolve_key(user, "openrouter")
    if resolved["source"] == "platform_dev":
        proxy = os.environ.get("INTEGRATION_PROXY_URL", "https://integrations.emergentagent.com").rstrip("/")
        return {"url": f"{proxy}/llm/typesafe/v1/systemone", "model": "jev-latest", "key": resolved["key"], "source": "platform_dev"}
    return {"url": os.environ["JEV_OPENROUTER_ENDPOINT"], "model": os.environ["JEV_MODEL"], "key": resolved["key"], "source": "user"}


async def jev_status(user: Optional[dict]) -> dict:
    base = {"provider": "openrouter", "model": os.environ["JEV_MODEL"]}
    if not user:
        return {**base, "connected": False, "message": "Sign in and connect your OpenRouter key"}
    try:
        ep = await _endpoint(user)
        return {**base, "connected": True, "source": ep["source"], "message": "Connected" if ep["source"] == "user" else "Dev mode (platform key)"}
    except KeyMissing as exc:
        return {**base, "connected": False, "message": str(exc)}


async def jev_ask(user: dict, state: dict, questions: dict) -> dict:
    """Real Jev call or an explicit not_connected/error status. Never fabricates answers."""
    try:
        ep = await _endpoint(user)
    except KeyMissing as exc:
        return {"status": "not_connected", "message": str(exc)}
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(ep["url"], headers={"Authorization": f"Bearer {ep['key']}"}, json={"model": ep["model"], "state": state, "questions": questions})
    except httpx.HTTPError as exc:
        return {"status": "error", "message": f"Jev unreachable: {exc}"[:300]}
    if r.status_code != 200:
        return {"status": "error", "http_status": r.status_code, "message": r.text[:300]}
    data = r.json()
    return {"status": "ok", "source": ep["source"], "model": data.get("model"), "answers": data.get("answers"), "usage": data.get("usage")}


async def jev_gate(user: dict, state: dict) -> dict:
    return await jev_ask(user, state, QUESTIONS)
