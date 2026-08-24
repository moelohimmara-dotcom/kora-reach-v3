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

import orchestration.reach_agent as reach_agent
import collection.whitelist as wl
import collection.normalizer as normalizer
import core.config as config
from editorial.audit import get_events, log, get_daily, delete_events, purge_all, purge_day
import core.settings as settings
import generation.agent_prompts as agent_prompts
import identity.auth as auth
import identity.root_auth as root_auth
import identity.permissions as permissions
from editorial.hitl_store import (
    fact_id_of, decide, get as hitl_get, list_all,
    mark_transmitted, mark_transmission_failed, retract, mark_retracted,
    upsert_fact, list_facts, get_fact,
    trash_facts, restore_fact, delete_facts, list_trashed, purge_trashed,
    count_published, count_rejected, count_deleted, get_dashboard_stats,
)
import publishing.transmit as transmit
import generation.writer as writer
import orchestration.video as video_orchestrator
import editorial.notifications as notifications

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
# started_by/started_at (2026-08-26, retour utilisateur) : le message
# "cycle_en_cours" renvoyé à un éditeur bloqué par le cycle d'un autre était
# générique -- il ne disait ni qui a lancé le cycle en cours, ni depuis
# quand, obligeant à deviner ou demander sur un autre canal. Posés en même
# temps que running=True (voir /api/cycle), lus par les 429 "cycle_en_cours"
# de /api/cycle, /api/regenerate et /api/video/generate.
LAST_CYCLE = {"result": None, "ts": None, "running": False, "started_by": None, "started_at": None}
_LAST_LOCK = threading.Lock()

# Verrou d'exclusivité génération vidéo (2026-08-21, demande explicite) :
# pendant qu'une vidéo se génère, aucun cycle ni régénération d'article ne
# doit démarrer (dispute CPU/ffmpeg) -- et inversement, une génération vidéo
# ne démarre pas si un cycle tourne (garde-fou déjà existant) NI si une
# AUTRE vidéo est déjà en cours (un seul job vidéo à la fois, refusé
# explicitement plutôt que mis en file d'attente -- choix délibéré, VPS à
# faible concurrence). Les actions NON génératives (approuver/rejeter/
# modifier/brouillon/corbeille) restent libres en permanence : ce verrou ne
# les concerne jamais, voir /api/hitl/decide et /api/hitl/bulk plus bas,
# qui ne le consultent pas.
# started_by (2026-08-26, meme correctif que LAST_CYCLE ci-dessus) : idem
# pour le verrou video, expose dans le 429 "video_en_cours".
VIDEO_LOCK = {"running": False, "fact_id": None, "title": None, "started_at": None, "started_by": None}
# RLock (reentrant) : _try_acquire_video_lock() appelle _start_video_lock()
# tout en tenant deja le verrou (section critique unique, voir 2e passage de
# revue de code 2026-08-21) -- un Lock() simple s'auto-bloquerait ici.
_VIDEO_LOCK_MUTEX = threading.RLock()

# Bug corrige 2026-08-21 (3e passage de revue de code) : meme apres avoir
# rendu VIDEO_LOCK lui-meme atomique (verifier+poser en une section
# critique), une fenetre de course RESTAIT entre les DEUX verrous distincts
# (LAST_CYCLE et VIDEO_LOCK) : /api/cycle verifiait _video_busy() puis, PLUS
# LOIN dans la fonction (apres avoir construit scope/demand/estimate),
# posait LAST_CYCLE["running"]=True -- une requete /api/video/generate
# pouvait s'intercaler dans cet intervalle et acquerir VIDEO_LOCK avant que
# /api/cycle n'ait fini de poser le sien, laissant les deux tourner en
# meme temps malgre l'exclusivite voulue. Meme probleme, symetrique, pour
# /api/regenerate. Ce verrou EXTERNE serialise la sequence complete
# "verifier que rien ne tourne, puis decider de demarrer" des TROIS
# endpoints (cycle/regenerate/video), quel que soit le verrou interne
# concerne -- toujours acquis EN PREMIER, avant _LAST_LOCK ou
# _VIDEO_LOCK_MUTEX (ordre constant -> aucun risque d'interblocage).
_GENERATION_START_LOCK = threading.Lock()

