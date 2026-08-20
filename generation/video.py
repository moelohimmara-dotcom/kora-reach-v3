"""video.py — assemble une video "diaporama commente" pour un article :
plusieurs images (Pollinations, meme fournisseur que illustrate.py) +
narration audio (narrate.py), montees via ffmpeg (deja installe sur le
serveur -- verifie avant integration, voir tests/test_smoke_ffmpeg.py).

Pipeline : texte article -> N prompts distincts (segments de l'article) ->
N images telechargees -> effet zoom lent (Ken Burns) par image, duree
calee sur l'audio -> transitions en fondu enchaine -> mux avec la
narration -> fichier .mp4 final.

Aucun acces DB ici (coherent avec le reste de generation/) : toutes les
fonctions prennent du texte en entree et rendent des fichiers en sortie.
C'est orchestration/video.py qui relie ce module a editorial/hitl_store.py.
"""
import os
import hashlib
import shutil
import subprocess
import tempfile
import urllib.request

import generation.illustrate as illustrate
import generation.narrate as narrate

FFMPEG_BIN = os.environ.get("KORA_FFMPEG_BIN", "ffmpeg")
FFPROBE_BIN = os.environ.get("KORA_FFPROBE_BIN", "ffprobe")
VIDEO_WIDTH = 1280
VIDEO_HEIGHT = 720
VIDEO_FPS = 25
FADE_SEC = 1.0
FFMPEG_TIMEOUT = int(os.environ.get("KORA_FFMPEG_TIMEOUT_SEC", "180"))
MIN_IMAGES = 2  # en dessous, pas de diaporama possible -> echec explicite


def ffmpeg_available() -> bool:
    return shutil.which(FFMPEG_BIN) is not None and shutil.which(FFPROBE_BIN) is not None


