"""transmit.py — adapter de transmission isolé (HITL -> backend).

UN SEUL point de sortie réseau. Mode par défaut = dry_run (gratuit, sûr, aucune
credential, aucun appel réseau). Activation WordPress/Supabase via variables env.
Aucune credential dans le code. Absente -> dry_run forcé.
"""
import os
import re
import json
import urllib.request
import urllib.error
import urllib.parse

WP_URL = os.environ.get("WP_URL", "")
WP_USER = os.environ.get("WP_USER", "")
WP_APP_PASS = os.environ.get("WP_APP_PASS", "")
SB_URL = os.environ.get("SUPABASE_URL", "")
SB_KEY = os.environ.get("SUPABASE_KEY", "")

# Classement automatique par catégorie (2026-08-23, demande explicite :
# "ajoute la fonctionnalité de classement automatique par catégorie ...
# selon le cadre de catégorisation dans wordpress kakilambe. Cela évite au
# user de le faire lui-même") -- IDs RÉELS vérifiés contre
# /wp-json/wp/v2/categories de kakilambe.com (2026-08-23). Un sous-ensemble
# volontairement restreint aux catégories THÉMATIQUES (sujet de l'article) :
# la taxonomie complète du site contient aussi des catégories de FORMAT/
# usage (INTERVIEWS, TRIBUNE, OPINION, OFFRES D'EMPLOIS, IMMOBILIER, JT...)
# qui ne conviennent pas à un classement automatique d'article de synthèse
# généré par KORA (jamais une interview, une tribune d'opinion ou une
# annonce). "Art", "Affaires religieuses" et "Nécrologie" (id 986/987/988)
# n'existaient PAS sur le site avant ce correctif -- créées via l'API à la
# demande explicite de l'utilisateur (confirmé : catégories manquantes vs
# liste d'exemple donnée). Les quasi-doublons vides de la taxonomie réelle
# (ex: "Economie" id136 count=1 vs "ÉCONOMIE" id5 count=35, "Sport" id137
# count=0 vs "SPORTS" id8 count=49) sont délibérément IGNORÉS au profit de
# la catégorie réellement utilisée par l'éditeur du site.
WP_CATEGORY_MAP = {
    "Politique": 4, "Économie": 5, "Santé": 51, "Sport": 8, "Culture": 9,
    "Science": 16, "Justice": 17, "Société": 6, "Afrique": 19, "Monde": 20,
    "Actualités": 3, "Art": 986, "Affaires religieuses": 987, "Nécrologie": 988,
}
WP_CATEGORY_DEFAULT = "Non classé"
WP_CATEGORY_DEFAULT_ID = 1


def _strip_leading_title(text: str) -> str:
    """Retire la ligne de titre markdown ('# Titre...') en tête de l'article
    stocké en interne (convention KORA : writer.py écrit TOUJOURS le titre en
    première ligne, voir _mechanical_paragraph_split/prompt système). Le
    frontend le masque déjà à l'affichage (voir app.js/sheet.js, même regex)
    puisque le titre est montré séparément -- mais transmit.py envoyait le
    texte BRUT à WordPress, qui reçoit le titre une 2e fois via son propre
    champ "title" : le premier paragraphe du corps publié était donc une
    copie exacte du titre (bug rapporté 2026-08-22, confirmé sur le 1er
    brouillon réel transmis à kakilambe.com -- "featured_media":0 à part,
    le tout premier <p> dupliquait mot pour mot le titre du post).

    Filet supplémentaire (2026-08-23) : writer.py normalise désormais le
    titre en '# ...' même quand le LLM le rend en gras ('**Titre**') --
    mais au cas où un article généré AVANT ce correctif traînerait encore en
    base avec un titre en gras seul sur sa 1ère ligne, on le retire aussi
    ici, en dernier filet avant l'envoi à WordPress."""
    t = re.sub(r"^#\s.*\n+", "", text or "", count=1)
    if t == (text or ""):
        t = re.sub(r"^\*\*[^\n]+\*\*\n+", "", text or "", count=1)
    return t


# Filet mécanique (2026-08-22, demande explicite : "rien ne doit faire croire
# que ceci est l'oeuvre d'une IA") -- COMPLÉMENTAIRE à l'axe 6 ("LANGUE") de
# l'auto-critique LLM ajouté le même jour dans generation/writer.py, pas un
# remplacement : l'auto-critique peut manquer un cas (elle a raté "beginning"
# dans l'incident qui a motivé ce correctif), un check déterministe ne peut
# PAS être distrait. Liste volontairement COURTE et conservatrice -- mots de
# structure anglais qui n'ont AUCUN usage légitime en français (contrairement
# à des emprunts déjà intégrés comme "email"/"sport"/"look"/"week-end", qui
# ne doivent surtout pas déclencher de faux positif). Ne bloque JAMAIS la
# transmission (un faux positif ne doit pas empêcher un article correct de
# partir) -- signale seulement, voir transmit()/content_warning ci-dessous.
_ENGLISH_TELLS = [
    "the", "beginning", "however", "although", "therefore", "moreover",
    "furthermore", "nevertheless", "meanwhile", "whereas", "overall",
    "in conclusion", "in summary", "as a result", "on the other hand",
]
_ENGLISH_TELL_RE = re.compile(
    r"\b(" + "|".join(re.escape(w) for w in _ENGLISH_TELLS) + r")\b", re.IGNORECASE
)


