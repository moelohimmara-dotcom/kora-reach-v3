#!/usr/bin/env python3
"""test_smoke_video_pipeline.py — verifie generation/video.py (pipeline PUR,
aucun acces DB) en conditions REELLES (ffmpeg execute pour de vrai, pas
mocke) : pipeline simplifie 2026-08-21 a UNE SEULE image reelle (plus de
diaporama Pollinations, voir orchestration/video.py pour la glue DB).
Genere ses propres fixtures (image de test + tonalite audio) via ffmpeg lui-
meme -- aucun fichier binaire a committer.

Usage : python3 tests/test_smoke_video_pipeline.py
"""
import sys
import os
import subprocess
import tempfile
import shutil

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO_ROOT)

import generation.video as video  # noqa: E402


def _make_test_image(path: str):
    """Image de test 320x180 (motif ffmpeg testsrc), jamais de fichier a committer."""
    subprocess.run(
        [video.FFMPEG_BIN, "-y", "-f", "lavfi", "-i", "testsrc=size=320x180:duration=1",
         "-frames:v", "1", path, "-loglevel", "error"],
        check=True, timeout=30)


def _make_test_audio(path: str, seconds: float = 2.0):
    """Tonalite audio de test (silence + sinus), aucun fichier a committer."""
    subprocess.run(
        [video.FFMPEG_BIN, "-y", "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}",
         "-c:a", "libmp3lame", path, "-loglevel", "error"],
        check=True, timeout=30)


