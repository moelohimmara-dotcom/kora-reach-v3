"""transmit.py — adapter de transmission isolé (HITL -> backend).

UN SEUL point de sortie réseau. Mode par défaut = dry_run (gratuit, sûr, aucune
credential, aucun appel réseau). Activation WordPress/Supabase via variables env.
Aucune credential dans le code. Absente -> dry_run forcé.
"""
import os
import json
import urllib.request
import urllib.error
import urllib.parse

WP_URL = os.environ.get("WP_URL", "")
WP_USER = os.environ.get("WP_USER", "")
WP_APP_PASS = os.environ.get("WP_APP_PASS", "")
SB_URL = os.environ.get("SUPABASE_URL", "")
SB_KEY = os.environ.get("SUPABASE_KEY", "")


def _build_payload(fact: dict, final_text: str) -> dict:
    """Payload générique (pour dry_run / wordpress)."""
    champ = fact.get("champion", {})
    return {
        "title": champ.get("title", ""),
        "content": final_text or fact.get("article", ""),
        "source_url": champ.get("url", ""),
        "image": fact.get("image", ""),
        "og_image": champ.get("raw_og_image") or champ.get("image", ""),  # fallback OG champion
        "n_sources": fact.get("n_sources", 1),
        "generated_model": fact.get("gen_model", ""),
    }


def _derive_source_level(fact: dict) -> int:
    """Déduit source_level depuis la whitelist (GN_NAT=1, INTL=2).
    Import paresseux pour éviter dépendance circulaire / coût au chargement."""
    try:
        import whitelist as wl
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
    corps = final_text or fact.get("article", "")
    chapeau = corps.split("\n")[0][:280] if corps else ""
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
        import db
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
    return {"status": status, "provider": "both",
            "http_status": results[0]["http_status"],
            "detail": " | ".join(
                f"{r['provider']}:{r['status']}" for r in results),
            "results": results}


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


def _upload_media(image_url: str, fallback_url: str = "") -> int:
    """Upload l'image vers WP media. Accepte une URL ou un chemin de fichier local.
    Retourne l'id media ou 0. Strict sur magic bytes (PNG/JPEG).
    Fallback: si l'image générée est corrompue, tente l'OG du champion."""
    candidates = [image_url, fallback_url] if fallback_url else [image_url]
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
        except Exception:
            continue
        # Validation STRICTE: magic bytes PNG/JPEG uniquement
        is_png = data[:8].startswith(b"\x89PNG")
        is_jpg = data[:3] == b"\xff\xd8\xff"
        if not (is_png or is_jpg):
            continue  # non-image -> essaie le fallback
        ext = "png" if is_png else "jpg"
        ctype = "image/png" if is_png else "image/jpeg"
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
            # Vider/normaliser la légende (sinon WP affiche l'URL source = JSON Pollinations)
            try:
                upd = urllib.request.Request(
                    WP_URL.rstrip("/") + f"/wp-json/wp/v2/media/{media_id}",
                    data=json.dumps({"caption": "Illustration IA — KORA"}).encode(),
                    method="POST",
                    headers={"Content-Type": "application/json",
                             "Authorization": "Basic " + _b64(WP_USER + ":" + app_pass)})
                urllib.request.urlopen(upd, timeout=20)
            except Exception:
                pass
            return media_id
        except Exception:
            continue
    return -1


def _to_wordpress(payload: dict, wp_status: str = "publish") -> dict:
    # L'app-password WP peut contenir des espaces (affichage) -> on les retire
    app_pass = (WP_APP_PASS or "").replace(" ", "")
    # 1) Upload de l'image à la une (visuel adaptatif obligatoire)
    #    Fallback OG du champion si l'image générée est corrompue (JSON/HTML)
    media_id = 0
    img = payload.get("image", "")
    og = payload.get("og_image", "")  # transmis par writer si dispo
    if img:
        mid = _upload_media(img, fallback_url=og)
        if mid > 0:
            media_id = mid
    body = json.dumps({
        "title": payload["title"],
        "content": payload["content"],
        "status": wp_status,  # "publish" (public) ou "draft" (brouillon WP, invisible)
        "meta": {"source_url": payload.get("source_url", "")},
        "featured_media": media_id,
    }).encode()
    req = urllib.request.Request(
        WP_URL.rstrip("/") + "/wp-json/wp/v2/posts",
        data=body, method="POST",
        headers={"Content-Type": "application/json",
                 "Authorization": "Basic " + _b64(WP_USER + ":" + app_pass)})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            d = json.loads(r.read().decode())
            return {"status": "TRANSMITTED", "provider": "wordpress",
                    "http_status": r.status, "detail": "OK (media_id=%s)" % media_id,
                    "wp_post_id": d.get("id"), "wp_url": d.get("link")}
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
    import db
    payload = _build_supabase_payload(fact, final_text)
    src_url = payload.get("source_url", "")
    con, mode = db.conn()
    if mode != "postgres":
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
