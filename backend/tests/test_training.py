"""Training Grounds backend tests - endpoints under /api/training.

Covers: Pro gate (402 for free, OK for admin), overview shape, local parser,
server-side /complete simulation, agent-step validation, input caps, and
reach-the-flag star scoring. Uses the public preview URL.
"""
import os
import re
import time
import uuid

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_EMAIL = os.environ["TEST_ADMIN_EMAIL"]
ADMIN_PASSWORD = os.environ["TEST_ADMIN_PASSWORD"]
ACCESS_CODE = os.environ["TEST_ACCESS_CODE"]

TIMEOUT = 20


# ------------------- fixtures -------------------

@pytest.fixture(scope="session")
def admin_client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=TIMEOUT)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def free_client():
    """Register a brand-new free user with the access code."""
    s = requests.Session()
    email = f"test_training_{uuid.uuid4().hex[:10]}@example.com"
    r = s.post(f"{BASE_URL}/api/auth/register", json={
        "email": email, "password": "TrainTest!234",
        "name": "Train Tester", "access_code": ACCESS_CODE,
    }, timeout=TIMEOUT)
    if r.status_code != 200:
        pytest.skip(f"free user register failed: {r.status_code} {r.text}")
    tok = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    s._uid = r.json()["id"]  # type: ignore[attr-defined]
    s._email = email  # type: ignore[attr-defined]
    yield s
    # cleanup via admin
    try:
        a = requests.Session()
        ar = a.post(f"{BASE_URL}/api/auth/login",
                    json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=TIMEOUT)
        if ar.status_code == 200:
            a.headers.update({"Authorization": f"Bearer {ar.json()['token']}"})
            a.delete(f"{BASE_URL}/api/admin/users/{s._uid}", timeout=TIMEOUT)
    except Exception:
        pass


# ------------------- Pro gate -------------------

class TestProGate:
    def test_free_overview_402(self, free_client):
        r = free_client.get(f"{BASE_URL}/api/training", timeout=TIMEOUT)
        assert r.status_code == 402
        assert "Pro" in r.text

    def test_free_parse_402(self, free_client):
        r = free_client.post(f"{BASE_URL}/api/training/parse",
                             json={"lines": ["go right 2"]}, timeout=TIMEOUT)
        assert r.status_code == 402

    def test_free_complete_402(self, free_client):
        r = free_client.post(f"{BASE_URL}/api/training/complete",
                             json={"challenge_id": "c1-first-steps",
                                   "actions": [{"type": "move", "dir": "right", "n": 4}]},
                             timeout=TIMEOUT)
        assert r.status_code == 402

    def test_free_agent_step_402(self, free_client):
        r = free_client.post(f"{BASE_URL}/api/training/agent/step",
                             json={"challenge_id": "c3-warmup",
                                   "instructions": "reach flag", "actions": []},
                             timeout=TIMEOUT)
        assert r.status_code == 402

    def test_free_save_crab_402(self, free_client):
        r = free_client.post(f"{BASE_URL}/api/training/save-crab",
                             json={"name": "x", "instructions": "reach the flag"},
                             timeout=TIMEOUT)
        assert r.status_code == 402


# ------------------- Overview (admin) -------------------

class TestOverview:
    def test_shape(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/training", timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        assert len(d["levels"]) == 3
        assert len(d["challenges"]) == 12
        ids = {c["id"] for c in d["challenges"]}
        for cid in ("c1-first-steps", "c1-mind-the-red", "c1-crate-hop",
                    "c2-notched-pole", "c3-warmup", "c3-grand-yard"):
            assert cid in ids
        # 4 per level
        for lvl in (1, 2, 3):
            assert sum(1 for c in d["challenges"] if c["level"] == lvl) == 4
        # solution hidden; par exposed
        for c in d["challenges"]:
            assert "solution" not in c
            assert isinstance(c["par"], int) and c["par"] > 0
        assert isinstance(d["progress"], dict)
        assert isinstance(d["providers"], list)


# ------------------- Local parser -------------------

class TestParse:
    def test_local_simple(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/training/parse",
                              json={"lines": ["go right 4"]}, timeout=TIMEOUT)
        assert r.status_code == 200
        row = r.json()["results"][0]
        assert row["source"] == "local"
        assert row["actions"] == [{"type": "move", "dir": "right", "n": 4}]

    def test_local_number_word(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/training/parse",
                              json={"lines": ["move down two"]}, timeout=TIMEOUT)
        row = r.json()["results"][0]
        assert row["source"] == "local"
        assert row["actions"] == [{"type": "move", "dir": "down", "n": 2}]

    def test_local_multi_action(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/training/parse",
                              json={"lines": ["lift claw", "open claw", "grab notch 2"]},
                              timeout=TIMEOUT)
        rows = r.json()["results"]
        assert [row["actions"][0]["type"] for row in rows] == ["lift_claw", "open_claw", "grab"]

    def test_too_many_lines_422(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/training/parse",
                              json={"lines": ["jump"] * 41}, timeout=TIMEOUT)
        assert r.status_code == 422


# ------------------- Complete / simulation -------------------

class TestComplete:
    def test_first_steps_3_stars(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/training/complete",
                              json={"challenge_id": "c1-first-steps",
                                    "actions": [{"type": "move", "dir": "right", "n": 4}],
                                    "mode": "command"}, timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        assert d["success"] is True
        assert d["stars"] == 3
        assert d["stumbles"] == 0

    def test_bad_run_zero_stars(self, admin_client):
        # fake run on c3-warmup that does not reach F
        r = admin_client.post(f"{BASE_URL}/api/training/complete",
                              json={"challenge_id": "c3-warmup",
                                    "actions": [{"type": "wait", "n": 1}],
                                    "mode": "agent"}, timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        assert d["success"] is False
        assert d["stars"] == 0

    def test_notched_pole_full_solve(self, admin_client):
        # c2-notched-pole: start at (0,0) facing right. Grid 4x3, F at (0,2), P at (3,0), key_notch=2.
        acts = [
            {"type": "move", "dir": "right", "n": 2},
            {"type": "lift_claw"},
            {"type": "open_claw"},
            {"type": "grab", "target": "pole", "notches": 2},
            {"type": "move", "dir": "down", "n": 2},
            {"type": "move", "dir": "left", "n": 2},
        ]
        r = admin_client.post(f"{BASE_URL}/api/training/complete",
                              json={"challenge_id": "c2-notched-pole",
                                    "actions": acts, "mode": "script"},
                              timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["success"] is True
        assert d["stars"] == 3

    def test_invalid_action_type_422(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/training/complete",
                              json={"challenge_id": "c1-first-steps",
                                    "actions": [{"type": "teleport"}]}, timeout=TIMEOUT)
        assert r.status_code == 422

    def test_unknown_challenge_404(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/training/complete",
                              json={"challenge_id": "nope",
                                    "actions": [{"type": "jump"}]}, timeout=TIMEOUT)
        assert r.status_code == 404


# ------------------- Agent step validation -------------------

class TestAgent:
    def test_instructions_too_long_422(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/training/agent/step",
                              json={"challenge_id": "c3-warmup",
                                    "instructions": "x" * 1201, "actions": []},
                              timeout=TIMEOUT)
        assert r.status_code == 422

    def test_agent_actions_cap_422(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/training/agent/step",
                              json={"challenge_id": "c3-warmup",
                                    "instructions": "reach flag",
                                    "actions": [{"type": "jump"}] * 41},
                              timeout=TIMEOUT)
        assert r.status_code == 422
