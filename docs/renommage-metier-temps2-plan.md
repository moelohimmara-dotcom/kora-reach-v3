# Plan — Renommage métier Temps 2 (backend + base de données)

Suite du chantier de nommage démarré le 2026-08-25 (Temps 1 : cockpit → dashboard, PENDING_REVIEW → "Articles à approuver", terminé et déployé).

## Glossaire visé

| Ancien terme | Nouveau terme | Nature |
|---|---|---|
| `champion` | `article_retenu` | Colonne DB (`hitl_facts`), clé JSON dans le pipeline |
| `contexts` | `sources_secondaires` | Colonne DB (`hitl_facts`) |
| `cluster` | `dossier` | Concept Python uniquement, pas de colonne DB dédiée |
| `hitl_facts` (table) | `dossiers_editoriaux` | Nom de table |
| `fact_id` | `dossier_id` | Colonne PK répétée dans plusieurs tables |

## Ampleur mesurée (2026-08-26)

| Terme | Occurrences totales | Fichiers touchés |
|---|---|---|
| `fact_id` | 363 (258 backend + 105 frontend) | ~30 backend + 8 frontend |
| `champion` | 162 (151 backend + 11 frontend) | ~26 backend |
| `contexts` | 88 | ~17 backend |
| `cluster` | 63 | ~20 backend |
| `hitl_facts` | 98 | ~12 backend |

Plus de 800 occurrences au total, environ 50 fichiers. Tables de production concernées : `hitl_facts`, `hitl_decisions`, `articles`, et probablement `notifications` (colonne `fact_id`), avec des données réelles déjà en place.

## Risque spécifique par terme

