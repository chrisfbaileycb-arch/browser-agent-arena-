# Auth testing
Cookie JWT auth (access_token 30m, refresh_token 7d, SameSite=None, Secure) + Bearer header fallback.
Login: POST /api/auth/login {email,password}; GET /api/auth/me. Brute force: 5 failures per ip+email => 15 min lock.
Google: Emergent-managed; frontend sends #session_id (+ optional access_code) to POST /api/auth/google/session.
Registration gate: REGISTRATION_MODE (open | invite_only | admin_only). invite_only needs a DB access code or allow-listed email
for NEW accounts only (POST /api/auth/register {name,email,password,access_code}). Admin manages codes/emails at /admin
(GET /api/admin/access, POST/DELETE /api/admin/access/codes, /api/admin/access/emails).
Admin account comes from BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD env only. No credentials are stored in files.
Never write credentials into test files or reports: tests read TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD / TEST_ACCESS_CODE from the shell env.
After every testing pass run: python3 scripts/scrub_test_reports.py (redacts all env secrets + every access code from test_reports/ and backend/tests).
