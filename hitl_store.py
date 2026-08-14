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
    "TRANSMITTED", "TRANSMISSION_FAILED", "RETRACTED", "TRASHED",
}
# Transitions autorisées depuis chaque état
_ALLOWED = {
    "PENDING_REVIEW": {"EDITED", "APPROVED", "REJECTED", "TRASHED", "PENDING_REVIEW"},  # PENDING_REVIEW -> PENDING_REVIEW autorisé (no-op, sélection multiple)
    "EDITED": {"APPROVED", "REJECTED", "EDITED", "TRASHED", "PENDING_REVIEW"},  # PENDING_REVIEW = "terminer l'édition, ramener à la normale"
    "APPROVED": {"TRANSMITTED", "TRANSMISSION_FAILED", "RETRACTED", "EDITED", "TRASHED"},
    "TRANSMISSION_FAILED": {"TRANSMITTED", "APPROVED", "REJECTED", "TRASHED"},
    "REJECTED": {"TRASHED"},
    "TRANSMITTED": {"RETRACTED", "TRASHED"},
    "RETRACTED": {"TRASHED"},
    "TRASHED": {"PENDING_REVIEW"},  # restauration (corbeille, 11j)
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
                created_at TEXT, cycle_id TEXT)""")
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
                created_at TEXT, cycle_id TEXT)""")
            con.commit()
    finally:
        con.close()
    # Corbeille : on ajoute trashed_at (idempotent, supporte les bases existantes)
    try:
        con, mode = db.conn()
        cur = con.cursor()
        if mode == "postgres":
            cur.execute("ALTER TABLE hitl_facts ADD COLUMN IF NOT EXISTS trashed_at TEXT")
        else:
            try:
                cur.execute("ALTER TABLE hitl_facts ADD COLUMN trashed_at TEXT")
            except Exception:
                pass
        con.commit()
    except Exception:
        pass
    finally:
        try: con.close()
        except Exception: pass
    # cycle_id : lien vers le cycle ayant acquis l'info (idempotent)
    try:
        con, mode = db.conn()
        cur = con.cursor()
        if mode == "postgres":
            cur.execute("ALTER TABLE hitl_facts ADD COLUMN IF NOT EXISTS cycle_id TEXT")
        else:
            try:
                cur.execute("ALTER TABLE hitl_facts ADD COLUMN cycle_id TEXT")
            except Exception:
                pass
        con.commit()
    except Exception:
        pass
    finally:
        try: con.close()
        except Exception: pass


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
                f"""INSERT INTO hitl_facts (fact_id, champion, contexts, article, image, image_meta, gen_model, n_sources, created_at, cycle_id)
                   VALUES ({p},{p},{p},{p},{p},{p},{p},{p},{p},{p})
                   ON CONFLICT(fact_id) DO UPDATE SET
                     champion=EXCLUDED.champion, contexts=EXCLUDED.contexts, article=EXCLUDED.article,
                     image=EXCLUDED.image, image_meta=EXCLUDED.image_meta, gen_model=EXCLUDED.gen_model,
                     n_sources=EXCLUDED.n_sources, cycle_id=EXCLUDED.cycle_id""",
                (fid, champ, ctx, art, img, img_meta, f.get("gen_model", ""), f.get("n_sources", 1), now, f.get("cycle_id", "")))
        else:
            cur.execute(
                f"""INSERT INTO hitl_facts (fact_id, champion, contexts, article, image, image_meta, gen_model, n_sources, created_at, cycle_id)
                   VALUES ({p},{p},{p},{p},{p},{p},{p},{p},{p},{p})
                   ON CONFLICT(fact_id) DO UPDATE SET
                     champion=excluded.champion, contexts=excluded.contexts, article=excluded.article,
                     image=excluded.image, image_meta=excluded.image_meta, gen_model=excluded.gen_model,
                     n_sources=excluded.n_sources, cycle_id=excluded.cycle_id""",
                (fid, champ, ctx, art, img, img_meta, f.get("gen_model", ""), f.get("n_sources", 1), now, f.get("cycle_id", "")))
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
        # B1 fix : article stocké en JSON string ("{}" = vide) -> traiter comme ""
        art_raw = d["article"]
        if art_raw and (art_raw.startswith("{") or art_raw.startswith("[")):
            try:
                parsed = json.loads(art_raw)
                # Si c'est un dict/list vide -> considérer comme article vide
                if isinstance(parsed, (dict, list)) and not parsed:
                    art = ""
                else:
                    art = parsed
            except json.JSONDecodeError:
                art = art_raw
        else:
            art = art_raw or ""
        img_meta = json.loads(d["image_meta"]) if d["image_meta"] else {}
        if not img_meta.get("image") and d["image"] and d["image"].startswith("http"):
            img_meta = {"image": d["image"], "provider": "loremflickr", "generated": True}
        # B+C backend : hitl_facts.status prime sur la décision HITL pour la
        # corbeille (priorité absolue). Un fact à la corbeille (status='TRASHED'
        # en base) doit rester "Corbeille" côté frontend, même si hitl_decisions
        # porte une autre décision (ex: remis en attente). Sinon on utilise la
        # décision HITL (d_status) pour refléter APPROVED/REJECTED/EDITED/TRANSMITTED.
        # B+C backend : hitl_facts.status EST la source de vérité (mirroré par decide()
        # et mark_transmitted()). On l'utilise directement — sauf si c'est PENDING_REVIEW
        # et qu'une décision HITL le précise (cas d'un fact décidé mais non mirroiré).
        _raw_status = d.get("status") or "PENDING_REVIEW"
        if _raw_status == "TRASHED":
            _eff_status = "TRASHED"
        elif _raw_status == "PENDING_REVIEW" and d.get("d_status"):
            _eff_status = d["d_status"]
        else:
            _eff_status = _raw_status
        out.append({
            "fact_id": d["fact_id"], "champion": champ, "contexts": ctx, "article": art,
            "image": d["image"], "image_meta": img_meta, "gen_model": d["gen_model"],
            "n_sources": d["n_sources"], "status": _eff_status,
            "decided_by": d["decided_by"], "decided_at": d["decided_at"],
            "final_text": d["final_text"], "provider": d["provider"],
            "created_at": d["created_at"],
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
        # Miroir du statut dans hitl_facts : list_facts() priorise hitl_facts.status,
        # donc sans ça un fact EDITED/APPROVED/REJECTED/TRANSMITTED reste vu comme
        # PENDING_REVIEW (rebound via hitl_decisions) -> compteurs instables.
        if decision in ("EDITED", "APPROVED", "REJECTED", "TRANSMITTED"):
            cur.execute(f"UPDATE hitl_facts SET status={p} WHERE fact_id={p} AND status <> 'TRASHED'",
                        (decision, fact_id))
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
        # Miroir dans hitl_facts (voir decide())
        cur.execute(f"UPDATE hitl_facts SET status='TRANSMITTED' WHERE fact_id={p} AND status <> 'TRASHED'",
                    (fact_id,))
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


# ---------------------------------------------------------------------------
# Corbeille (restauration 11 jours) + suppression définitive (RGPD)
# ---------------------------------------------------------------------------
TRASH_RETENTION_DAYS = 11


def _fact_rows(where: str, params: tuple) -> list:
    p = _ph()
    con, mode = db.conn()
    try:
        cur = con.cursor()
        cur.execute(
            f"SELECT fact_id, champion, contexts, article, image, image_meta, gen_model, "
            f"n_sources, status, created_at, trashed_at FROM hitl_facts WHERE {where}",
            params)
        if mode == "sqlite":
            rows = cur.fetchall()
            out = []
            for r in rows:
                d = dict(r)
                out.append(d)
        else:
            rows = cur.fetchall()
            out = [dict(r) for r in rows]
    finally:
        con.close()
    # Normalise les champs JSON (champion/contexts/article/image_meta) comme list_facts()
    for d in out:
        try:
            d["champion"] = json.loads(d["champion"]) if d["champion"] else {}
        except Exception:
            d["champion"] = {}
        try:
            d["contexts"] = json.loads(d["contexts"]) if d["contexts"] else []
        except Exception:
            d["contexts"] = []
        try:
            a = d["article"]
            d["article"] = json.loads(a) if (a and a.startswith("{")) else a
        except Exception:
            pass
        try:
            d["image_meta"] = json.loads(d["image_meta"]) if d["image_meta"] else {}
        except Exception:
            d["image_meta"] = {}
    return out


def list_trashed() -> list:
    return _fact_rows("status='TRASHED' ORDER BY trashed_at DESC NULLS LAST", ())


def trash_facts(ids: list) -> dict:
    ids = [str(i) for i in (ids or [])]
    if not ids:
        return {"ok": True, "trashed": 0}
    now = datetime.now(TZ).isoformat(timespec="seconds")
    p = _ph()
    ph = ",".join([p] * len(ids))
    con, _ = db.conn()
    try:
        cur = con.cursor()
        # 1) hitl_facts : statut TRASHED + timestamp
        cur.execute(
            f"UPDATE hitl_facts SET status='TRASHED', trashed_at={p} WHERE fact_id IN ({ph})",
            (now, *ids))
        n = cur.rowcount
        # 2) hitl_decisions : miroir du statut pour que list_facts() le voie (LEFT JOIN sur d_status)
        for fid in ids:
            cur.execute(
                f"""INSERT INTO hitl_decisions (fact_id, status, decision, edited_text, final_text, decided_by, decided_at)
                   VALUES ({p},{p},{p},{p},{p},{p},{p})
                   ON CONFLICT(fact_id) DO UPDATE SET
                     status=EXCLUDED.status, decision=EXCLUDED.decision, decided_by=EXCLUDED.decided_by, decided_at=EXCLUDED.decided_at""",
                (fid, "TRASHED", "TRASHED", "", "", "system", now))
        con.commit()
    finally:
        con.close()
    for fid in ids:
        audit.log(None, "TRASH", f"fact={fid}", fact_id=fid, action="CORBEILLE", editor="system")
    return {"ok": True, "trashed": n}


def restore_fact(fact_id: str) -> dict:
    p = _ph()
    now = datetime.now(TZ).isoformat(timespec="seconds")
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(
            f"UPDATE hitl_facts SET status='PENDING_REVIEW', trashed_at=NULL WHERE fact_id={p}",
            (fact_id,))
        # Miroir dans hitl_decisions pour cohérence list_facts()
        cur.execute(
            f"""INSERT INTO hitl_decisions (fact_id, status, decision, edited_text, final_text, decided_by, decided_at)
               VALUES ({p},{p},{p},{p},{p},{p},{p})
               ON CONFLICT(fact_id) DO UPDATE SET
                 status=EXCLUDED.status, decision=EXCLUDED.decision, decided_by=EXCLUDED.decided_by, decided_at=EXCLUDED.decided_at""",
            (fact_id, "PENDING_REVIEW", "PENDING_REVIEW", "", "", "system", now))
        con.commit()
    finally:
        con.close()
    audit.log(None, "RESTORE", f"fact={fact_id}", fact_id=fact_id, action="RESTAURE", editor="system")
    return {"ok": True, "fact_id": fact_id, "status": "PENDING_REVIEW"}


def delete_facts(ids: list) -> dict:
    """Suppression DÉFINITIVE (RGPD). Efface fait + décision + audit liée."""
    ids = [str(i) for i in (ids or [])]
    if not ids:
        return {"ok": True, "deleted": 0}
    p = _ph()
    ph = ",".join([p] * len(ids))
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"DELETE FROM hitl_facts WHERE fact_id IN ({ph})", tuple(ids))
        cur.execute(f"DELETE FROM hitl_decisions WHERE fact_id IN ({ph})", tuple(ids))
        n = cur.rowcount
        con.commit()
    finally:
        con.close()
    for fid in ids:
        try:
            audit.delete_events([fid])
        except Exception:
            pass
        audit.log(None, "DELETE_FACT", f"fact={fid}", fact_id=fid, action="SUPPRIME", editor="system")
    return {"ok": True, "deleted": n}


def purge_trashed(days: int = TRASH_RETENTION_DAYS) -> int:
    """Suppression définitive automatique des éléments corbeille > days jours."""
    from datetime import timedelta
    cutoff = (datetime.now(TZ) - timedelta(days=days)).isoformat(timespec="seconds")
    p = _ph()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(
            f"SELECT fact_id FROM hitl_facts WHERE status='TRASHED' AND trashed_at IS NOT NULL AND trashed_at < {p}",
            (cutoff,))
        ids = [r[0] for r in cur.fetchall()]
    finally:
        con.close()
    if ids:
        delete_facts(ids)
        audit.log(None, "PURGE_TRASH", f"{len(ids)} element(s) corbeille > {days}j supprime(s)",
                  action="PURGE", editor="system")
    return len(ids)
