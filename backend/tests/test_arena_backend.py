"""Backend end-to-end tests for Steps of Execution / Browser Agent Arena."""
import time
import pytest
import requests

# ---------- Health / meta ----------
class TestMeta:
    def test_root(self, api):
        r = requests.get(f"{api}/")
        assert r.status_code == 200
        assert r.json().get("product") == "Browser Agent Arena"

    def test_openapi(self, api):
        r = requests.get(f"{api}/openapi.json")
        assert r.status_code == 200
        assert "paths" in r.json()

    def test_adapters(self, api):
        r = requests.get(f"{api}/adapters")
        assert r.status_code == 200
        data = r.json()
        by_id = {a["id"]: a for a in data}
        # All 5 adapters must be present and available=true
        for slot in ("crab", "claude_computer_use", "openai_computer_use", "gemini_computer_use", "own_endpoint"):
            assert slot in by_id, f"missing adapter {slot}"
            assert by_id[slot]["available"] is True, f"{slot} not available: {by_id[slot]}"
            look = by_id[slot].get("look") or {}
            if slot != "crab":
                assert set(look.keys()) >= {"color", "accent", "accessory"}, f"{slot} look missing fields: {look}"
        # CU adapters expose provider + model
        expected_models = {
            "claude_computer_use": ("anthropic", "claude-sonnet-4-6"),
            "openai_computer_use": ("openai", "gpt-6.1-sol"),
            "gemini_computer_use": ("gemini", "gemini-3.8-flash"),
        }
        for slot, (prov, mdl) in expected_models.items():
            assert by_id[slot].get("provider") == prov, f"{slot} provider={by_id[slot].get('provider')}"
            assert by_id[slot].get("model") == mdl, f"{slot} model={by_id[slot].get('model')}"


# ---------- Auth ----------
class TestAuth:
    def test_me_unauth(self, api, anon):
        assert anon.get(f"{api}/auth/me").status_code == 401

    def test_login_bad_password(self, api):
        r = requests.post(f"{api}/auth/login", json={"email": "pro@steps.dev", "password": "wrongwrong"})
        assert r.status_code == 401

    def test_login_and_me(self, api, pro):
        me = pro.get(f"{api}/auth/me")
        assert me.status_code == 200
        assert me.json()["email"] == "pro@steps.dev"
        assert me.json()["plan"] == "pro"

    def test_logout(self, api):
        s = requests.Session()
        r = s.post(f"{api}/auth/login", json={"email": "pro@steps.dev", "password": "ProCrab!2026"})
        assert r.status_code == 200
        assert s.post(f"{api}/auth/logout").status_code == 200
        assert s.get(f"{api}/auth/me").status_code == 401

    def test_lockout_after_5_failures(self, api):
        email = f"TEST_lockout_{int(time.time())}@example.com"
        # Register then log out to have a real target
        s = requests.Session()
        r = s.post(f"{api}/auth/register", json={"email": email, "password": "Testing!2026", "name": "Lockout"})
        assert r.status_code == 200
        s.post(f"{api}/auth/logout")
        codes = []
        for _ in range(6):
            r = requests.post(f"{api}/auth/login", json={"email": email, "password": "wrongpass!"})
            codes.append(r.status_code)
        # After 5 wrong -> 429
        assert 429 in codes[-2:], f"expected 429 in tail codes, got {codes}"


# ---------- Safety ----------
class TestSafety:
    @pytest.mark.parametrize("url", [
        "https://chase.com",
        "https://pornhub.com",
        "http://localhost/foo",
        "http://169.254.169.254/latest/meta-data/",
        "http://10.0.0.5/",
    ])
    def test_blocked(self, api, pro, url):
        r = pro.post(f"{api}/safety/check", json={"url": url})
        assert r.status_code == 200
        assert r.json()["allowed"] is False, f"expected {url} blocked, got {r.json()}"

    def test_allowed(self, api, pro):
        r = pro.post(f"{api}/safety/check", json={"url": "https://example.com"})
        assert r.status_code == 200
        assert r.json()["allowed"] is True

    def test_requires_auth(self, api, anon):
        assert anon.post(f"{api}/safety/check", json={"url": "https://example.com"}).status_code == 401


