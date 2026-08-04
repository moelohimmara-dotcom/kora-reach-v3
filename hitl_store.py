"""hitl_store.py — persistance des décisions HITL (verrou + traçabilité).

Machine à états par fait :
  PENDING_REVIEW -> EDITED -> APPROVED -> TRANSMITTED
                              -> REJECTED
  TRANSMITTED -> RETRACTED (override tracé, droit de rectification)
Chaque décision porte decided_by + decided_at (ISO Conakry). Aucune décision
anonyme. Survit aux redémarrages (SQLite ou PostgreSQL selon DATABASE_BACKEND).
"""
import os
import json
import hashlib
from datetime import datetime
from zoneinfo import ZoneInfo
import config
import db
import audit

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
    "REJECTED": set(),
    "TRANSMITTED": {"RETRACTED"},
    "RETRACTED": set(),
}


def _ph():
    return db.placeholder()


def _init():
    con, mode = db.conn()
    try:
        if mode == "postgres":
            cur = con.cursor()
            cur.execute("""CREATE TABLE IF NOT EXISTS hitl_decisions (
                fact_id TEXT PRIMARY KEY, status TEXT NOT NULL, decision TEXT,
                edited_text TEXT, final_text TEXT, decided_by TEXT, decided_at TEXT,
                transmitted_at TEXT, provider TEXT, http_status INTEGER,
                override_by TEXT, override_at TEXT)""")
            cur.execute("""CREATE TABLE IF NOT EXISTS hitl_facts (
                fact_id TEXT PRIMARY KEY, champion TEXT NOT NULL, contexts TEXT,
                article TEXT, image TEXT, image_meta TEXT, gen_model TEXT,
                n_sources INTEGER DEFAULT 1, status TEXT DEFAULT 'PENDING_REVIEW',
                created_at TEXT)""")
            con.commit()
        else:
            cur = con.cursor()
            cur.execute("""CREATE TABLE IF NOT EXISTS hitl_decisions (
                fact_id TEXT PRIMARY KEY, status TEXT NOT NULL, decision TEXT,
                edited_text TEXT, final_text TEXT, decided_by TEXT, decided_at TEXT,
                transmitted_at TEXT, provider TEXT, http_status INTEGER,
                override_by TEXT, override_at TEXT)""")
            cur.execute("""CREATE TABLE IF NOT EXISTS hitl_facts (
                fact_id TEXT PRIMARY KEY, champion TEXT NOT NULL, contexts TEXT,
                article TEXT, image TEXT, image_meta TEXT, gen_model TEXT,
                n_sources INTEGER DEFAULT 1, status TEXT DEFAULT 'PENDING_REVIEW',
                created_at TEXT)""")
            con.commit()
    finally:
        con.close()


_init()


def fact_id_of(champion: dict) -> str:
    raw = (champion.get("url", "") + "|" + champion.get("title", "")).encode()
    return "fact_" + hashlib.sha1(raw).hexdigest()[:16]


def upsert_fact(f: dict) -> str:
    fid = fact_id_of(f.get("champion", {}))
    champ = json.dumps(f.get("champion", {}), ensure_ascii=False)
    ctx = json.dumps(f.get("contexts", []), ensure_ascii=False)
    art = json.dumps(f.get("article", ""), ensure_ascii=False) if isinstance(f.get("article"), (dict, list)) else (f.get("article") or "")
    img = f.get("image", "") or (f.get("champion", {}).get("image", ""))
    img_meta = json.dumps(f.get("image_meta", {}), ensure_ascii=False)
    now = datetime.now(TZ).isoformat(timespec="seconds")
    p = _ph()
    con, mode = db.conn()
    try:
        cur = con.cursor()
        if mode == "postgres":
            cur.execute(
                f"""INSERT INTO hitl_facts (fact_id, champion, contexts, article, image, image_meta, gen_model, n_sources, created_at)
                   VALUES ({p},{p},{p},{p},{p},{p},{p},{p},{p})
                   ON CONFLICT(fact_id) DO UPDATE SET
                     champion=EXCLUDED.champion, contexts=EXCLUDED.contexts, article=EXCLUDED.article,
                     image=EXCLUDED.image, image_meta=EXCLUDED.image_meta, gen_model=EXCLUDED.gen_model,
                     n_sources=EXCLUDED.n_sources""",
                (fid, champ, ctx, art, img, img_meta, f.get("gen_model", ""), f.get("n_sources", 1), now))
        else:
            cur.execute(
                f"""INSERT INTO hitl_facts (fact_id, champion, contexts, article, image, image_meta, gen_model, n_sources, created_at)
                   VALUES ({p},{p},{p},{p},{p},{p},{p},{p},{p})
                   ON CONFLICT(fact_id) DO UPDATE SET
                     champion=excluded.champion, contexts=excluded.contexts, article=excluded.article,
                     image=excluded.image, image_meta=excluded.image_meta, gen_model=excluded.gen_model,
                     n_sources=excluded.n_sources""",
                (fid, champ, ctx, art, img, img_meta, f.get("gen_model", ""), f.get("n_sources", 1), now))
        con.commit()
    finally:
        con.close()
    return fid


