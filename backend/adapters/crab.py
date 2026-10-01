import asyncio
import base64
import re
import time
from datetime import datetime, timezone

from adapters.base import AdapterOutcome, AgentAdapter, BrowserSession
from llm import MODELS, ask_json
from models import Step

OBSERVE_JS = r"""() => {
  const vw = innerWidth, vh = innerHeight;
  document.querySelectorAll('[data-crab-id]').forEach(e => e.removeAttribute('data-crab-id'));
  const shown = el => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.right <= 0 || r.top >= vh || r.left >= vw) return null;
    return r;
  };
  const clean = t => (t || '').replace(/\s+/g, ' ').trim();
  const label = el => clean(el.getAttribute('aria-label') || el.innerText || el.value || el.placeholder || el.title || el.name).slice(0, 90);
  const elements = [];
  let i = 0;
  for (const el of document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=link],[onclick],summary')) {
    const r = shown(el); if (!r) continue;
    const top = document.elementFromPoint(Math.min(Math.max(r.left + r.width / 2, 1), vw - 1), Math.min(Math.max(r.top + r.height / 2, 1), vh - 1));
    const reachable = top && (top === el || el.contains(top) || top.contains(el) || (top.tagName === 'LABEL' && top.control === el));
    if (!reachable) continue;
    const id = 'c' + (++i); el.setAttribute('data-crab-id', id);
    const item = { id, tag: el.tagName.toLowerCase(), text: label(el) };
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) {
      item.type = el.type; item.value = String(el.value).slice(0, 60);
      if (el.labels && el.labels[0]) item.label = clean(el.labels[0].innerText).slice(0, 160);
    }
    if (el.tagName === 'SELECT') item.options = [...el.options].map(o => clean(o.text)).slice(0, 25);
    if (el.disabled) item.disabled = true;
    elements.push(item);
    if (elements.length >= 60) break;
  }
  const scrollables = [];
  let j = 0;
  for (const el of document.querySelectorAll('body *')) {
    if (scrollables.length >= 8) break;
    const s = getComputedStyle(el);
    const sy = /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 4;
    const sx = /(auto|scroll)/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 4;
    if (!(sy || sx) || !shown(el)) continue;
    const id = 's' + (++j); el.setAttribute('data-crab-id', id);
    scrollables.push({ id, tag: el.tagName.toLowerCase(), name: clean(el.getAttribute('aria-label') || el.id || String(el.className)).slice(0, 40),
      axis: sy && sx ? 'both' : sy ? 'vertical' : 'horizontal',
      y: Math.round(el.scrollTop) + '/' + (el.scrollHeight - el.clientHeight), x: Math.round(el.scrollLeft) + '/' + (el.scrollWidth - el.clientWidth) });
  }
  const se = document.scrollingElement || document.documentElement;
  return { url: location.href, title: document.title, elements, scrollables,
    page: { scrollY: Math.round(scrollY), maxScroll: Math.max(0, se.scrollHeight - vh) },
    text: (document.body ? document.body.innerText : '').replace(/\n\s*\n+/g, '\n').slice(0, 3000) };
}"""

SYSTEM = """You are Crab, an autonomous browser agent in the "Steps of Execution" arena.
Each turn you get a screenshot of the current viewport, the interactive elements visible RIGHT NOW (ids like c3), and scrollable regions (ids like s1).
Elements hidden behind a scroll or not yet revealed are NOT listed; scroll to reveal them. Beware of decoys: buttons that look like the obvious path but contradict the page's written instructions. Read instructions carefully and follow them exactly. Clicking may load a new page.
Choose exactly ONE action per turn and respond with ONLY a JSON object:
{"reasoning": "<1-2 short sentences>", "action": "click|type|select|scroll|wait|done|fail", "target": "<element id or empty>", "value": "<text to type | option label to select | final answer for done>", "submit": false, "direction": "down|up|left|right", "amount": 600, "ms": 1500}
Rules: target must be an id from the lists. type replaces the field's content (set submit true to press Enter afterwards). To scroll inside a region use its s-id and a direction matching its axis; an empty target scrolls the whole page. wait pauses up to 5000 ms.
Use done only when the goal is achieved and put the requested answer (e.g. the exact success code) in value. Use fail only if the goal is impossible."""


