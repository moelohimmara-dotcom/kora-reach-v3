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
import agent_prompts
import auth
from hitl_store import (
    fact_id_of, decide, get as hitl_get, list_all,
    mark_transmitted, mark_transmission_failed, retract,
    upsert_fact, list_facts, get_fact,
    trash_facts, restore_fact, delete_facts, list_trashed, purge_trashed,
    count_published, count_rejected, count_deleted, get_dashboard_stats, cleanup_orphan_decisions,
)
import transmit
import writer

ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC = os.environ.get("KORA_STATIC", os.path.join(ROOT, "static"))
EDITOR_NAME = os.environ.get("EDITOR_NAME", "Rédacteur en chef")
# Auth : sessions par cookie UNIQUEMENT. Le fallback X-API-Token legacy a été retiré
# (il constituait un bypass d'auth si le token fuit). Monitoring/serveur-à-serveur doit
# utiliser une session avancée, pas un token partagé.
API_TOKEN = os.environ.get("KORA_API_TOKEN", "").strip()
# Origine autorisée pour CORS (l'app est same-origin ; on épingle pour défense en profondeur)
ALLOWED_ORIGIN = os.environ.get("KORA_ALLOWED_ORIGIN",
                                 f"https://{os.environ.get('KORA_PUBLIC_HOST', '213-156-135-139.sslip.io')}")

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
        self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _session_ok(self):
        # Session par cookie (auth complète) UNIQUEMENT.
        # Plus de fallback X-API-Token (bypass d'auth si fuite).
        sid = auth.read_cookie_sid(self.headers)
        if sid and auth.get_session_user(sid):
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

    def _actor_username(self):
        sid = auth.read_cookie_sid(self.headers)
        u = auth.get_session_user(sid) if sid else None
        if not u:
            return "anonymous"
        return u["username"] if isinstance(u, dict) else u[1]

    def do_GET(self):
        p = urllib.parse.urlparse(self.path)
        path = p.path
        if path == "/api/health":
            return self._send(200, {"status": "ok", "whitelist_version": wl.WHITELIST_VERSION,
                                     "mutex": reach_agent.agent.is_busy, "editor": EDITOR_NAME,
                                     "transmit_mode": transmit.mode(),
                                     "llm_circuit": writer.llm_circuit_status()})
        if path == "/api/regen-suggestions":
            # Suggestions d'angle proposées à l'utilisateur pour la régénération
            return self._send(200, {"suggestions": writer.list_regen_suggestions()})
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
            if not self._require_auth():
                return
            return self._send(200, {"mutex": reach_agent.agent.is_busy,
                                    "whitelist_version": wl.WHITELIST_VERSION,
                                    "editor": EDITOR_NAME, "transmit_mode": transmit.mode()})
        if path == "/api/settings":
            # GET = lecture du branding (nom/logo/couleurs) -> public pour l'écran de connexion.
            # La MODIFICATION (POST) reste advanced (voir do_POST).
            return self._send(200, settings.get_settings())
        if path == "/api/agent-prompts":
            # Zone sensible (§9.5) : prompt système + add-on de l'agent -> advanced uniquement.
            if not self._require_role("advanced"):
                return
            ov = agent_prompts.get_overrides()
            return self._send(200, {
                "system": ov["system"],
                "addon": ov["addon"],
                "system_is_default": not ov["system"],
                "default_system": writer.SYSTEM_PROMPT,
            })
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
                                        "role": u["role"] if isinstance(u, dict) else (u[5] if len(u) > 5 else "normal"),
                                        "avatar_data": u.get("avatar_data") if isinstance(u, dict) else None})
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
            try:
                cleanup_orphan_decisions()
            except Exception:
                pass
            out = list_facts()
            published = count_published()
            rejected = count_rejected()
            deleted = count_deleted()
            return self._send(200, {"facts": out, "published_count": published,
                                     "rejected_count": rejected, "deleted_count": deleted})
        if path == "/api/stats":
            # SSOT : tous les compteurs du dashboard en UN seul objet certifie.
            if not self._require_auth():
                return
            return self._send(200, get_dashboard_stats())
        if path == "/api/hitl/trash":
            # Corbeille (GET) — liste des éléments en attente de restauration (11j)
            if not self._require_auth():
                return
            items = list_trashed()
            return self._send(200, {"ok": True, "items": items, "retention_days": 11})
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
                    txt = _re.sub(r'(src="([^\"]+\.js))"', r'\1?v=' + ts + '"', txt)
                    txt = _re.sub(r'(href="([^\"]+\.css))"', r'\1?v=' + ts + '"', txt)
                    data = txt.encode("utf-8")
                    self.send_response(200)
                    self.send_header("Content-Type", ctype)
                    self.send_header("Content-Length", str(len(data)))
                    self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
                    self.send_header("Cache-Control", "no-store")
                    self.end_headers()
                    self.wfile.write(data)
                    return
        return self._send(200, data, ctype)

    def do_OPTIONS(self):
        # Preflight CORS : le navigateur envoie une requête OPTIONS avant
        # tout POST/PUT avec Content-Type JSON + credentials (même en
        # same-origin). Sans réponse 200 + headers CORS, le navigateur
        # annule le POST réel -> les appels API (login, logout, change-password)
        # restent en "pending" et timeout côté front. C'est ce qui bloquait
        # la déconnexion (le clic ne fermait jamais la session côté UI).
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()
        self.wfile.write(b'{"ok":true}')

    def do_POST(self):
        p = urllib.parse.urlparse(self.path)
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length:
            raw = self.rfile.read(length)
        else:
            # Aucun Content-Length (ex: Transfer-Encoding: chunked via proxy) :
            # on lit tout ce qui arrive jusqu'à fermeture de la connexion.
            raw = b""
            try:
                while True:
                    chunk = self.rfile.read(4096)
                    if not chunk:
                        break
                    raw += chunk
            except Exception:
                pass
        try:
            payload = json.loads(raw or b"{}")
        except Exception:
            payload = {}
        # Routes publiques (aucune session requise) : login, forgot, reset
        PUBLIC_POST = {"/api/auth/login", "/api/auth/forgot", "/api/auth/reset"}
        if p.path not in PUBLIC_POST and not self._require_auth():
            return
        if p.path == "/api/cycle":
            if reach_agent.agent.is_busy:
                return self._send(429, {"error": "cycle_en_cours"})
            scope = payload.get("scope")
            # REGLE METIER : 1 cycle = 1 article (génération unique et verrouillée)
            demand = 1
            initiator = payload.get("initiator", "dashboard")
            # Détache le cycle en arrière-plan (il peut durer 1-2 min en prod)
            def _run():
                # NB: on NE supprime plus reach_state.db (sinon on perd l'historique
                # des décisions + faits à chaque cycle). Upsert à la place.
                try:
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
                except Exception as _cyc:
                    import traceback as _tb
                    _tb.print_exc()
                    with _LAST_LOCK:
                        LAST_CYCLE["result"] = {"error": str(_cyc)}
                        LAST_CYCLE["ts"] = datetime.now().isoformat(timespec="seconds")
                finally:
                    with _LAST_LOCK:
                        LAST_CYCLE["running"] = False
            with _LAST_LOCK:
                LAST_CYCLE["running"] = True
                LAST_CYCLE["result"] = None
            threading.Thread(target=_run, daemon=True).start()
            return self._send(200, {"started": True, "detail": "Cycle lancé en arrière-plan. Poll /api/last ou /api/hitl."})
        if p.path == "/api/cycle/cancel":
            # Interrompt le cycle en cours (arrêt propre après l'article en cours).
            # Le flag est lu par reach_agent.run ; le verrou LAST_CYCLE est relâché
            # à la fin du cycle (finally). On le relâche aussi immédiatement pour
            # débloquer l'UI si le cycle était déjà terminé/crashé.
            reach_agent.cancel_cycle()
            with _LAST_LOCK:
                if not LAST_CYCLE["running"]:
                    LAST_CYCLE["running"] = False
            return self._send(200, {"cancelled": True, "detail": "Demande d'interruption envoyée. Le cycle s'arrêtera après l'article en cours."})
        if p.path == "/api/regenerate":
            # VERROU : aucune génération ne doit être possible tant qu'un cycle tourne.
            with _LAST_LOCK:
                if LAST_CYCLE["running"]:
                    return self._send(429, {"error": "cycle_en_cours", "detail": "Génération verrouillée : un cycle est en cours. Interrompez ou attendez la fin."})
            # Régénère UN article depuis les INFOS DÉJÀ ACQUISES (hitl_facts).
            # AUCUN re-scraping : le champion/contexts source est relu depuis la base.
            fid = payload.get("fact_id")
            suggestion = payload.get("suggestion")  # id parmi les suggestions, ou None
            if not fid:
                return self._send(400, {"error": "fact_id_requis"})
            try:
                res = writer.regenerate(fid, suggestion=suggestion)
            except Exception as _re:
                import traceback as _tb
                _tb.print_exc()
                return self._send(500, {"error": f"regenerate_error: {_re}"})
            if res.get("error"):
                return self._send(404, res)
            return self._send(200, res)
        if p.path == "/api/hitl/decide":
            fid = payload.get("fact_id")
            decision = payload.get("decision")  # EDITED | APPROVED | REJECTED
            edited = payload.get("edited_text", "")
            final = payload.get("final_text", edited)
            wp_status = payload.get("wp_status", "publish")  # publish | draft
            res = decide(fid, decision, EDITOR_NAME, edited_text=edited, final_text=final)
            if res.get("ok"):
                log(fid, "HITL_DECISION", f"decision={decision} by={EDITOR_NAME} wp={wp_status}", "hitl")
                # A => Approuver déclenche la transmission (dry_run par défaut)
                if decision == "APPROVED":
                    fact = _fact_by_id(fid)
                    if fact:
                        tx = transmit.transmit(fact, final or fact.get("article", ""), wp_status=wp_status)
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
        # ---- Actions en masse (sélection multiple) ----
        if p.path == "/api/hitl/bulk":
            ids = payload.get("ids") or []
            action = payload.get("action")  # approve | draft | reject | trash | delete
            wp_status = payload.get("wp_status", "publish")
            results = []
            for fid in ids:
                try:
                    if action == "approve":
                        r = decide(fid, "APPROVED", EDITOR_NAME)
                        if r.get("ok"):
                            fact = _fact_by_id(fid)
                            if fact:
                                tx = transmit.transmit(fact, fact.get("article", ""), wp_status=wp_status)
                                if tx["status"] in ("TRANSMITTED", "DRY_RUN_OK"):
                                    mark_transmitted(fid, tx["provider"], tx["http_status"], fact.get("article", ""))
                                else:
                                    mark_transmission_failed(fid, tx["provider"], tx["http_status"])
                                r["transmission"] = tx
                    elif action == "draft":
                        r = decide(fid, "EDITED", EDITOR_NAME)
                    elif action == "reject":
                        r = decide(fid, "REJECTED", EDITOR_NAME)
                    elif action == "pending":
                        # Ramener à la normale (en attente de validation) sans publier.
                        # No-op si déjà PENDING_REVIEW (transition autorisée).
                        r = decide(fid, "PENDING_REVIEW", EDITOR_NAME)
                    elif action == "trash":
                        r = trash_facts([fid])
                    elif action == "delete":
                        r = delete_facts([fid])
                    else:
                        r = {"error": "action_inconnue"}
                except Exception as e:
                    r = {"error": str(e)}
                r = dict(r); r["fact_id"] = fid
                results.append(r)
            ok = sum(1 for r in results if r.get("ok"))
            return self._send(200, {"ok": True, "total": len(results), "done": ok, "results": results})
        if p.path == "/api/hitl/trash/restore":
            fid = payload.get("fact_id")
            res = restore_fact(fid)
            return self._send(200, res)
        if p.path == "/api/hitl/delete":
            ids = payload.get("ids") or []
            res = delete_facts([str(i) for i in ids])
            return self._send(200, res)
        if p.path == "/api/hitl/trash":
            items = list_trashed()
            return self._send(200, {"ok": True, "items": items, "retention_days": 11})
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
        if p.path == "/api/agent-prompts":
            # Zone sensible (§9.5) : édition tracée dans le journal d'audit (agent_prompts.py).
            if not self._require_role("advanced"):
                return
            field = payload.get("field")  # "system" | "addon"
            value = payload.get("value", "")
            res = agent_prompts.set_override(field, value, editor=self._actor_username())
            return self._send(200 if res.get("ok") else 400, res)
        if p.path == "/api/agent-prompts/reset":
            if not self._require_role("advanced"):
                return
            field = payload.get("field")  # "system" | "addon"
            res = agent_prompts.reset(field, editor=self._actor_username())
            return self._send(200 if res.get("ok") else 400, res)
        # ---- Auth ----
        if p.path == "/api/auth/login":
            u = payload.get("username", "").strip()
            pw = payload.get("password", "")
            r = auth.login(u, pw, self.client_address[0])
            if r.get("ok"):
                auth.log_auth_event("login_success", u, self.client_address[0])
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Set-Cookie", auth.cookie_value(r["session_id"]))
                self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
                self.send_header("Access-Control-Allow-Credentials", "true")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": True, "username": u}, ensure_ascii=False).encode("utf-8"))
            else:
                auth.log_auth_event("login_failure", u, self.client_address[0])
                self._send(401, {"error": "invalid_credentials"})
            return
        if p.path == "/api/auth/logout":
            if not self._require_auth():
                return
            sid = auth.read_cookie_sid(self.headers)
            me = auth.get_session_user(sid)
            if me:
                auth.log_auth_event("logout", me["username"] if isinstance(me, dict) else me[1], self.client_address[0])
            if sid: auth.delete_session(sid)
            # IMPORTANT : le cookie doit être effacé avec les MÊMES attributs
            # que lors du login (Path=/kora-v2/; HttpOnly; SameSite=Lax; Secure en
            # prod). Sinon, sous HTTPS, le navigateur refuse d'écraser le cookie
            # Secure existant par un Set-Cookie non-Secure -> la session reste
            # vivante après "Se déconnecter" (anomalie de fermeture de session).
            _sec = "; Secure" if os.environ.get("KORA_HTTPS", "1") == "1" else ""
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Set-Cookie", f"kora_sid=; Path=/kora-v2/; HttpOnly; SameSite=Lax{_sec}; Max-Age=0")
            self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
            self.send_header("Access-Control-Allow-Credentials", "true")
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
            uname = user["username"] if isinstance(user, dict) else user[1]
            r = auth.change_password(uid, payload.get("current", ""), payload.get("new", ""))
            if r.get("ok"):
                auth.log_auth_event("password_changed", uname, self.client_address[0])
            self._send(200 if r.get("ok") else 400, r)
            return
        if p.path == "/api/auth/avatar":
            # Photo de profil (wireframe 9.2). data-URL uniquement (jamais un
            # chemin de fichier) — même principe que le logo white-label.
            if not self._require_auth():
                return
            sid = auth.read_cookie_sid(self.headers)
            user = auth.get_session_user(sid)
            if not user:
                self._send(401, {"error": "unauthorized"})
                return
            uid = user["id"] if isinstance(user, dict) else user[0]
            r = auth.set_avatar(uid, payload.get("avatar_data", ""))
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
            # Rate-limit création de compte (anti-abuse) par IP
            if not auth.rate_ok(self.client_address[0], "create_user"):
                self._send(429, {"error": "rate_limited"})
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
            if r.get("ok"):
                actor = self._actor_username()
                auth.log_auth_event("user_created", f"{uname} (role={role}) by {actor}", self.client_address[0])
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
            uname = auth.username_by_id(uid) or uid
            actor = self._actor_username()
            r = auth.set_role(uid, new_role)
            if r.get("ok"):
                auth.log_auth_event("role_changed", f"{uname} -> {new_role} by {actor}", self.client_address[0])
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
            uname = auth.username_by_id(uid) or uid
            actor = self._actor_username()
            r = auth.delete_user(uid)
            if r.get("ok"):
                auth.log_auth_event("user_deleted", f"{uname} by {actor}", self.client_address[0])
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
    # B1 fix : article stocké en JSON string ("{}" = vide) -> traiter comme ""
    # Ne parser que si c'est un objet/array JSON non-vide (démarre par { ou [)
    art_raw = row["article"]
    if art_raw and (art_raw.startswith("{") or art_raw.startswith("[")):
        try:
            parsed = _json.loads(art_raw)
            # Si c'est un dict/list vide -> considérer comme article vide
            if isinstance(parsed, (dict, list)) and not parsed:
                art = ""
            else:
                art = parsed
        except _json.JSONDecodeError:
            art = art_raw
    else:
        art = art_raw or ""
    img_meta = _json.loads(row["image_meta"]) if row["image_meta"] else {}
    return {
        "fact_id": row["fact_id"], "champion": champ, "contexts": ctx,
        "article": art, "image": row["image"], "image_meta": img_meta,
        "gen_model": row["gen_model"], "n_sources": row["n_sources"],
    }


def main():
    port = int(os.environ.get("PORT", "8766"))
    auth.init()  # crée tables + admin depuis .env
    # Purge auto de la corbeille (> 11 jours) au démarrage
    try:
        n = purge_trashed(11)
        if n:
            print(f"Corbeille : {n} élément(s) > 11j supprimé(s) définitivement.")
    except Exception as e:
        print("purge_trashed:", e)
    srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"KORA dashboard sur http://localhost:{port} | editor={EDITOR_NAME} | transmit={transmit.mode()}")
    srv.serve_forever()


if __name__ == "__main__":
    main()
