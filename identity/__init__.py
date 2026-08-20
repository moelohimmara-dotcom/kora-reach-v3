"""identity — qui a le droit de faire quoi.

Modules : auth.py (comptes editeurs + invitations), root_auth.py (console
systeme, TOTALEMENT separee — voir docs/adr/0002), permissions.py (table de
verite RBAC, seule source pour "role X peut faire Y"), totp.py (2FA, utilise
par auth.py et root_auth.py).

Depend de : core (db, config). Rien d'autre.
Ne doit PAS dependre de : collection, generation, editorial, publishing,
orchestration — l'authentification/autorisation est un socle, jamais
consommateur du reste de l'app.
"""
