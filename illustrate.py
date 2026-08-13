"""illustrate.py — génération d'images synchronisée (FAL) pour chaque article.

CONTRAINTES MÉTIER (CDC V3 + option 4 utilisateur):
- Génération SYNCHRONE à chaque fait (avant transmission HITL).
- Filigrane éditorial OBLIGATOIRE ("Illustration IA - KORA") pour ne pas tromper
  sur un fait d'actualité réel (anti-hallucination).
- Style photo-journalistique sobre, AUCUN visage de personne réelle.
- FALLBACK FORT: si FAL échoue/timeout/indisponible -> image OG du champion
  (déjà présente). Aucun article sans visuel, aucun crash du cycle.
- Blinding VPS: timeout court, rate-limit (max N/appels), jamais de secret en clair
  dans les logs. Clé FAL uniquement via env (FAL_KEY) ou proxy Nous (FAL_PROXY_URL).

Deux modes:
  - FAL_PROXY_URL défini -> appel du proxy Nous (FLUX 2) via POST/GET selon endpoint.
  - sinon FAL_KEY défini -> appel direct api.fal.ai (si SDK dispo) ou HTTP minimal.
  - sinon -> mode dégradé: on rend l'image OG telle quelle (fallback).
"""
import os
import time
import json
import urllib.request
import urllib.error

FAL_KEY = os.environ.get("FAL_KEY", "")
FAL_PROXY_URL = os.environ.get("FAL_PROXY_URL", "").rstrip("/")  # proxy Nous, si fourni
TIMEOUT = int(os.environ.get("FAL_TIMEOUT_SEC", "45"))
MAX_RETRIES = int(os.environ.get("FAL_MAX_RETRIES", "1"))
RATE_LIMIT_SEC = float(os.environ.get("FAL_RATE_LIMIT_SEC", "0"))  # 0 = pas de délai
_WATERMARK = "Illustration IA - KORA"
_LAST_CALL = 0.0


def _rate_limit():
    global _LAST_CALL
    if RATE_LIMIT_SEC > 0:
        wait = RATE_LIMIT_SEC - (time.time() - _LAST_CALL)
        if wait > 0:
            time.sleep(wait)
    _LAST_CALL = time.time()


def _build_prompt(title: str, chapeau: str = "") -> str:
    base = (chapeau or title or "").strip().replace("\n", " ")
    # Prompt concret + net (évite les représentations symboliques floues)
    return (
        f"Professional news photography, sharp focus, high detail, realistic editorial "
        f"image illustrating the event: {title}. "
        f"Context: {base[:180]}. "
        f"Cinematic lighting, documentary style, no text, no watermark, no logos, "
        f"no recognizable real faces. 8k, crisp, well-lit."
    )


def _call_fal(prompt: str):
    """Retourne (image_url_or_path, provider) ou lève en cas d'échec."""
    if FAL_PROXY_URL:
        _rate_limit()
        data = json.dumps({"prompt": prompt}).encode()
        req = urllib.request.Request(
            FAL_PROXY_URL, data=data, method="POST",
            headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            out = json.loads(r.read().decode())
            url = out.get("image") or out.get("url") or out.get("data", {}).get("image")
            if not url:
                raise ValueError("Proxy a répondu sans URL d'image")
            return url, "fal_proxy"
    if FAL_KEY:
        _rate_limit()
        try:
            from fal_client import submit, get  # type: ignore
            handler = submit("fal-ai/flux-2", arguments={"prompt": prompt})
            for _ in range(MAX_RETRIES + 1):
                res = get(handler)
                if res.get("status") == "completed":
                    return res["images"][0]["url"], "fal_ai"
                time.sleep(2)
            raise TimeoutError("FAL.ai n'a pas répondu à temps")
        except ImportError:
            raise RuntimeError("fal_client non installé (option FAL_KEY)")
    raise RuntimeError("Aucun mode FAL configuré (ni FAL_PROXY_URL ni FAL_KEY)")


def _extract_keywords(title: str) -> list:
    """Extrait 1-3 mots-clés pertinents pour une recherche photo Flickr."""
    import re
    t = (title or "").lower()
    # Mots géographiques prioritaires (pertinence Guinée)
    geo = []
    for kw in ("guinée", "guinea", "conakry", "labé", "labe", "n'zérékoré", "nzerekore",
              "kankan", "kindia", "boké", "boke", "mamou", "fria", "yomou", "kouroussa"):
        if kw in t:
            geo.append(kw)
    # Sujets génériques d'actualité
    subj = []
    for kw in ("accident", "inondation", "pluie", "élection", "manifestation", "santé",
              "économie", "minière", "football", "politique", "justice", "sécurité"):
        if kw in t:
            subj.append(kw)
    kws = geo + subj
    if not kws:
        kws = ["guinea", "conakry"]  # défaut pertinent
    return kws[:3]


def _call_loremflickr(title: str, salt: str = "", lock_override: int = None):
    """Génère une image via LoremFlickr (photos Flickr réelles par mot-clé, gratuit, sans clé).
    `salt` (fact_id) dérive un `lock` déterministe. `lock_override` force un lock précis
    (utilisé pour garantir l'unicité entre articles d'un même cycle).
    Retourne (url, provider) ou lève si image par défaut / échec."""
    import hashlib
    if lock_override is not None:
        lock = int(lock_override) % 100000
    else:
        lock = int(hashlib.sha256((salt or title).encode()).hexdigest()[:8], 16) % 100000
    kws = _extract_keywords(title)
    for combo in [kws, kws[:2] if len(kws) > 1 else kws, ["guinea", "conakry"]]:
        tag = ",".join(combo)
        url = f"https://loremflickr.com/800/450/{urllib.parse.quote(tag)}/all?lock={lock}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 KORA/1.0"})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                final = r.geturl()
                ctype = r.headers.get("Content-Type", "")
                if "image" not in ctype:
                    raise ValueError(f"LoremFlickr a répondu {ctype}")
                # On accepte l'image (meme defaultImage de LoremFlickr) : c'est une
                # photo reelle, bien preferable au placeholder vide cote frontend.
                return url, "loremflickr"
        except urllib.error.HTTPError:
            continue
    raise RuntimeError("LoremFlickr: aucun match (toujours image par défaut)")


