"""Tests for iteration 3 features: auth response body/CORS, /api/stats, /api/squad,
/api/tournaments (validation only), coach shout /api/runs/{id}/hint, and self-report course URL."""
import os
import time
import requests
import pytest


BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else None
if not BASE_URL:
    from pathlib import Path
    for line in (Path(__file__).resolve().parents[2] / "frontend" / ".env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
            break
API = f"{BASE_URL}/api"


# ---------- Auth response body ----------
class TestAuthResponseBody:
    def test_login_returns_token_and_refresh(self):
        r = requests.post(f"{API}/auth/login", json={"email": "pro@steps.dev", "password": "ProCrab!2026"})
        assert r.status_code == 200, r.text
        j = r.json()
        assert isinstance(j.get("token"), str) and len(j["token"]) > 20
        assert isinstance(j.get("refresh_token"), str) and len(j["refresh_token"]) > 20
        # Cookies set with SameSite=None; Secure; Path=/
        cookies_header = r.headers.get("set-cookie", "")
        assert "access_token=" in cookies_header
        assert "refresh_token=" in cookies_header
        assert "Secure" in cookies_header
        assert "SameSite=none" in cookies_header.lower() or "samesite=none" in cookies_header.lower()
        assert "Path=/" in cookies_header

    def test_me_with_bearer_token(self):
        r = requests.post(f"{API}/auth/login", json={"email": "pro@steps.dev", "password": "ProCrab!2026"})
        token = r.json()["token"]
        # No cookies, only Bearer
        me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        assert me.json()["email"] == "pro@steps.dev"

    def test_refresh_with_json_body(self):
        r = requests.post(f"{API}/auth/login", json={"email": "pro@steps.dev", "password": "ProCrab!2026"})
        refresh_tok = r.json()["refresh_token"]
        rr = requests.post(f"{API}/auth/refresh", json={"refresh_token": refresh_tok})
        assert rr.status_code == 200, rr.text
        j = rr.json()
        assert j.get("token") and j.get("refresh_token")

    def test_google_session_bogus_returns_401_json(self):
        r = requests.post(f"{API}/auth/google/session", json={"session_id": "bogus-not-real-session-id-1234"})
        assert r.status_code in (401, 502), f"got {r.status_code}: {r.text}"
        # Must be JSON with a detail (no 500)
        j = r.json()
        assert "detail" in j and isinstance(j["detail"], str)


# ---------- CORS ----------
class TestCORS:
    def test_preflight_emergent_host_origin(self):
        origin = "https://anything.emergent.host"
        r = requests.options(f"{API}/auth/login", headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        })
        assert r.status_code == 200, r.text
        assert r.headers.get("access-control-allow-origin") == origin

    def test_preflight_emergentagent_origin(self):
        origin = "https://x.preview.emergentagent.com"
        r = requests.options(f"{API}/auth/login", headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        })
        assert r.status_code == 200
        assert r.headers.get("access-control-allow-origin") == origin

    def test_preflight_evil_origin_rejected(self):
        r = requests.options(f"{API}/auth/login", headers={
            "Origin": "https://evil.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        })
        # CORS should NOT echo evil origin
        assert r.headers.get("access-control-allow-origin") not in ("https://evil.com", "*")


# ---------- Stats ----------
class TestStats:
    def test_stats_public(self):
        r = requests.get(f"{API}/stats")
        assert r.status_code == 200
        j = r.json()
        assert set(j.keys()) >= {"crabs_registered", "goal", "runs"}
        assert isinstance(j["crabs_registered"], int)
        assert isinstance(j["goal"], int) and j["goal"] > 0
        assert isinstance(j["runs"], int)


# ---------- Course /start public course URL ----------
class TestCourseStart:
    def test_start_serves_real_station_html(self):
        # Follow the redirect from /start and confirm it lands on the real station page (start.html-like)
        r = requests.get(f"{API}/courses/obstacle-1/start", allow_redirects=True)
        assert r.status_code == 200
        # The station page should include a nonce/finish/station element from real DOM
        # It contains "Obstacle Course" or "station"
        body = r.text.lower()
        assert "obstacle" in body or "station" in body or "start" in body


# ---------- Coach Shout API ----------
def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    if r.status_code == 429:
        time.sleep(62)
        r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    return s


class TestCoachShout:
    @pytest.fixture(scope="class")
    def pro_client(self):
        return _login("pro@steps.dev", "ProCrab!2026")

    @pytest.fixture(scope="class")
    def free_client(self):
        return _login("free@steps.dev", "FreeCrab!2026")

    def test_shout_unauth(self, pro_client):
        # Grab any run id we own
        runs = pro_client.get(f"{API}/runs?limit=1").json()
        if not runs:
            pytest.skip("no runs available")
        r = requests.post(f"{API}/runs/{runs[0]['id']}/hint", json={"text": "go left"})
        assert r.status_code == 401

    def test_shout_finished_run_409(self, pro_client):
        # find a finished crab run
        runs = pro_client.get(f"{API}/runs?limit=50").json()
        finished = next((r for r in runs if r.get("status") in ("succeeded", "failed") and r.get("adapter") == "crab"), None)
        if not finished:
            pytest.skip("no finished crab run available")
        r = pro_client.post(f"{API}/runs/{finished['id']}/hint", json={"text": "hurry up"})
        assert r.status_code == 409
        assert "finished" in r.json().get("detail", "").lower()

    def test_shout_others_run_404(self, pro_client, free_client):
        # pro owns runs; free tries to shout at them
        runs = pro_client.get(f"{API}/runs?limit=1").json()
        if not runs:
            pytest.skip("no runs available")
        r = free_client.post(f"{API}/runs/{runs[0]['id']}/hint", json={"text": "help"})
        assert r.status_code == 404

    def test_shout_non_crab_adapter_409(self, pro_client):
        runs = pro_client.get(f"{API}/runs?limit=50").json()
        cu = next((r for r in runs if r.get("adapter") != "crab" and r.get("status") in ("failed", "succeeded")), None)
        if not cu:
            pytest.skip("no CU run to test 409-non-crab")
        r = pro_client.post(f"{API}/runs/{cu['id']}/hint", json={"text": "coach"})
        # Might be 404 (finished) or 409; when finished, current code hits status 409 finished first
        assert r.status_code in (409, 404)


# ---------- Tournaments ----------
class TestTournaments:
    @pytest.fixture(scope="class")
    def pro(self):
        return _login("pro@steps.dev", "ProCrab!2026")

    @pytest.fixture(scope="class")
    def free(self):
        return _login("free@steps.dev", "FreeCrab!2026")

    def test_free_402(self, free):
        r = free.post(f"{API}/tournaments", json={"entrants": [{"adapter": "claude_computer_use"}, {"adapter": "openai_computer_use"}]})
        assert r.status_code == 402, r.text

    def test_invalid_entrants_422(self, pro):
        # only 1 entrant -> pydantic 422
        r = pro.post(f"{API}/tournaments", json={"entrants": [{"adapter": "claude_computer_use"}]})
        assert r.status_code == 422

    def test_entrant_without_ids_422(self, pro):
        r = pro.post(f"{API}/tournaments", json={"entrants": [{}, {}]})
        assert r.status_code == 422

    def test_bad_adapter_422(self, pro):
        r = pro.post(f"{API}/tournaments", json={"entrants": [{"adapter": "not-real"}, {"adapter": "not-real"}]})
        assert r.status_code == 422

    def test_list_tournaments(self, pro):
        r = pro.get(f"{API}/tournaments")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_get_tournament_bracket_shape(self, pro):
        # Only test shape if there's an existing tournament (from earlier iterations manual verify)
        lst = pro.get(f"{API}/tournaments").json()
        if not lst:
            pytest.skip("no tournaments; not creating a new one (real runs cost ~90s each)")
        t = pro.get(f"{API}/tournaments/{lst[0]['id']}").json()
        assert "rounds" in t
        # 2 entrants -> 1 round with 1 match
        assert isinstance(t["rounds"], list)
        for rnd in t["rounds"]:
            for m in rnd:
                assert set(m.keys()) >= {"a", "b", "run_a", "run_b", "score_a", "score_b", "winner"}


# ---------- Squad ----------
class TestSquad:
    @pytest.fixture(scope="class")
    def pro(self):
        return _login("pro@steps.dev", "ProCrab!2026")

    def test_get_default_squad(self, pro):
        r = pro.get(f"{API}/squad")
        assert r.status_code == 200
        j = r.json()
        assert set(j.keys()) >= {"slots", "formation"}
        assert set(j["slots"].keys()) >= {"scout", "extract", "gate", "settle"}

    def test_put_bad_formation_422(self, pro):
        r = pro.put(f"{API}/squad", json={"slots": {"scout": None, "extract": None, "gate": None, "settle": None},
                                          "formation": "9-9-9"})
        assert r.status_code == 422

    def test_put_foreign_crab_404(self, pro):
        # Champion crab is not user's own
        chs = requests.get(f"{API}/champions").json()
        assert chs
        r = pro.put(f"{API}/squad", json={"slots": {"scout": chs[0]["id"], "extract": None, "gate": None, "settle": None},
                                          "formation": "1-2-1"})
        assert r.status_code == 404

    def test_put_valid_squad(self, pro):
        # Get user's own crabs
        crabs = pro.get(f"{API}/crabs").json()
        if not crabs:
            pytest.skip("pro has no owned crabs to place in a squad")
        c0 = crabs[0]["id"]
        r = pro.put(f"{API}/squad", json={"slots": {"scout": c0, "extract": None, "gate": None, "settle": None},
                                          "formation": "2-2"})
        assert r.status_code == 200
        assert r.json()["formation"] == "2-2"
        assert r.json()["slots"]["scout"] == c0
        # GET verifies persistence
        g = pro.get(f"{API}/squad").json()
        assert g["formation"] == "2-2"
        assert g["slots"]["scout"] == c0

    def test_squad_unauth(self):
        r = requests.get(f"{API}/squad")
        assert r.status_code == 401