- **`cluster`** : aucune colonne DB dédiée trouvée (confirmé par grep du schéma) — concept purement côté code Python (collecte de sources). Renommage à faible risque, pas de migration DB requise pour ce terme précis.
- **`contexts` / `champion`** : colonnes de la table `hitl_facts`, lues/écrites à de nombreux endroits du pipeline (collecte → génération → HITL → publication). Migration de colonne nécessaire (`ALTER TABLE ... RENAME COLUMN`), avec compatibilité de lecture le temps de la bascule.
- **`hitl_facts`** : renommage de table avec données de production existantes. Nécessite une stratégie de compatibilité (comme pour `label_cockpit` → `label_dashboard` au Temps 1 : ancien nom lu en repli si le nouveau n'existe pas encore).
- **`fact_id`** : le plus gros et le plus risqué. C'est une clé primaire répétée dans au moins 3 tables (`hitl_facts`, `hitl_decisions`, `articles`), et c'est aussi la clé JSON de la quasi-totalité des échanges API entre le frontend et le backend (chaque requête HITL, chaque action bulk, chaque notification la transporte). Un oubli, même isolé, casse une action utilisateur silencieusement.

## Méthode (identique au reste de la session)

Pour chaque terme : implémenter → déployer → tester en conditions réelles → revue fable-advisor → corriger si besoin → re-tester → committer. Une **session dédiée par terme**, jamais tout d'un coup.

Avant toute migration DB : sauvegarde complète (`pg_dump`) de la base de production.

Stratégie de migration DB retenue (déjà rodée au Temps 1) : ajouter la nouvelle colonne/table, migrer les données existantes, garder une lecture de repli sur l'ancien nom tant que la bascule n'est pas confirmée stable, puis nettoyer l'ancien nom dans une passe de suivi séparée — jamais un `DROP`/`RENAME` sec en une seule étape sur une table qui contient des données réelles.

## Ordre proposé (du moins risqué au plus risqué)

1. **`cluster` → `dossier`** — pas de colonne DB, uniquement du code Python. Sert de galop d'essai pour la méthode.
2. **`contexts` → `sources_secondaires`** — colonne DB, mais périmètre de lecture/écriture plus restreint que `champion`.
3. **`champion` → `article_retenu`** — colonne DB, contrat JSON plus large (pipeline de génération complet).
4. **`hitl_facts` → `dossiers_editoriaux`** — renommage de table, stratégie de compatibilité obligatoire.
5. **`fact_id` → `dossier_id`** — en dernier, une fois la méthode éprouvée sur les quatre précédents. Le plus gros morceau, à isoler dans sa propre session, probablement sur plusieurs passes (backend d'abord, puis frontend, chacune testée séparément).

## Décision (2026-08-26)

`fact_id` est **retiré du périmètre du Temps 2**. Risque le plus élevé (clé primaire de 3+ tables, quasi tout le contrat API) pour un gain de clarté jugé insuffisant — "fact_id" n'est pas du jargon confus comme "champion" ou "hitl". Reste tel quel.

Périmètre définitif du Temps 2 : `cluster` → `dossier`, `contexts` → `sources_secondaires`, `champion` → `article_retenu`, `hitl_facts` → `dossiers_editoriaux`, dans cet ordre. Démarré par `cluster` → `dossier` (le moins risqué, galop d'essai de la méthode).

## Suivi

- ✅ `cluster` → `dossier` : terminé, déployé, testé, committé (2026-08-25).
- ✅ `contexts` → `sources_secondaires` : terminé (2026-08-25). Sauvegarde `pg_dump` avant migration. Colonne `hitl_facts.contexts` renommée en base via `ALTER TABLE ... RENAME COLUMN` (idempotent, `editorial/hitl_store.py::_init_locked`, données préservées, pas de perte). Tous les points de lecture/écriture SQL et dict (`hitl_store.py`, `server.py`, `generation/writer.py`, `generation/illustrate.py`, `orchestration/reach_agent.py`, `orchestration/video.py`) mis à jour, avec repli défensif `fact.get("sources_secondaires") or fact.get("contexts")` côté lecteurs pour couvrir d'éventuels objets `fact` déjà en mémoire au moment du redémarrage. Vérifié en conditions réelles sur le VPS (colonne + données intactes, `get_fact()`/`list_facts()` renvoient la nouvelle clé, `regenerate(dry_run=True)` sans erreur, smoke test Playwright complet). Revue fable-advisor : propre, aucun oubli.
- ✅ `champion` → `article_retenu` : terminé (2026-08-25). Sauvegarde `pg_dump` avant migration. Colonne `hitl_facts.champion` (NOT NULL) renommée en base via `ALTER TABLE ... RENAME COLUMN` (idempotent, même bloc que `contexts`), contrainte et données préservées. Contrat JSON `fact.champion` renommé `fact.article_retenu` de bout en bout : producteurs (`orchestration/reach_agent.py` : `_gen_one`, `regenerate`), consommateurs backend (`hitl_store.py`, `server.py`, `generation/writer.py`, `generation/illustrate.py`, `generation/video.py`, `orchestration/video.py`, `publishing/transmit.py`), fonction `pick_champion` → `pick_article_retenu` (`collection/dossiers.py`), ET frontend (`kora-vite/src/sheet.js`, `utils.js`, `views/facts.js`, `views/trash.js`, `views/videos.js` — premier terme du glossaire à traverser la frontière API/UI). Replis défensifs `fact.get("article_retenu") or fact.get("champion")` côté lecteurs backend. Vérifié en conditions réelles sur le VPS : colonne + contrainte + données intactes, `regenerate(dry_run=True)` sans erreur, test Playwright réel d'ouverture de fiche article (contenu rendu, source affichée, zéro "undefined", zéro erreur JS), smoke test complet. Revue fable-advisor : a signalé `static/app.js` (racine du repo, frontend legacy pré-Vite) comme résiduel — vérifié directement sur le bundle réellement servi en prod (`index-mt8jvxcr.js`, référencé par `index.html`) : 0 occurrence de `champion`, fichier confirmé mort (jamais servi, `server.py` ne le référence pas), pas un bug de prod. Nettoyage de ce fichier mort laissé pour une passe séparée si le sujet revient.
- ⬜ `hitl_facts` → `dossiers_editoriaux` : renommage de table, dernier terme de ce périmètre.
