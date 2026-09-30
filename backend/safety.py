import asyncio
import ipaddress
import socket
import time
from urllib.parse import urlsplit

from llm import ask_json

BLOCKED_DOMAINS = {
    "banking": [
        "chase.com", "jpmorgan.com", "jpmorganchase.com", "bankofamerica.com", "bofa.com", "wellsfargo.com",
        "citi.com", "citibank.com", "usbank.com", "capitalone.com", "pnc.com", "tdbank.com", "hsbc.com",
        "hsbc.co.uk", "barclays.com", "barclays.co.uk", "santander.com", "lloydsbank.com", "natwest.com",
        "ally.com", "discover.com", "americanexpress.com", "sofi.com", "chime.com", "revolut.com", "monzo.com",
        "n26.com", "ing.com", "bnpparibas.com", "db.com", "ubs.com", "goldmansachs.com", "morganstanley.com",
        "truist.com", "citizensbank.com", "navyfederal.org", "regions.com", "key.com",
    ],
    "finance_brokerage": [
        "schwab.com", "fidelity.com", "vanguard.com", "etrade.com", "robinhood.com", "interactivebrokers.com",
        "tdameritrade.com", "webull.com", "merrilledge.com", "etoro.com", "plus500.com", "ig.com",
        "tastytrade.com", "public.com", "tradestation.com", "firstrade.com", "degiro.com", "trading212.com",
    ],
    "crypto_exchange": [
        "coinbase.com", "binance.com", "binance.us", "kraken.com", "crypto.com", "gemini.com", "bitstamp.net",
        "kucoin.com", "okx.com", "bybit.com", "bitfinex.com", "huobi.com", "htx.com", "gate.io",
        "blockchain.com", "metamask.io", "uniswap.org", "bitget.com", "mexc.com", "bitmex.com", "upbit.com",
    ],
    "payments": [
        "paypal.com", "venmo.com", "stripe.com", "squareup.com", "cash.app", "wise.com", "zelle.com",
        "zellepay.com", "westernunion.com", "moneygram.com", "payoneer.com", "klarna.com", "afterpay.com",
        "skrill.com", "neteller.com", "alipay.com", "adyen.com", "braintreepayments.com", "checkout.com",
        "remitly.com", "affirm.com",
    ],
    "adult": [
        "pornhub.com", "xvideos.com", "xnxx.com", "xhamster.com", "onlyfans.com", "redtube.com", "youporn.com",
        "brazzers.com", "chaturbate.com", "stripchat.com", "livejasmin.com", "spankbang.com", "fansly.com",
        "manyvids.com", "cam4.com", "bongacams.com", "eporner.com", "tube8.com", "porn.com", "youjizz.com",
    ],
    "gambling": [
        "bet365.com", "draftkings.com", "fanduel.com", "pokerstars.com", "williamhill.com", "betway.com",
        "888casino.com", "888.com", "stake.com", "stake.us", "betmgm.com", "caesars.com", "bovada.lv",
        "unibet.com", "paddypower.com", "ladbrokes.com", "betfair.com", "roobet.com", "ggpoker.com",
        "partypoker.com", "betonline.ag", "chumbacasino.com",
    ],
    "illegal": [
        "thepiratebay.org", "1337x.to", "rarbg.to", "yts.mx", "fmovies.to", "limetorrents.info",
    ],
}
BLOCKED_TLDS = {
    "xxx": "adult", "porn": "adult", "sex": "adult", "adult": "adult", "casino": "gambling", "bet": "gambling",
    "poker": "gambling", "bingo": "gambling", "bank": "banking", "onion": "illegal",
}
KEYWORD_SUBSTRINGS = {
    "porn": "adult", "xxx": "adult", "xvideo": "adult", "hentai": "adult", "camgirl": "adult", "nsfw": "adult",
    "casino": "gambling", "sportsbook": "gambling", "gambl": "gambling", "torrent": "illegal",
}
KEYWORD_TOKENS = {
    "bank": "banking", "banking": "banking", "crypto": "crypto_exchange", "bitcoin": "crypto_exchange",
    "forex": "finance_brokerage", "bet": "gambling", "betting": "gambling", "poker": "gambling",
    "sex": "adult", "escort": "adult",
}
LLM_BLOCKED = {"banking", "finance_brokerage", "crypto_exchange", "payments", "adult", "gambling", "illegal"}
INTERNAL_HOSTS = {"localhost", "metadata", "metadata.google.internal", "instance-data"}
INTERNAL_SUFFIXES = (".localhost", ".local", ".internal", ".lan", ".home", ".corp", ".intranet", ".svc", ".cluster.local")

_llm_cache: dict[str, tuple[float, dict]] = {}
_dns_cache: dict[str, tuple[float, list[str]]] = {}

CLASSIFIER = """You classify websites for a browser-automation safety filter. Given a URL, decide its primary category from:
banking, finance_brokerage, crypto_exchange, payments, adult, gambling, illegal, general.
"illegal" covers piracy, drugs/weapons marketplaces, malware, and fraud. Use your knowledge of the domain; if unknown, infer from the name.
Respond ONLY with JSON: {"category": "<one category>", "confidence": <0-1>, "reason": "<short reason>"}"""


def normalize(url: str) -> str:
    url = url.strip()
    return url if "://" in url else "https://" + url


def domain_match(host: str, domain: str) -> bool:
    return host == domain or host.endswith("." + domain)


