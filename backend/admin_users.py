import os
import re
import shutil
from pathlib import Path

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from access import admin_only
from db import db

router = APIRouter(prefix="/api/admin/users")
OWNED = ("crabs", "user_keys", "invites", "squads", "tournaments", "coach_history", "weekly_badges", "agent_endpoints", "challenges", "usage", "workflow_runs", "training_progress")


@router.get("")
async def list_users(_: dict = Depends(admin_only)):
    out = []
    async for u in db.users.find({}, {"password_hash": 0}).sort("created_at", -1):
        uid = str(u["_id"])
        out.append({"id": uid, "email": u["email"], "name": u.get("name", ""), "role": u.get("role", "user"), "plan": u.get("plan", "free"),
                    "joined_via": u.get("joined_via"), "created_at": u.get("created_at"), "runs": await db.runs.count_documents({"user_id": uid})})
    return out


@router.delete("/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(admin_only)):
    if not ObjectId.is_valid(user_id) or not (target := await db.users.find_one({"_id": ObjectId(user_id)})):
        raise HTTPException(404, "User not found")
    if user_id == str(admin["_id"]):
        raise HTTPException(409, "You can't delete your own account from here.")
    if target.get("role") == "admin" and await db.users.count_documents({"role": "admin"}) <= 1:
        raise HTTPException(409, "You can't delete the last admin.")
    run_query = {"user_id": user_id, "champion_label": None}
    run_ids = [str(r["_id"]) async for r in db.runs.find(run_query, {"_id": 1})]
    deleted = {"runs": (await db.runs.delete_many(run_query)).deleted_count,
               "attempts": (await db.course_attempts.delete_many({"$or": [{"user_id": user_id}, {"run_id": {"$in": run_ids}}]})).deleted_count}
    for coll in OWNED:
        query = {"user_id": user_id, "is_champion": {"$ne": True}} if coll == "crabs" else {"user_id": user_id}
        deleted[coll] = (await db[coll].delete_many(query)).deleted_count
    await db.login_attempts.delete_many({"identifier": {"$regex": f":{re.escape(target['email'])}$"}})
    for rid in run_ids:
        shutil.rmtree(Path(os.environ["DATA_DIR"]) / "runs" / rid, ignore_errors=True)
    await db.users.delete_one({"_id": target["_id"]})
    return {"deleted": target["email"], "removed": deleted}