def _detect_language_artifacts(text: str) -> str | None:
    """Détecte des mots anglais isolés dans un texte censé être 100% en
    français. Retourne une chaîne descriptive (mots trouvés) ou None. Voir
    commentaire de _ENGLISH_TELLS ci-dessus pour le pourquoi de cette liste
    volontairement restreinte."""
    if not text:
        return None
    hits = sorted(set(m.group(0).lower() for m in _ENGLISH_TELL_RE.finditer(text)))
    if not hits:
        return None
    return ", ".join(f'"{h}"' for h in hits)


# Filet mécanique de classement (2026-08-23) -- COMPLÉMENTAIRE au classement
# LLM ci-dessous (_classify_category), pas un remplacement : même philosophie
# que _ENGLISH_TELLS/_detect_language_artifacts -- un LLM peut échouer
# (réseau, disjoncteur ouvert) ou répondre hors-liste, un scan par mots-clés
# déterministe ne peut pas. Chaque entrée = liste de mots/expressions dont la
# présence (frontière de mot) fait gagner 1 point à la catégorie ; la
# catégorie au score le plus haut l'emporte, "Non classé" si aucun match.
_CATEGORY_KEYWORDS = {
    "Politique": ("politique", "gouvernement", "ministre", "président", "assemblée nationale",
                  "cndd", "junte", "élection", "scrutin", "référendum", "parti politique", "doumbouya"),
    "Économie": ("économie", "économique", "marché", "commerce", "inflation", "franc guinéen",
                 "banque", "investissement", "bourse", "entreprise", "budget", "fmi", "cnuced"),
    "Santé": ("santé", "hôpital", "médecin", "épidémie", "vaccin", "maladie", "clinique",
              "chu", "patient", "chirurgie"),
    "Sport": ("football", "syli", "match", "championnat", "coupe", "athlète", "basketball",
              "sportif", "footballeur", "sélection nationale"),
    "Culture": ("culture", "festival", "musique", "cinéma", "artiste", "concert", "danse",
                "patrimoine", "chanteur", "album"),
    "Science": ("science", "scientifique", "technologie", "recherche", "innovation", "numérique",
                "intelligence artificielle", "informatique"),
    "Justice": ("justice", "tribunal", "procès", "juge", "condamnation", "arrestation",
                "magistrat", "csm", "prison", "avocat", "verdict"),
    "Société": ("société", "communauté", "éducation", "école", "université", "famille",
                "droits humains", "ong", "population"),
    "Afrique": ("afrique", "cedeao", "union africaine", "sénégal", "mali", "côte d'ivoire",
                "nigeria", "libéria", "sierra leone"),
    "Monde": ("monde", "international", "onu", "états-unis", "europe", "chine", "russie", "france"),
    "Art": ("peinture", "sculpture", "exposition d'art", "artiste plasticien", "galerie d'art", "beaux-arts"),
    "Affaires religieuses": ("religion", "religieux", "mosquée", "église", "imam", "évêque",
                              "ramadan", "pèlerinage", "hadj", "chrétien", "musulman", "islam"),
    "Nécrologie": ("décès", "décédé", "obsèques", "funérailles", "disparition", "défunt",
                   "nécrologie", "condoléances", "in memoriam"),
}
_CATEGORY_KEYWORD_RE = {
    cat: re.compile(r"\b(" + "|".join(re.escape(w) for w in words) + r")\b", re.IGNORECASE)
    for cat, words in _CATEGORY_KEYWORDS.items()
}


def _classify_category_mechanical(text: str) -> str:
    """Filet mécanique -- voir commentaire ci-dessus. Ne peut jamais échouer
    (aucun appel réseau), sert de repli si le classement LLM échoue."""
    if not text:
        return WP_CATEGORY_DEFAULT
    scores = {cat: len(rx.findall(text)) for cat, rx in _CATEGORY_KEYWORD_RE.items()}
    best_cat, best_score = max(scores.items(), key=lambda kv: kv[1])
    return best_cat if best_score > 0 else WP_CATEGORY_DEFAULT


_CATEGORY_SYSTEM_PROMPT = (
    "Tu es documentaliste pour un média de presse guinéen. On te donne le titre et le début "
    "d'un article. Ta seule tâche : choisir la catégorie éditoriale la plus appropriée, "
    "UNIQUEMENT parmi cette liste exacte (aucune autre catégorie n'existe) :\n"
    + ", ".join(WP_CATEGORY_MAP.keys()) + ", " + WP_CATEGORY_DEFAULT + "\n\n"
    "Réponds par UN SEUL mot ou groupe de mots de cette liste, EXACTEMENT comme il est écrit "
    "ci-dessus, rien d'autre (pas de ponctuation, pas d'explication). Si aucune catégorie ne "
    "convient clairement, réponds '" + WP_CATEGORY_DEFAULT + "'."
)


