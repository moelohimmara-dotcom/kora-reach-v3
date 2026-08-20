"""test_reconception.py — prouve le flux reconçu sur items factices <24h.
Pas de collecte réseau : on injecte des documents normalisés récents pour
valider fenêtre glissante + filtre Guinée + cluster + writer + audit.
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import core.config as config
import collection.whitelist as wl
from collection.normalizer import normalize, TZ
from collection.guinea_filter import filter_guinea
from collection.dedup import url_hash, is_dup
from collection.clusterer import cluster, pick_champion
from generation.writer import write_article
from editorial.audit import log, get_events
import os
# Reset DB pour test déterministe (AVANT import state_store qui crée les tables)
_db = os.path.join(os.path.dirname(__file__), "reach_state.db")
if os.path.exists(_db):
    os.remove(_db)
from editorial.state_store import seen, mark
# cycle_start = maintenant (fenêtre glissante)
cs = datetime.now(TZ)
recent = cs - timedelta(hours=2)  # <24h -> actual

# Items factices : 3 sources sur MEME fait (fusion attendue) + 1 fait distinct
items_raw = [
    {"title": "Guinée: accord minier signé à Conakry", "url": "https://mosaiqueguinee.com/a1",
     "summary": "Le gouvernement guinéen a signé un accord.", "raw_content": "Accord minier en Guinée à Conakry ce jour.", "published_at": recent.strftime("%Y-%m-%dT%H:%M:%S")},
    {"title": "Guinée: signature d'un accord minier à Conakry", "url": "https://guineenews.org/a1",
     "summary": "Conakry accueille la signature.", "raw_content": "La Guinée signe un accord minier historique.", "published_at": recent.strftime("%a, %d %b %Y %H:%M:%S %z")},
    {"title": "Accord minier en Guinée scellé à Conakry", "url": "https://guinee360.com/a1",
     "summary": "Signature à Conakry.", "raw_content": "En Guinée, accord minier signé ce vendredi.", "published_at": recent.strftime("%Y-%m-%d %H:%M:%S")},
    {"title": "Guinée-Bissau: élection présidentielle", "url": "https://mosaiqueguinee.com/b1",
     "summary": "Bissau vote.", "raw_content": "Guinée-Bissau organise une élection.", "published_at": recent.strftime("%Y-%m-%dT%H:%M:%S")},
]
src = wl.get_entry("mosaique")
docs = [normalize(r, src, cs) for r in items_raw]

# Filtre INTL non applicable ici (GN_NAT), mais testons le filtre sur Bissau
g_bissau, mot = filter_guinea(docs[3]["raw_content"])
assert g_bissau is False and mot == "AUTRE_PAYS_EXCLU", f"Filtre Bissau a échoué: {mot}"
g_ok, mot2 = filter_guinea(docs[0]["title"] + " " + docs[0]["raw_content"])
assert g_ok is True, f"Filtre Guinée a échoué: {mot2}"

# Pool = actual (tous <24h)
pool = [d for d in docs if d["actual"]]
assert len(pool) == 4, f"Fenêtre 24h: attendu 4 actual, eu {len(pool)}"

# Dedup + cluster
seen_u, seen_t = set(), []
uniq = []
for d in pool:
    if seen(url_hash(d["url"])) or is_dup(d, seen_u, seen_t):
        continue
    seen_u.add(url_hash(d["url"])); seen_t.append(d["title"]); uniq.append(d)

clusters = cluster(uniq, config.LIMITS["cluster_sim_threshold"])
assert len(clusters) == 2, f"Attendu 2 clusters (1 fusion + 1 Bissau), eu {len(clusters)}"

# Le plus gros cluster = fusion attendue
big = max(clusters, key=len)
assert len(big) == 3, f"Fusion 3->1 attendue, eu {len(big)} membres"
champ, ctx = pick_champion(big)
assert len(ctx) >= 1, "Champion doit avoir >=1 contexte (fusion)"

# Writer
fact = {"champion": champ, "contexts": ctx, "n_sources": len(clusters[0])}
written = write_article(fact)
assert written["article"], "Article vide"

# Audit
log("TEST_CID", "FACT_GEN", "provider="+written["model"], written["model"])
events = get_events("TEST_CID")
assert any(e["event"] == "FACT_GEN" for e in events), "Audit manquant"

print("✅ RECONCEPTION OK")
print(f"  - Fenêtre 24h: 4 actual / 4 items")
print(f"  - Filtre Guinée: accepté | Bissau: rejeté ({mot})")
print(f"  - Clustering: {len(clusters)} clusters (fusion 3->1 prouvée)")
print(f"  - Champion: {champ['source']} + {len(ctx)} contexte(s)")
print(f"  - Writer: {written['model']} | article {len(written['article'])} car.")
print(f"  - Audit: {len(events)} événement(s) tracé(s)")
