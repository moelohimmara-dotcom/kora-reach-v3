"""db.py — abstraction de connexion (SQLite ou PostgreSQL) pour KORA.

Sélection via variable d'environnement DATABASE_BACKEND (défaut: sqlite):
  - "sqlite"  -> reach_state.db (fichier local)
  - "postgres"-> base PostgreSQL locale (DATABASE_URL ou composants PG*)

Le reste du code (hitl_store, transmit) utilise db.conn() de manière agnostique.
Pour rester compatible avec l'existant, on émule sqlite3.Row via un wrapper
minimal sur les curseurs PostgreSQL (accès par nom de colonne).
"""
import os
import sqlite3

BACKEND = (os.environ.get("DATABASE_BACKEND") or "sqlite").lower()


def _pg_url():
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    user = os.environ.get("PG_USER", "kora")
    pwd = os.environ.get("PG_PASSWORD")
    if not pwd:
        raise RuntimeError("PG_PASSWORD manquant dans l'environnement (requis pour PostgreSQL)")
    host = os.environ.get("PG_HOST", "127.0.0.1")
    port = os.environ.get("PG_PORT", "5432")
    db = os.environ.get("PG_DATABASE", "kora")
    # Connexion locale -> désactiver SSL pour éviter les problèmes de certificat
    return f"postgresql://{user}:{pwd}@{host}:{port}/{db}?sslmode=disable"


def conn():
    """Retourne (connexion, mode) où mode ∈ {'sqlite','postgres'}."""
    if BACKEND == "postgres":
        import psycopg2
        import psycopg2.extras
        c = psycopg2.connect(_pg_url(), connect_timeout=10)
        c.cursor_factory = psycopg2.extras.RealDictCursor
        return c, "postgres"
    # SQLite par défaut. Racine du repo, pas le dossier de ce fichier
    # (2026-08-20, refactor monolithe modulaire : db.py vit desormais dans
    # core/) -- sinon un reach_state.db LOCAL/DEV distinct et vide serait
    # cree dans core/, deconnecte de celui deja utilise a la racine.
    _repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    db = os.path.join(_repo_root, "reach_state.db")
    # P0 (2026-08-23) : timeout + WAL + busy_timeout évitent "database is locked"
    # sous ThreadingHTTPServer (N threads + 2 pools). WAL est online et
    # idempotent ; busy_timeout fait patienter 30s au lieu de lever aussitôt.
    c = sqlite3.connect(db, timeout=30.0, check_same_thread=False, isolation_level=None)
    try:
        c.execute("PRAGMA journal_mode=WAL;")
        c.execute("PRAGMA synchronous=NORMAL;")
        c.execute("PRAGMA busy_timeout=30000;")
        c.execute("PRAGMA cache_size=-64000;")
        c.execute("PRAGMA foreign_keys=ON;")
    except Exception:
        pass
    c.row_factory = sqlite3.Row
    return c, "sqlite"


def is_postgres():
    return BACKEND == "postgres"


def placeholder(n=1):
    """? pour sqlite, %s pour postgres."""
    return "%s" if BACKEND == "postgres" else "?"


class Row(dict):
    """Compat sqlite3.Row : accès par [] et par .clé."""
    def __getattr__(self, k):
        try:
            return self[k]
        except KeyError:
            raise AttributeError(k)
