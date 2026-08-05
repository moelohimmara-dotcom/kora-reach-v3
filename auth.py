"""auth.py — authentification KORA (stdlib, zéro dépendance).

- Table kora_users (username, password_hash, password_salt, email, reset_token, reset_expires, created_at)
- Table kora_sessions (session_id, user_id, expires_at)
- Hash PBKDF2-HMAC-SHA256 (stdlib, 200k iterations) + sel aléatoire
- Sessions via cookie kora_sid (HttpOnly, SameSite=Strict, Secure en prod)
- Reset mot de passe par email (SMTP Gmail en stdlib smtplib, fail-closed)
- Admin créé depuis .env (ADMIN_USER / ADMIN_PASS / ADMIN_EMAIL) au 1er lancement

Compatible PostgreSQL + SQLite (même abstraction db.conn()).
"""
import os
import hashlib
import hmac
import secrets
import base64
import json
import smtplib
import email.utils
import threading
from email.mime.text import MIMEText
from datetime import datetime, timedelta

import db

RESET_TTL_MIN = int(os.environ.get("KORA_RESET_TTL_MIN", "30"))
SESSION_TTL_H = int(os.environ.get("KORA_SESSION_TTL_H", "24"))
PBKDF2_ROUNDS = int(os.environ.get("KORA_PBKDF2_ROUNDS", "200000"))

# Rate-limit (en mémoire, par IP) : 5 tentatives / 10 min pour login + forgot
RL_MAX = int(os.environ.get("KORA_RL_MAX", "5"))
RL_WINDOW = int(os.environ.get("KORA_RL_WINDOW", "600"))
_rl_lock = threading.Lock()
_rl_hits = {}  # ip -> [(ts, type), ...]


def rate_ok(ip, kind):
    now = datetime.now().timestamp()
    with _rl_lock:
        hits = _rl_hits.get(ip, [])
        hits = [t for t in hits if t[0] > now - RL_WINDOW and t[1] == kind]
        if len(hits) >= RL_MAX:
            return False
        hits.append((now, kind))
        _rl_hits[ip] = hits
        return True


def list_users():
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"SELECT id, username, email, role, created_at FROM kora_users ORDER BY username")
        return cur.fetchall()
    finally:
        con.close()


def set_role(uid, role):
    """Change le rôle d'un compte (advanced-only côté serveur)."""
    if role not in ("normal", "advanced"):
        return {"ok": False, "error": "role_invalide"}
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"UPDATE kora_users SET role={ph} WHERE id={ph}", (role, uid))
        con.commit()
        return {"ok": True}
    finally:
        con.close()


def delete_user(uid):
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"DELETE FROM kora_sessions WHERE user_id={ph}", (uid,))
        cur.execute(f"DELETE FROM kora_users WHERE id={ph}", (uid,))
        con.commit()
        return {"ok": True}
    finally:
        con.close()


# ----------------------------------------------------------------------------
# Helpers hash / sel
# ----------------------------------------------------------------------------
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


def _uid():
    return base64.urlsafe_b64encode(secrets.token_bytes(18)).decode().rstrip("=")


# ----------------------------------------------------------------------------
# Init tables + admin depuis .env
# ----------------------------------------------------------------------------
def init():
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(
            "CREATE TABLE IF NOT EXISTS kora_users ("
            "id TEXT PRIMARY KEY, username TEXT UNIQUE, password_hash TEXT, "
            "email TEXT, reset_token TEXT, reset_expires TEXT, role TEXT DEFAULT 'normal', created_at TEXT)"
        )
        cur.execute(
            "CREATE TABLE IF NOT EXISTS kora_sessions ("
            "session_id TEXT PRIMARY KEY, user_id TEXT, expires_at TEXT)"
        )
        con.commit()
    finally:
        con.close()
    # Migration : ajoute la colonne role si elle manque (tables pré-existantes)
    con, _ = db.conn()
    try:
        cur = con.cursor()
        try:
            cur.execute("ALTER TABLE kora_users ADD COLUMN role TEXT DEFAULT 'normal'")
            con.commit()
        except Exception:
            con.rollback()  # colonne déjà présente
        # S'assure que l'admin défini dans .env est bien 'advanced' (même s'il pré-existait)
        admin_user = os.environ.get("ADMIN_USER", "admin").strip()
        ph = db.placeholder()
        cur.execute(f"UPDATE kora_users SET role='advanced' WHERE username={ph}", (admin_user,))
        con.commit()
    finally:
        con.close()
    # Crée l'admin au 1er lancement (idempotent : ne crée que si vide)
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute("SELECT COUNT(*) AS n FROM kora_users")
        row = cur.fetchone()
        n = row["n"] if isinstance(row, dict) else row[0]
        if n == 0:
            user = os.environ.get("ADMIN_USER", "admin").strip()
            pw = os.environ.get("ADMIN_PASS", "").strip()
            email = os.environ.get("ADMIN_EMAIL", "").strip()
            if pw:
                add_user(user, pw, email, role="advanced")
                print(f"[auth] admin '{user}' créé depuis .env (role=advanced)")
            else:
                print("[auth] ATTENTION: ADMIN_PASS non défini -> aucun compte créé")
    finally:
        con.close()


