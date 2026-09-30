# Auth testing
Cookie JWT auth (access_token 30m, refresh_token 7d, SameSite=Lax, Secure). Login: POST /api/auth/login {email,password}; GET /api/auth/me. Brute force: 5 failures per ip+email => 15 min lock. Google: Emergent-managed; frontend sends #session_id to POST /api/auth/google/session. Credentials in /app/memory/test_credentials.md.
