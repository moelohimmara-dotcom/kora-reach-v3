# HITL — LOGIQUE MÉTIER (KORA V3)

> Règle stricte du CDC : *« KORA V3 ne publie jamais de manière autonome. Chaque
> proposition d'article est soumise à une validation humaine verrouillée avant
> transmission à WordPress. »* Ce document fixe la logique. Aucun code n'est
> modifié tant que cette logique n'est pas validée.

## 1. Objectif et principe de verrou
L'agent Reach produit des **propositions d'article** (fait + article rédigé + sources).
Aucune proposition ne quitte le système sans une **décision humaine explicite**
(`APPROUVER` / `REJETER` / `MODIFIER`). La transmission au backend (WordPress /
Supabase) est **verrouillée** : elle ne peut se déclencher qu'après un `APPROUVER`
consigné et attribué.

## 2. Modèle de décision (machine à états par fait)
Un `fact_id` stable identifie chaque proposition : `fact_id = sha1(champion_url + champion_title)`.

| État | Signification | Verrou |
|------|---------------|--------|
| `PENDING_REVIEW` | Généré, en attente d'un humain | éditable |
| `EDITED` | Humain a modifié le texte | reste en attente |
| `APPROVED` | Humain a cliqué « Approuver » | **déverrouille** la transmission |
| `REJECTED` | Humain a cliqué « Rejeter » | jamais transmis |
| `TRANSMITTED` | POST WordPress/Supabase réussi | **verrouillé** (aucune action depuis KORA à ce jour ; « Retirer de WordPress » planifié, voir [ADR-0005](docs/adr/0005-retrait-republication-articles-transmis.md)) |
| `TRANSMISSION_FAILED` | erreur réseau/HTTP | retourne à `APPROVED` (retry) |

Transition interdite : on ne peut pas passer de `TRANSMITTED` ou `REJECTED` à
un autre état sans override explicite (gardien).

## 3. Flux (séquence)
1. Cycle → `reach_agent` génère N faits → chaque fait entre en `PENDING_REVIEW`.
2. Dashboard affiche la vue **Validation HITL** : proposition + sources (champion +
   contextes) + zone d'édition.
3. Éditeur choisit :
   - **Modifier** → texte édité en local, état `EDITED` (pas de décision finale).
   - **Rejeter** → état `REJECTED`, horodaté + attribué, jamais transmis.
   - **Approuver** → état `APPROVED`, horodaté + attribué → **déclenche la transmission**.
4. Transmission : adapter isolé `transmit(fact, text)` → WordPress REST ou Supabase.
   - Succès → `TRANSMITTED` (verrouillé).
   - Échec → `TRANSMISSION_FAILED`, retry possible (jamais d'auto-boucle silencieuse).

## 4. Contrat de transmission (adapter isolé)
`transmit_article(fact, final_text)` — **un seul point de sortie réseau**, branché
sur un sélecteur de mode :
- `dry_run` (DÉFAUT, gratuit, sûr) : valide le payload, loggue, ne fait AUCUN
  appel réseau. Aucune credential requise.
- `wordpress` : `POST /wp-json/wp/v2/posts` (title, content, featured media).
- `supabase` : insert dans table `articles` (RAW + généré + décision).

Les credentials NE sont JAMAIS dans le code : lus depuis env (`WP_URL`, `WP_USER`,
`WP_APP_PASS`, `SUPABASE_URL`, `SUPABASE_KEY`). Absents → mode `dry_run` forcé.

## 5. Verrouillage et attribution
- Toute décision porte `decided_by` (identité éditeur) + `decided_at` (ISO Conakry).
- Identité éditeur : variable `EDITOR_NAME` (config) ou session. **Pas de décision
  anonyme** : si `decided_by` vide → refus (`400`).
- Une fois `APPROVED`/`TRANSMITTED`, le fait est verrouillé : re-édition ou
  re-décision exige un `override` explicite (action distincte, tracée).

## 6. Garde-fous anti-hallucination
- Le texte affiché est **toujours** accompagné des sources (champion + contextes) →
  traçabilité. L'éditeur peut éditer, mais les liens source restent attachés.
- Si un fait présente une **anomalie de date** ou **moins de 2 sources**, il est
  marqué `NEEDS_REVIEW` (validation humaine obligatoire, jamais d'auto-transmission).
- Aucune génération ne mentionne un fait non présent dans les sources (prompt
  stricte déjà en place côté writer).

## 7. Piste d'audit
Chaque événement consigné dans `audit_events` (déjà existant) :
`HITL_DECISION` (decided_by, decision, fact_id),
`TRANSMISSION` (fact_id, mode, status, provider, http_status).
Aucun secret (clé/token) dans l'audit — expurgé automatiquement (déjà codé).

## 8. Persistance (hitl_store)
Nouvelle table SQLite `hitl_decisions` :
`fact_id PK, status, decision, edited_text, decided_by, decided_at, transmitted_at, provider, http_status`.
Survit aux redémarrages et rechargements du dashboard (contrairement à l'état
mémoire actuel qui est perdu).

## 9. Modes de fonctionnement
- **Local/Démo** : `dry_run` par défaut → tout le flux HITL est réel et vérifiable
  sans credential ni WordPress.
- **Prod** : bascule `wordpress`/`supabase` via env, après validation humaine.

## 10. Angles morts / décisions à valider (avis franc)
- **Identité éditeur** : en local on utilise `EDITOR_NAME` (ex. « chef_de_secteur »).
  En prod il faudra un vrai login (cookie maison KORA existant). ⚠ À confirmer.
- **Auto-transmission post-approbation** : je propose que l'approbation DÉCLENCHE
  la transmission (sinon risque d'oubli). Alternative : bouton « Transmettre »
  séparé. ⚠ Ton choix.
- **Override** : qui peut déverrouiller un fait `TRANSMITTED`/rejeter après coup ?
  (rétraction). Répondu le 2026-08-23 — voir
  [ADR-0005](docs/adr/0005-retrait-republication-articles-transmis.md) :
  retrait synchronisé (corbeille WordPress réelle) réservé au même droit que
  la publication, republication in-place sur le même post. Implémentation
  en cours (tâches T1-T5 de l'ADR), pas encore en production au 2026-08-23.
- **Conflit de fusion** : si 2 éditeurs décident le même fait → dernière décision
  gagne, tracée (pas de race condition silencieuse).

---
*Cette logique est autonome et gratuite. Le branchement WordPress/Supabase réel est
un adapter isolé, activable par env, jamais fictif.*