def _classify_category(title: str, text: str) -> str:
    """Classement automatique par catégorie éditoriale (2026-08-23, demande
    explicite : "ajoute la fonctionnalité de classement automatique par
    catégorie ... selon le cadre de catégorisation dans wordpress kakilambe.
    Cela évite au user de le faire lui-même"). Retourne un NOM de catégorie
    (clé de WP_CATEGORY_MAP, ou WP_CATEGORY_DEFAULT) -- jamais un ID
    directement, la conversion se fait à l'appelant (_to_wordpress).

    Import paresseux de generation.writer (même précaution que
    _derive_source_level ci-dessous : éviter tout couplage/coût au
    chargement de ce module). Repli mécanique systématique si le LLM
    échoue ou répond hors-liste -- ne bloque JAMAIS la transmission."""
    excerpt = (text or "")[:1200]
    try:
        import generation.writer as writer
        out = writer.simple_completion(_CATEGORY_SYSTEM_PROMPT,
                                        f"TITRE : {title}\n\nDÉBUT DE L'ARTICLE :\n{excerpt}",
                                        max_tokens=20)
    except Exception:
        out = None
    if out:
        candidate = out.strip().strip(".\"'")
        # Tolère une casse/espace légèrement différente de la réponse LLM
        # (ex: "politique" au lieu de "Politique") -- comparaison normalisée,
        # mais le nom RETOURNÉ reste toujours celui de la liste canonique.
        norm = {k.lower(): k for k in list(WP_CATEGORY_MAP.keys()) + [WP_CATEGORY_DEFAULT]}
        if candidate.lower() in norm:
            return norm[candidate.lower()]
    # LLM indisponible ou réponse hors-liste -> filet mécanique par mots-clés
    return _classify_category_mechanical(f"{title}\n{excerpt}")


def _build_payload(fact: dict, final_text: str) -> dict:
    """Payload générique (pour dry_run / wordpress)."""
    champ = fact.get("champion", {})
    return {
        "title": champ.get("title", ""),
        "content": _strip_leading_title(final_text or fact.get("article", "")),
        "source_url": champ.get("url", ""),
        "image": fact.get("image", ""),
        "og_image": champ.get("raw_og_image") or champ.get("image", ""),  # fallback OG champion
        "n_sources": fact.get("n_sources", 1),
        "generated_model": fact.get("gen_model", ""),
        # provider de l'image (2026-08-21) : "source" = vraie photo d'une des
        # sources du cluster, "loremflickr"/"picsum" = photo stock de repli --
        # utilise pour la legende WP (jamais "IA" desormais, voir _upload_media).
        "image_provider": (fact.get("image_meta", {}) or {}).get("provider", ""),
        # Nom de la source réelle de l'image (2026-08-23, demande explicite :
        # "il faut que le nom de la source d'où provient l'image figure au
        # niveau de l'article") -- vide pour un repli stock (loremflickr/
        # picsum), qui n'a par définition aucune source à créditer.
        "image_source_name": (fact.get("image_meta", {}) or {}).get("image_source_name", ""),
        # Nom de la source du CHAMPION (2026-08-23) : utilisé pour créditer
        # correctement l'image de secours (og_image ci-dessus, TOUJOURS celle
        # du champion) si jamais l'image primaire échoue et que _upload_media
        # bascule dessus -- voir _to_wordpress.
        "champion_source_name": champ.get("source", ""),
        # Vidéo narrée (2026-08-22, demande explicite : "l'article vidéo doit
        # pouvoir être transféré sur wordpress dans brouillons ou en
        # publication officielle") -- voir _upload_video()/_to_wordpress().
        "video_status": fact.get("video_status"),
        "video_path": fact.get("video_path"),
        "fact_id": fact.get("fact_id", ""),
    }


def _derive_source_level(fact: dict) -> int:
    """Déduit source_level depuis la whitelist (GN_NAT=1, INTL=2).
    Import paresseux pour éviter dépendance circulaire / coût au chargement."""
    try:
        import collection.whitelist as wl
        src = fact.get("champion", {}).get("source", "")
        entry = wl.get_entry_by_source(src)
        if entry and entry.category == "INTL":
            return 2
    except Exception:
        pass
    return 1  # défaut national


def _build_supabase_payload(fact: dict, final_text: str) -> dict:
    """Mappe le fait HITL vers le SCHÉMA RÉEL de la table 'articles' (KORA prod).
    Ne touche JAMAIS aux colonnes wp_* (gérées par le pipeline WP séparé).
    origin = AGENT_SEMI (flux semi-auto + validation HITL humaine)."""
    champ = fact.get("champion", {})
    # Bug corrigé 2026-08-22 (même cause que _build_payload/_strip_leading_title
    # ci-dessus) : `corps` brut commence par "# Titre" -- `corps.split("\n")[0]`
    # ne capturait donc JAMAIS le vrai chapô, seulement la ligne de titre
    # (souvent tronquée par la coupe à 280 caractères en plein milieu du
    # titre). Titre retiré AVANT de dériver le chapô ; on découpe sur \n\n
    # (frontière de paragraphe markdown) plutôt que \n seul, car le chapô
    # réel peut lui-même être réparti sur plusieurs lignes physiques.
    corps = _strip_leading_title(final_text or fact.get("article", ""))
    chapeau = corps.split("\n\n")[0].strip()[:280] if corps else ""
    titre = champ.get("title", "")
    mots = ["Guinée"]
    for w in titre.replace(":", " ").split():
        if len(w) > 4 and w.lower() not in ("guinée", "guinea"):
            mots.append(w)
    return {
        "titre": titre,
        "formule_titre": None,
        "chapeau": chapeau,
        "corps": corps,
        "meta_description": (chapeau or titre)[:160],
        "mots_cles": mots[:8],
        "categorie_id": None,  # table categories non exposée -> laissé NULL (pas d'invention)
        "source_url": champ.get("url", ""),
        "source_nom": champ.get("source", ""),
        "source_level": _derive_source_level(fact),
        "image_url": fact.get("image", "") or "",
        "image_prompt": "",
        "llm_provider_used": None,
        "llm_model_used": fact.get("gen_model", "") or None,
        "status": "PENDING_REVIEW",
        "origin": "AGENT_SEMI",
    }


