"""root_auth.py — authentification ROOT séparée (12.5), stdlib, zéro dépendance.

Compte root TOTALEMENT distinct des comptes éditeurs (kora_users / auth.py) :
table dédiée (kora_root), sessions dédiées (kora_root_sessions), cookie dédié
(kora_root_sid, périmètre /kora-v2/api/root uniquement). Objectif : si un
compte éditeur (même 'advanced') est compromis, la console système reste
hors d'atteinte — deux systèmes d'authentification qui ne se recoupent pas.

- 2FA (TOTP) OBLIGATOIRE d'office pour le compte root, jamais optionnelle :
  tant que la configuration n'est pas confirmée, login() ne renvoie qu'un
  jeton de configuration (setup_token), jamais de session console.
- Root créé depuis .env (ROOT_USER / ROOT_PASS / ROOT_EMAIL) au 1er lancement,
  même convention que ADMIN_USER/ADMIN_PASS dans auth.py.
- Réutilise totp.py (même module RFC 6238 que la 2FA éditeur — pas de
  duplication de la crypto) et le même schéma de hash PBKDF2-HMAC-SHA256
  que auth.py pour le mot de passe.
"""
import os
import hashlib
import hmac
import secrets
import base64
import json
import threading
from datetime import datetime, timedelta

import db
import totp as _totp

ROOT_SESSION_TTL_H = float(os.environ.get("KORA_ROOT_SESSION_TTL_H", "2"))  # session courte : console sensible
PBKDF2_ROUNDS = int(os.environ.get("KORA_PBKDF2_ROUNDS", "200000"))

RL_MAX = int(os.environ.get("KORA_ROOT_RL_MAX", "8"))
RL_WINDOW = int(os.environ.get("KORA_ROOT_RL_WINDOW", "600"))
_rl_lock = threading.Lock()
_rl_hits = {}  # ip -> [ts, ...]

# Jetons de configuration 2FA obligatoire (mot de passe validé, TOTP pas
# encore confirmé) : même logique que le jeton MFA de auth.py, mais
# distincte (table en mémoire séparée, pas de session éditeur possible).
SETUP_TOKEN_TTL_S = int(os.environ.get("KORA_ROOT_SETUP_TTL_S", "600"))
MFA_TOKEN_TTL_S = int(os.environ.get("KORA_ROOT_MFA_TTL_S", "300"))
MFA_MAX_ATTEMPTS = 8
_pending_lock = threading.Lock()
_setup_pending = {}  # setup_token -> {"root_id":..., "expires_at": epoch}
_mfa_pending = {}    # mfa_token -> {"root_id":..., "expires_at": epoch, "attempts": int}


def _rate_ok(ip):
    now = datetime.now().timestamp()
    with _rl_lock:
        hits = [t for t in _rl_hits.get(ip, []) if t > now - RL_WINDOW]
        if len(hits) >= RL_MAX:
            return False
        hits.append(now)
        _rl_hits[ip] = hits
        return True


def _uid():
    return base64.urlsafe_b64encode(secrets.token_bytes(18)).decode().rstrip("=")


def _hash_password(password, salt=None):
    if salt is None:
        salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ROUNDS)
    return base64.b64encode(salt).decode() + "$" + base64.b64encode(dk).decode()


def _verify_password(password, stored):
    try:
        salt_b64, hash_b64 = stored.split("$", 1)
        salt = base64.b64decode(salt_b64)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ROUNDS)
        return hmac.compare_digest(base64.b64encode(dk).decode(), hash_b64)
    except Exception:
        return False


def _row_get(row, key, default=None):
    try:
        if hasattr(row, "keys") and key in row.keys():
            return row[key]
    except Exception:
        pass
    return default


# ----------------------------------------------------------------------------
# Init table + compte root depuis .env
# ----------------------------------------------------------------------------
def init():
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(
            "CREATE TABLE IF NOT EXISTS kora_root ("
            "id TEXT PRIMARY KEY, username TEXT UNIQUE, password_hash TEXT, email TEXT, "
            "totp_secret TEXT, totp_enabled INTEGER DEFAULT 0, totp_backup_codes TEXT, "
            "created_at TEXT)"
        )
        cur.execute(
            "CREATE TABLE IF NOT EXISTS kora_root_sessions ("
            "session_id TEXT PRIMARY KEY, root_id TEXT, expires_at TEXT)"
        )
        con.commit()
    finally:
        con.close()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute("SELECT COUNT(*) AS n FROM kora_root")
        row = cur.fetchone()
        n = row["n"] if isinstance(row, dict) else row[0]
        if n == 0:
            user = os.environ.get("ROOT_USER", "").strip()
            pw = os.environ.get("ROOT_PASS", "").strip()
            email = os.environ.get("ROOT_EMAIL", "").strip()
            if user and pw:
                uid = _uid()
                ph = db.placeholder()
                cur.execute(
                    f"INSERT INTO kora_root(id, username, password_hash, email, created_at) "
                    f"VALUES({ph},{ph},{ph},{ph},{ph})",
                    (uid, user, _hash_password(pw), email, datetime.now().isoformat(timespec="seconds")),
                )
                con.commit()
                print(f"[root_auth] compte root '{user}' créé depuis .env — 2FA à configurer à la 1ère connexion")
            else:
                print("[root_auth] ROOT_USER/ROOT_PASS non définis -> aucun compte root créé, console inaccessible")
    finally:
        con.close()


