"""state_store.py — mémoire SQLite locale (persistance vue/collecte)."""
import sqlite3, os
from datetime import datetime

DB = os.path.join(os.path.dirname(__file__), "reach_state.db")

def init():
    con = sqlite3.connect(DB)
    con.execute("""CREATE TABLE IF NOT EXISTS seen_items (
        url_hash TEXT PRIMARY KEY, title TEXT, first_seen TEXT)""")
    con.execute("""CREATE TABLE IF NOT EXISTS cycles (
        id INTEGER PRIMARY KEY AUTOINCREMENT, started TEXT, status TEXT)""")
    con.commit(); con.close()

def seen(url_hash: str) -> bool:
    con = sqlite3.connect(DB)
    r = con.execute("SELECT 1 FROM seen_items WHERE url_hash=?", (url_hash,)).fetchone()
    con.close()
    return r is not None

def mark(url_hash: str, title: str):
    con = sqlite3.connect(DB)
    con.execute("INSERT OR IGNORE INTO seen_items VALUES (?,?,?)",
                (url_hash, title, datetime.now().isoformat()))
    con.commit(); con.close()

def new_cycle():
    con = sqlite3.connect(DB)
    cur = con.execute("INSERT INTO cycles (started, status) VALUES (?,?)",
                      (datetime.now().isoformat(), "RUNNING"))
    cid = cur.lastrowid
    con.commit(); con.close()
    return cid

def end_cycle(cid: str, status: str):
    con = sqlite3.connect(DB)
    con.execute("UPDATE cycles SET status=? WHERE id=?", (status, cid))
    con.commit(); con.close()

init()