def _mark_article_published(src_url: str) -> None:
    """Repasse l'article de l'entrepôt à status='published' après un publish
    WordPress réussi. Identifie la ligne par source_url (clé de dédupe de la table
    `articles`, qui n'a pas de fact_id).

    Best-effort : n'interrompt JAMAIS la transmission (toute erreur est avalée).
    Idempotent : ne réécrit pas une ligne déjà 'published'. 'published' est en
    minuscules pour matcher la requête du compteur count_published()."""
    if not src_url:
        return
    try:
        import core.db as db
        con, _ = db.conn()
        try:
            cur = con.cursor()
            cur.execute(
                "UPDATE articles SET status='published' "
                "WHERE source_url=%s AND lower(status) <> 'published'" % db.placeholder(),
                (src_url,))
            con.commit()
        finally:
            con.close()
    except Exception:
        pass


def transmit(fact: dict, final_text: str, provider: str = None, wp_status: str = "publish") -> dict:
    """Transmet l'article. Retourne {status, provider, http_status, detail}.
    - provider explicite: force un seul backend.
    - sinon: si WP ET Supabase configurés -> écrit dans LES DEUX (multicast).
      (Supabase = base d'articles validés KORA ; WP = site public kakilambe.com)
    - sinon: dry_run (aucun réseau).
    - wp_status: "publish" (public) ou "draft" (brouillon WP, invisible).
    """
    m = provider or mode()
    payload = _build_payload(fact, final_text)
    if m == "dry_run":
        # VALIDE le payload, loggue, ne fait AUCUN appel réseau.
        return {"status": "DRY_RUN_OK", "provider": "dry_run",
                "http_status": 200, "detail": "Aucune transmission réelle (mode démo).",
                "payload_preview": {k: (v[:120] + "…" if isinstance(v, str) and len(v) > 120 else v)
                                    for k, v in payload.items()}}
    if m in ("wordpress", "supabase", "postgres"):
        # force un seul backend
        if m == "wordpress":
            return _to_wordpress(payload, wp_status=wp_status)
        if m == "postgres":
            return _to_postgres(fact, final_text)
        return _to_supabase(fact, final_text)
    # mode() == "both"
    results = []
    wp_published = False
    if WP_URL and WP_USER and WP_APP_PASS:
        wp_res = _to_wordpress(payload, wp_status=wp_status)  # passe wp_status (sinon un 'draft' publiait quand même)
        results.append(wp_res)
        wp_published = (wp_res["status"] == "TRANSMITTED" and wp_status == "publish")
    # Entrepôt: Postgres local si activé, sinon Supabase cloud (legacy)
    if (os.environ.get("DATABASE_BACKEND") or "sqlite").lower() == "postgres":
        results.append(_to_postgres(fact, final_text))
    elif SB_URL and SB_KEY:
        results.append(_to_supabase(fact, final_text))
    # Ferme la boucle : l'entrepôt insère l'article en 'PENDING_REVIEW' ; si WordPress
    # l'a RÉELLEMENT publié (status=publish, succès), on le repasse à 'published' pour
    # que le compteur "Publiés" du dashboard reflète la réalité. Sans ça, aucun code
    # ne fait jamais passer articles.status à 'published' -> compteur figé.
    if wp_published:
        _mark_article_published(payload.get("source_url", ""))
    if not results:
        return {"status": "ERROR", "provider": "both", "http_status": 0,
                "detail": "Aucun backend configuré."}
    return _merge_both_results(results)


def _merge_both_results(results: list) -> dict:
    """Agrège les résultats multi-backend ('both').
    Règle : TRANSMITTED uniquement si TOUS les backends ont réussi
    (TRANSMITTED ou SKIPPED_DUPLICATE). Sinon PARTIAL (échec partiel) ou
    FAILED (tous en échec). Évite le faux positif 'TRANSMITTED' si un backend
    a échoué."""
    ok = all(r["status"] in ("TRANSMITTED", "SKIPPED_DUPLICATE") for r in results)
    failures = [r for r in results if r["status"] == "FAILED"]
    status = "TRANSMITTED" if ok else ("PARTIAL" if not failures else "FAILED")
    # image_warning (2026-08-22) : remonté au niveau racine du dict fusionné
    # (pas seulement dans results[]) -- transmissionMessage() côté frontend
    # lit tx.image_warning directement, sans avoir à connaître la forme
    # interne de "both" (WordPress + entrepôt) pour savoir si l'image de
    # couverture a échoué.
    wp_result = next((r for r in results if r.get("provider") == "wordpress"), None)
    return {"status": status, "provider": "both",
            "http_status": results[0]["http_status"],
            "detail": " | ".join(
                f"{r['provider']}:{r['status']}" for r in results),
            "results": results,
            "image_warning": (wp_result or {}).get("image_warning"),
            "video_warning": (wp_result or {}).get("video_warning"),
            "content_warning": (wp_result or {}).get("content_warning"),
            # wp_post_id/wp_url (2026-08-23) : remontés au niveau racine pour
            # que mark_transmitted() (server.py) puisse les persister, quel
            # que soit le mode ("wordpress" seul ou "both") -- voir
            # editorial/hitl_store.py::mark_transmitted.
            "wp_post_id": (wp_result or {}).get("wp_post_id"),
            "wp_url": (wp_result or {}).get("wp_url"),
            "category_name": (wp_result or {}).get("category_name"),
            "category_id": (wp_result or {}).get("category_id")}