def add_user(username, password, email="", role="normal"):
    uid = _uid()
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(
            f"INSERT INTO kora_users(id, username, password_hash, email, role, created_at) "
            f"VALUES({ph},{ph},{ph},{ph},{ph},{ph})",
            (uid, username, _hash_password(password), email, role, datetime.now().isoformat(timespec="seconds")),
        )
        con.commit()
        return {"ok": True, "id": uid}
    except Exception as e:
        con.rollback()
        return {"ok": False, "error": "username_exists" if "unique" in str(e).lower() else str(e)}
    finally:
        con.close()


def _get_user_by_username(username):
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"SELECT * FROM kora_users WHERE username={ph}", (username,))
        return cur.fetchone()
    finally:
        con.close()


def _get_user_by_email(email):
    if not email:
        return None
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"SELECT * FROM kora_users WHERE email={ph}", (email.lower(),))
        return cur.fetchone()
    finally:
        con.close()


# ----------------------------------------------------------------------------
# Sessions
# ----------------------------------------------------------------------------
def create_session(user_id):
    sid = _uid()
    expires = (datetime.now() + timedelta(hours=SESSION_TTL_H)).isoformat(timespec="seconds")
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(
            f"INSERT INTO kora_sessions(session_id, user_id, expires_at) VALUES({ph},{ph},{ph})",
            (sid, user_id, expires),
        )
        con.commit()
        return sid
    finally:
        con.close()


def get_session_user(sid):
    if not sid:
        return None
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"SELECT * FROM kora_sessions WHERE session_id={ph}", (sid,))
        s = cur.fetchone()
        if not s:
            return None
        exp = s["expires_at"] if isinstance(s, dict) else s[0]
        if exp and datetime.now().isoformat(timespec="seconds") > exp:
            delete_session(sid)
            return None
        uid = s["user_id"] if isinstance(s, dict) else s[1]
        cur.execute(f"SELECT * FROM kora_users WHERE id={ph}", (uid,))
        return cur.fetchone()
    finally:
        con.close()


def delete_session(sid):
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"DELETE FROM kora_sessions WHERE session_id={ph}", (sid,))
        con.commit()
    finally:
        con.close()


def delete_all_sessions_for_user(user_id):
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"DELETE FROM kora_sessions WHERE user_id={ph}", (user_id,))
        con.commit()
    finally:
        con.close()


# ----------------------------------------------------------------------------
# Auth actions
# ----------------------------------------------------------------------------
def login(username, password, ip=None):
    # Rate-limit par IP (5 / 10 min)
    if ip and not rate_ok(ip, "login"):
        return {"ok": False, "error": "rate_limited"}
    u = _get_user_by_username(username)
    if not u:
        return {"ok": False, "error": "invalid_credentials"}
    stored_hash = u["password_hash"] if isinstance(u, dict) else u[2]
    if not _verify_password(password, stored_hash):
        return {"ok": False, "error": "invalid_credentials"}
    uid = u["id"] if isinstance(u, dict) else u[0]
    sid = create_session(uid)
    return {"ok": True, "session_id": sid}


def change_password(user_id, current, new):
    u = _get_user_by_username(_username_by_id(user_id))
    if not u:
        return {"ok": False, "error": "no_user"}
    stored_hash = u["password_hash"] if isinstance(u, dict) else u[2]
    if not _verify_password(current, stored_hash):
        return {"ok": False, "error": "wrong_current"}
    if len(new) < 8:
        return {"ok": False, "error": "password_too_short"}
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(
            f"UPDATE kora_users SET password_hash={ph} WHERE id={ph}",
            (_hash_password(new), user_id),
        )
        con.commit()
        delete_all_sessions_for_user(user_id)
        return {"ok": True}
    finally:
        con.close()


