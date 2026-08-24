"""orchestration/video.py — genere une video narree pour un article DEJA EN
BASE, en arriere-plan (thread dedie, jamais bloquant pour l'appelant HTTP :
la generation prend 1 a 3 minutes -- narration + telechargement de l'image
de couverture deja choisie + encodage ffmpeg -- inacceptable dans le cycle
requete/reponse d'une API).

Relie generation/video.py (pur, aucun acces DB) et editorial/hitl_store.py
(stockage) -- meme principe que regenerate() : cette fonction ORCHESTRE
deux domaines, elle n'appartient a aucun des deux."""
import os
import json
import threading

import generation.video as gvideo
import generation.illustrate as illustrate
from editorial.hitl_store import get_fact, set_video_status, set_video_narration_mode
import editorial.notifications as notifications

# Modes de narration vidéo valides (2026-08-24, voir generation/narrate.py::
# _DIALOGUE_VOICE_MODES) -- toute valeur hors de cet ensemble retombe sur
# "solo", jamais de blocage pour une valeur mal formée venue du frontend.
NARRATION_MODES = ("solo", "duo_hf", "duo_hh")

# Racine du repo (voir commentaire equivalent dans editorial/audit.py,
# identity/auth.py, core/db.py -- meme piege deja rencontre et evite lors
# du refactor monolithe modulaire : ne JAMAIS deriver un chemin de donnees
# du seul dossier de CE fichier).
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VIDEO_OUT_DIR = os.environ.get(
    "KORA_VIDEO_DIR", os.path.join(_REPO_ROOT, "generated", "videos"))

MIN_ARTICLE_CHARS = 100  # en dessous, pas assez de matiere pour une narration


def _extract_article_text(row: dict) -> str:
    art = row.get("article")
    if isinstance(art, (dict, list)):
        return json.dumps(art, ensure_ascii=False)
    art = art or ""
    # Certains chemins historiques serialisent l'article en JSON (voir
    # upsert_fact()) -- tente une extraction si c'est manifestement le cas,
    # sinon utilise tel quel (cas normal : texte brut).
    if art.strip().startswith("{") or art.strip().startswith("["):
        try:
            parsed = json.loads(art)
            if isinstance(parsed, dict):
                return str(parsed.get("body") or parsed.get("final_text") or parsed.get("article") or art)
        except Exception:
            pass
    return art


def _run_generation(fact_id: str, title: str, article_text: str, image_url: str,
                     on_complete=None, narration_mode: str = "solo", image_urls: list = None):
    """`on_complete` (2026-08-21, verrou d'exclusivite) : callable optionnel
    appele UNE FOIS a la toute fin (succes ou echec) -- utilise par server.py
    pour liberer le verrou video global des que ce thread se termine, sans
    dependre du polling cote frontend."""
    out_name = f"{fact_id}.mp4"

    def _on_stage(stage):
        set_video_status(fact_id, "generating", stage=stage)

    try:
        res = gvideo.generate_video_for_article(
            title=title, article_text=article_text, image_url=image_url,
            out_dir=VIDEO_OUT_DIR, out_name=out_name, fact_id=fact_id,
            on_stage=_on_stage, narration_mode=narration_mode, image_urls=image_urls)
    except Exception as e:
        set_video_status(fact_id, "error", error=f"{type(e).__name__}: {e}")
        # Notification persistante (2026-08-22) : generation 1-3 min, souvent
        # lancee puis on quitte la page -- sans ceci, l'echec passe inapercu
        # tant qu'on n'a pas rouvert la fiche de l'article par hasard.
        notifications.create("video_error", f"Échec de la génération vidéo : {title}", route="videos", fact_id=fact_id)
        if on_complete:
            try: on_complete()
            except Exception: pass
        return
    if res["ok"]:
        # Chemin stocke = nom de fichier seul (le dossier est fixe et connu
        # cote serveur -- voir server.py, endpoint de service des videos).
        set_video_status(fact_id, "done", path=out_name, duration_sec=res["duration_sec"])
        notifications.create("video_done", f"Vidéo narrée générée : {title}", route="videos", fact_id=fact_id)
    else:
        set_video_status(fact_id, "error", error=res["error"])
        notifications.create("video_error", f"Échec de la génération vidéo : {title}", route="videos", fact_id=fact_id)
    if on_complete:
        try: on_complete()
        except Exception: pass