# ---------- Keys ----------
class TestKeys:
    def test_list_never_leaks_key(self, api, pro):
        r = pro.get(f"{api}/keys")
        assert r.status_code == 200
        for entry in r.json():
            assert "cipher" not in entry and "key" not in entry
            assert set(entry.keys()) >= {"provider", "saved", "last4"}

    def test_save_test_delete_tavily(self, api, pro):
        fake = "tvly-fake-123456789"
        r = pro.put(f"{api}/keys/tavily", json={"key": fake})
        assert r.status_code == 200
        assert r.json()["last4"] == fake[-4:]
        listed = {e["provider"]: e for e in pro.get(f"{api}/keys").json()}
        assert listed["tavily"]["saved"] is True
        assert listed["tavily"]["last4"] == fake[-4:]
        # Test call: rejected by Tavily
        t = pro.post(f"{api}/keys/tavily/test")
        assert t.status_code == 200
        assert t.json()["ok"] is False
        # Delete
        d = pro.delete(f"{api}/keys/tavily")
        assert d.status_code == 200
        assert d.json()["saved"] is False
        assert not any(e["saved"] and e["provider"] == "tavily" for e in pro.get(f"{api}/keys").json())


# ---------- Crab CRUD ----------
class TestCrabs:
    def test_crab_crud(self, api, pro):
        payload = {"name": f"TEST_Crab_{int(time.time())}", "provider": "gemini", "model": "gemini-3-flash-preview",
                   "personality": "swift", "skills": ["scroll"], "accessory": "crown"}
        r = pro.post(f"{api}/crabs", json=payload)
        assert r.status_code == 201, r.text
        crab = r.json()
        assert crab["name"] == payload["name"]
        assert crab["level"] >= 1
        crab_id = crab["id"]
        # Update
        payload["personality"] = "cheerful"
        u = pro.put(f"{api}/crabs/{crab_id}", json=payload)
        assert u.status_code == 200
        assert u.json()["personality"] == "cheerful"
        # In list
        listed = pro.get(f"{api}/crabs").json()
        assert any(c["id"] == crab_id for c in listed)
        # Delete
        d = pro.delete(f"{api}/crabs/{crab_id}")
        assert d.status_code == 200
        assert not any(c["id"] == crab_id for c in pro.get(f"{api}/crabs").json())


# ---------- Runs auth + BYOK ----------
class TestRunsAuthAndByok:
    def test_runs_requires_auth(self, api, anon):
        r = anon.post(f"{api}/runs", json={"course_id": "obstacle-1"})
        assert r.status_code == 401

    def test_new_user_no_key_returns_412(self, api, new_user):
        s, _ = new_user
        # Create a crab
        payload = {"name": "TEST_NewCrab", "provider": "gemini", "model": "gemini-3-flash-preview"}
        c = s.post(f"{api}/crabs", json=payload)
        assert c.status_code == 201
        crab_id = c.json()["id"]
        r = s.post(f"{api}/runs", json={"course_id": "obstacle-1", "crab_id": crab_id})
        assert r.status_code == 412
        detail = r.json().get("detail", "")
        assert "Gemini" in detail and "My Keys" in detail


# ---------- Free quota ----------
class TestFreeQuota:
    def test_free_second_run_is_402(self, api, free):
        # Create a crab for free user (if none)
        crabs = free.get(f"{api}/crabs").json()
        if not crabs:
            c = free.post(f"{api}/crabs", json={"name": "TEST_FreeCrab", "provider": "gemini",
                                                "model": "gemini-3-flash-preview"})
            crab_id = c.json()["id"]
        else:
            crab_id = crabs[0]["id"]
        # Try starting a run: it may be 201 (first ever) or 402 (already exhausted).
        r = free.post(f"{api}/runs", json={"course_id": "obstacle-1", "crab_id": crab_id})
        if r.status_code == 201:
            # Immediately try again -> should be 402
            r2 = free.post(f"{api}/runs", json={"course_id": "obstacle-1", "crab_id": crab_id})
            assert r2.status_code == 402, r2.text
        else:
            assert r.status_code == 402, f"expected 402 for exhausted free quota, got {r.status_code} {r.text}"


