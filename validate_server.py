"""validate_server.py — démarre le serveur en subprocess et sonde les API."""
import subprocess, time, urllib.request, json, sys, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))
try: os.remove("reach_state.db")
except: pass

proc = subprocess.Popen(["./.venv/bin/python", "server.py"],
                        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
time.sleep(9)  # import trafilatura lourd

def get(path, data=None):
    url = "http://127.0.0.1:8765" + path
    try:
        if data is None:
            with urllib.request.urlopen(url, timeout=120) as r:
                return r.status, r.read().decode()
        else:
            req = urllib.request.Request(url, data=json.dumps(data).encode(),
                                         headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.status, r.read().decode()
    except Exception as e:
        return "ERR", str(e)[:200]

s,b = get("/api/health")
print("HEALTH:", s, b[:150])

s,b = get("/api/whitelist")
try:
    wl = json.loads(b)
    print("WHITELIST:", s, "entries=", len(wl))
except Exception as e:
    print("WHITELIST parse err:", b[:200])

s,b = get("/api/audit")
print("AUDIT:", s, "events=", len(json.loads(b)) if b.startswith("[") else b[:80])

s,b = get("/api/cycle", {"scope":"INTL","demand":3,"initiator":"validate"})
try:
    res = json.loads(b)
    print("CYCLE:", res.get("status"), "| src_ok=",res.get("sources_ok"),
          "| items=",res.get("total_items"), "| rej=",res.get("rejected_intl"),
          "| dossiers=",res.get("dossiers"), "| facts=",res.get("facts_to_generate"))
    if res.get("facts"):
        f0=res["facts"][0]
        print("  FACT0:", f0["article_retenu"]["source"], "::", f0["article_retenu"]["title"][:45],
              "| gen=",f0["gen_model"], "| img=",bool(f0.get("image")))
except Exception as e:
    print("CYCLE err:", b[:200])

s,b = get("/api/audit")
print("AUDIT post:", s, "events=", len(json.loads(b)) if b.startswith("[") else b[:80])

proc.terminate()
print("=== server log ===")
print(proc.stdout.read()[:800] if proc.stdout else "")