def blocklist_category(host: str):
    for category, domains in BLOCKED_DOMAINS.items():
        for domain in domains:
            if domain_match(host, domain):
                return category, f"{domain} is on the {category.replace('_', ' ')} blocklist"
    labels = host.split(".")
    if labels[-1] in BLOCKED_TLDS:
        return BLOCKED_TLDS[labels[-1]], f".{labels[-1]} top-level domain is blocked"
    name = ".".join(labels[:-1])
    for word, category in KEYWORD_SUBSTRINGS.items():
        if word in name:
            return category, f"hostname contains '{word}'"
    tokens = set(name.replace("-", ".").split("."))
    for word, category in KEYWORD_TOKENS.items():
        if word in tokens:
            return category, f"hostname contains the word '{word}'"
    return None


def ip_blocked(ip: str) -> bool:
    addr = ipaddress.ip_address(ip.split("%")[0])
    if addr.version == 6 and addr.ipv4_mapped:
        addr = addr.ipv4_mapped
    return not addr.is_global or addr.is_multicast


async def resolve(host: str) -> list[str]:
    cached = _dns_cache.get(host)
    if cached and time.time() - cached[0] < 300:
        return cached[1]
    infos = await asyncio.get_running_loop().getaddrinfo(host, None, type=socket.SOCK_STREAM)
    ips = sorted({info[4][0] for info in infos})
    _dns_cache[host] = (time.time(), ips)
    return ips


async def ssrf_reason(host: str):
    if host in INTERNAL_HOSTS or host.endswith(INTERNAL_SUFFIXES):
        return f"{host} is an internal hostname"
    try:
        ips = await resolve(host)
    except OSError:
        return f"{host} could not be resolved"
    bad = [ip for ip in ips if ip_blocked(ip)]
    if bad:
        return f"{host} resolves to private/internal address {bad[0]}"
    return None


async def request_blocked(url: str):
    """Used while browsing external sites: blocks internal targets and blocklisted domains for every request."""
    parts = urlsplit(url)
    if parts.scheme in ("data", "blob", "about"):
        return None
    if parts.scheme not in ("http", "https") or not parts.hostname:
        return f"scheme {parts.scheme} not allowed"
    host = parts.hostname.lower().rstrip(".")
    hit = blocklist_category(host)
    return hit[1] if hit else await ssrf_reason(host)


async def llm_category(url: str, host: str) -> dict:
    cached = _llm_cache.get(host)
    if cached and time.time() - cached[0] < 3600:
        return cached[1]
    last_error = None
    for _ in range(2):
        try:
            result = await asyncio.wait_for(ask_json(CLASSIFIER, f"URL: {url}\nHostname: {host}"), timeout=25)
            category = str(result.get("category", "")).strip().lower()
            value = {"category": category, "confidence": result.get("confidence"), "reason": str(result.get("reason", ""))[:300]}
            _llm_cache[host] = (time.time(), value)
            return value
        except Exception as exc:  # noqa: BLE001
            last_error = exc
    raise RuntimeError(f"safety classifier unavailable: {last_error}")


async def check_url(raw: str) -> dict:
    url = normalize(raw)
    checks = []

    def verdict(allowed: bool, reason: str, category: str, host: str = ""):
        return {"allowed": allowed, "url": url, "host": host, "category": category, "reason": reason, "checks": checks}

    try:
        parts = urlsplit(url)
        host = (parts.hostname or "").lower().rstrip(".")
        parts.port  # noqa: B018 - raises on an invalid port
    except ValueError:
        return verdict(False, "URL could not be parsed", "invalid")
    if parts.scheme not in ("http", "https") or not host:
        checks.append({"name": "scheme", "passed": False, "detail": "only http(s) URLs with a hostname are allowed"})
        return verdict(False, "Only http:// or https:// URLs with a hostname are allowed.", "invalid", host)
    if parts.username or parts.password:
        checks.append({"name": "scheme", "passed": False, "detail": "credentials in URL"})
        return verdict(False, "URLs containing credentials are not allowed.", "invalid", host)
    checks.append({"name": "scheme", "passed": True, "detail": parts.scheme})

    hit = blocklist_category(host)
    checks.append({"name": "blocklist", "passed": hit is None, "detail": hit[1] if hit else "not on blocklist"})
    if hit:
        return verdict(False, f"Blocked: {hit[1]}.", hit[0], host)

    ssrf = await ssrf_reason(host)
    checks.append({"name": "network", "passed": ssrf is None, "detail": ssrf or "resolves to public addresses only"})
    if ssrf:
        return verdict(False, f"Blocked: {ssrf} (internal/private network access is not allowed).", "internal_network", host)

    try:
        llm = await llm_category(url, host)
    except RuntimeError as exc:
        checks.append({"name": "llm_category", "passed": False, "detail": str(exc)[:200]})
        return verdict(False, "Blocked: safety classifier unavailable, failing closed. Try again.", "unknown", host)
    blocked = llm["category"] in LLM_BLOCKED
    checks.append({"name": "llm_category", "passed": not blocked, "detail": f"{llm['category']}: {llm['reason']}"})
    if blocked:
        return verdict(False, f"Blocked: classified as {llm['category'].replace('_', ' ')} ({llm['reason']}).", llm["category"], host)
    return verdict(True, "Allowed: passed blocklist, network and category checks.", llm["category"] or "general", host)
