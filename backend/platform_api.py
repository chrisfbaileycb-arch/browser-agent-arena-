import json
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException

from adapters.crab import OBSERVE_JS, SYSTEM
from auth import current_user, require_pro
from courses import COURSES
from db import db
from llm import MODELS
from models import ChallengeInput, Crab, CrabInput

router = APIRouter(prefix="/api")


def oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(404, "Not found")


def level(xp: int) -> dict:
    lvl = 1 + int((xp / 60) ** 0.5)
    return {"level": lvl, "next_level_xp": 60 * lvl * lvl}


def crab_view(doc: dict) -> dict:
    crab = Crab.from_mongo(doc).model_dump()
    return {**crab, **level(crab["xp"])}


async def own_crab(crab_id: str, user: dict) -> dict:
    doc = await db.crabs.find_one({"_id": oid(crab_id), "user_id": str(user["_id"])})
    if not doc:
        raise HTTPException(404, "Crab not found")
    return doc


def check_model(body: CrabInput) -> None:
    if body.model not in MODELS[body.provider]:
        raise HTTPException(422, f"Model must be one of {MODELS[body.provider]}")


@router.get("/models")
async def models():
    return MODELS


@router.get("/crabs")
async def list_crabs(user: dict = Depends(current_user)):
    return [crab_view(d) async for d in db.crabs.find({"user_id": str(user["_id"])}).sort("created_at", -1)]


@router.get("/champions")
async def champions():
    return [crab_view(d) async for d in db.crabs.find({"is_champion": True}).sort("xp", -1)]


@router.post("/crabs", status_code=201)
async def create_crab(body: CrabInput, user: dict = Depends(current_user)):
    check_model(body)
    if await db.crabs.count_documents({"user_id": str(user["_id"])}) >= 12:
        raise HTTPException(409, "Crab limit reached (12).")
    crab = Crab(user_id=str(user["_id"]), created_at=datetime.now(timezone.utc).isoformat(), **body.model_dump())
    crab.id = str((await db.crabs.insert_one(crab.to_mongo())).inserted_id)
    return {**crab.model_dump(), **level(0)}


@router.put("/crabs/{crab_id}")
async def update_crab(crab_id: str, body: CrabInput, user: dict = Depends(current_user)):
    check_model(body)
    doc = await own_crab(crab_id, user)
    await db.crabs.update_one({"_id": doc["_id"]}, {"$set": body.model_dump()})
    return crab_view(await db.crabs.find_one({"_id": doc["_id"]}))


@router.delete("/crabs/{crab_id}")
async def delete_crab(crab_id: str, user: dict = Depends(current_user)):
    doc = await own_crab(crab_id, user)
    await db.crabs.delete_one({"_id": doc["_id"]})
    return {"deleted": True}


@router.get("/challenges")
async def list_challenges(user: dict = Depends(current_user)):
    return [{"id": str(d.pop("_id")), **d} async for d in db.challenges.find({"user_id": str(user["_id"])}).sort("updated_at", -1)]


@router.post("/challenges", status_code=201)
async def save_challenge(body: ChallengeInput, user: dict = Depends(current_user)):
    if len(json.dumps(body.draft)) > 30000:
        raise HTTPException(413, "Challenge is too large.")
    doc = {"user_id": str(user["_id"]), "name": body.name, "draft": body.draft, "updated_at": datetime.now(timezone.utc).isoformat()}
    return {"id": str((await db.challenges.insert_one(doc)).inserted_id), **{k: v for k, v in doc.items() if k != "_id"}}


@router.delete("/challenges/{challenge_id}")
async def delete_challenge(challenge_id: str, user: dict = Depends(current_user)):
    await db.challenges.delete_one({"_id": oid(challenge_id), "user_id": str(user["_id"])})
    return {"deleted": True}


@router.get("/leaderboard/{course_id}")
async def leaderboard(course_id: str):
    if course_id not in COURSES:
        raise HTTPException(404, "Course not found")
    attempts = [a async for a in db.course_attempts.find({"course_id": course_id, "verified": True}).sort("score.total", -1).limit(50)]
    run_ids = [ObjectId(a["run_id"]) for a in attempts if a.get("run_id")]
    runs = {str(r["_id"]): r async for r in db.runs.find({"_id": {"$in": run_ids}}, {"steps": 0})}
    crab_ids = [ObjectId(r["crab_id"]) for r in runs.values() if r.get("crab_id")]
    crabs = {str(c["_id"]): c async for c in db.crabs.find({"_id": {"$in": crab_ids}})}
    rows = []
    for a in attempts:
        run = runs.get(a.get("run_id") or "")
        crab = crabs.get((run or {}).get("crab_id") or "")
        look = crab or (run or {}).get("profile") or {}
        rows.append({"attempt_id": str(a["_id"]), "badge": "verified" if run else "self_reported",
                     "agent": (crab or {}).get("name") or (run or {}).get("champion_label") or look.get("name") or a["agent_label"],
                     "adapter": (run or {}).get("adapter") or "self_reported", "model": (run or {}).get("model") or look.get("model"),
                     "color": look.get("color"), "accent": look.get("accent"), "accessory": look.get("accessory"),
                     "score": a["score"]["total"], "elapsed_s": a["score"]["elapsed_s"], "steps": a["score"].get("steps"), "decoys": a["decoys"],
                     "run_id": a.get("run_id") if run and run.get("is_public") else None, "recording_url": a.get("recording_url"),
                     "submitted_at": a.get("submitted_at")})
    return rows


