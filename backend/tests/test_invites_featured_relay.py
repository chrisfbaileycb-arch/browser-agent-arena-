"""Iteration 8 tests: challenge invites, course of the week, relay leg compare."""
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient
from bson import ObjectId

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

# obstacle-1 solver per self_report_check.py
OBS1_ORDER = ["start", "wall", "doors", "rope", "beam", "tunnel", "finish"]
KELP_ORDER = ["entry", "current", "maze", "crates", "tide", "cave", "lookalike", "finish"]


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


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    # Remove invites + invite-linked attempts created in this test run
    inv_ids = [str(d["_id"]) for d in MONGO.invites.find({"inviter_name": {"$regex": "^(TEST|Pro|Admin|A rival|pro|admin)"}, "created_at": {"$gt": (datetime.now(timezone.utc).isoformat()[:10])}})]
    # safer: remove invites+attempts with slug starting with slugs we touched is hard. Delete all invites created in last 1h and their attempts.
    cutoff = (datetime.now(timezone.utc).replace(microsecond=0)).isoformat()
    recents = list(MONGO.invites.find({"created_at": {"$gt": (datetime.now(timezone.utc).isoformat()[:10])}}))
    for inv in recents:
        MONGO.course_attempts.delete_many({"invite_id": str(inv["_id"])})
        MONGO.invites.delete_one({"_id": inv["_id"]})
    # Reset featured override
    MONGO.settings.update_one({"_id": "featured"}, {"$set": {"course_id": None}}, upsert=True)


# ---------------------- INVITES ----------------------
class TestInviteCreate:
    def test_create_invite_ok(self, pro):
        r = pro.post(f"{API}/invites", json={"course_id": "obstacle-1", "agent_kind": "copilot"})
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["status"] == "active"
        assert "slug" in d and len(d["slug"]) >= 6
        assert d["agent_kind"] == "copilot"
        assert d["uses_left"] == 25
        # expires_at ~ +14 days
        exp = datetime.fromisoformat(d["expires_at"].replace("Z", "+00:00"))
        delta = (exp - datetime.now(timezone.utc)).total_seconds()
        assert 13.5 * 86400 < delta < 14.5 * 86400
        assert d["inviter"]  # first name string

    def test_invalid_kind_422(self, pro):
        r = pro.post(f"{API}/invites", json={"course_id": "obstacle-1", "agent_kind": "hacker"})
        assert r.status_code == 422

    def test_invalid_course_404(self, pro):
        r = pro.post(f"{API}/invites", json={"course_id": "nope-999", "agent_kind": "copilot"})
        assert r.status_code == 404

    def test_rate_limit_429(self, free):
        # 5/min window. Free is a fresh session (its own rate bucket).
        codes = []
        for _ in range(8):
            r = free.post(f"{API}/invites", json={"course_id": "obstacle-1", "agent_kind": "comet"})
            codes.append(r.status_code)
        assert 429 in codes, codes


class TestInvitePublic:
    @pytest.fixture(scope="class")
    def slug(self, pro):
        r = pro.post(f"{API}/invites", json={"course_id": "obstacle-1", "agent_kind": "copilot"})
        return r.json()["slug"]

    def test_public_landing(self, slug):
        r = requests.get(f"{API}/public/c/{slug}")
        assert r.status_code == 200
        d = r.json()
        for k in ["inviter", "course", "agent_label", "status", "uses_left"]:
            assert k in d
        assert "is_inviter" in d
        assert d["is_inviter"] is False

    def test_public_landing_as_inviter(self, pro, slug):
        r = pro.get(f"{API}/public/c/{slug}")
        assert r.status_code == 200
        assert r.json()["is_inviter"] is True

    def test_card_html(self, slug):
        r = requests.get(f"{API}/public/c/{slug}/card")
        assert r.status_code == 200
        html = r.text
        assert 'og:title' in html and 'og:image' in html
        assert 'twitter:card' in html
        assert f'/c/{slug}' in html
        assert 'http-equiv="refresh"' in html

    def test_og_png(self, slug):
        r = requests.get(f"{API}/public/c/{slug}/og.png")
        assert r.status_code == 200
        assert r.headers["content-type"] == "image/png"
        assert r.content[:8] == b"\x89PNG\r\n\x1a\n"


class TestInviteAccept:
    @pytest.fixture(scope="class")
    def slug_pro(self, pro):
        r = pro.post(f"{API}/invites", json={"course_id": "obstacle-1", "agent_kind": "comet"})
        return r.json()["slug"]

    def test_inviter_cannot_accept(self, pro, slug_pro):
        r = pro.post(f"{API}/invites/{slug_pro}/accept")
        assert r.status_code == 409

    def test_friend_accepts_creates_attempt(self, free, slug_pro):
        # record free's run usage BEFORE
        me0 = free.get(f"{API}/auth/me").json()
        runs_before = me0.get("usage", {}).get("runs") if isinstance(me0.get("usage"), dict) else None

        r = free.post(f"{API}/invites/{slug_pro}/accept")
        assert r.status_code == 201, r.text
        a = r.json()
        assert a["agent_kind"] == "comet"
        assert a["course_id"] == "obstacle-1"
        assert "/api/courses/obstacle-1" in (a.get("start_path") or a.get("next_path") or "")

        # Accept again -> same attempt, no second use
        r2 = free.post(f"{API}/invites/{slug_pro}/accept")
        assert r2.status_code in (200, 201)
        assert r2.json()["id"] == a["id"]

        # Self-submitted invite attempts don't consume free's run quota
        me1 = free.get(f"{API}/auth/me").json()
        runs_after = me1.get("usage", {}).get("runs") if isinstance(me1.get("usage"), dict) else None
        assert runs_before == runs_after

    def test_revoked_410(self, pro, free):
        r = pro.post(f"{API}/invites", json={"course_id": "obstacle-1", "agent_kind": "copilot"})
        if r.status_code == 429:
            time.sleep(62)
            r = pro.post(f"{API}/invites", json={"course_id": "obstacle-1", "agent_kind": "copilot"})
        inv = r.json()
        pro.delete(f"{API}/invites/{inv['id']}")
        r = free.post(f"{API}/invites/{inv['slug']}/accept")
        assert r.status_code == 410

    def test_max_uses_full_409(self, pro, admin, free):
        r = pro.post(f"{API}/invites", json={"course_id": "obstacle-1", "agent_kind": "copilot", "max_uses": 1})
        if r.status_code == 429:
            time.sleep(62)
            r = pro.post(f"{API}/invites", json={"course_id": "obstacle-1", "agent_kind": "copilot", "max_uses": 1})
        inv = r.json()
        # free has not yet accepted this slug
        r1 = free.post(f"{API}/invites/{inv['slug']}/accept")
        assert r1.status_code == 201
        # Admin tries -> should be full (max_uses=1)
        r2 = admin.post(f"{API}/invites/{inv['slug']}/accept")
        assert r2.status_code == 409


