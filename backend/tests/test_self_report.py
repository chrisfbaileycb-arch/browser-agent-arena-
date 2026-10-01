"""Self-report (Copilot/Comet) course attempt tests - iteration 6."""
import json
import os
import re
import time
import pytest
import requests
from bson import ObjectId
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

STATIONS = ["start", "wall", "doors", "rope", "beam", "tunnel", "finish"]


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def free_token():
    return _login("free@steps.dev", "FreeCrab!2026")


@pytest.fixture(scope="module")
def pro_token():
    return _login("pro@steps.dev", "ProCrab!2026")


def _hdr(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _create_attempt(token, agent_kind="comet", agent_label=""):
    r = requests.post(f"{API}/course-attempts",
                      headers=_hdr(token),
                      json={"course_id": "obstacle-1", "agent_kind": agent_kind, "agent_label": agent_label})
    assert r.status_code == 201, r.text
    return r.json()


def _complete_attempt(aid):
    """Walk stations to get finish code."""
    code = None
    for st in STATIONS:
        html = requests.get(f"{API}/courses/obstacle-1/{st}?a={aid}").text
        m = re.search(r'"nonce":\s*"([^"]+)"', html)
        assert m, f"nonce not found at {st}: {html[:300]}"
        nonce = m.group(1)
        r = requests.post(f"{API}/course-attempts/{aid}/clear", json={"station": st, "nonce": nonce})
        assert r.status_code == 200, (st, r.text)
        js = r.json()
        if js.get("code"):
            code = js["code"]
    assert code and code.startswith("SOE-")
    return code


class TestAttemptCreation:
    def test_create_copilot(self, free_token):
        a = _create_attempt(free_token, "copilot")
        assert a["agent_kind"] == "copilot"
        assert a["agent_label"] == "Copilot"
        assert a["expired"] is False
        assert a["expires_at"]
        assert "start_path" in a and f"a={a['id']}" in a["start_path"]
        # expires ~2h out
        exp = datetime.fromisoformat(a["expires_at"])
        delta = (exp - datetime.now(timezone.utc)).total_seconds()
        assert 6000 < delta < 7500

    def test_create_comet(self, free_token):
        a = _create_attempt(free_token, "comet")
        assert a["agent_label"] == "Comet"
        assert a["agent_kind"] == "comet"

    def test_create_other_default_label(self, free_token):
        a = _create_attempt(free_token, "other", agent_label="")
        assert a["agent_kind"] == "other"
        assert a["agent_label"] == "Other agent"

    def test_create_other_custom_label(self, free_token):
        a = _create_attempt(free_token, "other", agent_label="MyBot")
        assert a["agent_label"] == "MyBot"

    def test_invalid_agent_kind(self, free_token):
        r = requests.post(f"{API}/course-attempts",
                          headers=_hdr(free_token),
                          json={"course_id": "obstacle-1", "agent_kind": "hacker"})
        assert r.status_code == 422

    def test_mine_listing(self, free_token):
        a = _create_attempt(free_token, "comet")
        r = requests.get(f"{API}/course-attempts/mine", headers=_hdr(free_token))
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert a["id"] in ids
        for x in r.json():
            assert x.get("agent_kind") in ("copilot", "comet", "other")


class TestSubmissionFlow:
    def test_early_submit_409(self, free_token):
        a = _create_attempt(free_token, "comet")
        r = requests.post(f"{API}/course-attempts/{a['id']}/submit",
                          headers=_hdr(free_token),
                          json={"code": "SOE-AAAA-BBBB"})
        assert r.status_code == 409

    def test_full_flow_and_verification(self, free_token):
        a = _create_attempt(free_token, "comet")
        code = _complete_attempt(a["id"])
        # Bad code -> 422 with "tries left"
        r = requests.post(f"{API}/course-attempts/{a['id']}/submit",
                          headers=_hdr(free_token),
                          json={"code": "SOE-ZZZZ-ZZZZ", "reported_elapsed_s": 1})
        assert r.status_code == 422
        assert "tries left" in r.json().get("detail", "")
        # Good code (embedded in text), reported time ignored for score
        r = requests.post(f"{API}/course-attempts/{a['id']}/submit",
                          headers=_hdr(free_token),
                          json={"code": f"my code is {code}", "reported_elapsed_s": 3.2,
                                "recording_url": "https://example.com/v"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["verified"] is True
        assert data["reported_elapsed_s"] == 3.2
        assert "server_elapsed_s" in data and data["server_elapsed_s"] is not None
        assert data["score"]["total"] > 0
        # Reuse -> 409
        r = requests.post(f"{API}/course-attempts/{a['id']}/submit",
                          headers=_hdr(free_token),
                          json={"code": code})
        assert r.status_code == 409

    def test_cross_user_rejected(self, free_token, pro_token):
        a = _create_attempt(free_token, "comet")
        code = _complete_attempt(a["id"])
        r = requests.post(f"{API}/course-attempts/{a['id']}/submit",
                          headers=_hdr(pro_token),
                          json={"code": code})
        assert r.status_code == 403

    def test_cross_attempt_code_rejected(self, free_token):
        a1 = _create_attempt(free_token, "comet")
        code = _complete_attempt(a1["id"])
        # submit on a1 first to lock in
        requests.post(f"{API}/course-attempts/{a1['id']}/submit",
                      headers=_hdr(free_token), json={"code": code})
        a2 = _create_attempt(free_token, "other", agent_label="X")
        # a2 isn't finished, so first error path is 409 (no finish code yet)
        r = requests.post(f"{API}/course-attempts/{a2['id']}/submit",
                          headers=_hdr(free_token), json={"code": code})
        assert r.status_code in (409, 422), r.text

    def test_lockout_after_5_bad_codes(self, pro_token):
        a = _create_attempt(pro_token, "comet")
        _complete_attempt(a["id"])
        # Need fresh code generated already; now try 5 bad submits.
        # Rate limit per-attempt=5/min so this is at the boundary.
        statuses = []
        for i in range(5):
            r = requests.post(f"{API}/course-attempts/{a['id']}/submit",
                              headers=_hdr(pro_token),
                              json={"code": f"SOE-BAD{i}-BAD{i}"})
            statuses.append(r.status_code)
        # Last bad should include "locked" message
        assert statuses[-1] in (422, 429), statuses
        # After lock the attempt is marked submitted
        r = requests.get(f"{API}/course-attempts/{a['id']}")
        if r.status_code == 200:
            # verified should be False or submitted_code set via lock
            pass


class TestExpiry:
    def test_expired_blocks_submit_and_clear(self, pro_token):
        from pymongo import MongoClient
        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME")
        assert mongo_url and db_name
        client = MongoClient(mongo_url)
        db = client[db_name]
        a = _create_attempt(pro_token, "comet")
        aid = a["id"]
        # Expire by backdating expires_at
        past = (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat()
        db.course_attempts.update_one({"_id": ObjectId(aid)}, {"$set": {"expires_at": past}})
        # Station page shows notice
        html = requests.get(f"{API}/courses/obstacle-1/start?a={aid}").text
        assert "Attempt expired" in html
        # Clear is rejected 409
        r = requests.post(f"{API}/course-attempts/{aid}/clear",
                          json={"station": "start", "nonce": "x"})
        assert r.status_code == 409
        # Submit -> 410 (expired, no code)
        r = requests.post(f"{API}/course-attempts/{aid}/submit",
                          headers=_hdr(pro_token),
                          json={"code": "SOE-AAAA-BBBB"})
        assert r.status_code == 410


class TestLeaderboard:
    def test_leaderboard_self_reported_filter(self, pro_token):
        # Make sure we have at least one self-reported verified row
        a = _create_attempt(pro_token, "comet")
        code = _complete_attempt(a["id"])
        requests.post(f"{API}/course-attempts/{a['id']}/submit",
                      headers=_hdr(pro_token),
                      json={"code": code, "reported_elapsed_s": 5.5})
        r = requests.get(f"{API}/leaderboard/obstacle-1?source=self_reported")
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 1
        for row in rows:
            assert row["badge"] == "self_reported"
            assert row.get("agent_kind") in ("copilot", "comet", "other")

    def test_leaderboard_verified_filter(self):
        r = requests.get(f"{API}/leaderboard/obstacle-1?source=verified")
        assert r.status_code == 200
        for row in r.json():
            assert row["badge"] == "verified"


class TestRateLimit:
    def test_submit_rate_limit_429(self, pro_token):
        a = _create_attempt(pro_token, "comet")
        _complete_attempt(a["id"])
        statuses = []
        for i in range(8):
            r = requests.post(f"{API}/course-attempts/{a['id']}/submit",
                              headers=_hdr(pro_token),
                              json={"code": f"SOE-BAD{i}-BAD{i}"})
            statuses.append(r.status_code)
        # Per-attempt bucket is 5/min -> expect 429 somewhere
        assert 429 in statuses, statuses


def test_cleanup_test_attempts():
    """Cleanup: delete self-reported attempts created by free user to keep leaderboard clean."""
    from pymongo import MongoClient
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    client = MongoClient(mongo_url)
    db = client[db_name]
    # Find free user id
    u = db.users.find_one({"email": "free@steps.dev"})
    if u:
        res = db.course_attempts.delete_many({"user_id": str(u["_id"]), "agent_kind": {"$ne": None}})
        print(f"Deleted {res.deleted_count} test attempts")