def mode() -> str:
    pg = (os.environ.get("DATABASE_BACKEND") or "sqlite").lower() == "postgres"
    if WP_URL and WP_USER and WP_APP_PASS and pg:
        return "both"          # WordPress (public) + Postgres local (entrepôt)
    if WP_URL and WP_USER and WP_APP_PASS and SB_URL and SB_KEY:
        return "both"          # WordPress + Supabase cloud (legacy)
    if WP_URL and WP_USER and WP_APP_PASS:
        return "wordpress"
    if SB_URL and SB_KEY:
        return "supabase"
    if pg:
        return "postgres"
    return "dry_run"


def credentials_status() -> list:
    """État masqué des identifiants de transmission (wireframe 9.6) : jamais
    la valeur réelle, seulement 'configuré' / 'absent'. Sert un écran de
    diagnostic, pas de saisie — la config reste 100% côté .env serveur."""
    pg = (os.environ.get("DATABASE_BACKEND") or "sqlite").lower() == "postgres"
    return [
        {"name": "WP_URL", "label": "URL WordPress", "configured": bool(WP_URL)},
        {"name": "WP_USER", "label": "Utilisateur WordPress", "configured": bool(WP_USER)},
        {"name": "WP_APP_PASS", "label": "Mot de passe applicatif WordPress", "configured": bool(WP_APP_PASS)},
        {"name": "SUPABASE_URL", "label": "URL Supabase", "configured": bool(SB_URL)},
        {"name": "SUPABASE_KEY", "label": "Clé Supabase", "configured": bool(SB_KEY)},
        {"name": "DATABASE_BACKEND", "label": "Entrepôt Postgres local", "configured": pg},
    ]


