"""Backend tests for registration gating (invite_only), admin access management, and health."""
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://agent-battle-12.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "beta-admin@stepsofexecution.app"
ADMIN_PASSWORD = "h-wtPpgkdFTtyH_GA94"
SEEDED_CODE = "BETA-9EBFA2"

CREATED_USERS = []  # emails to clean up
CREATED_CODES = []  # codes to clean up
CREATED_EMAILS = []  # allow-listed emails to clean up


def _uniq_email(tag="qa"):
    return f"qa_{tag}_{uuid.uuid4().hex[:10]}@example.com"


@pytest.fixture
def session():
    # Fresh session per test to avoid cookie bleed-through between admin login and registrations
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["role"] == "admin"
    assert data["plan"] == "pro"
    return data["token"]


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ----------------------------- Health / mode ---------------------------------
def test_health(session):
    r = session.get(f"{API}/health")
    assert r.status_code == 200
    d = r.json()
    assert d["ok"] is True
    assert d["db"] == "ok"
    assert d["browser_mode"] in ("local", "cdp", "unavailable")
    assert d["registration_mode"] == "invite_only"


def test_access_mode(session):
    r = session.get(f"{API}/access/mode")
    assert r.status_code == 200
    assert r.json() == {"mode": "invite_only"}


# ----------------------------- Registration gate ------------------------------
def test_register_without_code_rejected(session):
    email = _uniq_email("nocode")
    r = session.post(f"{API}/auth/register", json={"email": email, "password": "Password123!", "name": "QA No Code"})
    assert r.status_code == 403
    body = r.json()
    detail = body.get("detail") if isinstance(body.get("detail"), dict) else body
    assert detail.get("error") == "invite_required", body
    time.sleep(0.5)


def test_register_with_wrong_code_rejected(session):
    email = _uniq_email("wrong")
    r = session.post(f"{API}/auth/register", json={"email": email, "password": "Password123!", "name": "QA Wrong",
                                                   "access_code": "NOPE-INVALID"})
    assert r.status_code == 403
    body = r.json()
    detail = body.get("detail") if isinstance(body.get("detail"), dict) else body
    assert detail.get("error") == "invite_required"
    time.sleep(0.5)


def test_register_with_valid_seeded_code(session):
    email = _uniq_email("seed")
    r = session.post(f"{API}/auth/register", json={"email": email, "password": "Password123!", "name": "QA Seeded",
                                                   "access_code": SEEDED_CODE})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["email"] == email
    assert data["role"] == "user"
    assert "token" in data
    CREATED_USERS.append(email)
    time.sleep(0.5)


# ------------------------------ Admin endpoints -------------------------------
def test_admin_list_access(session, admin_headers):
    r = session.get(f"{API}/admin/access", headers=admin_headers)
    assert r.status_code == 200
    d = r.json()
    assert d["mode"] == "invite_only"
    assert isinstance(d["codes"], list)
    assert isinstance(d["emails"], list)
    codes = [c["code"] for c in d["codes"]]
    assert SEEDED_CODE in codes


def test_admin_endpoints_unauthenticated(session):
    r = requests.get(f"{API}/admin/access")  # no cookies
    assert r.status_code == 401


def test_admin_endpoints_non_admin_forbidden(session):
    # register a user with seeded code to get a token
    email = _uniq_email("nonadmin")
    r = session.post(f"{API}/auth/register", json={"email": email, "password": "Password123!", "name": "QA NonAdmin",
                                                   "access_code": SEEDED_CODE})
    assert r.status_code == 200
    tok = r.json()["token"]
    CREATED_USERS.append(email)
    r2 = requests.get(f"{API}/admin/access", headers={"Authorization": f"Bearer {tok}"})
    assert r2.status_code == 403
    time.sleep(0.5)


def test_admin_create_random_code(session, admin_headers):
    r = session.post(f"{API}/admin/access/codes", json={"code": None, "max_uses": None, "expires_at": None, "note": "qa random"},
                     headers=admin_headers)
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["code"].startswith("CRAB-")
    assert d["status"] == "active"
    CREATED_CODES.append(d["code"])