RUNNER_TEMPLATE = '''"""Standalone skill export for the crab "{name}" from Steps of Execution.
Run: pip install playwright openai google-genai anthropic && playwright install chromium
Set your own key: {env} ; then: python crab_runner.py <url> "<goal>"
"""
import asyncio, base64, json, os, sys
from playwright.async_api import async_playwright

PROVIDER, MODEL = "{provider}", "{model}"
SYSTEM = {system}
OBSERVE_JS = {observe}


def ask(prompt, image_b64):
    if PROVIDER == "openai":
        from openai import OpenAI
        r = OpenAI().chat.completions.create(model=MODEL, response_format={{"type": "json_object"}}, messages=[
            {{"role": "system", "content": SYSTEM}}, {{"role": "user", "content": [{{"type": "text", "text": prompt}},
            {{"type": "image_url", "image_url": {{"url": "data:image/jpeg;base64," + image_b64}}}}]}}])
        text = r.choices[0].message.content
    elif PROVIDER == "anthropic":
        import anthropic
        r = anthropic.Anthropic().messages.create(model=MODEL, max_tokens=800, system=SYSTEM, messages=[{{"role": "user", "content": [
            {{"type": "image", "source": {{"type": "base64", "media_type": "image/jpeg", "data": image_b64}}}}, {{"type": "text", "text": prompt}}]}}])
        text = r.content[0].text
    else:
        from google import genai
        from google.genai import types
        r = genai.Client().models.generate_content(model=MODEL, contents=[types.Part.from_bytes(data=base64.b64decode(image_b64), mime_type="image/jpeg"), prompt],
                                                   config=types.GenerateContentConfig(system_instruction=SYSTEM))
        text = r.text
    return json.loads(text[text.find("{{"):text.rfind("}}") + 1])


async def main(url, goal, max_steps=25):
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        page = await browser.new_page(viewport={{"width": 1280, "height": 800}})
        await page.goto(url)
        history = []
        for n in range(1, max_steps + 1):
            obs = await page.evaluate(OBSERVE_JS)
            shot = base64.b64encode(await page.screenshot(type="jpeg", quality=60)).decode()
            d = ask(f"GOAL: {{goal}}\\nStep {{n}}\\nRECENT: {{history[-8:]}}\\nELEMENTS: {{obs['elements']}}\\nSCROLLABLES: {{obs['scrollables']}}\\nTEXT: {{obs['text']}}", shot)
            print(n, d.get("action"), d.get("target"), d.get("value"), "-", d.get("reasoning"))
            loc = page.locator(f'[data-crab-id="{{d.get("target")}}"]').first
            try:
                if d["action"] == "click": await loc.click(timeout=5000)
                elif d["action"] == "type": await loc.fill(str(d.get("value", "")))
                elif d["action"] == "select": await loc.select_option(label=str(d.get("value", "")))
                elif d["action"] == "scroll":
                    amt, dr = int(d.get("amount") or 600), d.get("direction", "down")
                    await loc.evaluate("(el, v) => el.scrollBy(v[0], v[1])", [amt if dr == "right" else -amt if dr == "left" else 0, amt if dr == "down" else -amt if dr == "up" else 0])
                elif d["action"] == "wait": await page.wait_for_timeout(min(int(d.get("ms") or 1500), 5000))
                elif d["action"] in ("done", "fail"):
                    print("RESULT:", d.get("value")); break
                history.append(f"{{d['action']}} {{d.get('target')}} ok")
            except Exception as exc:
                history.append(f"{{d.get('action')}} {{d.get('target')}} ERROR {{exc}}")
            await page.wait_for_timeout(400)
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2]))
'''


@router.get("/exports/crab/{crab_id}")
async def export_crab(crab_id: str, user: dict = Depends(require_pro)):
    crab = crab_view(await own_crab(crab_id, user))
    system = SYSTEM + f"\nYou are the crab named {crab['name']}. Personality: {crab['personality']}." + (
        f"\nOwner instructions: {crab['system_prompt']}" if crab["system_prompt"] else "")
    env = {"openai": "OPENAI_API_KEY", "anthropic": "ANTHROPIC_API_KEY", "gemini": "GOOGLE_API_KEY"}[crab["provider"]]
    runner = RUNNER_TEMPLATE.format(name=crab["name"], provider=crab["provider"], model=crab["model"], env=env,
                                    system=json.dumps(system), observe=json.dumps(OBSERVE_JS))
    skill = {k: crab[k] for k in ("name", "color", "accent", "accessory", "skills", "personality", "system_prompt", "provider", "model", "memory", "level")}
    return {"crab_runner.py": runner, "crab.skill.json": json.dumps(skill, indent=2),
            "requirements.txt": "playwright\nopenai\nanthropic\ngoogle-genai\n",
            "README.md": f"# {crab['name']} — exported crab skill\n\nBring your own key: set `{env}`.\n\n```\npip install -r requirements.txt\nplaywright install chromium\npython crab_runner.py https://example.com \"Find the page heading\"\n```\n"}


@router.get("/exports/entitlement")
async def entitlement(user: dict = Depends(require_pro)):
    return {"exports": True}
