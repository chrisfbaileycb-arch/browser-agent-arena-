import statistics

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Request

from adapters import ADAPTERS
from arena_api import public_rate_limit
from courses import COURSES
from db import db

router = APIRouter(prefix="/api")
MIN_RUNS = 3
SELF = {"copilot": ("Copilot", "#2F6BFF", "#7CF5E4", "headset"), "comet": ("Comet", "#14B8A6", "#FFD23F", "goggles"),
        "other": ("Other agent", "#9A8FB0", "#FFD23F", "cap")}
HARNESS = {"claude": "claude_computer_use", "gpt": "openai_computer_use", "gemini": "gemini_computer_use", "endpoint": "own_endpoint", "relay": "relay"}
NOT_ATTEMPTS = ["missing_key", "error", "interrupted"]


def summarize(times: list, scores: list, decoys: list, started: int, finished: int) -> dict:
    ok = started >= MIN_RUNS
    return {"runs": started, "finished": finished, "enough": ok, "min_runs": MIN_RUNS,
            "best_time_s": min(times) if ok and times else None,
            "median_time_s": round(statistics.median(times), 1) if ok and times else None,
            "finish_rate": round(finished / started, 3) if ok else None,
            "avg_score": round(sum(scores) / len(scores), 1) if ok and scores else None,
            "avg_decoys": round(sum(decoys) / len(decoys), 2) if ok and decoys else None}


async def self_stats(kind: str, course_id: str) -> dict:
    docs = [d async for d in db.course_attempts.find({"course_id": course_id, "agent_kind": kind, "run_id": None, "started_at": {"$ne": None}},
                                                     {"verified": 1, "score": 1, "decoys": 1})]
    wins = [d for d in docs if d.get("verified")]
    return summarize([d["score"]["elapsed_s"] for d in wins], [d["score"]["total"] for d in wins], [d.get("decoys", 0) for d in docs], len(docs), len(wins))


async def harness_stats(query: dict) -> dict:
    docs = [d async for d in db.runs.find({**query, "status": {"$in": ["succeeded", "failed"]}, "end_reason": {"$nin": NOT_ATTEMPTS}},
                                          {"status": 1, "score": 1, "verification": 1})]
    wins = [d for d in docs if d["status"] == "succeeded" and d.get("score")]
    return summarize([d["score"]["elapsed_s"] for d in wins], [(d.get("score") or {}).get("total", 0) for d in docs],
                     [(d.get("verification") or {}).get("decoys") or 0 for d in docs], len(docs), len(wins))


async def agent(key: str, course_id: str) -> dict:
    if key in SELF:
        name, color, accent, accessory = SELF[key]
        return {"key": key, "name": name, "source": "self_reported", "look": {"color": color, "accent": accent, "accessory": accessory},
                "stats": await self_stats(key, course_id)}
    if key in HARNESS:
        adapter = ADAPTERS[HARNESS[key]]
        return {"key": key, "name": adapter.name, "source": "verified", "look": adapter.look or {"color": "#FF5A4E", "accent": "#FFD23F", "accessory": "none"},
                "stats": await harness_stats({"course_id": course_id, "adapter": adapter.id})}
    if key == "crabs":
        return {"key": key, "name": "All custom crabs", "source": "verified", "look": {"color": "#FF5A4E", "accent": "#FFD23F", "accessory": "none"},
                "stats": await harness_stats({"course_id": course_id, "adapter": "crab"})}
    if key.startswith("crab:") and ObjectId.is_valid(key[5:]):
        crab = await db.crabs.find_one({"_id": ObjectId(key[5:])}, {"name": 1, "color": 1, "accent": 1, "accessory": 1, "is_champion": 1})
        if crab:
            return {"key": key, "name": crab["name"], "source": "verified", "champion": bool(crab.get("is_champion")), "crab_id": key[5:],
                    "look": {k: crab.get(k) for k in ("color", "accent", "accessory")},
                    "stats": await harness_stats({"course_id": course_id, "adapter": "crab", "crab_id": key[5:]})}
    raise HTTPException(404, f"Unknown agent type '{key[:40]}'")


@router.get("/h2h/agents")
async def h2h_agents():
    options = [{"key": k, "name": v[0], "source": "self_reported"} for k, v in SELF.items()]
    options += [{"key": k, "name": ADAPTERS[a].name, "source": "verified"} for k, a in HARNESS.items()]
    options.append({"key": "crabs", "name": "All custom crabs", "source": "verified"})
    options += [{"key": f"crab:{c['_id']}", "name": f"{c['name']} (champion)", "source": "verified"}
                async for c in db.crabs.find({"is_champion": True}, {"name": 1})]
    return options


@router.get("/h2h")
async def head_to_head(request: Request, course_id: str = "obstacle-1", a: str = "copilot", b: str = "comet"):
    await public_rate_limit(request, "h2h", 90)
    if course_id not in COURSES:
        raise HTTPException(404, "Course not found")
    return {"course_id": course_id, "course": COURSES[course_id]["name"], "a": await agent(a, course_id), "b": await agent(b, course_id)}
