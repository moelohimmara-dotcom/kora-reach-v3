"""video.py — assemble une video "article narre" pour un article : LA MEME
image de couverture reelle que celle choisie pour l'article (voir
generation/illustrate.py, plus aucune generation IA depuis le 2026-08-21) +
narration audio (narrate.py), montees via ffmpeg (deja installe sur le
serveur -- verifie avant integration, voir tests/test_smoke_ffmpeg.py).

Pipeline (simplifie 2026-08-21, remplace l'ancien diaporama a 3 images
Pollinations) : texte article -> narration -> UNE SEULE image (celle deja
choisie par illustrate.py comme couverture de l'article) telechargee -> effet
zoom lent (Ken Burns, sens alterne selon le fait) sur toute la duree de
l'audio -> fondus d'ouverture/fermeture -> normalisation du volume de la
narration -> mux -> fichier .mp4 final. Un seul appel ffmpeg (plus besoin de
xfade entre plusieurs clips).

Aucun acces DB ici (coherent avec le reste de generation/) : toutes les
fonctions prennent du texte/une URL d'image en entree et rendent des
fichiers en sortie. C'est orchestration/video.py qui relie ce module a
editorial/hitl_store.py.
"""
import os
import hashlib
import shutil
import subprocess
import tempfile
import urllib.request

import generation.narrate as narrate

FFMPEG_BIN = os.environ.get("KORA_FFMPEG_BIN", "ffmpeg")
FFPROBE_BIN = os.environ.get("KORA_FFPROBE_BIN", "ffprobe")
VIDEO_WIDTH = 1280
VIDEO_HEIGHT = 720
VIDEO_FPS = 25
FADE_SEC = 0.6  # fondu d'ouverture/fermeture (video ET audio)
IMAGE_FETCH_TIMEOUT = int(os.environ.get("KORA_VIDEO_IMAGE_TIMEOUT_SEC", "90"))
FFMPEG_TIMEOUT = int(os.environ.get("KORA_FFMPEG_TIMEOUT_SEC", "180"))
# Zoom Ken Burns : amplitude et vitesse identiques a l'ancien diaporama
# (bornes 1.0 <-> 1.15, pas de 0.0008/frame), simplement applique sur la
# totalite de la duree de l'audio au lieu d'un fragment par image.
ZOOM_MIN = 1.0
ZOOM_MAX = 1.15
ZOOM_STEP = 0.0008


def ffmpeg_available() -> bool:
    return shutil.which(FFMPEG_BIN) is not None and shutil.which(FFPROBE_BIN) is not None


def _zoom_direction(fact_id: str, title: str) -> str:
    """Alterne zoom avant/arriere de facon deterministe selon le fait
    (2026-08-21, amelioration demandee : eviter que toutes les videos se
    ressemblent). Meme fait -> meme direction a chaque regeneration."""
    salt = (fact_id or title or "kora").encode()
    return "in" if int(hashlib.sha256(salt).hexdigest()[:8], 16) % 2 == 0 else "out"


def fetch_cover_image(image_url: str, out_dir: str) -> str:
    """Telecharge l'image de couverture DEJA CHOISIE pour l'article (voir
    generation/illustrate.py -- image reelle d'une source du cluster, ou
    repli photo stock) vers un fichier local (ffmpeg a besoin d'un fichier
    sur disque). Retourne le chemin local, ou "" en cas d'echec."""
    if not image_url:
        return ""
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, "cover.jpg")
    try:
        req = urllib.request.Request(image_url, headers={"User-Agent": "Mozilla/5.0 KORA/1.0"})
        with urllib.request.urlopen(req, timeout=IMAGE_FETCH_TIMEOUT) as r:
            data = r.read()
        with open(path, "wb") as f:
            f.write(data)
        return path
    except Exception as e:
        print(f"[video] telechargement image de couverture echoue: {type(e).__name__}: {e}")
        return ""


def _probe_duration(path: str) -> float:
    out = subprocess.run(
        [FFPROBE_BIN, "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", path],
        capture_output=True, text=True, timeout=30,
    )
    return float(out.stdout.strip())


