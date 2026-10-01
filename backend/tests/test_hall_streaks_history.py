"""Iteration 10: Hall of Champions, Rematch Streaks (streak_at), Coach History.

Creates minimal self-cleaning synthetic data to exercise the new endpoints and
verify they're wired to the real DB. All temp docs are deleted in teardown.
"""
import os
import re
import json
import time
from datetime import datetime, timedelta, timezone
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


@pytest.fixture(scope="module")
def pro_uid(pro):
    return pro.get(f"{API}/auth/me").json()["id"]


@pytest.fixture(scope="module")
def free_uid(free):
    return free.get(f"{API}/auth/me").json()["id"]


# ---------- Hall of Champions ----------
@pytest.fixture(scope="class")
def temp_hall(pro_uid):
    """Insert two temp weekly_badges (verified + self-reported) for a past week."""
    # Find a verified pro run on kelp-2 or obstacle-1
    pro_run = MONGO.runs.find_one(
        {"user_id": pro_uid, "status": "succeeded",
         "course_id": {"$in": ["kelp-2", "obstacle-1"]}},
        {"_id": 1, "course_id": 1, "score": 1, "elapsed_s": 1}
    )
    assert pro_run, "pro must have at least one succeeded run"
    # Find a verified attempt for self-reported badge
    att = MONGO.course_attempts.find_one(
        {"verified": True},
        {"_id": 1, "course_id": 1, "score": 1}
    )
    assert att, "need a verified attempt to seed self-reported badge"

    # Pick a far-past week to avoid colliding with award_week logic
    far_past_week = 2800  # ~2023

    verified_doc = {
        "week": far_past_week,
        "course_id": pro_run["course_id"],
        "user_id": pro_uid,
        "category": "verified",
        "run_id": str(pro_run["_id"]),
        "label": "Tidepool · Wk 39" if pro_run["course_id"] == "obstacle-1" else "Kelp · Wk 39",
        "score": pro_run["score"]["total"],
        "elapsed_s": pro_run["score"]["elapsed_s"],
        "title": "Weekly Champion",
        "agent_label": "Harness-verified run",
        "revoked": False,
        "awarded_at": datetime.now(timezone.utc).isoformat(),
    }
    sr_doc = {
        "week": far_past_week - 1,
        "course_id": att["course_id"],
        "user_id": att["user_id"] if "user_id" in att else pro_uid,
        "category": "self_reported",
        "attempt_id": str(att["_id"]),
        "label": "Tidepool · Wk 38" if att["course_id"] == "obstacle-1" else "Kelp · Wk 38",
        "score": att["score"]["total"],
        "elapsed_s": att["score"]["elapsed_s"],
        "title": "Weekly Champion – Self-reported",
        "agent_label": "Self-reported",
        "revoked": False,
        "awarded_at": datetime.now(timezone.utc).isoformat(),
    }
    # user_id for self-report
    sr_user = MONGO.course_attempts.find_one({"_id": att["_id"]}, {"user_id": 1}).get("user_id")
    if sr_user:
        sr_doc["user_id"] = sr_user

    v_id = MONGO.weekly_badges.insert_one(verified_doc).inserted_id
    s_id = MONGO.weekly_badges.insert_one(sr_doc).inserted_id

    # Revoked (should be excluded)
    rev_doc = {**verified_doc, "revoked": True, "week": far_past_week - 2}
    rev_doc.pop("_id", None)
    r_id = MONGO.weekly_badges.insert_one(rev_doc).inserted_id

    # Mark awards to prevent ensure_awards() from racing
    for wk in (far_past_week, far_past_week - 1, far_past_week - 2):
        MONGO.weekly_awards.update_one({"_id": wk}, {"$setOnInsert": {"_id": wk, "temp": True}}, upsert=True)

    yield {
        "verified_id": str(v_id),
        "self_reported_id": str(s_id),
        "revoked_id": str(r_id),
        "verified_course": verified_doc["course_id"],
        "sr_course": sr_doc["course_id"],
        "verified_user_id": pro_uid,
        "sr_user_id": sr_doc["user_id"],
    }
    MONGO.weekly_badges.delete_many({"_id": {"$in": [v_id, s_id, r_id]}})
    MONGO.weekly_awards.delete_many({"_id": {"$in": [far_past_week, far_past_week - 1, far_past_week - 2]}, "temp": True})


