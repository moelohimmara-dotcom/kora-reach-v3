"""state_store.py — mémoire de dédup inter-cycles + registre des cycles.

Refonte 2026-08-19 (diagnostic P0 §3) : ce module utilisait sa PROPRE connexion
sqlite3 brute vers un fichier local (reach_state.db), complètement à l'écart de
l'abstraction db.py utilisée par le reste de l'app (hitl_store, transmit). En
production (DATABASE_BACKEND=postgres), la mémoire de dédup — qui est pourtant
CRITIQUE pour ne jamais régénérer un fait déjà publié — vivait donc dans un
fichier SQLite local que rien d'autre ne surveille ni ne sauvegarde, déconnecté
de la base Postgres réelle. Ce module passe maintenant par db.conn() comme le
reste de l'app (SQLite en dev local, Postgres en prod selon DATABASE_BACKEND).
"""
import db
from datetime import datetime

_initialized = False


def _ph():
    return db.placeholder()


def init():
    """(Ré)crée les tables si besoin. Idempotent process-wide (même garde que
    hitl_store._init() — voir incident 2026-08-18 : ré-exécuter des CREATE/ALTER
    TABLE à chaque appel épuise les connexions Postgres sous charge)."""
    global _initialized
    if _initialized:
        return
    con, mode = db.conn()
    try:
        cur = con.cursor()
        cur.execute("""CREATE TABLE IF NOT EXISTS seen_items (
            url_hash TEXT PRIMARY KEY, title TEXT, first_seen TEXT)""")
        if mode == "postgres":
            cur.execute("""CREATE TABLE IF NOT EXISTS cycles (
                id SERIAL PRIMARY KEY, started TEXT, status TEXT)""")
        else:
            cur.execute("""CREATE TABLE IF NOT EXISTS cycles (
                id INTEGER PRIMARY KEY AUTOINCREMENT, started TEXT, status TEXT)""")
        con.commit()
    finally:
        con.close()
    _initialized = True


def seen(url_hash: str) -> bool:
    init()
    p = _ph()
    con, mode = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"SELECT 1 FROM seen_items WHERE url_hash={p}", (url_hash,))
        return cur.fetchone() is not None
    finally:
        con.close()


def mark(url_hash: str, title: str):
    init()
    p = _ph()
    now = datetime.now().isoformat()
    con, mode = db.conn()
    try:
        cur = con.cursor()
        if mode == "postgres":
            cur.execute(
                f"""INSERT INTO seen_items (url_hash, title, first_seen)
                   VALUES ({p},{p},{p}) ON CONFLICT(url_hash) DO NOTHING""",
                (url_hash, title, now))
        else:
            cur.execute(
                f"""INSERT OR IGNORE INTO seen_items (url_hash, title, first_seen)
                   VALUES ({p},{p},{p})""",
                (url_hash, title, now))
        con.commit()
    finally:
        con.close()


def new_cycle():
    init()
    p = _ph()
    now = datetime.now().isoformat()
    con, mode = db.conn()
    try:
        cur = con.cursor()
        if mode == "postgres":
            cur.execute(
                f"INSERT INTO cycles (started, status) VALUES ({p},{p}) RETURNING id",
                (now, "RUNNING"))
            cid = cur.fetchone()["id"]
        else:
            cur.execute(
                f"INSERT INTO cycles (started, status) VALUES ({p},{p})",
                (now, "RUNNING"))
            cid = cur.lastrowid
        con.commit()
        return cid
    finally:
        con.close()


def end_cycle(cid, status: str):
    init()
    p = _ph()
    con, mode = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"UPDATE cycles SET status={p} WHERE id={p}", (status, cid))
        con.commit()
    finally:
        con.close()
