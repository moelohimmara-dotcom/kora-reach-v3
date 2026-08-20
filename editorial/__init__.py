"""editorial — cycle de vie editorial, memoire de dedoublonnage, journal.

Modules : hitl_store.py (workflow Human-In-The-Loop : rien n'est publie
sans validation humaine — SSOT des compteurs dashboard via
get_dashboard_stats()), state_store.py (memoire dedup inter-cycles,
statistiques de timing), audit.py (journal d'audit — SQLite LOCAL DEDIE,
volontairement PAS via core.db/Postgres, voir docstring du module).

Depend de : core (db, config). Rien d'autre.
Ne doit PAS dependre de : collection, generation, publishing — le stockage
editorial ne sait pas comment un fait a ete collecte ni comment un article
sera publie ; il gere uniquement son propre cycle de vie (attente ->
decision -> transmission/rejet/corbeille).
"""
