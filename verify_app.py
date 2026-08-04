"""verify_app.py — valide l'app KORA de bout en bout dans un seul process."""
import subprocess, time, urllib.request, json, threading, os, sys

os.chdir("/opt/data/kora-reach")
try: os.remove("reach_state.db")
except: pass

import server
threading.Thread(target=server.main, daemon=True).start()
time.sleep(6)  # import trafilatura

def get(p, data=None):
    url = "http://127.0.0.1:8765" + p
    try:
        if data is None:
            with urllib.request.urlopen(url, timeout=120) as r:
                return r.status, r.read().decode()
        req = urllib.request.Request(url, data=json.dumps(data).encode(),
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, r.read().decode()
    except Exception as e:
        return "ERR", str(e)[:160]

print("1) HEALTH:", get("/api/health")[1][:90])
s,b = get("/api/whitelist"); w=json.loads(b); print(f"2) WHITELIST: {s} -> {len(w)} sources (ex: {w[0]['id']}, {w[-1]['id']})")
s,b = get("/api/audit"); print(f"3) AUDIT (avant cycle): {s} -> {len(json.loads(b))} events (table OK)")
s,b = get("/api/cycle", {"scope":"INTL","demand":3,"initiator":"verify"})
r=json.loads(b)
print(f"4) CYCLE: {s} -> status={r.get('status')} src_ok={r.get('sources_ok')} items={r.get('total_items')} rej={r.get('rejected_intl')} stale={r.get('stale_count')}")
s,b = get("/api/audit"); ev=json.loads(b); print(f"5) AUDIT (après cycle): {s} -> {len(ev)} events (ex: {ev[0]['event'] if ev else 'aucun'})")
s,b = get("/api/last"); print(f"6) LAST: {s} -> status={json.loads(b).get('status')}")
s,b = get("/index.html"); print(f"7) INDEX.HTML: {s} ({len(b)} bytes, <title>={'KORA' in b})")
s,b = get("/app.css"); print(f"8) APP.CSS: {s} ({len(b)} bytes)")
s,b = get("/app.js"); print(f"9) APP.JS: {s} ({len(b)} bytes)")
print("\n✅ VÉRIFICATION TERMINÉE")
