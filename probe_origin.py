"""probe_origin.py — découvre la valeur 'origin' autorisée par la CHECK constraint."""
import os, json, urllib.request, urllib.error
URL = os.environ.get("SUPABASE_URL","").rstrip("/")
KEY = os.environ.get("SUPABASE_KEY","")
H = {"Content-Type":"application/json","apikey":KEY,"Authorization":"Bearer "+KEY}
def req(origin):
    body = {"titre":"x","corps":"y","status":"PENDING_REVIEW","origin":origin}
    r = urllib.request.Request(URL.rstrip("/")+"/rest/v1/articles", data=json.dumps(body).encode(), method="POST", headers=H)
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            return resp.status, "OK"
    except urllib.error.HTTPError as e:
        msg = json.loads(e.read().decode()).get("message","")
        return e.code, msg
    except Exception as e:
        return -1, str(e)[:100]

for v in ["AGENT_SEMI","AGENT_AUTO","AGENT","SEMI","AUTO","HITL","MANUAL","KORA","REACH","AGENT_REACH_V3","HUMAN","EDITOR"]:
    st, msg = req(v)
    print(f"  origin={v:16} -> {st} {msg}")
