"""setup_supabase_insert.py — insert réel d'un article de démo dans TON schéma 'articles'.

Adapte le fact HITL aux colonnes EXISTANTES (lu par probe). N'écrit JAMAIS wp_*.
Dédupe par source_url. Aucune credential dans le fichier (env).
"""
import os, json, sys, urllib.request, urllib.error

URL = os.environ.get("SUPABASE_URL","").rstrip("/")
KEY = os.environ.get("SUPABASE_KEY","")
if not URL or not KEY:
    print("ERREUR: SUPABASE_URL / SUPABASE_KEY en env."); sys.exit(1)

H = {"Content-Type":"application/json","apikey":KEY,"Authorization":"Bearer "+KEY,"Prefer":"return=representation"}

def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(URL.rstrip("/")+path, data=data, method=method, headers=H)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:500]
    except Exception as e:
        return -1, str(e)[:300]

# --- Dédupe : la table n'a pas de fact_id ; on utilise source_url ---
src_url = "https://mosaiqueguinee.com/kora-demo-2026"
st, body = req("GET", f"/rest/v1/articles?source_url=eq.{src_url}&select=id&limit=1")
if st == 200 and json.loads(body):
    print("[DEDUPE] article déjà présent -> on n'insère pas. OK (zéro écrasement).")
    sys.exit(0)
elif st != 200:
    print("[DEDUPE] erreur GET:", st, body)
    # on continue quand même en mode test
print("[DEDUPE] aucun existant -> insertion.")

# --- Article de démo (mapping HITL -> schéma réel) ---
demo = {
    "titre": "Guinée : accord minier signé à Conakry (démo KORA Reach)",
    "formule_titre": None,
    "chapeau": "Le gouvernement guinéen a signé un accord minier d'envergure à Conakry, selon plusieurs sources concordantes.",
    "corps": "La Guinée a signé un accord minier historique à Conakry ce jour. "
             "Plusieurs sources nationales (Mosaïque Guinée, Guinéenews, Guinée360) "
             "rapportent des faits convergents, fusionnés par l'agent Reach. "
             "Contexte complémentaire disponible auprès des rédactions concernées.",
    "meta_description": "Accord minier signé à Conakry : synthèse multi-sources par KORA Reach.",
    "mots_cles": ["Guinée", "Conakry", "accord minier", "KORA Reach"],
    "categorie_id": None,
    "source_url": src_url,
    "source_nom": "mosaiqueguinee.com",
    "source_level": 1,
    "image_url": "",
    "image_prompt": "",
    "llm_provider_used": None,
    "llm_model_used": "template",
    "status": "PENDING_REVIEW",
    "origin": "AGENT_SEMI",
}

st, body = req("POST", "/rest/v1/articles", demo)
print("[INSERT] ->", st, body[:400])
if st in (200, 201):
    print("✅ INSERT RÉEL RÉUSSI dans ta table 'articles' (schéma respecté, wp_* intacts).")
else:
    print("⚠️ Insert refusé -> on lit le message et on ajuste (aucune modification aveugle).")

# --- Nettoyage des lignes de test parasites créées pendant le probing ---
for junk in ["x"]:
    dq = req("DELETE", f"/rest/v1/articles?titre=eq.{junk}&corps=eq.y")
    if dq[0] in (200, 204):
        print(f"[NETTOYAGE] ligne test '{junk}' supprimée.")