def _segment_prompts(title: str, article_text: str, n: int) -> list:
    """Decoupe l'article en n segments a peu pres egaux et construit un
    prompt d'image DISTINCT par segment (reutilise illustrate._build_prompt,
    meme garde-fou editorial "no recognizable real faces"). Chaque image du
    diaporama illustre ainsi une partie differente de l'article, pas n fois
    la meme scene."""
    words = (article_text or "").split()
    if not words:
        segments = [""] * n
    else:
        size = max(1, len(words) // n)
        segments = [" ".join(words[i * size:(i + 1) * size]) for i in range(n)]
        while len(segments) < n:
            segments.append(segments[-1] if segments else "")
    return [illustrate._build_prompt(title, seg[:180]) for seg in segments[:n]]


def fetch_images(title: str, article_text: str, out_dir: str, n: int = 3, fact_id: str = "") -> list:
    """Genere puis telecharge n images distinctes. Retourne une liste de
    chemins de fichiers LOCAUX (jamais d'URL externe -- ffmpeg a besoin de
    fichiers sur disque). N'echoue jamais globalement : une image en echec
    est simplement absente du resultat (l'appelant decide si le total
    restant est suffisant, voir MIN_IMAGES)."""
    os.makedirs(out_dir, exist_ok=True)
    prompts = _segment_prompts(title, article_text, n)
    paths = []
    for i, prompt in enumerate(prompts):
        seed = int(hashlib.sha256(f"{fact_id}-video-{i}".encode()).hexdigest()[:8], 16) % 900000
        try:
            url, _provider = illustrate._call_pollinations(prompt, seed=seed)
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 KORA/1.0"})
            with urllib.request.urlopen(req, timeout=illustrate.TIMEOUT) as r:
                data = r.read()
            path = os.path.join(out_dir, f"img{i}.jpg")
            with open(path, "wb") as f:
                f.write(data)
            paths.append(path)
        except Exception:
            continue  # cette image manque, les autres peuvent suffire
    return paths


def _probe_duration(path: str) -> float:
    out = subprocess.run(
        [FFPROBE_BIN, "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", path],
        capture_output=True, text=True, timeout=30,
    )
    return float(out.stdout.strip())


def assemble_video(image_paths: list, audio_path: str, out_path: str) -> dict:
    """Assemble le diaporama final : effet zoom lent par image (duree =
    duree_audio / nb_images), transitions en fondu enchaine, narration
    en piste audio. Retourne {ok, path, duration_sec, error}."""
    if not ffmpeg_available():
        return {"ok": False, "path": None, "duration_sec": None, "error": "ffmpeg_introuvable"}
    if len(image_paths) < MIN_IMAGES:
        return {"ok": False, "path": None, "duration_sec": None,
                "error": f"pas_assez_dimages ({len(image_paths)}/{MIN_IMAGES} minimum)"}
    try:
        audio_dur = _probe_duration(audio_path)
    except Exception as e:
        return {"ok": False, "path": None, "duration_sec": None, "error": f"audio_illisible: {type(e).__name__}: {e}"}

    n = len(image_paths)
    per = max(audio_dur / n, FADE_SEC * 2)  # jamais plus court que 2 fondus
    tmp_dir = tempfile.mkdtemp(prefix="kora_video_")
    clip_paths = []
    try:
        for i, img in enumerate(image_paths):
            clip = os.path.join(tmp_dir, f"clip{i}.mp4")
            frames = max(1, int(per * VIDEO_FPS))
            vf = (
                f"scale={VIDEO_WIDTH}:{VIDEO_HEIGHT}:force_original_aspect_ratio=increase,"
                f"crop={VIDEO_WIDTH}:{VIDEO_HEIGHT},"
                f"zoompan=z='min(zoom+0.0008,1.15)':d={frames}:s={VIDEO_WIDTH}x{VIDEO_HEIGHT}:fps={VIDEO_FPS}"
            )
            cmd = [FFMPEG_BIN, "-y", "-loop", "1", "-i", img, "-t", str(per),
                   "-vf", vf, "-c:v", "libx264", "-pix_fmt", "yuv420p",
                   "-r", str(VIDEO_FPS), clip, "-loglevel", "error"]
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=FFMPEG_TIMEOUT)
            if r.returncode != 0:
                return {"ok": False, "path": None, "duration_sec": None,
                        "error": f"ffmpeg_clip_{i}: {r.stderr[:400]}"}
            clip_paths.append(clip)

        # Chaine de transitions en fondu enchaine (xfade), clips de duree
        # egale `per` -> offset_i = i * (per - FADE_SEC) (formule standard
        # pour un enchainement sequentiel de xfade a duree constante).
        inputs = []
        for c in clip_paths:
            inputs += ["-i", c]
        inputs += ["-i", audio_path]
        filter_parts = []
        prev_label = "0"
        for i in range(1, n):
            offset = i * (per - FADE_SEC)
            out_label = f"v{i}" if i < n - 1 else "vout"
            filter_parts.append(
                f"[{prev_label}][{i}]xfade=transition=fade:duration={FADE_SEC}:offset={offset:.3f}[{out_label}]"
            )
            prev_label = out_label
        filter_complex = ";".join(filter_parts)
        cmd = [FFMPEG_BIN, "-y", *inputs,
               "-filter_complex", filter_complex,
               "-map", "[vout]", "-map", f"{n}:a",
               "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
               "-shortest", out_path, "-loglevel", "error"]
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
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def generate_video_for_article(title: str, article_text: str, out_dir: str, out_name: str,
                                n_images: int = 3, voice: str = None, fact_id: str = "") -> dict:
    """Pipeline complet : narration + N images + assemblage. Retourne
    {ok, video_path, duration_sec, error}. Nettoie systematiquement les
    fichiers de travail intermediaires (images, audio brut), ne laisse que
    la video finale dans out_dir."""
    os.makedirs(out_dir, exist_ok=True)
    work_dir = tempfile.mkdtemp(prefix="kora_video_work_")
    try:
        audio_path = os.path.join(work_dir, "voix.mp3")
        nres = narrate.narrate_to_file(article_text, audio_path, voice=voice)
        if not nres["ok"]:
            return {"ok": False, "video_path": None, "duration_sec": None,
                    "error": f"narration: {nres['error']}"}

        images = fetch_images(title, article_text, work_dir, n=n_images, fact_id=fact_id)
        if len(images) < MIN_IMAGES:
            return {"ok": False, "video_path": None, "duration_sec": None,
                    "error": f"images: seulement {len(images)}/{n_images} obtenues"}

        out_path = os.path.join(out_dir, out_name)
        res = assemble_video(images, audio_path, out_path)
        if not res["ok"]:
            return {"ok": False, "video_path": None, "duration_sec": None, "error": res["error"]}
        return {"ok": True, "video_path": out_path, "duration_sec": res["duration_sec"], "error": None}
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)
