"""audit.py — piste d'audit structurée (§5.16). Aucun secret (clé API, token)
ne doit être passé ici. Les événements sont expurgés automatiquement."""
import sqlite3
import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import config

DB = os.path.join(os.path.dirname(__file__), "reach_state.db")
_TZ = ZoneInfo(config.LIMITS["timezone"])

# Mots à masquer si jamais présents par erreur
_SECRET_HINTS = ("sk-", "api_key", "token", "secret", "password", "bearer ")


def _scrub(text: str) -> str:
    if not text:
        return text
    t = str(text)
    low = t.lower()
    if any(h in low for h in _SECRET_HINTS):
        return "[REDACTED_SECRET]"
    return t[:500]


def _init():
    conn = sqlite3.connect(DB)
    conn.execute(
        """CREATE TABLE IF NOT EXISTS audit_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT,
            cycle_id TEXT,
            event TEXT,
            detail TEXT,
            provider TEXT
        )"""
    )
    conn.commit()
    conn.close()


def log(cycle_id: str, event: str, detail: str = "", provider: str = ""):
    """Enregistre un événement d'audit sans secret."""
    _init()
    conn = sqlite3.connect(DB)
    conn.execute(
        "INSERT INTO audit_events (ts, cycle_id, event, detail, provider) VALUES (?,?,?,?,?)",
        (datetime.now(_TZ).isoformat(), _scrub(cycle_id), _scrub(event),
         _scrub(detail), _scrub(provider)),
    )
    conn.commit()
    conn.close()


# Crée la table au chargement du module (comme state_store.init())
_init()


def get_events(cycle_id: str = "") -> list:
    _init()  # recrée la table si la DB a été resetée
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    if cycle_id:
        rows = conn.execute("SELECT * FROM audit_events WHERE cycle_id=? ORDER BY id",
                            (cycle_id,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM audit_events ORDER BY id DESC LIMIT 200").fetchall()
    conn.close()
    return [dict(r) for r in rows]
