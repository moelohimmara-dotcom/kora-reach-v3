"""Batch catégorisation — applique suggested_category à tous les articles actuels sans catégorie.

Usage:
  python scripts/batch_categorize_existing.py          # local (sqlite)
  ssh kora@213.156.135.139 'python3 /opt/kora-reach/scripts/batch_categorize_existing.py'

Idempotent : ne touche que les faits où suggested_category IS NULL/''.
"""
import os, sys, json, time
# Assure le bon import path (script dans scripts/ ou /opt/kora-reach/scripts/)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# Si exécuté depuis /opt/kora-reach, le path est déjà bon
if "/opt/kora-reach" not in sys.path:
    sys.path.insert(0, "/opt/kora-reach")

import core.db as db
from editorial.hitl_store import list_facts, set_suggested_category
from publishing.transmit import _classify_category

def run(dry_run=False):
    con, mode = db.conn()
    cur = con.cursor()
    try:
        # Liste les faits sans catégorie (hitl_facts est la source de vérité)
        # On utilise list_facts() pour rester agnostique du backend, puis on filtre
        # Mais pour le comptage, on fait une requête directe (plus rapide)
        ph = "%s" if mode == "postgres" else "?"
        cur.execute(f"SELECT COUNT(*) FROM hitl_facts WHERE suggested_category IS NULL OR suggested_category=''")
        todo = cur.fetchone()[0]
        cur.execute(f"SELECT COUNT(*) FROM hitl_facts")
        total = cur.fetchone()[0]
        print(f"[batch] total={total} à_categoriser={todo} mode={mode} dry_run={dry_run}")
        if todo == 0:
            print("[batch] rien à faire")
            return
        # Récupère les faits concernés (on passe par list_facts pour avoir le décodage champion/article)
        # Mais list_facts renvoie tous les faits ; on filtre en Python
        facts = list_facts() if 'list_facts' in globals() else []
        # Fallback si list_facts non importé : requête directe
        if not facts:
            from editorial.hitl_store import list_facts as lf
            facts = lf()
        target = [f for f in facts if not (f.get("suggested_category") or "").strip()]
        print(f"[batch] cible python filtrée: {len(target)}")
        done = 0
        for f in target:
            fid = f.get("fact_id")
            champ = f.get("champion") or {}
            if isinstance(champ, str):
                try:
                    champ = json.loads(champ)
                except Exception:
                    champ = {}
            title = champ.get("title") or f.get("title") or ""
            article = f.get("article") or f.get("final_text") or ""
            n_sources = f.get("n_sources") or 1
            # Classification (LLM si dispo, sinon mécanique)
            cat = _classify_category(title, article, n_sources=n_sources)
            if dry_run:
                print(f"  [dry] {fid[:8]} -> {cat} | {title[:60]}")
            else:
                set_suggested_category(fid, cat)
                print(f"  [ok] {fid[:8]} -> {cat}")
                done += 1
                time.sleep(0.05)  # évite de saturer le LLM
        print(f"[batch] terminé : {done}/{len(target)} catégorisés")
    finally:
        try:
            con.close()
        except Exception:
            pass

if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    run(dry_run=dry)
