"""probe_check.py — insert minimal pour révéler la contrainte CHECK exacte."""
import os, json, urllib.request, urllib.error
URL = os.environ.get("SUPABASE_URL","").rstrip("/")
KEY = os.environ.get("SUPABASE_KEY","")
H = {"Content-Type":"application/json","apikey":KEY,"Authorization":"Bearer "+KEY,"Prefer":"return=representation"}
def req(body):
    r = urllib.request.Request(URL.rstrip("/")+"/rest/v1/articles", data=json.dumps(body).encode(), method="POST", headers=H)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
    except Exception as e:
        return -1, str(e)[:300]

# Insert ultra-minimal pour isoler la contrainte
print("MINIMAL:", req({"titre":"x","corps":"y","status":"PENDING_REVIEW","origin":"AGENT_REACH"}))
print("STATUS alt PENDING:", req({"titre":"x","corps":"y","status":"PENDING","origin":"AGENT_REACH"}))
print("STATUS DRAFT:", req({"titre":"x","corps":"y","status":"DRAFT","origin":"AGENT_REACH"}))
print("ORIGIN alt:", req({"titre":"x","corps":"y","status":"PENDING_REVIEW","origin":"KORA_REACH"}))
