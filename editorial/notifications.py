"""notifications.py — centre de notifications PERSISTANT (2026-08-22).

Remplace l'ancien "centre de notifications" cote frontend (kora-vite/src/
app.js, _notifications) qui n'etait qu'un historique local des toasts
snack() de LA session courante -- perdu au rechargement, jamais partage
entre onglets/appareils, et surtout incapable de signaler un evenement de
fond (cycle ou video termine pendant que personne ne regarde).

Ce module cree des notifications SERVEUR, persistees en base (meme backend
que hitl_store -- core.db, sqlite en dev / postgres en prod), visibles par
QUICONQUE consulte /api/notifications. "read" est volontairement GLOBAL
(pas par utilisateur) : simplicite assumee, coherente avec le reste de
l'app (audit_events n'a pas non plus de notion de lecteur par utilisateur)
-- une equipe editoriale partage un seul etat "lu/non lu", comme un canal
Slack partage plutot qu'une boite mail individuelle.

`route`/`fact_id` (optionnels) permettent au frontend de naviguer directement
vers l'element concerne au clic (ex: route="videos" -> page Videos)."""
import json
from datetime import datetime, timezone

import core.db as db

TYPES = ("video_done", "video_error", "cycle_done", "cycle_error", "info")


def _init():
    con, mode = db.conn()
    try:
        cur = con.cursor()
        if mode == "postgres":
            cur.execute("""CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY, ts TEXT, type TEXT, message TEXT,
                route TEXT, fact_id TEXT, read INTEGER DEFAULT 0)""")
        else:
            cur.execute("""CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, type TEXT, message TEXT,
                route TEXT, fact_id TEXT, read INTEGER DEFAULT 0)""")
        con.commit()
    finally:
        con.close()


def create(type: str, message: str, route: str = None, fact_id: str = None) -> None:
    """Cree une notification persistante. Jamais bloquant pour l'appelant --
    une notification manquee ne doit jamais faire echouer un cycle ou une
    generation video reels (meme principe defensif que editorial.audit.log,
    deja utilise partout dans le code appelant)."""
    try:
        _init()
        con, mode = db.conn()
        p = db.placeholder()
        try:
            cur = con.cursor()
            cur.execute(
                f"INSERT INTO notifications (ts, type, message, route, fact_id, read) "
                f"VALUES ({p},{p},{p},{p},{p},0)",
                (datetime.now(timezone.utc).isoformat(), type, message, route, fact_id),
            )
            con.commit()
        finally:
            con.close()
    except Exception:
        pass


def list_recent(limit: int = 50) -> dict:
    """Retourne {notifications:[...], unread_count:N}, plus recentes d'abord."""
    _init()
    con, mode = db.conn()
    p = db.placeholder()
    try:
        cur = con.cursor()
        cur.execute(f"SELECT * FROM notifications ORDER BY id DESC LIMIT {p}", (limit,))
        rows = [dict(r) for r in cur.fetchall()]
        cur.execute("SELECT COUNT(*) AS c FROM notifications WHERE read=0")
        row = cur.fetchone()
        unread = (row["c"] if isinstance(row, dict) else row[0]) or 0
    finally:
        con.close()
    for r in rows:
        r["read"] = bool(r.get("read"))
    return {"notifications": rows, "unread_count": int(unread)}


def mark_read(notif_id) -> bool:
    _init()
    con, mode = db.conn()
    p = db.placeholder()
    try:
        cur = con.cursor()
        cur.execute(f"UPDATE notifications SET read=1 WHERE id={p}", (notif_id,))
        con.commit()
        return True
    finally:
        con.close()


def mark_all_read() -> int:
    _init()
    con, mode = db.conn()
    try:
        cur = con.cursor()
        cur.execute("UPDATE notifications SET read=1 WHERE read=0")
        n = cur.rowcount if cur.rowcount is not None else 0
        con.commit()
        return int(n or 0)
    finally:
        con.close()
