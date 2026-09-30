import os
from datetime import datetime, timedelta, timezone

import stripe
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from auth import current_user
from db import db

router = APIRouter(prefix="/api")
stripe.api_key = os.environ["STRIPE_SECRET_KEY"]
PLANS = {"arena_pro_monthly": {"name": "Arena Pro", "price_usd": 12.0, "interval": "month", "days": 31}}


class CheckoutRequest(BaseModel):
    lookup_key: str = Field(max_length=60)
    origin_url: str = Field(max_length=300)


async def _grant(session_id: str) -> None:
    tx = await db.payment_transactions.find_one({"session_id": session_id})
    if tx and not tx.get("granted"):
        until = (datetime.now(timezone.utc) + timedelta(days=PLANS[tx["lookup_key"]]["days"])).isoformat()
        await db.users.update_one({"_id": ObjectId(tx["user_id"])}, {"$set": {"plan": "pro", "plan_until": until}})
        await db.payment_transactions.update_one({"session_id": session_id}, {"$set": {"granted": True}})


async def _mark_paid(session_id: str, obj) -> None:
    await db.payment_transactions.update_one(
        {"session_id": session_id, "payment_status": {"$ne": "paid"}},
        {"$set": {"status": "completed", "payment_status": "paid", "stripe_subscription_id": obj.get("subscription"),
                  "updated_at": datetime.now(timezone.utc).isoformat()}})
    await _grant(session_id)


@router.get("/billing/plans")
async def plans():
    return [{"lookup_key": k, **v} for k, v in PLANS.items()]


@router.post("/payments/checkout")
async def checkout(body: CheckoutRequest, user: dict = Depends(current_user)):
    if body.lookup_key not in PLANS:
        raise HTTPException(404, "Unknown plan")
    if not body.origin_url.startswith(("https://", "http://localhost")):
        raise HTTPException(422, "Invalid origin")
    prices = stripe.Price.list(lookup_keys=[body.lookup_key], active=True, limit=1).data
    if not prices:
        raise HTTPException(500, "Plan price is not configured")
    price = prices[0]
    kwargs = dict(line_items=[{"price": price.id, "quantity": 1}], mode="subscription" if price.recurring else "payment",
                  success_url=f"{body.origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}", cancel_url=f"{body.origin_url}/pricing",
                  metadata={"user_id": str(user["_id"]), "lookup_key": body.lookup_key}, customer_email=user["email"])
    try:
        session = stripe.checkout.Session.create(**kwargs, managed_payments={"enabled": True})
    except stripe.error.InvalidRequestError:
        session = stripe.checkout.Session.create(**kwargs, automatic_tax={"enabled": True}, billing_address_collection="required")
    await db.payment_transactions.insert_one({
        "session_id": session.id, "user_id": str(user["_id"]), "lookup_key": body.lookup_key, "amount": float(PLANS[body.lookup_key]["price_usd"]),
        "currency": price.currency, "status": "initiated", "payment_status": "pending", "created_at": datetime.now(timezone.utc).isoformat()})
    return {"checkout_url": session.url, "session_id": session.id}


@router.get("/payments/status/{session_id}")
async def payment_status(session_id: str):
    record = await db.payment_transactions.find_one({"session_id": session_id})
    if not record:
        raise HTTPException(404, "Transaction not found")
    if record.get("payment_status") != "paid":
        try:
            s = stripe.checkout.Session.retrieve(session_id)
            if s.payment_status == "paid" or s.status == "complete":
                await _mark_paid(session_id, s)
                record = await db.payment_transactions.find_one({"session_id": session_id})
        except stripe.error.StripeError:
            pass
    return {"session_id": session_id, "status": record["status"], "payment_status": record["payment_status"]}


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    try:
        event = stripe.Webhook.construct_event(await request.body(), request.headers.get("stripe-signature", ""), os.environ["STRIPE_WEBHOOK_SECRET"])
    except (stripe.error.SignatureVerificationError, ValueError):
        raise HTTPException(400, "Invalid signature")
    obj, kind = event["data"]["object"], event["type"]
    if kind in ("checkout.session.completed", "checkout.session.async_payment_succeeded") and obj.get("payment_status") == "paid":
        await _mark_paid(obj["id"], obj)
    elif kind in ("checkout.session.expired", "checkout.session.async_payment_failed"):
        await db.payment_transactions.update_one({"session_id": obj["id"]}, {"$set": {"status": "failed", "payment_status": kind.split(".")[-1]}})
    return {"status": "ok"}
