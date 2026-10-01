"""Iteration 9 tests: weekly badges, rematch flow, squad coach.

Covers the new approved batch: weekly winner badges, rematch button chain, and squad leg coaching.
"""
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import pytest
import requests
from bson import ObjectId
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    fe = Path(__file__).resolve().parents[2] / "frontend" / ".env"
    for line in fe.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip()
            break
API = BASE_URL.rstrip("/") + "/api"
MONGO = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

OBS1_ORDER = ["start", "wall", "doors", "rope", "beam", "tunnel", "finish"]
KELP_ORDER = ["entry", "current", "maze", "crates", "tide", "cave", "lookalike", "finish"]


def _kelp_cfg(html):
    m = re.search(r'<script id="course-config" type="application/json">(.*?)</script>', html, re.S)
    return json.loads(m.group(1).replace("<\\/", "</"))


def _kelp_answer(station, p):
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


def _solve_kelp(sess, attempt_id):
    code = None
    for st in KELP_ORDER:
        c = _kelp_cfg(requests.get(f"{API}/courses/kelp-2/{st}?a={attempt_id}").text)
        payload = {"station": st, "nonce": c["nonce"]}
        ans = _kelp_answer(st, c["puzzle"])
        if ans is not None:
            payload["answer"] = ans
        res = sess.post(f"{API}/course-attempts/{attempt_id}/clear", json=payload).json()
        code = res.get("code") or code
    assert code, "no finish code on kelp solve"
    return code


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    if r.status_code == 429:
        time.sleep(62)
        r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    s.headers["Authorization"] = "Bearer " + r.json()["token"]
    return s


@pytest.fixture(scope="module")
def pro():
    return _login("pro@steps.dev", "ProCrab!2026")


@pytest.fixture(scope="module")
def free():
    return _login("free@steps.dev", "FreeCrab!2026")


@pytest.fixture(scope="module")
def admin():
    return _login("admin@steps.dev", "ArenaAdmin!2026")


@pytest.fixture(scope="module")
def pro_uid(pro):
    return pro.get(f"{API}/auth/me").json()["id"]


@pytest.fixture(scope="module")
def free_uid(free):
    return free.get(f"{API}/auth/me").json()["id"]


@pytest.fixture(scope="module", autouse=True)
def cleanup_invites():
    yield
    today = datetime.now(timezone.utc).isoformat()[:10]
    for inv in list(MONGO.invites.find({"created_at": {"$gt": today}})):
        MONGO.course_attempts.delete_many({"invite_id": str(inv["_id"])})
        MONGO.invites.delete_one({"_id": inv["_id"]})


def _solve_obstacle(sess, attempt_id):
    """Walk the obstacle-1 course via /courses/<c>/<station> + /clear, return the finish code."""
    code = None
    for st in OBS1_ORDER:
        html = requests.get(f"{API}/courses/obstacle-1/{st}?a={attempt_id}").text
        m = re.search(r'"nonce":\s*"([^"]+)"', html)
        assert m, f"no nonce for {st}: {html[:200]}"
        res = sess.post(f"{API}/course-attempts/{attempt_id}/clear",
                        json={"station": st, "nonce": m.group(1)}).json()
        code = res.get("code") or code
    assert code, "finish code should be returned on finish"
    return code


def _rate_create_invite(sess, body):
    r = sess.post(f"{API}/invites", json=body)
    if r.status_code == 429:
        time.sleep(62)
        r = sess.post(f"{API}/invites", json=body)
    assert r.status_code == 201, r.text
    return r.json()


# ---------- Weekly badges API ----------
class TestWeeklyBadges:
    def test_my_badges_shape(self, pro):
        r = pro.get(f"{API}/me/badges")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_badges_weekly_public(self):
        r = requests.get(f"{API}/badges/weekly")
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, list)
        for wk in d:
            assert "week" in wk and "winners" in wk
            for w in wk["winners"]:
                assert "label" in w and "title" in w and "tooltip" in w

    def test_featured_has_last_week(self):
        r = requests.get(f"{API}/featured")
        assert r.status_code == 200
        d = r.json()
        assert "last_week" in d
        assert isinstance(d["last_week"], list)

    def test_revoke_requires_admin(self, free):
        # Bogus id to confirm 403 before 404
        r = free.delete(f"{API}/admin/badges/{ObjectId()}")
        assert r.status_code == 403

    def test_revoke_404_for_unknown(self, admin):
        r = admin.delete(f"{API}/admin/badges/{ObjectId()}")
        assert r.status_code == 404

    def test_revoke_invalid_id_404(self, admin):
        r = admin.delete(f"{API}/admin/badges/not-an-id")
        assert r.status_code == 404


# ---------- Rematch chain ----------
# Module-scoped shared state so test ordering works across the class.
_CTX: dict = {}