def start_video_generation(fact_id: str, on_complete=None, narration_mode: str = "solo") -> dict:
    """Demarre la generation en arriere-plan. Retourne immediatement
    {ok, status} ou {ok: False, error}. Le statut reel se suit via
    editorial.hitl_store.get_fact(fact_id)['video_status']. `on_complete`
    (2026-08-21) : voir _run_generation -- passe tel quel.

    `narration_mode` (2026-08-24) : 'solo' (défaut) | 'duo_hf' | 'duo_hh' --
    toute valeur hors de NARRATION_MODES retombe silencieusement sur 'solo'
    (jamais de blocage pour une valeur mal formée)."""
    if narration_mode not in NARRATION_MODES:
        narration_mode = "solo"
    try:
        row = get_fact(fact_id)
    except Exception as e:
        return {"ok": False, "error": f"lecture_fait_echouee: {type(e).__name__}: {e}"}
    if not row:
        return {"ok": False, "error": "fact_introuvable"}
    if row.get("video_status") == "generating":
        return {"ok": False, "error": "generation_deja_en_cours"}
    # Bug corrige 2026-08-21 (revue de code) : ce json.loads() n'etait pas
    # protege -- un champion corrompu/legacy levait une exception NON
    # rattrapee jusqu'a l'appelant HTTP (server.py), qui a DEJA pose le
    # verrou d'exclusivite video a ce moment-la (_try_acquire_video_lock,
    # avant cet appel) sans aucun try/finally pour le liberer -> le verrou
    # restait pris pour toujours, bloquant aussi /api/cycle et /api/regenerate.
    try:
        champ = row["champion"] if isinstance(row.get("champion"), dict) else json.loads(row.get("champion") or "{}")
    except Exception:
        champ = {}
    title = champ.get("title", "")
    article_text = _extract_article_text(row)
    if len(article_text.strip()) < MIN_ARTICLE_CHARS:
        return {"ok": False, "error": "article_trop_court_ou_absent"}
    # Image de couverture DEJA CHOISIE pour l'article (voir generation/
    # illustrate.py, 2026-08-21 : image reelle d'une source du dossier, ou
    # repli photo stock -- plus aucune generation IA specifique a la video).
    image_url = row.get("image", "") or champ.get("image", "")
    if not image_url:
        return {"ok": False, "error": "image_de_couverture_absente"}
    # Candidats multi-images (2026-08-24, demande explicite : "plusieurs
    # successions d'images, mais avec des effets de zoom") : TOUTES les
    # images reelles du dossier (champion + contextes, jamais d'IA -- voir
    # illustrate._candidate_images), dans l'ordre de fiabilite de source.
    # `image_url` reste le premier element par construction (illustrate.py
    # place deja le champion en tete) -- generation/video.py retombe seul
    # sur le mono-image si moins de 2 sont effectivement telechargeables.
    try:
        contexts = row["contexts"] if isinstance(row.get("contexts"), list) else json.loads(row.get("contexts") or "[]")
    except Exception:
        contexts = []
    try:
        image_urls = [u for u, _src in illustrate._candidate_images(champ, contexts)]
    except Exception:
        image_urls = [image_url] if image_url else []
    set_video_status(fact_id, "generating", stage="narration")
    set_video_narration_mode(fact_id, narration_mode)
    t = threading.Thread(target=_run_generation,
                           args=(fact_id, title, article_text, image_url, on_complete, narration_mode, image_urls),
                           daemon=False)
    t.start()
    return {"ok": True, "status": "generating"}


def video_status(fact_id: str) -> dict:
    """Etat courant (poll cote frontend)."""
    row = get_fact(fact_id)
    if not row:
        return {"ok": False, "error": "fact_introuvable"}
    return {
        "ok": True,
        "video_status": row.get("video_status"),
        "video_stage": row.get("video_stage"),
        "video_path": row.get("video_path"),
        "video_duration_sec": row.get("video_duration_sec"),
        "video_error": row.get("video_error"),
        "video_narration_mode": row.get("video_narration_mode"),
    }


def list_videos() -> list:
    """Liste tous les faits ayant une video (peu importe le statut -- fait,
    en cours, en echec) -- pour la page Videos (2026-08-21). Trie par date
    de creation du fait decroissante (plus recent d'abord).

    Bug corrige (revue de code, 2e version) : passait par hitl_store.
    list_facts(), qui JOINT hitl_decisions et JSON-parse l'article/contexts
    COMPLETS de CHAQUE fait -- pour n'en garder que la poignee ayant une
    video. Requete SQL directe ici (filtre "video_status IS NOT NULL" cote
    base), ne lit/parse que le strict necessaire (titre du champion,
    colonnes video_*)."""
    import core.db as db
    con, mode = db.conn()
    try:
        cur = con.cursor()
        cur.execute(
            """SELECT fact_id, champion, status, video_status, video_stage,
                      video_path, video_duration_sec, video_error, created_at, image,
                      video_narration_mode
               FROM hitl_facts
               WHERE video_status IS NOT NULL
               ORDER BY created_at DESC""")
        rows = cur.fetchall()
    finally:
        con.close()
    out = []
    for r in rows:
        d = dict(r)
        try:
            champ = json.loads(d["champion"]) if d["champion"] else {}
        except Exception:
            champ = {}
        # image (2026-08-22, poster du lecteur page Videos) : priorite a
        # l'image reelle deja choisie pour l'article (colonne dediee), repli
        # sur celle du champion si jamais absente (bases anciennes).
        img = d.get("image") or (champ or {}).get("image", "")
        out.append({
            "fact_id": d["fact_id"],
            "title": (champ or {}).get("title", ""),
            "image": img,
            "status": d.get("status"),
            "video_status": d.get("video_status"),
            "video_stage": d.get("video_stage"),
            "video_path": d.get("video_path"),
            "video_duration_sec": d.get("video_duration_sec"),
            "video_error": d.get("video_error"),
            "created_at": d.get("created_at"),
            "video_narration_mode": d.get("video_narration_mode"),
        })
    return out
