"""Backend tests for ALLOW_PLATFORM_KEY_FOR_DEV=false + BYOK enforcement + key validate flow."""
import os
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://agent-battle-12.preview.emergentagent.com").rstrip("/")

CREDS = {
    "free": ("free@steps.dev", "FreeCrab!2026"),
    "pro": ("pro@steps.dev", "ProCrab!2026"),
    "admin": ("admin@steps.dev", "ArenaAdmin!2026"),
}

PROVIDERS = ["anthropic", "openai", "gemini", "openrouter", "tavily"]


def login(email, password):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def tokens():
    return {k: login(*v) for k, v in CREDS.items()}


def hdr(t):
    return {"Authorization": f"Bearer {t}"}


# --- Platform-dev flag off ---
def test_auth_me_dev_platform_false(tokens):
    for role, tok in tokens.items():
        r = requests.get(f"{BASE}/api/auth/me", headers=hdr(tok), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        # dev_platform_key may be true on user record but effective fallback off; verify via /api/keys
        print(f"{role}: dev_platform_key field = {data.get('dev_platform_key')}, plan={data.get('plan')}")


def test_keys_platform_dev_false_for_all(tokens):
    for role, tok in tokens.items():
        r = requests.get(f"{BASE}/api/keys", headers=hdr(tok), timeout=20)
        assert r.status_code == 200, r.text
        for row in r.json():
            assert row["platform_dev"] is False, f"{role} {row['provider']} platform_dev={row['platform_dev']}"


# --- Run blocked when no keys saved ---
def test_free_crab_run_blocked_without_key(tokens):
    tok = tokens["free"]
    # Clear any saved keys first (defensive)
    for p in PROVIDERS:
        requests.delete(f"{BASE}/api/keys/{p}", headers=hdr(tok), timeout=10)

    # Get a crab for free
    r = requests.get(f"{BASE}/api/crabs", headers=hdr(tok), timeout=20)
    assert r.status_code == 200, r.text
    crabs = r.json()
    if not crabs:
        rc = requests.post(f"{BASE}/api/crabs", headers=hdr(tok), json={"name": "TEST_RK_crab", "model": "gemini-2.0-flash"}, timeout=20)
        assert rc.status_code in (200, 201), rc.text
        crab_id = rc.json()["id"]
    else:
        crab_id = crabs[0].get("id") or crabs[0].get("_id")

    r = requests.post(f"{BASE}/api/runs", headers=hdr(tok),
                      json={"course_id": "obstacle-1", "crab_id": crab_id, "adapter": "crab"}, timeout=30)
    print("free crab run status:", r.status_code, r.text[:400])
    # Accept 412 OR 200 where run ends with missing_key
    if r.status_code == 412:
        assert "key" in r.text.lower() or "provider" in r.text.lower()
    elif r.status_code == 200:
        data = r.json()
        end_reason = (data.get("end_reason") or "").lower()
        assert "missing" in end_reason or "key" in end_reason, f"expected missing_key, got {data}"
    else:
        pytest.fail(f"Unexpected status {r.status_code}: {r.text}")


def test_pro_relay_run_blocked_without_key(tokens):
    tok = tokens["pro"]
    # Make sure pro has no saved keys
    for p in PROVIDERS:
        requests.delete(f"{BASE}/api/keys/{p}", headers=hdr(tok), timeout=10)
    r = requests.post(f"{BASE}/api/runs", headers=hdr(tok),
                      json={"course_id": "obstacle-1", "adapter": "relay"}, timeout=30)
    print("pro relay run status:", r.status_code, r.text[:500])
    if r.status_code == 412:
        assert "key" in r.text.lower() or "provider" in r.text.lower()
    elif r.status_code == 200:
        data = r.json()
        end_reason = (data.get("end_reason") or "").lower()
        assert "missing" in end_reason or "key" in end_reason, f"expected missing_key, got {data}"
    else:
        pytest.fail(f"Unexpected status {r.status_code}: {r.text}")


# --- Fake key save + test shows provider's real error ---
@pytest.mark.parametrize("provider", PROVIDERS)
def test_fake_key_test_returns_provider_error(tokens, provider):
    tok = tokens["free"]
    # Save fake key
    r = requests.put(f"{BASE}/api/keys/{provider}", headers=hdr(tok), json={"key": "fake-key-12345678"}, timeout=20)
    assert r.status_code == 200, r.text
    # Test it (hits real provider)
    r = requests.post(f"{BASE}/api/keys/{provider}/test", headers=hdr(tok), timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    print(f"{provider} test result: ok={data['ok']} msg={data['message'][:200]}")
    assert data["ok"] is False, f"{provider}: fake key unexpectedly accepted: {data}"
    assert data["message"], f"{provider}: empty error message"
    # Cleanup
    requests.delete(f"{BASE}/api/keys/{provider}", headers=hdr(tok), timeout=10)


# --- Cleanup verification ---
def test_free_has_no_saved_keys_after(tokens):
    tok = tokens["free"]
    for p in PROVIDERS:
        requests.delete(f"{BASE}/api/keys/{p}", headers=hdr(tok), timeout=10)
    r = requests.get(f"{BASE}/api/keys", headers=hdr(tok), timeout=20)
    assert r.status_code == 200
    for row in r.json():
        assert row["saved"] is False, f"{row['provider']} still saved"