def test_admin_create_custom_code(session, admin_headers):
    code = f"QA-{uuid.uuid4().hex[:6].upper()}"
    r = session.post(f"{API}/admin/access/codes", json={"code": code, "max_uses": 5,
                                                         "expires_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
                                                         "note": "qa custom"}, headers=admin_headers)
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["code"] == code.upper()
    assert d["max_uses"] == 5
    CREATED_CODES.append(d["code"])


def test_admin_create_code_past_expiry_422(session, admin_headers):
    code = f"QAPAST-{uuid.uuid4().hex[:4].upper()}"
    r = session.post(f"{API}/admin/access/codes",
                     json={"code": code, "expires_at": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
                           "note": "past"}, headers=admin_headers)
    assert r.status_code == 422, r.text


def test_admin_create_duplicate_code_409(session, admin_headers):
    r = session.post(f"{API}/admin/access/codes", json={"code": SEEDED_CODE}, headers=admin_headers)
    assert r.status_code == 409, r.text


def test_admin_revoke_code_blocks_registration(session, admin_headers):
    code = f"QAREV-{uuid.uuid4().hex[:6].upper()}"
    r = session.post(f"{API}/admin/access/codes", json={"code": code, "note": "to revoke"}, headers=admin_headers)
    assert r.status_code == 201
    CREATED_CODES.append(code.upper())

    rev = session.delete(f"{API}/admin/access/codes/{code}", headers=admin_headers)
    assert rev.status_code == 200
    assert rev.json()["revoked"] is True

    # verify status
    listing = session.get(f"{API}/admin/access", headers=admin_headers).json()
    row = next(c for c in listing["codes"] if c["code"] == code.upper())
    assert row["status"] == "revoked"

    # cannot register with revoked code
    email = _uniq_email("revoked")
    r = session.post(f"{API}/auth/register", json={"email": email, "password": "Password123!", "name": "QA Rev",
                                                    "access_code": code}, headers={"Content-Type": "application/json"})
    assert r.status_code == 403
    time.sleep(0.5)


def test_code_max_uses_1_second_registration_blocked(session, admin_headers):
    # Pace to avoid 5/min register rate-limit after many earlier registrations in this file
    time.sleep(62)
    code = f"QA1USE-{uuid.uuid4().hex[:6].upper()}"
    r = session.post(f"{API}/admin/access/codes", json={"code": code, "max_uses": 1, "note": "one use"}, headers=admin_headers)
    assert r.status_code == 201
    CREATED_CODES.append(code.upper())
    time.sleep(0.5)

    e1 = _uniq_email("use1a")
    r1 = session.post(f"{API}/auth/register", json={"email": e1, "password": "Password123!", "name": "QA Use1A",
                                                     "access_code": code})
    assert r1.status_code == 200, r1.text
    CREATED_USERS.append(e1)
    time.sleep(1.0)

    e2 = _uniq_email("use1b")
    r2 = session.post(f"{API}/auth/register", json={"email": e2, "password": "Password123!", "name": "QA Use1B",
                                                     "access_code": code})
    assert r2.status_code == 403, r2.text
    time.sleep(0.5)


def test_allow_email_case_insensitive_and_revoke(session, admin_headers):
    time.sleep(62)
    email = _uniq_email("allowed").upper()  # test case-insensitivity
    r = session.post(f"{API}/admin/access/emails", json={"email": email, "note": "qa allow"}, headers=admin_headers)
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["email"] == email.lower()
    CREATED_EMAILS.append(email.lower())
    time.sleep(1.0)

    # register without code works (using mixed-case email - should match)
    reg_email = email  # mixed-case allowed
    rr = session.post(f"{API}/auth/register", json={"email": reg_email, "password": "Password123!", "name": "QA Allowed"})
    assert rr.status_code == 200, rr.text
    CREATED_USERS.append(reg_email.lower())
    time.sleep(0.5)

    # revoke
    rv = requests.delete(f"{API}/admin/access/emails/{email.lower()}", headers=admin_headers)
    assert rv.status_code == 200

    # New registration for another email that was NOT allow-listed should fail
    other = _uniq_email("notallowed")
    r2 = session.post(f"{API}/auth/register", json={"email": other, "password": "Password123!", "name": "QA NotAllowed"})
    assert r2.status_code == 403
    time.sleep(0.5)


def test_existing_user_login_still_works(session):
    # admin is pre-existing user
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200
