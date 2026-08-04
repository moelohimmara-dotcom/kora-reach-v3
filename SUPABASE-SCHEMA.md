# Schéma Supabase — table `articles` (KORA V3)

> Logique métier avant code. À VALIDER avant que l'agent crée la table.
> Cible : Supabase Postgres (REST `supabase/rest/v1/articles`).

## Objectif
Persister chaque article HITL validé (APPROVED → TRANSMITTED) dans Supabase,
pour que le front Next.js 15 (ou un autre consommateur) puisse l'afficher /
le soumettre à WordPress. Aucune donnée sensible (clés, mots de passe) ici.

## Table `articles`

```sql
create table if not exists public.articles (
  id            uuid primary key default gen_random_uuid(),
  fact_id       text not null unique,          -- empreinte déterministe (hitl_store.fact_id_of)
  title         text not null,
  content       text not null,                  -- article synthétisé (final_text)
  source_url    text,                           -- URL de l'article champion
  image         text,                           -- image OG du champion (illustration)
  n_sources     int not null default 1,         -- nb de sources fusionnées
  generated_model text,                         -- modèle ayant rédigé (ex. template / ollama:xxx)
  status        text not null default 'pending_review',  -- pending_review | published | retracted
  decided_by    text not null,                  -- éditeur (ex. chef_de_secteur)
  decided_at    timestamptz,                    -- ISO Conakry
  transmitted_at timestamptz default now(),
  created_at    timestamptz default now()
);

-- Index pour recherches fréquentes
create index if not exists articles_fact_id_idx on public.articles(fact_id);
create index if not exists articles_status_idx on public.articles(status);
```

## Règles métier (gardées côtés agent, pas par la DB seule)
- **Un seul article par `fact_id`** (contrainte `unique`) → pas de doublon si re-transmission.
- `status` :
  - `pending_review` : écrit par l'agent, en attente de soumission WP (HITL fait, mais WP pas encore appelé).
  - `published` : transmis à WordPress avec succès.
  - `retracted` : retiré (droit de rectification) → le front ne l'affiche plus.
- La **transmission WordPress** reste un appel séparé (voir `transmit.py`, mode `wordpress`) ;
  Supabase est la source de vérité de l'article validé.

## Sécurité / RGPD
- La clé utilisée est **service_role** (écriture backend) → à garder **seulement côté serveur**,
  jamais exposée au front. Variable env `SUPABASE_KEY`, pas dans le repo.
- RLS (Row Level Security) : activable plus tard pour limiter la lecture au front authentifié.
  Par défaut ici on suppose un projet avec RLS permissif en lecture (à confirmer avec toi).

## Mapping avec `transmit.py` (adapter existant)
`transmit.py._to_supabase()` envoie déjà un payload `{title, content, source_url,
image, n_sources, generated_model, status:"pending_review"}` en `POST /rest/v1/articles`.
→ Il suffit d'ajouter `fact_id`, `decided_by`, `decided_at` (disponibles dans
`hitl_store`) au payload, et de gérer l'upsert sur `fact_id` (en conflit → update).

## À valider
- [ ] Noms de colonnes OK ?
- [ ] `status` = `pending_review` par défaut OK (on sépare Supabase de WP) ?
- [ ] Clé = service_role OK, ou tu préfères anon + RLS strict ?
- [ ] RLS activé dès le départ, ou on ouvre en lecture et on durcit après ?
