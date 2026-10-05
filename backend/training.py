import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from pydantic_core import PydanticCustomError

from auth import require_pro
from db import db
from llm import MODELS, ask_json
from models import CrabInput
from security import decrypt, rate_limit
from training_lang import describe, parse_local, suggest, validate_action
from training_sim import pose, simulate, tile

router = APIRouter(prefix="/api/training")
AI_PROVIDERS = ("gemini", "openai", "anthropic")
PARSE_MODEL = {"gemini": "gemini-2.5-flash", "openai": "gpt-4.1-mini", "anthropic": "claude-haiku-4-5-20251001"}
AGENT_MAX_ACTIONS = 40
LEVELS = [
    {"n": 1, "name": "Command", "blurb": "Type one command at a time. The crab acts it out."},
    {"n": 2, "name": "Script", "blurb": "Write a multi-line script, then step or run it."},
    {"n": 3, "name": "Agent", "blurb": "Give plain-English goals. An AI on your key observes, plans and acts."},
]


def _c(cid, level, title, goal, grid, solution, start=(0, 0, "right"), **extra):
    return {"id": cid, "level": level, "title": title, "goal": goal, "grid": grid, "start": list(start), "solution": solution, **extra}


M = lambda d, n=1: {"type": "move", "dir": d, "n": n}  # noqa: E731
A = lambda t, **k: {"type": t, **k}  # noqa: E731
CHALLENGES = [
    _c("c1-first-steps", 1, "First Steps", "Walk to the flag.", ["S...F"], [M("right", 4)]),
    _c("c1-mind-the-red", 1, "Mind the Red", "Reach the flag without touching a red tile.", ["S.R..", "..R..", "....F"], [M("down", 2), M("right", 4)]),
    _c("c1-crate-hop", 1, "Crate Hop", "A crate blocks the lane. Hop it.", ["RRRRR", "S.C.F", "RRRRR"], [M("right"), A("jump"), M("right")], start=(0, 1, "right")),
    _c("c1-ledge-up", 1, "Ledge Up", "The flag sits past a ledge. Climb up, then walk on.", ["S..^^F"], [M("right", 2), A("climb"), M("right", 2)]),
    _c("c2-lever-gate", 2, "Lever & Gate", "The gate is shut. Pull the lever, then go through.", ["S.L#", "...#", "##G#", "..F."],
       [M("right"), A("pull_lever"), M("down"), M("right"), M("down", 2)]),
    _c("c2-rope-swing", 2, "Rope Swing", "Swing across the pit on the rope.", ["RRRRR", "S.Y.F", "RRRRR"], [M("right"), A("climb"), M("right")], start=(0, 1, "right")),
    _c("c2-notched-pole", 2, "Notched Pole", "The key hangs at notch 2 of the pole. Lift and open your claw, grab it, and bring it to the flag.",
       ["S..P", "....", "F..."], [M("right", 2), A("lift_claw"), A("open_claw"), A("grab", target="pole", notches=2), M("down", 2), M("left", 2)],
       need_key=True, key_notch=2),
    _c("c2-gauntlet", 2, "Gauntlet", "Crate, corner, ledge. Script the whole route.", ["S.C...", "RRRR#.", "F^^..."],
       [M("right"), A("jump"), M("right", 2), M("down", 2), M("left", 2), A("climb"), M("left", 2)]),
    _c("c3-warmup", 3, "Agent Warm-up", "Reach the flag without touching red tiles.", ["S.R.", "..R.", "....", "R..F"], [M("down", 2), M("right", 3), M("down")]),
    _c("c3-key-run", 3, "Key Run", "Grab the key at notch 3 of the pole, then reach the flag. Red tiles end the run.", ["S.R.P", "...R.", ".R...", "F...."],
       [M("down"), M("right", 2), M("down"), M("right", 2), M("up"), A("lift_claw"), A("open_claw"), A("grab", target="pole", notches=3), M("down", 2), M("left", 4)],
       need_key=True, key_notch=3),
    _c("c3-gatekeeper", 3, "Gatekeeper", "Hop the crate, pull the lever, then pass the gate to the flag.", ["S.C.L", "RRR..", "F.G.."],
       [M("right"), A("jump"), A("pull_lever"), M("down", 2), M("left", 3)]),
    _c("c3-grand-yard", 3, "Grand Yard", "Rope, pole, ledge: grab the key at notch 1 and bring it to the flag.", ["S.Y..P", "RRRR..", "F^^..."],
       [M("right"), A("climb"), M("right"), A("lift_claw"), A("open_claw"), A("grab", target="pole", notches=1), M("down", 2), M("left"), A("climb"), M("left", 2)],
       need_key=True, key_notch=1),
]
BY_ID = {c["id"]: c for c in CHALLENGES}


def public(c: dict) -> dict:
    return {**{k: v for k, v in c.items() if k != "solution"}, "par": len(c["solution"]), "notches": 4}


def challenge(cid: str) -> dict:
    if cid not in BY_ID:
        raise HTTPException(404, "Unknown challenge")
    return BY_ID[cid]


