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
import threading
from datetime import datetime

_initialized = False
# Bug corrige 2026-08-19 (incident prod, casse par l'ajout de timing_stats) :
# le garde "if _initialized: return" seul ne protege PAS contre deux THREADS
# appelant init() en meme temps au tout premier appel (avant que le flag ne
# passe a True) -- un thread de requete (estimate_launch_message) et le
# thread de cycle en arriere-plan peuvent tomber pile dans cette fenetre.
# Sur Postgres, deux CREATE TABLE IF NOT EXISTS concurrents pour une table
# TOUTE NOUVELLE peuvent lever UniqueViolation sur pg_type_typname_nsp_index
# (particularite connue de Postgres : IF NOT EXISTS n'est pas atomique face a
# une creation concurrente du meme type). Ce verrou serialise le premier
# appel, comme le reste du process n'a besoin de l'init qu'une fois.
_init_lock = threading.Lock()


def _ph():
    return db.placeholder()


def init():
    """(Ré)crée les tables si besoin. Idempotent process-wide (même garde que
    hitl_store._init() — voir incident 2026-08-18 : ré-exécuter des CREATE/ALTER
    TABLE à chaque appel épuise les connexions Postgres sous charge)."""
    global _initialized
    if _initialized:
        return
    with _init_lock:
        if _initialized:  # un autre thread a pu finir pendant l'attente du verrou
            return
        _init_locked()


def _init_locked():
    global _initialized
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
        # timing_stats (2026-08-19, demande explicite : estimation du temps de
        # génération annoncée dès le lancement d'un cycle). Une seule ligne
        # ("article_gen"), moyenne mobile exponentielle du temps REEL observé
        # par article généré (mesuré dans reach_agent.run() autour de
        # write_article()) -- persistée pour survivre aux redémarrages et
        # être déjà utile dès le tout premier article d'un cycle qui vient de
        # démarrer.
        cur.execute("""CREATE TABLE IF NOT EXISTS timing_stats (
            key TEXT PRIMARY KEY, avg_seconds REAL, samples INTEGER)""")
        con.commit()
    finally:
        con.close()
    _initialized = True


_TIMING_KEY = "article_gen"
_TIMING_DEFAULT_SEC = 150.0  # ~2min30, estimation raisonnable avant toute mesure reelle
_TIMING_EMA_ALPHA = 0.3      # poids du dernier echantillon (0.3 = lisse sans etre lent a suivre)


def get_avg_article_seconds() -> float:
    """Moyenne mobile persistée du temps de génération par article (toutes
    passes comprises : rédaction, extension éventuelle, auto-critique,
    correction éventuelle). Valeur par défaut raisonnable tant qu'aucun
    article n'a encore été mesuré (première utilisation)."""
    init()
    p = _ph()
    con, mode = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"SELECT avg_seconds FROM timing_stats WHERE key={p}", (_TIMING_KEY,))
        row = cur.fetchone()
        if row:
            v = row["avg_seconds"] if isinstance(row, dict) else row[0]
            if v and v > 0:
                return float(v)
        return _TIMING_DEFAULT_SEC
    finally:
        con.close()


def record_article_seconds(seconds: float):
    """Met à jour la moyenne mobile après CHAQUE article réellement généré
    (appelé depuis reach_agent.run(), jamais depuis un dry-run/template)."""
    if not seconds or seconds <= 0:
        return
    init()
    p = _ph()
    con, mode = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"SELECT avg_seconds, samples FROM timing_stats WHERE key={p}", (_TIMING_KEY,))
        row = cur.fetchone()
        if row:
            prev = row["avg_seconds"] if isinstance(row, dict) else row[0]
            n = (row["samples"] if isinstance(row, dict) else row[1]) or 0
            new_avg = (prev * (1 - _TIMING_EMA_ALPHA) + seconds * _TIMING_EMA_ALPHA) if prev else seconds
            cur.execute(f"UPDATE timing_stats SET avg_seconds={p}, samples={p} WHERE key={p}",
                        (new_avg, n + 1, _TIMING_KEY))
        else:
            if mode == "postgres":
                cur.execute(
                    f"INSERT INTO timing_stats (key, avg_seconds, samples) VALUES ({p},{p},{p}) "
                    f"ON CONFLICT (key) DO NOTHING",
                    (_TIMING_KEY, seconds, 1))
            else:
                cur.execute(
                    f"INSERT OR IGNORE INTO timing_stats (key, avg_seconds, samples) VALUES ({p},{p},{p})",
                    (_TIMING_KEY, seconds, 1))
        con.commit()
    finally:
        con.close()


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
