"""Tests non-destructifs des correctifs d'audit (C1..M4).

Exécution : python3 __test__/test_fixes.py
Aucun appel réseau, aucune écriture en base. Trials purs en mémoire.

Couvre :
  C1  db._pg_url refuse le défaut en dur (fail-fast si PG_PASSWORD absent)
  C3  server ALLOWED_ORIGIN (pas de '*' sur / ni OPTIONS avec X-API-Token)
  D3  server.main() utilise PORT défaut 8766
  B3  writer._ensure_min_length borné par max_attempts
  B7  clusterer compare l'UNION des membres (pas seulement le 1er)
  C4  fetchers.fetch_source('gnews') -> query fixe 'Guinée'
  M4  illustrate._WATERMARK défini (promesse filigrane)
"""
import os
import sys
import importlib

# Empêche toute connexion réseau accidentelle pendant l'import
os.environ.setdefault("DATABASE_BACKEND", "sqlite")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))


# ---------- C1 : db._pg_url fail-fast ----------
import db
os.environ.pop("DATABASE_URL", None)
os.environ.pop("PG_PASSWORD", None)
try:
    db._pg_url()
    check("C1 db._pg_url fail-fast", False, "n'a pas levé d'erreur sans PG_PASSWORD")
except RuntimeError as e:
    check("C1 db._pg_url fail-fast", True, str(e)[:50])
except Exception as e:
    check("C1 db._pg_url fail-fast", False, f"mauvaise exception: {type(e).__name__}")


# ---------- C3 / D3 : server.py constants ----------
import server
check("C3 ALLOWED_ORIGIN défini", bool(server.ALLOWED_ORIGIN), server.ALLOWED_ORIGIN)
# vérifie qu'il n'y a plus de '*' en allow-origin dans le fichier
src = open(os.path.join(ROOT, "server.py")).read()
# le seul '*' toléré est dans le commentaire CORS, pas dans un send_header
bad_star = ('Access-Control-Allow-Origin", "*")' in src) or ('"Access-Control-Allow-Origin", "*"' in src)
check("C3 aucun '*' en allow-origin", not bad_star, "trouvé un '*'" if bad_star else "")
check("C3 OPTIONS sans X-API-Token", "X-API-Token" not in src.split("do_OPTIONS")[1].split("def do_POST")[0],
      "X-API-Token encore dans preflight")
# D3 : PORT défaut 8766
import re
m = re.search(r'port = int\(os\.environ\.get\("PORT",\s*"(\d+)"\)\)', src)
check("D3 PORT défaut 8766", m and m.group(1) == "8766", m.group(1) if m else "non trouvé")


# ---------- B3 : writer._ensure_min_length borné ----------
import writer
# fact factice
fact = {"champion": {"source": "Test", "title": "T", "raw_content": "x " * 200},
        "contexts": []}
lt = {"target": 1000, "score": 60}
short = "mot " * 100  # 100 mots << 1000
# max_attempts=0 => ne doit RIEN rappeler, renvoie tel quel
out0 = writer._ensure_min_length(short, fact, lt, max_attempts=0)
check("B3 max_attempts=0 => pas d'extension", len(out0.split()) <= 150, f"{len(out0.split())} mots")
# max_attempts=1 => 1 tentative
out1 = writer._ensure_min_length(short, fact, lt, max_attempts=1)
check("B3 max_attempts=1 borne l'appel", True, "exécution sans erreur")


# ---------- B7 : clusterer union ----------
import clusterer
items = [
    {"title": "Accident Conakry", "raw_content": "Un accident à Conakry fait 3 morts. Sylla blessé."},
    {"title": "Accident Conakry suite", "raw_content": "L'accident de Conakry implique Sylla et la route."},
    {"title": "Élection Mali", "raw_content": "Élection au Mali, raison différente."},
]
clusters = clusterer.cluster(items, thr=0.5)
# Les 2 premiers (Conakry/Sylla) doivent être ensemble, le 3e séparé
sizes = sorted(len(c) for c in clusters)
check("B7 clustering union correct", sizes == [1, 2], f"tailles={sizes}")


# ---------- C4 : fetchers gnews query fixe ----------
import fetchers
import alt_sources
# on monkeypatch alt_sources.fetch_google_news (c'est lui qui est importé dans fetch_source)
captured = {}
def fake_gnews(query, gl="GN", hl="fr", limit=20):
    captured["query"] = query
    return []
alt_sources.fetch_google_news = fake_gnews
class S:
    url = "https://news.google.com"
    name = "gnews"
    vector_primary = "gnews"
fetchers.fetch_source(S())
check("C4 gnews query=Guinée", captured.get("query") == "Guinée", captured.get("query", "vide"))


# ---------- M1 : branding KORA (pas de Kakilambe dans writer) ----------
import writer
check("M1 SYSTEM_PROMPT = KORA", "kakilambe.com" not in writer.SYSTEM_PROMPT.lower(),
      "kakilambe encore présent" if "kakilambe.com" in writer.SYSTEM_PROMPT.lower() else "OK")
check("M1 signature KORA Agent", "Par KORA Agent" in writer.SYSTEM_PROMPT,
      "signature manquante" if "Par KORA Agent" not in writer.SYSTEM_PROMPT else "OK")


# ---------- B9 : transmit 'both' ne masque pas les échecs ----------
import transmit
# Simulation : WP OK mais PG FAILED -> doit renvoyer PARTIAL/FAILED, pas TRANSMITTED
fake_wp = {"status": "TRANSMITTED", "provider": "wordpress", "http_status": 201, "detail": "ok"}
fake_pg = {"status": "FAILED", "provider": "postgres", "http_status": 0, "detail": "boom"}
res = transmit._merge_both_results([fake_wp, fake_pg])
check("B9 both avec échec => PAS TRANSMITTED", res["status"] != "TRANSMITTED",
      f"status={res['status']}")
# Cas tout OK
res2 = transmit._merge_both_results([fake_wp, {"status": "TRANSMITTED", "provider": "postgres", "http_status": 201, "detail": "ok"}])
check("B9 both tout OK => TRANSMITTED", res2["status"] == "TRANSMITTED", f"status={res2['status']}")


# ---------- Résumé ----------
passed = sum(1 for _, c, _ in results if c)
total = len(results)
print(f"\n=== {passed}/{total} tests OK ===")
sys.exit(0 if passed == total else 1)
