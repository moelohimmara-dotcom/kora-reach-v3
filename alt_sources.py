"""alt_sources.py — vecteurs de collecte alternatifs (contourne blocage bot, FREE, légal).
4 vecteurs :
  1. Sitemap XML (sites WP/CMS -> liste URLs articles, quasi jamais bloqué)
  2. Google News RSS (Google a déjà crawlé -> zéro blocage bot pour nous)
  3. GDELT Doc API (agrégateur mondial gratuit, query=Guinée)
  4. Wayback CDX (archive.org -> dernier snapshot si site down/bloqué)
Chaque fonction retourne une liste de dicts normalisés {title,url,summary,published_at,raw_content,image}.
Les échecs réseau sont capturés (return []), jamais de crash.
"""
import re
import requests
import feedparser
import trafilatura
from typing import Dict, List

_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; KoraReachBot/1.0)"}
_TIMEOUT = 15


def fetch_sitemap(source) -> List[Dict]:
    """Récupère les articles via sitemap XML (suit l'index si présent).
    Quasi jamais bloqué par Cloudflare (contrairement à la home)."""
    out = []
    try:
        _UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"}
        # 1. trouver les sitemaps (index ou direct)
        urls_to_try = [source.url.rstrip("/") + "/sitemap.xml",
                       source.url.rstrip("/") + "/sitemap_index.xml"]
        sitemap_urls = []
        for path in urls_to_try:
            try:
                r = requests.get(path, headers=_UA, timeout=_TIMEOUT)
                if r.status_code != 200:
                    continue
                if "sitemapindex" in r.text:
                    # index -> extraire les <loc> des sous-sitemaps
                    for sub in re.findall(r"<loc>(.*?)</loc>", r.text):
                        if "sitemap" in sub:
                            sitemap_urls.append(sub)
                elif "urlset" in r.text:
                    sitemap_urls.append(path)
                if sitemap_urls:
                    break
            except Exception:
                continue
        if not sitemap_urls:
            return out
        # 2. parser chaque sitemap (urlset) -> URLs articles
        art_urls = []
        for sm in sitemap_urls[:5]:
            try:
                r = requests.get(sm, headers=_UA, timeout=_TIMEOUT)
                urls = re.findall(r"<loc>(.*?)</loc>", r.text)
                for u in urls:
                    if u.count("/") >= 4 and not any(x in u for x in ("/category/", "/tag/", "/author/", "/page/")):
                        art_urls.append(u)
            except Exception:
                continue
        art_urls = art_urls[:15]
        for u in art_urls:
            try:
                rr = requests.get(u, headers=_UA, timeout=_TIMEOUT)
                text = trafilatura.extract(rr.text)
                meta = trafilatura.extract_metadata(rr.text)
                if text and len(text) > 200:
                    out.append({
                        "title": meta.title if meta else u.split("/")[-1],
                        "url": u,
                        "summary": text[:400],
                        "published_at": getattr(meta, "date", "") or "",
                        "raw_content": text,
                        "image": meta.image if meta else "",
                    })
            except Exception:
                continue
    except Exception as e:
        print(f"[SITEMAP] échec {source.name}: {e}")
    return out


def fetch_google_news(query="Guinée", gl="GN", hl="fr", limit=20) -> List[Dict]:
    """Google News RSS search -> articles mondiaux sur la Guinée (zéro blocage bot)."""
    out = []
    try:
        url = f"https://news.google.com/rss/search?q={requests.utils.quote(query)}&hl={hl}&gl={gl}&ceid={gl}:{hl}"
        d = feedparser.parse(url)
        for e in d.entries[:limit]:
            out.append({
                "title": e.get("title", ""),
                "url": e.get("link", ""),
                "summary": e.get("summary", ""),
                "published_at": e.get("published", ""),
                "raw_content": e.get("summary", ""),
                "image": "",
            })
    except Exception as e:
        print(f"[GOOGLE_NEWS] échec: {e}")
    return out


def fetch_gdelt(query="Guinée", maxrecords=20) -> List[Dict]:
    """GDELT Doc API -> tous médias mondiaux parlant de la Guinée (FREE, ouvert)."""
    out = []
    try:
        url = (f"https://api.gdeltproject.com/api/v2/doc/doc?query={requests.utils.quote(query)}"
               f"&mode=ArtList&maxrecords={maxrecords}&format=json")
        r = requests.get(url, headers=_HEADERS, timeout=_TIMEOUT)
        if r.status_code == 200:
            for a in r.json().get("articles", []):
                out.append({
                    "title": a.get("title", ""),
                    "url": a.get("url", ""),
                    "summary": a.get("seendate", ""),
                    "published_at": a.get("seendate", ""),
                    "raw_content": a.get("title", ""),
                    "image": "",
                })
    except Exception as e:
        print(f"[GDELT] échec (réseau?): {e}")
    return out


def fetch_wayback(domain_pattern, limit=15) -> List[Dict]:
    """Wayback CDX -> derniers snapshots d'un site (repli si site down/bloqué)."""
    out = []
    try:
        url = (f"https://web.archive.org/cdx/search/cdx?url={domain_pattern}"
               f"&output=json&limit={limit}&filter=statuscode:200&collapse=urlkey")
        r = requests.get(url, headers=_HEADERS, timeout=_TIMEOUT)
        if r.status_code == 200:
            rows = r.json()
            for row in rows[1:]:  # skip header
                orig = row[2] if len(row) > 2 else ""
                if orig:
                    out.append({
                        "title": orig,
                        "url": orig,
                        "summary": f"Archive Wayback: {orig}",
                        "published_at": row[1] if len(row) > 1 else "",
                        "raw_content": f"Archive Wayback: {orig}",
                        "image": "",
                    })
    except Exception as e:
        print(f"[WAYBACK] échec (réseau?): {e}")
    return out


def alt_fetch(source, primary: str = None) -> List[Dict]:
    """Dispatcher selon le type de source alt.
    primary = vector_primary ou vector_secondary (fallback)."""
    v = primary or getattr(source, "vector_primary", None) or getattr(source, "fmt", "")
    if v == "sitemap":
        return fetch_sitemap(source)
    if v == "gnews":
        return fetch_google_news("Guinée")  # query fixe, URL déjà encodée sinon
    if v == "gdelt":
        return fetch_gdelt(source.url)
    if v == "wayback":
        return fetch_wayback(source.url)
    return []
