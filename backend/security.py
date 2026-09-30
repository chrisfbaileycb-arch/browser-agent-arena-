import os
import time
from collections import defaultdict, deque

from cryptography.fernet import Fernet
from fastapi import HTTPException, Request

_fernet = Fernet(os.environ["KEYS_SECRET"].encode())
_hits: dict[str, deque] = defaultdict(deque)


def encrypt(value: str) -> str:
    return _fernet.encrypt(value.encode()).decode()


def decrypt(token: str) -> str:
    return _fernet.decrypt(token.encode()).decode()


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")


def rate_limit(scope: str, ident: str, limit: int, window_s: int = 60) -> None:
    key, now = f"{scope}:{ident}", time.monotonic()
    q = _hits[key]
    while q and now - q[0] > window_s:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(429, f"Too many requests. Try again in {int(window_s - (now - q[0])) + 1}s.")
    q.append(now)
