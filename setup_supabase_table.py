"""setup_supabase_table.py — crée la table 'articles' via l'API management Supabase.

AUCUNE credential dans le fichier : SUPABASE_URL + SUPABASE_KEY (service_role) en env.
Tente l'endpoint /database/query de l'API management (exécute du SQL).
"""
import os, json, sys, urllib.request, urllib.error

URL = os.environ.get("SUPABASE_URL", "").rstrip("/")  # https://xxxx.supabase.co
KEY = os.environ.get("SUPABASE_KEY", "")
if not URL or not KEY:
    print("ERREUR: expose SUPABASE_URL et SUPABASE_KEY en env."); sys.exit(1)

# Ref du projet = sous-domaine
REF = URL.replace("https://", "").replace(".supabase.co", "")

SQL = """
create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  fact_id text not null unique,
  title text not null,
  content text not null,
  source_url text,
  image text,
  n_sources int not null default 1,
  generated_model text,
  status text not null default 'pending_review',
  decided_by text not null,
  decided_at timestamptz,
  transmitted_at timestamptz default now(),
  created_at timestamptz default now()
);
create index if not exists articles_fact_id_idx on public.articles(fact_id);
create index if not exists articles_status_idx on public.articles(status);
"""

# API management Supabase
api_url = f"https://api.supabase.com/v1/projects/{REF}/database/query"
req = urllib.request.Request(
    api_url,
    data=json.dumps({"query": SQL}).encode(),
    method="POST",
    headers={"Content-Type": "application/json",
             "Authorization": "Bearer " + KEY,
             "apikey": KEY},
)
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        print("[TABLE] Création ->", r.status, r.read().decode()[:200])
except urllib.error.HTTPError as e:
    print("[TABLE] HTTP", e.code, e.read().decode()[:400])
except Exception as e:
    print("[TABLE] ERREUR", str(e)[:300])