def assemble_video(image_path: str, audio_path: str, out_path: str,
                    zoom_direction: str = "in") -> dict:
    """Assemble la video finale a partir d'UNE image et de la narration :
    zoom Ken Burns (avant ou arriere) sur toute la duree de l'audio, fondus
    d'ouverture/fermeture, narration normalisee en volume (loudnorm).
    Retourne {ok, path, duration_sec, error}. Un seul appel ffmpeg (plus de
    xfade entre clips -- une seule image, plus besoin d'enchainement)."""
    if not ffmpeg_available():
        return {"ok": False, "path": None, "duration_sec": None, "error": "ffmpeg_introuvable"}
    if not image_path or not os.path.exists(image_path):
        return {"ok": False, "path": None, "duration_sec": None, "error": "image_de_couverture_absente"}
    try:
        audio_dur = _probe_duration(audio_path)
    except Exception as e:
        return {"ok": False, "path": None, "duration_sec": None, "error": f"audio_illisible: {type(e).__name__}: {e}"}

    frames = max(1, int(audio_dur * VIDEO_FPS))
    if zoom_direction == "out":
        # Part de ZOOM_MAX et redescend vers ZOOM_MIN (zoompan : 'on' = numero
        # de frame de sortie, initialise a ZOOM_MAX au 1er frame puis decroit).
        z_expr = f"if(eq(on,0),{ZOOM_MAX},max(zoom-{ZOOM_STEP},{ZOOM_MIN}))"
    else:
        z_expr = f"min(zoom+{ZOOM_STEP},{ZOOM_MAX})"
    # Bug corrige (revue de code) : pour un audio tres court (<= FADE_SEC),
    # fade_out_start tombait a 0 -- les fondus d'ouverture ET de fermeture
    # demarraient au meme instant et se chevauchaient sur tout le clip
    # (flash noir/silence au lieu du plan attendu). On reduit le fondu
    # proportionnellement (jamais plus du tiers de la duree) pour garantir
    # qu'ouverture et fermeture ne se chevauchent jamais, meme sur un
    # article tres court.
    fade = min(FADE_SEC, audio_dur / 3) if audio_dur > 0 else 0.0
    fade_out_start = max(0.0, audio_dur - fade)
    vf = (
        f"scale={VIDEO_WIDTH}:{VIDEO_HEIGHT}:force_original_aspect_ratio=increase,"
        f"crop={VIDEO_WIDTH}:{VIDEO_HEIGHT},"
        f"zoompan=z='{z_expr}':d={frames}:s={VIDEO_WIDTH}x{VIDEO_HEIGHT}:fps={VIDEO_FPS},"
        f"fade=t=in:st=0:d={fade:.3f},fade=t=out:st={fade_out_start:.3f}:d={fade:.3f}"
    )
    af = (
        f"loudnorm,"
        f"afade=t=in:st=0:d={fade:.3f},afade=t=out:st={fade_out_start:.3f}:d={fade:.3f}"
    )
    cmd = [FFMPEG_BIN, "-y", "-loop", "1", "-i", image_path, "-i", audio_path,
           "-t", str(audio_dur),
           "-vf", vf, "-af", af,
           "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", str(VIDEO_FPS),
           "-c:a", "aac", "-shortest", out_path, "-loglevel", "error"]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=FFMPEG_TIMEOUT)
        if r.returncode != 0:
            return {"ok": False, "path": None, "duration_sec": None,
                    "error": f"ffmpeg_assemblage: {r.stderr[:400]}"}
        if not os.path.exists(out_path) or os.path.getsize(out_path) < 4096:
            return {"ok": False, "path": None, "duration_sec": None, "error": "video_finale_vide_ou_absente"}
        final_dur = _probe_duration(out_path)
        return {"ok": True, "path": out_path, "duration_sec": final_dur, "error": None}
    except subprocess.TimeoutExpired:
        return {"ok": False, "path": None, "duration_sec": None, "error": "ffmpeg_timeout"}
    except Exception as e:
        return {"ok": False, "path": None, "duration_sec": None, "error": f"{type(e).__name__}: {e}"}


