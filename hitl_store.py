"""hitl_store.py — persistance des décisions HITL (verrou + traçabilité).

Machine à états par fait :
  PENDING_REVIEW -> EDITED -> APPROVED -> TRANSMITTED
                              -> REJECTED
  TRANSMITTED -> RETRACTED (override tracé, droit de rectification)
Chaque décision porte decided_by + decided_at (ISO Conakry). Aucune décision
anonyme. Survit aux redémarrages (SQLite).
"""
import sqlite3
import os
import json
from datetime import datetime
from zoneinfo import ZoneInfo
import config

DB = os.path.join(os.path.dirname(__file__), "reach_state.db")
TZ = ZoneInfo(config.LIMITS["timezone"])

STATES = {
    "PENDING_REVIEW", "EDITED", "APPROVED", "REJECTED",
    "TRANSMITTED", "TRANSMISSION_FAILED", "RETRACTED",
}
# Transitions autorisées depuis chaque état
_ALLOWED = {
    "PENDING_REVIEW": {"EDITED", "APPROVED", "REJECTED"},
    "EDITED": {"APPROVED", "REJECTED", "EDITED"},
    "APPROVED": {"TRANSMITTED", "TRANSMISSION_FAILED", "RETRACTED", "EDITED"},
    "TRANSMISSION_FAILED": {"TRANSMITTED", "APPROVED", "REJECTED"},
    "REJECTED": set(),                       # verrouillé (override nécessaire)
    "TRANSMITTED": {"RETRACTED"},            # droit de rectification (override)
    "RETRACTED": set(),                      # verrouillé
}


def _init():
    con = sqlite3.connect(DB)
    con.execute("""CREATE TABLE IF NOT EXISTS hitl_decisions (
        fact_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        decision TEXT,
        edited_text TEXT,
        final_text TEXT,
        decided_by TEXT,
        decided_at TEXT,
        transmitted_at TEXT,
        provider TEXT,
        http_status INTEGER,
        override_by TEXT,
        override_at TEXT
    )""")
    # Table de persistance des FAITS (survit au redémarrage du service)
    con.execute("""CREATE TABLE IF NOT EXISTS hitl_facts (
        fact_id TEXT PRIMARY KEY,
        champion TEXT NOT NULL,
        contexts TEXT,
        article TEXT,
        image TEXT,
        image_meta TEXT,
        gen_model TEXT,
        n_sources INTEGER DEFAULT 1,
        status TEXT DEFAULT 'PENDING_REVIEW',
        created_at TEXT
    )""")
    con.commit(); con.close()


_init()


def upsert_fact(f: dict) -> str:
    """Persiste un fait (champion/article/image) pour qu'il survive au redémarrage.
    Retourne le fact_id."""
    import json as _json
    fid = fact_id_of(f.get("champion", {}))
    champ = _json.dumps(f.get("champion", {}), ensure_ascii=False)
    ctx = _json.dumps(f.get("contexts", []), ensure_ascii=False)
    art = _json.dumps(f.get("article", ""), ensure_ascii=False) if isinstance(f.get("article"), (dict, list)) else (f.get("article") or "")
    img = f.get("image", "") or (f.get("champion", {}).get("image", ""))
    img_meta = _json.dumps(f.get("image_meta", {}), ensure_ascii=False)
    now = datetime.now(TZ).isoformat(timespec="seconds")
    con = sqlite3.connect(DB)
    con.execute(
        """INSERT INTO hitl_facts (fact_id, champion, contexts, article, image, image_meta, gen_model, n_sources, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)
           ON CONFLICT(fact_id) DO UPDATE SET
             champion=excluded.champion, contexts=excluded.contexts, article=excluded.article,
             image=excluded.image, image_meta=excluded.image_meta, gen_model=excluded.gen_model,
             n_sources=excluded.n_sources""",
        (fid, champ, ctx, art, img, img_meta, f.get("gen_model", ""), f.get("n_sources", 1), now))
    con.commit(); con.close()
    return fid


def list_facts() -> list:
    """Tous les faits persistés, joints aux décisions HITL."""
    _init()
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    rows = con.execute(
        """SELECT f.*, d.status AS d_status, d.decided_by, d.decided_at, d.final_text, d.provider
           FROM hitl_facts f
           LEFT JOIN hitl_decisions d ON d.fact_id = f.fact_id
           ORDER BY f.created_at DESC""").fetchall()
    con.close()
    out = []
    for r in rows:
        d = dict(r)
        champ = json.loads(d["champion"]) if d["champion"] else {}
        ctx = json.loads(d["contexts"]) if d["contexts"] else []
        art = json.loads(d["article"]) if d["article"] and d["article"].startswith("{") else d["article"]
        img_meta = json.loads(d["image_meta"]) if d["image_meta"] else {}
        # Backfill : si image_meta est vide mais image est une URL, on la remonte
        if not img_meta.get("image") and d["image"] and d["image"].startswith("http"):
            img_meta = {"image": d["image"], "provider": "pollinations", "generated": True}
        out.append({
            "fact_id": d["fact_id"],
            "champion": champ,
            "contexts": ctx,
            "article": art,
            "image": d["image"],
            "image_meta": img_meta,
            "gen_model": d["gen_model"],
            "n_sources": d["n_sources"],
            "status": d["d_status"] or "PENDING_REVIEW",
            "decided_by": d["decided_by"],
            "decided_at": d["decided_at"],
            "final_text": d["final_text"],
            "provider": d["provider"],
        })
    return out