def main():
    failed = []

    if not video.ffmpeg_available():
        print("[abandon] ffmpeg/ffprobe introuvables sur cette machine -- ce test necessite "
              "les deux (voir generation/video.py, KORA_FFMPEG_BIN/KORA_FFPROBE_BIN).")
        return 1

    # ---- 1. Determinisme de la direction de zoom ----
    d1 = video._zoom_direction("fact_abc123", "Titre")
    d2 = video._zoom_direction("fact_abc123", "Titre different")  # meme fact_id -> meme sens
    if d1 != d2:
        failed.append(f"_zoom_direction non deterministe pour un meme fact_id : {d1} != {d2}")
    else:
        print(f"OK   _zoom_direction deterministe par fact_id (obtenu : {d1!r})")
    if d1 not in ("in", "out"):
        failed.append(f"_zoom_direction a renvoye une valeur inattendue : {d1!r}")
    directions = {video._zoom_direction(f"fact_{i}", "") for i in range(20)}
    if directions != {"in", "out"}:
        failed.append(f"_zoom_direction ne semble jamais alterner sur 20 fact_id varies : {directions}")
    else:
        print("OK   _zoom_direction alterne bien avant/arriere selon le fait")

    work = tempfile.mkdtemp(prefix="kora_test_video_")
    try:
        img_path = os.path.join(work, "cover.jpg")
        audio_path = os.path.join(work, "voix.mp3")
        _make_test_image(img_path)
        _make_test_audio(audio_path, seconds=2.0)

        # ---- 2. fetch_cover_image() via file:// (pas de reseau requis) ----
        file_url = "file:///" + img_path.replace("\\", "/").lstrip("/")
        fetched = video.fetch_cover_image(file_url, os.path.join(work, "fetch_out"))
        if not fetched or not os.path.exists(fetched):
            failed.append(f"fetch_cover_image a echoue sur une URL file:// valide : {fetched!r}")
        else:
            print("OK   fetch_cover_image telecharge correctement (URL file://)")

        empty = video.fetch_cover_image("", os.path.join(work, "fetch_empty"))
        if empty != "":
            failed.append(f"fetch_cover_image aurait du renvoyer '' pour une URL vide : {empty!r}")
        else:
            print("OK   fetch_cover_image gere proprement une URL vide")

        # ---- 3. assemble_video() EN CONDITIONS REELLES (ffmpeg execute) ----
        out_path = os.path.join(work, "final_in.mp4")
        res_in = video.assemble_video(img_path, audio_path, out_path, zoom_direction="in")
        if not res_in["ok"]:
            failed.append(f"assemble_video (zoom in) a echoue : {res_in['error']}")
        else:
            print(f"OK   assemble_video (zoom in) reussit, duree={res_in['duration_sec']:.2f}s")
            if abs(res_in["duration_sec"] - 2.0) > 0.3:
                failed.append(f"duree de la video finale trop eloignee de l'audio (2.0s attendu) : {res_in['duration_sec']}")
            else:
                print("OK   duree de la video finale correspond a l'audio (a 0.3s pres)")
            if not os.path.exists(out_path) or os.path.getsize(out_path) < 4096:
                failed.append("fichier video final absent ou anormalement petit")

        out_path2 = os.path.join(work, "final_out.mp4")
        res_out = video.assemble_video(img_path, audio_path, out_path2, zoom_direction="out")
        if not res_out["ok"]:
            failed.append(f"assemble_video (zoom out) a echoue : {res_out['error']}")
        else:
            print("OK   assemble_video (zoom out) reussit aussi (les deux sens fonctionnent)")

        # ---- 3bis. Regression de revue de code : audio TRES court (<=
        # FADE_SEC) ne doit pas faire chevaucher fondu d'ouverture et de
        # fermeture (le calcul reduit desormais le fondu proportionnellement).
        short_audio = os.path.join(work, "voix_courte.mp3")
        _make_test_audio(short_audio, seconds=0.5)
        out_short = os.path.join(work, "final_court.mp4")
        res_short = video.assemble_video(img_path, short_audio, out_short, zoom_direction="in")
        if not res_short["ok"]:
            failed.append(f"assemble_video sur un audio tres court (0.5s) a echoue : {res_short['error']}")
        else:
            print("OK   assemble_video gere un audio tres court sans chevaucher les fondus (0.5s)")

        # ---- 4. Garde-fous : image manquante / inexistante ----
        res_noimg = video.assemble_video("", audio_path, os.path.join(work, "x.mp4"))
        if res_noimg["ok"] or res_noimg["error"] != "image_de_couverture_absente":
            failed.append(f"assemble_video sans image aurait du refuser proprement : {res_noimg}")
        else:
            print("OK   assemble_video refuse proprement une image absente")

        res_badimg = video.assemble_video(os.path.join(work, "n_existe_pas.jpg"), audio_path,
                                           os.path.join(work, "y.mp4"))
        if res_badimg["ok"] or res_badimg["error"] != "image_de_couverture_absente":
            failed.append(f"assemble_video avec un fichier image inexistant aurait du refuser : {res_badimg}")
        else:
            print("OK   assemble_video refuse proprement un fichier image inexistant")

        # ---- 5. generate_video_for_article() : narration mockee (reseau), le
        # reste REEL (fetch_cover_image en file://, assemble_video ffmpeg) ----
        import generation.narrate as narrate
        _orig_narrate = narrate.narrate_to_file

        def _fake_narrate(text, out_path, voice=None):
            shutil.copy(audio_path, out_path)
            return {"ok": True, "path": out_path, "error": None}
        narrate.narrate_to_file = _fake_narrate
        try:
            out_dir = os.path.join(work, "final_pipeline")
            res_full = video.generate_video_for_article(
                title="Sujet test", article_text="Un article de test.",
                image_url=file_url, out_dir=out_dir, out_name="test.mp4",
                fact_id="fact_pipeline_test")
            if not res_full["ok"]:
                failed.append(f"generate_video_for_article (pipeline complet) a echoue : {res_full['error']}")
            else:
                print("OK   generate_video_for_article (pipeline complet) reussit de bout en bout")
        finally:
            narrate.narrate_to_file = _orig_narrate

        print()
        if failed:
            print(f"{len(failed)} ECHEC(S):")
            for f in failed:
                print(f"  - {f}")
            return 1
        print("TOUS LES TESTS DU PIPELINE VIDEO (image unique) PASSENT")
        return 0
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
