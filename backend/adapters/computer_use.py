import asyncio
import base64
import hashlib
import hmac
import json
import os
import re
import time
from datetime import datetime, timezone

import httpx

from adapters.base import AdapterOutcome, AgentAdapter, BrowserSession
from adapters.crab import settle
from db import db
from keys import PROVIDERS, KeyMissing
from models import Step
from safety import request_blocked
from security import decrypt

W, H = 1280, 800
CODE_RE = re.compile(r"SOE-[A-Z0-9]{4}-[A-Z0-9]{4}")
BRIEF = ("You are competing in the Steps of Execution browser arena. You control one Chromium tab (1280x800) that is already open on the task page; "
         "there is no address bar, so work inside the page. Read on-page instructions carefully and avoid decoys that contradict them. "
         "When the goal is achieved, stop using the computer and reply with a short final message containing the exact answer "
         "(for obstacle courses: the finish code shaped like SOE-XXXX-XXXX).")
KEYS = {"return": "Enter", "enter": "Enter", "ctrl": "Control", "control": "Control", "alt": "Alt", "option": "Alt", "shift": "Shift",
        "super": "Meta", "cmd": "Meta", "command": "Meta", "meta": "Meta", "win": "Meta", "esc": "Escape", "escape": "Escape",
        "backspace": "Backspace", "delete": "Delete", "del": "Delete", "tab": "Tab", "space": "Space", "home": "Home", "end": "End",
        "page_down": "PageDown", "pagedown": "PageDown", "page_up": "PageUp", "pageup": "PageUp", "up": "ArrowUp", "down": "ArrowDown",
        "left": "ArrowLeft", "right": "ArrowRight", "arrowup": "ArrowUp", "arrowdown": "ArrowDown", "arrowleft": "ArrowLeft", "arrowright": "ArrowRight"}
DIRS = {"down": (0, 1), "up": (0, -1), "right": (1, 0), "left": (-1, 0)}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def combo(keys) -> str:
    return "+".join(KEYS.get(str(k).strip().lower(), str(k).strip()) for k in keys if str(k).strip())


def data_url(b64: str) -> str:
    return f"data:image/jpeg;base64,{b64}"


async def click(page, x, y, button="left", count=1):
    await page.mouse.click(x, y, button=button, click_count=count)


async def drag(page, points):
    await page.mouse.move(*points[0])
    await page.mouse.down()
    for p in points[1:]:
        await page.mouse.move(*p, steps=8)
    await page.mouse.up()


async def scroll(page, x, y, dx, dy):
    await page.mouse.move(x, y)
    await page.mouse.wheel(dx, dy)


async def navigate(page, url):
    reason = await request_blocked(url)
    if reason:
        raise ValueError(f"navigation blocked: {reason}")
    await page.goto(url, wait_until="domcontentloaded", timeout=15000)


async def unsupported(kind):
    raise ValueError(f"unsupported action '{kind}'")


class Turn:
    """Per-run state for a computer-use loop (adapters are shared singletons)."""

    def __init__(self, session: BrowserSession, client: httpx.AsyncClient, key: str, vendor: str):
        self.s, self.client, self.key, self.vendor, self.n = session, client, key, vendor, 0

    @property
    def out_of_steps(self) -> bool:
        return self.n >= self.s.max_steps

    async def call(self, url: str, headers: dict, body: dict) -> dict:
        left = self.s.remaining()
        if left <= 2:
            raise asyncio.TimeoutError
        r = await asyncio.wait_for(self.client.post(url, headers=headers, json=body), timeout=left)
        if r.status_code >= 400:
            raise RuntimeError(f"{self.vendor} API error {r.status_code}: {r.text[:240]}")
        return r.json()

    async def shot(self) -> str:
        _, img = await self.s.screenshot("peek.jpg")
        return base64.b64encode(img).decode()

    async def act(self, action: str, label: str, value, fn, reasoning: str) -> tuple[bool, str, str]:
        self.n += 1
        ok, detail = True, "ok"
        try:
            await fn()
            await self.s.page.wait_for_timeout(350)
            await settle(self.s.page)
        except Exception as exc:  # noqa: BLE001
            ok, detail = False, str(exc).split("\n")[0][:220]
        shot_url, img = await self.s.screenshot(f"step-{self.n:02d}.jpg")
        await self.s.record(Step(n=self.n, at=now_iso(), action=action, target_label=str(label)[:120], value=str(value)[:300],
                                 reasoning=str(reasoning)[:600], ok=ok, detail=detail, url=self.s.page.url, screenshot=shot_url))
        return ok, base64.b64encode(img).decode(), detail

    async def finish(self, text: str) -> AdapterOutcome:
        match = CODE_RE.search((text or "").upper())
        answer = match.group(0) if match else (text or "").strip()[:300]
        self.n += 1
        shot_url, _ = await self.s.screenshot(f"step-{self.n:02d}.jpg")
        await self.s.record(Step(n=self.n, at=now_iso(), action="done" if answer else "fail", value=answer, reasoning=(text or "")[:600],
                                 url=self.s.page.url, screenshot=shot_url))
        return AdapterOutcome("agent_done", answer) if answer else AdapterOutcome("agent_gave_up")