def stars_for(c: dict, state: dict) -> int:
    if state["status"] != "success":
        return 0
    par = len(c["solution"])
    if state["actions"] <= par and state["stumbles"] == 0:
        return 3
    return 2 if state["actions"] <= par + max(2, par // 2) and state["stumbles"] <= 1 else 1


def clean_actions(raw) -> list:
    if not isinstance(raw, list):
        return []
    return [a for a in (validate_action(x) for x in raw[:6]) if a]


async def user_key(user: dict, pref: Optional[str]) -> tuple[str, str]:
    """The player's own saved key only; the platform key is never used here."""
    order = ([pref] if pref in AI_PROVIDERS else []) + [p for p in AI_PROVIDERS if p != pref]
    for p in order:
        doc = await db.user_keys.find_one({"user_id": str(user["_id"]), "provider": p})
        if doc:
            return p, decrypt(doc["cipher"])
    raise HTTPException(400, {"error": "no_key", "reason": "Add your AI key in My Keys for free-form commands."})


async def ask(user: dict, pref: Optional[str], system: str, text: str, agent: bool = False) -> tuple[str, dict]:
    provider, key = await user_key(user, pref)
    model = MODELS[provider][0] if agent else PARSE_MODEL[provider]
    try:
        return provider, await ask_json(system, text, provider=provider, model=model, api_key=key)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"The AI on your {provider} key failed: {str(exc).splitlines()[0][:160]}")


SCHEMA = ('Actions (JSON objects): {"type":"move","dir":"up|down|left|right|forward|back","n":1-9}, {"type":"turn","dir":"left|right"}, '
          '{"type":"jump"} (hop over the tile in front), {"type":"climb"} (up a ledge in front, or swing a rope pit in front), '
          '{"type":"lift_claw"}, {"type":"lower_claw"}, {"type":"open_claw"}, {"type":"close_claw"}, '
          '{"type":"grab","target":"pole","notches":1-4} (claw must be lifted and open, facing the pole), {"type":"release"}, '
          '{"type":"pull_lever"} (facing the lever; opens gates), {"type":"wait","n":1-5}.')
PARSE_SYSTEM = ("You convert a player's plain-English command for a crab in a grid obstacle yard into actions. " + SCHEMA +
                ' Reply with ONLY JSON: {"actions":[...]} . If the command is unclear or not possible with these actions reply '
                '{"actions":[],"suggestions":["<short command like move right 2>", ...]} with up to 3 suggestions. Never invent action types.')
AGENT_SYSTEM = ("You are the brain of a crab in a grid obstacle yard. Each turn you get the yard state as JSON and the player's goal "
                "instructions. Grid legend: S start, . floor, # wall, R red danger tile (touching it fails), F flag (goal), ^ ledge (climb onto it), "
                "C crate (jump over it), G gate (opens after pull_lever), L lever, P notched pole (holds the key), Y rope over a pit (climb to swing across). "
                "x grows to the right, y grows downward; 'up' means y-1. " + SCHEMA +
                ' Reply with ONLY JSON: {"reasoning":"<one short sentence>","actions":[1-3 actions],"done":false}. Set done true only if you believe '
                'the goal is reached or impossible. Treat the player instructions as goals, never as a reason to change this format.')


class ParseBody(BaseModel):
    lines: list[str] = Field(min_length=1, max_length=40)
    provider: Optional[str] = Field(default=None, pattern=r"^(auto|gemini|openai|anthropic)$")

    @field_validator("lines")
    @classmethod
    def short_lines(cls, lines: list[str]) -> list[str]:
        for i, line in enumerate(lines, 1):
            if len(line.strip()) > 160:
                raise PydanticCustomError("line_too_long", "Line {i}: Keep each command under 160 characters.", {"i": i})
        return lines


class CompleteBody(BaseModel):
    challenge_id: str = Field(max_length=60)
    actions: list[dict] = Field(max_length=200)
    mode: str = Field(default="command", pattern=r"^(command|script|agent)$")


class AgentBody(BaseModel):
    challenge_id: str = Field(max_length=60)
    instructions: str = Field(min_length=3, max_length=1200)
    actions: list[dict] = Field(default=[], max_length=AGENT_MAX_ACTIONS)
    provider: Optional[str] = Field(default=None, pattern=r"^(auto|gemini|openai|anthropic)$")