def _get_by_username(username):
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"SELECT * FROM kora_root WHERE username={ph}", (username,))
        return cur.fetchone()
    finally:
        con.close()


def _get_by_id(root_id):
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"SELECT * FROM kora_root WHERE id={ph}", (root_id,))
        return cur.fetchone()
    finally:
        con.close()


def username_by_id(root_id):
    r = _get_by_id(root_id)
    return _row_get(r, "username") if r else None


# ----------------------------------------------------------------------------
# Connexion (mot de passe -> config 2FA obligatoire ou vérification TOTP)
# ----------------------------------------------------------------------------
def login(username, password, ip=None):
    if ip and not _rate_ok(ip):
        return {"ok": False, "error": "rate_limited"}
    u = _get_by_username(username)
    if not u or not _verify_password(password, _row_get(u, "password_hash")):
        return {"ok": False, "error": "invalid_credentials"}
    root_id = _row_get(u, "id")
    if not _row_get(u, "totp_enabled"):
        # 2FA jamais configurée : mot de passe seul ne donne accès qu'à un
        # jeton de configuration, jamais à la console.
        token = _uid()
        with _pending_lock:
            _setup_pending[token] = {"root_id": root_id, "expires_at": datetime.now().timestamp() + SETUP_TOKEN_TTL_S}
        return {"ok": True, "totp_setup_required": True, "setup_token": token}
    token = _uid()
    with _pending_lock:
        _mfa_pending[token] = {"root_id": root_id, "expires_at": datetime.now().timestamp() + MFA_TOKEN_TTL_S, "attempts": 0}
    return {"ok": True, "mfa_required": True, "mfa_token": token}


def _consume_mfa(token):
    now = datetime.now().timestamp()
    with _pending_lock:
        p = _mfa_pending.get(token)
        if not p or p["expires_at"] < now:
            _mfa_pending.pop(token, None)
            return None
        p["attempts"] += 1
        if p["attempts"] > MFA_MAX_ATTEMPTS:
            _mfa_pending.pop(token, None)
            return None
        return p["root_id"]


def _finalize_mfa(token):
    with _pending_lock:
        _mfa_pending.pop(token, None)


def _consume_setup_token(token):
    now = datetime.now().timestamp()
    with _pending_lock:
        p = _setup_pending.get(token)
        if not p or p["expires_at"] < now:
            _setup_pending.pop(token, None)
            return None
        return p["root_id"]


def verify_login_totp(mfa_token, code):
    root_id = _consume_mfa(mfa_token)
    if not root_id:
        return {"ok": False, "error": "mfa_expired"}
    u = _get_by_id(root_id)
    if not u:
        return {"ok": False, "error": "no_user"}
    secret = _row_get(u, "totp_secret")
    if secret and _totp.verify(secret, code):
        _finalize_mfa(mfa_token)
        return {"ok": True, "session_id": create_session(root_id), "username": _row_get(u, "username")}
    backup_raw = _row_get(u, "totp_backup_codes")
    backup_codes = json.loads(backup_raw) if backup_raw else []
    code_clean = str(code or "").strip().upper()
    for i, hashed in enumerate(backup_codes):
        if _totp.verify_backup_code(code_clean, hashed):
            backup_codes.pop(i)
            ph = db.placeholder()
            con, _ = db.conn()
            try:
                cur = con.cursor()
                cur.execute(f"UPDATE kora_root SET totp_backup_codes={ph} WHERE id={ph}", (json.dumps(backup_codes), root_id))
                con.commit()
            finally:
                con.close()
            _finalize_mfa(mfa_token)
            return {"ok": True, "session_id": create_session(root_id), "username": _row_get(u, "username"),
                    "backup_code_used": True, "backup_codes_left": len(backup_codes)}
    return {"ok": False, "error": "invalid_code"}


# ----------------------------------------------------------------------------
# Configuration 2FA obligatoire (première connexion, via setup_token)
# ----------------------------------------------------------------------------
def totp_setup_init(setup_token):
    root_id = _consume_setup_token(setup_token)
    if not root_id:
        return {"ok": False, "error": "setup_expired"}
    secret = _totp.random_base32_secret()
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"UPDATE kora_root SET totp_secret={ph}, totp_enabled=0 WHERE id={ph}", (secret, root_id))
        con.commit()
    finally:
        con.close()
    uname = username_by_id(root_id) or "root"
    return {"ok": True, "secret": secret, "otpauth_uri": _totp.provisioning_uri(secret, uname, issuer="KORA-Root")}