def list_facts() -> list:
    _init()
    con, mode = db.conn()
    try:
        cur = con.cursor()
        cur.execute(
            """SELECT f.*, d.status AS d_status, d.decided_by, d.decided_at, d.final_text, d.provider
               FROM hitl_facts f
               LEFT JOIN hitl_decisions d ON d.fact_id = f.fact_id
               ORDER BY f.created_at DESC""")
        rows = cur.fetchall()
    finally:
        con.close()
    out = []
    for r in rows:
        d = dict(r)
        champ = json.loads(d["champion"]) if d["champion"] else {}
        ctx = json.loads(d["contexts"]) if d["contexts"] else []
        art = json.loads(d["article"]) if d["article"] and d["article"].startswith("{") else d["article"]
        img_meta = json.loads(d["image_meta"]) if d["image_meta"] else {}
        if not img_meta.get("image") and d["image"] and d["image"].startswith("http"):
            img_meta = {"image": d["image"], "provider": "loremflickr", "generated": True}
        out.append({
            "fact_id": d["fact_id"], "champion": champ, "contexts": ctx, "article": art,
            "image": d["image"], "image_meta": img_meta, "gen_model": d["gen_model"],
            "n_sources": d["n_sources"], "status": d["d_status"] or "PENDING_REVIEW",
            "decided_by": d["decided_by"], "decided_at": d["decided_at"],
            "final_text": d["final_text"], "provider": d["provider"],
        })
    return out


def get_fact(fid: str) -> dict | None:
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute("SELECT * FROM hitl_facts WHERE fact_id=%s" % _ph(), (fid,))
        r = cur.fetchone()
    finally:
        con.close()
    return dict(r) if r else None


def get(fact_id: str) -> dict | None:
    _init()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute("SELECT * FROM hitl_decisions WHERE fact_id=%s" % _ph(), (fact_id,))
        row = cur.fetchone()
    finally:
        con.close()
    return dict(row) if row else None


def list_all() -> list:
    _init()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute("SELECT * FROM hitl_decisions ORDER BY decided_at DESC")
        rows = cur.fetchall()
    finally:
        con.close()
    return [dict(r) for r in rows]


def decide(fact_id: str, decision: str, decided_by: str,
           edited_text: str = "", final_text: str = "") -> dict:
    if not decided_by or not decided_by.strip():
        return {"error": "decision_anonyme_refusee"}
    existing = get(fact_id)
    cur_state = existing["status"] if existing else "PENDING_REVIEW"
    if decision not in _ALLOWED.get(cur_state, set()):
        return {"error": "transition_interdite", "from": cur_state, "to": decision}
    now = datetime.now(TZ).isoformat(timespec="seconds")
    p = _ph()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        if existing:
            cur.execute(
                f"""UPDATE hitl_decisions SET status={p}, decision={p}, edited_text={p},
                   final_text={p}, decided_by={p}, decided_at={p} WHERE fact_id={p}""",
                (decision, decision, edited_text, final_text, decided_by, now, fact_id))
        else:
            cur.execute(
                f"""INSERT INTO hitl_decisions
                   (fact_id, status, decision, edited_text, final_text, decided_by, decided_at)
                   VALUES ({p},{p},{p},{p},{p},{p},{p})""",
                (fact_id, decision, decision, edited_text, final_text, decided_by, now))
        con.commit()
    finally:
        con.close()
    _act = {"EDITED": "MODIFIE", "APPROVED": "APPROUVE", "REJECTED": "REJETE"}.get(decision, "MODIFIE")
    audit.log(None, f"DECIDE_{decision}", f"fact={fact_id} by={decided_by}",
              fact_id=fact_id, action=_act, editor=decided_by)
    return {"ok": True, "fact_id": fact_id, "status": decision, "decided_by": decided_by}


def mark_transmitted(fact_id: str, provider: str, http_status: int,
                     final_text: str = "") -> dict:
    p = _ph()
    now = datetime.now(TZ).isoformat(timespec="seconds")
    con, _ = db.conn()
    try:
        cur = con.cursor()
        if final_text:
            cur.execute(
                f"UPDATE hitl_decisions SET status='TRANSMITTED', transmitted_at={p}, "
                f"provider={p}, http_status={p}, final_text={p} WHERE fact_id={p}",
                (now, provider, http_status, final_text, fact_id))
        else:
            cur.execute(
                f"UPDATE hitl_decisions SET status='TRANSMITTED', transmitted_at={p}, "
                f"provider={p}, http_status={p} WHERE fact_id={p}",
                (now, provider, http_status, fact_id))
        con.commit()
    finally:
        con.close()
    audit.log(None, "TRANSMIT", f"fact={fact_id} provider={provider} http={http_status}",
              fact_id=fact_id, action="TRANSMIS", editor="system")
    return {"ok": True, "fact_id": fact_id, "status": "TRANSMITTED"}


def mark_transmission_failed(fact_id: str, provider: str, http_status: int) -> dict:
    p = _ph()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(
            f"UPDATE hitl_decisions SET status='TRANSMISSION_FAILED', provider={p}, http_status={p} WHERE fact_id={p}",
            (provider, http_status, fact_id))
        con.commit()
    finally:
        con.close()
    return {"ok": True, "fact_id": fact_id, "status": "TRANSMISSION_FAILED"}


def retract(fact_id: str, by: str) -> dict:
    cur = get(fact_id)
    if not cur:
        return {"error": "introuvable"}
    if cur["status"] not in ("TRANSMITTED", "APPROVED"):
        return {"error": "retrait_non_autorise_depuis", "status": cur["status"]}
    now = datetime.now(TZ).isoformat(timespec="seconds")
    p = _ph()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(
            f"UPDATE hitl_decisions SET status='RETRACTED', override_by={p}, override_at={p} WHERE fact_id={p}",
            (by, now, fact_id))
        con.commit()
    finally:
        con.close()
    audit.log(None, "RETRACT", f"fact={fact_id} by={by}", fact_id=fact_id,
              action="MODIFIE", editor=by)
    return {"ok": True, "fact_id": fact_id, "status": "RETRACTED", "by": by}
