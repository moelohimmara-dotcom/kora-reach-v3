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


GEO_KEYWORDS = (
    "guinée", "guinea", "conakry", "labé", "labe", "n'zérékoré", "nzerekore",
    "kankan", "kindia", "boké", "boke", "mamou", "fria", "yomou", "kouroussa",
    "faranah", "kissidougou", "dabola", "dinguiraye", "gueckedou", "guéckédou",
    "macenta", "beyla", "lola", "siguiri", "dalaba", "pita", "télimélé", "telimele",
    "coyah", "forecariah", "dubréka", "dubreka", "kaloum", "matam", "matoto", "ratoma",
)
# Sujets génériques d'actualité (2026-08-21, renfort mots-clés) : regroupés par
# thème éditorial, chaque thème listant PLUSIEURS variantes/synonymes -- la
# version précédente ne matchait qu'un mot isolé par thème (ex: "minière" seul
# ratait "mine", "or", "bauxite"...), ce qui faisait tomber trop souvent sur
# Picsum (dernier recours sans rapport) faute de match sur le titre seul.
# Le TAG associé à chaque thème est le mot envoyé à LoremFlickr -- gardé en
# français (comportement existant, déjà en prod) mais choisi comme le terme
# le plus généraliste du groupe pour maximiser les résultats Flickr.
SUBJECT_THEMES = {
    "accident": ("accident", "collision", "renversement", "noyade", "incendie", "explosion"),
    "inondation": ("inondation", "crue", "pluie", "pluies", "intempérie", "intemperie"),
    "élection": ("élection", "election", "scrutin", "urnes", "vote", "referendum", "référendum"),
    # "marche" (sans accent) volontairement absent : trop ambigu (se confond
    # avec "marché" -- économie -- une fois l'accent omis dans une source).
    "manifestation": ("manifestation", "grève", "greve", "sit-in", "protestation", "cortège", "cortege"),
    "santé": ("santé", "sante", "hôpital", "hopital", "épidémie", "epidemie", "vaccin", "maladie", "clinique"),
    "économie": ("économie", "economie", "marché", "marche", "commerce", "inflation", "prix", "monnaie", "franc guinéen"),
    "minière": ("minière", "miniere", "mine", "bauxite", "or", "diamant", "fer", "simfer", "cbg"),
    "football": ("football", "sport", "match", "syli", "championnat", "coupe"),
    "politique": ("politique", "gouvernement", "ministre", "président", "president", "cndd", "junte", "assemblée", "assemblee"),
    "justice": ("justice", "tribunal", "procès", "proces", "juge", "condamnation", "arrestation"),
    "sécurité": ("sécurité", "securite", "police", "gendarmerie", "armée", "armee", "attaque", "braquage"),
    "éducation": ("éducation", "education", "école", "ecole", "université", "universite", "examen", "bac", "élève", "eleve"),
    "environnement": ("environnement", "climat", "déforestation", "deforestation", "pollution", "sécheresse", "secheresse"),
    "transport": ("transport", "route", "circulation", "taxi", "aéroport", "aeroport", "port", "carburant", "essence"),
    "agriculture": ("agriculture", "agricole", "récolte", "recolte", "riz", "élevage", "elevage", "paysan"),
}


def _word_in(needle: str, haystack: str) -> bool:
    """Match sur FRONTIÈRE DE MOT (pas une simple sous-chaîne) : "or" ne doit
    pas matcher dans "record", "mine" ne doit pas matcher dans "détermine"
    (bug rencontré lors du renfort du 2026-08-21 -- des mots-clés courts
    collisionnaient avec des mots sans rapport). "\\b" fonctionne correctement
    sur l'accentué en unicode (re par défaut) ; l'espace final gère les
    expressions à tiret ("sit-in") en les laissant matcher tel quel."""
    import re
    return re.search(r"\b" + re.escape(needle) + r"\b", haystack) is not None


def _extract_keywords(text: str) -> list:
    """Extrait jusqu'à 4 mots-clés pertinents pour une recherche photo Flickr :
    1-2 géographiques + 1-2 thématiques, ordonnés par pertinence géo d'abord.
    `text` (2026-08-21, renfort) : peut désormais être bien plus que le seul
    titre -- typiquement titre + résumé + extrait du contenu brut de la
    source (voir _build_search_text()) -- pour repérer un thème même quand
    le titre seul est trop vague ("Nouvelle annonce du gouvernement", sans
    plus de détail, mais le corps parle clairement d'économie)."""
    t = (text or "").lower()
    geo = [kw for kw in GEO_KEYWORDS if _word_in(kw, t)][:2]
    subj = []
    for theme, variants in SUBJECT_THEMES.items():
        if any(_word_in(v, t) for v in variants):
            subj.append(theme)
        if len(subj) >= 2:
            break
    kws = geo + subj
    if not kws:
        kws = ["guinea", "conakry"]  # défaut pertinent
    return kws[:4]


def _build_search_text(champion: dict, contexts: list, title: str = "") -> str:
    """Assemble un texte de recherche plus riche que le seul titre : titre +
    résumé + extrait du contenu brut de la meilleure source disponible
    (champion, puis à défaut le premier contexte) -- augmente les chances de
    repérer le vrai thème de l'article (voir _extract_keywords())."""
    champ = champion or {}
    parts = [title or champ.get("title", ""), champ.get("summary", ""), champ.get("raw_content", "")[:400]]
    if not champ.get("raw_content") and contexts:
        first_ctx = (contexts or [{}])[0] or {}
        parts.append(first_ctx.get("summary", ""))
        parts.append(first_ctx.get("raw_content", "")[:400])
    return " ".join(p for p in parts if p)


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
    # autre article de ce cycle) -> repli sur une vraie photo générique, avec
    # un texte de recherche enrichi (titre + résumé + extrait du contenu
    # source, pas le titre seul -- 2026-08-21, renfort mots-clés) pour mieux
    # cerner le thème réel de l'article.
    search_text = _build_search_text(champion, contexts, title)
    lf_err = ""
    try:
        url, provider = _call_loremflickr(search_text, salt=fact_id)
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
            search_text = _build_search_text(champ, contexts, title)
            for attempt in range(1, 8):
                seed = (i * 1009 + attempt * 137) % 90000
                try:
                    url, provider = _call_loremflickr(search_text, lock_override=seed)
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