class ComputerUseAdapter(AgentAdapter):
    tier = "champion"
    provider = model_env = ""
    platform_key_ok = False

    @property
    def model(self) -> str:
        return os.environ[self.model_env]

    def required_provider(self, profile: dict):
        return self.provider

    def info(self) -> dict:
        return {**super().info(), "provider": self.provider, "model": self.model}

    async def run(self, session: BrowserSession) -> AdapterOutcome:
        found = await session.resolve_key(self.provider)
        if found["source"] != "user":
            raise KeyMissing(f"{self.name} runs only on your own {PROVIDERS[self.provider]} key. Add it in My Keys.")
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(120)) as client:
                return await self.loop(Turn(session, client, found["key"], self.vendor))
        except asyncio.TimeoutError:
            return AdapterOutcome("timeout")


def claude_action(page, a: dict):
    kind = a.get("action", "")
    x, y = (a.get("coordinate") or [W // 2, H // 2])[:2]
    at = f"({x}, {y})"
    if kind in ("left_click", "right_click", "middle_click", "double_click", "triple_click"):
        button = {"right_click": "right", "middle_click": "middle"}.get(kind, "left")
        count = {"double_click": 2, "triple_click": 3}.get(kind, 1)
        return "click", at, "", lambda: click(page, x, y, button, count)
    if kind == "left_click_drag":
        sx, sy = (a.get("start_coordinate") or [x, y])[:2]
        return "drag", f"({sx}, {sy}) → {at}", "", lambda: drag(page, [(sx, sy), (x, y)])
    if kind == "mouse_move":
        return "move", at, "", lambda: page.mouse.move(x, y)
    if kind == "left_mouse_down":
        return "mouse_down", at, "", lambda: page.mouse.down()
    if kind == "left_mouse_up":
        return "mouse_up", at, "", lambda: page.mouse.up()
    if kind == "type":
        return "type", "", a.get("text", ""), lambda: page.keyboard.type(a.get("text", ""), delay=15)
    if kind in ("key", "hold_key"):
        keys = str(a.get("text", "")).split("+")
        return "key", "", a.get("text", ""), lambda: page.keyboard.press(combo(keys))
    if kind == "scroll":
        d = a.get("scroll_direction", "down")
        amt = int(a.get("scroll_amount") or 3) * 100
        ux, uy = DIRS.get(d, (0, 1))
        return "scroll", f"{d} at {at}", amt, lambda: scroll(page, x, y, ux * amt, uy * amt)
    if kind == "wait":
        s = float(a.get("duration") or 1)
        return "wait", "", f"{s}s", lambda: page.wait_for_timeout(int(min(s, 5) * 1000))
    return kind or "unknown", "", "", lambda: unsupported(kind)


class ClaudeComputerUse(ComputerUseAdapter):
    id, name, vendor, provider, model_env = "claude_computer_use", "Claude Computer Use", "Anthropic", "anthropic", "CLAUDE_CU_MODEL"
    description = "Anthropic's computer-use tool loop (screenshots + pixel actions), run with your Anthropic key."
    look = {"color": "#E8743B", "accent": "#FFF1D6", "accessory": "headset"}

    async def loop(self, t: Turn) -> AdapterOutcome:
        headers = {"x-api-key": t.key, "anthropic-version": "2023-06-01", "anthropic-beta": "computer-use-2025-11-24"}
        tools = [{"type": "computer_20251124", "name": "computer", "display_width_px": W, "display_height_px": H}]
        image = lambda b64: {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64}}  # noqa: E731
        messages = [{"role": "user", "content": [{"type": "text", "text": f"GOAL: {t.s.goal}"}, image(await t.shot())]}]
        while True:
            msg = await t.call("https://api.anthropic.com/v1/messages", headers,
                               {"model": self.model, "max_tokens": 2048, "system": BRIEF, "tools": tools, "messages": messages})
            messages.append({"role": "assistant", "content": msg["content"]})
            text = " ".join(b.get("text", "") for b in msg["content"] if b.get("type") == "text").strip()
            uses = [b for b in msg["content"] if b.get("type") == "tool_use"]
            if not uses:
                return await t.finish(text)
            results = []
            for b in uses:
                a = b.get("input") or {}
                if a.get("action") in ("screenshot", "zoom"):
                    results.append({"type": "tool_result", "tool_use_id": b["id"], "content": [image(await t.shot())]})
                    continue
                if t.out_of_steps:
                    return AdapterOutcome("max_steps")
                ok, img, detail = await t.act(*claude_action(t.s.page, a), text or a.get("action", ""))
                content = [image(img)] if ok else [{"type": "text", "text": f"Error: {detail}"}, image(img)]
                results.append({"type": "tool_result", "tool_use_id": b["id"], "content": content})
            messages.append({"role": "user", "content": results})


def openai_action(page, a: dict):
    kind = a.get("type", "")
    x, y = a.get("x", 0), a.get("y", 0)
    at = f"({x}, {y})"
    if kind in ("click", "double_click"):
        button = {"right": "right", "wheel": "middle"}.get(a.get("button", "left"), "left")
        return "click", at, "", lambda: click(page, x, y, button, 2 if kind == "double_click" else 1)
    if kind == "drag":
        pts = [(p["x"], p["y"]) if isinstance(p, dict) else tuple(p[:2]) for p in a.get("path") or []]
        if len(pts) < 2:
            return "drag", "", "", lambda: unsupported("drag without path")
        return "drag", f"{pts[0]} → {pts[-1]}", "", lambda: drag(page, pts)
    if kind == "move":
        return "move", at, "", lambda: page.mouse.move(x, y)
    if kind == "scroll":
        dx, dy = a.get("scroll_x", 0), a.get("scroll_y", 0)
        return "scroll", at, f"{dx},{dy}", lambda: scroll(page, x, y, dx, dy)
    if kind == "keypress":
        keys = a.get("keys") or []
        return "key", "", "+".join(keys), lambda: page.keyboard.press(combo(keys))
    if kind == "type":
        return "type", "", a.get("text", ""), lambda: page.keyboard.type(a.get("text", ""), delay=15)
    if kind == "wait":
        return "wait", "", "2s", lambda: page.wait_for_timeout(2000)
    return kind or "unknown", "", "", lambda: unsupported(kind)


class OpenAIComputerUse(ComputerUseAdapter):
    id, name, vendor, provider, model_env = "openai_computer_use", "OpenAI Computer Use", "OpenAI", "openai", "OPENAI_CU_MODEL"
    description = "OpenAI's computer tool on the Responses API (batched actions per turn), run with your OpenAI key."
    look = {"color": "#10A37F", "accent": "#E7FFF5", "accessory": "goggles"}

    async def loop(self, t: Turn) -> AdapterOutcome:
        headers = {"Authorization": f"Bearer {t.key}"}
        base = {"model": self.model, "tools": [{"type": "computer"}], "instructions": BRIEF}
        body = {**base, "input": [{"role": "user", "content": [
            {"type": "input_text", "text": f"GOAL: {t.s.goal}"},
            {"type": "input_image", "image_url": data_url(await t.shot()), "detail": "original"}]}]}
        while True:
            r = await t.call("https://api.openai.com/v1/responses", headers, body)
            output = r.get("output") or []
            text = " ".join(c.get("text", "") for o in output if o.get("type") == "message"
                            for c in o.get("content") or [] if c.get("type") == "output_text").strip()
            call = next((o for o in output if o.get("type") == "computer_call"), None)
            if not call:
                return await t.finish(text)
            img = None
            for a in call.get("actions") or [call.get("action") or {}]:
                if a.get("type") == "screenshot":
                    continue
                if t.out_of_steps:
                    return AdapterOutcome("max_steps")
                _, img, _ = await t.act(*openai_action(t.s.page, a), text or "computer action")
            out = {"type": "computer_call_output", "call_id": call["call_id"],
                   "output": {"type": "computer_screenshot", "image_url": data_url(img or await t.shot()), "detail": "original"}}
            if call.get("pending_safety_checks"):
                out["acknowledged_safety_checks"] = call["pending_safety_checks"]
            body = {**base, "previous_response_id": r["id"], "input": [out]}


PASSIVE = {"open_web_browser", "take_screenshot", "search", "open_app"}
CLICKS = {"click": ("left", 1), "click_at": ("left", 1), "double_click": ("left", 2), "triple_click": ("left", 3),
          "right_click": ("right", 1), "middle_click": ("middle", 1)}


def gemini_action(page, name: str, a: dict):
    nx, ny = (lambda v: int(float(v) / 1000 * W)), (lambda v: int(float(v) / 1000 * H))
    x, y = nx(a.get("x", 500)), ny(a.get("y", 500))
    at = f"({x}, {y})"
    if name in CLICKS:
        button, count = CLICKS[name]
        return "click", at, "", lambda: click(page, x, y, button, count)
    if name in ("move", "hover_at"):
        return "move", at, "", lambda: page.mouse.move(x, y)
    if name in ("mouse_down", "mouse_up"):
        return name, at, "", lambda: (page.mouse.move(x, y), getattr(page.mouse, name.split("_")[1])())[1]
    if name in ("type", "type_text_at"):
        text = a.get("text", "")
        enter = a.get("press_enter", name == "type_text_at")
        clear = a.get("clear_before_typing", name == "type_text_at")

        async def typing():
            if "x" in a:
                await page.mouse.click(x, y)
            if clear:
                await page.keyboard.press("Control+A")
                await page.keyboard.press("Backspace")
            await page.keyboard.type(text, delay=15)
            if enter:
                await page.keyboard.press("Enter")
        return "type", at if "x" in a else "", text, typing
    if name in ("press_key", "hotkey", "key_combination"):
        keys = [a.get("key", "")] if name == "press_key" else a.get("keys") or [] if name == "hotkey" else str(a.get("keys", "")).split("+")
        return "key", "", "+".join(map(str, keys)), lambda: page.keyboard.press(combo(keys))
    if name in ("scroll", "scroll_at", "scroll_document"):
        d = a.get("direction", "down")
        amt = int(a.get("magnitude_in_pixels") or 300) if name == "scroll" else ny(a.get("magnitude") or 800) if name == "scroll_at" else 600
        if name == "scroll_document":
            x, y = W // 2, H // 2
        ux, uy = DIRS.get(d, (0, 1))
        return "scroll", f"{d} at ({x}, {y})", amt, lambda: scroll(page, x, y, ux * amt, uy * amt)
    if name == "drag_and_drop":
        sx, sy = nx(a.get("start_x", a.get("x", 0))), ny(a.get("start_y", a.get("y", 0)))
        ex, ey = nx(a.get("end_x", a.get("destination_x", 0))), ny(a.get("end_y", a.get("destination_y", 0)))
        return "drag", f"({sx}, {sy}) → ({ex}, {ey})", "", lambda: drag(page, [(sx, sy), (ex, ey)])
    if name == "navigate":
        return "navigate", "", a.get("url", ""), lambda: navigate(page, a.get("url", ""))
    if name in ("go_back", "go_forward"):
        return name, "", "", lambda: getattr(page, name)(wait_until="domcontentloaded", timeout=10000)
    if name in ("wait", "wait_5_seconds"):
        s = 5 if name == "wait_5_seconds" else float(a.get("seconds") or 1)
        return "wait", "", f"{s}s", lambda: page.wait_for_timeout(int(min(s, 5) * 1000))
    return name or "unknown", "", "", lambda: unsupported(name)


class GeminiComputerUse(ComputerUseAdapter):
    id, name, vendor, provider, model_env = "gemini_computer_use", "Gemini Computer Use", "Google", "gemini", "GEMINI_CU_MODEL"
    description = "Google's Gemini computer-use tool (normalized 0-999 coordinates), run with your Gemini key."
    look = {"color": "#4D8BFF", "accent": "#FFD23F", "accessory": "crown"}

    async def loop(self, t: Turn) -> AdapterOutcome:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent"
        headers = {"x-goog-api-key": t.key}
        jpeg = lambda b64: {"inline_data": {"mime_type": "image/jpeg", "data": b64}}  # noqa: E731
        contents = [{"role": "user", "parts": [{"text": f"GOAL: {t.s.goal}"}, jpeg(await t.shot())]}]
        while True:
            r = await t.call(url, headers, {"system_instruction": {"parts": [{"text": BRIEF}]}, "contents": contents,
                                            "tools": [{"computer_use": {"environment": "ENVIRONMENT_BROWSER"}}]})
            cands = r.get("candidates") or []
            if not cands or not cands[0].get("content"):
                raise RuntimeError(f"Gemini returned no candidate: {json.dumps(r.get('promptFeedback') or cands[:1])[:200]}")
            content = cands[0]["content"]
            content.setdefault("role", "model")
            contents.append(content)
            parts = content.get("parts") or []
            text = " ".join(p["text"] for p in parts if p.get("text") and not p.get("thought")).strip()
            calls = [p.get("functionCall") or p.get("function_call") for p in parts if p.get("functionCall") or p.get("function_call")]
            if not calls:
                return await t.finish(text)
            replies = []
            for fc in calls:
                name, args = fc.get("name", ""), fc.get("args") or {}
                if name in PASSIVE:
                    ok, img, detail = True, await t.shot(), "ok"
                else:
                    if t.out_of_steps:
                        return AdapterOutcome("max_steps")
                    ok, img, detail = await t.act(*gemini_action(t.s.page, name, args), args.get("intent") or text or name)
                resp = {"url": t.s.page.url}
                if not ok:
                    resp["error"] = detail
                if args.get("safety_decision"):
                    resp["safety_acknowledgement"] = "true"
                fr = {"name": name, "response": resp, "parts": [jpeg(img)]}
                if fc.get("id"):
                    fr["id"] = fc["id"]
                replies.append({"function_response": fr})
            contents.append({"role": "user", "parts": replies})


class OwnEndpoint(AgentAdapter):
    id, name, vendor, tier = "own_endpoint", "Your Agent Endpoint", "You", "external"
    description = "We POST the course URL + goal to your webhook (HMAC-signed with your secret); you return the finish code and steps."
    look = {"color": "#9A6BFF", "accent": "#C8F560", "accessory": "cap"}

    async def run(self, session: BrowserSession) -> AdapterOutcome:
        doc = await db.agent_endpoints.find_one({"user_id": session.user_id})
        if not doc:
            raise KeyMissing("Connect your agent endpoint in My Keys first.")
        reason = await request_blocked(doc["url"])
        if reason:
            raise RuntimeError(f"Endpoint URL blocked: {reason}")
        body = json.dumps({"event": "run.start", "url": session.public_url, "goal": session.goal, "max_steps": session.max_steps,
                           "deadline_s": int(session.remaining())}, separators=(",", ":"))
        ts = str(int(time.time()))
        sig = hmac.new(decrypt(doc["secret_cipher"]).encode(), f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()
        async with httpx.AsyncClient(timeout=max(session.remaining(), 1.0), follow_redirects=False) as client:
            r = await client.post(doc["url"], content=body, headers={"Content-Type": "application/json", "X-SOE-Timestamp": ts,
                                                                     "X-SOE-Signature": f"sha256={sig}"})
        if r.status_code >= 400:
            raise RuntimeError(f"Your endpoint answered HTTP {r.status_code}.")
        try:
            data = r.json()
        except ValueError:
            data = None
        if not isinstance(data, dict):
            raise RuntimeError("Your endpoint must return a JSON object like {\"answer\": \"SOE-…\", \"steps\": [...]}.")
        for i, s in enumerate((data.get("steps") or [])[:session.max_steps], 1):
            s = s if isinstance(s, dict) else {"action": str(s)}
            await session.record(Step(n=i, at=now_iso(), action=str(s.get("action") or "step")[:30], target_label=str(s.get("target") or "")[:120],
                                      value=str(s.get("value") or "")[:300], reasoning=str(s.get("reasoning") or "")[:600],
                                      url=str(s.get("url") or "")[:500], ok=bool(s.get("ok", True))))
        answer = str(data.get("answer") or "").strip()[:300]
        return AdapterOutcome("agent_done", answer) if answer else AdapterOutcome("agent_gave_up")