# Référence au serveur pour shutdown gracieux (P0, remplace os._exit)
_SRV = None


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

    def _can_publish_wp(self):
        """Droit d'envoi WordPress de la session courante (2026-08-19,
        restructuration rôles/permissions) — voir permissions.can_publish_wp()."""
        sid = auth.read_cookie_sid(self.headers)
        u = auth.get_session_user(sid) if sid else None
        if not u:
            return False
        role = u["role"] if isinstance(u, dict) else "lecteur"
        wp_flag = u.get("wp_publish_allowed") if isinstance(u, dict) else 0
        return permissions.can_publish_wp(role, wp_flag)

    def _require_capability(self, capability):
        """Vérifie qu'un rôle a le droit d'effectuer `capability`, en lisant
        la table de vérité centralisée dans permissions.py (ADR-0004) au lieu
        d'un rôle littéral répété à chaque appel — voir docs/adr/0004."""
        if not self._session_ok():
            self._send(401, {"error": "unauthorized"})
            return False
        if not permissions.role_can(self._session_role(), capability):
            self._send(403, {"error": "forbidden", "capability": capability})
            return False
        return True

    def _actor_username(self):
        sid = auth.read_cookie_sid(self.headers)
        u = auth.get_session_user(sid) if sid else None
        if not u:
            return "anonymous"
        return u["username"] if isinstance(u, dict) else u[1]

    # ------------------------------------------------------------------
    # Console root (12.1-12.5) : authentification et session TOTALEMENT
    # séparées de l'auth éditeur ci-dessus (root_auth.py, cookie kora_root_sid).
    # ------------------------------------------------------------------
    def _root_session(self):
        sid = root_auth.read_cookie_sid(self.headers)
        return root_auth.get_session_root(sid) if sid else None

    def _require_root(self):
        u = self._root_session()
        if not u:
            self._send(401, {"error": "unauthorized"})
            return None
        return u

    def _root_get(self, path, qs):
        if path == "/api/root/security/questions":
            # Liste de questions suggérées (aucune donnée sensible -> public,
            # nécessaire à l'écran de connexion avant toute session).
            return self._send(200, {"questions": root_auth.SECURITY_QUESTIONS})
        if path == "/api/root/me":
            u = self._require_root()
            if not u:
                return
            return self._send(200, {"ok": True, "username": u["username"] if isinstance(u, dict) else u[1]})
        if path == "/api/root/users":
            if not self._require_root():
                return
            users = auth.list_users()

            def _u(row):
                if isinstance(row, dict):
                    return {"id": row["id"], "username": row["username"], "email": row["email"],
                            "role": row["role"] or "normal", "created_at": row["created_at"],
                            "active": bool(row["active"] if row["active"] is not None else 1),
                            "totp_enabled": bool(row["totp_enabled"])}
                return {"id": row[0], "username": row[1], "email": row[2], "role": row[3] or "normal",
                        "created_at": row[4], "active": bool(row[5] if len(row) > 5 and row[5] is not None else 1),
                        "totp_enabled": bool(row[6]) if len(row) > 6 else False}
            return self._send(200, {"users": [_u(u) for u in users]})
        if path == "/api/root/sessions":
            if not self._require_root():
                return
            sessions = root_auth.list_sessions()
            out = []
            for s in sessions:
                rid = s["root_id"] if isinstance(s, dict) else s[1]
                exp = s["expires_at"] if isinstance(s, dict) else s[2]
                out.append({"session_id": (s["session_id"] if isinstance(s, dict) else s[0])[:8] + "…",
                             "username": root_auth.username_by_id(rid), "expires_at": exp})
            return self._send(200, {"sessions": out})
        if path == "/api/root/audit":
            if not self._require_root():
                return
            n = 200
            import os as _os
            def _tail(fp, source):
                lines = []
                if fp and _os.path.isfile(fp):
                    with open(fp, "r", encoding="utf-8", errors="replace") as f:
                        for line in f.readlines()[-n:]:
                            parts = line.rstrip("\n").split("\t", 3)
                            if len(parts) == 4:
                                lines.append({"ts": parts[0], "event": parts[1], "ip": parts[2], "detail": parts[3], "source": source})
                return lines
            editor_log = _tail(auth._AUTH_LOG, "éditeur")
            root_log_path = os.environ.get("KORA_ROOT_AUTH_LOG", os.path.join(ROOT, "root_audit.log"))
            root_log = _tail(root_log_path, "root")
            merged = sorted(editor_log + root_log, key=lambda e: e["ts"], reverse=True)[:n]
            return self._send(200, {"events": merged})
        if path == "/api/root/health":
            if not self._require_root():
                return
            with _LAST_LOCK:
                last = {"running": LAST_CYCLE["running"], "ts": LAST_CYCLE["ts"]}
            stats = get_dashboard_stats()
            return self._send(200, {
                "agent_busy": reach_agent.agent.is_busy,
                "whitelist_version": wl.WHITELIST_VERSION,
                "transmit_mode": transmit.mode(),
                "llm_circuit": writer.llm_circuit_status(),
                "last_cycle": last,
                "stats": stats,
                "active_editor_sessions_note": "sessions éditeurs non comptées séparément ici (voir /api/root/sessions pour les sessions root)",
            })
        if path == "/api/root/config":
            if not self._require_root():
                return
            # Bug corrige (revue de code 2026-08-19) : lisait config.SOURCES,
            # liste Python figee et obsolete depuis la migration de la
            # whitelist en base (whitelist.py) -- contenait encore Google
            # News (banni de la whitelist reelle le meme jour) et pas les 5
            # sources ajoutees depuis. La console root affichait un decompte
            # totalement decorrele des sources reellement actives.
            entries = wl.all_entries()
            return self._send(200, {
                "branding": settings.get_settings(),
                "sources_actives": len([s for s in entries if s.status == "active"]),
                "sources_total": len(entries),
                "limits": config.LIMITS,
            })
        self._send(404, {"error": "unknown endpoint"})

    def _root_post(self, path, payload):
        ip = self.client_address[0]
        if path == "/api/root/login":
            u = (payload.get("username") or "").strip()
            pw = payload.get("password") or ""
            r = root_auth.login(u, pw, ip=ip)
            if not r.get("ok"):
                root_auth.log_root_event("login_failure", u, ip)
                return self._send(401, r)
            root_auth.log_root_event("login_step1_ok", u, ip)
            return self._send(200, r)
        if path == "/api/root/2fa/setup-init":
            r = root_auth.totp_setup_init(payload.get("setup_token", ""))
            return self._send(200 if r.get("ok") else 400, r)
        if path == "/api/root/2fa/setup-confirm":
            r = root_auth.totp_setup_confirm(payload.get("setup_token", ""), payload.get("code", ""))
            if r.get("ok"):
                root_auth.log_root_event("totp_configured", r.get("username"), ip)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Set-Cookie", root_auth.cookie_value(r["session_id"]))
                body = json.dumps({"ok": True, "username": r["username"], "backup_codes": r["backup_codes"]}, ensure_ascii=False).encode("utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
                self.send_header("Access-Control-Allow-Credentials", "true")
                self.end_headers()
                self.wfile.write(body)
                return
            return self._send(400, r)
        if path == "/api/root/login/verify-2fa":
            r = root_auth.verify_login_totp(payload.get("mfa_token", ""), payload.get("code", ""))
            if not r.get("ok"):
                root_auth.log_root_event("login_failure_2fa", "?", ip)
                return self._send(401, r)
            root_auth.log_root_event("login_success", r.get("username"), ip)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Set-Cookie", root_auth.cookie_value(r["session_id"]))
            body = json.dumps({"ok": True, "username": r.get("username")}, ensure_ascii=False).encode("utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
            self.send_header("Access-Control-Allow-Credentials", "true")
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/api/root/security/setup-confirm":
            r = root_auth.security_setup_confirm(
                payload.get("setup_token", ""), payload.get("q1", ""), payload.get("a1", ""),
                payload.get("q2", ""), payload.get("a2", ""),
            )
            if r.get("ok"):
                root_auth.log_root_event("security_questions_configured", r.get("username"), ip)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Set-Cookie", root_auth.cookie_value(r["session_id"]))
                body = json.dumps({"ok": True, "username": r["username"]}, ensure_ascii=False).encode("utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
                self.send_header("Access-Control-Allow-Credentials", "true")
                self.end_headers()
                self.wfile.write(body)
                return
            return self._send(400, r)
        if path == "/api/root/login/verify-security":
            r = root_auth.verify_login_security(payload.get("sec_token", ""), payload.get("a1", ""), payload.get("a2", ""))
            if not r.get("ok"):
                root_auth.log_root_event("login_failure_security", "?", ip)
                return self._send(401, r)
            root_auth.log_root_event("login_success", r.get("username"), ip)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Set-Cookie", root_auth.cookie_value(r["session_id"]))
            body = json.dumps({"ok": True, "username": r.get("username")}, ensure_ascii=False).encode("utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
            self.send_header("Access-Control-Allow-Credentials", "true")
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/api/root/logout":
            u = self._root_session()
            sid = root_auth.read_cookie_sid(self.headers)
            if sid:
                root_auth.delete_session(sid)
            if u:
                root_auth.log_root_event("logout", u["username"] if isinstance(u, dict) else u[1], ip)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Set-Cookie", root_auth.clear_cookie_value())
            body = b'{"ok": true}'
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
            self.send_header("Access-Control-Allow-Credentials", "true")
            self.end_headers()
            self.wfile.write(body)
            return
        # --- Tout ce qui suit exige une session console active (12.1) ---
        me = self._require_root()
        if not me:
            return
        actor = me["username"] if isinstance(me, dict) else me[1]
        if path == "/api/root/users":
            uname = (payload.get("username") or "").strip()
            email = (payload.get("email") or "").strip().lower()
            pw = payload.get("password") or ""
            role = payload.get("role", "normal")
            if role not in ("normal", "advanced", "lecteur", "owner"):
                return self._send(400, {"error": "role_invalide"})
            if len(uname) < 3:
                return self._send(400, {"error": "username_too_short"})
            if len(pw) < 8:
                return self._send(400, {"error": "password_too_short"})
            r = auth.add_user(uname, pw, email, role)
            if r.get("ok"):
                root_auth.log_root_event("user_created", f"{uname} (role={role}) by root:{actor}", ip)
            return self._send(200 if r.get("ok") else 400, r)
        if path == "/api/root/users/role":
            uid = payload.get("id")
            new_role = payload.get("role")
            if not uid or new_role not in ("normal", "advanced", "lecteur", "owner"):
                return self._send(400, {"error": "id_ou_role_invalide"})
            uname = auth.username_by_id(uid) or uid
            # La console root (00, ADR-0002) est l'autorité ultime au-dessus de
            # l'app editoriale -> autorisee a toucher un Propriétaire au meme
            # titre qu'un Propriétaire (actor_role="owner"). Le garde-fou
            # "dernier Propriétaire protégé" reste actif meme depuis root :
            # protection d'intégrité système, pas une question de droits.
            r = auth.set_role(uid, new_role, actor_role="owner")
            if r.get("ok"):
                root_auth.log_root_event("role_changed", f"{uname} -> {new_role} by root:{actor}", ip)
            return self._send(200 if r.get("ok") else 400, r)
        if path == "/api/root/users/active":
            uid = payload.get("id")
            active = bool(payload.get("active"))
            if not uid:
                return self._send(400, {"error": "id_requis"})
            uname = auth.username_by_id(uid) or uid
            r = auth.set_active(uid, active)
            root_auth.log_root_event("account_disabled" if not active else "account_enabled", f"{uname} by root:{actor}", ip)
            return self._send(200, r)
        if path == "/api/root/users/reset-password":
            uid = payload.get("id")
            new_pw = payload.get("password") or ""
            if not uid:
                return self._send(400, {"error": "id_requis"})
            uname = auth.username_by_id(uid) or uid
            r = auth.admin_reset_password(uid, new_pw)
            if r.get("ok"):
                root_auth.log_root_event("password_reset", f"{uname} by root:{actor}", ip)
            return self._send(200 if r.get("ok") else 400, r)
        if path == "/api/root/sessions/revoke":
            sid_prefix = payload.get("session_id", "")
            if not sid_prefix:
                return self._send(400, {"error": "session_id_requis"})
            for s in root_auth.list_sessions():
                full = s["session_id"] if isinstance(s, dict) else s[0]
                if full.startswith(sid_prefix):
                    root_auth.delete_session(full)
                    root_auth.log_root_event("session_revoked", f"{full[:8]}… by root:{actor}", ip)
                    return self._send(200, {"ok": True})
            return self._send(404, {"error": "session_introuvable"})
        if path == "/api/root/config":
            branding = payload.get("branding")
            if not isinstance(branding, dict):
                return self._send(400, {"error": "branding_requis"})
            r = settings.save_settings(branding)
            if r.get("ok"):
                root_auth.log_root_event("config_updated", f"by root:{actor}", ip)
            return self._send(200 if r.get("ok") else 400, r)
        # ------------------------------------------------------------------
        # Actions critiques système (wireframe 12.5) : double confirmation
        # côté front + ressaisie du mot de passe root ici, systématique et
        # non contournable. Chaque action journalisée dans l'audit root,
        # séparément du journal éditorial (log_root_event).
        # ------------------------------------------------------------------
        if path.startswith("/api/root/actions/"):
            root_id = me["id"] if isinstance(me, dict) else me[0]
            if not root_auth.verify_password(root_id, payload.get("password") or ""):
                return self._send(403, {"error": "invalid_credentials"})
            if path == "/api/root/actions/restart-service":
                root_auth.log_root_event("service_restart", f"by root:{actor}", ip)
                self._send(200, {"ok": True, "detail": "Redémarrage en cours (quelques secondes, relancé par systemd)."})
                # P0 : shutdown gracieux — laisse les handlers finir leur commit
                # puis sort de serve_forever ; systemd Restart=always relance.
                def _do_shutdown():
                    import time as _t
                    _t.sleep(0.5)
                    try:
                        if _SRV:
                            _SRV.shutdown()
                    except Exception:
                        pass
                threading.Thread(target=_do_shutdown, daemon=True).start()
                return
            if path == "/api/root/actions/clear-cache":
                with auth._rl_lock:
                    auth._rl_hits.clear()
                with root_auth._rl_lock:
                    root_auth._rl_hits.clear()
                root_auth.log_root_event("cache_cleared", f"by root:{actor}", ip)
                return self._send(200, {"ok": True, "detail": "Compteurs de limitation de débit (login) réinitialisés."})
            if path == "/api/root/actions/force-release-mutex":
                released = reach_agent.force_release_cycle_lock()
                root_auth.log_root_event("mutex_force_released", f"released={released} by root:{actor}", ip)
                return self._send(200, {"ok": True, "released": released,
                                        "detail": "Verrou libéré." if released else "Aucun verrou actif."})
            return self._send(404, {"error": "unknown_action"})
        self._send(404, {"error": "unknown endpoint"})

    def do_GET(self):
        p = urllib.parse.urlparse(self.path)
        path = p.path
        if path.startswith("/api/root/"):
            return self._root_get(path, p.query)
        if path == "/api/health":
            return self._send(200, {"status": "ok", "whitelist_version": wl.WHITELIST_VERSION,
                                     "mutex": reach_agent.agent.is_busy, "editor": EDITOR_NAME,
                                     "transmit_mode": transmit.mode(),
                                     "llm_circuit": writer.llm_circuit_status()})
        if path == "/api/regen-suggestions":
            # Suggestions d'angle proposées à l'utilisateur pour la régénération
            return self._send(200, {"suggestions": writer.list_regen_suggestions()})
        if path == "/api/whitelist":
            if not self._require_capability("voir_sources"):
                return
            return self._send(200, [{
                "id": e.id, "name": e.name, "category": e.category,
                "entry_url": e.entry_url, "domains": list(e.allowed_domains),
                "vector": e.vector_primary, "vector_secondary": e.vector_secondary,
                "guinea_filter": e.guinee_filter, "responsible": e.responsible,
                "version": e.version, "status": e.status,
                # Suivi RÉEL du statut de collecte (2026-08-24, suggestion
                # audit UX Sources) -- distinct de "status" ci-dessus
                # (gouvernance) ; voir collection/whitelist.py::record_fetch_result().
                "last_fetch_at": e.last_fetch_at, "last_fetch_status": e.last_fetch_status,
                "last_fetch_items": e.last_fetch_items, "last_fetch_error": e.last_fetch_error,
            } for e in wl.all_entries()])
        if path == "/api/audit":
            if not self._require_auth():
                return
            return self._send(200, {"days": get_daily(), "total": sum(d["count"] for d in get_daily())})
        if path == "/api/audit/admin":
            # Bug corrige 2026-08-22 (audit mobile reel) : le tiroir Parametres
            # > "Journal d'audit" appelait cette route depuis le debut sans
            # qu'elle n'ait jamais existe cote serveur (404 silencieux, lu a
            # tort par le frontend comme "aucune action admin enregistree").
            # auth_audit.log est deja alimente en continu (login/mot de passe/
            # comptes/invitations, voir identity/auth.py log_auth_event) --
            # il ne manquait que cette route pour le lire.
            if not self._require_capability("voir_audit_admin"):
                return
            return self._send(200, {"days": auth.get_admin_audit_days()})
        if path == "/api/state":
            if not self._require_auth():
                return
            return self._send(200, {"mutex": reach_agent.agent.is_busy,
                                    "whitelist_version": wl.WHITELIST_VERSION,
                                    "editor": EDITOR_NAME, "transmit_mode": transmit.mode()})
        if path == "/api/video/status":
            # Poll cote frontend pendant/apres une generation video (2026-08-20).
            if not self._require_auth():
                return
            _qs = urllib.parse.parse_qs(p.query)
            fid = (_qs.get("fact_id") or [""])[0]
            if not fid:
                return self._send(400, {"error": "fact_id_requis"})
            res = video_orchestrator.video_status(fid)
            return self._send(200 if res.get("ok") else 404, res)
        if path == "/api/videos":
            # Liste toutes les videos (page dediee, 2026-08-21). Meme garde
            # d'authentification que /api/video/status -- lecture seule,
            # ouverte a tout role connecte (pas de restriction "advanced").
            if not self._require_auth():
                return
            return self._send(200, {"videos": video_orchestrator.list_videos()})
        if path == "/api/settings":
            # GET = lecture du branding (nom/logo/couleurs) -> public pour l'écran de connexion.
            # La MODIFICATION (POST) reste advanced (voir do_POST).
            return self._send(200, settings.get_settings())
        if path == "/api/settings/transmitter":
            # État du transmetteur (wireframe 9.6) : mode actif + identifiants
            # configurés en masqué (jamais la valeur réelle). Lecture seule,
            # gouvernée par .env serveur — pas de POST correspondant.
            if not self._require_capability("voir_transmetteur"):
                return
            return self._send(200, {"mode": transmit.mode(), "credentials": transmit.credentials_status()})
        if path == "/api/agent-prompts":
            if not self._require_capability("voir_prompts_agent"):
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
                # video_lock (2026-08-21) : exposé ici -- DEJA polle par le
                # frontend toutes les 30s / a chaque retour au premier plan
                # (meme mecanisme que "running" ci-dessus pour reconnecter
                # resumeCycleWatch()) -- pour que Store.resumeVideoWatch()
                # puisse reconnecter le bandeau video global apres un F5 ou
                # un cycle demarre depuis un autre appareil/onglet, plutot
                # que de ne s'accrocher QUE si CETTE session a elle-meme
                # declenche la generation (sinon le bandeau reste invisible
                # tant qu'on ne rouvre pas la fiche de l'article concerne).
                with _VIDEO_LOCK_MUTEX:
                    vlock = dict(VIDEO_LOCK)
                return self._send(200, {
                    "running": LAST_CYCLE["running"],
                    "result": LAST_CYCLE["result"],
                    "ts": LAST_CYCLE["ts"],
                    # Progression "Article X sur Y" du cycle en cours (loader
                    # plein écran) — 0/0 si aucun cycle actif.
                    "progress": reach_agent.get_progress() if LAST_CYCLE["running"] else None,
                    "video_lock": vlock,
                })
        if path == "/api/notifications":
            # Centre de notifications PERSISTANT (2026-08-22) : remplace le
            # simple historique de toasts local au frontend -- signale les
            # evenements de fond (cycle/video termines) meme si personne ne
            # regardait au bon moment, partage entre onglets/appareils.
            if not self._require_auth():
                return
            return self._send(200, notifications.list_recent())
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
        if path == "/api/auth/2fa/status":
            if not self._require_auth():
                return
            sid = auth.read_cookie_sid(self.headers)
            user = auth.get_session_user(sid)
            uid = user["id"] if isinstance(user, dict) else user[0]
            return self._send(200, auth.totp_status(uid))
        if path == "/api/auth/users":
            if not self._require_capability("voir_comptes"):
                return
            users = auth.list_users()
            out = [dict(u) if isinstance(u, dict) else {"id": u[0], "username": u[1], "email": u[3], "role": u[4] if len(u) > 4 else "normal", "created_at": u[5] if len(u) > 5 else u[4]} for u in users]
            return self._send(200, {"users": out})
        if path == "/api/auth/invitations":
            # Liste des invitations (Phase 2) : le statut affiché tient compte
            # de l'expiration calculée ici, pas stockée en base (voir
            # auth.list_invitations()).
            if not self._require_capability("voir_comptes"):
                return
            now = datetime.now().isoformat(timespec="seconds")
            out = []
            for inv in auth.list_invitations():
                display_status = inv["status"]
                if display_status == "pending" and inv.get("expires_at") and now > inv["expires_at"]:
                    display_status = "expired"
                out.append({**inv, "display_status": display_status})
            return self._send(200, {"invitations": out})
        if path == "/api/auth/invitations/check":
            # Public (pas de session) : l'écran "définir mon mot de passe"
            # doit pouvoir afficher l'email/rôle avant que la personne invitée
            # n'ait le moindre compte.
            qs = urllib.parse.parse_qs(p.query)
            token = (qs.get("token") or [""])[0]
            inv = auth.get_invitation(token)
            if not inv:
                return self._send(404, {"error": "invitation_invalide_ou_expiree"})
            return self._send(200, {"email": inv["email"], "role": inv["role"]})
        if path == "/api/hitl":
            # Tous les faits persistés (survit au redémarrage du service)
            # Auth requis : un normal peut lire pour valider, un anonyme non.
            if not self._require_auth():
                return
            # Bug corrige 2026-08-19 (rapporte : bandeau d'erreur reapparaissant --
            # /api/hitl mesure ~25s de reponse en prod) : cleanup_orphan_decisions()
            # (DELETE ... WHERE fact_id NOT IN (SELECT ...), balayage complet de
            # hitl_decisions) tournait a CHAQUE appel de ce endpoint -- appele au
            # chargement de la page, a chaque navigation, et toutes les 30s par
            # l'auto-refresh. Une purge defensive pour un cas rare (decision
            # orpheline, ex. donnee historique/migration) n'a aucune raison de
            # re-scanner toute la table a cette frequence. Deplacee vers un rythme
            # raisonnable : une fois par cycle (reach_agent.py), plus jamais ici.
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
        elif path == "/root-console":
            # Console système root (12.5) : route dédiée, jamais liée dans la
            # nav de l'app éditeur -> accessible seulement en tapant l'URL.
            path = "root-console.html"
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
        elif (self.headers.get("Transfer-Encoding", "") or "").lower() == "chunked":
            # Transfer-Encoding: chunked (proxy) sans Content-Length : seul cas
            # legitime ou il reste un corps a lire sans longueur connue a l'avance.
            raw = b""
            try:
                while True:
                    chunk = self.rfile.read(4096)
                    if not chunk:
                        break
                    raw += chunk
            except Exception:
                pass
        else:
            # Bug corrige 2026-08-19 (trouve en testant /api/cycle/cancel) :
            # sans Content-Length NI Transfer-Encoding: chunked, la requete N'A
            # PAS de corps (RFC 7230) -- le fallback "lire jusqu'a fermeture"
            # ci-dessus BLOQUAIT INDEFINIMENT le thread sur une connexion
            # keep-alive (rfile.read() attend un EOF qui ne vient jamais tant
            # que le client, lui, attend une reponse). Reproduit avec un simple
            # `curl -X POST url` sans -d (aucune donnee -> pas de Content-Length
            # envoye par curl) : thread bloque pour de bon, jamais liberé.
            raw = b""
        try:
            payload = json.loads(raw or b"{}")
        except Exception:
            payload = {}
        # Console root (12.5) : authentification totalement séparée, jamais
        # de session éditeur ici -> traité à part, AVANT toute logique éditeur.
        if p.path.startswith("/api/root/"):
            return self._root_post(p.path, payload)
        # Routes publiques (aucune session requise) : login, forgot, reset
        PUBLIC_POST = {"/api/auth/login", "/api/auth/forgot", "/api/auth/reset", "/api/auth/login/verify-2fa",
                       "/api/auth/invitations/accept"}
        if p.path not in PUBLIC_POST and not self._require_auth():
            return
        # Rôle 'lecteur' (12.1) : lecture seule -> bloque toute mutation sauf
        # les actions sur son propre compte (mot de passe, 2FA, avatar, déco).
        LECTEUR_ALLOWED_POST = {"/api/auth/logout", "/api/auth/change-password",
                                 "/api/auth/2fa/setup", "/api/auth/2fa/confirm",
                                 "/api/auth/2fa/disable", "/api/auth/avatar"}
        if p.path not in PUBLIC_POST and p.path not in LECTEUR_ALLOWED_POST and self._session_role() == "lecteur":
            return self._send(403, {"error": "forbidden", "reason": "role_lecteur_lecture_seule"})
        if p.path == "/api/cycle":
            # _GENERATION_START_LOCK (2026-08-21, 3e passage de revue de
            # code) : les vérifications ET la pose de LAST_CYCLE["running"]
            # doivent former UNE SEULE section critique avec le verrou vidéo
            # -- sinon une requête /api/video/generate peut s'intercaler
            # entre "rien ne tourne" et "je marque le cycle comme démarré",
            # et les deux tournent en même temps malgré l'exclusivité voulue.
            with _GENERATION_START_LOCK:
                if reach_agent.agent.is_busy:
                    return self._send(429, _cycle_busy_detail("Un cycle est déjà en cours."))
                # Verrou d'exclusivité vidéo (2026-08-21) : voir commentaire de
                # VIDEO_LOCK en tête de fichier et _video_busy() plus bas.
                _vb = _video_busy()
                if _vb:
                    return self._send(429, _vb)
                with _LAST_LOCK:
                    LAST_CYCLE["running"] = True
                    LAST_CYCLE["result"] = None
                    LAST_CYCLE["started_by"] = self._actor_username()
                    LAST_CYCLE["started_at"] = datetime.now().isoformat(timespec="seconds")
            scope = payload.get("scope")
            # REGLE METIER (2026-08-19) : Kora Agent genere TOUS les articles issus
            # des faits FRAIS et uniques collectes lors du cycle, pas un seul.
            # demand optionnel (payload) permet de plafonner explicitement une
            # demande ciblee ; sinon reach_agent applique le garde-fou quotidien
            # (config.LIMITS["daily_article_limit"]) sur le nombre de dossiers.
            demand = payload.get("demand")
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
                    # Notification persistante (2026-08-22) : un cycle dure
                    # facilement 20-60 min -- sans ceci, personne ne l'apprend
                    # si tout le monde a quitte la page entre-temps.
                    n = len(facts)
                    if n > 0:
                        notifications.create("cycle_done", f"Cycle terminé : {n} article(s) généré(s).", route="facts")
                    else:
                        # route="dashboard" (2026-08-25, audit de nommage : la route
                        # frontend interne "cockpit" a été renommée "dashboard" --
                        # voir kora-vite/src/views/dashboard.js. Ce champ est stocké
                        # tel quel en base (table notifications) et consommé par
                        # navigate(n.route) côté frontend.
                        notifications.create("info", "Cycle terminé : rien de nouveau à générer.", route="dashboard")
                except Exception as _cyc:
                    import traceback as _tb
                    _tb.print_exc()
                    with _LAST_LOCK:
                        LAST_CYCLE["result"] = {"error": str(_cyc)}
                        LAST_CYCLE["ts"] = datetime.now().isoformat(timespec="seconds")
                    notifications.create("cycle_error", f"Le cycle a échoué : {str(_cyc)[:200]}", route="dashboard")
                finally:
                    with _LAST_LOCK:
                        LAST_CYCLE["running"] = False
            # LAST_CYCLE["running"]/["result"] déjà posés ci-dessus, DANS la
            # section critique _GENERATION_START_LOCK (voir plus haut) --
            # ne plus les reposer ici, hors de cette section, sans quoi la
            # fenêtre de course qu'on vient de corriger réapparaît.
            threading.Thread(target=_run, daemon=False).start()
            # Estimation immediate (2026-08-19, demande explicite) : previent
            # tout de suite l'utilisateur d'un ordre de grandeur, avant meme
            # de connaitre le nombre d'articles (connu seulement apres la
            # collecte). Voir reach_agent.estimate_launch_message().
            estimate = reach_agent.estimate_launch_message()
            return self._send(200, {"started": True, "detail": "Cycle lancé en arrière-plan. Poll /api/last ou /api/hitl.",
                                    "estimate": estimate})
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
            # _GENERATION_START_LOCK (2026-08-21, 3e passage de revue de
            # code) : les deux vérifications (cycle, vidéo) doivent former
            # UNE SEULE section critique -- sinon un /api/video/generate
            # concurrent peut acquérir son verrou pile entre les deux checks
            # séparés. Contrairement à /api/cycle, regenerate() lui-même
            # (synchrone, potentiellement long) reste volontairement HORS de
            # cette section : la verrouiller aussi serait fermer la fenêtre
            # de course en échange de sérialiser TOUTES les régénérations
            # entre elles, un changement de comportement bien plus lourd que
            # ce que cette correction vise.
            with _GENERATION_START_LOCK:
                with _LAST_LOCK:
                    if LAST_CYCLE["running"]:
                        return self._send(429, _cycle_busy_detail(
                            "Génération verrouillée : un cycle est en cours. Interrompez ou attendez la fin."))
                _vb = _video_busy()
                if _vb:
                    return self._send(429, _vb)
            # Régénère UN article depuis les INFOS DÉJÀ ACQUISES (hitl_facts).
            # AUCUN re-scraping : le champion/contexts source est relu depuis la base.
            fid = payload.get("fact_id")
            suggestion = payload.get("suggestion")  # id parmi les suggestions, ou None
            if not fid:
                return self._send(400, {"error": "fact_id_requis"})
            try:
                res = reach_agent.regenerate(fid, suggestion=suggestion)
            except Exception as _re:
                import traceback as _tb
                _tb.print_exc()
                return self._send(500, {"error": f"regenerate_error: {_re}"})
            if res.get("error"):
                return self._send(404, res)
            return self._send(200, res)
        if p.path == "/api/video/generate":
            # Genere une video narree pour UN article (2026-08-20, simplifiee
            # 2026-08-21 : une seule image reelle -- plus de generation IA,
            # voir generation/video.py). TOUJOURS en arriere-plan (thread
            # dedie dans l'orchestrateur) : la generation prend 1 a 3 min,
            # inacceptable en synchrone dans une requete HTTP. Meme verrou
            # anti-cycle que /api/regenerate (le cycle et la generation video
            # se disputeraient sinon le CPU).
            fid = payload.get("fact_id")
            if not fid:
                return self._send(400, {"error": "fact_id_requis"})
            # get_fact() renvoie la ligne brute (champion en JSON string, pas
            # encore parse -- meme convention que _fact_by_id() plus bas).
            title = ""
            fact = get_fact(fid)
            if fact and fact.get("champion"):
                try:
                    title = json.loads(fact["champion"]).get("title", "")
                except Exception:
                    title = ""
            # _GENERATION_START_LOCK (2026-08-21, 3e passage de revue de
            # code) : le check cycle ET l'acquisition atomique du verrou
            # vidéo forment maintenant UNE SEULE section critique partagée
            # avec /api/cycle et /api/regenerate (voir commentaire en tête de
            # fichier) -- ferme la fenêtre de course entre les deux verrous
            # distincts, pas seulement à l'intérieur de chacun.
            with _GENERATION_START_LOCK:
                with _LAST_LOCK:
                    if LAST_CYCLE["running"]:
                        return self._send(429, _cycle_busy_detail(
                            "Génération vidéo verrouillée : un cycle est en cours."))
                _vb = _try_acquire_video_lock(fid, title, self._actor_username())
                if _vb:
                    return self._send(429, _vb)
            # Bug corrige 2026-08-21 (revue de code) : le verrou est acquis
            # de façon optimiste (avant même de savoir si le fait existe /
            # a une image / etc.) -- si start_video_generation() LÈVE une
            # exception (au lieu de renvoyer proprement ok=False, ce qui
            # pouvait arriver sur un champion corrompu avant le correctif de
            # orchestration/video.py), le verrou restait pris pour toujours
            # sans ce try/finally, bloquant aussi /api/cycle et
            # /api/regenerate. Le correctif racine (json.loads protégé) reste
            # en place ; ce filet de sécurité couvre toute autre exception
            # imprévue de la même famille.
            # narration_mode (2026-08-24, dialogue à deux voix) : 'solo'
            # (défaut, inchangé) | 'duo_hf' | 'duo_hh'. Validation déléguée à
            # l'orchestrateur (retombe sur 'solo' si valeur inconnue).
            narration_mode = payload.get("narration_mode") or "solo"
            try:
                res = video_orchestrator.start_video_generation(
                    fid, on_complete=_release_video_lock_state, narration_mode=narration_mode)
            except Exception as _ve:
                _release_video_lock_state()
                import traceback as _tb
                _tb.print_exc()
                return self._send(500, {"error": f"video_generate_error: {_ve}"})
            if not res.get("ok"):
                # Aucun thread n'a été lancé (fait introuvable, article trop
                # court, pas d'image...) -> le verrou posé de façon optimiste
                # doit être libéré ici, sinon plus AUCUNE vidéo ne pourrait
                # jamais démarrer.
                _release_video_lock_state()
            return self._send(200 if res.get("ok") else 400, res)
        if p.path == "/api/hitl/decide":
            fid = payload.get("fact_id")
            decision = payload.get("decision")  # EDITED | APPROVED | REJECTED
            edited = payload.get("edited_text", "")
            final = payload.get("final_text", edited)
            wp_status = payload.get("wp_status", "publish")  # publish | draft
            # Garde-fou ajouté suite à la revue de code du 2026-08-20 (2e
            # passage) : verifier le statut AVANT d'appeler decide(), pas
            # apres. Un premier correctif appelait decide() puis inspectait
            # from_status pour sauter la transmission -- mais decide() avait
            # DEJA ecrase hitl_facts.status de TRANSMITTED vers APPROVED a ce
            # moment-la (transmit() etait bien saute, mais l'article restait
            # affiche comme "Approuve" au lieu de "Transmis" alors qu'il est
            # toujours reellement en ligne sur WordPress). En verifiant ICI,
            # rien n'est ecrit du tout quand l'article est deja transmis.
            if decision == "APPROVED":
                _skip = _already_transmitted_skip(fid)
                if _skip:
                    return self._send(200, {"ok": True, "fact_id": fid, "status": "TRANSMITTED", "transmission": _skip})
            res = decide(fid, decision, EDITOR_NAME, edited_text=edited, final_text=final)
            if res.get("ok"):
                log(fid, "HITL_DECISION", f"decision={decision} by={EDITOR_NAME} wp={wp_status}", "hitl")
                # A => Approuver déclenche la transmission (dry_run par défaut)
                if decision == "APPROVED":
                    # Droit d'envoi WordPress (§3 du plan valide 2026-08-19) :
                    # réservé à Propriétaire/Administrateur, ou à un Éditeur
                    # délégué explicitement (auth.set_wp_publish). Vérifié ICI,
                    # côté serveur — jamais confié au seul choix affiché côté
                    # interface. L'article reste "Approuvé" côté KORA (decide()
                    # a déjà fait son travail ci-dessus), rien ne part vers
                    # WordPress tant que ce droit manque.
                    if not self._can_publish_wp():
                        res["transmission"] = {"status": "SKIPPED_NO_WP_RIGHT",
                            "detail": "Article approuvé, en attente d'envoi WordPress par un Propriétaire/Administrateur."}
                    else:
                        fact = _fact_by_id(fid)
                        if fact:
                            tx = transmit.transmit(fact, final or fact.get("article", ""), wp_status=wp_status)
                            if tx["status"] in ("TRANSMITTED", "DRY_RUN_OK"):
                                mark_transmitted(fid, tx["provider"], tx["http_status"],
                                                final or fact.get("article", ""),
                                                wp_post_id=tx.get("wp_post_id") or "",
                                                wp_url=tx.get("wp_url") or "",
                                                wp_status=wp_status,
                                                wp_category_name=tx.get("category_name") or "")
                            else:
                                mark_transmission_failed(fid, tx["provider"], tx["http_status"])
                            log(fid, "TRANSMISSION", f"mode={tx['provider']} status={tx['status']}",
                                tx["provider"])
                            res["transmission"] = tx
            return self._send(200, res)
        if p.path == "/api/notifications/read":
            if not self._require_auth():
                return
            nid = payload.get("id")
            if nid is not None:
                notifications.mark_read(nid)
            else:
                notifications.mark_all_read()
            return self._send(200, {"ok": True})
        if p.path == "/api/hitl/retract":
            fid = payload.get("fact_id")
            res = retract(fid, EDITOR_NAME)
            if res.get("ok"):
                log(fid, "HITL_RETRACT", f"by={EDITOR_NAME}", "hitl")
            return self._send(200, res)
        if p.path == "/api/hitl/withdraw":
            # Retrait synchronisé (2026-08-23, ADR-0005, tâche T1) : distinct
            # de /api/hitl/retract ci-dessus (qui gère APPROVED/EDITED ->
            # PENDING_REVIEW, AVANT toute transmission). Celui-ci agit sur un
            # fait DÉJÀ transmis -- même droit que la publication WordPress
            # (retirer un article publié est au moins aussi sensible que le
            # publier), et n'écrit RIEN côté KORA tant que WordPress n'a pas
            # confirmé le retrait (voir transmit.retract_from_wordpress).
            if not self._can_publish_wp():
                return self._send(403, {"error": "droit_wordpress_requis"})
            fid = payload.get("fact_id")
            fact = get_fact(fid)
            if not fact:
                return self._send(404, {"error": "introuvable"})
            if fact.get("status") != "TRANSMITTED":
                return self._send(200, {"error": "pas_transmis", "status": fact.get("status")})
            wp_res = transmit.retract_from_wordpress(fact.get("wp_post_id"))
            if not wp_res.get("ok"):
                log(fid, "WITHDRAW_FAILED", f"error={wp_res.get('error')}", "wordpress")
                return self._send(200, {"error": "retrait_wordpress_echoue", "detail": wp_res.get("error")})
            res = mark_retracted(fid, EDITOR_NAME)
            log(fid, "WITHDRAW", f"by={EDITOR_NAME} detail={wp_res.get('error') or 'ok'}", "wordpress")
            if wp_res.get("error"):  # post déjà absent côté WP -- succès quand même, avec avertissement
                res["warning"] = wp_res["error"]
            return self._send(200, res)
        # ---- Actions en masse (sélection multiple) ----
        if p.path == "/api/hitl/bulk":
            ids = payload.get("ids") or []
            action = payload.get("action")  # approve | draft | reject | trash | delete
            wp_status = payload.get("wp_status", "publish")
            # Même garde-fou que /api/hitl/decide (§3 du plan valide 2026-08-19) :
            # calculé une fois pour tout le lot, pas par fait (le droit ne change
            # pas au milieu d'une même requête).
            can_wp = self._can_publish_wp()
            results = []
            for fid in ids:
                try:
                    if action == "approve":
                        # Même garde-fou factorisé que /api/hitl/decide (voir
                        # _already_transmitted_skip) : vérifié AVANT decide()
                        # pour ne jamais écraser le statut affiché "Transmis"
                        # par "Approuvé" sur un article déjà en ligne.
                        _skip = _already_transmitted_skip(fid)
                        if _skip:
                            r = {"ok": True, "status": "TRANSMITTED", "transmission": _skip}
                            r = dict(r); r["fact_id"] = fid
                            results.append(r)
                            continue
                        r = decide(fid, "APPROVED", EDITOR_NAME)
                        if r.get("ok"):
                            if not can_wp:
                                r["transmission"] = {"status": "SKIPPED_NO_WP_RIGHT",
                                    "detail": "Article approuvé, en attente d'envoi WordPress par un Propriétaire/Administrateur."}
                            else:
                                fact = _fact_by_id(fid)
                                if fact:
                                    tx = transmit.transmit(fact, fact.get("article", ""), wp_status=wp_status)
                                    if tx["status"] in ("TRANSMITTED", "DRY_RUN_OK"):
                                        mark_transmitted(fid, tx["provider"], tx["http_status"], fact.get("article", ""),
                                                          wp_post_id=tx.get("wp_post_id") or "",
                                                          wp_url=tx.get("wp_url") or "",
                                                          wp_status=wp_status,
                                                          wp_category_name=tx.get("category_name") or "")
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
            if not self._require_capability("purger_audit"):
                return
            scope = payload.get("scope", "all")  # "all" | "day"
            day = payload.get("day")
            if scope == "day" and day:
                n = purge_day(day, EDITOR_NAME)
                return self._send(200, {"ok": True, "scope": "day", "day": day, "deleted": n})
            n = purge_all(EDITOR_NAME)
            return self._send(200, {"ok": True, "scope": "all", "deleted": n})
        if p.path == "/api/settings":
            if not self._require_capability("modifier_identite"):
                return
            res = settings.save_settings(payload or {})
            return self._send(200 if res.get("ok") else 400, res)
        if p.path == "/api/agent-prompts":
            # Zone sensible (§9.5) : édition tracée dans le journal d'audit (agent_prompts.py).
            if not self._require_capability("modifier_prompts_agent"):
                return
            field = payload.get("field")  # "system" | "addon"
            value = payload.get("value", "")
            res = agent_prompts.set_override(field, value, editor=self._actor_username())
            return self._send(200 if res.get("ok") else 400, res)
        if p.path == "/api/agent-prompts/reset":
            if not self._require_capability("reinitialiser_prompts_agent"):
                return
            field = payload.get("field")  # "system" | "addon"
            res = agent_prompts.reset(field, editor=self._actor_username())
            return self._send(200 if res.get("ok") else 400, res)
        if p.path == "/api/whitelist":
            # Ajout d'une source (2026-08-19 : gouvernance ouverte a l'UI,
            # tracee ici dans le journal d'audit -- reprend le role qu'assurait
            # le commit Git quand la whitelist etait figee en code).
            if not self._require_capability("gerer_sources"):
                return
            try:
                e = wl.add_entry(payload or {})
            except ValueError as ve:
                return self._send(400, {"error": str(ve)})
            log("whitelist", "SOURCE_ADDED", f"{e.id} ({e.name}) par {self._actor_username()}", action="GOUVERNANCE")
            return self._send(200, {"ok": True, "id": e.id})
        if p.path.startswith("/api/whitelist/"):
            # Edition / activation-suspension d'une source existante.
            if not self._require_capability("gerer_sources"):
                return
            source_id = p.path[len("/api/whitelist/"):].strip("/")
            try:
                e = wl.update_entry(source_id, payload or {})
            except KeyError:
                return self._send(404, {"error": "source_introuvable"})
            except ValueError as ve:
                return self._send(400, {"error": str(ve)})
            log("whitelist", "SOURCE_UPDATED", f"{e.id} -> {payload} par {self._actor_username()}", action="GOUVERNANCE")
            return self._send(200, {"ok": True, "id": e.id, "status": e.status})
        # ---- Auth ----
        if p.path == "/api/auth/login":
            u = payload.get("username", "").strip()
            pw = payload.get("password", "")
            r = auth.login(u, pw, self.client_address[0])
            if r.get("mfa_required"):
                # 2FA (9.3) : mot de passe correct, mais PAS de cookie de session
                # tant que le code TOTP n'est pas vérifié (voir /login/verify-2fa).
                auth.log_auth_event("login_mfa_required", u, self.client_address[0])
                return self._send(200, {"ok": True, "mfa_required": True, "mfa_token": r["mfa_token"]})
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
        if p.path == "/api/auth/login/verify-2fa":
            mfa_token = payload.get("mfa_token", "")
            code = payload.get("code", "")
            r = auth.verify_login_totp(mfa_token, code)
            if r.get("ok"):
                auth.log_auth_event("login_success_2fa", r.get("username") or "?", self.client_address[0])
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Set-Cookie", auth.cookie_value(r["session_id"]))
                self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
                self.send_header("Access-Control-Allow-Credentials", "true")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": True, "username": r.get("username"), "backup_code_used": r.get("backup_code_used", False), "backup_codes_left": r.get("backup_codes_left")}, ensure_ascii=False).encode("utf-8"))
            else:
                auth.log_auth_event("login_failure_2fa", "?", self.client_address[0])
                self._send(401, {"error": r.get("error", "invalid_code")})
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
        if p.path == "/api/auth/2fa/setup":
            # 9.3 — démarre la configuration : génère un secret (pas encore actif).
            if not self._require_auth():
                return
            sid = auth.read_cookie_sid(self.headers)
            user = auth.get_session_user(sid)
            if not user:
                self._send(401, {"error": "unauthorized"})
                return
            uid = user["id"] if isinstance(user, dict) else user[0]
            r = auth.totp_setup_init(uid)
            self._send(200, r)
            return
        if p.path == "/api/auth/2fa/confirm":
            if not self._require_auth():
                return
            sid = auth.read_cookie_sid(self.headers)
            user = auth.get_session_user(sid)
            if not user:
                self._send(401, {"error": "unauthorized"})
                return
            uid = user["id"] if isinstance(user, dict) else user[0]
            uname = user["username"] if isinstance(user, dict) else user[1]
            r = auth.totp_setup_confirm(uid, payload.get("code", ""))
            self._send(200 if r.get("ok") else 400, r)
            return
        if p.path == "/api/auth/2fa/disable":
            if not self._require_auth():
                return
            sid = auth.read_cookie_sid(self.headers)
            user = auth.get_session_user(sid)
            if not user:
                self._send(401, {"error": "unauthorized"})
                return
            uid = user["id"] if isinstance(user, dict) else user[0]
            r = auth.totp_disable(uid, payload.get("password", ""))
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
            if not self._require_capability("creer_compte"):
                return
            # Rate-limit création de compte (anti-abuse) par IP
            if not auth.rate_ok(self.client_address[0], "create_user"):
                self._send(429, {"error": "rate_limited"})
                return
            uname = (payload.get("username") or "").strip()
            email = (payload.get("email") or "").strip().lower()
            pw = payload.get("password") or ""
            role = payload.get("role", "normal")
            if role not in ("normal", "advanced", "lecteur", "owner"):
                self._send(400, {"error": "role_invalide"})
                return
            # Q2 du plan valide (2026-08-19) : seul un Propriétaire peut créer
            # un autre Propriétaire, jamais un Administrateur même s'il a par
            # ailleurs le droit générique "creer_compte".
            if role == "owner" and self._session_role() != "owner":
                self._send(403, {"error": "reserve_aux_proprietaires"})
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
            if not self._require_capability("changer_role"):
                return
            uid = payload.get("id")
            new_role = payload.get("role")
            if not uid:
                self._send(400, {"error": "id_requis"})
                return
            if new_role not in ("normal", "advanced", "lecteur", "owner"):
                self._send(400, {"error": "role_invalide"})
                return
            uname = auth.username_by_id(uid) or uid
            actor = self._actor_username()
            # Garde-fous Propriétaire appliqués dans auth.set_role() lui-même
            # (defense-in-depth) : reserve_aux_proprietaires si l'acteur n'est
            # pas owner et que la cible l'est (ou le deviendrait), et
            # dernier_proprietaire_protege si c'est le dernier owner restant.
            r = auth.set_role(uid, new_role, actor_role=self._session_role())
            if r.get("ok"):
                auth.log_auth_event("role_changed", f"{uname} -> {new_role} by {actor}", self.client_address[0])
            self._send(200 if r.get("ok") else 400, r)
            return
        if p.path == "/api/auth/users/wp-publish":
            # Délégation individuelle du droit d'envoi WordPress (§3 du plan
            # valide 2026-08-19) : Propriétaire/Administrateur l'ont deja par
            # leur rôle, cet endpoint ne sert qu'à l'accorder/retirer à un
            # Éditeur ('normal') précis, sans changer son rôle.
            if not self._require_capability("gerer_droit_publication_wp"):
                return
            uid = payload.get("id")
            allowed = bool(payload.get("allowed"))
            if not uid:
                self._send(400, {"error": "id_requis"})
                return
            uname = auth.username_by_id(uid) or uid
            actor = self._actor_username()
            r = auth.set_wp_publish(uid, allowed)
            if r.get("ok"):
                auth.log_auth_event("wp_publish_changed", f"{uname} -> {allowed} by {actor}", self.client_address[0])
            self._send(200 if r.get("ok") else 400, r)
            return
        if p.path == "/api/auth/reset":
            r = auth.reset_password(payload.get("token", ""), payload.get("new_password", ""))
            self._send(200 if r.get("ok") else 400, r)
            return
        if p.path == "/api/auth/invitations":
            # Créer une invitation (Phase 2, §4 du plan valide) : remplace la
            # création directe de compte comme chemin normal.
            if not self._require_capability("gerer_invitations"):
                return
            email = (payload.get("email") or "").strip().lower()
            role = payload.get("role", "normal")
            if role not in ("normal", "advanced", "lecteur", "owner"):
                self._send(400, {"error": "role_invalide"})
                return
            # Q2 (même garde que la création directe/changement de rôle) :
            # seul un Propriétaire peut inviter en tant que Propriétaire.
            if role == "owner" and self._session_role() != "owner":
                self._send(403, {"error": "reserve_aux_proprietaires"})
                return
            actor = self._actor_username()
            r = auth.create_invitation(email, role, actor)
            if r.get("ok"):
                auth.log_auth_event("invitation_created", f"{email} (role={role}) by {actor}", self.client_address[0])
            self._send(200 if r.get("ok") else 400, r)
            return
        if p.path == "/api/auth/invitations/revoke":
            if not self._require_capability("gerer_invitations"):
                return
            token = payload.get("token")
            if not token:
                self._send(400, {"error": "token_requis"})
                return
            r = auth.revoke_invitation(token)
            if r.get("ok"):
                auth.log_auth_event("invitation_revoked", f"by {self._actor_username()}", self.client_address[0])
            self._send(200 if r.get("ok") else 400, r)
            return
        if p.path == "/api/auth/invitations/resend":
            if not self._require_capability("gerer_invitations"):
                return
            token = payload.get("token")
            if not token:
                self._send(400, {"error": "token_requis"})
                return
            r = auth.resend_invitation(token)
            if r.get("ok"):
                auth.log_auth_event("invitation_resent", f"by {self._actor_username()}", self.client_address[0])
            self._send(200 if r.get("ok") else 400, r)
            return
        if p.path == "/api/auth/invitations/accept":
            # Public (voir PUBLIC_POST) : la personne invitée n'a PAS encore
            # de compte/session au moment d'accepter — c'est justement le but.
            if not auth.rate_ok(self.client_address[0], "accept_invite"):
                self._send(429, {"error": "rate_limited"})
                return
            token = payload.get("token", "")
            uname = (payload.get("username") or "").strip()
            pw = payload.get("password") or ""
            r = auth.accept_invitation(token, uname, pw)
            if r.get("ok"):
                auth.log_auth_event("invitation_accepted", f"{uname} (role={r.get('role')})", self.client_address[0])
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
        if p.path == "/api/auth/users":
            if not self._require_capability("supprimer_compte"):
                return
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
            r = auth.delete_user(uid, actor_role=self._session_role())
            if r.get("ok"):
                auth.log_auth_event("user_deleted", f"{uname} by {actor}", self.client_address[0])
            self._send(200 if r.get("ok") else 400, r)
            return
        if p.path == "/api/audit":
            if not self._require_capability("purger_audit_lot"):
                return
            ids = payload.get("ids", [])
            if not ids:
                return self._send(400, {"error": "ids_requis"})
            n = delete_events([str(i) for i in ids])
            return self._send(200, {"ok": True, "deleted": n})
        return self._send(404, {"error": "unknown endpoint"})


    def log_message(self, *a):
        pass  # silence


def _already_transmitted_skip(fid):
    """Garde-fou anti-double-transmission WordPress (revue de code 2026-08-20,
    8e passage : factorisé -- vivait avant en double dans /api/hitl/decide et
    l'action groupée "approve", au risque qu'un futur correctif n'en mette
    qu'une des deux copies à jour et réintroduise silencieusement le bug).
    Renvoie le dict de réponse "déjà transmis, non renvoyé" si l'article est
    actuellement affiché comme TRANSMITTED, sinon None. Vérifié via
    hitl_facts.status (get_fact) : c'est le statut réellement affiché à
    l'utilisateur, celui que decide() lui-même refuse aussi de quitter --
    et depuis 2026-08-23, retract() aussi (voir _ALLOWED["TRANSMITTED"] =
    set() ET le garde-fou équivalent dans retract(), editorial/hitl_store.py)
    -- défense en profondeur, pas le seul rempart. Message mis à jour
    2026-08-23 : "Annuler la décision" n'existe plus une fois transmis (voir
    retract(), root cause du bug rapporté : ce message invitait justement à
    l'action qui créait un post WordPress dupliqué)."""
    prev = get_fact(fid)
    if prev and prev.get("status") == "TRANSMITTED":
        return {"status": "SKIPPED_ALREADY_TRANSMITTED",
                "detail": "Article déjà transmis à WordPress — pour le corriger, agissez directement sur le post WordPress."}
    return None


def _cycle_busy_detail(base_detail):
    """Construit le dict d'erreur "cycle_en_cours" en y ajoutant QUI a lancé
    le cycle en cours et DEPUIS QUAND (2026-08-26, retour utilisateur : le
    message générique ne le disait pas, obligeant à deviner ou demander sur
    un autre canal). base_detail reste le texte spécifique à l'endpoint
    appelant (le mot "cycle" seul n'a pas le même sens pour /api/cycle,
    /api/regenerate et /api/video/generate)."""
    who = LAST_CYCLE.get("started_by") or "quelqu'un"
    since = LAST_CYCLE.get("started_at") or ""
    suffix = f" (lancé par {who}{' à ' + since if since else ''})"
    return {"error": "cycle_en_cours", "detail": base_detail + suffix,
            "started_by": LAST_CYCLE.get("started_by"), "started_at": LAST_CYCLE.get("started_at")}


def _video_busy():
    """Verrou d'exclusivité vidéo (2026-08-21) : renvoie le dict de réponse
    "video_en_cours" si une génération vidéo tourne déjà, sinon None.
    Factorisé (même principe que _already_transmitted_skip ci-dessus) --
    vivait avant en triple dans /api/cycle, /api/regenerate et
    /api/video/generate, au même risque de dérive qu'un futur correctif
    n'en mette à jour qu'une partie des copies."""
    with _VIDEO_LOCK_MUTEX:
        if VIDEO_LOCK["running"]:
            # started_by/started_at (2026-08-26, retour utilisateur) : dit
            # explicitement QUI bloque et DEPUIS QUAND, plutôt qu'un message
            # générique -- voir LAST_CYCLE en tête de fichier pour le même
            # correctif côté verrou cycle.
            who = VIDEO_LOCK.get("started_by") or "quelqu'un"
            since = VIDEO_LOCK.get("started_at") or ""
            return {"error": "video_en_cours",
                    "detail": f"Une vidéo est déjà en cours de génération (lancée par {who}"
                               f"{' à ' + since if since else ''}) — réessayez dans quelques minutes.",
                    "started_by": VIDEO_LOCK.get("started_by"), "started_at": VIDEO_LOCK.get("started_at")}
    return None


def _try_acquire_video_lock(fid, title, actor=None):
    """Vérifie ET pose le verrou en UNE SEULE section critique (revue de
    code 2026-08-21) : _video_busy() puis un _start_video_lock() séparé
    laissait une fenêtre de course -- deux requêtes /api/video/generate
    quasi simultanées pouvaient toutes les deux passer _video_busy() (encore
    False) avant que l'une d'elles n'ait eu le temps d'appeler
    _start_video_lock(), lançant deux jobs ffmpeg concurrents malgré
    l'exclusivité voulue. Renvoie le dict d'erreur "video_en_cours" si déjà
    pris, sinon None (verrou acquis)."""
    with _VIDEO_LOCK_MUTEX:
        # Délègue à _video_busy() (RLock : sûr d'imbriquer, même mutex) --
        # évite de dupliquer le message d'erreur à deux endroits (revue de
        # code 2026-08-21, 3e passage : c'est exactement le risque de dérive
        # que _video_busy() lui-même documentait).
        _vb = _video_busy()
        if _vb:
            return _vb
        _start_video_lock(fid, title, actor)
    return None


def _start_video_lock(fid, title, actor=None):
    """Pose le verrou SANS vérifier s'il est déjà pris (l'appelant --
    _try_acquire_video_lock() -- a déjà fait la vérification dans la même
    section critique, voir RLock ci-dessus). Existe comme fonction séparée
    pour rester testable indépendamment (voir tests/test_smoke_video_lock.py).
    actor optionnel (2026-08-26, defaut None) : garde la fonction appelable
    sans changement par du code/tests existants qui n'a pas encore l'acteur."""
    with _VIDEO_LOCK_MUTEX:
        VIDEO_LOCK["running"] = True
        VIDEO_LOCK["fact_id"] = fid
        VIDEO_LOCK["title"] = title
        VIDEO_LOCK["started_at"] = datetime.now().isoformat(timespec="seconds")
        VIDEO_LOCK["started_by"] = actor


def _release_video_lock_state():
    with _VIDEO_LOCK_MUTEX:
        VIDEO_LOCK["running"] = False
        VIDEO_LOCK["fact_id"] = None
        VIDEO_LOCK["title"] = None
        VIDEO_LOCK["started_at"] = None
        VIDEO_LOCK["started_by"] = None


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
        # video_status/video_path (2026-08-22, demande explicite : "l'article
        # vidéo doit pouvoir être transféré sur wordpress") -- absents ici
        # jusqu'à ce correctif, transmit.py n'avait donc AUCUN moyen de
        # savoir qu'une vidéo existait pour cet article (row.get(...) via
        # get_fact() les a bien, mais ce dict de sortie les laissait de côté).
        "video_status": row.get("video_status"), "video_path": row.get("video_path"),
        # suggested_category (2026-08-23, demande explicite : "fais appliquer
        # cela aux articles actuels déjà sur kora") -- classement pré-calculé
        # en lot pour les articles déjà en file, réutilisé tel quel par
        # _to_wordpress (transmit.py) au lieu de reclasser à la transmission.
        "suggested_category": row.get("suggested_category"),
        # wp_post_id (2026-08-23, ADR-0005, tâche T2) : republication en
        # place -- si présent (article retiré via /api/hitl/withdraw puis
        # ré-approuvé), _to_wordpress met à jour CE post plutôt que d'en
        # créer un nouveau. Voir _build_payload (publishing/transmit.py).
        "wp_post_id": row.get("wp_post_id"),
    }


def main():
    port = int(os.environ.get("PORT", "8766"))
    auth.init()  # crée tables + admin depuis .env
    root_auth.init()  # console système root (12.5) : table + compte séparés, depuis .env
    # Purge auto de la corbeille (> 11 jours) au démarrage
    try:
        n = purge_trashed(11)
        if n:
            print(f"Corbeille : {n} élément(s) > 11j supprimé(s) définitivement.")
    except Exception as e:
        print("purge_trashed:", e)
    global _SRV
    srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    _SRV = srv
    # Gestion gracieuse SIGTERM/SIGINT (P0) : laisse les threads non-daemon finir leur commit
    try:
        import signal as _sig
        def _handle_sig(signum, frame):
            try:
                _SRV.shutdown()
            except Exception:
                pass
        _sig.signal(_sig.SIGTERM, _handle_sig)
        _sig.signal(_sig.SIGINT, _handle_sig)
    except Exception:
        pass
    print(f"KORA dashboard sur http://localhost:{port} | editor={EDITOR_NAME} | transmit={transmit.mode()}")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        try:
            srv.server_close()
        except Exception:
            pass


if __name__ == "__main__":
    main()