# ---------- Champion replays ----------
class TestReplays:
    def test_public_replays(self, api, anon):
        r = anon.get(f"{api}/replays?course_id=obstacle-1")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # There may or may not be replays yet, but champion crabs exist
        chs = anon.get(f"{api}/champions").json()
        assert len(chs) >= 3
        names = {c["name"] for c in chs}
        assert {"Claude Clawdia", "GPT Pincer", "Gemini Scuttler"}.issubset(names)


# ---------- Leaderboard ----------
class TestLeaderboard:
    def test_leaderboard_public(self, api, anon):
        r = anon.get(f"{api}/leaderboard/obstacle-1")
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        for row in rows:
            assert row["badge"] in ("verified", "self_reported")


# ---------- Course pages ----------
class TestCourse:
    def test_course_redirects_to_start(self, api):
        r = requests.get(f"{api}/courses/obstacle-1", allow_redirects=False)
        assert r.status_code in (302, 307)
        assert "/start" in r.headers.get("location", "")

    def test_start_creates_attempt_and_redirects(self, api):
        # /start with no attempt id should create one and redirect
        r = requests.get(f"{api}/courses/obstacle-1/start", allow_redirects=False)
        assert r.status_code in (302, 307)
        loc = r.headers.get("location", "")
        assert "?a=" in loc

    def test_out_of_order_notice(self, api):
        # Fresh attempt
        r = requests.get(f"{api}/courses/obstacle-1/start", allow_redirects=False)
        loc = r.headers.get("location", "")
        attempt_id = loc.split("?a=", 1)[1]
        # Try to jump to /finish directly
        r2 = requests.get(f"{api}/courses/obstacle-1/finish?a={attempt_id}")
        assert r2.status_code == 200
        assert "Out of order" in r2.text

    def test_clear_wrong_nonce(self, api):
        r = requests.get(f"{api}/courses/obstacle-1/start", allow_redirects=False)
        attempt_id = r.headers.get("location", "").split("?a=", 1)[1]
        r2 = requests.post(f"{api}/course-attempts/{attempt_id}/clear",
                           json={"station": "start", "nonce": "not-a-real-nonce"})
        assert r2.status_code == 409


# ---------- Self report ----------
class TestSelfReport:
    def test_wrong_code_rejected(self, api, pro):
        # Create attempt owned by pro
        r = pro.post(f"{api}/course-attempts", json={"course_id": "obstacle-1", "agent_label": "TEST_selfreport"})
        assert r.status_code == 201, r.text
        att = r.json()
        aid = att["id"]
        r2 = pro.post(f"{api}/course-attempts/{aid}/submit",
                      json={"code": "WRONG-CODE-XYZ", "steps": 10})
        # Backend returns verified=False on wrong code
        assert r2.status_code == 200
        assert r2.json().get("verified") is False


# ---------- Challenges ----------
class TestChallenges:
    def test_save_and_delete(self, api, pro):
        body = {"name": f"TEST_Chal_{int(time.time())}", "draft": {"nodes": [], "edges": []}}
        r = pro.post(f"{api}/challenges", json=body)
        assert r.status_code == 201
        cid = r.json()["id"]
        listed = pro.get(f"{api}/challenges").json()
        assert any(c["id"] == cid for c in listed)
        assert pro.delete(f"{api}/challenges/{cid}").status_code == 200


# ---------- Workflow ----------
class TestWorkflow:
    def test_workflow_status(self, api, pro):
        r = pro.get(f"{api}/workflow/status")
        assert r.status_code == 200
        assert set(r.json().keys()) >= {"gemini", "openai", "anthropic", "openrouter", "tavily"}

    def test_workflow_live_missing_tavily_412(self, api, pro):
        # Make sure tavily is not saved
        pro.delete(f"{api}/keys/tavily")
        body = {"objective": "Latest price of widget",
                "workflow": {"intent": "price", "nodes": [{"id": "scout"}, {"id": "extract"}, {"id": "gate"}, {"id": "settle"}]},
                "target_url": "https://example.com"}
        r = pro.post(f"{api}/workflow/live", json=body)
        assert r.status_code == 412
        assert "Tavily" in r.json().get("detail", "")