@pytest.fixture(scope="module")
def rematch_ctx(pro, free):
    """Pro invites free on kelp-2; free solves and should beat pro's seeded time (~42s)."""
    inv = _rate_create_invite(pro, {"course_id": "kelp-2", "agent_kind": "copilot"})
    r = free.post(f"{API}/invites/{inv['slug']}/accept")
    assert r.status_code == 201, r.text
    aid = r.json()["id"]
    code = _solve_kelp(free, aid)
    r = free.post(f"{API}/course-attempts/{aid}/submit",
                  json={"code": code, "reported_elapsed_s": 2.0})
    assert r.status_code == 200, r.text
    _CTX["slug"] = inv["slug"]
    _CTX["inv_id"] = inv["id"]
    return _CTX


class TestRematchFlow:
    def test_free_result_beats(self, free, rematch_ctx):
        pub = free.get(f"{API}/public/c/{rematch_ctx['slug']}").json()
        assert pub["my_result"] is not None, pub
        assert pub["time_to_beat"] is not None, "pro should have a kelp-2 time to beat"
        assert pub["my_result"]["beat"] is True, f"free should beat pro: {pub}"
        assert pub["my_result"]["margin_s"] > 0

    def test_rematch_409_if_not_beaten(self, pro):
        inv = _rate_create_invite(pro, {"course_id": "kelp-2", "agent_kind": "copilot"})
        r = pro.post(f"{API}/invites/{inv['slug']}/rematch")
        assert r.status_code == 409

    def test_send_rematch_creates_child(self, free, rematch_ctx):
        r = free.post(f"{API}/invites/{rematch_ctx['slug']}/rematch")
        assert r.status_code == 201, r.text
        child = r.json()
        assert child["is_rematch"] is True
        assert child["rematch_n"] == 1
        assert child["time_to_beat"]["elapsed_s"] is not None
        assert child["uses_left"] == 1
        rematch_ctx["child_slug"] = child["slug"]
        rematch_ctx["child_id"] = child["id"]

    def test_rematch_idempotent(self, free, rematch_ctx):
        r = free.post(f"{API}/invites/{rematch_ctx['slug']}/rematch")
        assert r.status_code == 201
        assert r.json()["slug"] == rematch_ctx["child_slug"]

    def test_pro_inbox_shows_message(self, pro, rematch_ctx):
        r = pro.get(f"{API}/invites/inbox")
        assert r.status_code == 200
        inbox = r.json()
        slugs = [m["slug"] for m in inbox]
        assert rematch_ctx["child_slug"] in slugs, inbox
        m = next(m for m in inbox if m["slug"] == rematch_ctx["child_slug"])
        assert "beat you by" in m["message"]
        assert m["rematch_n"] == 1
        assert m["margin_s"] > 0

    def test_free_sees_rematch_as_sent(self, free, rematch_ctx):
        r = free.get(f"{API}/invites")
        assert r.status_code == 200
        rec = next((i for i in r.json() if i["slug"] == rematch_ctx["child_slug"]), None)
        assert rec is not None
        assert rec["direction"] == "sent"
        assert rec["rematch_n"] == 1

    def test_pro_sees_rematch_as_received(self, pro, rematch_ctx):
        items = pro.get(f"{API}/invites").json()
        rec = next((i for i in items if i["slug"] == rematch_ctx["child_slug"]), None)
        assert rec is not None
        assert rec["direction"] == "received"
        parent = next((i for i in items if i["slug"] == rematch_ctx["slug"]), None)
        assert parent is not None
        assert any(f.get("rematch", {}).get("slug") == rematch_ctx["child_slug"] for f in parent["friends"])

    def test_third_user_403_on_reserved_rematch(self, admin, rematch_ctx):
        r = admin.post(f"{API}/invites/{rematch_ctx['child_slug']}/accept")
        assert r.status_code == 403

    def test_pro_accepts_rematch_with_other_kind(self, pro, rematch_ctx):
        r = pro.post(f"{API}/invites/{rematch_ctx['child_slug']}/accept",
                     json={"agent_kind": "other"})
        assert r.status_code == 201, r.text
        att = r.json()
        assert att["agent_kind"] == "other"


# ---------- Squad coach ----------
class TestSquadCoach:
    def test_coach_shape_obstacle(self, pro):
        r = pro.get(f"{API}/squad/coach?course_id=obstacle-1")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["course_id"] == "obstacle-1"
        assert d["status"] in ("ok", "even", "not_enough", "error")
        assert isinstance(d["legs"], list)
        for leg in d["legs"]:
            assert "role" in leg and "stations" in leg and "mine" in leg and "others" in leg
            assert "n" in leg["mine"] and "n" in leg["others"]

    def test_coach_shape_kelp(self, pro):
        r = pro.get(f"{API}/squad/coach?course_id=kelp-2")
        assert r.status_code == 200
        d = r.json()
        assert d["course_id"] == "kelp-2"
        assert "legs" in d

    def test_coach_invalid_course_404(self, pro):
        r = pro.get(f"{API}/squad/coach?course_id=not-a-course")
        assert r.status_code == 404

    def test_coach_requires_auth(self):
        r = requests.get(f"{API}/squad/coach?course_id=obstacle-1")
        assert r.status_code in (401, 403)
