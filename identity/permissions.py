"""permissions.py — table de vérité RBAC (ADR-0004).

Centralise ce qui était auparavant éparpillé dans server.py : une douzaine
d'appels `_require_role("advanced")` répétés inline, un par endpoint sensible,
sans qu'aucun endroit du code ne dise clairement "qui a le droit de faire
quoi". Chaque action sensible est déclarée ICI une seule fois, avec le rôle
minimum requis — ajouter un rôle ou changer un droit se fait à un seul
endroit, lisible d'un coup d'œil, plutôt qu'en cherchant dans tout server.py.

Rôles éditeur (du moins au plus privilégié) :
    lecteur   — consultation seule (voir server.py : toute mutation hors
                actions sur son propre compte est bloquée pour ce rôle,
                cf. LECTEUR_ALLOWED_POST dans do_POST).
    normal    — Éditeur : usage courant (génération, validation interne,
                édition). N'inclut PAS l'envoi vers WordPress par défaut,
                voir can_publish_wp() ci-dessous.
    advanced  — Administrateur : tout ce qui précède + les capacités listées
                ci-dessous (comptes, sources, prompts agent...) — SAUF gérer
                d'autres Propriétaires, réservé au rôle owner.
    owner     — Propriétaire (2026-08-19, restructuration rôles/permissions,
                façon Google Docs/Meta Pages) : tout ce qu'Administrateur peut
                faire + gérer/révoquer d'autres Propriétaires. Plusieurs
                Propriétaires possibles ; le dernier ne peut jamais être
                supprimé/rétrogradé (garde-fou anti-verrouillage, voir auth.py
                set_role()/delete_user()). Distinct de "advanced" dans
                ROLES_ORDER -> hérite automatiquement de toutes les capacités
                "advanced" par comparaison de rang, sans dupliquer chaque ligne.

Le compte ROOT (console système, root_auth.py) est un système
d'authentification totalement séparé par conception (ADR-0002) : il n'a pas
sa place dans cette table, ses propres endpoints (/api/root/*) vérifient une
session root, pas un rôle éditeur. Le rôle "owner" ci-dessus est un niveau de
l'app EDITORIALE, PAS un accès infrastructure — les deux ne se recouvrent
jamais (voir plan de restructuration, §1).
"""

ROLES_ORDER = ["lecteur", "normal", "advanced", "owner"]

# Action -> rôle minimum requis pour l'exécuter. Le seul intérêt de lister ça
# en table plutôt qu'en checks épars, c'est de pouvoir un jour abaisser une
# capacité (ou en ajouter une nouvelle) sans devoir relire tout server.py pour
# retrouver les endroits concernés.
CAPABILITIES = {
    # Bug corrige 2026-08-19 : etait "advanced" -> un Lecteur/Editeur qui
    # atteignait la page Sources (ex. via une bulle "source-chip" sur le
    # cockpit, non filtree par role) recevait un 403 sur CHAQUE chargement et
    # restait bloque sur le squelette "Sources en chargement..." indefiniment
    # (aucun message d'erreur) -- lu a tort comme "la page est tres lente".
    # La liste des sources est une info de gouvernance en lecture seule, pas
    # une donnee sensible -> ouverte a tout compte connecte. gerer_sources
    # (ajout/edition/suspension) reste reserve a advanced+.
    "voir_sources": "lecteur",                # GET /api/whitelist
    "gerer_sources": "advanced",             # POST/PATCH /api/whitelist (ajout, edition, activation)
    "voir_prompts_agent": "advanced",         # GET /api/agent-prompts
    "voir_comptes": "advanced",               # GET /api/auth/users
    "purger_audit": "advanced",               # POST /api/audit/purge
    "modifier_identite": "advanced",          # POST /api/settings
    "modifier_prompts_agent": "advanced",     # POST /api/agent-prompts
    "reinitialiser_prompts_agent": "advanced",  # POST /api/agent-prompts/reset
    "creer_compte": "advanced",               # POST /api/auth/users (role != owner, voir server.py)
    "changer_role": "advanced",               # POST /api/auth/users/role (role != owner, voir server.py)
    "supprimer_compte": "advanced",           # DELETE /api/auth/users (cible != owner, voir server.py)
    "purger_audit_lot": "advanced",           # DELETE /api/audit
    "voir_transmetteur": "advanced",          # GET /api/settings/transmitter
    "gerer_droit_publication_wp": "advanced",  # POST /api/auth/users/wp-publish (déléguer à un Éditeur)
    "gerer_proprietaires": "owner",           # créer/rétrograder un Propriétaire — jamais un Administrateur
    "gerer_invitations": "advanced",          # POST /api/auth/invitations (+ revoke/resend) — Phase 2
}


def _role_rank(role):
    try:
        return ROLES_ORDER.index(role or "lecteur")
    except ValueError:
        return 0  # rôle inconnu -> traité comme le moins privilégié (fail-safe)


def role_can(role, capability):
    """True si `role` a le droit d'effectuer `capability`.
    Lève KeyError si `capability` n'est pas déclarée — erreur de programmation
    à corriger ici, pas un cas à avaler silencieusement."""
    required = CAPABILITIES[capability]
    return _role_rank(role) >= _role_rank(required)


def can_publish_wp(role, wp_publish_allowed):
    """Droit d'envoi vers WordPress (brouillon OU officiel — même contrôle
    pour les deux, voir §3 du plan validé 2026-08-19) : Propriétaire et
    Administrateur l'ont automatiquement via leur rôle ; un Éditeur ('normal')
    ne l'a QUE si le drapeau de délégation est activé sur son compte
    (auth.set_wp_publish). Jamais pour 'lecteur'."""
    if role in ("owner", "advanced"):
        return True
    if role == "normal":
        return bool(wp_publish_allowed)
    return False
