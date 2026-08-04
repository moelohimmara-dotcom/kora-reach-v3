"""fetchers.py — collecte RSS (feedparser) + HTML (trafilatura)."""
import feedparser
import trafilatura
import requests
import re
import config
from guardrails import check as guardrails_check, rate_limit
from typing import List, Dict, Optional

_HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}

def _article_title(html: str) -> str:
    from bs4 import BeautifulSoup
    s = BeautifulSoup(html, "html.parser")
    for tag in ("h1", "h2"):
        t = s.find(tag)
        if t and t.get_text(strip=True):
            return t.get_text(strip=True)
    return ""

def _guess_date(url: str) -> str:
    import re
    m = re.search(r"/(\d{4})/(\d{2})/(\d{2})/", url)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}T00:00:00"
    return ""

def fetch_rss(source) -> List[Dict]:
    """Retourne liste d'items {title, url, summary, published_at, raw_content, image}."""
    out = []
    try:
        rate_limit(source.url)
        # timeout réseau explicite (évite blocage indéfini)
        resp = requests.get(source.url, headers=_HEADERS,
                            timeout=config.LIMITS["timeout_sec"])
        resp.raise_for_status()
        d = feedparser.parse(resp.content)
        for e in d.entries:
            img = ""
            if getattr(e, "media_content", None):
                img = e.media_content[0].get("url", "")
            elif getattr(e, "enclosures", None):
                img = e.enclosures[0].get("href", "") if e.enclosures else ""
            out.append({
                "title": e.get("title", ""),
                "url": e.get("link", ""),
                "summary": e.get("summary", ""),
                "published_at": e.get("published", e.get("updated", "")),
                "raw_content": e.get("summary", ""),
                "image": img,
            })
    except Exception as ex:
        print(f"[RSS] échec {source.name}: {ex}")
    return out

def fetch_html(source) -> List[Dict]:
    """Scrape la home, extrait les liens d'articles, fetch chaque article via trafilatura.
    Pattern permissif : tout lien same-domain avec slug profond (>=3 segments), hors
    catégories/tags/auteurs. Limite 10 articles/source, les plus récents (URL datée) d'abord."""
    out = []
    try:
        rate_limit(source.url)
        resp = requests.get(source.url, headers=_HEADERS, timeout=config.LIMITS["timeout_sec"])
        html = resp.text
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "html.parser")
        base = source.url.rstrip("/")
        host = base.split("//")[1].split("/")[0].replace("www.", "")
        _EXCLUDE = ("/category/", "/tag/", "/author/", "/page/", "/contact",
                    "/about", "/a-propos", "/mentions", "/legal", "/rss",
                    "/sitemap", "/login", "/compte", "/recherche", "/search")
        candidates = []
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if href.startswith("/"):
                href = base + href
            if not href.startswith("http"):
                continue
            h = href.split("//")[-1].split("/")[0].replace("www.", "")
            if h != host:
                continue  # hors domaine
            if href.rstrip("/") in (base, base + "/"):
                continue  # home
            path = href.split("//")[-1].split("/", 1)[-1].rstrip("/")
            segs = [s for s in path.split("/") if s]
            if len(segs) < 3:
                continue  # pas un vrai slug d'article
            if any(x in href.lower() for x in _EXCLUDE):
                continue
            dated = bool(re.search(r"/20\d{2}/", href))  # URL avec année = article daté
            candidates.append((dated, href))
        # tri : datés d'abord, puis limite 10
        candidates.sort(key=lambda x: x[0], reverse=True)
        for _, link in candidates[:10]:
            try:
                rate_limit(link)
                r2 = requests.get(link, headers=_HEADERS, timeout=config.LIMITS["timeout_sec"])
                extracted = trafilatura.extract(r2.text, include_comments=False,
                                                include_tables=False)
                meta = trafilatura.extract_metadata(r2.text)
                img = meta.image if meta else ""
                if extracted and len(extracted) > 200:
                    title = _article_title(r2.text) or (meta.title if meta else link)
                    out.append({
                        "title": title,
                        "url": link,
                        "summary": extracted[:400],
                        "published_at": _guess_date(link) or (meta.date if meta else ""),
                        "raw_content": extracted,
                        "image": img or "",
                    })
            except Exception:
                continue
    except Exception as ex:
        print(f"[HTML] échec {source.name}: {ex}")
    return out

def fetch_source(source) -> List[Dict]:
    """Collecte brute. Le filtre INTL Guinée strict est appliqué dans reach_agent
    (guinea_filter.py), pas ici, pour garder une seule règle de désambiguïsation.
    Accepte WhitelistEntry (vector_primary) ou Source legacy (fmt)."""
    fmt = getattr(source, "vector_primary", None) or getattr(source, "fmt", "html")
    if fmt == "rss":
        return fetch_rss(source)
    if fmt == "html":
        return fetch_html(source)
    if fmt == "gnews":
        from alt_sources import fetch_google_news
        return fetch_google_news(source.url)
    if fmt == "sitemap":
        from alt_sources import fetch_sitemap
        return fetch_sitemap(source)
    if fmt == "gdelt":
        from alt_sources import fetch_gdelt
        return fetch_gdelt(source.url)
    if fmt == "wayback":
        from alt_sources import fetch_wayback
        return fetch_wayback(source.url)
    return fetch_html(source)
