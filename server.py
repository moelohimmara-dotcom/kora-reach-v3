"""server.py — serveur indépendant KORA (stdlib, zéro dépendance).

Sert le dashboard éditorial (static/) et expose une API JSON qui branche
l'agent Reach (reach_agent.py) + le workflow HITL (hitl_store + transmit).
Aucun cron : tout cycle est déclenché par l'éditeur (POST /api/cycle).
Aucune publication auto : transmission uniquement après décision APPROUVER
explicite (HITL verrouillé). Mode transmission = dry_run par défaut.
"""
import json
import os
import threading
import urllib.parse
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import reach_agent
import whitelist as wl
import normalizer
import config
from audit import get_events, log
from hitl_store import (
    fact_id_of, decide, get as hitl_get, list_all,
    mark_transmitted, mark_transmission_failed, retract,
    upsert_fact, list_facts, get_fact,
)
import transmit

ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC = os.environ.get("KORA_STATIC", os.path.join(ROOT, "static"))
EDITOR_NAME = os.environ.get("EDITOR_NAME", "Rédacteur en chef")

# Dernier cycle persisté (pour affichage dashboard au rechargement)
LAST_CYCLE = {"result": None, "ts": None, "running": False}
_LAST_LOCK = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False)
        data = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        p = urllib.parse.urlparse(self.path)
        path = p.path
        if path == "/api/health":
            return self._send(200, {"status": "ok", "whitelist_version": wl.WHITELIST_VERSION,
                                     "mutex": reach_agent.agent.mutex, "editor": EDITOR_NAME,
                                     "transmit_mode": transmit.mode()})
        if path == "/api/whitelist":
            return self._send(200, [{
                "id": e.id, "name": e.name, "category": e.category,
                "entry_url": e.entry_url, "domains": list(e.allowed_domains),
                "vector": e.vector_primary, "guinea_filter": e.guinee_filter,
                "version": e.version, "status": e.status,
            } for e in wl.WHITELIST])
        if path == "/api/audit":
            return self._send(200, get_events())
        if path == "/api/state":
            return self._send(200, {"mutex": reach_agent.agent.mutex,
                                    "whitelist_version": wl.WHITELIST_VERSION,
                                    "editor": EDITOR_NAME, "transmit_mode": transmit.mode()})
        if path == "/api/last":
            with _LAST_LOCK:
                return self._send(200, {
                    "running": LAST_CYCLE["running"],
                    "result": LAST_CYCLE["result"],
                    "ts": LAST_CYCLE["ts"],
                })
        if path == "/api/seed_demo":
            # DEV/démo : injecte des faits cohérents (générés via la logique reconçue)
            # dans LAST_CYCLE pour peupler le dashboard HITL sans collecte réseau.
            # Imports locaux pour autonomie (évite dépendance aux imports de niveau module).
            import config as _cfg
            from zoneinfo import ZoneInfo as _ZI
            from datetime import timedelta as _td
            _TZ = _ZI(_cfg.LIMITS["timezone"])
            cs = datetime.now(_TZ)
            recent = cs - _td(hours=2)
            demo_raws = [
                {"title":"Guinée: accord minier signé à Conakry","url":"https://mosaiqueguinee.com/a1","summary":"Le gouvernement guinéen a signé.","raw_content":"Accord minier en Guinée à Conakry ce jour.","published_at":recent.strftime("%Y-%m-%dT%H:%M:%S"),"image":"https://picsum.photos/seed/minier/800/450"},
                {"title":"Guinée: signature d'un accord minier à Conakry","url":"https://guineenews.org/a1","summary":"Conakry accueille.","raw_content":"La Guinée signe un accord minier historique.","published_at":recent.strftime("%a, %d %b %Y %H:%M:%S %z"),"image":"https://picsum.photos/seed/minier/800/450"},
                {"title":"Accord minier en Guinée scellé à Conakry","url":"https://guinee360.com/a1","summary":"Signature.","raw_content":"En Guinée, accord minier signé ce vendredi.","published_at":recent.strftime("%Y-%m-%d %H:%M:%S"),"image":"https://picsum.photos/seed/minier/800/450"},
                {"title":"Guinée: la BAD finance un barrage à Koukoutamba","url":"https://mosaiqueguinee.com/b1","summary":"La BAD approuve.","raw_content":"Le barrage de Koukoutamba est financé par la BAD.","published_at":recent.strftime("%Y-%m-%dT%H:%M:%S"),"image":"https://picsum.photos/seed/koukou/800/450"},
                {"title":"Koukoutamba: financement BAD pour le barrage","url":"https://guineenews.org/b1","summary":"Financement validé.","raw_content":"La BAD finance le barrage de Koukoutamba en Guinée.","published_at":recent.strftime("%Y-%m-%d %H:%M:%S"),"image":"https://picsum.photos/seed/koukou/800/450"},
            ]
            src = wl.get_entry("mosaique")
            from normalizer import normalize as _norm
            from clusterer import cluster as _cluster, pick_champion as _pc
            from writer import write_article as _wa
            docs = [_norm(r, src, cs) for r in demo_raws]
            pool = [d for d in docs if d["actual"]]
            cl = _cluster(pool, _cfg.LIMITS["cluster_sim_threshold"])
            facts = []
            for c in cl:
                champ, ctx = _pc(c)
                fct = {"champion": champ, "contexts": ctx, "n_sources": len(c),
                       "image": champ.get("image", "")}
                w = _wa(fct)
                fct["article"] = w["article"]; fct["gen_model"] = w["model"]
                fct["image_meta"] = w.get("image_meta", {})
                facts.append(fct)
            # Persiste les faits pour qu'ils survivent au redémarrage
            for fct in facts:
                try: upsert_fact(fct)
                except Exception as _e: log("seed", "FACT_PERSIST_WARN", str(_e), "hitl")
            with _LAST_LOCK:
                LAST_CYCLE["result"] = {"status":"ok","facts":facts,"facts_to_generate":len(facts)}
                LAST_CYCLE["ts"] = datetime.now().isoformat(timespec="seconds")
            return self._send(200, {"seeded": len(facts)})
        if path == "/api/hitl":
            # Tous les faits persistés (survit au redémarrage du service)
            out = list_facts()
            return self._send(200, out)
        # fichier statique
        if path == "/":
            path = "index.html"
        path = path.split("?")[0]
        fp = os.path.normpath(os.path.join(STATIC, path.lstrip("/")))
        if not fp.startswith(STATIC) or not os.path.isfile(fp):
            return self._send(404, {"error": "not found"}, "application/json")
        ctype = "text/html" if fp.endswith(".html") else (
            "application/javascript" if fp.endswith(".js") else (
            "text/css" if fp.endswith(".css") else "application/octet-stream"))
        with open(fp, "rb") as f:
            data = f.read()
        if fp.endswith(".html"):
            # Cache-busting : on force le navigateur à revalider le HTML et on
            # ajoute un suffixe de version sur les assets référencés.
            import re as _re, time as _t
            txt = data.decode("utf-8")
            ts = str(int(_t.time()))
            txt = _re.sub(r'(src="([^"]+\.js))"', r'\1?v=' + ts + '"', txt)
            txt = _re.sub(r'(href="([^"]+\.css))"', r'\1?v=' + ts + '"', txt)
            data = txt.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(data)
            return
        return self._send(200, data, ctype)

    def do_POST(self):
        p = urllib.parse.urlparse(self.path)
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw or b"{}")
        except Exception:
            payload = {}
        if p.path == "/api/cycle":
            if reach_agent.agent.mutex:
                return self._send(429, {"error": "cycle_en_cours"})
            scope = payload.get("scope")
            demand = payload.get("demand", 3)
            initiator = payload.get("initiator", "dashboard")
            # Détache le cycle en arrière-plan (il peut durer 1-2 min en prod)
            def _run():
                # NB: on NE supprime plus reach_state.db (sinon on perd l'historique
                # des décisions + faits à chaque cycle). Upsert à la place.
                result = reach_agent.agent.run(demand=demand, scope_filter=scope,
                                                initiator=initiator, force=bool(payload.get("force", False)))
                # Persiste les faits pour qu'ils survivent au redémarrage
                facts = (result.get("facts") if isinstance(result, dict) else None) or []
                for fct in facts:
                    try: upsert_fact(fct)
                    except Exception as _e: log("cycle", "FACT_PERSIST_WARN", str(_e), "hitl")
                with _LAST_LOCK:
                    LAST_CYCLE["result"] = result
                    LAST_CYCLE["ts"] = datetime.now().isoformat(timespec="seconds")
                    LAST_CYCLE["running"] = False
            with _LAST_LOCK:
                LAST_CYCLE["running"] = True
                LAST_CYCLE["result"] = None
            threading.Thread(target=_run, daemon=True).start()
            return self._send(200, {"started": True, "detail": "Cycle lancé en arrière-plan. Poll /api/last ou /api/hitl."})
        if p.path == "/api/hitl/decide":
            fid = payload.get("fact_id")
            decision = payload.get("decision")  # EDITED | APPROVED | REJECTED
            edited = payload.get("edited_text", "")
            final = payload.get("final_text", edited)
            res = decide(fid, decision, EDITOR_NAME, edited_text=edited, final_text=final)
            if res.get("ok"):
                log(fid, "HITL_DECISION", f"decision={decision} by={EDITOR_NAME}", "hitl")
                # A => Approuver déclenche la transmission (dry_run par défaut)
                if decision == "APPROVED":
                    fact = _fact_by_id(fid)
                    if fact:
                        tx = transmit.transmit(fact, final or fact.get("article", ""))
                        if tx["status"] in ("TRANSMITTED", "DRY_RUN_OK"):
                            mark_transmitted(fid, tx["provider"], tx["http_status"],
                                            final or fact.get("article", ""))
                        else:
                            mark_transmission_failed(fid, tx["provider"], tx["http_status"])
                        log(fid, "TRANSMISSION", f"mode={tx['provider']} status={tx['status']}",
                            tx["provider"])
                        res["transmission"] = tx
            return self._send(200, res)
        if p.path == "/api/hitl/retract":
            fid = payload.get("fact_id")
            res = retract(fid, EDITOR_NAME)
            if res.get("ok"):
                log(fid, "HITL_RETRACT", f"by={EDITOR_NAME}", "hitl")
            return self._send(200, res)
        return self._send(404, {"error": "unknown endpoint"})

    def log_message(self, *a):
        pass  # silence


def _fact_by_id(fid):
    # Lit depuis les faits persistés (survit au redémarrage)
    row = get_fact(fid)
    if not row:
        return None
    import json as _json
    champ = _json.loads(row["champion"]) if row["champion"] else {}
    ctx = _json.loads(row["contexts"]) if row["contexts"] else []
    art = _json.loads(row["article"]) if row["article"] and row["article"].startswith("{") else row["article"]
    img_meta = _json.loads(row["image_meta"]) if row["image_meta"] else {}
    return {
        "fact_id": row["fact_id"], "champion": champ, "contexts": ctx,
        "article": art, "image": row["image"], "image_meta": img_meta,
        "gen_model": row["gen_model"], "n_sources": row["n_sources"],
    }


def main():
    port = int(os.environ.get("PORT", "8765"))
    srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"KORA dashboard sur http://localhost:{port} | editor={EDITOR_NAME} | transmit={transmit.mode()}")
    srv.serve_forever()


if __name__ == "__main__":
    main()
