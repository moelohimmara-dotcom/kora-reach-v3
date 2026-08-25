"""video.py — assemble une video "article narre" pour un article : image(s)
de couverture REELLE(S) issues des sources du dossier (voir
generation/illustrate.py, plus aucune generation IA depuis le 2026-08-21) +
narration audio (narrate.py), montees via ffmpeg (deja installe sur le
serveur -- verifie avant integration, voir tests/test_smoke_ffmpeg.py).

Pipeline MONO-image (simplifie 2026-08-21) : texte article -> narration ->
UNE SEULE image (couverture de l'article) telechargee -> zoom Ken Burns
(sens alterne selon le fait) sur toute la duree de l'audio -> fondus
d'ouverture/fermeture -> normalisation du volume -> mux -> .mp4 final. Un
seul appel ffmpeg.

Pipeline MULTI-images (2026-08-24, demande explicite : "est-ce qu'il y a
une possibilite d'utiliser plusieurs images dans la video ? plusieurs
successions d'images, mais avec des effets de zoom") : quand le dossier
fournit AU MOINS 2 images reelles distinctes (voir
illustrate._candidate_images -- article_retenu + contextes, jamais d'IA), chaque
image devient un clip avec son propre zoom Ken Burns (duree = duree_audio /
nb_images), enchaines par des transitions en fondu (xfade). Repli AUTOMATIQUE
sur le pipeline mono-image des qu'il y a moins de 2 images reelles
telechargeables -- jamais de blocage de la video pour un dossier pauvre en
images. Technique reprise de l'ancien diaporama Pollinations (retire le
2026-08-21 -- UNIQUEMENT pour la provenance IA des images, voir commit
054f121, jamais pour un defaut du mecanisme xfade lui-meme, qui reste
techniquement sain) : voir generation/video.py au commit precedent pour
l'implementation d'origine dont celle-ci s'inspire.

Aucun acces DB ici (coherent avec le reste de generation/) : toutes les
fonctions prennent du texte/des URLs d'image en entree et rendent des
fichiers en sortie. C'est orchestration/video.py qui relie ce module a
editorial/hitl_store.py et illustrate.py.
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
# Multi-images (2026-08-24) : nombre max de photos distinctes utilisees dans
# un meme montage -- au-dela, chaque segment devient trop court pour que le
# zoom Ken Burns soit perceptible (voir MIN_SEGMENT_SEC), et un dossier de
# breaking news genere rarement plus de 4-5 photos vraiment distinctes de
# toute facon. MIN_IMAGES_FOR_MULTI = 2 : en dessous, retombe sur le
# pipeline mono-image (une seule vraie photo ne justifie pas un montage).
MAX_MULTI_IMAGES = int(os.environ.get("KORA_VIDEO_MAX_IMAGES", "4"))
MIN_IMAGES_FOR_MULTI = 2
MIN_SEGMENT_SEC = 3.0  # sous ce seuil, un segment n'a pas le temps d'exister a l'ecran


def ffmpeg_available() -> bool:
    return shutil.which(FFMPEG_BIN) is not None and shutil.which(FFPROBE_BIN) is not None


def _zoom_direction(fact_id: str, title: str) -> str:
    """Alterne zoom avant/arriere de facon deterministe selon le fait
    (2026-08-21, amelioration demandee : eviter que toutes les videos se
    ressemblent). Meme fait -> meme direction a chaque regeneration."""
    salt = (fact_id or title or "kora").encode()
    return "in" if int(hashlib.sha256(salt).hexdigest()[:8], 16) % 2 == 0 else "out"


def _fetch_image_to(image_url: str, path: str) -> bool:
    """Telechargement bas niveau partage par fetch_cover_image() et
    fetch_images() (2026-08-24) -- une seule implementation du GET HTTP,
    jamais levee (retourne False, jamais d'exception)."""
    try:
        req = urllib.request.Request(image_url, headers={"User-Agent": "Mozilla/5.0 KORA/1.0"})
        with urllib.request.urlopen(req, timeout=IMAGE_FETCH_TIMEOUT) as r:
            data = r.read()
        with open(path, "wb") as f:
            f.write(data)
        return True
    except Exception as e:
        print(f"[video] telechargement image echoue ({image_url[:80]}): {type(e).__name__}: {e}")
        return False


def fetch_cover_image(image_url: str, out_dir: str) -> str:
    """Telecharge l'image de couverture DEJA CHOISIE pour l'article (voir
    generation/illustrate.py -- image reelle d'une source du dossier, ou
    repli photo stock) vers un fichier local (ffmpeg a besoin d'un fichier
    sur disque). Retourne le chemin local, ou "" en cas d'echec."""
    if not image_url:
        return ""
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, "cover.jpg")
    return path if _fetch_image_to(image_url, path) else ""


