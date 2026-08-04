"""audit.py — piste d'audit structurée (§5.16). Aucun secret (clé API, token)
ne doit être passé ici. Les événements sont expurgés automatiquement.

Historique par jour (pack A1+B1+D1) :
- Chaque event porte fact_id + action typée + editor.
- Agrégation par jour (timezone locale GUI) avec compteurs par action.
- Suppression lot (sélection), vidage global, réinitialisation du jour / globale.
- Garde-fou : après purge, UNE ligne PURGE est conservée (pas le détail).
"""
import sqlite3
import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import config

DB = os.path.join(os.path.dirname(__file__), "reach_state.db")
_TZ = ZoneInfo(config.LIMITS["timezone"])

# Mots à masquer si jamais présents par erreur
_SECRET_HINTS = ("sk-", "api_key", "token", "secret", "password", "bearer ")

# Actions typées (compteurs)
ACTIONS = ("GENERE", "TRANSMIS", "APPROUVE", "REJETE", "MODIFIE", "SUPPRIME", "CYCLE", "PURGE")
# Libellés FR pour les compteurs
ACTION_FR = {
    "GENERE": "Générés", "TRANSMIS": "Transmis", "APPROUVE": "Approuvés",
    "REJETE": "Rejetés", "MODIFIE": "Modifiés", "SUPPRIME": "Supprimés",
    "CYCLE": "Cycles", "PURGE": "Purges",
}


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
            provider TEXT,
            fact_id TEXT,
            action TEXT,
            editor TEXT
        )"""
    )
    # Migration additive (idempotente) : ajoute les colonnes si absentes
    cols = [r[1] for r in conn.execute("PRAGMA table_info(audit_events)").fetchall()]
    for col, ctype in (("fact_id", "TEXT"), ("action", "TEXT"), ("editor", "TEXT")):
        if col not in cols:
            conn.execute(f"ALTER TABLE audit_events ADD COLUMN {col} {ctype}")
    conn.commit()
    conn.close()


def log(cycle_id: str, event: str, detail: str = "", provider: str = "",
        fact_id: str = None, action: str = None, editor: str = None):
    """Enregistre un événement d'audit sans secret.
    action déduit de event si non fourni (rétrocompatibilité)."""
    _init()
    if action is None:
        ev = (event or "").upper()
        if "TRANSMIT" in ev or "TRANSMIS" in ev: action = "TRANSMIS"
        elif "APPROV" in ev or "APPROUVE" in ev: action = "APPROUVE"
        elif "REJECT" in ev or "REJETE" in ev: action = "REJETE"
        elif "EDIT" in ev or "MODIF" in ev: action = "MODIFIE"
        elif "SUPPR" in ev or "DELETE" in ev: action = "SUPPRIME"
        elif "CYCLE" in ev or "RUN" in ev: action = "CYCLE"
        elif "PURGE" in ev: action = "PURGE"
        else: action = "GENERE"
    conn = sqlite3.connect(DB)
    conn.execute(
        """INSERT INTO audit_events (ts, cycle_id, event, detail, provider, fact_id, action, editor)
           VALUES (?,?,?,?,?,?,?,?)""",
        (datetime.now(_TZ).isoformat(), _scrub(cycle_id), _scrub(event),
         _scrub(detail), _scrub(provider), _scrub(fact_id) if fact_id else None,
         action, _scrub(editor) if editor else None),
    )
    conn.commit()
    conn.close()


def _day_key(ts: str) -> str:
    """Extrait la date locale (AAAA-MM-JJ) depuis un ts ISO tz-aware."""
    try:
        d = datetime.fromisoformat(ts)
        if d.tzinfo is None:
            d = d.replace(tzinfo=_TZ)
        return d.astimezone(_TZ).strftime("%Y-%m-%d")
    except Exception:
        return "1970-01-01"


def get_daily() -> list:
    """Retourne la liste des jours (décroissant) avec compteurs par action.
    Shape: { date, label, count, counters:{ACTION:int}, events:[...] } (events limités à 200/jour pour le dépliable)."""
    _init()
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT * FROM audit_events ORDER BY id DESC").fetchall()
    conn.close()
    days = {}
    for r in rows:
        d = _day_key(r["ts"])
        if d not in days:
            days[d] = {"date": d, "count": 0, "counters": {a: 0 for a in ACTIONS}, "events": []}
        days[d]["count"] += 1
        a = r["action"] or "GENERE"
        if a in days[d]["counters"]:
            days[d]["counters"][a] += 1
        if len(days[d]["events"]) < 200:
            days[d]["events"].append(dict(r))
    out = []
    for d in sorted(days.keys(), reverse=True):
        item = days[d]
        item["label"] = _day_label(d)
        out.append(item)
    return out


def _day_label(d: str) -> str:
    try:
        dt = datetime.strptime(d, "%Y-%m-%d").replace(tzinfo=_TZ)
        today = datetime.now(_TZ).date()
        if dt.date() == today:
            return "Aujourd'hui"
        if dt.date() == (today - __import__("datetime").timedelta(days=1)):
            return "Hier"
        return dt.strftime("%d %B %Y")
    except Exception:
        return d


def get_day_events(day: str) -> list:
    _init()
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM audit_events WHERE DATE(ts)=? ORDER BY id DESC", (day,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def delete_events(ids: list) -> int:
    """Suppression lot par IDs. Retourne le nombre supprimé."""
    if not ids:
        return 0
    _init()
    conn = sqlite3.connect(DB)
    q = f"DELETE FROM audit_events WHERE id IN ({','.join('?'*len(ids))})"
    conn.execute(q, ids)
    n = conn.total_changes
    conn.commit()
    conn.close()
    return n


def purge_all(editor: str = None) -> int:
    """Vide TOUTE la table SAUF écrit une ligne PURGE (garde-fou). Retourne nb supprimé."""
    _init()
    conn = sqlite3.connect(DB)
    n = conn.execute("SELECT COUNT(*) FROM audit_events").fetchone()[0]
    conn.execute("DELETE FROM audit_events")
    conn.execute(
        """INSERT INTO audit_events (ts, cycle_id, event, detail, provider, fact_id, action, editor)
           VALUES (?,?,?,?,?,?,?,?)""",
        (datetime.now(_TZ).isoformat(), "system", "PURGE",
         f"historique vidé par {editor or 'system'}", "", None, "PURGE", editor or "system"),
    )
    conn.commit()
    conn.close()
    return n


def purge_day(day: str, editor: str = None) -> int:
    """Réinitialise UN jour (supprime ses events SAUF écrit une ligne PURGE scoped)."""
    _init()
    conn = sqlite3.connect(DB)
    n = conn.execute("SELECT COUNT(*) FROM audit_events WHERE DATE(ts)=?", (day,)).fetchone()[0]
    conn.execute("DELETE FROM audit_events WHERE DATE(ts)=?", (day,))
    conn.execute(
        """INSERT INTO audit_events (ts, cycle_id, event, detail, provider, fact_id, action, editor)
           VALUES (?,?,?,?,?,?,?,?)""",
        (datetime.now(_TZ).isoformat(), "system", "PURGE",
         f"historique du {day} réinitialisé par {editor or 'system'}", "", None, "PURGE", editor or "system"),
    )
    conn.commit()
    conn.close()
    return n


# Crée la table au chargement du module (comme state_store.init())
_init()


def get_events(cycle_id: str = "") -> list:
    """Rétrocompatibilité (non utilisé par la nouvelle UI mais conservé)."""
    _init()
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    if cycle_id:
        rows = conn.execute("SELECT * FROM audit_events WHERE cycle_id=? ORDER BY id",
                            (cycle_id,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM audit_events ORDER BY id DESC LIMIT 200").fetchall()
    conn.close()
    return [dict(r) for r in rows]
