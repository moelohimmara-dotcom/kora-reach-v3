#!/usr/bin/env python3
"""backfill_published_status.py — rattrapage historique du compteur "Publiés".

CONTEXTE
--------
Avant le correctif "ferme la boucle" (transmit._mark_article_published), aucun code
ne repassait `articles.status` à 'published' après une publication WordPress. Les
articles publiés AVANT ce correctif sont donc restés en 'PENDING_REVIEW' dans
l'entrepôt, et n'apparaissent pas dans la carte "Publiés" du dashboard.

Ce script rattrape UNIQUEMENT l'historique : il repasse à 'published' les lignes
`articles` dont le JOURNAL D'AUDIT PROUVE qu'elles ont réellement été publiées sur
WordPress. Il n'invente rien et ne touche jamais les démos / dry_run.

RÈGLE DE SÉLECTION (sans faux positif)
--------------------------------------
Un article (identifié par source_url) est rattrapé si, et seulement si, son fait HITL
correspondant porte une décision :
  - status  = 'TRANSMITTED'         (transmission réussie)
  - provider IN ('both','wordpress') (WordPress a réellement été appelé — PAS dry_run,
                                       PAS postgres/supabase seuls)
  - http_status IN (200, 201)        (succès HTTP côté WordPress)
et que la ligne `articles` n'est pas déjà 'published'.

SÉCURITÉ
--------
- APERÇU PAR DÉFAUT : sans --apply, le script ne modifie RIEN. Il montre la
  distribution actuelle des statuts, le nombre de candidats et un échantillon.
- ÉCRITURE seulement avec --apply, dans UNE transaction (tout ou rien).
- IDEMPOTENT : relancer ne réécrit pas les lignes déjà 'published'.
- FAIS UNE SAUVEGARDE de la base avant --apply (voir README ci-dessous).

USAGE
-----
  # 1) Aperçu (aucune modification) — sur le VPS, avec l'environnement de prod :
  sudo -u kora bash -c 'set -a; source deploy/.env; set +a; \
      DATABASE_BACKEND=postgres ./.venv/bin/python scripts/backfill_published_status.py'

  # 2) Sauvegarde Postgres (exemple) :
  pg_dump "$DATABASE_URL" > /tmp/kora_avant_backfill.sql

  # 3) Application réelle :
  sudo -u kora bash -c 'set -a; source deploy/.env; set +a; \
      DATABASE_BACKEND=postgres ./.venv/bin/python scripts/backfill_published_status.py --apply'
"""
import os
import sys
import json
import argparse

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import core.db as db  # noqa: E402


REAL_WP_PROVIDERS = ("both", "wordpress")
OK_HTTP = (200, 201)


def _val(row, key, idx):
    """Accès tolérant sqlite3.Row (par nom) / tuple (par index)."""
    try:
        return row[key]
    except (KeyError, IndexError, TypeError):
        try:
            return row[idx]
        except Exception:
            return None


def published_source_urls(con) -> set:
    """Ensemble des source_url réellement publiés sur WordPress (preuve d'audit)."""
    cur = con.cursor()
    cur.execute(
        "SELECT f.article_retenu AS article_retenu, d.provider AS provider, d.http_status AS http_status "
        "FROM hitl_decisions d JOIN hitl_facts f ON f.fact_id = d.fact_id "
        "WHERE d.status = 'TRANSMITTED'")
    urls = set()
    for row in cur.fetchall():
        article_retenu = _val(row, "article_retenu", 0)
        provider = _val(row, "provider", 1)
        http_status = _val(row, "http_status", 2)
        if provider not in REAL_WP_PROVIDERS:
            continue
        try:
            if int(http_status) not in OK_HTTP:
                continue
        except (TypeError, ValueError):
            continue
        try:
            champ = json.loads(article_retenu) if article_retenu else {}
        except (json.JSONDecodeError, TypeError):
            champ = {}
        url = (champ or {}).get("url", "")
        if url:
            urls.add(url)
    return urls


def status_distribution(con) -> dict:
    cur = con.cursor()
    cur.execute("SELECT status, count(*) FROM articles GROUP BY status")
    out = {}
    for row in cur.fetchall():
        st = _val(row, "status", 0)
        cnt = _val(row, "count", 1)
        out[st] = int(cnt or 0)
    return out


def candidates(con, wp_urls: set) -> list:
    """Lignes `articles` à rattraper : pas déjà publiées ET source_url prouvé publié."""
    cur = con.cursor()
    cur.execute("SELECT source_url, status FROM articles")
    out = []
    for row in cur.fetchall():
        src = _val(row, "source_url", 0)
        st = _val(row, "status", 1)
        if src and src in wp_urls and (st or "").lower() != "published":
            out.append((src, st))
    return out


def main():
    ap = argparse.ArgumentParser(
        description="Rattrapage historique : marque 'published' les articles réellement publiés sur WordPress.")
    ap.add_argument("--apply", action="store_true",
                    help="Applique réellement les modifications (sinon: aperçu seul, aucune écriture).")
    ap.add_argument("--sample", type=int, default=10,
                    help="Nombre de candidats à afficher en aperçu (défaut: 10).")
    args = ap.parse_args()

    con, mode = db.conn()
    try:
        print(f"[backend] {mode}")
        before = status_distribution(con)
        print("[articles.status — distribution actuelle]",
              json.dumps(before, ensure_ascii=False, sort_keys=True))

        wp_urls = published_source_urls(con)
        print(f"[audit] {len(wp_urls)} source_url prouvés publiés sur WordPress "
              f"(TRANSMITTED + provider both/wordpress + http 200/201).")

        cand = candidates(con, wp_urls)
        print(f"[candidats] {len(cand)} article(s) à repasser 'PENDING_REVIEW' -> 'published'.")
        for src, st in cand[:max(0, args.sample)]:
            print(f"    - {st:>16}  {src}")
        if len(cand) > args.sample:
            print(f"    … (+{len(cand) - args.sample} autres)")

        if not cand:
            print("[fin] Rien à rattraper. La base est déjà cohérente.")
            return

        if not args.apply:
            print("\n[APERÇU] Aucune modification effectuée. "
                  "Relance avec --apply (APRÈS sauvegarde) pour écrire.")
            return

        # --- Écriture réelle, transactionnelle ---
        cur = con.cursor()
        ph = db.placeholder()
        changed = 0
        for src, _st in cand:
            cur.execute(
                f"UPDATE articles SET status='published' "
                f"WHERE source_url={ph} AND lower(status) <> 'published'",
                (src,))
            changed += cur.rowcount or 0
        con.commit()
        print(f"\n[APPLIQUÉ] {changed} ligne(s) mise(s) à jour -> 'published'.")
        after = status_distribution(con)
        print("[articles.status — nouvelle distribution]",
              json.dumps(after, ensure_ascii=False, sort_keys=True))
    finally:
        con.close()


if __name__ == "__main__":
    main()