def fetch_images(image_urls: list, out_dir: str, limit: int = MAX_MULTI_IMAGES) -> list:
    """Telecharge JUSQU'A `limit` images REELLES distinctes (2026-08-24,
    montage multi-images) -- `image_urls` est deja l'ordre de preference du
    dossier (article_retenu puis contextes par fiabilite, voir
    illustrate._candidate_images), donc on s'arrete des qu'on a assez
    d'images telechargeables plutot que de toutes les essayer. Une image
    dont le telechargement echoue est simplement IGNOREE (pas de blocage) --
    le nombre reellement retourne peut donc etre < limit, y compris 0 ou 1
    (voir MIN_IMAGES_FOR_MULTI cote appelant pour le repli mono-image)."""
    os.makedirs(out_dir, exist_ok=True)
    paths = []
    for i, url in enumerate(image_urls or []):
        if len(paths) >= limit:
            break
        if not url:
            continue
        path = os.path.join(out_dir, f"img{len(paths)}.jpg")
        if _fetch_image_to(url, path):
            paths.append(path)
    return paths


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


def assemble_video_multi(image_paths: list, audio_path: str, out_path: str,
                          fact_id: str = "", title: str = "") -> dict:
    """Assemble le montage MULTI-IMAGES (2026-08-24) : un clip par image
    (zoom Ken Burns, sens alterne image par image), duree par clip =
    duree_audio / nb_images (jamais sous MIN_SEGMENT_SEC -- voir
    generate_video_for_article() pour le calcul du nombre d'images
    effectivement utilise), enchaines par des transitions en fondu (xfade),
    fondu d'ouverture sur le 1er clip / de fermeture sur le dernier,
    narration normalisee en volume (loudnorm) + fondus audio. Retourne
    {ok, path, duration_sec, error} -- meme contrat que assemble_video().

    Technique en 2 passes ffmpeg (1 par clip, puis assemblage) -- reprise de
    l'ancien diaporama Pollinations (voir docstring en tete de fichier),
    jamais un defaut du mecanisme, seulement de la provenance des images a
    l'epoque."""
    if not ffmpeg_available():
        return {"ok": False, "path": None, "duration_sec": None, "error": "ffmpeg_introuvable"}
    n = len(image_paths)
    if n < MIN_IMAGES_FOR_MULTI:
        return {"ok": False, "path": None, "duration_sec": None,
                "error": f"pas_assez_dimages ({n}/{MIN_IMAGES_FOR_MULTI} minimum)"}
    try:
        audio_dur = _probe_duration(audio_path)
    except Exception as e:
        return {"ok": False, "path": None, "duration_sec": None, "error": f"audio_illisible: {type(e).__name__}: {e}"}

    fade = min(FADE_SEC, audio_dur / 3) if audio_dur > 0 else 0.0
    # MIN_SEGMENT_SEC (revue qualite, 2026-08-24 : etait declare mais jamais
    # cable, le vrai plancher etait fade*2+0.1 -- incoherent avec la doc et
    # avec l'intention "un segment doit avoir le temps d'exister a l'ecran").
    # Reduit le nombre d'images REELLEMENT utilisees si l'audio est trop
    # court pour que chaque segment atteigne MIN_SEGMENT_SEC, plutot que de
    # forcer des segments trop courts pour que le zoom soit perceptible.
    # n*per - (n-1)*fade = audio_dur (voir plus bas) => per >= MIN_SEGMENT_SEC
    # <=> n <= (audio_dur - fade) / (MIN_SEGMENT_SEC - fade).
    if MIN_SEGMENT_SEC > fade:
        n_max = int((audio_dur - fade) / (MIN_SEGMENT_SEC - fade))
        n = max(MIN_IMAGES_FOR_MULTI, min(n, n_max)) if n_max >= MIN_IMAGES_FOR_MULTI else 0
    if n < MIN_IMAGES_FOR_MULTI:
        return {"ok": False, "path": None, "duration_sec": None,
                "error": f"audio_trop_court_pour_multi_images ({audio_dur:.1f}s)"}
    image_paths = image_paths[:n]
    # Bug corrige (revue qualite, 2026-08-24) : chaque transition xfade
    # RACCOURCIT la duree totale de `fade` secondes (offset_i chevauche le
    # clip precedent) -- la sortie finale du chainage xfade dure
    # n*per - (n-1)*fade, PAS n*per. Avec per = audio_dur/n tel quel, la
    # video finale etait plus courte que l'audio de (n-1)*fade secondes, et
    # "-shortest" coupait la fin de la narration (silencieusement, aucune
    # erreur -- un article de 20s avec 4 images perdait 1.8s de narration).
    # Corrige en compensant les (n-1) chevauchements des le calcul de `per`
    # pour que n*per - (n-1)*fade == audio_dur exactement.
    per = max((audio_dur + (n - 1) * fade) / n, fade * 2 + 0.1)  # jamais plus court que 2 fondus + marge
    work_dir = tempfile.mkdtemp(prefix="kora_video_multi_")
    try:
        clip_paths = []
        for i, img in enumerate(image_paths):
            clip = os.path.join(work_dir, f"clip{i}.mp4")
            frames = max(1, int(per * VIDEO_FPS))
            # Alterne zoom avant/arriere PAR IMAGE (pas seulement par fait --
            # 2026-08-24, demande explicite "avec des effets de zoom") pour
            # que le montage varie visuellement d'un clip a l'autre, tout en
            # restant deterministe (meme dossier -> meme sequence de zooms).
            direction = _zoom_direction(f"{fact_id}_{i}", f"{title}_{i}")
            if direction == "out":
                z_expr = f"if(eq(on,0),{ZOOM_MAX},max(zoom-{ZOOM_STEP},{ZOOM_MIN}))"
            else:
                z_expr = f"min(zoom+{ZOOM_STEP},{ZOOM_MAX})"
            vf = (
                f"scale={VIDEO_WIDTH}:{VIDEO_HEIGHT}:force_original_aspect_ratio=increase,"
                f"crop={VIDEO_WIDTH}:{VIDEO_HEIGHT},"
                f"zoompan=z='{z_expr}':d={frames}:s={VIDEO_WIDTH}x{VIDEO_HEIGHT}:fps={VIDEO_FPS}"
            )
            cmd = [FFMPEG_BIN, "-y", "-loop", "1", "-i", img, "-t", str(per),
                   "-vf", vf, "-c:v", "libx264", "-pix_fmt", "yuv420p",
                   "-r", str(VIDEO_FPS), clip, "-loglevel", "error"]
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=FFMPEG_TIMEOUT)
            if r.returncode != 0:
                return {"ok": False, "path": None, "duration_sec": None,
                        "error": f"ffmpeg_clip_{i}: {r.stderr[:400]}"}
            clip_paths.append(clip)

        # Chaine de transitions en fondu enchaine (xfade) -- offset_i =
        # i * (per - fade), formule standard pour un enchainement sequentiel
        # de xfade a duree de clip constante (voir ancien diaporama,
        # commit 054f121~1, meme formule).
        inputs = []
        for c in clip_paths:
            inputs += ["-i", c]
        inputs += ["-i", audio_path]
        filter_parts = []
        prev_label = "0"
        for i in range(1, n):
            offset = i * (per - fade)
            v_label = f"v{i}" if i < n - 1 else "vfaded"
            filter_parts.append(
                f"[{prev_label}][{i}]xfade=transition=fade:duration={fade:.3f}:offset={offset:.3f}[{v_label}]"
            )
            prev_label = v_label
        fade_out_start = max(0.0, audio_dur - fade)
        # Fondu d'ouverture/fermeture VIDEO (2026-08-24, parite avec le
        # pipeline mono-image -- l'ancien diaporama n'en avait aucun) sur la
        # sortie finale du chainage xfade.
        filter_parts.append(f"[{prev_label}]fade=t=in:st=0:d={fade:.3f},fade=t=out:st={fade_out_start:.3f}:d={fade:.3f}[vout]")
        filter_complex = ";".join(filter_parts)
        af = (
            f"loudnorm,"
            f"afade=t=in:st=0:d={fade:.3f},afade=t=out:st={fade_out_start:.3f}:d={fade:.3f}"
        )
        cmd = [FFMPEG_BIN, "-y", *inputs,
               "-filter_complex", filter_complex,
               "-map", "[vout]", "-map", f"{n}:a", "-af", af,
               "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
               "-shortest", out_path, "-loglevel", "error"]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=FFMPEG_TIMEOUT)
        if r.returncode != 0:
            return {"ok": False, "path": None, "duration_sec": None,
                    "error": f"ffmpeg_assemblage_multi: {r.stderr[:400]}"}
        if not os.path.exists(out_path) or os.path.getsize(out_path) < 4096:
            return {"ok": False, "path": None, "duration_sec": None, "error": "video_finale_vide_ou_absente"}
        final_dur = _probe_duration(out_path)
        return {"ok": True, "path": out_path, "duration_sec": final_dur, "error": None}
    except subprocess.TimeoutExpired:
        return {"ok": False, "path": None, "duration_sec": None, "error": "ffmpeg_timeout"}
    except Exception as e:
        return {"ok": False, "path": None, "duration_sec": None, "error": f"{type(e).__name__}: {e}"}
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def generate_video_for_article(title: str, article_text: str, image_url: str,
                                out_dir: str, out_name: str, voice: str = None,
                                fact_id: str = "", on_stage=None,
                                narration_mode: str = "solo",
                                image_urls: list = None) -> dict:
    """Pipeline complet : narration + image(s) de couverture + assemblage.
    Retourne {ok, video_path, duration_sec, error}. Nettoie systematiquement
    les fichiers de travail intermediaires (image(s), audio brut), ne laisse
    que la video finale dans out_dir.

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
    de blocage de la video pour une valeur mal formee venue de l'appelant.

    `image_urls` (2026-08-24, montage multi-images) : liste ORDONNEE de
    candidats reels (voir illustrate._candidate_images -- article_retenu puis
    contextes par fiabilite), `image_url` etant deja le premier element de
    cette liste par construction cote appelant. Si au moins
    MIN_IMAGES_FOR_MULTI (2) images sont effectivement telechargeables,
    utilise assemble_video_multi() (zoom + transitions entre plusieurs
    photos) ; sinon (liste absente, vide, ou un seul telechargement reussi)
    retombe SANS accroc sur le pipeline mono-image historique via
    `image_url` seul -- jamais de blocage pour un dossier pauvre en images."""
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
        # Multi-images (2026-08-24) : tente d'abord les candidats reels du
        # dossier si fournis. `image_urls` porte deja `image_url` comme
        # premier element cote appelant (orchestration/video.py) -- ne PAS
        # re-telecharger `image_url` separement si la liste suffit.
        multi_image_paths = []
        if image_urls:
            multi_image_paths = fetch_images(image_urls, work_dir)

        _stage("assemblage")
        out_path = os.path.join(out_dir, out_name)
        if len(multi_image_paths) >= MIN_IMAGES_FOR_MULTI:
            res = assemble_video_multi(multi_image_paths, audio_path, out_path,
                                        fact_id=fact_id, title=title)
            if res["ok"]:
                return {"ok": True, "video_path": out_path, "duration_sec": res["duration_sec"], "error": None}
            # Echec du montage multi (ex. ffmpeg en erreur sur une image
            # corrompue) -> repli sur le mono-image plutot que d'echouer la
            # video entiere, meme philosophie que le reste de ce module.
            print(f"[video] montage multi-images echoue ({res['error']}), repli mono-image")

        # Mono-image (comportement historique, et repli du multi-images) :
        # reutilise la 1ere image deja telechargee ci-dessus si possible,
        # sinon retelecharge `image_url` seul.
        image_path = multi_image_paths[0] if multi_image_paths else fetch_cover_image(image_url, work_dir)
        if not image_path:
            return {"ok": False, "video_path": None, "duration_sec": None,
                    "error": "image_de_couverture_indisponible"}
        direction = _zoom_direction(fact_id, title)
        res = assemble_video(image_path, audio_path, out_path, zoom_direction=direction)
        if not res["ok"]:
            return {"ok": False, "video_path": None, "duration_sec": None, "error": res["error"]}
        return {"ok": True, "video_path": out_path, "duration_sec": res["duration_sec"], "error": None}
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)