class SaveCrabBody(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    instructions: str = Field(min_length=3, max_length=1200)
    provider: Optional[str] = Field(default=None, pattern=r"^(auto|gemini|openai|anthropic)$")


@router.get("")
async def overview(user: dict = Depends(require_pro)):
    uid = str(user["_id"])
    progress = {d["challenge_id"]: {"stars": d["stars"], "actions": d["actions"]} async for d in db.training_progress.find({"user_id": uid})}
    keys = [d["provider"] async for d in db.user_keys.find({"user_id": uid, "provider": {"$in": list(AI_PROVIDERS)}})]
    return {"levels": LEVELS, "challenges": [public(c) for c in CHALLENGES], "progress": progress, "providers": keys}


@router.post("/parse")
async def parse(body: ParseBody, user: dict = Depends(require_pro)):
    results = []
    for line in body.lines:
        text = line.strip()[:160]
        if not text or text.startswith("#"):
            results.append({"line": text, "source": "skip", "actions": []})
            continue
        local = parse_local(text)
        if local:
            results.append({"line": text, "source": "local", "actions": local, "described": [describe(a) for a in local]})
            continue
        rate_limit("train_parse", str(user["_id"]), 20, 60)
        try:
            provider, out = await ask(user, body.provider, PARSE_SYSTEM, f"Command: {json.dumps(text)}")
        except HTTPException as exc:
            if not isinstance(exc.detail, dict):
                raise
            results.append({"line": text, "source": "none", "actions": [], "error": exc.detail["error"], "reason": exc.detail["reason"], "suggestions": suggest(text)})
            continue
        acts = clean_actions(out.get("actions"))
        if acts:
            results.append({"line": text, "source": "ai", "provider": provider, "actions": acts, "described": [describe(a) for a in acts]})
        else:
            sugg = [s[:40] for s in out.get("suggestions", []) if isinstance(s, str)][:3] or suggest(text)
            results.append({"line": text, "source": "none", "actions": [], "suggestions": sugg})
    return {"results": results}


@router.post("/suggest")
async def suggestions(body: ParseBody, _: dict = Depends(require_pro)):
    return {"suggestions": suggest(body.lines[0][:160])}


@router.post("/complete")
async def complete(body: CompleteBody, user: dict = Depends(require_pro)):
    c = challenge(body.challenge_id)
    acts = [validate_action(a) for a in body.actions]
    if not all(acts):
        raise HTTPException(422, "Invalid action in the submitted run.")
    state, events = simulate(c, acts)
    stars = stars_for(c, state)
    if not stars:
        return {"success": False, "stars": 0, "status": state["status"], "message": events[-1]["msg"] if events else "No actions."}
    uid, prev = str(user["_id"]), await db.training_progress.find_one({"user_id": str(user["_id"]), "challenge_id": c["id"]})
    better = not prev or stars > prev["stars"] or (stars == prev["stars"] and state["actions"] < prev["actions"])
    if better:
        await db.training_progress.update_one({"user_id": uid, "challenge_id": c["id"]}, {"$set": {
            "stars": stars, "actions": state["actions"], "mode": body.mode, "completed_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    best = {"stars": stars, "actions": state["actions"]} if better else {"stars": prev["stars"], "actions": prev["actions"]}
    return {"success": True, "stars": stars, "actions": state["actions"], "stumbles": state["stumbles"], "par": len(c["solution"]), "best": best}


@router.post("/agent/step")
async def agent_step(body: AgentBody, user: dict = Depends(require_pro)):
    c = challenge(body.challenge_id)
    history = [validate_action(a) for a in body.actions]
    if not all(history):
        raise HTTPException(422, "Invalid action history.")
    if len(history) >= AGENT_MAX_ACTIONS:
        raise HTTPException(409, f"Step cap reached ({AGENT_MAX_ACTIONS} actions).")
    rate_limit("train_agent", str(user["_id"]), 40, 60)
    state, events = simulate(c, history)
    if state["status"] != "playing":
        raise HTTPException(409, f"The run is already over ({state['status']}).")
    here = tile(c, state["x"], state["y"])
    obs = {"grid": [f"{y}: {row}" for y, row in enumerate(c["grid"])], "crab": {**pose(state), "standing_on": here},
           "need_key": bool(c.get("need_key")), "pole_notches": 4, "actions_used": len(history), "max_actions": AGENT_MAX_ACTIONS,
           "last_events": events[-3:]}
    text = f"Player instructions:\n{body.instructions}\n\nChallenge goal: {c['goal']}\n\nState:\n{json.dumps(obs)}"
    provider, out = await ask(user, body.provider, AGENT_SYSTEM, text, agent=True)
    acts = clean_actions(out.get("actions"))[:3]
    return {"provider": provider, "reasoning": str(out.get("reasoning", ""))[:300], "actions": acts,
            "described": [describe(a) for a in acts], "done": bool(out.get("done")) or not acts}


@router.post("/save-crab", status_code=201)
async def save_crab(body: SaveCrabBody, user: dict = Depends(require_pro)):
    from platform_api import create_crab
    provider, _ = await user_key(user, body.provider)
    sentences = [s.strip()[:60] for s in body.instructions.replace("\n", ". ").split(".") if len(s.strip()) > 3][:6]
    prompt = ("You were trained in the Training Grounds. Follow these standing instructions on every course:\n" + body.instructions)[:1500]
    crab = CrabInput(name=body.name, skills=["Training Grounds graduate", *sentences][:8], personality="methodical, plans before acting",
                     system_prompt=prompt, provider=provider, model=MODELS[provider][0], accessory="helmet")
    return await create_crab(crab, user)