def totp_setup_confirm(setup_token, code):
    root_id = _consume_setup_token(setup_token)
    if not root_id:
        return {"ok": False, "error": "setup_expired"}
    u = _get_by_id(root_id)
    secret = _row_get(u, "totp_secret") if u else None
    if not secret or not _totp.verify(secret, code):
        # jeton toujours valable pour réessayer -> on le remet en mémoire
        with _pending_lock:
            _setup_pending[setup_token] = {"root_id": root_id, "expires_at": datetime.now().timestamp() + SETUP_TOKEN_TTL_S}
        return {"ok": False, "error": "invalid_code"}
    codes = _totp.generate_backup_codes()
    hashed = [_totp.hash_backup_code(c) for c in codes]
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"UPDATE kora_root SET totp_enabled=1, totp_backup_codes={ph} WHERE id={ph}", (json.dumps(hashed), root_id))
        con.commit()
    finally:
        con.close()
    return {"ok": True, "backup_codes": codes, "session_id": create_session(root_id), "username": username_by_id(root_id)}


# ----------------------------------------------------------------------------
# Sessions
# ----------------------------------------------------------------------------
def create_session(root_id):
    sid = _uid()
    expires = (datetime.now() + timedelta(hours=ROOT_SESSION_TTL_H)).isoformat(timespec="seconds")
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"INSERT INTO kora_root_sessions(session_id, root_id, expires_at) VALUES({ph},{ph},{ph})", (sid, root_id, expires))
        con.commit()
        return sid
    finally:
        con.close()


def get_session_root(sid):
    if not sid:
        return None
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"SELECT * FROM kora_root_sessions WHERE session_id={ph}", (sid,))
        s = cur.fetchone()
        if not s:
            return None
        exp = _row_get(s, "expires_at")
        if exp and datetime.now().isoformat(timespec="seconds") > exp:
            delete_session(sid)
            return None
        root_id = _row_get(s, "root_id")
        cur.execute(f"SELECT id, username, email, created_at FROM kora_root WHERE id={ph}", (root_id,))
        row = cur.fetchone()
        if not row:
            return None
        if isinstance(row, dict):
            return row
        cols = ["id", "username", "email", "created_at"]
        return dict(zip(cols, row))
    finally:
        con.close()


def delete_session(sid):
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"DELETE FROM kora_root_sessions WHERE session_id={ph}", (sid,))
        con.commit()
    finally:
        con.close()


def list_sessions():
    """Sessions root actives (12.2 supervision) — id, expiration."""
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute("SELECT session_id, root_id, expires_at FROM kora_root_sessions")
        return cur.fetchall()
    finally:
        con.close()


# ----------------------------------------------------------------------------
# Cookie — périmètre volontairement restreint à /kora-v2/api/root, distinct
# du cookie éditeur kora_sid (Path=/kora-v2/) : les deux cookies coexistent
# sans jamais se chevaucher sur les mêmes requêtes.
# ----------------------------------------------------------------------------
def cookie_value(sid):
    secure = "; Secure" if os.environ.get("KORA_HTTPS", "1") == "1" else ""
    return f"kora_root_sid={sid}; Path=/kora-v2/api/root; HttpOnly; SameSite=Lax{secure}; Max-Age={int(ROOT_SESSION_TTL_H*3600)}"


def clear_cookie_value():
    secure = "; Secure" if os.environ.get("KORA_HTTPS", "1") == "1" else ""
    return f"kora_root_sid=; Path=/kora-v2/api/root; HttpOnly; SameSite=Lax{secure}; Max-Age=0"


def read_cookie_sid(headers):
    c = headers.get("Cookie", "")
    for part in c.split(";"):
        part = part.strip()
        if part.startswith("kora_root_sid="):
            return part[len("kora_root_sid="):]
    return None


def log_root_event(event, detail, ip=None):
    """Journal de sécurité root séparé (12.4) — jamais mélangé à
    auth_audit.log (comptes éditeurs) : une compromission de l'un ne doit
    pas permettre de maquiller les traces de l'autre."""
    try:
        ts = datetime.now().isoformat(timespec="seconds")
        path = os.environ.get("KORA_ROOT_AUTH_LOG", os.path.join(os.path.dirname(os.path.abspath(__file__)), "root_audit.log"))
        with open(path, "a", encoding="utf-8") as f:
            f.write(f"{ts}\t{event}\t{ip or '-'}\t{detail}\n")
    except Exception:
        pass
