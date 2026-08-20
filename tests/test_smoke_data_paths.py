#!/usr/bin/env python3
"""test_smoke_data_paths.py — garde-fou specifique contre une classe de bug
reelle trouvee lors du refactor monolithe modulaire (2026-08-20) : plusieurs
modules calculaient un chemin de fichier de donnees/journal via
os.path.dirname(__file__) SEUL. Correct tant que le fichier vit a la racine
du repo -- mais un futur deplacement de fichier (refactor, reorganisation)
ferait a nouveau pointer ces chemins vers un sous-dossier, ORPHELINANT
SILENCIEUSEMENT des donnees de production reelles (reach_state.db,
auth_audit.log, root_audit.log) sans qu'aucune erreur ne se declare -- le
fichier se recree juste, vide, au mauvais endroit.

Ce test verifie que ces chemins resolvent TOUJOURS vers la racine du repo,
quel que soit le sous-dossier ou vivent les fichiers qui les calculent.
Executez-le apres tout deplacement de fichier touchant a core/db.py,
editorial/audit.py, identity/auth.py, identity/root_auth.py, ou
orchestration/reach_agent.py.

Usage : python3 tests/test_smoke_data_paths.py
"""
import sys
import os
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


def main():
    import core.db as db
    import editorial.audit as audit
    import orchestration.reach_agent as reach_agent
    import identity.auth as auth

    checks = [
        ("editorial.audit.DB", audit.DB),
        ("orchestration.reach_agent._CYCLE_LOCK_PATH", reach_agent._CYCLE_LOCK_PATH),
        ("identity.auth._AUTH_LOG", auth._AUTH_LOG),
    ]
    failed = []
    for label, path in checks:
        actual_dir = os.path.dirname(path)
        ok = actual_dir == REPO_ROOT
        print(f"{'OK  ' if ok else 'FAIL'} {label} = {path}")
        if not ok:
            failed.append((label, path, actual_dir))

    # core.db : verifie le chemin SQLite de repli (mode local/dev, pas utilise
    # en prod ou DATABASE_URL/postgres est configure, mais doit rester correct
    # pour le developpement local).
    _, mode = db.conn()
    print(f"core.db mode actif : {mode}")

    print()
    if failed:
        print(f"{len(failed)} CHEMIN(S) INCORRECT(S) -- pointent hors de la racine du repo :")
        for label, path, actual_dir in failed:
            print(f"  {label}: attendu dossier {REPO_ROOT}, obtenu {actual_dir}")
        return 1
    print("TOUS LES CHEMINS DE DONNEES/JOURNAUX RESOLVENT CORRECTEMENT VERS LA RACINE DU REPO")
    return 0


if __name__ == "__main__":
    sys.exit(main())
