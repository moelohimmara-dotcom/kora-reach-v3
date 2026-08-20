"""dedup.py — déduplication par hash url + similarité titre (mémoire)."""
import hashlib
import re

_STOP = set("le la les un une des de du et à au aux en sur pour avec dans par "
            "qui que quoi dont comme son sa ses leur leurs ce cette ces il elle".split())

def _norm_title(t: str) -> str:
    t = t.lower()
    t = re.sub(r"[^a-z0-9\s]", " ", t)
    toks = [w for w in t.split() if w not in _STOP and len(w) > 2]
    return " ".join(sorted(toks))

def _norm_url(url: str) -> str:
    """Normalise l'URL pour le dedup : retire query/fragment + trailing slash + scheme.
    Évite que les params de tracking (?ref=, ?amp) ou variantes fassent voir un
    même article comme nouveau d'un cycle à l'autre."""
    from urllib.parse import urlparse
    try:
        p = urlparse(url)
        path = p.path.rstrip("/")
        return f"{p.netloc}{path}".lower()
    except Exception:
        return url.lower()

def url_hash(url: str) -> str:
    return hashlib.sha256(_norm_url(url).encode()).hexdigest()[:16]

def title_sim(a: str, b: str) -> float:
    sa, sb = set(_norm_title(a).split()), set(_norm_title(b).split())
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)

def is_dup(item: dict, seen_urls: set, seen_titles: list, thr: float = 0.85) -> bool:
    if url_hash(item["url"]) in seen_urls:
        return True
    for t in seen_titles:
        if title_sim(item["title"], t) >= thr:
            return True
    return False
