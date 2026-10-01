import json
import re
import sys

import requests

B = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8001/api"
ORDER = ["entry", "current", "maze", "crates", "tide", "cave", "lookalike", "finish"]


def cfg_of(html: str) -> dict:
    return json.loads(re.search(r'<script id="course-config" type="application/json">(.*?)</script>', html, re.S).group(1).replace("<\\/", "</"))


def answer(station: str, p: dict):
    if station == "current":
        return p["target"]
    if station == "maze":
        d = next(x for x in p["dirs"] if x in p["instruction"])
        return f"{d}|" + next(x for x in p["passages"][d] if x in p["instruction"])
    if station == "crates":
        heavy = "heaviest first" in p["rule"]
        return ",".join(c["id"] for c in sorted(p["crates"], key=lambda c: c["kg"], reverse=heavy))
    if station == "cave":
        return p["word"]
    if station == "lookalike":
        return p["serial"]
    return None


r = requests.get(f"{B}/courses/kelp-2/entry", allow_redirects=False)
aid = r.headers["location"].split("a=")[1]
seen = set()
for st in ORDER:
    c = cfg_of(requests.get(f"{B}/courses/kelp-2/{st}?a={aid}").text)
    seen.add(json.dumps(c["puzzle"]["ids"]))
    if st == "maze":
        bad = requests.post(f"{B}/course-attempts/{aid}/clear", json={"station": st, "nonce": c["nonce"], "answer": "North|Nowhere"})
        print("wrong answer", bad.status_code, bad.json()["detail"][:40])
    res = requests.post(f"{B}/course-attempts/{aid}/clear", json={"station": st, "nonce": c["nonce"], "answer": answer(st, c["puzzle"])})
    print(st, res.status_code, res.json().get("code") or res.json().get("next_path", "")[-30:])
print("status", requests.get(f"{B}/course-attempts/{aid}").json()["decoys"], "unique id sets", len(seen))
r2 = requests.get(f"{B}/courses/kelp-2/entry", allow_redirects=False).headers["location"].split("a=")[1]
c2 = cfg_of(requests.get(f"{B}/courses/kelp-2/entry?a={r2}").text)
print("different seed ids", c2["puzzle"]["ids"]["a"] != cfg_of(requests.get(f"{B}/courses/kelp-2/finish?a={aid}").text)["puzzle"]["ids"]["a"])