def _username_by_id(uid):
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"SELECT username FROM kora_users WHERE id={ph}", (uid,))
        r = cur.fetchone()
        return r["username"] if isinstance(r, dict) else (r[0] if r else None)
    finally:
        con.close()


# ----------------------------------------------------------------------------
# Reset mot de passe + SMTP
# ----------------------------------------------------------------------------
def forgot_password(email_addr, ip=None):
    # Rate-limit par IP (5 / 10 min)
    if ip and not rate_ok(ip, "forgot"):
        return {"ok": True, "message": "si_compte_existe_email_envoye"}  # réponse générique
    u = _get_user_by_email(email_addr)
    # Réponse générique (ne pas révéler si l'email existe)
    if u:
        token = _uid() + _uid()
        expires = (datetime.now() + timedelta(minutes=RESET_TTL_MIN)).isoformat(timespec="seconds")
        ph = db.placeholder()
        con, _ = db.conn()
        try:
            cur = con.cursor()
            cur.execute(
                f"UPDATE kora_users SET reset_token={ph}, reset_expires={ph} WHERE email={ph}",
                (token, expires, email_addr.lower()),
            )
            con.commit()
        finally:
            con.close()
        # Tentative d'envoi SMTP ; échoue en silence côté user (log serveur)
        sent = _send_reset_email(email_addr, token)
        if not sent:
            # Fail-closed : on loggue le lien pour que l'admin puisse le transmettre
            print(f"[auth] RESET LINK (SMTP non configuré): "
                  f"https://{os.environ.get('KORA_PUBLIC_HOST','213-156-135-139.sslip.io')}"
                  f"/kora-v2/?reset={token}")
    return {"ok": True, "message": "si_compte_existe_email_envoye"}


def reset_password(token, new):
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"SELECT * FROM kora_users WHERE reset_token={ph}", (token,))
        u = cur.fetchone()
        if not u:
            return {"ok": False, "error": "invalid_token"}
        exp = u["reset_expires"] if isinstance(u, dict) else u[5]
        if exp and datetime.now().isoformat(timespec="seconds") > exp:
            cur.execute(f"UPDATE kora_users SET reset_token=NULL, reset_expires=NULL WHERE id={ph}",
                        (u["id"] if isinstance(u, dict) else u[0],))
            con.commit()
            return {"ok": False, "error": "token_expired"}
        if len(new) < 8:
            return {"ok": False, "error": "password_too_short"}
        uid = u["id"] if isinstance(u, dict) else u[0]
        cur.execute(
            f"UPDATE kora_users SET password_hash={ph}, reset_token=NULL, reset_expires=NULL WHERE id={ph}",
            (_hash_password(new), uid),
        )
        con.commit()
        delete_all_sessions_for_user(uid)
        return {"ok": True}
    finally:
        con.close()


def _send_reset_email(to_addr, token):
    host = os.environ.get("SMTP_HOST")
    if not host:
        return False
    try:
        port = int(os.environ.get("SMTP_PORT", "587"))
        user = os.environ.get("SMTP_USER", "")
        pw = os.environ.get("SMTP_PASS", "")
        frm = os.environ.get("SMTP_FROM", user)
        link = (f"https://{os.environ.get('KORA_PUBLIC_HOST','213-156-135-139.sslip.io')}"
                f"/kora-v2/?reset={token}")
        msg = MIMEText(
            "Bonjour,\n\nVous avez demandé une réinitialisation de mot de passe pour KORA Reach.\n"
            f"Cliquez sur ce lien (valable {RESET_TTL_MIN} min) :\n{link}\n\n"
            "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
            "plain", "utf-8")
        msg["Subject"] = "Réinitialisation du mot de passe KORA Reach"
        msg["From"] = frm
        msg["To"] = to_addr
        with smtplib.SMTP(host, port, timeout=15) as s:
            s.starttls()
            if user and pw:
                s.login(user, pw)
            s.sendmail(frm, [to_addr], msg.as_string())
        return True
    except Exception as e:
        print(f"[auth] SMTP error: {e}")
        return False


# ----------------------------------------------------------------------------
# Cookie helpers
# ----------------------------------------------------------------------------
def cookie_value(sid):
    secure = "; Secure" if os.environ.get("KORA_HTTPS", "1") == "1" else ""
    return f"kora_sid={sid}; Path=/; HttpOnly; SameSite=Strict{secure}; Max-Age={SESSION_TTL_H*3600}"


def read_cookie_sid(headers):
    c = headers.get("Cookie", "")
    for part in c.split(";"):
        part = part.strip()
        if part.startswith("kora_sid="):
            return part[len("kora_sid="):]
    return None