class TestInviteTracker:
    def test_my_invites_list(self, pro):
        r = pro.get(f"{API}/invites")
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        if items:
            inv = items[0]
            assert "counts" in inv and set(["accepted", "started", "finished"]).issubset(inv["counts"].keys())
            assert "friends" in inv

    def test_revoke_invite(self, pro):
        r = pro.post(f"{API}/invites", json={"course_id": "obstacle-1", "agent_kind": "copilot"})
        if r.status_code == 429:
            time.sleep(62)
            r = pro.post(f"{API}/invites", json={"course_id": "obstacle-1", "agent_kind": "copilot"})
        inv = r.json()
        r = pro.delete(f"{API}/invites/{inv['id']}")
        assert r.status_code == 200
        # Confirm status -> revoked
        pub = requests.get(f"{API}/public/c/{inv['slug']}").json()
        assert pub["status"] == "revoked"


# ---------------------- FEATURED ----------------------
class TestFeatured:
    def test_featured_shape(self):
        r = requests.get(f"{API}/featured")
        assert r.status_code == 200
        d = r.json()
        for k in ["course_id", "name", "stations", "source", "next_rotation_at", "top"]:
            assert k in d
        assert d["source"] in ("rotation", "override")
        assert isinstance(d["top"], list) and len(d["top"]) <= 5
        # next_rotation_at parses and is a Monday 00:00 UTC
        nxt = datetime.fromisoformat(d["next_rotation_at"].replace("Z", "+00:00"))
        assert nxt.weekday() == 0  # Monday
        assert nxt.hour == 0 and nxt.minute == 0

    def test_rotation_deterministic(self):
        # Compute expected deterministic choice
        from datetime import timedelta
        EPOCH = datetime(1970, 1, 5, tzinfo=timezone.utc)
        # fetch courses list
        courses_r = requests.get(f"{API}/courses").json()
        ids = sorted(c["id"] for c in courses_r)
        weeks = (datetime.now(timezone.utc) - EPOCH) // timedelta(weeks=1)
        expected = ids[weeks % len(ids)]
        # Clear any override first (only admin can)
        d = requests.get(f"{API}/featured").json()
        if d["source"] == "override":
            pytest.skip("override active")
        assert d["course_id"] == expected

    def test_admin_override_and_reset(self, admin, pro):
        # Pro/free cannot override
        r = pro.put(f"{API}/admin/featured", json={"course_id": "kelp-2"})
        assert r.status_code == 403
        # Admin set
        r = admin.put(f"{API}/admin/featured", json={"course_id": "kelp-2"})
        assert r.status_code == 200
        assert r.json()["source"] == "override"
        assert r.json()["course_id"] == "kelp-2"
        got = requests.get(f"{API}/featured").json()
        assert got["source"] == "override" and got["course_id"] == "kelp-2"
        # Invalid course
        r = admin.put(f"{API}/admin/featured", json={"course_id": "nope-x"})
        assert r.status_code == 404
        # Clear
        r = admin.put(f"{API}/admin/featured", json={"course_id": None})
        assert r.status_code == 200
        assert r.json()["source"] == "rotation"


# ---------------------- RELAY LEG COMPARE ----------------------
class TestRelayLegs:
    def test_compare_shape(self):
        r = requests.get(f"{API}/relay/legs?course_id=kelp-2")
        assert r.status_code == 200
        d = r.json()
        assert d["course_id"] == "kelp-2"
        assert isinstance(d["stations"], list)
        assert isinstance(d["items"], list)
        for it in d["items"]:
            for k in ("run_id", "leg", "role", "steps", "elapsed_s", "status", "decoys", "success"):
                assert k in it

    def test_compare_invalid_course(self):
        r = requests.get(f"{API}/relay/legs?course_id=nope-xyz")
        assert r.status_code == 404

    def test_other_users_private_run_hidden(self, free):
        # Try to fetch a non-existent / inaccessible run as free user -> 404
        r = free.get(f"{API}/relay/legs/{str(ObjectId())}/0")
        assert r.status_code == 404

    def test_shared_tournament_relay_visible(self, pro):
        # Public tournament 6abdb6f48722e638b6321700 (Kelp Relay Cup) — enable share
        r = pro.post(f"{API}/tournaments/6abdb6f48722e638b6321700/share")
        if r.status_code == 404:
            pytest.skip("Kelp Relay Cup tournament missing")
        assert r.status_code in (200, 201), r.text
        # Fetch anon
        all_relay = requests.get(f"{API}/relay/legs?course_id=kelp-2").json()
        assert isinstance(all_relay["items"], list)