def describe(obs: dict) -> tuple[str, str]:
    lines = []
    for el in obs["elements"]:
        parts = [f"[{el['id']}] {el['tag']}"]
        if el.get("type"):
            parts.append(f"type={el['type']}")
        parts.append(f"\"{el['text']}\"")
        if el.get("label"):
            parts.append(f"label=\"{el['label']}\"")
        if "value" in el:
            parts.append(f"value=\"{el['value']}\"")
        if el.get("options"):
            parts.append(f"options={el['options']}")
        if el.get("disabled"):
            parts.append("DISABLED")
        lines.append(" ".join(parts))
    scroll = [f"[{s['id']}] {s['tag']} \"{s['name']}\" {s['axis']} scrollY={s['y']} scrollX={s['x']}" for s in obs["scrollables"]]
    return "\n".join(lines) or "(none)", "\n".join(scroll) or "(none)"


def build_prompt(goal: str, obs: dict, history: list[str], n: int, max_steps: int, remaining: float) -> str:
    elements, scrollables = describe(obs)
    return (
        f"GOAL: {goal}\nStep {n} of {max_steps}; {remaining:.0f}s left.\n"
        f"URL: {obs['url']}\nTitle: {obs['title']}\n\n"
        f"RECENT ACTIONS:\n{chr(10).join(history[-8:]) or '(none yet)'}\n\n"
        f"INTERACTIVE ELEMENTS IN VIEW:\n{elements}\n\nSCROLLABLE REGIONS:\n{scrollables}\n"
        f"PAGE SCROLL: {obs['page']['scrollY']}/{obs['page']['maxScroll']}\n\n"
        f"VISIBLE PAGE TEXT:\n{obs['text']}"
    )


async def settle(page) -> None:
    try:
        await page.wait_for_load_state("domcontentloaded", timeout=5000)
    except Exception:  # noqa: BLE001
        pass


async def observe(page) -> dict:
    for attempt in range(4):
        try:
            return await page.evaluate(OBSERVE_JS)
        except Exception:  # noqa: BLE001 - page navigated mid-evaluate
            if attempt == 3:
                raise
            await page.wait_for_timeout(400)
            await settle(page)


async def perform(page, decision: dict) -> tuple[bool, str]:
    action = str(decision.get("action", "")).lower()
    target = str(decision.get("target") or "").strip()
    value = str(decision.get("value") if decision.get("value") is not None else "")
    loc = page.locator(f'[data-crab-id="{target}"]').first if target else None
    try:
        if action in ("click", "type", "select") and (not loc or await loc.count() == 0):
            return False, f"target '{target}' not found on page"
        if action == "click":
            await loc.click(timeout=5000)
        elif action == "type":
            await loc.fill(value, timeout=5000)
            if decision.get("submit") is True:
                await loc.press("Enter", timeout=3000)
        elif action == "select":
            try:
                await loc.select_option(label=value, timeout=4000)
            except Exception:  # noqa: BLE001
                await loc.select_option(value=value, timeout=4000)
        elif action == "scroll":
            amount = abs(int(decision.get("amount") or 600))
            direction = decision.get("direction") or "down"
            dx = amount if direction == "right" else -amount if direction == "left" else 0
            dy = amount if direction == "down" else -amount if direction == "up" else 0
            if loc and await loc.count():
                await loc.evaluate("(el, d) => el.scrollBy(d[0], d[1])", [dx, dy])
            else:
                await page.mouse.wheel(dx, dy)
        elif action == "wait":
            await page.wait_for_timeout(max(200, min(int(decision.get("ms") or 1500), 5000)))
        elif action in ("done", "fail"):
            return True, "agent finished"
        else:
            return False, f"unknown action '{action}'"
        await page.wait_for_timeout(350)
        await settle(page)
        return True, "ok"
    except Exception as exc:  # noqa: BLE001
        return False, str(exc).split("\n")[0][:220]


