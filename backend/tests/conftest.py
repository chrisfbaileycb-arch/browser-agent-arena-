import os
import time
import requests
import pytest
from pathlib import Path
from dotenv import load_dotenv

# Load backend env for test-only cleanup (Mongo access, admin secret, etc.)
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else None
if not BASE_URL:
    # frontend env
    fe_env = Path(__file__).resolve().parents[2] / "frontend" / ".env"
    for line in fe_env.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
            break

API = f"{BASE_URL}/api"


def _client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(email, password):
    s = _client()
    # Login endpoint is rate-limited (10/60s per IP). Retry once after backoff on 429.
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    if r.status_code == 429:
        time.sleep(62)
        r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="session")
def api():
    return API


@pytest.fixture(scope="session")
def anon():
    return _client()


@pytest.fixture(scope="session")
def admin():
    return _login("admin@steps.dev", "ArenaAdmin!2026")


@pytest.fixture(scope="session")
def pro():
    return _login("pro@steps.dev", "ProCrab!2026")


@pytest.fixture(scope="session")
def free():
    return _login("free@steps.dev", "FreeCrab!2026")


@pytest.fixture(scope="session")
def new_user():
    """Newly registered user (no dev fallback)."""
    email = f"TEST_new_{int(time.time())}@example.com"
    s = _client()
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "Testing!2026", "name": "Test New"}, timeout=30)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    return s, email
