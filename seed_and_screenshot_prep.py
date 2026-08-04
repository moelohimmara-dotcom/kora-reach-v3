"""seed_and_screenshot_prep.py — démarre serveur + seed dans le même process."""
import threading, time, json, urllib.request, os
os.chdir("/opt/data/kora-reach")
try: os.remove("reach_state.db")
except: pass
import server
threading.Thread(target=server.main, daemon=True).start()
time.sleep(6)
def get(p):
    with urllib.request.urlopen("http://127.0.0.1:8765"+p, timeout=60) as r:
        return r.read().decode()
print("SEED:", get("/api/seed_demo"))
import json as J
h = J.loads(get("/api/hitl"))
print("HITL:", len(h), "propositions, statuts:", [x["status"] for x in h])
print("READY")