def get_fact(fid: str) -> dict | None:
    _init()
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    r = con.execute("SELECT * FROM hitl_facts WHERE fact_id=?", (fid,)).fetchone()
    con.close()
    return dict(r) if r else None


def fact_id_of(champion: dict) -> str:
    """Identifiant stable d'un fait (champion url + title)."""
    import hashlib
    raw = (champion.get("url", "") + "|" + champion.get("title", "")).encode()
    return "fact_" + hashlib.sha1(raw).hexdigest()[:16]


def get(fact_id: str) -> dict | None:
    _init()  # garantit la table même après reset DB (os.remove(reach_state.db) du cycle)
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    row = con.execute("SELECT * FROM hitl_decisions WHERE fact_id=?", (fact_id,)).fetchone()
    con.close()
    return dict(row) if row else None


def list_all() -> list:
    _init()
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    rows = con.execute("SELECT * FROM hitl_decisions ORDER BY decided_at DESC").fetchall()
    con.close()
    return [dict(r) for r in rows]


def decide(fact_id: str, decision: str, decided_by: str,
           edited_text: str = "", final_text: str = "") -> dict:
    """Enregistre une décision. Refuse si anonyme ou transition interdite.
    decision ∈ {EDITED, APPROVED, REJECTED}."""
    if not decided_by or not decided_by.strip():
        return {"error": "decision_anonyme_refusee"}
    cur = get(fact_id)
    cur_state = cur["status"] if cur else "PENDING_REVIEW"
    if decision not in _ALLOWED.get(cur_state, set()):
        return {"error": "transition_interdite", "from": cur_state, "to": decision}
    now = datetime.now(TZ).isoformat(timespec="seconds")
    con = sqlite3.connect(DB)
    if cur:
        con.execute(
            """UPDATE hitl_decisions SET status=?, decision=?, edited_text=?,
               final_text=?, decided_by=?, decided_at=? WHERE fact_id=?""",
            (decision, decision, edited_text, final_text, decided_by, now, fact_id))
    else:
        con.execute(
            """INSERT INTO hitl_decisions
               (fact_id, status, decision, edited_text, final_text, decided_by, decided_at)
               VALUES (?,?,?,?,?,?,?)""",
            (fact_id, decision, decision, edited_text, final_text, decided_by, now))
    con.commit(); con.close()
    return {"ok": True, "fact_id": fact_id, "status": decision, "decided_by": decided_by}


def mark_transmitted(fact_id: str, provider: str, http_status: int,
                     final_text: str = "") -> dict:
    con = sqlite3.connect(DB)
    now = datetime.now(TZ).isoformat(timespec="seconds")
    if final_text:
        con.execute("UPDATE hitl_decisions SET status='TRANSMITTED', transmitted_at=?, "
                    "provider=?, http_status=?, final_text=? WHERE fact_id=?",
                    (now, provider, http_status, final_text, fact_id))
    else:
        con.execute("UPDATE hitl_decisions SET status='TRANSMITTED', transmitted_at=?, "
                    "provider=?, http_status=? WHERE fact_id=?",
                    (now, provider, http_status, fact_id))
    con.commit(); con.close()
    return {"ok": True, "fact_id": fact_id, "status": "TRANSMITTED"}


def mark_transmission_failed(fact_id: str, provider: str, http_status: int) -> dict:
    con = sqlite3.connect(DB)
    con.execute("UPDATE hitl_decisions SET status='TRANSMISSION_FAILED', "
                "provider=?, http_status=? WHERE fact_id=?",
                (provider, http_status, fact_id))
    con.commit(); con.close()
    return {"ok": True, "fact_id": fact_id, "status": "TRANSMISSION_FAILED"}


def retract(fact_id: str, by: str) -> dict:
    """Retrait (droit de rectification). Override tracé depuis TRANSMITTED."""
    cur = get(fact_id)
    if not cur:
        return {"error": "introuvable"}
    if cur["status"] not in ("TRANSMITTED", "APPROVED"):
        return {"error": "retrait_non_autorise_depuis", "status": cur["status"]}
    now = datetime.now(TZ).isoformat(timespec="seconds")
    con = sqlite3.connect(DB)
    con.execute("UPDATE hitl_decisions SET status='RETRACTED', override_by=?, override_at=? "
                "WHERE fact_id=?", (by, now, fact_id))
    con.commit(); con.close()
    return {"ok": True, "fact_id": fact_id, "status": "RETRACTED", "by": by}