def generate_video_for_article(title: str, article_text: str, image_url: str,
                                out_dir: str, out_name: str, voice: str = None,
                                fact_id: str = "", on_stage=None,
                                narration_mode: str = "solo") -> dict:
    """Pipeline complet : narration + telechargement de l'image de couverture
    DEJA CHOISIE pour l'article + assemblage. Retourne {ok, video_path,
    duration_sec, error}. Nettoie systematiquement les fichiers de travail
    intermediaires (image, audio brut), ne laisse que la video finale dans
    out_dir.

    `on_stage` (2026-08-21, barre de progression) : callable optionnel
    appele avec 'narration' | 'image' | 'assemblage' au debut de chaque
    etape -- ce module reste PUR (aucun acces DB, voir docstring en tete de
    fichier) : c'est l'appelant (orchestration/video.py) qui persiste la
    progression via ce callback, jamais ce module directement.

    `narration_mode` (2026-08-24, narration a deux voix façon NotebookLM) :
    'solo' (defaut, comportement historique -- un seul présentateur, voir
    narrate.build_edito_script/narrate_to_file) | 'duo_hf' | 'duo_hh' (deux
    voix qui dialoguent, voir narrate.build_dialogue_script/
    narrate_dialogue_to_file). Un mode inconnu retombe sur 'solo' -- jamais
    de blocage de la video pour une valeur mal formee venue de l'appelant."""
    def _stage(name):
        if on_stage:
            try:
                on_stage(name)
            except Exception:
                pass  # jamais bloquant pour le pipeline video lui-meme

    os.makedirs(out_dir, exist_ok=True)
    work_dir = tempfile.mkdtemp(prefix="kora_video_work_")
    try:
        _stage("narration")
        audio_path = os.path.join(work_dir, "voix.mp3")
        if narration_mode in ("duo_hf", "duo_hh"):
            # Dialogue a deux voix (2026-08-24) : voir narrate.py pour le
            # detail (script LLM en A/B avec vrai mecanisme question ->
            # reponse -> rebond, balises d'emotion, correction phonetique
            # des noms guinéens -- tout ça est géré en amont dans narrate.py,
            # ce module n'a qu'à enchaîner script -> synthèse).
            turns = narrate.build_dialogue_script(title, article_text)
            nres = narrate.narrate_dialogue_to_file(turns, audio_path, mode=narration_mode)
        else:
            # Édito (2026-08-23, demande explicite : "sa lecture doit être
            # vivante et réaliste, comme le ferait un lecteur humain. Il doit
            # le faire sous forme d'édito") -- l'article ECRIT (titre
            # markdown, chapô, corps, signature) n'est pas narré tel quel :
            # voir generation/narrate.py::build_edito_script pour la
            # transformation en script oral. Repli mécanique intégré à cette
            # fonction (jamais de blocage de la vidéo si le LLM édito échoue).
            edito_text = narrate.build_edito_script(title, article_text)
            nres = narrate.narrate_to_file(edito_text, audio_path, voice=voice)
        if not nres["ok"]:
            return {"ok": False, "video_path": None, "duration_sec": None,
                    "error": f"narration: {nres['error']}"}

        _stage("image")
        image_path = fetch_cover_image(image_url, work_dir)
        if not image_path:
            return {"ok": False, "video_path": None, "duration_sec": None,
                    "error": "image_de_couverture_indisponible"}

        _stage("assemblage")
        out_path = os.path.join(out_dir, out_name)
        direction = _zoom_direction(fact_id, title)
        res = assemble_video(image_path, audio_path, out_path, zoom_direction=direction)
        if not res["ok"]:
            return {"ok": False, "video_path": None, "duration_sec": None, "error": res["error"]}
        return {"ok": True, "video_path": out_path, "duration_sec": res["duration_sec"], "error": None}
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)
