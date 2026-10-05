"""Training Grounds command language: action schema + free local parser."""
import difflib
import re
from typing import Optional

DIR_WORDS = {"up": "up", "north": "up", "down": "down", "south": "down", "left": "left", "west": "left", "right": "right", "east": "right",
             "forward": "forward", "forwards": "forward", "ahead": "forward", "straight": "forward", "back": "back", "backward": "back", "backwards": "back"}
NUMS = {"one": 1, "a": 1, "an": 1, "once": 1, "two": 2, "twice": 2, "three": 3, "thrice": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9}
SIMPLE = {"jump", "climb", "lift_claw", "lower_claw", "open_claw", "close_claw", "release", "pull_lever"}
CANON = ["move right 1", "move left 1", "move up 1", "move down 1", "forward 1", "turn left", "turn right", "jump", "climb",
         "lift claw", "lower claw", "open claw", "close claw", "grab notch 2", "release", "pull lever", "wait 1"]
UNIT = r"(?:\s*(?:steps?|tiles?|squares?|spaces?|times?|blocks?))?"
DIRS_RE = "|".join(DIR_WORDS)
PATTERNS = [
    (re.compile(rf"^(?:go|move|walk|step|scuttle|head|run|crawl)?\s*(?:(\d+){UNIT}\s+)?({DIRS_RE})(?:\s+(\d+))?{UNIT}$"),
     lambda m: {"type": "move", "dir": DIR_WORDS[m[2]], "n": int(m[1] or m[3] or 1)}),
    (re.compile(r"^(?:turn|rotate|spin)\s+(left|right)$"), lambda m: {"type": "turn", "dir": m[1]}),
    (re.compile(r"^(?:jump|hop|leap)(?:\s+(?:over|across))?(?:\s+(?:the\s+)?(?:crate|box|gap|it))?$"), lambda m: {"type": "jump"}),
    (re.compile(r"^(?:climb|scale|swing)(?:\s+(?:up|onto|on|over|across))?(?:\s+(?:the\s+)?(?:ledge|step|rope|it))?$"), lambda m: {"type": "climb"}),
    (re.compile(r"^(lift|raise|lower|drop|open|close|shut)\s+(?:the\s+|your\s+|my\s+)?(?:claws?|pincers?)(?:\s+(?:up|down))?$"),
     lambda m: {"type": {"lift": "lift_claw", "raise": "lift_claw", "lower": "lower_claw", "drop": "lower_claw", "open": "open_claw"}.get(m[1], "close_claw")}),
    (re.compile(r"^claws?\s+(up|down)$"), lambda m: {"type": "lift_claw" if m[1] == "up" else "lower_claw"}),
    (re.compile(r"^(?:grab|grip|grasp|take|pinch|clamp)\b\D*?(\d+)\D*$"), lambda m: {"type": "grab", "target": "pole", "notches": int(m[1])}),
    (re.compile(r"^(?:release|let go|drop(?:\s+(?:the\s+)?key)?)$"), lambda m: {"type": "release"}),
    (re.compile(r"^(?:(?:pull|flip|yank|use)\s+(?:the\s+)?)?lever$"), lambda m: {"type": "pull_lever"}),
    (re.compile(rf"^(?:wait|pause|rest|stay)(?:\s+(\d+))?{UNIT}$"), lambda m: {"type": "wait", "n": int(m[1] or 1)}),
]


def validate_action(a) -> Optional[dict]:
    """Returns a normalized action or None if it doesn't match the schema."""
    if not isinstance(a, dict) or not isinstance(a.get("type"), str):
        return None
    t = a["type"]
    if t in SIMPLE:
        return {"type": t}
    try:
        if t == "move" and a.get("dir") in set(DIR_WORDS.values()) and 1 <= int(a.get("n", 1)) <= 9:
            return {"type": "move", "dir": a["dir"], "n": int(a.get("n", 1))}
        if t == "turn" and a.get("dir") in ("left", "right"):
            return {"type": "turn", "dir": a["dir"]}
        if t == "grab" and 1 <= int(a.get("notches", 0)) <= 4:
            return {"type": "grab", "target": "pole", "notches": int(a["notches"])}
        if t == "wait" and 1 <= int(a.get("n", 1)) <= 5:
            return {"type": "wait", "n": int(a.get("n", 1))}
    except (TypeError, ValueError):
        return None
    return None


def _normalize(text: str) -> str:
    s = re.sub(r"[^a-z0-9\s,;]", " ", text.lower())
    s = re.sub(r"\b(please|now|crab|the crab|okay|ok)\b", " ", s)
    s = re.sub(r"\b(" + "|".join(NUMS) + r")\b", lambda m: str(NUMS[m[1]]), s)
    return re.sub(r"\s+", " ", s).strip()


def _segments(text: str) -> list[str]:
    return [p.strip() for p in re.split(r"\s*(?:,|;|\band then\b|\bthen\b|\band\b)\s*", text) if p.strip()]


def parse_local(text: str) -> Optional[list]:
    segs = _segments(_normalize(text))
    if not segs:
        return None
    out = []
    for seg in segs:
        for rx, build in PATTERNS:
            m = rx.match(seg)
            if m:
                act = validate_action(build(m))
                if not act:
                    return None
                out.append(act)
                break
        else:
            return None
    return out


def suggest(text: str) -> list[str]:
    norm = _normalize(text)
    hits = difflib.get_close_matches(norm, CANON, n=3, cutoff=0.35)
    for word in norm.split():
        hits += [c for c in CANON if c.split()[0] == word or (len(c.split()) > 1 and c.split()[1] == word)]
    seen = []
    for h in hits + ["move right 1", "jump", "lift claw"]:
        if h not in seen:
            seen.append(h)
    return seen[:3]


def describe(a: dict) -> str:
    if a["type"] == "move":
        return f"move({a['dir']}, {a['n']})"
    if a["type"] == "turn":
        return f"turn({a['dir']})"
    if a["type"] == "grab":
        return f"grab(pole, {a['notches']})"
    if a["type"] == "wait":
        return f"wait({a['n']})"
    return f"{a['type']}()"
