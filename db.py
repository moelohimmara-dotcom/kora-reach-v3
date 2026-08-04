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
    pwd = os.environ.get("PG_PASSWORD", "K0raP0stgr3s!2026")
    host = os.environ.get("PG_HOST", "127.0.0.1")
    port = os.environ.get("PG_PORT", "5432")
    db = os.environ.get("PG_DATABASE", "kora")
    return f"postgresql://{user}:{pwd}@{host}:{port}/{db}"


def conn():
    """Retourne (connexion, mode) où mode ∈ {'sqlite','postgres'}."""
    if BACKEND == "postgres":
        import psycopg2
        import psycopg2.extras
        c = psycopg2.connect(_pg_url(), connect_timeout=10)
        c.cursor_factory = psycopg2.extras.RealDictCursor
        return c, "postgres"
    # SQLite par défaut
    db = os.path.join(os.path.dirname(os.path.abspath(__file__)), "reach_state.db")
    c = sqlite3.connect(db)
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
