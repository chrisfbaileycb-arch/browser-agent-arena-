# Auth testing
Cookie JWT auth (access_token 30m, refresh_token 7d, SameSite=None, Secure) + Bearer header fallback.
Login: POST /api/auth/login {email,password}; GET /api/auth/me. Brute force: 5 failures per ip+email => 15 min lock.
Google: Emergent-managed; frontend sends #session_id (+ optional access_code) to POST /api/auth/google/session.
Registration gate: REGISTRATION_MODE (open | invite_only | admin_only). invite_only needs a DB access code or allow-listed email
for NEW accounts only (POST /api/auth/register {name,email,password,access_code}). Admin manages codes/emails at /admin
(GET /api/admin/access, POST/DELETE /api/admin/access/codes, /api/admin/access/emails).
Admin account comes from BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD env only. No credentials are stored in files.
