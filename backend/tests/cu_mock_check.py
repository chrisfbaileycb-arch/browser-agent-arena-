import asyncio
import sys
import time

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv  # noqa: E402

load_dotenv("/app/backend/.env")
from playwright.async_api import async_playwright  # noqa: E402

from adapters import ADAPTERS, BrowserSession  # noqa: E402
from adapters.computer_use import Turn  # noqa: E402

SCRIPTS = {
    "claude_computer_use": [
        {"content": [{"type": "text", "text": "Clicking"}, {"type": "tool_use", "id": "t1", "name": "computer", "input": {"action": "left_click", "coordinate": [100, 30]}}]},
        {"content": [{"type": "tool_use", "id": "t2", "name": "computer", "input": {"action": "type", "text": "hi"}}, {"type": "tool_use", "id": "t3", "name": "computer", "input": {"action": "key", "text": "ctrl+a"}}]},
        {"content": [{"type": "text", "text": "Done: soe-ab12-cd34"}]},
    ],
    "openai_computer_use": [
        {"id": "r1", "output": [{"type": "computer_call", "call_id": "c1", "actions": [{"type": "screenshot"}, {"type": "click", "button": "left", "x": 100, "y": 30}, {"type": "type", "text": "yo"}, {"type": "keypress", "keys": ["CTRL", "A"]}, {"type": "scroll", "x": 5, "y": 5, "scroll_x": 0, "scroll_y": 200}]}]},
        {"id": "r2", "output": [{"type": "message", "content": [{"type": "output_text", "text": "Code SOE-AB12-CD34"}]}]},
    ],
    "gemini_computer_use": [
        {"candidates": [{"content": {"role": "model", "parts": [{"functionCall": {"name": "click", "args": {"x": 80, "y": 40, "intent": "focus"}}}, {"functionCall": {"name": "type_text_at", "args": {"x": 80, "y": 40, "text": "gem", "press_enter": False}}}]}}]},
        {"candidates": [{"content": {"role": "model", "parts": [{"functionCall": {"name": "scroll_document", "args": {"direction": "down"}}}, {"functionCall": {"name": "open_web_browser", "args": {}}}]}}]},
        {"candidates": [{"content": {"role": "model", "parts": [{"text": "SOE-AB12-CD34"}]}}]},
    ],
}


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=["--no-sandbox"])
        for aid, script in SCRIPTS.items():
            page = await browser.new_page(viewport={"width": 1280, "height": 800})
            await page.set_content("<input id=i style='margin:20px'><div style='height:3000px'></div>")
            steps, bodies = [], []
            queue = list(script)

            async def fake_call(self, url, headers, body, queue=queue, bodies=bodies):
                bodies.append(body)
                return queue.pop(0)

            Turn.call = fake_call

            async def shot(name, page=page):
                return f"/x/{name}", await page.screenshot(type="jpeg", quality=40)

            async def record(step, steps=steps):
                steps.append(step)

            async def key(p):
                return {"key": "k", "source": "user"}

            start = time.monotonic()
            s = BrowserSession(page=page, goal="test", max_steps=10, remaining=lambda: 60 - (time.monotonic() - start), screenshot=shot,
                               record=record, resolve_key=key)
            out = await ADAPTERS[aid].run(s)
            val = await page.eval_on_selector("#i", "e => e.value")
            print(aid, out, "input=", repr(val), [(st.action, st.ok, st.detail) for st in steps])
            print("  last request keys:", list(bodies[-1].keys()), str(bodies[-1].get("input") or bodies[-1].get("contents", [])[-1:] or bodies[-1]["messages"][-1])[:260])
        await browser.close()

asyncio.run(main())
