import random
import string
from typing import Optional

PASSAGES = ["Eel Tunnel", "Sunbeam Gap", "Urchin Arch", "Otter Slide", "Seagrass Run", "Barnacle Pass", "Pearl Hollow", "Driftwood Gate"]
CRATES = ["Anchor", "Lantern", "Rope Coil", "Pearl Chest", "Sea Glass", "Net Bundle", "Brass Bell", "Ship Biscuits"]
WORDS = ["MARLIN", "NAUTILUS", "ABALONE", "SEAFOAM", "LAGOON", "TRITON", "MANTA", "COWRIE", "SARGASSO", "OCTAVE"]
LOOKS = ["Surface here", "Surface Here", "Surface here!", "Surface  here", "Surface-here", "Surfase here"]
TAG_CHARS, TAG_DIGITS = "ABCDEFGHJKMNPQRSTUVWXYZ", "23456789"


def _id(r: random.Random) -> str:
    return r.choice(string.ascii_lowercase) + "".join(r.choice(string.ascii_lowercase + string.digits) for _ in range(7))


def _tag(r: random.Random) -> str:
    return "".join(r.choice(TAG_CHARS) for _ in range(2)) + "-" + "".join(r.choice(TAG_DIGITS) for _ in range(2))


def _near(r: random.Random, tag: str) -> str:
    chars = list(tag)
    i = r.choice([0, 1, 3, 4])
    pool = TAG_CHARS if i < 2 else TAG_DIGITS
    chars[i] = r.choice([c for c in pool if c != chars[i]])
    return "".join(chars)


def _tags(r: random.Random, n: int, make) -> list[str]:
    out: list[str] = []
    while len(out) < n:
        t = make()
        if t not in out:
            out.append(t)
    return out


def puzzle(seed: str, station: str) -> tuple[dict, Optional[str]]:
    """Per-attempt station content (wording, order, decoys, ids) and the answer the server expects at /clear."""
    r = random.Random(f"{seed}:{station}")
    ids = {k: _id(r) for k in "abcdefgh"}
    if station == "entry":
        return {"ids": ids, "title": r.choice(["Glow-Snack Club!", "Jellyfish Express Pass", "VIP Current Ride"]),
                "bait": r.choice(["Accept & continue", "Yes, take me to the finish", "Claim my free ride"]),
                "dismiss": r.choice(["No thanks, close this", "Close the offer", "Dismiss and keep swimming"]),
                "enter": r.choice(["Enter the kelp forest", "Swim into the forest", "Begin the circuit"]), "bait_first": r.random() < 0.5}, None
    if station == "current":
        tags = _tags(r, 40, lambda: _tag(r))
        target = tags[r.randint(22, 36)]
        return {"ids": ids, "tags": tags, "target": target, "batch": 8, "verb": r.choice(["Grab", "Clip", "Hook"])}, target
    if station == "maze":
        dirs = ["North", "East", "South", "West"]
        passages = {d: r.sample(PASSAGES, 4) for d in dirs}
        d = r.choice(dirs)
        p = r.choice(passages[d])
        text = r.choice(["Swim {d}, then take the {p}.", "Head {d} and slip through the {p}.", "Go {d}; the {p} is the only safe passage."])
        return {"ids": ids, "dirs": r.sample(dirs, 4), "passages": passages, "instruction": text.format(d=d, p=p)}, f"{d}|{p}"
    if station == "crates":
        crates = [{"id": _id(r), "name": n, "kg": w} for n, w in zip(r.sample(CRATES, 4), r.sample(range(3, 98), 4))]
        heaviest = r.random() < 0.5
        order = sorted(crates, key=lambda c: c["kg"], reverse=heaviest)
        rule = "Stack the crates heaviest first (heaviest at the bottom)." if heaviest else "Stack the crates lightest first (lightest at the bottom)."
        return {"ids": ids, "crates": crates, "rule": rule}, ",".join(c["id"] for c in order)
    if station == "tide":
        return {"ids": ids, "open_s": 6, "cycle_s": 10, "offset": r.randint(0, 9),
                "swim": r.choice(["Swim through the gate", "Ride the tide through", "Slip past the gate"]),
                "bait": r.choice(["Force the gate open", "Smash the gate", "Pry the bars apart"])}, None
    if station == "cave":
        word, fake = r.sample(WORDS, 2)
        return {"ids": ids, "word": word, "fake": fake}, word
    if station == "lookalike":
        serial = _tag(r)
        serials = [serial] + _tags(r, 5, lambda: _near(r, serial))
        labels = r.sample(LOOKS, 6)
        buttons = [{"id": _id(r), "label": labels[i], "serial": s} for i, s in enumerate(serials)]
        r.shuffle(buttons)
        return {"ids": ids, "serial": serial, "buttons": buttons}, serial
    return {"ids": ids, "label": r.choice(["Ring the surface buoy", "Pull the buoy bell", "Signal the surface"])}, None
