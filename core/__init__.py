"""core — infrastructure partagee (le seul paquet dont TOUS les autres peuvent dependre).

Modules : db.py (abstraction connexion SQLite/PostgreSQL, agnostique au
domaine), config.py (limites/config statique), settings.py (identite
white-label de l'app, en base).

Nomme "core" et NON "platform" (2026-08-20) : "platform" est un module de
la bibliotheque standard Python (platform.system(), platform.machine()...)
— un paquet du meme nom l'aurait masque pour toute dependance qui
l'importe en interne, bug trouve et evite AVANT le premier deploiement de
ce refactor.

Depend de : rien en interne au monolithe. Ne doit JAMAIS importer un autre
paquet du projet (identity, collection, generation, editorial, publishing,
orchestration) — sinon ce n'est plus un socle partage mais un module
metier de plus.
"""
