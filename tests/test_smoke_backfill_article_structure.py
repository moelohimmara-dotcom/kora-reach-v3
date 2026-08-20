#!/usr/bin/env python3
"""test_smoke_backfill_article_structure.py — verifie scripts/
backfill_article_structure.py (rattrapage historique de la structure des
articles) : detection exacte des candidats, aucune ecriture en mode apercu,
reparation reelle en --apply (filet mecanique quand le LLM est mocke a
None), un article deja EDITED reste eligible (aucune retouche manuelle
n'est jamais touchee -- voir docstring du script pour la preuve), un
article deja bien structure n'est jamais modifie, idempotence (relancer ne
retouche pas ce qui a deja ete corrige).

Usage : python3 tests/test_smoke_backfill_article_structure.py
"""
import sys
import os
import io
import contextlib
import types

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO_ROOT)
sys.path.insert(0, os.path.join(REPO_ROOT, "scripts"))

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

BIEN = """# Article deja bon

Chapô en deux ou trois phrases qui pose le contexte factuel de l'article de presse.

Premier paragraphe du corps avec plusieurs phrases distinctes et du contenu substantiel pour depasser le seuil requis par paragraphe.

Deuxieme paragraphe du corps avec plusieurs phrases distinctes et du contenu substantiel pour depasser le seuil requis par paragraphe.

Troisieme paragraphe du corps avec plusieurs phrases distinctes et du contenu substantiel pour depasser le seuil requis par paragraphe.

Quatrieme paragraphe du corps avec plusieurs phrases distinctes et du contenu substantiel pour depasser le seuil requis par paragraphe.

Par La Rédaction"""

MAL = ("# Article mal structure\n\n"
       + " ".join([f"Phrase numero {i} qui contient plusieurs mots pour simuler du contenu reel d'article de presse en Guinee."
                    for i in range(1, 40)])
       + "\n\nPar La Rédaction")


def main():
    if os.path.exists(DB_FILE):
        print(f"[abandon] {DB_FILE} existe deja -- ce test ne s'execute que sur une base fraiche.")
        return 1

    import editorial.hitl_store as hitl_store
    import core.db as db
    import generation.writer as writer
    import backfill_article_structure as backfill

    try:
        failed = []
        backfill.LLM_CALL_SPACING_SEC = 0

        fid_bon = hitl_store.upsert_fact({
            "champion": {"title": "Article deja bon", "source": "test", "url": "http://x/1"},
            "contexts": [], "article": BIEN, "image": "", "image_meta": {}, "gen_model": "test", "n_sources": 1,
        })
        fid_mal = hitl_store.upsert_fact({
            "champion": {"title": "Article mal structure", "source": "test", "url": "http://x/2"},
            "contexts": [], "article": MAL, "image": "", "image_meta": {}, "gen_model": "test", "n_sources": 1,
        })
        # Marque le mauvais comme EDITED -- doit rester eligible (aucune
        # retouche manuelle reelle n'existe ici : final_text/edited_text
        # vivent dans une table separee, jamais dans hitl_facts.article).
        con, mode = db.conn()
        cur = con.cursor()
        ph = db.placeholder()
        cur.execute(f"UPDATE hitl_facts SET status='EDITED' WHERE fact_id={ph}", (fid_mal,))
        con.commit()
        con.close()

        # ---- Apercu (sans --apply) ----
        writer.simple_completion = lambda sysp, usrp, max_tokens=2600: None
        buf = io.StringIO()
        sys.argv = ["backfill_article_structure.py"]
        with contextlib.redirect_stdout(buf):
            backfill.main()
        out = buf.getvalue()
        if "1 article(s)" not in out or fid_mal not in out or fid_bon in out:
            failed.append(f"apercu: detection incorrecte -- {out[:300]}")
        else:
            print("OK   apercu detecte exactement le bon candidat (EDITED inclus)")

        row = hitl_store.get_fact(fid_mal)
        if row["article"] != MAL:
            failed.append("apercu: une ecriture a eu lieu alors qu'aucun --apply n'a ete passe")
        else:
            print("OK   aucune ecriture en base en mode apercu")

        # ---- Application reelle (--apply), LLM mocke a None -> filet mecanique ----
        buf2 = io.StringIO()
        sys.argv = ["backfill_article_structure.py", "--apply"]
        with contextlib.redirect_stdout(buf2):
            backfill.main()
        out2 = buf2.getvalue()
        if "mecanique" not in out2:
            failed.append(f"--apply: reparation mecanique attendue (LLM mocke), sortie: {out2[:300]}")
        else:
            print("OK   reparation mecanique appliquee (repli LLM indisponible)")

        row_mal = hitl_store.get_fact(fid_mal)
        if not writer._structure_ok(row_mal["article"]):
            failed.append(f"--apply: article mal structure toujours en echec apres correction -- {row_mal['article'][:200]}")
        else:
            print("OK   article mal structure corrige en base")

        row_bon = hitl_store.get_fact(fid_bon)
        if row_bon["article"] != BIEN:
            failed.append("--apply: article deja bon modifie a tort (ne devrait JAMAIS etre touche)")
        else:
            print("OK   article deja bon inchange")

        # ---- Idempotence ----
        buf3 = io.StringIO()
        with contextlib.redirect_stdout(buf3):
            backfill.main()
        out3 = buf3.getvalue()
        if "0 article(s)" not in out3:
            failed.append(f"idempotence: un 2e passage devrait ne rien trouver a corriger -- {out3[:300]}")
        else:
            print("OK   idempotent (un 2e passage ne retouche rien)")

        print()
        if failed:
            print(f"{len(failed)} ECHEC(S):")
            for f in failed:
                print(f"  - {f}")
            return 1
        print("TOUS LES TESTS DU RATTRAPAGE STRUCTURE PASSENT")
        return 0
    finally:
        try:
            os.remove(DB_FILE)
        except OSError:
            pass


if __name__ == "__main__":
    sys.exit(main())
