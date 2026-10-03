import logging
import os
import sys

from cryptography.fernet import Fernet

log = logging.getLogger("config")
REGISTRATION_MODES = ("open", "invite_only", "admin_only")
PLACEHOLDERS = ("change", "secret", "default", "example", "placeholder", "your", "test", "dev", "xxx")


def _fail(msg: str) -> None:
    log.critical(msg)
    print(f"FATAL CONFIG ERROR: {msg}", file=sys.stderr, flush=True)
    sys.exit(1)


def _weak(value: str) -> bool:
    low = value.lower()
    return len(set(value)) < 10 or any(p in low for p in PLACEHOLDERS)


def validate_env() -> None:
    """Refuses to boot with missing or default secrets; no fallbacks are generated."""
    jwt_secret = os.environ.get("JWT_SECRET", "").strip()
    if len(jwt_secret) < 32 or _weak(jwt_secret):
        _fail("JWT_SECRET is missing, a default/placeholder, or shorter than 32 characters. Set a long random value.")
    fernet_key = os.environ.get("FERNET_KEY", "").strip()
    if not fernet_key or _weak(fernet_key):
        _fail("FERNET_KEY is missing or a default/placeholder. Generate one with Fernet.generate_key().")
    try:
        Fernet(fernet_key.encode())
    except ValueError:
        _fail("FERNET_KEY is not a valid Fernet key (32 url-safe base64-encoded bytes).")
    if os.environ.get("REGISTRATION_MODE") not in REGISTRATION_MODES:
        _fail(f"REGISTRATION_MODE must be one of {', '.join(REGISTRATION_MODES)}.")
    email, password = os.environ.get("BOOTSTRAP_ADMIN_EMAIL", "").strip(), os.environ.get("BOOTSTRAP_ADMIN_PASSWORD", "")
    if bool(email) != bool(password):
        _fail("Set both BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD, or neither.")
    if password and len(password) < 12:
        _fail("BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters.")
