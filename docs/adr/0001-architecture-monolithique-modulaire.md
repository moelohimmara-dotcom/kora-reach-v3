# ADR-0001 : Architecture monolithique modulaire

**Date** : 2026-08-04 (date approximative — décision de fond antérieure à cette session, consignée rétroactivement le 2026-08-17)
**Statut** : accepté
**Décideurs** : propriétaire du projet

## Contexte

KORA Reach V3 est un agent éditorial autonome pour kakilambe.com : collecte de sources, déduplication, génération d'articles, validation humaine (HITL), transmission. Un seul éditeur/petite équipe l'opère, déployé sur un unique VPS. Il fallait choisir entre un service unique regroupant toute la logique métier, ou découper dès le départ en services indépendants (collecte, génération, auth, etc.) communiquant par réseau.

## Décision

L'application est un **monolithe modulaire** : un unique process serveur ([server.py](../../server.py), stdlib Python, `ThreadingHTTPServer`) qui route toutes les requêtes API, avec la logique métier séparée en modules Python à responsabilité unique (`auth.py`, `hitl_store.py`, `reach_agent.py`, `writer.py`, `fetchers.py`, `settings.py`, etc.), communiquant entre eux par imports et appels de fonction directs — jamais par réseau interne. Base de données partagée (SQLite en local, PostgreSQL en prod, via `db.py`). Frontend : un unique SPA Vite servi en statique par ce même serveur.

## Alternatives envisagées

### Alternative 1 : Microservices (collecte / génération / auth / HITL en services séparés)
- **Avantages** : scaling indépendant par domaine, déploiements isolés, tolérance aux pannes partielles.
- **Inconvénients** : complexité opérationnelle (orchestration, découverte de service, observabilité distribuée), latence réseau entre services, plusieurs bases de données ou synchronisation à gérer.
- **Pourquoi rejetée** : aucun des bénéfices ne s'applique à l'échelle du projet (un seul VPS, un ou deux éditeurs, pas d'équipes séparées par domaine) ; le coût de complexité aurait ralenti le développement sans contrepartie.

### Alternative 2 : Monolithe non modulaire (toute la logique dans un seul fichier/couche)
- **Avantages** : encore plus simple à démarrer.
- **Inconvénients** : devient vite illisible et couplé à mesure que les fonctionnalités s'ajoutent (auth, 2FA, console root, agent, HITL…).
- **Pourquoi rejetée** : la séparation par modules à responsabilité unique coûte presque rien à mettre en place dès le départ et évite une dette technique qui aurait fini par forcer une réécriture.

## Conséquences

### Positives
- Déploiement simple : un seul service à démarrer/redémarrer (`kora-preview.service`).
- Débogage facilité : pas de traçage distribué nécessaire, la pile d'appels reste dans un seul process.
- Coût d'infrastructure minimal (un VPS).
- Les modules restent lisibles et testables individuellement malgré l'absence de séparation réseau.

### Négatives
- Un bug ou un plantage dans un module peut affecter la disponibilité de l'ensemble (pas d'isolation de panne).
- Le scaling horizontal se fait par process entier, pas par fonctionnalité.

### Risques
- Si le projet grossit fortement (plusieurs équipes, besoins de scaling différenciés par domaine), une migration partielle vers des services séparés deviendrait pertinente — la séparation modulaire actuelle en Python facilite cette extraction future si besoin, sans y être aujourd'hui.
