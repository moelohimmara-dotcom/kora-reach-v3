"""settings.py — assets éditables (identité + couleurs d'accent).
Stockés dans la DB (SQLite ou PostgreSQL selon DATABASE_BACKEND), table kora_config.
Aucun secret. Le logo est conservé UNIQUEMENT en data-URL base64 (jamais un chemin
de fichier) pour éviter toute inclusion/traversée de fichier.
"""
import re
import base64
import db

_HEX = re.compile(r"^#?[0-9A-Fa-f]{6}$")

DEFAULTS = {
    "app_name": "KORA Agent",
    "accent_coral": "#E9705D",
    "accent_bordeaux": "#E08A84",
    # Libellés de l'interface (white-label)
    "label_cockpit": "Tableau de bord",
    "label_facts": "Articles",
    "label_hitl": "Validation",
    "label_sources": "Sources",
    "label_drafts": "Brouillons",
    "label_audit": "Historique",
    "app_tagline": "Poste de pilotage de l'agent éditorial",
}

_LABEL_KEYS = [k for k in DEFAULTS if k.startswith("label_")] + ["app_tagline"]
_LABEL_RE = re.compile(r"^[^<>]{1,30}$")


def _ph():
    return db.placeholder()


def _ensure_table():
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(
            f"CREATE TABLE IF NOT EXISTS kora_config ("
            f"key TEXT PRIMARY KEY, value TEXT)"
        )
        con.commit()
    finally:
        con.close()


def _norm_hex(v: str) -> str:
    v = (v or "").strip()
    if not _HEX.match(v):
        return None
    if not v.startswith("#"):
        v = "#" + v
    return v.upper()


def get_settings() -> dict:
    _ensure_table()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute("SELECT key, value FROM kora_config")
        rows = cur.fetchall()
    finally:
        con.close()
    d = dict(DEFAULTS)
    for r in rows:
        d[r["key"]] = r["value"]
    d["accent_coral"] = _norm_hex(d.get("accent_coral")) or DEFAULTS["accent_coral"]
    d["accent_bordeaux"] = _norm_hex(d.get("accent_bordeaux")) or DEFAULTS["accent_bordeaux"]
    d["app_name"] = (d.get("app_name") or "").strip() or DEFAULTS["app_name"]
    d["has_logo"] = bool(d.get("logo_data"))
    d["has_favicon"] = bool(d.get("favicon_data"))
    return d


def _valid_logo(data_url: str) -> bool:
    if not data_url:
        return False
    if not data_url.startswith("data:image/"):
        return False
    if ";base64," not in data_url:
        return False
    try:
        b64 = data_url.split(",", 1)[1]
        raw = base64.b64decode(b64, validate=True)
        return len(raw) <= 256 * 1024
    except Exception:
        return False


def save_settings(payload: dict) -> dict:
    _ensure_table()
    name = (payload.get("app_name") or "").strip()
    coral = _norm_hex(payload.get("accent_coral"))
    bordeaux = _norm_hex(payload.get("accent_bordeaux"))
    logo = payload.get("logo_data")
    favicon = payload.get("favicon_data")

    if not name:
        return {"ok": False, "error": "Nom d'application requis"}
    if not coral:
        return {"ok": False, "error": "Couleur accent (coral) invalide"}
    if not bordeaux:
        return {"ok": False, "error": "Couleur accent (bordeaux) invalide"}
    if logo is not None:
        if logo == "":
            logo = None
        elif not _valid_logo(logo):
            return {"ok": False, "error": "Logo invalide (doit être data:image/...;base64, <256 Ko)"}
    if favicon is not None:
        if favicon == "":
            favicon = None
        elif not _valid_logo(favicon):
            return {"ok": False, "error": "Favicon invalide (doit être data:image/...;base64, <256 Ko)"}

    # Libellés d'interface (white-label)
    labels = {}
    for k in _LABEL_KEYS:
        v = (payload.get(k) or "").strip()
        if v and not _LABEL_RE.match(v):
            return {"ok": False, "error": f"Libellé '{k}' invalide (1-30 caractères, sans < >)"}
        labels[k] = v or DEFAULTS.get(k, "")

    con, _ = db.conn()
    try:
        cur = con.cursor()
        for k, v in [("app_name", name), ("accent_coral", coral), ("accent_bordeaux", bordeaux)]:
            if db.is_postgres():
                cur.execute(f"DELETE FROM kora_config WHERE key={_ph()}", (k,))
                cur.execute(f"INSERT INTO kora_config(key,value) VALUES({_ph()},{_ph()})", (k, v))
            else:
                cur.execute(f"INSERT OR REPLACE INTO kora_config(key,value) VALUES({_ph()},{_ph()})", (k, v))
        for k, v in labels.items():
            if db.is_postgres():
                cur.execute(f"DELETE FROM kora_config WHERE key={_ph()}", (k,))
                cur.execute(f"INSERT INTO kora_config(key,value) VALUES({_ph()},{_ph()})", (k, v))
            else:
                cur.execute(f"INSERT OR REPLACE INTO kora_config(key,value) VALUES({_ph()},{_ph()})", (k, v))
        if logo is not None:
            if db.is_postgres():
                cur.execute(f"DELETE FROM kora_config WHERE key={_ph()}", ("logo_data",))
                if logo is not None:
                    cur.execute(f"INSERT INTO kora_config(key,value) VALUES({_ph()},{_ph()})", ("logo_data", logo))
            else:
                cur.execute(f"INSERT OR REPLACE INTO kora_config(key,value) VALUES({_ph()},{_ph()})", ("logo_data", logo))
        if favicon is not None:
            if db.is_postgres():
                cur.execute(f"DELETE FROM kora_config WHERE key={_ph()}", ("favicon_data",))
                if favicon is not None:
                    cur.execute(f"INSERT INTO kora_config(key,value) VALUES({_ph()},{_ph()})", ("favicon_data", favicon))
            else:
                cur.execute(f"INSERT OR REPLACE INTO kora_config(key,value) VALUES({_ph()},{_ph()})", ("favicon_data", favicon))
        con.commit()
    finally:
        con.close()
    return {"ok": True, "settings": get_settings()}
