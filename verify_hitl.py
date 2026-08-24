"""verify_hitl.py — valide le flux HITL de bout en bout (serveur + client même process)."""
import threading, time, json, urllib.request, os
os.chdir("/opt/data/kora-reach")
try: os.remove("reach_state.db")
except: pass

import server
threading.Thread(target=server.main, daemon=True).start()
time.sleep(6)

import collection.whitelist as wl
from orchestration.reach_agent import agent
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import core.config as config
from collection.normalizer import normalize, TZ
from collection.dossiers import regrouper_dossiers, pick_champion
from generation.writer import write_article
from editorial.hitl_store import fact_id_of, get as hitl_get

def post(p, data):
    req = urllib.request.Request("http://127.0.0.1:8765"+p, data=json.dumps(data).encode(),
                                headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())

def get(p):
    with urllib.request.urlopen("http://127.0.0.1:8765"+p, timeout=30) as r:
        return json.loads(r.read().decode())

# --- 1. Générer 2 faits réels via la logique reconçue (items factices <24h) ---
cs = datetime.now(TZ)
recent = cs - timedelta(hours=2)
raws = [
  {"title":"Guinée: accord minier signé à Conakry","url":"https://mosaiqueguinee.com/a1","summary":"Le gouvernement guinéen a signé.","raw_content":"Accord minier en Guinée à Conakry ce jour.","published_at":recent.strftime("%Y-%m-%dT%H:%M:%S")},
  {"title":"Guinée: signature d'un accord minier à Conakry","url":"https://guineenews.org/a1","summary":"Conakry accueille.","raw_content":"La Guinée signe un accord minier historique.","published_at":recent.strftime("%a, %d %b %Y %H:%M:%S %z")},
  {"title":"Accord minier en Guinée scellé à Conakry","url":"https://guinee360.com/a1","summary":"Signature.","raw_content":"En Guinée, accord minier signé ce vendredi.","published_at":recent.strftime("%Y-%m-%d %H:%M:%S")},
  {"title":"Guinée: la BAD finance un barrage à Koukoutamba","url":"https://mosaiqueguinee.com/b1","summary":"La BAD approuve.","raw_content":"Le barrage de Koukoutamba est financé par la BAD.","published_at":recent.strftime("%Y-%m-%dT%H:%M:%S")},
  {"title":"Koukoutamba: financement BAD pour le barrage","url":"https://guineenews.org/b1","summary":"Financement validé.","raw_content":"La BAD finance le barrage de Koukoutamba en Guinée.","published_at":recent.strftime("%Y-%m-%d %H:%M:%S")},
]
src = wl.get_entry("mosaique")
docs = [normalize(r, src, cs) for r in raws]
pool = [d for d in docs if d["actual"]]
dossiers = regrouper_dossiers(pool, config.LIMITS["dossier_sim_threshold"])
facts = []
for dossier in dossiers:
    champ, ctx = pick_champion(dossier)
    fact = {"champion": champ, "contexts": ctx, "n_sources": len(dossier)}
    w = write_article(fact)
    fact["article"] = w["article"]; fact["gen_model"] = w["model"]
    facts.append(fact)

# Injecter dans LAST_CYCLE du serveur
with server._LAST_LOCK:
    server.LAST_CYCLE["result"] = {"status":"ok","facts":facts,"facts_to_generate":len(facts)}
print(f"[1] {len(facts)} fait(s) généré(s) -> injecté dans LAST_CYCLE")

# --- 2. GET /api/hitl (doit être PENDING_REVIEW) ---
items = get("/api/hitl")
print(f"[2] /api/hitl -> {len(items)} proposition(s), statuts={[i['status'] for i in items]}")
assert items and items[0]["status"] == "PENDING_REVIEW", "Attendu PENDING_REVIEW"

# --- 3. Approuver le fait 0 (déclenche transmission dry_run) ---
fid0 = items[0]["fact_id"]
r = post("/api/hitl/decide", {"fact_id": fid0, "decision":"APPROVED", "edited_text": items[0]["article"]})
print(f"[3] APPROUVER {fid0[:12]}... -> {r.get('ok')} transmission={r.get('transmission',{}).get('status')} provider={r.get('transmission',{}).get('provider')}")
assert r.get("ok"), f"Décision refusée: {r}"
assert r.get("transmission",{}).get("status") in ("DRY_RUN_OK","TRANSMITTED"), "Transmission échue"
d0 = hitl_get(fid0)
print(f"    état persisté = {d0['status']} | by={d0['decided_by']}")

# --- 4. Rejeter le fait 1 ---
fid1 = items[1]["fact_id"] if len(items)>1 else None
if fid1:
    r2 = post("/api/hitl/decide", {"fact_id": fid1, "decision":"REJECTED"})
    print(f"[4] REJETER {fid1[:12]}... -> {r2.get('ok')} état={hitl_get(fid1)['status']}")
    assert hitl_get(fid1)["status"] == "REJECTED"

# --- 5. Re-décision sur REJECTED doit être refusée (verrou) ---
if fid1:
    r3 = post("/api/hitl/decide", {"fact_id": fid1, "decision":"APPROVED"})
    print(f"[5] re-APPROUVER un REJECTED -> refus attendu: {r3.get('error')}")
    assert r3.get("error") == "transition_interdite"

# --- 6. Retrait du fait 0 (TRANSMITTED -> RETRACTED) ---
r4 = post("/api/hitl/retract", {"fact_id": fid0})
print(f"[6] RETRAIT {fid0[:12]}... -> {r4.get('ok')} état={hitl_get(fid0)['status']}")
assert hitl_get(fid0)["status"] == "RETRACTED"

# --- 7. Audit trace les événements ---
ev = get("/api/audit")
kinds = [e["event"] for e in ev]
print(f"[7] AUDIT -> {len(ev)} events, types={sorted(set(kinds))}")
assert any("HITL" in k for k in kinds), "Aucun événement HITL tracé"

print("\n✅ FLUX HITL VALIDÉ : PENDING -> APPROVED -> TRANSMITTED(dry_run) -> RETRACTED ; REJECTED verrouillé")
