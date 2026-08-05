"""server.py — serveur indépendant KORA (stdlib, zéro dépendance).

Sert le dashboard éditorial (static/) et expose une API JSON qui branche
l'agent Reach (reach_agent.py) + le workflow HITL (hitl_store + transmit).
Aucun cron : tout cycle est déclenché par l'éditeur (POST /api/cycle).
Aucune publication auto : transmission uniquement après décision APPROUVER
explicite (HITL verrouillé). Mode transmission = dry_run par défaut.
"""
import json
import os
import hmac
import threading
import urllib.parse
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import reach_agent
import whitelist as wl
import normalizer
import config
from audit import get_events, log, get_daily, delete_events, purge_all, purge_day
import settings
import auth
from hitl_store import (
    fact_id_of, decide, get as hitl_get, list_all,
    mark_transmitted, mark_transmission_failed, retract,
    upsert_fact, list_facts, get_fact,
)
import transmit

ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC = os.environ.get("KORA_STATIC", os.path.join(ROOT, "static"))
EDITOR_NAME = os.environ.get("EDITOR_NAME", "Rédacteur en chef")
# Auth légère : token partagé (option B choisie par le client).
# Défini dans deploy/.env (KORA_API_TOKEN). Fail-closed : si absent -> écritures refusées.
API_TOKEN = os.environ.get("KORA_API_TOKEN", "").strip()

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

    def _session_ok(self):
        # 1) Session par cookie (auth complète)
        sid = auth.read_cookie_sid(self.headers)
        if sid and auth.get_session_user(sid):
            return True
        # 2) Fallback legacy : token partagé (X-API-Token) — toléré pour ne pas casser les intégrations
        client = (self.headers.get("X-API-Token") or "").strip()
        if not client:
            authz = self.headers.get("Authorization", "")
            if authz.startswith("Bearer "):
                client = authz[7:].strip()
        if client and API_TOKEN and hmac.compare_digest(client, API_TOKEN):
            return True
        return False

    def _require_auth(self):
        if self._session_ok():
            return True
        self._send(401, {"error": "unauthorized"})
        return False

    def _session_role(self):
        sid = auth.read_cookie_sid(self.headers)
        u = auth.get_session_user(sid) if sid else None
        if not u:
            return None
        return u["role"] if isinstance(u, dict) else (u[5] if len(u) > 5 else "normal")

    def _require_role(self, role):
        if not self._session_ok():
            self._send(401, {"error": "unauthorized"})
            return False
        if self._session_role() != role:
            self._send(403, {"error": "forbidden", "role_requis": role})
            return False
        return True

    def do_GET(self):
        p = urllib.parse.urlparse(self.path)
        path = p.path
        if path == "/api/health":
            return self._send(200, {"status": "ok", "whitelist_version": wl.WHITELIST_VERSION,
                                     "mutex": reach_agent.agent.mutex, "editor": EDITOR_NAME,
                                     "transmit_mode": transmit.mode()})
        if path == "/api/whitelist":
            # Sources = configuration sensible -> advanced uniquement
            if not self._require_role("advanced"):
                return
            return self._send(200, [{
                "id": e.id, "name": e.name, "category": e.category,
                "entry_url": e.entry_url, "domains": list(e.allowed_domains),
                "vector": e.vector_primary, "guinea_filter": e.guinee_filter,
                "version": e.version, "status": e.status,
            } for e in wl.WHITELIST])
        if path == "/api/audit":
            if not self._require_auth():
                return
            return self._send(200, {"days": get_daily(), "total": sum(d["count"] for d in get_daily())})
        if path == "/api/state":
            return self._send(200, {"mutex": reach_agent.agent.mutex,
                                    "whitelist_version": wl.WHITELIST_VERSION,
                                    "editor": EDITOR_NAME, "transmit_mode": transmit.mode()})
        if path == "/api/settings":
            # GET = lecture du branding (nom/logo/couleurs) -> public pour l'écran de connexion.
            # La MODIFICATION (POST) reste advanced (voir do_POST).
            return self._send(200, settings.get_settings())
        if path == "/api/last":
            if not self._require_auth():
                return
            with _LAST_LOCK:
                return self._send(200, {
                    "running": LAST_CYCLE["running"],
                    "result": LAST_CYCLE["result"],
                    "ts": LAST_CYCLE["ts"],
                })
        if path == "/api/seed_demo":
            # Action de démo -> advanced uniquement (évite de polluer la prod par un anonyme)
            if not self._require_role("advanced"):
                return
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
        if path == "/api/auth/me":
            sid = auth.read_cookie_sid(self.headers)
            u = auth.get_session_user(sid) if sid else None
            if u:
                return self._send(200, {"ok": True,
                                        "username": u["username"] if isinstance(u, dict) else u[1],
                                        "email": u["email"] if isinstance(u, dict) else u[3],
                                        "role": u["role"] if isinstance(u, dict) else (u[5] if len(u) > 5 else "normal")})
            return self._send(401, {"error": "unauthorized"})
        if path == "/api/auth/users":
            if not self._require_role("advanced"):
                return
            users = auth.list_users()
            out = [dict(u) if isinstance(u, dict) else {"id": u[0], "username": u[1], "email": u[3], "role": u[4] if len(u) > 4 else "normal", "created_at": u[5] if len(u) > 5 else u[4]} for u in users]
            return self._send(200, {"users": out})
        if path == "/api/hitl":
            # Tous les faits persistés (survit au redémarrage du service)
            # Auth requis : un normal peut lire pour valider, un anonyme non.
            if not self._require_auth():
                return
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
        # Routes publiques (aucune session requise) : login, forgot, reset
        PUBLIC_POST = {"/api/auth/login", "/api/auth/forgot", "/api/auth/reset"}
        if p.path not in PUBLIC_POST and not self._require_auth():
            return
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
        if p.path == "/api/audit/purge":
            if not self._require_role("advanced"):
                return
            scope = payload.get("scope", "all")  # "all" | "day"
            day = payload.get("day")
            if scope == "day" and day:
                n = purge_day(day, EDITOR_NAME)
                return self._send(200, {"ok": True, "scope": "day", "day": day, "deleted": n})
            n = purge_all(EDITOR_NAME)
            return self._send(200, {"ok": True, "scope": "all", "deleted": n})
        if p.path == "/api/settings":
            if not self._require_role("advanced"):
                return
            res = settings.save_settings(payload or {})
            return self._send(200 if res.get("ok") else 400, res)
        # ---- Auth ----
        if p.path == "/api/auth/login":
            u = payload.get("username", "").strip()
            pw = payload.get("password", "")
            r = auth.login(u, pw, self.client_address[0])
            if r.get("ok"):
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Set-Cookie", auth.cookie_value(r["session_id"]))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": True, "username": u}, ensure_ascii=False).encode("utf-8"))
            else:
                self._send(401, {"error": "invalid_credentials"})
            return
        if p.path == "/api/auth/logout":
            if not self._require_auth():
                return
            sid = auth.read_cookie_sid(self.headers)
            if sid: auth.delete_session(sid)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Set-Cookie", "kora_sid=; Path=/; HttpOnly; Max-Age=0")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
            return
        if p.path == "/api/auth/change-password":
            if not self._require_auth():
                return
            sid = auth.read_cookie_sid(self.headers)
            user = auth.get_session_user(sid)
            if not user:
                self._send(401, {"error": "unauthorized"})
                return
            uid = user["id"] if isinstance(user, dict) else user[0]
            r = auth.change_password(uid, payload.get("current", ""), payload.get("new", ""))
            self._send(200 if r.get("ok") else 400, r)
            return
        if p.path == "/api/auth/forgot":
            r = auth.forgot_password((payload.get("email") or "").strip().lower(), self.client_address[0])
            self._send(200, r)
            return
        if p.path == "/api/auth/users":
            # Gestion des comptes (advanced-only) : création avec choix de rôle
            if not self._require_role("advanced"):
                return
            uname = (payload.get("username") or "").strip()
            email = (payload.get("email") or "").strip().lower()
            pw = payload.get("password") or ""
            role = payload.get("role", "normal")
            if role not in ("normal", "advanced"):
                self._send(400, {"error": "role_invalide"})
                return
            if len(uname) < 3:
                self._send(400, {"error": "username_too_short"})
                return
            if len(pw) < 8:
                self._send(400, {"error": "password_too_short"})
                return
            r = auth.add_user(uname, pw, email, role)
            self._send(200 if r.get("ok") else 400, r)
            return
        if p.path == "/api/auth/users/role":
            # Changement de rôle d'un compte existant (advanced-only, self-service des habilitations)
            if not self._require_role("advanced"):
                return
            uid = payload.get("id")
            new_role = payload.get("role")
            if not uid:
                self._send(400, {"error": "id_requis"})
                return
            if new_role not in ("normal", "advanced"):
                self._send(400, {"error": "role_invalide"})
                return
            r = auth.set_role(uid, new_role)
            self._send(200 if r.get("ok") else 400, r)
            return
        if p.path == "/api/auth/reset":
            r = auth.reset_password(payload.get("token", ""), payload.get("new_password", ""))
            self._send(200 if r.get("ok") else 400, r)
            return
        return self._send(404, {"error": "unknown endpoint"})

    def do_DELETE(self):
        p = urllib.parse.urlparse(self.path)
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw or b"{}")
        except Exception:
            payload = {}
        if not self._require_role("advanced"):
            return
        if p.path == "/api/auth/users":
            uid = payload.get("id")
            if not uid:
                return self._send(400, {"error": "id_requis"})
            # Empêche de se supprimer soi-même
            sid = auth.read_cookie_sid(self.headers)
            me = auth.get_session_user(sid)
            my_id = me["id"] if isinstance(me, dict) else me[0]
            if uid == my_id:
                return self._send(400, {"error": "cannot_delete_self"})
            r = auth.delete_user(uid)
            self._send(200 if r.get("ok") else 400, r)
            return
        if p.path == "/api/audit":
            ids = payload.get("ids", [])
            if not ids:
                return self._send(400, {"error": "ids_requis"})
            n = delete_events([str(i) for i in ids])
            return self._send(200, {"ok": True, "deleted": n})
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
    auth.init()  # crée tables + admin depuis .env
    srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"KORA dashboard sur http://localhost:{port} | editor={EDITOR_NAME} | transmit={transmit.mode()}")
    srv.serve_forever()


if __name__ == "__main__":
    main()