def _upload_media(image_url: str, fallback_url: str = "", image_provider: str = "",
                   source_name: str = "", fallback_source_name: str = "") -> tuple:
    """Upload l'image vers WP media. Accepte une URL ou un chemin de fichier local.
    Retourne (media_id, error_reason) -- error_reason est None en cas de
    succès, sinon un texte diagnostique (2026-08-22, bug rapporté : "je n'ai
    point vu d'image" -- avant ce correctif la raison de l'échec était
    perdue, l'appelant ne recevait qu'un media_id de 0/−1 sans indice ;
    désormais propagée jusqu'au message affiché à l'éditeur, voir
    _to_wordpress ci-dessous). Strict sur magic bytes (PNG/JPEG/WEBP --
    WEBP ajouté 2026-08-22,
    bug rapporté : "je n'ai point vu d'image" -- l'image RÉELLE de la source
    guinee7.com était un .webp valide (confirmé : téléchargé et vérifié
    manuellement, WordPress accepte le format nativement, HTTP 201 en test
    direct) mais rejetée ici faute de signature reconnue -- silencieusement,
    d'où featured_media=0 sans le moindre indice pour comprendre pourquoi).
    Fallback: si l'image générée est corrompue, tente l'OG du champion."""
    candidates = [image_url, fallback_url] if fallback_url else [image_url]
    reasons = []
    for url in candidates:
        if not url:
            continue
        # Lire les bytes: fichier local si existe, sinon URL
        try:
            if os.path.exists(url):
                with open(url, "rb") as f:
                    data = f.read()
            else:
                req_img = urllib.request.Request(url, headers={"User-Agent": "KORA/1.0"})
                with urllib.request.urlopen(req_img, timeout=40) as r:
                    data = r.read()
        except Exception as e:
            reasons.append(f"{url[:60]}: téléchargement échoué ({e})")
            continue
        # Validation STRICTE: magic bytes PNG/JPEG/WEBP uniquement
        is_png = data[:8].startswith(b"\x89PNG")
        is_jpg = data[:3] == b"\xff\xd8\xff"
        is_webp = data[:4] == b"RIFF" and data[8:12] == b"WEBP"
        if not (is_png or is_jpg or is_webp):
            reasons.append(f"{url[:60]}: format non reconnu ({data[:12]!r})")
            continue  # non-image -> essaie le fallback
        ext = "png" if is_png else ("webp" if is_webp else "jpg")
        ctype = "image/png" if is_png else ("image/webp" if is_webp else "image/jpeg")
        try:
            app_pass = (WP_APP_PASS or "").replace(" ", "")
            req = urllib.request.Request(
                WP_URL.rstrip("/") + "/wp-json/wp/v2/media",
                data=data, method="POST",
                headers={"Content-Type": ctype,
                         "Authorization": "Basic " + _b64(WP_USER + ":" + app_pass),
                         "Content-Disposition": f"attachment; filename=kora-illustration.{ext}"})
            with urllib.request.urlopen(req, timeout=40) as r:
                d = json.loads(r.read().decode())
            media_id = d.get("id", 0)
            # Normalise la légende (sinon WP affiche l'URL source brute).
            # Bug corrige 2026-08-21 : la legende etait figee sur "Illustration
            # IA — KORA" quel que soit le provider -- desormais TOUJOURS faux
            # depuis le retrait de la generation IA (voir generation/
            # illustrate.py), une vraie photo de source ne doit jamais etre
            # presentee comme une illustration IA.
            # Bug corrige (revue de code) : `image_provider` decrit l'image
            # PRIMAIRE demandee (image_url), mais si celle-ci echoue la magic-
            # byte check, c'est fallback_url (og du champion, TOUJOURS une
            # vraie photo de source) qui est effectivement uploadee -- la
            # legende doit refleter l'URL REELLEMENT envoyee, pas la demande
            # initiale.
            is_fallback = fallback_url and url == fallback_url
            # Crédit de la source réelle (2026-08-23, demande explicite : "il
            # ne doit pas y avoir aucune source ... il faut que le nom de la
            # source d'où provient l'image figure au niveau de l'article") --
            # le nom credité suit la MEME URL réellement envoyée (source_name
            # pour l'image primaire, fallback_source_name pour l'OG du
            # champion), jamais une source devinée ou fixe. Un repli stock
            # (loremflickr/picsum) n'a par définition aucune source réelle à
            # créditer -> légende générique inchangée dans ce cas.
            is_stock_fallback = (not is_fallback) and image_provider in ("loremflickr", "picsum")
            # Vide pour un repli stock (aucune source réelle à créditer, voir
            # docstring ci-dessus) ou si la source n'est simplement pas connue.
            credited_source_name = "" if is_stock_fallback else (
                fallback_source_name if is_fallback else source_name)
            if is_stock_fallback:
                caption = "Photo d'illustration — KORA"
            elif credited_source_name:
                caption = f"Photo : {credited_source_name}"
            else:
                caption = "Photo — KORA (source)"
            try:
                upd = urllib.request.Request(
                    WP_URL.rstrip("/") + f"/wp-json/wp/v2/media/{media_id}",
                    data=json.dumps({"caption": caption}).encode(),
                    method="POST",
                    headers={"Content-Type": "application/json",
                             "Authorization": "Basic " + _b64(WP_USER + ":" + app_pass)})
                urllib.request.urlopen(upd, timeout=20)
            except Exception:
                pass
            # 3e valeur (2026-08-23) : le nom de source RÉELLEMENT crédité
            # (peut être vide -- repli stock, ou source inconnue) -- permet à
            # _to_wordpress d'ajouter une mention VISIBLE dans le CORPS de
            # l'article (la légende média seule n'est pas forcément affichée
            # par le thème WordPress, voir appel ci-dessous).
            return media_id, None, credited_source_name
        except Exception as e:
            reasons.append(f"{url[:60]}: envoi WP échoué ({e})")
            continue
    # Aucun candidat n'a abouti -- log serveur (journalctl -u kora-reach) ET
    # renvoyé à l'appelant, pour ne plus jamais avoir un article sans image
    # sans savoir pourquoi (ni dans les logs, ni pour l'éditeur).
    reason = " | ".join(reasons) if reasons else "aucune image fournie"
    print(f"[TRANSMIT_IMAGE_ECHEC] {reason}", flush=True)
    return -1, reason, ""


_VIDEO_MAX_BYTES = 80 * 1024 * 1024  # 80 Mo -- au-delà, la plupart des hébergeurs WP
                                      # mutualisés rejettent l'upload (limite PHP
                                      # upload_max_filesize/post_max_size courante).


def _upload_video(video_path: str) -> tuple:
    """Upload la vidéo narrée (generated/videos/{fact_id}.mp4) vers la
    médiathèque WordPress. Retourne (source_url, error_reason) -- source_url
    est None en cas d'échec (fichier absent, trop volumineux, refus WP...).

    2026-08-22 (demande explicite : "l'article vidéo doit pouvoir être
    transféré sur wordpress dans brouillons ou en publication officielle") --
    jusqu'ici transmit.py ignorait totalement la vidéo générée, seuls le
    texte et l'image partaient vers WordPress. Import paresseux
    d'orchestration.video (même précaution que _derive_source_level plus
    haut : éviter tout couplage/coût au chargement du module)."""
    try:
        from orchestration.video import VIDEO_OUT_DIR
    except Exception as e:
        return None, f"module vidéo indisponible ({e})"
    if not video_path:
        return None, "aucun fichier vidéo enregistré pour cet article"
    full_path = video_path if os.path.isabs(video_path) else os.path.join(VIDEO_OUT_DIR, video_path)
    if not os.path.exists(full_path):
        return None, f"fichier introuvable ({full_path})"
    size = os.path.getsize(full_path)
    if size <= 0:
        return None, "fichier vidéo vide"
    if size > _VIDEO_MAX_BYTES:
        return None, f"vidéo trop volumineuse ({size // (1024*1024)} Mo > {_VIDEO_MAX_BYTES // (1024*1024)} Mo)"
    try:
        with open(full_path, "rb") as f:
            data = f.read()
        app_pass = (WP_APP_PASS or "").replace(" ", "")
        fname = os.path.basename(full_path) or "kora-video.mp4"
        req = urllib.request.Request(
            WP_URL.rstrip("/") + "/wp-json/wp/v2/media",
            data=data, method="POST",
            headers={"Content-Type": "video/mp4",
                     "Authorization": "Basic " + _b64(WP_USER + ":" + app_pass),
                     "Content-Disposition": f"attachment; filename={fname}"})
        with urllib.request.urlopen(req, timeout=120) as r:
            d = json.loads(r.read().decode())
        src = d.get("source_url") or d.get("guid", {}).get("rendered")
        if not src:
            return None, "réponse WordPress sans source_url"
        return src, None
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = e.read().decode("utf-8", "ignore")[:200]
        except Exception:
            pass
        reason = f"envoi WP échoué (HTTP {e.code}: {detail})"
        print(f"[TRANSMIT_VIDEO_ECHEC] {reason}", flush=True)
        return None, reason
    except Exception as e:
        reason = f"envoi WP échoué ({e})"
        print(f"[TRANSMIT_VIDEO_ECHEC] {reason}", flush=True)
        return None, reason


