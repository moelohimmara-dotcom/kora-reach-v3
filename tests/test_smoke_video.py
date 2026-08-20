#!/usr/bin/env python3
"""test_smoke_video.py — verifie orchestration.video (glue entre le pipeline
video pur, generation/video.py, et le stockage editorial) de bout en bout :
transitions de statut (None -> generating -> done/error), garde anti-relance,
gestion d'un fact_id inconnu. Le pipeline REEL (narration + images + ffmpeg,
couteux et dependant du reseau) est mocke ici -- valide separement en
conditions reelles avant integration (voir commentaires de generation/
narrate.py et generation/video.py).

Usage : python3 tests/test_smoke_video.py
"""
import sys
import os
import time
import types

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO_ROOT)

for _mod, _attr, _val in (
    ("feedparser", "parse", lambda *a, **k: types.SimpleNamespace(entries=[], bozo=1)),
    ("trafilatura", "extract", lambda *a, **k: ""),
):
    try:
        __import__(_mod)
    except ImportError:
        stub = types.ModuleType(_mod)
        setattr(stub, _attr, _val)
        sys.modules[_mod] = stub

DB_FILE = os.path.join(REPO_ROOT, "reach_state.db")


def main():
    if os.path.exists(DB_FILE):
        print(f"[abandon] {DB_FILE} existe deja -- ce test ne s'execute que "
              f"sur une base SQLite locale fraiche.")
        return 1

    import editorial.hitl_store as hitl_store
    import orchestration.video as vid

    try:
        fid = hitl_store.upsert_fact({
            "champion": {"title": "Sujet video test", "source": "test", "url": "http://x/1"},
            "contexts": [], "article": "Ceci est un article de test suffisamment long pour "
                "depasser le seuil minimal de caracteres requis pour declencher une "
                "generation video complete, avec plusieurs phrases distinctes.",
            "image": "", "image_meta": {}, "gen_model": "test", "n_sources": 1,
        })

        def fake_generate(title, article_text, out_dir, out_name, n_images=3, voice=None, fact_id=""):
            return {"ok": True, "video_path": os.path.join(out_dir, out_name),
                    "duration_sec": 42.0, "error": None}
        vid.gvideo.generate_video_for_article = fake_generate

        failed = []

        st0 = vid.video_status(fid)
        if not (st0["ok"] and st0["video_status"] is None):
            failed.append(f"etat initial inattendu: {st0}")
        else:
            print("OK   etat initial video_status=None")

        res = vid.start_video_generation(fid)
        if not (res["ok"] and res["status"] == "generating"):
            failed.append(f"start_video_generation inattendu: {res}")
        else:
            print("OK   start_video_generation demarre correctement")

        st1 = vid.video_status(fid)
        if st1["video_status"] != "generating":
            failed.append(f"statut generating attendu immediatement: {st1}")
        else:
            print("OK   statut 'generating' visible immediatement (avant fin du thread)")

        time.sleep(1.5)
        st2 = vid.video_status(fid)
        if st2["video_status"] != "done" or st2["video_path"] != f"{fid}.mp4" or st2["video_duration_sec"] != 42.0:
            failed.append(f"transition finale inattendue: {st2}")
        else:
            print("OK   transition generating -> done, path et duree corrects")

        hitl_store.set_video_status(fid, "generating")
        res2 = vid.start_video_generation(fid)
        if res2["ok"] or res2["error"] != "generation_deja_en_cours":
            failed.append(f"garde anti-relance inattendue: {res2}")
        else:
            print("OK   relance pendant generation en cours correctement refusee")

        res3 = vid.start_video_generation("fact_inexistant")
        if res3["ok"] or res3["error"] != "fact_introuvable":
            failed.append(f"fact_id inconnu mal gere: {res3}")
        else:
            print("OK   fact_id inconnu gere proprement")

        print()
        if failed:
            print(f"{len(failed)} ECHEC(S):")
            for f in failed:
                print(f"  - {f}")
            return 1
        print("TOUS LES TESTS D'ORCHESTRATION VIDEO PASSENT")
        return 0
    finally:
        try:
            os.remove(DB_FILE)
        except OSError:
            pass


if __name__ == "__main__":
    sys.exit(main())
