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

_RSS_FULLTEXT_CAP = 10  # articles/source dont on va chercher le texte COMPLET (pas le resume RSS)
# Aligne sur le cap de fetch_html() (10 aussi) ; avec rate_limit_per_host_sec=2s,
# une source RSS peut prendre jusqu'a ~20s a collecter (contre quasi-instantane
# avant) — acceptable (regle metier : la fraicheur/exactitude prime sur la
# vitesse), et absorbe par la collecte parallele multi-sources de reach_agent.
_RSS_FULLTEXT_MIN_LEN = 200  # sous ce seuil, le resume RSS est juge trop pauvre -> on tente le scrape

def _fetch_full_article(url: str) -> str:
    """Recupere le texte COMPLET d'un article (pas le resume RSS tronque a
    quelques phrases). Retourne '' si echec — l'appelant retombe alors sur le
    resume RSS (jamais de crash, jamais d'item perdu)."""
    if not url:
        return ""
    try:
        rate_limit(url)
        r = requests.get(url, headers=_HEADERS, timeout=config.LIMITS["timeout_sec"])
        r.raise_for_status()
        text = trafilatura.extract(r.text, include_comments=False, include_tables=False)
        return text or ""
    except Exception:
        return ""

def fetch_rss(source) -> List[Dict]:
    """Retourne liste d'items {title, url, summary, published_at, raw_content, image}.
    raw_content = texte COMPLET de l'article (scrape trafilatura), pas le simple
    resume RSS (souvent tronque a 1-2 phrases) : la generation d'articles doit se
    baser sur l'info reelle et complete, pas un extrait partiel (regle metier
    2026-08-19, notamment pour l'actualite nationale/GN_NAT)."""
    out = []
    try:
        rate_limit(source.url)
        # timeout réseau explicite (évite blocage indéfini)
        resp = requests.get(source.url, headers=_HEADERS,
                            timeout=config.LIMITS["timeout_sec"])
        resp.raise_for_status()
        d = feedparser.parse(resp.content)
        for i, e in enumerate(d.entries):
            img = ""
            if getattr(e, "media_content", None):
                img = e.media_content[0].get("url", "")
            elif getattr(e, "enclosures", None):
                img = e.enclosures[0].get("href", "") if e.enclosures else ""
            summary = e.get("summary", "")
            link = e.get("link", "")
            raw_content = summary
            # Texte complet uniquement pour les N premiers items (les plus
            # recents dans un flux RSS) et si le resume est trop pauvre pour
            # nourrir une synthese fiable.
            if i < _RSS_FULLTEXT_CAP and len(summary) < 2000:
                full = _fetch_full_article(link)
                if len(full) >= _RSS_FULLTEXT_MIN_LEN:
                    raw_content = full
            out.append({
                "title": e.get("title", ""),
                "url": link,
                "summary": summary,
                "published_at": e.get("published", e.get("updated", "")),
                "raw_content": raw_content,
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
        # Collecte Google News (query fixe = Guinée) : le filtre strict
        # guinee_filter s'applique APRES dans reach_agent (comme pour les autres
        # vecteurs). On ne laisse PAS passer d'articles mondiaux non liés.
        return fetch_google_news("Guinée")
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
