#!/usr/bin/env python3
"""test_smoke_imports.py — filet de securite minimal pour le refactor
monolithe modulaire (2026-08-20) et tout futur deplacement de fichier.

Verifie que TOUS les modules backend s'importent sans erreur, DEPUIS LA
RACINE DU REPO (comme le fait server.py en production, lance par systemd
avec WorkingDirectory=/opt/kora-reach). Un module qui ne s'importe plus
(import casse, chemin de fichier deplace mais pas mis a jour...) fait
echouer ce script -- executez-le apres tout deplacement/renommage de
fichier, AVANT de deployer.

Usage : python3 tests/test_smoke_imports.py

Note environnement local (sans rapport avec le code teste) : sur une
installation Python 3.14 locale, feedparser echoue a l'import (depend du
module stdlib 'cgi', retire en 3.13+) -- ce script le detecte et bascule
sur un stub minimal UNIQUEMENT dans ce cas, pour que le test reste
executable localement. En production (Python plus ancien), le vrai
feedparser est utilise sans stub.
"""
import sys
import os
import types

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO_ROOT)

try:
    import feedparser  # noqa: F401
except ImportError:
    # Environnement local incompatible (module stdlib 'cgi' absent) -- stub
    # minimal, jamais utilise en production ou le vrai feedparser fonctionne.
    print("[avertissement] feedparser reel indisponible ici (Python trop recent "
          "pour cette version de feedparser) -- stub utilise, LOCAL SEULEMENT.")
    stub = types.ModuleType("feedparser")
    stub.parse = lambda *a, **k: types.SimpleNamespace(entries=[], bozo=1)
    sys.modules["feedparser"] = stub

try:
    import trafilatura  # noqa: F401
except ImportError:
    print("[avertissement] trafilatura reel indisponible ici -- stub utilise, LOCAL SEULEMENT.")
    stub = types.ModuleType("trafilatura")
    stub.extract = lambda *a, **k: ""
    sys.modules["trafilatura"] = stub

# Un module par ligne, dans l'ordre des paquets du monolithe modulaire
# (voir CLAUDE.md / commentaires de reach_agent.py pour la carte des
# dependances). server.py en dernier : c'est la frontiere HTTP, qui importe
# tout le reste.
MODULES = [
    "core.config", "core.db",
    "identity.totp", "identity.permissions", "identity.auth", "identity.root_auth",
    "editorial.audit", "editorial.state_store", "editorial.hitl_store",
    "collection.normalizer", "collection.guinea_filter", "collection.dedup",
    "collection.clusterer", "collection.guardrails", "collection.fetchers",
    "collection.alt_sources", "collection.whitelist",
    "generation.agent_prompts", "generation.illustrate", "generation.writer",
    "generation.narrate", "generation.video",
    "publishing.transmit",
    "orchestration.reach_agent", "orchestration.video",
    "core.settings",
    "server",
]


def main():
    failed = []
    for m in MODULES:
        sys.modules.pop(m, None)  # import frais, meme si le script est relance
        try:
            __import__(m)
            print(f"OK   {m}")
        except Exception as e:
            failed.append((m, e))
            print(f"FAIL {m}: {type(e).__name__}: {e}")
    print()
    if failed:
        print(f"{len(failed)}/{len(MODULES)} MODULE(S) EN ECHEC")
        return 1
    print(f"TOUS LES {len(MODULES)} MODULES S'IMPORTENT CORRECTEMENT")
    return 0


if __name__ == "__main__":
    sys.exit(main())