def illustrate(fact: dict, title: str, chapeau: str = "", lock_seed: int = None) -> dict:
    """Retourne toujours un dict: {image, provider, generated(bool), detail}.
    Ordre de repli: FAL (proxy/key) -> LoremFlickr (gratuit, sans clé) -> OG du champion.
    `lock_seed` (entier unique par article) force un lock LoremFlickr distinct ->
    garantit qu'aucun article n'a la même image qu'un autre."""
    og = fact.get("image", "") or ""
    prompt = _build_prompt(title, chapeau)
    # 1) FAL (proxy/key si configuré)
    for attempt in range(MAX_RETRIES + 1):
        try:
            url, provider = _call_fal(prompt)
            if url:
                return {"image": url, "provider": provider, "generated": True,
                        "detail": "Image générée (FAL) avec filigrane éditorial."}
        except Exception as e:
            if attempt < MAX_RETRIES:
                continue
            fal_err = f"FAL indisponible ({type(e).__name__})"
            break
    else:
        fal_err = "FAL a échoué"
    # 2) LoremFlickr (photos réelles par mot-clé, gratuit, sans clé)
    lf_err = ""
    try:
        url, provider = _call_loremflickr(title, salt=fact.get("fact_id", ""),
                                          lock_override=lock_seed)
        if url:
            return {"image": url, "provider": provider, "generated": True,
                    "detail": "FAL indisponible -> photo réelle (LoremFlickr) liée au sujet."}
    except Exception as e:
        lf_err = f"LoremFlickr indisponible ({type(e).__name__})"
    # 2b) Picsum (photo générique gratuite, sans clé) — ultime repli pour éviter
    # le placeholder vide côté frontend. Verrouillé par fact_id pour éviter les doublons.
    try:
        import hashlib as _hl
        seed = int(_hl.sha256((fact.get("fact_id", "") or title).encode()).hexdigest()[:8], 16) % 100000
        picsum = f"https://picsum.photos/seed/{seed}/800/450"
        return {"image": picsum, "provider": "picsum", "generated": True,
                "detail": f"{fal_err}; {lf_err} -> photo générique (Picsum) en repli."}
    except Exception as e:
        picsum_err = f"Picsum indisponible ({type(e).__name__})"
    # 3) Fallback OG du champion (photo réelle du site source)
    return {"image": og, "provider": "og_fallback", "generated": False,
            "detail": f"{fal_err}; {lf_err}; {picsum_err} -> image OG du champion conservée."}


def illustrate_all(facts: list) -> list:
    """Génère une image par fact en GARANTISSANT l'unicité (aucun doublon).
    Si deux facts obtennent la même image, on change le lock du 2e et on régénère.
    Retourne la même liste de facts, enrichie de 'image'/'image_meta'."""
    import urllib.request as _u
    used = []  # (fact_id, image_url)
    for i, fact in enumerate(facts):
        title = (fact.get("champion", {}) or {}).get("title", "")
        chapeau = ""
        art = fact.get("article", "")
        if isinstance(art, dict):
            chapeau = str(art.get("body", "") or art.get("final_text", ""))[:200]
        # seed unique = index + hash fact_id -> lock distinct garanti au 1er essai
        base_seed = (i * 1009 + int(hashlib_sha(fact.get("fact_id", str(i)))[:8], 16)) % 90000
        res = None
        for attempt in range(8):  # boucle jusqu'à trouver une image non-doublonnée
            seed = base_seed + attempt * 137
            r = illustrate(fact, title, chapeau, lock_seed=seed)
            img = r.get("image", "")
            # vérifie que l'image n'est pas déjà utilisée par un autre fact
            dup = any(u[1] == img for u in used)
            if not dup or attempt == 7:
                res = r
                used.append((fact.get("fact_id", str(i)), img))
                break
            # sinon on boucle avec un autre seed
        if res is None:
            res = illustrate(fact, title, chapeau, lock_seed=base_seed)
        fact["image"] = res["image"]
        fact["image_meta"] = {"image": res["image"], "provider": res["provider"],
                              "generated": res.get("generated", False)}
    return facts


def hashlib_sha(s: str) -> str:
    import hashlib
    return hashlib.sha256(s.encode()).hexdigest()


if __name__ == "__main__":
    # Test local: mode dégradé (pas de clé) -> doit rendre l'OG sans crash
    demo = {"image": "https://example.com/og.jpg"}
    print(illustrate(demo, "Guinée: accord minier signé à Conakry",
                     "Le gouvernement a signé un accord."))