def _to_wordpress(payload: dict, wp_status: str = "publish") -> dict:
    # L'app-password WP peut contenir des espaces (affichage) -> on les retire
    app_pass = (WP_APP_PASS or "").replace(" ", "")
    # 1) Upload de l'image à la une (visuel adaptatif obligatoire)
    #    Fallback OG du champion si l'image générée est corrompue (JSON/HTML)
    media_id = 0
    image_error = None
    credited_source_name = ""
    img = payload.get("image", "")
    og = payload.get("og_image", "")  # transmis par writer si dispo
    if img:
        mid, image_error, credited_source_name = _upload_media(
            img, fallback_url=og, image_provider=payload.get("image_provider", ""),
            source_name=payload.get("image_source_name", ""),
            fallback_source_name=payload.get("champion_source_name", ""))
        if mid > 0:
            media_id = mid
            image_error = None
    else:
        image_error = "aucune image associée à cet article"
    # Mention de source VISIBLE dans le corps (2026-08-23, demande explicite :
    # "il faut que le nom de la source d'où provient l'image figure au niveau
    # de l'article") -- la légende média seule (_upload_media ci-dessus)
    # n'est pas forcément rendue par le thème WordPress ; cette ligne, elle,
    # fait partie du contenu de l'article et sera donc TOUJOURS visible.
    # Absente pour un repli stock (aucune source réelle à créditer).
    if media_id > 0 and credited_source_name:
        payload["content"] = (
            f'<p class="kora-photo-credit" style="font-size:0.85em;color:#767676;'
            f'margin:0 0 18px"><em>Crédit photo : {credited_source_name}</em></p>\n\n'
            + payload["content"]
        )
    # 2) Vidéo narrée (2026-08-22, demande explicite) : uploadée vers la
    #    médiathèque WP et intégrée en tête du contenu (lecteur HTML5 natif,
    #    poster = même image que featured_media pour un rendu cohérent avant
    #    lecture). N'empêche JAMAIS la transmission texte si elle échoue --
    #    voir video_warning ci-dessous, même philosophie que image_warning.
    video_warning = None
    if payload.get("video_status") == "done" and payload.get("video_path"):
        video_url, video_warning = _upload_video(payload["video_path"])
        if video_url:
            poster_attr = f' poster="{payload.get("image", "")}"' if payload.get("image") else ""
            payload["content"] = (
                f'<figure class="wp-block-video"><video controls{poster_attr} '
                f'src="{video_url}"></video></figure>\n\n' + payload["content"]
            )
    # 3) Filet mécanique anti-artefact (2026-08-22, demande explicite : "rien
    #    ne doit faire croire que ceci est l'oeuvre d'une IA") -- scanne titre
    #    ET corps juste avant l'envoi. Ne bloque JAMAIS la transmission (voir
    #    commentaire de _ENGLISH_TELLS) -- signale seulement, à charge pour
    #    l'éditeur de relire et corriger manuellement avant republication.
    content_warning = _detect_language_artifacts(payload["title"] + "\n" + payload["content"])
    # 4) Classement automatique par catégorie (2026-08-23, demande explicite :
    #    "ajoute la fonctionnalité de classement automatique par catégorie
    #    ... Cela évite au user de le faire lui-même") -- voir
    #    _classify_category ci-dessus. Ne bloque JAMAIS la transmission (le
    #    filet mécanique ne peut pas échouer, voir son docstring) --
    #    "Non classé" (id WP_CATEGORY_DEFAULT_ID) au pire des cas, jamais
    #    d'article sans catégorie du tout.
    category_name = _classify_category(payload["title"], payload["content"])
    category_id = WP_CATEGORY_MAP.get(category_name, WP_CATEGORY_DEFAULT_ID)
    body = json.dumps({
        "title": payload["title"],
        "content": payload["content"],
        "status": wp_status,  # "publish" (public) ou "draft" (brouillon WP, invisible)
        "meta": {"source_url": payload.get("source_url", "")},
        "featured_media": media_id,
        "categories": [category_id],
    }).encode()
    req = urllib.request.Request(
        WP_URL.rstrip("/") + "/wp-json/wp/v2/posts",
        data=body, method="POST",
        headers={"Content-Type": "application/json",
                 "Authorization": "Basic " + _b64(WP_USER + ":" + app_pass)})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            d = json.loads(r.read().decode())
            # image_warning (2026-08-22, bug rapporté : "je n'ai point vu
            # d'image") : le POST WordPress réussit MÊME sans image (WP
            # accepte featured_media=0 sans broncher) -- avant ce correctif,
            # ce succès partiel était indiscernable d'un succès complet
            # (status "TRANSMITTED" dans les deux cas, transmissionMessage()
            # côté frontend ne montre AUCUN message pour "TRANSMITTED").
            # Le champ ci-dessous permet au frontend de le signaler quand
            # même à l'éditeur, sans changer le statut (le post EST bien en
            # ligne, seule l'image manque).
            return {"status": "TRANSMITTED", "provider": "wordpress",
                    "http_status": r.status, "detail": "OK (media_id=%s)" % media_id,
                    "wp_post_id": d.get("id"), "wp_url": d.get("link"),
                    "image_warning": image_error, "video_warning": video_warning,
                    "content_warning": (
                        f"mot(s) non francophone(s) détecté(s) : {content_warning} — relire avant publication"
                        if content_warning else None),
                    "category_name": category_name, "category_id": category_id}
    except urllib.error.HTTPError as e:
        return {"status": "FAILED", "provider": "wordpress",
                "http_status": e.code, "detail": e.reason}


