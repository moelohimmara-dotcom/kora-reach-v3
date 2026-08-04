"""test_wp_auth.py — valide l'authentification WordPress (GET user, aucune écriture)."""
import os, base64, json, urllib.request, urllib.error

WP_URL = os.environ.get("WP_URL", "https://kakilambe.com").rstrip("/")
WP_USER = os.environ.get("WP_USER", "harvingt")
WP_PASS = os.environ.get("WP_APP_PASS", "").replace(" ", "")  # retire espaces du app-password

def auth_header():
    return "Basic " + base64.b64encode(f"{WP_USER}:{WP_PASS}".encode()).decode()

# Test 1 : GET /wp-json/wp/v2/users/me (vérifie auth, lit rien d'autre)
req = urllib.request.Request(
    WP_URL + "/wp-json/wp/v2/users/me",
    headers={"Authorization": auth_header()})
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read().decode())
        print("[AUTH] OK -> user:", data.get("name"), "| id:", data.get("id"), "| roles:", data.get("roles"))
except urllib.error.HTTPError as e:
    print("[AUTH] HTTP", e.code, e.read().decode()[:300])
except Exception as e:
    print("[AUTH] ERREUR", str(e)[:200])

# Test 2 : GET /wp-json/wp/v2/posts?status=draft (vérifie qu'on peut lister, aucune écriture)
req2 = urllib.request.Request(
    WP_URL + "/wp-json/wp/v2/posts?per_page=1",
    headers={"Authorization": auth_header()})
try:
    with urllib.request.urlopen(req2, timeout=30) as r:
        print("[LIST] OK -> posts accessibles")
except urllib.error.HTTPError as e:
    print("[LIST] HTTP", e.code, e.read().decode()[:200])
except Exception as e:
    print("[LIST] ERREUR", str(e)[:200])
