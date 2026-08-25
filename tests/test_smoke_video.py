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
    import core.db as db

    try:
        fid = hitl_store.upsert_fact({
            "champion": {"title": "Sujet video test", "source": "test", "url": "http://x/1"},
            "sources_secondaires": [], "article": "Ceci est un article de test suffisamment long pour "
                "depasser le seuil minimal de caracteres requis pour declencher une "
                "generation video complete, avec plusieurs phrases distinctes.",
            "image": "http://x/couverture.jpg", "image_meta": {"provider": "source"},
            "gen_model": "test", "n_sources": 1,
        })

        def fake_generate(title, article_text, image_url, out_dir, out_name, voice=None, fact_id="", on_stage=None):
            if on_stage:
                on_stage("narration")
                on_stage("image")
                on_stage("assemblage")
            if not image_url:
                return {"ok": False, "video_path": None, "duration_sec": None,
                        "error": "image_de_couverture_indisponible"}
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
        if st2.get("video_stage") is not None:
            failed.append(f"video_stage aurait du redevenir None une fois la video terminee : {st2.get('video_stage')}")
        else:
            print("OK   video_stage redevient None une fois la generation terminee (done)")

        # 2026-08-21 : on_complete() doit etre appele UNE FOIS a la toute
        # fin (succes ou echec) -- utilise par server.py pour liberer le
        # verrou d'exclusivite video des que le thread se termine.
        fid2 = hitl_store.upsert_fact({
            "champion": {"title": "Sujet on_complete", "source": "test", "url": "http://x/3"},
            "sources_secondaires": [], "article": "Article suffisamment long pour depasser le seuil "
                "minimal de caracteres requis, plusieurs phrases distinctes ici.",
            "image": "http://x/couverture2.jpg", "image_meta": {"provider": "source"},
            "gen_model": "test", "n_sources": 1,
        })
        _complete_calls = {"n": 0}
        vid.start_video_generation(fid2, on_complete=lambda: _complete_calls.__setitem__("n", _complete_calls["n"] + 1))
        time.sleep(1.5)
        if _complete_calls["n"] != 1:
            failed.append(f"on_complete() aurait du etre appele exactement 1 fois, obtenu : {_complete_calls['n']}")
        else:
            print("OK   on_complete() est appele exactement une fois a la fin de la generation")

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

        # 2026-08-21 : un fait sans aucune image de couverture (dossier sans
        # source illustree, cas limite) doit etre refuse explicitement, PAS
        # tenter une generation video sans image.
        fid_sans_image = hitl_store.upsert_fact({
            "champion": {"title": "Sujet sans image", "source": "test", "url": "http://x/2"},
            "sources_secondaires": [], "article": "Article suffisamment long pour depasser le seuil "
                "minimal de caracteres requis pour la generation video, plusieurs phrases.",
            "image": "", "image_meta": {}, "gen_model": "test", "n_sources": 1,
        })
        res4 = vid.start_video_generation(fid_sans_image)
        if res4["ok"] or res4["error"] != "image_de_couverture_absente":
            failed.append(f"fait sans image de couverture mal gere: {res4}")
        else:
            print("OK   generation video refusee proprement si aucune image de couverture")

        # ---- Regression de revue de code (3e passage) : champion corrompu ----
        # ne doit JAMAIS lever une exception non rattrapee -- avant ce
        # correctif, json.loads(champion) non protege plantait ici, ce qui
        # (cote server.py) aurait laisse le verrou d'exclusivite video pris
        # pour toujours (verrou acquis AVANT cet appel).
        fid_corrompu = hitl_store.upsert_fact({
            "champion": {"title": "Sera corrompu", "source": "test", "url": "http://x/4"},
            "sources_secondaires": [], "article": "Article suffisamment long pour depasser le seuil "
                "minimal de caracteres requis, plusieurs phrases distinctes bien presentes ici.",
            "image": "http://x/couverture4.jpg", "image_meta": {"provider": "source"},
            "gen_model": "test", "n_sources": 1,
        })
        con, mode = db.conn()
        cur = con.cursor()
        ph = db.placeholder()
        cur.execute(f"UPDATE hitl_facts SET champion='{{not valid json' WHERE fact_id={ph}", (fid_corrompu,))
        con.commit()
        con.close()
        try:
            res5 = vid.start_video_generation(fid_corrompu)
            if res5.get("ok") is not True and res5.get("ok") is not False:
                failed.append(f"champion corrompu: reponse inattendue (ni succes ni echec propre) : {res5}")
            else:
                print(f"OK   champion corrompu gere sans exception non rattrapee (ok={res5.get('ok')})")
        except Exception as e:
            failed.append(f"champion corrompu a leve une exception NON rattrapee (exactement le bug corrige) : {type(e).__name__}: {e}")

        # ---- list_videos() : renvoie bien les faits ayant une video, non vide ----
        # (fid2, pas fid : fid a ete reutilise plus haut pour tester la garde
        # anti-relance, son video_status a ete force a 'generating' entre-temps)
        vids = vid.list_videos()
        vid_ids = {v["fact_id"] for v in vids}
        if fid2 not in vid_ids:
            failed.append(f"list_videos() aurait du inclure {fid2} (video_status='done') : {vid_ids}")
        else:
            print("OK   list_videos() retrouve bien les faits ayant une video (requete SQL directe)")
        done_entry = next((v for v in vids if v["fact_id"] == fid2), None)
        if not done_entry or done_entry.get("video_status") != "done" or not done_entry.get("title"):
            failed.append(f"list_videos() : entree incomplete pour {fid2} : {done_entry}")
        else:
            print("OK   list_videos() renvoie titre + statut video corrects")

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
