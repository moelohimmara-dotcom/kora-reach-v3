# ADR-0004 : Centralisation des vérifications RBAC dans une table de vérité

**Date** : 2026-08-17
**Statut** : accepté
**Décideurs** : propriétaire du projet, assisté de Claude

## Contexte

KORA compte plusieurs utilisateurs éditeurs avec 3 rôles (`lecteur`, `normal`/Éditeur, `advanced`/Admin — voir ADR-0002 pour le compte root, séparé). En discutant de la meilleure approche de gestion des habilitations pour une application à plusieurs utilisateurs, l'audit du code existant a montré que le RBAC était le bon modèle pour l'échelle du projet, mais que son implémentation était fragile : `if not self._require_role("advanced"): return` répété littéralement à 11 endroits dans [server.py](../../server.py), sans qu'aucun endroit ne liste clairement quelles actions exigent quel rôle.

## Décision

Un nouveau module [permissions.py](../../permissions.py) centralise la table de vérité RBAC : un dictionnaire `CAPABILITIES` associant chaque action sensible (`voir_sources`, `modifier_identite`, `creer_compte`, `supprimer_compte`…) au rôle minimum requis, et une fonction `role_can(role, capability)` qui compare les rôles par rang plutôt que par égalité stricte. `server.py` expose un seul point d'entrée, `_require_capability(capability)`, qui remplace tous les appels `_require_role("advanced")` épars. Le blocage générique du rôle `lecteur` (lecture seule sur tout POST hors self-service) reste tel quel — c'est une règle transversale, pas une capacité par action.

## Alternatives envisagées

### Alternative 1 : Garder les checks `_require_role("advanced")` épars, sans y toucher
- **Avantages** : aucun changement, aucun risque de régression.
- **Inconvénients** : chaque nouvelle fonctionnalité sensible ajoute un appel de plus à retrouver et maintenir ; impossible de répondre à "qui a le droit de faire X ?" sans lire tout `server.py` ligne par ligne.
- **Pourquoi rejetée** : le coût de la centralisation est faible (un module de 50 lignes, un refactor mécanique) face au bénéfice de lisibilité et de maintenabilité à mesure que l'équipe d'éditeurs grandit.

### Alternative 2 : Passer à un modèle PBAC (permissions granulaires en base de données, assignables individuellement)
- **Avantages** : flexibilité maximale — un droit précis assignable à une personne sans passer par un rôle.
- **Inconvénients** : nécessite une table de permissions, une table de jonction rôle-permissions (ou utilisateur-permissions), une UI de gestion, et complique le raisonnement pour le propriétaire du projet (non-développeur).
- **Pourquoi rejetée** : aucun besoin concret actuel ne dépasse ce que 3 rôles fixes permettent d'exprimer. Complexité anticipée sans bénéfice mesurable — cf. principe YAGNI.

## Conséquences

### Positives
- Une seule table (`permissions.CAPABILITIES`) répond à "qui a le droit de faire quoi" — plus besoin de parcourir `server.py`.
- Ajouter une capacité ou abaisser son rôle minimum (ex. autoriser les Éditeurs à voir les sources sans passer Admin) se fait en une ligne, à un seul endroit.
- `role_can()` compare par rang (`lecteur < normal < advanced`) plutôt que par égalité stricte — prêt à accueillir un futur rôle intermédiaire sans casser les comparaisons existantes.
- Messages d'erreur 403 plus précis (`{"error": "forbidden", "capability": "voir_sources"}` au lieu de `{"role_requis": "advanced"}`) — utile pour déboguer côté audit/logs.

### Négatives
- Une indirection de plus (`_require_capability` → `permissions.role_can` → `CAPABILITIES`) à connaître pour quiconque modifie les droits, contre un `if role == "advanced"` immédiatement lisible en place.

### Risques
- Si `permissions.py` et le comportement réel divergent (capacité oubliée dans la table), l'erreur serait immédiate (`KeyError` au premier appel, pas un échec silencieux) — testé en conditions réelles après le refactor (11 endpoints, aucune régression de comportement).