def label_for(obs: dict, target: str) -> str:
    for item in obs["elements"] + obs["scrollables"]:
        if item["id"] == target:
            return item.get("text") or item.get("name") or ""
    return ""


def station_of(url: str) -> str:
    match = re.search(r"/courses/[^/]+/([a-z]+)", url or "")
    return match.group(1) if match else ""


def system_for(profile: dict) -> str:
    system = SYSTEM
    if profile.get("name"):
        system += f"\n\nYou are the crab named {profile['name']}. Personality: {profile.get('personality', 'focused')}."
    if profile.get("system_prompt"):
        system += f"\nOwner instructions: {profile['system_prompt'][:1500]}"
    if profile.get("memory"):
        system += "\nWhat worked in your previous runs:\n- " + "\n- ".join(profile["memory"][-6:])
    return system


class CrabAdapter(AgentAdapter):
    id, name, vendor = "crab", "Custom Crab", "Steps of Execution"
    description = "Our own observe → decide → act loop (simplified DOM + screenshot, one action per step)."

    def required_provider(self, profile: dict) -> str:
        return profile.get("provider") or "gemini"

    async def run(self, session: BrowserSession) -> AdapterOutcome:
        outcome, _ = await self.loop(session, session.profile)
        return outcome

    async def loop(self, session: BrowserSession, profile: dict, start_n: int = 1, stop=None, meta=None,
                   history=None) -> tuple[AdapterOutcome, int]:
        """Runs one crab from step start_n; `stop(station)` returning True hands the browser to the next relay leg."""
        page, history, meta = session.page, history or [], meta or {}
        provider = self.required_provider(profile)
        model = profile.get("model") if profile.get("model") in MODELS[provider] else MODELS[provider][0]
        api_key = (await session.resolve_key(provider))["key"]
        system = system_for(profile)
        for n in range(start_n, session.max_steps + 1):
            remaining = session.remaining()
            if remaining <= 1:
                return AdapterOutcome("timeout"), n - 1
            if session.pull_hints:
                history += [f"COACH SHOUT from your owner (follow it unless the page instructions contradict it): {h}" for h in await session.pull_hints()]
            obs = await observe(page)
            if stop and stop(station_of(obs["url"])):
                return AdapterOutcome("handoff"), n - 1
            shot_url, shot = await session.screenshot(f"step-{n:02d}.jpg")
            t0 = time.monotonic()
            try:
                decision = await asyncio.wait_for(ask_json(system, build_prompt(session.goal, obs, history, n, session.max_steps, remaining),
                                                           base64.b64encode(shot).decode(), provider=provider, model=model, api_key=api_key),
                                                  timeout=remaining)
            except asyncio.TimeoutError:
                return AdapterOutcome("timeout"), n - 1
            except Exception as exc:  # noqa: BLE001
                decision = {"action": "invalid", "reasoning": f"LLM error: {str(exc)[:160]}"}
            llm_ms = int((time.monotonic() - t0) * 1000)
            ok, detail = await perform(page, decision)
            action, target = str(decision.get("action", "")).lower(), str(decision.get("target") or "")
            step = Step(n=n, at=datetime.now(timezone.utc).isoformat(), action=action, target=target, target_label=label_for(obs, target),
                        value=str(decision.get("value") or "")[:300], reasoning=str(decision.get("reasoning") or "")[:600],
                        ok=ok, detail=detail, url=obs["url"], screenshot=shot_url, llm_ms=llm_ms, **meta)
            await session.record(step)
            history.append(f"Step {n}: {action} {target} ({step.target_label}) value='{step.value}' -> {'ok' if ok else 'ERROR ' + detail}")
            if action == "done":
                return AdapterOutcome("agent_done", step.value), n
            if action == "fail":
                return AdapterOutcome("agent_gave_up"), n
        return AdapterOutcome("max_steps"), session.max_steps
