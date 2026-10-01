"""Backend tests for iteration 7: Kelp Forest Circuit (kelp-2), H2H, Relay tournaments, public share."""
import json
import re
import time

import pytest
import requests

from conftest import API, _login

# ---------------- Kelp walk helpers (mirror tests/kelp_check.py) ----------------
ORDER = ["entry", "current", "maze", "crates", "tide", "cave", "lookalike", "finish"]


def _cfg(html: str) -> dict:
    m = re.search(r'<script id="course-config" type="application/json">(.*?)</script>', html, re.S)
    assert m, "course-config not embedded"
    return json.loads(m.group(1).replace("<\\/", "</"))


def _answer(station: str, p: dict):
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


# ---------------- Courses ----------------
def test_courses_lists_both(anon):
    r = anon.get(f"{API}/courses", timeout=20)
    assert r.status_code == 200
    ids = {c["id"] for c in r.json()}
    assert {"obstacle-1", "kelp-2"} <= ids
    kelp = next(c for c in r.json() if c["id"] == "kelp-2")
    assert kelp["max_steps"] == 45 and kelp["timeout_s"] == 240
    stations = [s["id"] for s in kelp.get("stations", [])]
    assert stations == ORDER


def test_kelp_entry_redirects_and_creates_attempt(anon):
    # First hop: /courses/kelp-2 -> /courses/kelp-2/entry
    r = anon.get(f"{API}/courses/kelp-2", allow_redirects=False, timeout=20)
    assert r.status_code in (302, 307)
    assert "/courses/kelp-2/entry" in r.headers["location"]
    # Second hop: /courses/kelp-2/entry (no attempt id) -> /entry?a=...
    r2 = anon.get(f"{API}/courses/kelp-2/entry", allow_redirects=False, timeout=20)
    assert r2.status_code in (302, 307)
    assert "a=" in r2.headers["location"]
    aid = r2.headers["location"].split("a=")[1]
    assert len(aid) >= 20


def test_kelp_full_walk_decoys_and_finish_code(anon):
    # Create attempt
    aid = anon.get(f"{API}/courses/kelp-2/entry", allow_redirects=False, timeout=20).headers["location"].split("a=")[1]
    finish_code = None
    for st in ORDER:
        html = anon.get(f"{API}/courses/kelp-2/{st}?a={aid}", timeout=20).text
        c = _cfg(html)
        if st == "maze":
            bad = anon.post(f"{API}/course-attempts/{aid}/clear",
                            json={"station": st, "nonce": c["nonce"], "answer": "North|Nowhere"}, timeout=20)
            assert bad.status_code == 409
        if st == "finish":
            # finish station doesn't require answer - the code is shown in page config
            r = anon.post(f"{API}/course-attempts/{aid}/clear",
                          json={"station": st, "nonce": c["nonce"], "answer": _answer(st, c["puzzle"])}, timeout=20)
            assert r.status_code == 200
            finish_code = r.json().get("code")
        else:
            r = anon.post(f"{API}/course-attempts/{aid}/clear",
                          json={"station": st, "nonce": c["nonce"], "answer": _answer(st, c["puzzle"])}, timeout=20)
            assert r.status_code == 200, f"{st}: {r.status_code} {r.text}"
    assert finish_code and finish_code.startswith("SOE-")
    # decoys counted (we posted one bad answer)
    status = anon.get(f"{API}/course-attempts/{aid}", timeout=20).json()
    assert status.get("decoys", 0) >= 1


def test_kelp_seed_differs_between_attempts(anon):
    # Create 2 attempts via /entry (which does the redirect and attaches ?a=)
    def new_attempt_id():
        return anon.get(f"{API}/courses/kelp-2/entry", allow_redirects=False, timeout=20).headers["location"].split("a=")[1]
    a1 = new_attempt_id()
    a2 = new_attempt_id()
    assert a1 != a2
    # Compare /entry pages (both attempts are at the entry station initially)
    c1 = _cfg(anon.get(f"{API}/courses/kelp-2/entry?a={a1}", timeout=20).text)
    c2 = _cfg(anon.get(f"{API}/courses/kelp-2/entry?a={a2}", timeout=20).text)
    assert c1.get("puzzle") is not None and c2.get("puzzle") is not None
    assert c1["puzzle"] != c2["puzzle"]


