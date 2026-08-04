"""probe_categories.py — lit les catégories réelles pour mapper categorie_id."""
import os, json, urllib.request, urllib.error
URL = os.environ.get("SUPABASE_URL","").rstrip("/")
KEY = os.environ.get("SUPABASE_KEY","")
H = {"apikey":KEY,"Authorization":"Bearer "+KEY}
def get(path):
    r = urllib.request.Request(URL.rstrip("/")+path, headers=H)
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]
    except Exception as e:
        return -1, str(e)[:200]

for tbl in ["categories", "category", "categories_articles"]:
    st, body = get(f"/rest/v1/{tbl}?select=*&limit=20")
    if st == 200:
        data = json.loads(body)
        print(f"[TABLE {tbl}] {len(data)} lignes")
        for c in data[:20]:
            print("  ", c)
    else:
        print(f"[TABLE {tbl}] -> {st} (absente ou non lisible)")
