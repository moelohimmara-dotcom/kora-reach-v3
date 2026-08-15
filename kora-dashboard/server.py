"""server.py — KORA OPS dashboard (zero-dep, read-only).

Exposes internal agent state (facts, audit, config) over a SEPARATE port (8765),
bound to 127.0.0.1 only (not exposed to the internet). READ-ONLY: every DB
query is a SELECT; no INSERT/UPDATE/DELETE is ever issued. All secrets come from
the environment at runtime — none are hardcoded or logged.

If the database is unreachable (e.g. running outside the VPS), the server falls
back to DEMO mode with synthetic data so the UI is still verifiable.

Run:  /opt/data/kora-dashboard/.venv/bin/python server.py   (or system python3)
"""
import json
import os
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# HARDCODE project root — background(background=true) launches with cwd="/"
ROOT = "/opt/data/kora-dashboard"
STATIC = os.path.join(ROOT, "static")
PORT = 8765
BIND = "127.0.0.1"  # localhost only — not reachable from the internet

# ---- DB connection (read-only). Secrets from env, never hardcoded. ----
_DB = None
_DEMO = False


def _connect():
    """Return a read-only DB connection, or None (-> DEMO mode)."""
    try:
        import psycopg2
        import psycopg2.extras
        conn = psycopg2.connect(
            host=os.environ.get("PG_HOST", "127.0.0.1"),
            port=int(os.environ.get("PG_PORT", 5432)),
            dbname=os.environ.get("PG_NAME", os.environ.get("PG_DB", "kora")),
            user=os.environ.get("PG_USER", os.environ.get("POSTGRES_USER", "kora")),
            password=os.environ.get("PG_PASSWORD", os.environ.get("POSTGRES_PASSWORD", "")),
            connect_timeout=5,
        )
        conn.cursor_factory = psycopg2.extras.RealDictCursor
        return conn
    except Exception:
        return None


def _db():
    global _DB, _DEMO
    if _DB is None:
        _DB = _connect()
        _DEMO = _DB is None
    return _DB


# Keys whose VALUES must never be returned by /api/config (secret hygiene).
_SECRET_KEY_HINTS = ("KEY", "PASSWORD", "SECRET", "TOKEN", "PRIVATE")


def _safe_config(rows):
    return [
        {"key": r["key"], "value": ("***masked***" if any(h in r["key"].upper() for h in _SECRET_KEY_HINTS) else r["value"])}
        for r in rows
    ]


# ---- Query layer (SELECT ONLY) ----
def q_stats():
    db = _db()
    if db is None:
        return {"demo": True, "facts_by_status": {"PENDING_REVIEW": 68, "APPROVED": 0, "EDITED": 6, "REJECTED": 7, "TRASHED": 21, "AUDIT": 14},
                "articles_by_status": {"draft": 6, "published": 0, "trashed": 21},
                "totals": {"facts": 76, "articles": 76, "pending": 68}}
    cur = db.cursor()
    cur.execute("select status, count(*) as n from hitl_facts group by status")
    fb = {r["status"]: r["n"] for r in cur.fetchall()}
    cur.execute("select status, count(*) as n from articles group by status")
    ab = {r["status"]: r["n"] for r in cur.fetchall()}
    cur.execute("select count(*) as n from hitl_facts")
    facts_total = cur.fetchone()["n"]
    cur.execute("select count(*) as n from articles")
    art_total = cur.fetchone()["n"]
    cur.execute("select count(*) as n from hitl_facts where status='PENDING_REVIEW'")
    pending = cur.fetchone()["n"]
    cur.close()
    return {"demo": False, "facts_by_status": fb, "articles_by_status": ab,
            "totals": {"facts": facts_total, "articles": art_total, "pending": pending}}


def q_facts(limit=50):
    db = _db()
    if db is None:
        return [{"fact_id": f"F-{i:04d}", "champion": f"Titre fact #{i}", "status": "PENDING_REVIEW",
                 "created_at": "2026-08-15T09:00:00", "n_sources": 3} for i in range(1, 13)]
    cur = db.cursor()
    cur.execute("select fact_id, champion, status, created_at, n_sources from hitl_facts order by created_at desc limit %s", (limit,))
    rows = cur.fetchall()
    cur.close()
    return [dict(r) for r in rows]


def q_audit(limit=50):
    db = _db()
    if db is None:
        return [{"ts": "2026-08-15T09:00:00", "event": "GENERE", "action": "article", "editor": "agent"} for _ in range(8)]
    cur = db.cursor()
    cur.execute("select ts, event, action, editor from audit_events order by ts desc limit %s", (limit,))
    rows = cur.fetchall()
    cur.close()
    return [dict(r) for r in rows]


def q_config():
    db = _db()
    if db is None:
        return [{"key": "whitelist_version", "value": "demo-1.0"}, {"key": "mutex", "value": "free"}]
    cur = db.cursor()
    cur.execute("select key, value from kora_config")
    rows = cur.fetchall()
    cur.close()
    return _safe_config(rows)


# ---- HTTP handler ----
class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False)
        data = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()  # PLURAL — not end_header()
        self.wfile.write(data)

    def do_GET(self):
        p = urllib.parse.urlparse(self.path)
        path = p.path
        if path == "/api/health":
            db = _db()
            return self._send(200, {"status": "ok", "db": "connected" if db else "demo", "demo": _DEMO})
        if path == "/api/stats":
            return self._send(200, q_stats())
        if path == "/api/facts":
            return self._send(200, q_facts())
        if path == "/api/audit":
            return self._send(200, q_audit())
        if path == "/api/config":
            return self._send(200, q_config())
        # static files
        rel = "index.html" if path == "/" else path.lstrip("/")
        fp = os.path.normpath(os.path.join(STATIC, rel))
        if not fp.startswith(STATIC) or not os.path.isfile(fp):
            return self._send(404, {"error": "not found"})
        ctype = ("text/html" if fp.endswith(".html") else
                 "application/javascript" if fp.endswith(".js") else
                 "text/css" if fp.endswith(".css") else "application/octet-stream")
        with open(fp, "rb") as f:
            return self._send(200, f.read(), ctype)

    def do_POST(self):
        # READ-ONLY dashboard: reject all mutations.
        self._send(405, {"error": "method not allowed — read-only dashboard"})

    def log_message(self, *a):
        pass


def main():
    srv = ThreadingHTTPServer((BIND, PORT), Handler)
    print(f"KORA OPS dashboard on http://{BIND}:{PORT}  (read-only, localhost only)")
    srv.serve_forever()


if __name__ == "__main__":
    main()