# ---------- Exports ----------
class TestExports:
    def test_free_export_402(self, api, free):
        # Get any crab (free user's; may not have one). Use their own.
        crabs = free.get(f"{api}/crabs").json()
        if not crabs:
            pytest.skip("free user has no crab")
        r = free.get(f"{api}/exports/crab/{crabs[0]['id']}")
        assert r.status_code == 402

    def test_pro_export_ok(self, api, pro):
        crabs = pro.get(f"{api}/crabs").json()
        if not crabs:
            c = pro.post(f"{api}/crabs", json={"name": "TEST_ExportCrab", "provider": "gemini",
                                                "model": "gemini-3-flash-preview"})
            crab_id = c.json()["id"]
        else:
            crab_id = crabs[0]["id"]
        r = pro.get(f"{api}/exports/crab/{crab_id}")
        assert r.status_code == 200
        assert "crab_runner.py" in r.json()


# ---------- Billing ----------
class TestBilling:
    def test_plans(self, api, anon):
        r = anon.get(f"{api}/billing/plans")
        assert r.status_code == 200
        assert any(p["lookup_key"] == "arena_pro_monthly" for p in r.json())

    def test_checkout_free_user(self, api, free):
        r = free.post(f"{api}/payments/checkout",
                      json={"lookup_key": "arena_pro_monthly",
                            "origin_url": "https://b125f591-4e02-4831-8b6d-3a14312919cc.preview.emergentagent.com"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("checkout_url", "").startswith("https://")
        assert data.get("session_id")
        # Poll status endpoint
        s = free.get(f"{api}/payments/status/{data['session_id']}")
        assert s.status_code == 200
        assert s.json()["payment_status"] in ("pending", "paid")


# ---------- Computer-use adapters: BYOK enforcement ----------
class TestComputerUseByok:
    """Pro user has dev_platform_key fallback; but CU adapters require user's own key."""

    @pytest.mark.parametrize("adapter,provider,vendor_hint", [
        ("claude_computer_use", "anthropic", "Anthropic"),
        ("openai_computer_use", "openai", "OpenAI"),
        ("gemini_computer_use", "gemini", "Gemini"),
    ])
    def test_pro_no_key_412(self, api, pro, adapter, provider, vendor_hint):
        # Ensure no user key saved for this provider
        pro.delete(f"{api}/keys/{provider}")
        r = pro.post(f"{api}/runs", json={"course_id": "obstacle-1", "adapter": adapter})
        assert r.status_code == 412, r.text
        detail = r.json().get("detail", "")
        assert "only on your own" in detail and vendor_hint in detail, detail

    @pytest.mark.parametrize("adapter", [
        "claude_computer_use", "openai_computer_use", "gemini_computer_use",
    ])
    def test_free_champion_402(self, api, free, adapter):
        r = free.post(f"{api}/runs", json={"course_id": "obstacle-1", "adapter": adapter})
        assert r.status_code == 402, r.text
        assert "Pro" in r.json().get("detail", "")

    def test_fake_anthropic_key_accepted_then_errored(self, api, pro):
        """Save a fake anthropic key, start claude_computer_use run -> 201; poll until it settles as failed with 401 message."""
        fake = "sk-ant-fake-000000000001"
        try:
            k = pro.put(f"{api}/keys/anthropic", json={"key": fake})
            assert k.status_code == 200, k.text
            r = pro.post(f"{api}/runs", json={"course_id": "obstacle-1", "adapter": "claude_computer_use"})
            assert r.status_code == 201, r.text
            run_id = r.json()["id"]
            # Poll the run until it finishes
            deadline = time.time() + 120
            final = None
            while time.time() < deadline:
                s = pro.get(f"{api}/runs/{run_id}")
                if s.status_code != 200:
                    time.sleep(2); continue
                data = s.json()
                if data.get("status") in ("succeeded", "failed", "error"):
                    final = data
                    break
                time.sleep(3)
            assert final is not None, "run never finished"
            assert final["status"] in ("failed", "error"), f"expected failed, got {final.get('status')}"
            err = str(final.get("error") or "")
            assert "Anthropic" in err and "401" in err, f"expected Anthropic 401 error message, got {err!r}"
        finally:
            pro.delete(f"{api}/keys/anthropic")


# ---------- Agent Endpoint CRUD ----------
class TestAgentEndpoint:
    def test_endpoint_flow(self, api, pro):
        # Ensure clean state
        pro.delete(f"{api}/endpoint")

        # GET returns null when not set
        r = pro.get(f"{api}/endpoint")
        assert r.status_code == 200
        assert r.json() is None

        # Non-https rejected (pydantic 422)
        r = pro.put(f"{api}/endpoint", json={"url": "http://example.com/hook"})
        assert r.status_code == 422, r.text

        # Private/internal host rejected via safety check (422 from HTTPException)
        r = pro.put(f"{api}/endpoint", json={"url": "https://127.0.0.1/x"})
        assert r.status_code == 422, r.text

        # Valid public URL accepted, returns one-time secret
        r = pro.put(f"{api}/endpoint", json={"url": "https://httpbin.org/post"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("secret") and isinstance(data["secret"], str) and len(data["secret"]) >= 20
        first_secret = data["secret"]
        assert data["url"] == "https://httpbin.org/post"

        # Second PUT: secret is null (not re-issued)
        r2 = pro.put(f"{api}/endpoint", json={"url": "https://httpbin.org/post"})
        assert r2.status_code == 200
        assert r2.json().get("secret") is None

        # GET now returns the endpoint (secret=None)
        g = pro.get(f"{api}/endpoint")
        assert g.status_code == 200
        gj = g.json()
        assert gj and gj["url"] == "https://httpbin.org/post" and gj.get("secret") is None

        # Rotate returns a new secret different from the first
        rot = pro.post(f"{api}/endpoint/rotate")
        assert rot.status_code == 200
        new_secret = rot.json().get("secret")
        assert new_secret and new_secret != first_secret

        # DELETE disconnects
        d = pro.delete(f"{api}/endpoint")
        assert d.status_code == 200
        assert d.json().get("deleted") is True
        assert pro.get(f"{api}/endpoint").json() is None

    def test_rotate_without_endpoint_404(self, api, pro):
        pro.delete(f"{api}/endpoint")
        r = pro.post(f"{api}/endpoint/rotate")
        assert r.status_code == 404


# ---------- Own-endpoint runs ----------
class TestOwnEndpointRun:
    def test_no_endpoint_412(self, api, pro):
        pro.delete(f"{api}/endpoint")
        r = pro.post(f"{api}/runs", json={"course_id": "obstacle-1", "adapter": "own_endpoint"})
        assert r.status_code == 412, r.text
        assert "endpoint" in r.json().get("detail", "").lower()

    def test_with_httpbin_endpoint_accepted_and_gives_up(self, api, pro):
        # Connect httpbin (echoes back; no answer -> agent_gave_up)
        pro.delete(f"{api}/endpoint")
        try:
            put_r = pro.put(f"{api}/endpoint", json={"url": "https://httpbin.org/post"})
            assert put_r.status_code == 200
            r = pro.post(f"{api}/runs", json={"course_id": "obstacle-1", "adapter": "own_endpoint"})
            assert r.status_code == 201, r.text
            run_id = r.json()["id"]
            deadline = time.time() + 180
            final = None
            while time.time() < deadline:
                s = pro.get(f"{api}/runs/{run_id}")
                if s.status_code == 200:
                    data = s.json()
                    if data.get("status") in ("succeeded", "failed", "error"):
                        final = data
                        break
                time.sleep(3)
            assert final is not None, "run never finished"
            # Should end failed with end_reason agent_gave_up
            assert final["status"] == "failed", f"expected failed, got {final.get('status')}"
            assert final.get("end_reason") == "agent_gave_up", f"end_reason={final.get('end_reason')}"
            assert (final.get("profile") or {}).get("name") == "Your Agent Endpoint"
        finally:
            pro.delete(f"{api}/endpoint")
