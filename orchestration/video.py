"""orchestration/video.py — genere une video narree pour un article DEJA EN
BASE, en arriere-plan (thread dedie, jamais bloquant pour l'appelant HTTP :
la generation prend 2 a 5 minutes -- narration + plusieurs images + encodage
ffmpeg -- inacceptable dans le cycle requete/reponse d'une API).

Relie generation/video.py (pur, aucun acces DB) et editorial/hitl_store.py
(stockage) -- meme principe que regenerate() : cette fonction ORCHESTRE
deux domaines, elle n'appartient a aucun des deux."""
import os
import json
import threading

import generation.video as gvideo
from editorial.hitl_store import get_fact, set_video_status

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


def _run_generation(fact_id: str, title: str, article_text: str):
    out_name = f"{fact_id}.mp4"
    try:
        res = gvideo.generate_video_for_article(
            title=title, article_text=article_text,
            out_dir=VIDEO_OUT_DIR, out_name=out_name, fact_id=fact_id)
    except Exception as e:
        set_video_status(fact_id, "error", error=f"{type(e).__name__}: {e}")
        return
    if res["ok"]:
        # Chemin stocke = nom de fichier seul (le dossier est fixe et connu
        # cote serveur -- voir server.py, endpoint de service des videos).
        set_video_status(fact_id, "done", path=out_name, duration_sec=res["duration_sec"])
    else:
        set_video_status(fact_id, "error", error=res["error"])


def start_video_generation(fact_id: str) -> dict:
    """Demarre la generation en arriere-plan. Retourne immediatement
    {ok, status} ou {ok: False, error}. Le statut reel se suit via
    editorial.hitl_store.get_fact(fact_id)['video_status']."""
    row = get_fact(fact_id)
    if not row:
        return {"ok": False, "error": "fact_introuvable"}
    if row.get("video_status") == "generating":
        return {"ok": False, "error": "generation_deja_en_cours"}
    champ = row["champion"] if isinstance(row.get("champion"), dict) else json.loads(row.get("champion") or "{}")
    title = champ.get("title", "")
    article_text = _extract_article_text(row)
    if len(article_text.strip()) < MIN_ARTICLE_CHARS:
        return {"ok": False, "error": "article_trop_court_ou_absent"}
    set_video_status(fact_id, "generating")
    t = threading.Thread(target=_run_generation, args=(fact_id, title, article_text), daemon=True)
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
        "video_path": row.get("video_path"),
        "video_duration_sec": row.get("video_duration_sec"),
        "video_error": row.get("video_error"),
    }
