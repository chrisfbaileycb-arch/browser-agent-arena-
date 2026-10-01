"""Award logic check on a far-past week with synthetic docs (cleaned up afterwards)."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
from db import db  # noqa: E402
from weekly import award_week, course_for_week, week_index, week_start, winners_of  # noqa: E402

TAG = "weekly_check"


async def main():
    n = week_index() - 30
    course = await course_for_week(n)
    at = (week_start(n).replace(hour=12)).isoformat()
    users = [str(u["_id"]) async for u in db.users.find({"email": {"$in": ["pro@steps.dev", "free@steps.dev"]}}, {"_id": 1})]
    champ = await db.crabs.find_one({"is_champion": True})
    await db.runs.insert_many([
        {"tag": TAG, "course_id": course, "status": "succeeded", "finished_at": at, "user_id": users[0], "champion_label": None, "crab_id": None, "score": {"total": 90, "elapsed_s": 50}},
        {"tag": TAG, "course_id": course, "status": "succeeded", "finished_at": at, "user_id": users[1], "champion_label": None, "crab_id": None, "score": {"total": 90, "elapsed_s": 40}},
        {"tag": TAG, "course_id": course, "status": "succeeded", "finished_at": at, "user_id": users[0], "champion_label": "GPT Pincer", "crab_id": str(champ["_id"]), "score": {"total": 99, "elapsed_s": 10}},
    ])
    await db.course_attempts.insert_one({"tag": TAG, "course_id": course, "run_id": None, "verified": True, "finished_at": at, "user_id": users[0],
                                         "score": {"total": 80, "elapsed_s": 30}, "agent_label": "Comet"})
    try:
        await asyncio.gather(award_week(n), award_week(n), award_week(n))
        badges = [b async for b in db.weekly_badges.find({"week": n})]
        print("badges", len(badges), sorted((b["category"], b["user_id"] == users[1], b["score"], b["elapsed_s"]) for b in badges))
        assert len(badges) == 2
        v = next(b for b in badges if b["category"] == "verified")
        assert v["user_id"] == users[1] and v["elapsed_s"] == 40, "tie on score must go to fastest; champion excluded"
        print("winners", [(w["title"], w["label"], w["winner"]) for w in await winners_of(n)])
        await award_week(n)
        assert await db.weekly_badges.count_documents({"week": n}) == 2, "idempotent"
        print("OK")
    finally:
        await db.runs.delete_many({"tag": TAG})
        await db.course_attempts.delete_many({"tag": TAG})
        await db.weekly_badges.delete_many({"week": n})
        await db.weekly_awards.delete_one({"_id": n})


asyncio.run(main())
