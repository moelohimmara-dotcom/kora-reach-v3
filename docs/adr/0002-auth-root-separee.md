# ADR-0002 : Authentification root totalement séparée de l'authentification éditeur

**Date** : 2026-08-16
**Statut** : accepté
**Décideurs** : propriétaire du projet, assisté de Claude

## Contexte

La tâche 12.1-12.5 du backlog demandait une console système root (gestion des comptes/rôles, supervision technique, configuration globale, audit) réservée à l'exploitant du système. Il fallait décider comment authentifier ce compte root vis-à-vis des comptes éditeurs déjà existants (`kora_users`, gérés par `auth.py`, avec des rôles `normal`/`advanced`).

## Décision

Le compte root utilise une authentification **totalement séparée** de l'authentification éditeur : table dédiée (`kora_root`), sessions dédiées (`kora_root_sessions`), cookie dédié (`kora_root_sid`, périmètre restreint à `/kora-v2/api/root`), module Python dédié ([root_auth.py](../../root_auth.py)) indépendant de `auth.py`. La console vit sur une route non liée dans l'UI (`/root-console`).

## Alternatives envisagées

### Alternative 1 : Rôle élevé dans le système d'authentification existant
- **Avantages** : réutilise directement l'infrastructure `auth.py`/`kora_users` déjà en place et déjà testée (2FA, sessions, rate-limit) ; moins de code à écrire et maintenir.
- **Inconvénients** : le compte root partage la même table, les mêmes sessions et le même cookie que les comptes éditeurs — une faille dans le système d'auth éditeur (ou un compte `advanced` compromis) expose directement le compte le plus privilégié du système.
- **Pourquoi rejetée** : le principal risque à couvrir était justement l'isolation en cas de compromission d'un compte éditeur ; un rôle dans le même système ne l'aurait pas garantie.

### Alternative 2 : Compte root distinct (retenue)
- **Avantages** : isolation réelle — aucune table, session ou cookie en commun avec les comptes éditeurs ; 2e facteur rendu obligatoire d'office pour ce compte spécifiquement (jamais optionnel, contrairement à la 2FA éditeur) ; journal de sécurité séparé (`root_audit.log` vs `auth_audit.log`).
- **Inconvénients** : duplique une partie de la logique d'auth (hash de mot de passe, sessions, rate-limit) entre `auth.py` et `root_auth.py`.
- **Pourquoi retenue** : le coût de duplication (~400 lignes) est faible face au gain d'isolation pour le compte le plus sensible du système.

## Conséquences

### Positives
- Compromission d'un compte éditeur (même `advanced`) n'expose pas la console root.
- Le 2e facteur (TOTP ou questions de sécurité) est structurellement obligatoire pour root — impossible de créer une session sans, contrairement à la 2FA éditeur qui reste optionnelle par compte.
- Sessions root volontairement courtes (2h par défaut) sans affecter la durée des sessions éditeur (24h).
- Audit de sécurité root et éditeur consultables séparément ou fusionnés (`/api/root/audit`), sans que l'un puisse maquiller les traces de l'autre.

### Négatives
- Deux implémentations de hash de mot de passe / gestion de session à maintenir en parallèle (`auth.py` et `root_auth.py`), avec le risque de divergence si l'une est corrigée sans l'autre.
- Un seul compte root supporté nativement par le flux actuel (pas de gestion multi-root) — suffisant pour l'usage actuel (un exploitant), à revoir si plusieurs administrateurs système sont nécessaires.

### Risques
- Duplication de code = double surface à auditer pour les futures failles de sécurité liées à l'auth. Mitigation : les deux modules réutilisent le même cœur cryptographique (`totp.py`, PBKDF2-HMAC-SHA256) plutôt que de le dupliquer aussi.
