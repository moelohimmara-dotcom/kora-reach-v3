"""fetchers.py — collecte RSS (feedparser) + HTML (trafilatura)."""
import feedparser
import trafilatura
import requests
import re
import time
import core.config as config
from collection.guardrails import check as guardrails_check, rate_limit
from typing import List, Dict, Optional

_HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}


def get_with_retry(url: str, headers: dict = None, timeout: float = None, retries: int = None):
    """GET avec retry/backoff sur pannes RESEAU TRANSITOIRES (timeout, connexion
    refusee/DNS, erreur 5xx cote serveur). Ne retente JAMAIS sur un 4xx (403
    anti-bot, 404...) : ce genre de reponse ne se resout pas en reessayant, ca
    ne ferait que ralentir le cycle pour rien (2026-08-19, diagnostic P1 §5 —
    avant ce correctif, un simple timeout reseau perdait la source ENTIERE pour
    tout le cycle, sans nouvelle tentative)."""
    headers = headers or _HEADERS
    timeout = timeout if timeout is not None else config.LIMITS["timeout_sec"]
    retries = config.LIMITS["retry"] if retries is None else retries
    last_exc = None
    for attempt in range(retries + 1):
        try:
            r = requests.get(url, headers=headers, timeout=timeout)
            if r.status_code >= 500 and attempt < retries:
                time.sleep(0.5 * (attempt + 1))
                continue
            return r
        except (requests.ConnectionError, requests.Timeout) as e:
            last_exc = e
            if attempt < retries:
                time.sleep(0.5 * (attempt + 1))
                continue
    raise last_exc


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

def _fetch_full_article_and_image(url: str) -> tuple:
    """Recupere le texte COMPLET d'un article ET son image reelle (meta
    og:image extraite par trafilatura, meme mecanisme que fetch_html() plus
    bas -- 2026-08-26, demande explicite : "toujours utiliser les images
    provenant des divers sources". Avant ce correctif, fetch_rss() ne
    regardait QUE le flux RSS lui-meme (media_content/enclosures) pour
    l'image et abandonnait des qu'il allait chercher le texte complet de la
    page -- alors que cette meme page est deja telechargee et deja passee a
    trafilatura pour le texte : son metadata.image etait simplement ignoree,
    forcant un repli inutile sur le stock (LoremFlickr/Picsum, voir
    generation/illustrate.py) alors qu'une vraie image de source existait.
    Retourne ('', '') si echec — l'appelant retombe alors sur le resume RSS
    et/ou l'image deja extraite du flux (jamais de crash, jamais d'item perdu)."""
    if not url:
        return "", ""
    try:
        rate_limit(url)
        r = get_with_retry(url)
        r.raise_for_status()
        text = trafilatura.extract(r.text, include_comments=False, include_tables=False)
        meta = trafilatura.extract_metadata(r.text)
        img = (meta.image if meta else "") or ""
        return text or "", img
    except Exception:
        return "", ""


def _fetch_full_article(url: str) -> str:
    """Recupere le texte COMPLET d'un article (pas le resume RSS tronque a
    quelques phrases). Retourne '' si echec — l'appelant retombe alors sur le
    resume RSS (jamais de crash, jamais d'item perdu). Compat : delegue a
    _fetch_full_article_and_image() ci-dessus, ne garde que le texte (les
    appelants historiques de cette fonction n'ont pas besoin de l'image)."""
    text, _img = _fetch_full_article_and_image(url)
    return text

def fetch_rss(source) -> List[Dict]:
    """Retourne liste d'items {title, url, summary, published_at, raw_content, image}.
    raw_content = texte COMPLET de l'article (scrape trafilatura), pas le simple
    resume RSS (souvent tronque a 1-2 phrases) : la generation d'articles doit se
    baser sur l'info reelle et complete, pas un extrait partiel (regle metier
    2026-08-19, notamment pour l'actualite nationale/GN_NAT)."""
    out = []
    # Bug corrigé (2026-08-25, audit fiabilité collecte) : rate_limit +
    # get_with_retry + raise_for_status vivaient AVANT dans le même try/except
    # que tout le reste (parsing/boucle d'items), qui avale toute exception et
    # se contente d'un print() -- un échec HTTP réel (403/404/5xx persistant)
    # ne remontait donc jamais comme tel à l'appelant (orchestration/
    # reach_agent.py::_collect(), qui n'appelle record_fetch_result(ok=False,...)
    # QUE sur une exception qui s'échappe jusqu'à lui) : le flux retombait
    # toujours sur un retour vide "silencieux", indiscernable d'une source
    # légitimement sans nouveauté. Sorti du try : une vraie erreur de
    # connexion/statut se propage désormais normalement (voir _collect(),
    # qui tente quand même le repli sitemap avant de considérer l'échec
    # définitif).
    rate_limit(source.url)
    resp = get_with_retry(source.url)
    resp.raise_for_status()
    try:
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
                full, page_img = _fetch_full_article_and_image(link)
                if len(full) >= _RSS_FULLTEXT_MIN_LEN:
                    raw_content = full
                # Le flux RSS lui-meme n'a fourni aucune image
                # (media_content/enclosures absents) -> on recupere celle de
                # la page reelle deja telechargee ci-dessus, plutot que de
                # laisser illustrate.py basculer sur du stock generique pour
                # rien (voir docstring _fetch_full_article_and_image).
                if not img and page_img:
                    img = page_img
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
    # Bug corrigé (2026-08-25, audit fiabilité collecte -- même correctif que
    # fetch_rss() ci-dessus) : cette fonction parsait le corps de la réponse
    # SANS vérifier le code HTTP, et l'ancien placement à l'intérieur du
    # try/except plus bas (qui avale toute exception avec un simple print())
    # empêchait de toute façon une éventuelle erreur de remonter. Un blocage
    # anti-bot (403) ou une page de maintenance renvoie souvent un corps HTML
    # minimal, quasi sans lien réel, ce qui produisait silencieusement 0
    # article ET un statut "ok" (le design "0 item = pas forcément une
    # erreur" reste volontaire pour une source qui n'a légitimement rien de
    # neuf -- mais un 403/404 n'a rien à voir avec une absence de nouveauté :
    # c'est un vrai échec de collecte, confirmé en conditions réelles sur
    # africaguinee.com, bloqué en 403 tout en apparaissant "ok" sur la page
    # Sources). Sorti du try, comme rate_limit/get_with_retry : une erreur
    # ici se propage désormais normalement jusqu'à _collect() (reach_agent.py).
    rate_limit(source.url)
    resp = get_with_retry(source.url)
    resp.raise_for_status()
    try:
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
                r2 = get_with_retry(link)
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
        from collection.alt_sources import fetch_google_news
        # Collecte Google News (query fixe = Guinée) : le filtre strict
        # guinee_filter s'applique APRES dans reach_agent (comme pour les autres
        # vecteurs). On ne laisse PAS passer d'articles mondiaux non liés.
        return fetch_google_news("Guinée")
    if fmt == "sitemap":
        from collection.alt_sources import fetch_sitemap
        return fetch_sitemap(source)
    if fmt == "gdelt":
        from collection.alt_sources import fetch_gdelt
        return fetch_gdelt(source.url)
    if fmt == "wayback":
        from collection.alt_sources import fetch_wayback
        return fetch_wayback(source.url)
    return fetch_html(source)
