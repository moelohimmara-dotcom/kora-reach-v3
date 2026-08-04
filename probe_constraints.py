"""probe_constraints.py — lit les contraintes RÉELLES de 'articles' (NOT NULL, FK, defaults)."""
import os, json, urllib.request, urllib.error
URL = os.environ.get("SUPABASE_URL","").rstrip("/")
KEY = os.environ.get("SUPABASE_KEY","")
def get(path, headers=None):
    h = {"apikey":KEY,"Authorization":"Bearer "+KEY}
    if headers: h.update(headers)
    r = urllib.request.Request(URL.rstrip("/")+path, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]
    except Exception as e:
        return -1, str(e)[:200]

# 1. Colonnes : nullable + défaut + type
st, body = get("/rest/v1/information_schema.columns?table_name=eq.articles&select=column_name,is_nullable,data_type,column_default",
               {"Accept-Profile":"information_schema"})
print("[COLONNES]", st)
if st == 200:
    for c in json.loads(body):
        print(f"  {c['column_name']:20} nullable={c['is_nullable']:3} type={c['data_type']:12} def={str(c['column_default'])[:30]}")

# 2. Contraintes FK (table_constraints + key_column_usage)
st2, body2 = get("/rest/v1/information_schema.table_constraints?table_name=eq.articles&constraint_type=eq.FOREIGN%20KEY&select=constraint_name,column_name",
                 {"Accept-Profile":"information_schema"})
print("[FK]", st2, body2[:300])
