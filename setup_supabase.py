"""setup_supabase.py — teste la connexion + crée la table 'articles' + insert de démo.

AUCUNE credential dans ce fichier : on lit SUPABASE_URL / SUPABASE_KEY depuis l'env.
Usage : SUPABASE_URL=... SUPABASE_KEY=... python setup_supabase.py
"""
import os, json, sys, urllib.request, urllib.error

URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_KEY", "")
if not URL or not KEY:
    print("ERREUR: expose SUPABASE_URL et SUPABASE_KEY en env."); sys.exit(1)

HEADERS = {
    "Content-Type": "application/json",
    "apikey": KEY,
    "Authorization": "Bearer " + KEY,
    "Prefer": "return=representation",
}

def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(URL.rstrip("/") + path, data=data, method=method, headers=HEADERS)
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:400]
    except Exception as e:
        return -1, str(e)

# 1. Test connexion (lecture de la table, même si elle n'existe pas encore)
print("[1] Test connexion ->", req("GET", "/rest/v1/articles?limit=1")[0])

# 2. Création de la table via Postgres (si `db/query` disponible avec service_role)
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
"""
# Supabase permet l'exécution SQL via /rest/v1/rpc/... ou l'API PostgREST directe
# Ici on tente l'écriture directe (PostgREST ne crée pas de table) :
# on insère un article de démo ; si la table n'existe pas, on le dira.
demo = {
    "fact_id": "setup_test_dry",
    "title": "Test KORA Supabase",
    "content": "Article de démonstration généré par le setup.",
    "source_url": "https://mosaiqueguinee.com/test",
    "image": "",
    "n_sources": 1,
    "generated_model": "template",
    "status": "pending_review",
    "decided_by": "chef_de_secteur",
    "decided_at": "2026-08-02T00:00:00+00:00",
}
st, body = req("POST", "/rest/v1/articles", demo)
print("[2] Insert démo ->", st, body[:200])
if st in (201, 200):
    print("TABLE EXISTE + ÉCRITURE OK")
elif st == 404 or "does not exist" in body:
    print("TABLE 'articles' ABSENTE -> à créer via l'éditeur SQL Supabase (voir SUPABASE-SCHEMA.md)")
else:
    print("AUTRE ERREUR ->", body)