def _to_supabase(fact: dict, final_text: str) -> dict:
    payload = _build_supabase_payload(fact, final_text)
    src_url = payload.get("source_url", "")
    headers = {"Content-Type": "application/json",
               "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY,
               "Prefer": "return=minimal"}
    # Dédupe : pas d'écrasement si un article avec cette source_url existe déjà
    if src_url:
        g = urllib.request.Request(
            SB_URL.rstrip("/") + f"/rest/v1/articles?source_url=eq.{urllib.parse.quote(src_url)}&select=id&limit=1",
            headers={"apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY})
        try:
            with urllib.request.urlopen(g, timeout=20) as r:
                if json.loads(r.read().decode()):
                    return {"status": "SKIPPED_DUPLICATE", "provider": "supabase",
                            "http_status": 200,
                            "detail": "Article avec cette source_url déjà présent — aucun écrasement."}
        except Exception:
            pass
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        SB_URL.rstrip("/") + "/rest/v1/articles",
        data=body, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return {"status": "TRANSMITTED", "provider": "supabase",
                    "http_status": r.status, "detail": "Écrit dans public.articles (PENDING_REVIEW)."}
    except urllib.error.HTTPError as e:
        return {"status": "FAILED", "provider": "supabase",
                "http_status": e.code, "detail": e.reason}


def _to_postgres(fact: dict, final_text: str) -> dict:
    """Écrit l'article validé dans la table 'articles' de la base PostgreSQL locale.
    Même schéma que Supabase (colonnes fr). Dédupe sur source_url."""
    import core.db as db
    payload = _build_supabase_payload(fact, final_text)
    src_url = payload.get("source_url", "")
    con, mode = db.conn()
    if mode != "postgres":
        # Bug corrige (revue de code 2026-08-19) : ce retour anticipe, avant
        # le try/finally ci-dessous, laissait la connexion tout juste ouverte
        # par db.conn() sans jamais la fermer -> fuite de connexion a chaque
        # appel avec un provider force a 'postgres' sur un backend sqlite.
        con.close()
        return {"status": "FAILED", "provider": "postgres", "http_status": 0,
                "detail": "DATABASE_BACKEND n'est pas 'postgres'."}
    try:
        cur = con.cursor()
        # Dédupe
        if src_url:
            cur.execute("SELECT id FROM articles WHERE source_url=%s" % db.placeholder(), (src_url,))
            if cur.fetchone():
                return {"status": "SKIPPED_DUPLICATE", "provider": "postgres",
                        "http_status": 200, "detail": "source_url déjà présent."}
        cols = ["titre", "chapeau", "corps", "meta_description", "mots_cles",
                "source_url", "source_nom", "source_level", "image_url",
                "llm_model_used", "status", "origin"]
        vals = [payload.get("titre"), payload.get("chapeau"), payload.get("corps"),
                payload.get("meta_description"), payload.get("mots_cles"),
                payload.get("source_url"), payload.get("source_nom"),
                payload.get("source_level"), payload.get("image_url"),
                payload.get("llm_model_used"), payload.get("status"), payload.get("origin")]
        ph = ",".join([db.placeholder()] * len(cols))
        cur.execute(
            f"INSERT INTO articles ({','.join(cols)}) VALUES ({ph})",
            vals)
        con.commit()
        return {"status": "TRANSMITTED", "provider": "postgres", "http_status": 201,
                "detail": "Écrit dans kora.articles (PENDING_REVIEW)."}
    except Exception as e:
        return {"status": "FAILED", "provider": "postgres", "http_status": 0,
                "detail": str(e)}
    finally:
        con.close()


def _b64(s: str) -> str:
    import base64
    return base64.b64encode(s.encode()).decode()