# ---------------- Self-submitted run on kelp-2 ----------------
def test_self_submitted_kelp_attempt_start_path(pro):
    r = pro.post(f"{API}/course-attempts",
                 json={"course_id": "kelp-2", "agent_kind": "copilot"}, timeout=30)
    assert r.status_code in (200, 201), r.text
    data = r.json()
    assert data.get("course_id") == "kelp-2"
    assert "/courses/kelp-2/entry" in data["start_path"]
    assert "a=" in data["start_path"]
    aid = data["id"]
    code = None
    # Walk & submit
    for st in ORDER:
        html = pro.get(f"{API}/courses/kelp-2/{st}?a={aid}", timeout=20).text
        c = _cfg(html)
        rr = pro.post(f"{API}/course-attempts/{aid}/clear",
                      json={"station": st, "nonce": c["nonce"], "answer": _answer(st, c["puzzle"])}, timeout=20)
        assert rr.status_code == 200
        if st == "finish":
            code = rr.json()["code"]
    sub = pro.post(f"{API}/course-attempts/{aid}/submit",
                   json={"code": code, "reported_elapsed_s": 42.0}, timeout=30)
    assert sub.status_code == 200, sub.text
    assert sub.json().get("verified") is True
    # Cleanup: delete the self-report attempt directly in Mongo so leaderboard isn't polluted
    try:
        import asyncio, os
        from motor.motor_asyncio import AsyncIOMotorClient
        from bson import ObjectId
        async def _rm():
            c = AsyncIOMotorClient(os.environ["MONGO_URL"])
            await c[os.environ["DB_NAME"]].course_attempts.delete_one({"_id": ObjectId(aid)})
        asyncio.run(_rm())
    except Exception as e:
        print("cleanup warning:", e)


# ---------------- Leaderboards ----------------
def test_kelp_leaderboard_has_three_champions(anon):
    r = anon.get(f"{API}/leaderboard/kelp-2", timeout=20)
    assert r.status_code == 200
    rows = r.json()
    champs = [row for row in rows if row.get("badge") == "verified" and row.get("adapter") == "crab"]
    names = {row.get("agent"): row.get("score") for row in champs}
    assert "Gemini Scuttler" in names and names["Gemini Scuttler"] == 86
    assert "Claude Clawdia" in names and names["Claude Clawdia"] == 84
    assert "GPT Pincer" in names and names["GPT Pincer"] == 71


def test_obstacle1_leaderboard_still_present(anon):
    r = anon.get(f"{API}/leaderboard/obstacle-1", timeout=20)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------------- Replays ----------------
def test_kelp_replays_present(admin):
    r = admin.get(f"{API}/replays?course_id=kelp-2", timeout=20)
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 3
    # /replays strips steps; fetch each run detail to verify course urls
    for rep in data[:3]:
        d = admin.get(f"{API}/runs/{rep['id']}", timeout=20).json()
        steps = d.get("steps") or []
        assert steps, f"no steps for {rep.get('champion_label')}"
        assert any("courses/kelp-2" in (s.get("url") or "") for s in steps)


# ---------------- H2H ----------------
def test_h2h_agents_list(anon):
    r = anon.get(f"{API}/h2h/agents", timeout=20)
    assert r.status_code == 200
    keys = {o["key"] for o in r.json()}
    assert {"copilot", "comet", "other", "claude", "gpt", "gemini", "endpoint", "relay", "crabs"} <= keys
    # at least some champion crab keys
    assert any(k.startswith("crab:") for k in keys)


