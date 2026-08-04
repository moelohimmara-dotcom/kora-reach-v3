"""test_wp_draft.py — publie un BROUILLON WordPress réel (status=draft, invisible public)."""
import os, base64, json, urllib.request, urllib.error

WP_URL = os.environ.get("WP_URL", "https://kakilambe.com").rstrip("/")
WP_USER = os.environ.get("WP_USER", "harvingt")
WP_PASS = os.environ.get("WP_APP_PASS", "").replace(" ", "")

def auth_header():
    return "Basic " + base64.b64encode(f"{WP_USER}:{WP_PASS}".encode()).decode()

# Brouillon (invisible sur le site public) pour valider le flux
body = json.dumps({
    "title": "Test KORA Reach — brouillon (à supprimer)",
    "content": "Article de validation du branchement WordPress depuis l'agent Reach. Statut brouillon.",
    "status": "draft",
    "meta": {"source_url": "https://mosaiqueguinee.com/kora-wp-test"}
}).encode()

req = urllib.request.Request(
    WP_URL + "/wp-json/wp/v2/posts",
    data=body, method="POST",
    headers={"Content-Type": "application/json", "Authorization": auth_header()})
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.loads(r.read().decode())
        print("[DRAFT] PUBLIÉ (brouillon) -> id:", d.get("id"), "| status:", d.get("status"), "| url:", d.get("link"))
        print("DRAFT_ID=", d.get("id"))
except urllib.error.HTTPError as e:
    print("[DRAFT] HTTP", e.code, e.read().decode()[:400])
except Exception as e:
    print("[DRAFT] ERREUR", str(e)[:200])
