# Schéma de la table `articles` (KORA V3)

> Source de vérité : le code qui écrit réellement dans la table, à savoir
> `transmit._build_supabase_payload()` + `transmit._to_postgres()` (Postgres local)
> et l'insert Supabase legacy `setup_supabase_insert.py`.
> **Ne PAS se fier à un ancien schéma anglais** (`title`, `content`, `fact_id`) :
> il n'a jamais correspondu à la table réelle et a été retiré du repo (2026-08-16).

## Objectif
Persister chaque article HITL validé (APPROVED → TRANSMITTED) dans l'entrepôt
`articles`, pour qu'un consommateur (front, pipeline WordPress) puisse l'afficher /
le publier. Aucune donnée sensible (clés, mots de passe) ici.

Deux backends partagent ce schéma de colonnes (français) :
- **Postgres local** (`DATABASE_BACKEND=postgres`) — écrit par `transmit._to_postgres()`.
- **Supabase cloud** (legacy) — écrit par `transmit._to_supabase()` / `setup_supabase_insert.py`.

## Colonnes connues (écrites par l'agent)

| Colonne             | Type (indicatif)      | Notes                                                        |
|---------------------|-----------------------|-------------------------------------------------------------|
| `id`                | identifiant (PK)      | auto ; utilisé pour la dédupe (`SELECT id … WHERE source_url`) |
| `titre`             | text                  | titre du champion                                           |
| `formule_titre`     | text (nullable)       | laissé NULL par l'agent                                     |
| `chapeau`           | text                  | 1ʳᵉ ligne du corps, tronquée ~280 car.                     |
| `corps`             | text                  | article synthétisé (`final_text`)                          |
| `meta_description`  | text                  | ≤ 160 car.                                                 |
| `mots_cles`         | text[] / jsonb        | liste de mots-clés (la table accepte un tableau)           |
| `categorie_id`      | (nullable)            | table `categories` non exposée → NULL (pas d'invention)    |
| `source_url`        | text                  | **clé de dédupe** (un article par source_url)              |
| `source_nom`        | text                  | nom de la source champion                                  |
| `source_level`      | int                   | niveau de source (voir `transmit._derive_source_level`)    |
| `image_url`         | text                  | illustration (OG champion ou image générée)                |
| `image_prompt`      | text                  | vide par défaut                                            |
| `llm_provider_used` | text (nullable)       | laissé NULL par l'agent                                    |
| `llm_model_used`    | text (nullable)       | modèle rédacteur (ex. `template`, `ollama:xxx`)            |
| `status`            | text                  | `PENDING_REVIEW` (écrit par l'agent), `published`, `retracted` |
| `origin`            | text                  | `AGENT_SEMI` (flux semi-auto + validation HITL)            |
| `created_at`        | timestamp             | horodatage de création                                     |

> **Colonnes `wp_*`** : gérées **exclusivement** par le pipeline WordPress
> (publication vers kakilambe.com). L'agent n'y touche **jamais** (`_to_postgres` /
> `_to_supabase` ne les listent pas). Leur définition n'est pas maintenue ici.

> **Pas de colonne `fact_id`** dans la table `articles` : contrairement à
> `hitl_facts` / `hitl_decisions`, la dédupe se fait sur `source_url` (cf.
> `setup_supabase_insert.py` et `_to_postgres`).

## Règles métier (portées par l'agent, pas par la DB seule)
- **Un seul article par `source_url`** → pas de doublon en cas de re-transmission
  (l'agent fait un `SELECT id … WHERE source_url=…` avant d'insérer).
- `status` :
  - `PENDING_REVIEW` : écrit par l'agent (HITL fait, WP pas encore appelé).
  - `published` : publié côté WordPress.
  - `retracted` : retiré (droit de rectification).
- La **transmission WordPress** reste un appel séparé (`transmit.py`, mode
  `wordpress`) ; l'entrepôt `articles` est la source de vérité de l'article validé.

## Sécurité / RGPD (backend Supabase legacy)
- Clé **service_role** (écriture backend), **jamais** exposée au front. Variable
  env `SUPABASE_KEY`, hors repo.
- RLS activable pour restreindre la lecture au front authentifié.

## Note SQLite (dev local)
En `DATABASE_BACKEND=sqlite`, `hitl_store._init()` crée une table `articles`
minimale (colonnes ci-dessus, hors `wp_*`) pour que les compteurs de stats
fonctionnent. En prod Postgres la table est créée par le pipeline WordPress
(schéma complet, `wp_*` compris) — voir le correctif du 2026-08-16.
