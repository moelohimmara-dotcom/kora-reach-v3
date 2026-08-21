#!/usr/bin/env python3
"""test_smoke_video_lock.py — verrouille le verrou d'exclusivite video
(server.py, 2026-08-21, demande explicite) : pendant qu'une video se
genere, aucun cycle ni regeneration d'article ne doit demarrer, et
inversement une generation video ne demarre pas si un cycle tourne DEJA NI
si une AUTRE video est deja en cours (un seul job video a la fois, refuse
explicitement -- pas de file d'attente). Teste directement les fonctions
factorisees (_video_busy/_start_video_lock/_release_video_lock_state) sans
simuler de vraie requete HTTP -- coherent avec le reste de la suite, ce
depot n'a pas d'infrastructure de test HTTP.

Usage : python3 tests/test_smoke_video_lock.py
"""
import sys
import os
import threading
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
        print(f"[abandon] {DB_FILE} existe deja -- ce test ne s'execute que sur une base fraiche.")
        return 1

    import server

    try:
        failed = []

        # ---- 1. Etat initial : rien en cours ----
        if server._video_busy() is not None:
            failed.append(f"_video_busy() aurait du etre None au demarrage : {server._video_busy()}")
        else:
            print("OK   _video_busy() est None quand rien ne tourne")

        # ---- 2. Pose du verrou -> _video_busy() detecte immediatement ----
        server._start_video_lock("fact_test1", "Titre de test")
        busy = server._video_busy()
        if not busy or busy.get("error") != "video_en_cours":
            failed.append(f"_video_busy() aurait du detecter le verrou pose : {busy}")
        else:
            print("OK   _video_busy() detecte le verrou juste apres _start_video_lock()")

        if not (server.VIDEO_LOCK["running"] and server.VIDEO_LOCK["fact_id"] == "fact_test1"
                and server.VIDEO_LOCK["title"] == "Titre de test" and server.VIDEO_LOCK["started_at"]):
            failed.append(f"VIDEO_LOCK mal renseigne apres _start_video_lock() : {server.VIDEO_LOCK}")
        else:
            print("OK   VIDEO_LOCK renseigne correctement (fact_id/titre/horodatage)")

        # ---- 3. Liberation -> _video_busy() redevient None, etat nettoye ----
        server._release_video_lock_state()
        if server._video_busy() is not None:
            failed.append(f"_video_busy() aurait du redevenir None apres liberation : {server._video_busy()}")
        else:
            print("OK   _release_video_lock_state() libere correctement le verrou")
        if any(server.VIDEO_LOCK[k] is not None and server.VIDEO_LOCK[k] is not False
               for k in ("fact_id", "title", "started_at")) or server.VIDEO_LOCK["running"]:
            failed.append(f"VIDEO_LOCK aurait du etre entierement remis a zero : {server.VIDEO_LOCK}")
        else:
            print("OK   VIDEO_LOCK entierement remis a zero apres liberation")

        # ---- 4. Regression precise : une 2e demande video pendant qu'une
        # 1re tourne doit etre refusee avec un message clair (pas de file
        # d'attente, choix delibere -- voir le message renvoye). ----
        server._start_video_lock("fact_en_cours", "Article deja en cours")
        try:
            busy2 = server._video_busy()
            if not busy2 or "detail" not in busy2:
                failed.append(f"_video_busy() aurait du fournir un message clair pour une 2e demande : {busy2}")
            elif "déjà en cours" not in busy2["detail"] and "deja en cours" not in busy2["detail"].lower():
                failed.append(f"message peu clair pour une 2e video pendant qu'une 1re tourne : {busy2}")
            else:
                print("OK   une 2e demande video pendant qu'une 1re tourne est refusee avec un message clair")
        finally:
            server._release_video_lock_state()

        # ---- 5. Le verrou video EXISTE et est distinct de LAST_CYCLE (les
        # deux mecanismes cohabitent, chacun protege l'autre) ----
        if server.VIDEO_LOCK is server.LAST_CYCLE:
            failed.append("VIDEO_LOCK et LAST_CYCLE ne devraient PAS etre le meme objet (verrous distincts)")
        else:
            print("OK   VIDEO_LOCK est un verrou distinct de LAST_CYCLE (cycle vs video)")

        # ---- 6. Regression precise de revue de code (2e passage) : verifier
        # PUIS poser le verrou en une SEULE section critique -- deux threads
        # qui appellent _try_acquire_video_lock() en meme temps ne doivent
        # JAMAIS l'obtenir tous les deux (l'ancien check-puis-set separe
        # laissait une fenetre de course). Verifie avec de vrais threads, pas
        # juste des appels sequentiels. ----
        server._release_video_lock_state()
        results = []
        barrier = threading.Barrier(2)

        def _attempt(n):
            barrier.wait()  # synchronise le depart des 2 threads au maximum
            r = server._try_acquire_video_lock(f"fact_course_{n}", f"Titre {n}")
            results.append(r)

        threads = [threading.Thread(target=_attempt, args=(i,)) for i in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=5)
        acquired = [r for r in results if r is None]
        refused = [r for r in results if r is not None]
        if len(acquired) != 1 or len(refused) != 1:
            failed.append(f"exactement 1 des 2 threads aurait du acquerir le verrou, obtenu : acquis={len(acquired)}, refuses={len(refused)}")
        else:
            print("OK   _try_acquire_video_lock() est atomique : 2 threads concurrents -> exactement 1 seul acquiert le verrou")
        server._release_video_lock_state()

        print()
        if failed:
            print(f"{len(failed)} ECHEC(S):")
            for f in failed:
                print(f"  - {f}")
            return 1
        print("TOUS LES TESTS DU VERROU VIDEO PASSENT")
        return 0
    finally:
        try:
            server._release_video_lock_state()
        except Exception:
            pass
        try:
            os.remove(DB_FILE)
        except OSError:
            pass


if __name__ == "__main__":
    sys.exit(main())