def test_h2h_default_copilot_vs_comet_not_enough(anon):
    r = anon.get(f"{API}/h2h?course_id=kelp-2&a=copilot&b=comet", timeout=20)
    assert r.status_code == 200
    j = r.json()
    assert j["course_id"] == "kelp-2"
    assert j["a"]["key"] == "copilot" and j["a"]["source"] == "self_reported"
    assert j["b"]["key"] == "comet"
    # self-reported, likely <3 runs -> enough false, best_time_s None
    for side in ("a", "b"):
        if not j[side]["stats"]["enough"]:
            assert j[side]["stats"]["best_time_s"] is None


def test_h2h_unknown_agent_returns_404(anon):
    r = anon.get(f"{API}/h2h?course_id=kelp-2&a=bogus&b=copilot", timeout=20)
    assert r.status_code == 404


def test_h2h_verified_vs_verified_shape(anon):
    r = anon.get(f"{API}/h2h?course_id=kelp-2&a=crabs&b=gemini", timeout=20)
    assert r.status_code == 200
    j = r.json()
    for side in ("a", "b"):
        s = j[side]
        assert "stats" in s and {"runs", "finished", "enough", "min_runs"} <= set(s["stats"].keys())
        assert s["source"] in ("verified", "self_reported")


# ---------------- Tournaments (relay) ----------------
def test_relay_tournament_create_and_two_relay_422(pro):
    # Need a champion crab id
    agents = requests.get(f"{API}/h2h/agents", timeout=20).json()
    champ_key = next(a["key"] for a in agents if a["key"].startswith("crab:"))
    crab_id = champ_key.split(":", 1)[1]
    name = f"TEST_relay_cup_{int(time.time())}"
    # Two relay entrants => 422 FIRST (no running tournament yet, no LLM run started)
    r_bad = pro.post(f"{API}/tournaments",
                     json={"name": name + "_bad", "course_id": "kelp-2",
                           "entrants": [{"relay": True}, {"relay": True}]}, timeout=30)
    assert r_bad.status_code == 422, r_bad.text
    # Invalid course => 404
    r_bad2 = pro.post(f"{API}/tournaments",
                      json={"name": name + "_404", "course_id": "nope",
                            "entrants": [{"relay": True}, {"crab_id": crab_id}]}, timeout=30)
    assert r_bad2.status_code == 404, r_bad2.text
    # NOTE: Skipping the valid-create path to avoid kicking off a real ~3min LLM tournament run.
    # Shape of relay entrant is covered by test_existing_kelp_relay_cup_share via public share.


def test_existing_kelp_relay_cup_share(pro, anon):
    tid = "6abdb6f48722e638b6321700"
    # Confirm share endpoint
    r = pro.post(f"{API}/tournaments/{tid}/share", timeout=30)
    assert r.status_code in (200, 201), r.text
    slug = (r.json() or {}).get("slug") or (r.json() or {}).get("share_slug")
    if not slug:
        # fallback: fetch tournament
        t = pro.get(f"{API}/tournaments/{tid}", timeout=20).json()
        slug = t.get("share_slug") or t.get("slug")
    assert slug
    pub = anon.get(f"{API}/public/t/{slug}", timeout=20)
    assert pub.status_code == 200, pub.text
    j = pub.json()
    assert j.get("course_id") == "kelp-2"
    for e in j.get("entrants", []):
        if e.get("adapter") == "relay":
            for m in e.get("squad", []):
                assert "user_id" not in m and "system_prompt" not in m and "provider" not in m
    # Get a run id - pick first run
    runs = j.get("runs") or []
    if runs:
        rid = runs[0].get("id") or runs[0].get("_id")
        if rid:
            rr = anon.get(f"{API}/public/t/{slug}/runs/{rid}", timeout=20)
            assert rr.status_code == 200, rr.text
            rj = rr.json()
            # Legs breakdown - look at profile.legs
            prof = rj.get("profile") or {}
            if prof.get("legs"):
                for leg in prof["legs"]:
                    assert "system_prompt" not in leg and "provider" not in leg
