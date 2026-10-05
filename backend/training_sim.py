"""Deterministic Training Grounds yard simulation. Mirrored 1:1 by frontend/src/training/sim.js."""
DIRS = {"up": (0, -1), "right": (1, 0), "down": (0, 1), "left": (-1, 0)}
ORDER = ["up", "right", "down", "left"]
BLOCK = {"#": "a wall", "C": "a crate", "L": "the lever", "P": "the pole"}
TALL = set("#LP")


def tile(ch: dict, x: int, y: int) -> str:
    rows = ch["grid"]
    return rows[y][x] if 0 <= y < len(rows) and 0 <= x < len(rows[0]) else "#"


def start_state(ch: dict) -> dict:
    x, y, d = ch["start"]
    return {"x": x, "y": y, "dir": d, "h": 0, "claw_up": False, "claw_open": False, "holding": None, "gates": False,
            "actions": 0, "stumbles": 0, "status": "playing"}


def pose(s: dict) -> dict:
    return {k: s[k] for k in ("x", "y", "h", "dir", "claw_up", "claw_open", "holding", "gates")}


def _enter(ch: dict, s: dict, x: int, y: int, how: str):
    t = tile(ch, x, y)
    if t in BLOCK or (t == "G" and not s["gates"]):
        return ("stumble", f"Bumped into {BLOCK.get(t, 'a closed gate')}.")
    if t == "^" and s["h"] == 0 and how != "climb":
        return ("stumble", "That ledge is too high. Climb it.")
    s["x"], s["y"], s["h"] = x, y, 1 if t == "^" else 0
    if t == "Y":
        return ("fail", "Fell into the pit. Climb the rope to swing across.")
    if t == "R":
        return ("fail", "Stepped on a red danger tile.")
    if t == "F" and (not ch.get("need_key") or s["holding"] == "key"):
        return ("success", "Reached the flag!")
    return None


def apply(ch: dict, state: dict, a: dict):
    """Returns (new_state, event, frames)."""
    s = dict(state)
    s["actions"] += 1
    frames = []

    def done(kind: str, msg: str):
        if kind == "stumble":
            s["stumbles"] += 1
        elif kind in ("fail", "success"):
            s["status"] = "failed" if kind == "fail" else "success"
        if kind == "ok" and tile(ch, s["x"], s["y"]) == "F":
            msg += " The flag needs the key from the pole."
        return s, {"kind": kind, "msg": msg}, frames or [pose(s)]

    t = a["type"]
    dx, dy = DIRS[s["dir"]]
    front = tile(ch, s["x"] + dx, s["y"] + dy)
    if t == "move":
        d = a["dir"]
        if d in DIRS:
            s["dir"] = d
        elif d == "back":
            s["dir"] = ORDER[(ORDER.index(s["dir"]) + 2) % 4]
        dx, dy = DIRS[s["dir"]]
        for _ in range(a["n"]):
            ev = _enter(ch, s, s["x"] + dx, s["y"] + dy, "walk")
            frames.append(pose(s))
            if ev:
                return done(*ev)
        return done("ok", f"Moved {d} {a['n']}.")
    if t == "turn":
        s["dir"] = ORDER[(ORDER.index(s["dir"]) + (1 if a["dir"] == "right" else -1)) % 4]
        return done("ok", f"Turned {a['dir']}.")
    if t == "jump":
        if front in TALL or (front == "G" and not s["gates"]) or (front == "^" and s["h"] == 0):
            return done("stumble", "Too tall to jump over.")
        ev = _enter(ch, s, s["x"] + 2 * dx, s["y"] + 2 * dy, "walk")
        return done(*ev) if ev else done("ok", "Jumped.")
    if t == "climb":
        if front == "^" and s["h"] == 0:
            ev = _enter(ch, s, s["x"] + dx, s["y"] + dy, "climb")
            return done(*ev) if ev else done("ok", "Climbed the ledge.")
        if front == "Y":
            ev = _enter(ch, s, s["x"] + 2 * dx, s["y"] + 2 * dy, "walk")
            return done(*ev) if ev else done("ok", "Swung across on the rope.")
        return done("stumble", "Nothing to climb here.")
    if t in ("lift_claw", "lower_claw"):
        s["claw_up"] = t == "lift_claw"
        return done("ok", "Claw up." if s["claw_up"] else "Claw down.")
    if t in ("open_claw", "close_claw"):
        s["claw_open"] = t == "open_claw"
        return done("ok", "Claw open." if s["claw_open"] else "Claw closed.")
    if t == "grab":
        if front != "P":
            return done("stumble", "Nothing to grab here. Face the pole.")
        if not s["claw_up"]:
            return done("stumble", "Lift your claw first: the notches are high.")
        if not s["claw_open"]:
            return done("stumble", "Open your claw first.")
        if s["holding"]:
            return done("stumble", "Your claw is already full.")
        s["claw_open"] = False
        if a["notches"] != ch.get("key_notch"):
            return done("stumble", f"Notch {a['notches']} is empty.")
        s["holding"] = "key"
        return done("ok", f"Got the key from notch {a['notches']}!")
    if t == "release":
        if not s["holding"]:
            return done("ok", "Nothing to release.")
        s["holding"], s["claw_open"] = None, True
        return done("ok", "Released the key.")
    if t == "pull_lever":
        if front != "L":
            return done("stumble", "No lever in front of you.")
        s["gates"] = True
        return done("ok", "Gates open!")
    return done("ok", f"Waited {a.get('n', 1)}.")


def simulate(ch: dict, actions: list) -> tuple[dict, list]:
    s, events = start_state(ch), []
    for a in actions:
        if s["status"] != "playing":
            break
        s, ev, _ = apply(ch, s, a)
        events.append(ev)
    return s, events