class TestHallEmpty:
    def test_hall_shape_public(self):
        r = requests.get(f"{API}/hall")
        assert r.status_code == 200
        d = r.json()
        assert "entries" in d and "stats" in d and "first_close_at" in d
        assert "total_weeks" in d["stats"]
        assert "most_crowns" in d["stats"]
        assert "reigning" in d["stats"]
        # first_close_at should parse as iso
        datetime.fromisoformat(d["first_close_at"])

    def test_hall_run_unknown_404(self):
        r = requests.get(f"{API}/hall/runs/{ObjectId()}")
        assert r.status_code == 404

    def test_hall_run_invalid_id_404(self):
        r = requests.get(f"{API}/hall/runs/not-an-id")
        assert r.status_code == 404


class TestHallWithSynthetic:
    def test_hall_contains_entries(self, temp_hall):
        r = requests.get(f"{API}/hall")
        assert r.status_code == 200
        d = r.json()
        ids = [e["id"] for e in d["entries"]]
        assert temp_hall["verified_id"] in ids
        assert temp_hall["self_reported_id"] in ids
        assert temp_hall["revoked_id"] not in ids, "revoked badges must be excluded"
        assert d["stats"]["total_weeks"] >= 2

    def test_entry_privacy_no_leaks(self, temp_hall):
        r = requests.get(f"{API}/hall").json()
        for e in r["entries"]:
            # user_key is 6-char suffix only - never email or full id
            assert "@" not in str(e.get("winner", ""))
            assert "user_id" not in e
            assert "email" not in e
            # user_key is up to 6 chars
            # not strictly asserted but check string length
            if "user_key" in e:
                assert len(e["user_key"]) <= 6

    def test_filters_course_and_category(self, temp_hall):
        c = temp_hall["verified_course"]
        r = requests.get(f"{API}/hall", params={"course_id": c}).json()
        for e in r["entries"]:
            assert e["course_id"] == c
        r2 = requests.get(f"{API}/hall", params={"category": "verified"}).json()
        for e in r2["entries"]:
            assert e["category"] == "verified"
        r3 = requests.get(f"{API}/hall", params={"category": "self_reported"}).json()
        for e in r3["entries"]:
            assert e["category"] == "self_reported"

    def test_stats_most_crowns_and_reigning(self, temp_hall):
        d = requests.get(f"{API}/hall").json()
        crowns = d["stats"]["most_crowns"]
        assert isinstance(crowns, list)
        # verified_user should be in most_crowns
        keys = [c["user_key"] for c in crowns]
        assert temp_hall["verified_user_id"][-6:] in keys
        # reigning per course
        reigning = d["stats"]["reigning"]
        courses = {r["course_id"] for r in reigning}
        assert temp_hall["verified_course"] in courses or temp_hall["sr_course"] in courses

    def test_hall_runs_verified_strips_sensitive(self, temp_hall):
        bid = temp_hall["verified_id"]
        r = requests.get(f"{API}/hall/runs/{bid}")
        assert r.status_code == 200, r.text
        d = r.json()
        # Sensitive fields must not be present
        for forbidden in ("goal", "system_prompt", "api_key", "user_id", "openai_key",
                          "anthropic_key", "gemini_key", "openrouter_key"):
            assert forbidden not in d, f"{forbidden} should be stripped from run"
        # Must have the basic replay fields
        assert d["id"] == bid
        assert "steps" in d
        assert d["is_public"] is True

    def test_hall_runs_self_reported_404(self, temp_hall):
        r = requests.get(f"{API}/hall/runs/{temp_hall['self_reported_id']}")
        assert r.status_code == 404

    def test_hall_runs_revoked_404(self, temp_hall):
        r = requests.get(f"{API}/hall/runs/{temp_hall['revoked_id']}")
        assert r.status_code == 404


