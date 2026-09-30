import os

from fastapi import HTTPException

from auth import is_pro
from db import db


async def consume_execution(user: dict, kind: str) -> None:
    """Free plan: FREE_RUN_LIMIT executions total (browser runs + workflow runs). Pro: unlimited."""
    if is_pro(user):
        return
    used = await db.usage.count_documents({"user_id": str(user["_id"])})
    if used >= int(os.environ["FREE_RUN_LIMIT"]):
        raise HTTPException(402, "Your free run is used. Upgrade to Pro for unlimited runs, or watch champion replays.")
    await db.usage.insert_one({"user_id": str(user["_id"]), "kind": kind})
