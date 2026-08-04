"""run_cycle_and_show.py — déclenche un cycle via l'API et affiche le résumé."""
import urllib.request, json, time

def post(path, data):
    req = urllib.request.Request("http://127.0.0.1:8767"+path,
        data=json.dumps(data).encode(), headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode())

print("Déclenchement cycle INTL (demand=3)...")
res = post("/api/cycle", {"scope":"INTL","demand":3,"initiator":"demo"})
print("STATUS:", res.get("status"))
print("sources_ok=",res.get("sources_ok"),"items=",res.get("total_items"),
      "rejected_intl=",res.get("rejected_intl"),"clusters=",res.get("clusters"),
      "facts=",res.get("facts_to_generate"))
if res.get("facts"):
    for i,f in enumerate(res["facts"][:3]):
        print(f"  [{i}] {f['champion']['source']} :: {f['champion']['title'][:50]} | gen={f['gen_model']} | img={bool(f.get('image'))}")
else:
    print("  (aucun fait dans la fenêtre 24h — comportement attendu si articles >24h)")
