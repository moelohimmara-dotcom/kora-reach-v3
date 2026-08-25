#!/usr/bin/env python3
"""test_smoke_regenerate.py — verifie orchestration.reach_agent.regenerate()
de bout en bout (base SQLite locale reelle, LLM mocke). Cette fonction a ete
deplacee depuis generation/writer.py lors du refactor monolithe modulaire
(2026-08-20) -- elle orchestrait deja deux domaines (generation + stockage
editorial) depuis le mauvais module ; ce test protege son comportement pour
tout futur remaniement.

Usage : python3 tests/test_smoke_regenerate.py
"""
import sys
import os
import json
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
    # Base SQLite locale ISOLEE pour ce test : jamais reach_state.db d'un
    # environnement reel (evite d'ecrire dans une vraie base par accident).
    if os.path.exists(DB_FILE):
        print(f"[abandon] {DB_FILE} existe deja -- ce test ne s'execute que "
              f"sur une base SQLite locale fraiche, pour ne jamais toucher a "
              f"une vraie base. Supprimez-le vous-meme si c'est un fichier de "
              f"test perime, ou lancez ce script dans un environnement propre.")
        return 1

    import editorial.hitl_store as hitl_store
    import orchestration.reach_agent as reach_agent

    try:
        fid = hitl_store.upsert_fact({
            "article_retenu": {"title": "Sujet test", "source": "test", "url": "http://x/1"},
            "sources_secondaires": [], "article": "ancien texte", "image": "http://old.img",
            "image_meta": {"provider": "loremflickr"}, "gen_model": "test", "n_sources": 1,
        })

        calls = {}

        def fake_write_article(fact, dry_run=None, should_cancel=None):
            calls["args"] = dict(fact)
            return {"article": "NOUVEL article regenere", "model": "fake-model", "status": "ok",
                    "image": "http://new.img", "image_meta": {"provider": "pollinations"},
                    "critique_issues": 2}

        reach_agent.write_article = fake_write_article

        failed = []

        # Sans suggestion d'angle
        res = reach_agent.regenerate(fid, suggestion=None)
        if res["fact_id"] != fid or res["article"] != "NOUVEL article regenere" or res["suggestion_applied"] != "neutre":
            failed.append(f"regeneration sans angle: resultat inattendu {res}")
        elif "_regen_angle" in calls["args"]:
            failed.append("_regen_angle ne devrait pas etre injecte sans suggestion")
        else:
            print("OK   regeneration sans angle -- fact_id/article/modele corrects")

        # Persistance en base (article ET image_meta -- bug corrige 2026-08-19)
        row = hitl_store.get_fact(fid)
        article_persisted = row["article"] if not isinstance(row, dict) else row.get("article")
        img_meta_raw = row["image_meta"] if not isinstance(row, dict) else row.get("image_meta")
        img_meta = img_meta_raw if isinstance(img_meta_raw, dict) else json.loads(img_meta_raw or "{}")
        if article_persisted != "NOUVEL article regenere":
            failed.append(f"article non persiste: {article_persisted}")
        elif img_meta.get("provider") != "pollinations":
            failed.append(f"image_meta non mis a jour en base: {img_meta}")
        else:
            print("OK   article ET image_meta persistes en base apres regeneration")

        # Avec suggestion d'angle
        res2 = reach_agent.regenerate(fid, suggestion="economique")
        if not res2.get("angle") or res2["suggestion_applied"] != "economique":
            failed.append(f"angle non applique: {res2}")
        elif calls["args"].get("_regen_angle") != res2["angle"]:
            failed.append("l'angle calcule n'a pas ete transmis a write_article")
        else:
            print("OK   consigne d'angle transmise a write_article")

        # fact_id inconnu
        res3 = reach_agent.regenerate("fact_id_inexistant", suggestion=None)
        if res3.get("error") != "fact_introuvable":
            failed.append(f"fact_id inconnu mal gere: {res3}")
        else:
            print("OK   fact_id inconnu -> erreur propre, pas de crash")

        print()
        if failed:
            print(f"{len(failed)} ECHEC(S):")
            for f in failed:
                print(f"  - {f}")
            return 1
        print("TOUS LES TESTS DE regenerate() PASSENT")
        return 0
    finally:
        try:
            os.remove(DB_FILE)
        except OSError:
            pass


if __name__ == "__main__":
    sys.exit(main())
