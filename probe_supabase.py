"""probe_supabase.py — liste INTÉGRALE des colonnes de 'articles' existante."""
import os, json, urllib.request, urllib.error
URL = os.environ.get("SUPABASE_URL","").rstrip("/")
KEY = os.environ.get("SUPABASE_KEY","")
H = {"apikey":KEY,"Authorization":"Bearer "+KEY}
# On lit une ligne et on infère les colonnes présentes
r = urllib.request.Request(URL.rstrip("/")+"/rest/v1/articles?select=*&limit=1", headers=H)
try:
    with urllib.request.urlopen(r, timeout=20) as resp:
        data = json.loads(resp.read().decode())
    if data:
        print("COLONNES EXISTANTES:", sorted(data[0].keys()))
        print("EXEMPLE (1 ligne, valeurs tronquées):")
        for k,v in data[0].items():
            s = str(v)
            print(f"  - {k}: {s[:60]}{'…' if len(s)>60 else ''}")
    else:
        print("Table vide, mais existe. Colonnes non déductibles via select=* sur 0 ligne.")
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read().decode()[:400])
