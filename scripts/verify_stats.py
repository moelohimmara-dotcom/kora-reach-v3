#!/usr/bin/env python3
"""
verify_stats.py — Test de non-régression du dashboard KORA.

Vérifie que l'endpoint SSOT /api/stats (calculé par le backend) est COHÉRENT
avec les compteurs recalculés INDÉPENDAMMENT depuis la base PostgreSQL.

Principe (Single Source of Truth) : si /api/stats diverge de la base, c'est
qu'une régression s'est glissée dans get_dashboard_stats() — on alerte (exit 1).

Usage:
  python3 scripts/verify_stats.py [--base-url URL] [--env-file CHEMIN] [--strict]
  # Sur le VPS (après chaque déploiement) :
  sudo -u kora bash -c 'set -a; source deploy/.env; set +a; ./.venv/bin/python scripts/verify_stats.py'

Exit 0 = cohérent (SSOT validé) ; Exit 1 = divergence détectée (alerte).
"""
import os
import sys
import json
import argparse
import urllib.request


def env_from_file(path):
    env = {}
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return env


def login(base_url):
    user = os.environ.get("KORA_USER", "admin")
    pwd = os.environ.get("KORA_PASS") or os.environ.get("ADMIN_PASS") or ""
    if not pwd:
        import getpass
        pwd = getpass.getpass(f"Mot de passe pour {user}: ")
    data = json.dumps({"username": user, "password": pwd}).encode()
    req = urllib.request.Request(
        base_url + "/api/auth/login",
        data=data,
        headers={"Content-Type": "application/json"},
    )
    r = urllib.request.urlopen(req)
    return r.headers.get("Set-Cookie").split(";")[0]


def get_json(url, cookie):
    req = urllib.request.Request(url, headers={"Cookie": cookie})
    return json.load(urllib.request.urlopen(req))


def db_expected(e):
    """Recalcule les compteurs INDÉPENDAMMENT depuis la base (requêtes simples)."""
    import psycopg2
    conn = psycopg2.connect(
        host=e.get("PG_HOST", "127.0.0.1"),
        port=int(e.get("PG_PORT", "5432")),
        user=e.get("PG_USER", "kora"),
        password=e.get("PG_PASSWORD") or e.get("PGPASSWORD"),
        dbname=e.get("PG_DATABASE", "kora"),
    )
    os.environ["KORA_PASS"] = os.environ.get("KORA_PASS") or e.get("ADMIN_PASS") or e.get("PG_PASSWORD", "")
    cur = conn.cursor()
    cur.execute("SELECT status, count(*) FROM hitl_facts GROUP BY status")
    by = {}
    for st, n in cur.fetchall():
        by[st] = int(n)
    cur.execute("SELECT count(*) FROM articles WHERE lower(status) = 'published'")
    published = int(cur.fetchone()[0])
    cur.execute(
        "SELECT count(*) FROM hitl_facts f "
        "LEFT JOIN hitl_decisions d ON d.fact_id = f.fact_id "
        "WHERE f.status = 'REJECTED' OR (f.status = 'TRASHED' AND d.status = 'REJECTED')"
    )
    rejected = int(cur.fetchone()[0])
    cur.execute("SELECT count(*) FROM audit_events WHERE action IN ('SUPPRIME', 'PURGE')")
    deleted = int(cur.fetchone()[0])
    conn.close()
    return {
        "total_facts": sum(by.values()),
        "articles": by.get("PENDING_REVIEW", 0) + by.get("TRANSMITTED", 0) + by.get("EDITED", 0),
        "pending": by.get("PENDING_REVIEW", 0),
        "transmitted": by.get("TRANSMITTED", 0),
        "drafts": by.get("EDITED", 0),
        "trash": by.get("TRASHED", 0),
        "rejected": rejected,
        "published": published,
        "deleted": deleted,
    }


def main():
    ap = argparse.ArgumentParser(description="Vérifie la cohérence /api/stats vs base")
    ap.add_argument("--base-url", default="http://127.0.0.1:8766")
    ap.add_argument("--env-file", default=os.path.join(os.path.dirname(__file__), "..", "deploy", ".env"))
    args = ap.parse_args()

    e = env_from_file(args.env_file)
    os.environ.setdefault("KORA_USER", e.get("ADMIN_USER", "admin"))
    os.environ["KORA_PASS"] = os.environ.get("KORA_PASS") or e.get("ADMIN_PASS") or e.get("PGPASSWORD", "")

    cookie = login(args.base_url)
    api = get_json(args.base_url + "/api/stats", cookie)
    exp = db_expected(e)

    print("API /api/stats :", json.dumps(api, sort_keys=True))
    print("Base attendue  :", json.dumps(exp, sort_keys=True))

    diffs = {k: {"api": api.get(k), "db": v} for k, v in exp.items() if api.get(k) != v}
    if diffs:
        print("DIVERGENCE DÉTECTÉE :", json.dumps(diffs, sort_keys=True))
        sys.exit(1)
    print("OK — /api/stats cohérent avec la base (SSOT validé, aucune régression).")
    sys.exit(0)


if __name__ == "__main__":
    main()