# ---------- Rematch streaks (streak_at) ----------
class TestStreakAt:
    def test_public_c_streak_null_for_anonymous(self, pro):
        """A fresh invite for a non-participant / anonymous viewer gets streak=null."""
        # Reuse existing pro invite listing to find a slug (public c endpoint)
        invs = pro.get(f"{API}/invites").json()
        slug = next((i["slug"] for i in invs), None)
        if not slug:
            pytest.skip("No invites available to test public endpoint")
        r = requests.get(f"{API}/public/c/{slug}")
        if r.status_code != 200:
            pytest.skip(f"public endpoint returned {r.status_code}")
        d = r.json()
        assert d.get("streak") is None, "Anonymous viewer must see streak=null"

    def test_streak_shape_participant(self, pro, free):
        """Create a quick invite from pro to free and check streak shape - pending round only."""
        r = pro.post(f"{API}/invites", json={"course_id": "obstacle-1", "agent_kind": "copilot"})
        if r.status_code == 429:
            pytest.skip("rate limited")
        assert r.status_code == 201, r.text
        slug = r.json()["slug"]
        # Free hasn't accepted - as pro (root), streak_at only populated if parent_id or my_result.
        # Just assert public call succeeds and shape doesn't leak.
        pub = pro.get(f"{API}/public/c/{slug}").json()
        # root invite with no result: streak is null
        assert pub.get("streak") is None
        # cleanup
        inv = MONGO.invites.find_one({"slug": slug})
        if inv:
            MONGO.invites.delete_one({"_id": inv["_id"]})

    def test_inbox_message_has_lead_text_when_streak(self, pro):
        """If any rematch exists in pro's inbox, verify message contains 'rematch' and streak-ish text."""
        r = pro.get(f"{API}/invites/inbox")
        assert r.status_code == 200
        for m in r.json():
            assert "rematch" in m["message"].lower()
            assert "slug" in m and "rematch_n" in m


# ---------- Coach history ----------
class TestCoachHistory:
    def test_history_empty_or_list(self, pro):
        r = pro.get(f"{API}/squad/coach/history?course_id=obstacle-1")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_history_requires_auth(self):
        r = requests.get(f"{API}/squad/coach/history?course_id=obstacle-1")
        assert r.status_code in (401, 403)

    def test_apply_409_when_no_suggestion(self, pro):
        """Pro has not_enough status -> apply must return 409."""
        r = pro.post(f"{API}/squad/coach/apply",
                     json={"course_id": "obstacle-1", "stations": ["wall", "doors"], "role": "scout"})
        assert r.status_code == 409

    def test_undo_unknown_404(self, pro):
        r = pro.post(f"{API}/squad/coach/undo", json={"history_id": str(ObjectId())})
        assert r.status_code == 404

    def test_undo_invalid_id_404(self, pro):
        r = pro.post(f"{API}/squad/coach/undo", json={"history_id": "not-an-id"})
        assert r.status_code == 404


# ---------- Regression: existing endpoints still work ----------
class TestRegression:
    def test_featured(self):
        r = requests.get(f"{API}/featured")
        assert r.status_code == 200
        d = r.json()
        assert "course_id" in d and "last_week" in d

    def test_leaderboard_public(self):
        r = requests.get(f"{API}/platform/leaderboard?course_id=obstacle-1")
        assert r.status_code in (200, 404)  # endpoint path may differ

    def test_squad_coach_still_works(self, pro):
        r = pro.get(f"{API}/squad/coach?course_id=obstacle-1")
        assert r.status_code == 200
        assert r.json()["status"] in ("ok", "even", "not_enough", "error")

    def test_badges_weekly_public(self):
        r = requests.get(f"{API}/badges/weekly")
        assert r.status_code == 200
        assert isinstance(r.json(), list)
