"""guardrails.py — whitelist stricte + blocage redirections + robots + rate-limit.
Utilise whitelist.py (matrice versionnée) au lieu de config.SOURCES plat.
Toute cible hors whitelist = refusée, y compris après redirection.
"""
import time
import urllib.robotparser
from urllib.parse import urlparse
from typing import Dict, Optional
import collection.whitelist as wl

_rp_cache: Dict[str, urllib.robotparser.RobotFileParser] = {}
_last_req: Dict[str, float] = {}


def _host(url: str) -> str:
    return (urlparse(url).netloc or "").lower()


def in_whitelist(url: str) -> bool:
    return wl.is_allowed(url)


def robots_allows(url: str, user_agent: str = "KoraReachBot") -> bool:
    try:
        host = _host(url)
        if host not in _rp_cache:
            rp = urllib.robotparser.RobotFileParser()
            rp.set_url(f"https://{host}/robots.txt")
            rp.read()
            _rp_cache[host] = rp
        return _rp_cache[host].can_fetch(user_agent, url)
    except Exception:
        return True


def rate_limit(url: str, per_host: float = 2.0):
    host = _host(url)
    now = time.time()
    last = _last_req.get(host, 0.0)
    wait = per_host - (now - last)
    if wait > 0:
        time.sleep(wait)
    _last_req[host] = time.time()


def check(url: str) -> bool:
    """Autorisé si whitelist + robots."""
    return in_whitelist(url) and robots_allows(url)


def check_redirect(initial_url: str, final_url: str) -> bool:
    """Blocage post-redirection : la cible finale doit aussi être whitelistée.
    Retourne True si les deux (initiale + finale) sont autorisées."""
    return in_whitelist(initial_url) and in_whitelist(final_url)


def safe_get(session_get, url: str, **kwargs) -> Optional[object]:
    """Effectue GET avec follow_redirects=False pour inspecter la cible finale.
    Lève / retourne None si redirection hors whitelist."""
    kwargs.setdefault("allow_redirects", False)
    kwargs.setdefault("timeout", 10)
    try:
        resp = session_get(url, **kwargs)
        if resp.status_code in (301, 302, 303, 307, 308):
            loc = resp.headers.get("Location", "")
            if loc and not check_redirect(url, loc):
                return None  # redirection hors whitelist -> refusée
            # on suit manuellement si autorisée
            return session_get(loc, allow_redirects=False, timeout=kwargs.get("timeout", 10))
        return resp
    except Exception:
        return None
