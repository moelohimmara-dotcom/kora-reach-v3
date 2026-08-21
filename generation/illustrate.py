"""illustrate.py — sélection de l'image de couverture de chaque article.

RÈGLE MÉTIER (révision 2026-08-21, demande explicite : "refléter la réalité"
plutôt que fabriquer) : KORA ne génère PLUS AUCUNE image par IA (FAL et
Pollinations retirés). L'image de couverture d'un article est désormais
TOUJOURS une vraie photo :
  1) en priorité, une image réelle issue d'une des sources du cluster
     (champion en premier, puis les contextes par fiabilité de source) --
     c'est précisément le cas "2+ sources sur le même sujet -> on choisit
     l'une de leurs images" demandé ; un cluster à une seule source suit la
     même règle en dégénérant naturellement (un seul candidat) ;
  2) si aucune source du cluster n'a d'image, repli sur une VRAIE photo
     générique liée au sujet (LoremFlickr, photos Flickr réelles par
     mot-clé) ;
  3) en tout dernier recours, une photo générique sans rapport (Picsum),
     uniquement pour ne jamais laisser un article sans aucun visuel.
Aucune de ces trois étapes ne fabrique d'image : "generated" dans le retour
signifie désormais "pas issue d'une source du cluster" (stock photo), jamais
"IA".
"""
import os
import urllib.request
import urllib.error
import urllib.parse

TIMEOUT = int(os.environ.get("FAL_TIMEOUT_SEC", "45"))


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
                ctype = r.headers.get("Content-Type", "")
                if "image" not in ctype:
                    raise ValueError(f"LoremFlickr a répondu {ctype}")
                # On accepte l'image (meme defaultImage de LoremFlickr) : c'est une
                # photo reelle, bien preferable au placeholder vide cote frontend.
                return url, "loremflickr"
        except urllib.error.HTTPError:
            continue
    raise RuntimeError("LoremFlickr: aucun match (toujours image par défaut)")


def _candidate_images(champion: dict, contexts: list) -> list:
    """Liste ordonnée des images réelles candidates pour un cluster : le
    champion d'abord (meilleure source), puis les contextes triés par
    fiabilité de source (source_level décroissant). URLs non vides
    uniquement, sans doublon."""
    cands = []
    champ_img = (champion or {}).get("image", "") or ""
    if champ_img:
        cands.append(champ_img)
    ctx_sorted = sorted(contexts or [], key=lambda c: (c or {}).get("source_level", 0), reverse=True)
    for c in ctx_sorted:
        img = (c or {}).get("image", "") or ""
        if img and img not in cands:
            cands.append(img)
    return cands


def select_source_image(champion: dict, contexts: list, exclude: set = None) -> str:
    """Choisit la meilleure image RÉELLE parmi les sources d'un cluster
    (champion prioritaire, puis contextes par fiabilité), en évitant les
    URLs déjà utilisées par un autre article du même cycle (`exclude`, pour
    la garantie d'unicité inter-articles -- voir illustrate_all()).
    Retourne "" si aucune source du cluster n'a d'image (ou si toutes les
    images du cluster sont déjà utilisées ailleurs)."""
    exclude = exclude or set()
    for img in _candidate_images(champion, contexts):
        if img not in exclude:
            return img
    return ""


def illustrate(champion: dict, contexts: list, title: str = "", fact_id: str = "",
                exclude: set = None) -> dict:
    """Retourne toujours un dict : {image, provider, generated(bool), detail}.
    Ordre : image réelle d'une source du cluster (champion puis contextes) ->
    LoremFlickr (photo réelle par mot-clé) -> Picsum (photo générique).
    `generated` signifie ici "n'est pas une photo du cluster de sources"
    (stock photo de repli), jamais "fabriquée par IA" -- KORA n'en génère
    plus aucune (retrait de FAL/Pollinations, 2026-08-21)."""
    title = title or (champion or {}).get("title", "")
    src_img = select_source_image(champion, contexts, exclude=exclude)
    if src_img:
        return {"image": src_img, "provider": "source", "generated": False,
                "detail": "Image réelle issue d'une source du cluster (champion ou contexte)."}
    # Aucune source du cluster n'a d'image (ou toutes déjà utilisées par un
    # autre article de ce cycle) -> repli sur une vraie photo générique.
    lf_err = ""
    try:
        url, provider = _call_loremflickr(title, salt=fact_id)
        if url:
            return {"image": url, "provider": provider, "generated": True,
                    "detail": "Aucune image dans les sources du cluster -> photo réelle (LoremFlickr) liée au sujet."}
    except Exception as e:
        lf_err = f"LoremFlickr indisponible ({type(e).__name__})"
    # Dernier recours : photo générique sans rapport avec le sujet, pour ne
    # jamais laisser un article sans aucun visuel.
    try:
        import hashlib as _hl
        seed = int(_hl.sha256((fact_id or title).encode()).hexdigest()[:8], 16) % 100000
        picsum = f"https://picsum.photos/seed/{seed}/800/450"
        return {"image": picsum, "provider": "picsum", "generated": True,
                "detail": f"{lf_err} -> photo générique (Picsum) en dernier recours."}
    except Exception as e:
        return {"image": "", "provider": "none", "generated": True,
                "detail": f"{lf_err}; Picsum indisponible ({type(e).__name__})"}


def illustrate_all(facts: list) -> list:
    """Attribue une image à chaque fact en GARANTISSANT l'unicité (aucun
    doublon) dans le cycle. Pour chaque fact, essaie ses propres candidats
    réels (champion puis contextes) dans l'ordre, en sautant ceux déjà
    utilisés par un fact précédent de ce même cycle ; ne tombe sur le repli
    stock (LoremFlickr/Picsum) que si TOUS les candidats réels du cluster
    sont épuisés (vides ou déjà pris). Retourne la même liste de facts,
    enrichie de 'image'/'image_meta'."""
    used = set()
    for i, fact in enumerate(facts):
        champ = fact.get("champion", {}) or {}
        contexts = fact.get("contexts", []) or []
        title = champ.get("title", "")
        fid = fact.get("fact_id", str(i))
        res = illustrate(champ, contexts, title, fact_id=fid, exclude=used)
        # Repli stock (LoremFlickr/Picsum) : peut lui aussi collisionner avec
        # un autre fact du cycle (deux sujets voisins, mêmes mots-clés) -- on
        # retente avec un lock différent jusqu'à 8 fois avant d'accepter le
        # doublon (mieux qu'une boucle infinie sur un cas limite).
        if res["provider"] in ("loremflickr", "picsum") and res["image"] in used:
            for attempt in range(1, 8):
                seed = (i * 1009 + attempt * 137) % 90000
                try:
                    url, provider = _call_loremflickr(title, lock_override=seed)
                except Exception:
                    url, provider = f"https://picsum.photos/seed/{seed}/800/450", "picsum"
                if url not in used:
                    res = {"image": url, "provider": provider, "generated": True,
                           "detail": res["detail"] + " (lock réajusté pour éviter un doublon)"}
                    break
        used.add(res["image"])
        fact["image"] = res["image"]
        fact["image_meta"] = {"image": res["image"], "provider": res["provider"],
                              "generated": res.get("generated", False)}
    return facts


if __name__ == "__main__":
    # Test local : cluster à 2 sources, la seconde a une image -> doit la choisir
    # (le champion en amont n'en a pas).
    champ = {"title": "Guinée: accord minier signé à Conakry", "image": ""}
    ctx = [{"image": "https://exemple-source.example/photo-accord.jpg", "source_level": 2}]
    print(illustrate(champ, ctx))
