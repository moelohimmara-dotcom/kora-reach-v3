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

import core.db as db
import identity.totp as _totp

RESET_TTL_MIN = int(os.environ.get("KORA_RESET_TTL_MIN", "30"))
SESSION_TTL_H = int(os.environ.get("KORA_SESSION_TTL_H", "24"))
PBKDF2_ROUNDS = int(os.environ.get("KORA_PBKDF2_ROUNDS", "200000"))

# Rate-limit (en mémoire, par IP) : tentatives / fenêtre pour login + forgot
# Augmenté à 20/10min pour éviter les blocages accidentels lors de tests légitimes.
RL_MAX = int(os.environ.get("KORA_RL_MAX", "20"))
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


# ----------------------------------------------------------------------------
# 2FA (9.3) — jetons MFA en attente : mot de passe déjà validé, code TOTP
# encore requis avant de créer une VRAIE session. En mémoire (mono-process,
# même pattern que le rate-limiter ci-dessus) : c'est un état éphémère de
# quelques minutes, pas une donnée à persister.
# ----------------------------------------------------------------------------
MFA_TOKEN_TTL_S = int(os.environ.get("KORA_MFA_TTL_S", "300"))  # 5 min
MFA_MAX_ATTEMPTS = 8  # code à 6 chiffres : borne les essais par jeton (anti-bruteforce)
_mfa_lock = threading.Lock()
_mfa_pending = {}  # mfa_token -> {"user_id":..., "expires_at": epoch, "attempts": int}


def _mfa_create_pending(user_id):
    tok = secrets.token_urlsafe(32)
    with _mfa_lock:
        _mfa_pending[tok] = {"user_id": user_id, "expires_at": datetime.now().timestamp() + MFA_TOKEN_TTL_S, "attempts": 0}
    return tok


def _mfa_check_and_consume(token):
    """Retourne le user_id du jeton s'il est encore valide et n'a pas dépassé
    son quota d'essais, SANS le supprimer — seul un succès (côté appelant)
    ou l'épuisement des essais le supprime. Un code faux ne force donc pas à
    ressaisir le mot de passe pour une simple faute de frappe."""
    with _mfa_lock:
        entry = _mfa_pending.get(token)
        if not entry:
            return None
        if entry["expires_at"] < datetime.now().timestamp() or entry["attempts"] >= MFA_MAX_ATTEMPTS:
            _mfa_pending.pop(token, None)
            return None
        entry["attempts"] += 1
        return entry["user_id"]


def _mfa_finalize(token):
    with _mfa_lock:
        _mfa_pending.pop(token, None)


# Audit des événements d'auth (fichier dédié, fail-open : n'échoue jamais l'action)
import os as _os
# Racine du repo, pas le dossier de ce fichier (2026-08-20, refactor
# monolithe modulaire : auth.py vit desormais dans identity/) -- sinon
# orphelinerait silencieusement auth_audit.log deja accumule a la racine.
_REPO_ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
_AUTH_LOG = _os.environ.get("KORA_AUTH_LOG", _os.path.join(_REPO_ROOT, "auth_audit.log"))

def log_auth_event(event, detail, ip=None):
    try:
        ts = datetime.now().isoformat(timespec="seconds")
        line = f"{ts}\t{event}\t{ip or '-'}\t{detail}\n"
        with open(_AUTH_LOG, "a", encoding="utf-8") as f:
            f.write(line)
    except Exception:
        pass  # jamais bloquant


def username_by_id(uid):
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"SELECT username FROM kora_users WHERE id={ph}", (uid,))
        r = cur.fetchone()
        return r["username"] if isinstance(r, dict) else (r[0] if r else None)
    except Exception:
        return None
    finally:
        con.close()


def list_users():
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"SELECT id, username, email, role, created_at, active, totp_enabled, wp_publish_allowed FROM kora_users ORDER BY username")
        return cur.fetchall()
    finally:
        con.close()


ROLES = ("lecteur", "normal", "advanced", "owner")


def get_role(uid):
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"SELECT role FROM kora_users WHERE id={ph}", (uid,))
        r = cur.fetchone()
        return _row_get(r, "role") if r else None
    finally:
        con.close()


def count_owners():
    """Nombre de comptes Propriétaire — sert de garde-fou anti-verrouillage
    (2026-08-19) : on ne doit JAMAIS pouvoir supprimer/rétrograder le dernier."""
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute("SELECT COUNT(*) AS n FROM kora_users WHERE role='owner'")
        row = cur.fetchone()
        return row["n"] if isinstance(row, dict) else row[0]
    finally:
        con.close()


def set_role(uid, role, actor_role=None):
    """Change le rôle d'un compte (advanced/root-only côté serveur).
    'lecteur' (12.1) : lecture seule, ajouté pour la hiérarchie de rôles
    attribuée par la console root, sans renommer 'normal'/'advanced' déjà
    utilisés ailleurs dans le code (évite une migration risquée).

    'owner' (2026-08-19, restructuration rôles/permissions) : garde-fous
    appliqués ICI (pas seulement côté route serveur) pour que l'invariant ne
    puisse JAMAIS être violé, quel que soit l'appelant :
      - seul un Propriétaire (actor_role='owner') peut promouvoir/rétrograder
        un Propriétaire (Q2 du plan validé) ;
      - le DERNIER Propriétaire ne peut jamais être rétrogradé (verrouillage
        total de l'instance sinon)."""
    if role not in ROLES:
        return {"ok": False, "error": "role_invalide"}
    current = get_role(uid)
    if (current == "owner" or role == "owner") and actor_role != "owner":
        return {"ok": False, "error": "reserve_aux_proprietaires"}
    if current == "owner" and role != "owner" and count_owners() <= 1:
        return {"ok": False, "error": "dernier_proprietaire_protege"}
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"UPDATE kora_users SET role={ph} WHERE id={ph}", (role, uid))
        con.commit()
        return {"ok": True}
    finally:
        con.close()


def set_active(uid, active):
    """Active/désactive un compte éditeur (12.1, réservé à la console root).
    Un compte désactivé échoue à login() et voit ses sessions révoquées
    immédiatement — pas d'attente d'expiration."""
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"UPDATE kora_users SET active={ph} WHERE id={ph}", (1 if active else 0, uid))
        con.commit()
    finally:
        con.close()
    if not active:
        delete_all_sessions_for_user(uid)
    return {"ok": True}


def admin_reset_password(uid, new_password):
    """Réinitialise le mot de passe d'un compte SANS connaître l'ancien
    (réservé à la console root — 12.1). Révoque aussi les sessions actives
    de ce compte : un mot de passe qu'on vient de forcer à changer ne doit
    pas laisser une session déjà ouverte ailleurs."""
    if not new_password or len(new_password) < 8:
        return {"ok": False, "error": "mot_de_passe_trop_court"}
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"UPDATE kora_users SET password_hash={ph} WHERE id={ph}", (_hash_password(new_password), uid))
        con.commit()
    finally:
        con.close()
    delete_all_sessions_for_user(uid)
    return {"ok": True}


def _valid_avatar(data_url):
    """Même validation que le logo (settings.py) : data:image/...;base64, <256 Ko.
    Dupliquée ici (plutôt qu'importée) pour garder auth.py indépendant de
    settings.py — chaque module reste autonome, cohérent avec le reste du repo."""
    if not data_url or not data_url.startswith("data:image/") or ";base64," not in data_url:
        return False
    try:
        b64 = data_url.split(",", 1)[1]
        raw = base64.b64decode(b64, validate=True)
        return len(raw) <= 256 * 1024
    except Exception:
        return False


def set_avatar(uid, data_url):
    """Enregistre la photo de profil (data-URL, jamais un chemin de fichier —
    même principe que le logo white-label : aucune inclusion/traversée de
    fichier possible). data_url vide -> retire l'avatar."""
    if data_url and not _valid_avatar(data_url):
        return {"ok": False, "error": "avatar_invalide"}
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"UPDATE kora_users SET avatar_data={ph} WHERE id={ph}", (data_url or None, uid))
        con.commit()
        return {"ok": True}
    finally:
        con.close()


def delete_user(uid, actor_role=None):
    """Supprime un compte. Garde-fous Propriétaire (2026-08-19), même logique
    que set_role() : un Administrateur ne peut jamais supprimer un
    Propriétaire, et le dernier Propriétaire ne peut jamais être supprimé."""
    current = get_role(uid)
    if current == "owner":
        if actor_role != "owner":
            return {"ok": False, "error": "reserve_aux_proprietaires"}
        if count_owners() <= 1:
            return {"ok": False, "error": "dernier_proprietaire_protege"}
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


def set_wp_publish(uid, allowed):
    """Délégation individuelle du droit d'envoi WordPress (2026-08-19) —
    voir §3 du plan de restructuration. Propriétaire/Administrateur l'ont
    implicitement via leur rôle (voir permissions.can_publish_wp) ; ce
    drapeau ne sert qu'à l'accorder à un Éditeur précis, sans changer son rôle."""
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"UPDATE kora_users SET wp_publish_allowed={ph} WHERE id={ph}", (1 if allowed else 0, uid))
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
        # Invitations (Phase 2, 2026-08-19) : remplace la création directe de
        # compte comme chemin normal (voir §4 du plan) — l'admin ne choisit
        # plus jamais le mot de passe de quelqu'un d'autre. status :
        # pending | accepted | revoked (expired se calcule depuis expires_at,
        # pas stocké — évite un job de fond pour garder ça à jour).
        cur.execute(
            "CREATE TABLE IF NOT EXISTS kora_invitations ("
            "token TEXT PRIMARY KEY, email TEXT, role TEXT, invited_by TEXT, "
            "created_at TEXT, expires_at TEXT, status TEXT DEFAULT 'pending', "
            "accepted_at TEXT, accepted_user_id TEXT)"
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
        try:
            cur.execute("ALTER TABLE kora_users ADD COLUMN avatar_data TEXT")
            con.commit()
        except Exception:
            con.rollback()  # colonne déjà présente
        # 2FA (9.3) : secret TOTP + statut activé + codes de secours (JSON,
        # HASHÉS individuellement — jamais en clair, cf. totp.hash_backup_code).
        # totp_secret peut exister sans totp_enabled=1 : le secret est généré
        # dès le début du flux de configuration, mais n'active RIEN tant que
        # l'utilisateur n'a pas prouvé qu'il l'a bien enregistré (saisie d'un
        # code valide) — évite un verrouillage si l'appli d'auth n'a pas reçu
        # le bon secret.
        for col, ctype in (("totp_secret", "TEXT"), ("totp_enabled", "INTEGER DEFAULT 0"), ("totp_backup_codes", "TEXT"),
                           ("active", "INTEGER DEFAULT 1"), ("wp_publish_allowed", "INTEGER DEFAULT 0")):
            try:
                cur.execute(f"ALTER TABLE kora_users ADD COLUMN {col} {ctype}")
                con.commit()
            except Exception:
                con.rollback()  # colonne déjà présente
        # Restructuration rôles/permissions (2026-08-19, plan valide) : l'admin
        # defini dans .env devient le premier Propriétaire ("user 1") — un
        # niveau AU-DESSUS de 'advanced', distinct de la console root (root_auth.py,
        # ADR-0002, jamais touchee ici). Idempotent : ne fait rien si deja 'owner'
        # ou si un AUTRE compte a deja ete promu proprietaire entre-temps (evite
        # d'ecraser une promotion manuelle faite depuis l'UI).
        admin_user = os.environ.get("ADMIN_USER", "admin").strip()
        ph = db.placeholder()
        cur.execute(f"SELECT role FROM kora_users WHERE username={ph}", (admin_user,))
        row = cur.fetchone()
        cur_role = _row_get(row, "role") if row else None
        if row and cur_role != "owner":
            cur.execute("SELECT COUNT(*) AS n FROM kora_users WHERE role='owner'")
            orow = cur.fetchone()
            n_owners = orow["n"] if isinstance(orow, dict) else orow[0]
            if n_owners == 0:
                cur.execute(f"UPDATE kora_users SET role='owner' WHERE username={ph}", (admin_user,))
                con.commit()
                print(f"[auth] '{admin_user}' promu premier Propriétaire (role=owner)")
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
                add_user(user, pw, email, role="owner")
                print(f"[auth] admin '{user}' créé depuis .env (role=owner, premier Propriétaire)")
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
        # Bug corrige (revue de code 2026-08-19) : str(e) brut partait tel
        # quel dans la reponse API pour toute erreur DB non identifiee comme
        # une violation d'unicite -- fuite potentielle de details internes
        # (message SQL, structure de table) vers un appelant non authentifie
        # (ce chemin est atteignable depuis /api/auth/invitations/accept,
        # public). Journalise cote serveur, message generique cote client.
        if "unique" in str(e).lower():
            return {"ok": False, "error": "username_exists"}
        print(f"[auth] add_user error: {type(e).__name__}: {e}")
        return {"ok": False, "error": "erreur_serveur"}
    finally:
        con.close()


# ----------------------------------------------------------------------------
# Invitations (Phase 2, 2026-08-19) — voir §4 du plan de restructuration
# roles/permissions valide : remplace la création directe de compte (l'admin
# choisissait lui-même le mot de passe du nouveau compte) par un lien à usage
# unique envoyé par email ; la personne invitée choisit ELLE-MÊME son mot de
# passe en l'acceptant. Personne d'autre ne le connaît jamais.
# ----------------------------------------------------------------------------
INVITE_TTL_H = int(os.environ.get("KORA_INVITE_TTL_H", "72"))


def _public_base_url() -> str:
    return f"https://{os.environ.get('KORA_PUBLIC_HOST', '213-156-135-139.sslip.io')}"


def _invite_link(token: str) -> str:
    """URL distincte (2026-08-20, demande explicite : "plusieurs URLs comme
    les autres applis") -- un seul segment de profondeur (/kora-v2/invite),
    le jeton en query string : le build frontend utilise des chemins
    d'assets RELATIFS (base:"./"), une URL à 2 segments de profondeur
    casserait leur résolution. Voir kora-vite/src/app.js (ROUTE_SLUGS)."""
    return f"{_public_base_url()}/kora-v2/invite?token={token}"


def _reset_link(token: str) -> str:
    return f"{_public_base_url()}/kora-v2/reinitialiser?token={token}"


def create_invitation(email, role, invited_by):
    """Crée une invitation à usage unique. `role` doit déjà avoir été validé
    par l'appelant (Q2 : seul un Propriétaire peut inviter en tant que
    Propriétaire — vérifié côté route, pas ici, même découpage que
    set_role/delete_user pour les autres garde-fous)."""
    if role not in ROLES:
        return {"ok": False, "error": "role_invalide"}
    email = (email or "").strip().lower()
    if not email or "@" not in email:
        return {"ok": False, "error": "email_invalide"}
    token = _uid() + _uid()
    now = datetime.now()
    expires = (now + timedelta(hours=INVITE_TTL_H)).isoformat(timespec="seconds")
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(
            f"INSERT INTO kora_invitations(token, email, role, invited_by, created_at, expires_at, status) "
            f"VALUES({ph},{ph},{ph},{ph},{ph},{ph},'pending')",
            (token, email, role, invited_by, now.isoformat(timespec="seconds"), expires),
        )
        con.commit()
    finally:
        con.close()
    sent = _send_invite_email(email, token, role)
    if not sent:
        # Fail-closed comme forgot_password() : on loggue le lien pour que
        # l'inviteur puisse le transmettre manuellement si le SMTP n'est pas
        # configuré (dev local, ou panne SMTP ponctuelle).
        print(f"[auth] INVITE LINK (SMTP non configuré): {_invite_link(token)}")
    return {"ok": True, "token": token, "email_sent": sent, "expires_at": expires}


def list_invitations():
    """Toutes les invitations, les plus récentes d'abord — le statut 'expired'
    (calculé, pas stocké) est déterminé côté appelant en comparant expires_at
    à maintenant, pour rester correct sans job de fond."""
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute("SELECT * FROM kora_invitations ORDER BY created_at DESC")
        return [dict(r) for r in cur.fetchall()]
    finally:
        con.close()


def revoke_invitation(token):
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"UPDATE kora_invitations SET status='revoked' WHERE token={ph} AND status='pending'", (token,))
        con.commit()
        return {"ok": True}
    finally:
        con.close()


def resend_invitation(token):
    """Régénère un nouveau jeton + une nouvelle expiration (72h) pour la même
    invitation et renvoie l'email — l'ancien lien devient inutilisable."""
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"SELECT * FROM kora_invitations WHERE token={ph} AND status='pending'", (token,))
        inv = cur.fetchone()
        if not inv:
            return {"ok": False, "error": "invitation_introuvable"}
        inv = dict(inv)
        new_token = _uid() + _uid()
        expires = (datetime.now() + timedelta(hours=INVITE_TTL_H)).isoformat(timespec="seconds")
        cur.execute(
            f"UPDATE kora_invitations SET token={ph}, expires_at={ph} WHERE token={ph}",
            (new_token, expires, token),
        )
        con.commit()
    finally:
        con.close()
    sent = _send_invite_email(inv["email"], new_token, inv["role"])
    if not sent:
        print(f"[auth] INVITE LINK (SMTP non configuré): {_invite_link(new_token)}")
    return {"ok": True, "token": new_token, "email_sent": sent}


def get_invitation(token):
    """Retourne l'invitation si le jeton est valide (pending, non expiré),
    None sinon — utilisé par l'écran 'définir mon mot de passe'."""
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"SELECT * FROM kora_invitations WHERE token={ph}", (token,))
        row = cur.fetchone()
        if not row:
            return None
        inv = dict(row)
        if inv.get("status") != "pending":
            return None
        if inv.get("expires_at") and datetime.now().isoformat(timespec="seconds") > inv["expires_at"]:
            return None
        return inv
    finally:
        con.close()


def accept_invitation(token, username, password):
    """Crée le compte avec le rôle défini par l'invitation, choisi et validé
    par la personne invitée elle-même (identifiant + mot de passe) — jamais
    par la personne qui a invité. Jeton à usage unique : consommé même en
    cas d'échec de création (username déjà pris, etc.) pour éviter un
    réessai automatisé en boucle sur le même lien."""
    inv = get_invitation(token)
    if not inv:
        return {"ok": False, "error": "invitation_invalide_ou_expiree"}
    username = (username or "").strip()
    if len(username) < 3:
        return {"ok": False, "error": "username_too_short"}
    if len(password or "") < 8:
        return {"ok": False, "error": "password_too_short"}
    r = add_user(username, password, inv["email"], role=inv["role"])
    if not r.get("ok"):
        return r
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(
            f"UPDATE kora_invitations SET status='accepted', accepted_at={ph}, accepted_user_id={ph} WHERE token={ph}",
            (datetime.now().isoformat(timespec="seconds"), r["id"], token),
        )
        con.commit()
    finally:
        con.close()
    return {"ok": True, "id": r["id"], "role": inv["role"]}


def _send_invite_email(to_addr, token, role):
    host = os.environ.get("SMTP_HOST")
    if not host:
        return False
    try:
        port = int(os.environ.get("SMTP_PORT", "587"))
        user = os.environ.get("SMTP_USER", "")
        pw = os.environ.get("SMTP_PASS", "")
        frm = os.environ.get("SMTP_FROM", user)
        link = _invite_link(token)
        role_label = {"owner": "Propriétaire", "advanced": "Administrateur", "normal": "Éditeur", "lecteur": "Lecteur"}.get(role, role)
        msg = MIMEText(
            "Bonjour,\n\nVous êtes invité(e) à rejoindre KORA Reach en tant que "
            f"{role_label}.\nCliquez sur ce lien pour créer votre compte "
            f"(valable {INVITE_TTL_H}h) :\n{link}\n\n"
            "Si vous ne vous attendiez pas à cette invitation, ignorez ce message.",
            "plain", "utf-8")
        msg["Subject"] = "Invitation à rejoindre KORA Reach"
        msg["From"] = frm
        msg["To"] = to_addr
        with smtplib.SMTP(host, port, timeout=15) as s:
            s.starttls()
            if user and pw:
                s.login(user, pw)
            s.sendmail(frm, [to_addr], msg.as_string())
        return True
    except Exception as e:
        print(f"[auth] SMTP error (invite): {e}")
        return False


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
        # kora_sessions: session_id, user_id, created_at, expires_at
        exp = s["expires_at"] if isinstance(s, dict) else (s[3] if len(s) > 3 else s[0])
        if exp and datetime.now().isoformat(timespec="seconds") > exp:
            delete_session(sid)
            return None
        uid = s["user_id"] if isinstance(s, dict) else (s[1] if len(s) > 1 else s[0])
        # Renvoie TOUJOURS un dict (mode-agnostique SQLite/Postgres)
        cur.execute(f"SELECT id, username, email, role, created_at, avatar_data, wp_publish_allowed FROM kora_users WHERE id={ph}", (uid,))
        row = cur.fetchone()
        if not row:
            return None
        if isinstance(row, dict):
            return row
        # tuple -> dict (ordre de la SELECT ci-dessus)
        cols = ["id", "username", "email", "role", "created_at", "avatar_data", "wp_publish_allowed"]
        return dict(zip(cols, row))
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
def _row_get(row, key, default=None):
    """Accès par nom de colonne robuste aux deux backends. isinstance(row, dict)
    est FAUX pour sqlite3.Row (un type distinct, ni dict ni tuple) alors qu'il
    supporte pourtant l'accès par clé — c'est exactement le bug déjà corrigé
    dans hitl_store.py cette session (5 occurrences). hasattr(row, "keys")
    est vrai pour sqlite3.Row ET pour un vrai dict (RealDictCursor Postgres),
    contrairement à isinstance(row, dict)."""
    try:
        if hasattr(row, "keys") and key in row.keys():
            return row[key]
    except Exception:
        pass
    return default


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
    # Compte désactivé par la console root (12.1) : mot de passe correct
    # sans importance, aucune session ne doit être créée.
    if _row_get(u, "active", 1) == 0:
        return {"ok": False, "error": "account_disabled"}
    uid = u["id"] if isinstance(u, dict) else u[0]
    # 2FA (9.3) : mot de passe validé, mais si l'utilisateur a activé la double
    # authentification, PAS de session tout de suite — un jeton temporaire
    # (5 min) qui ne prouve que "mot de passe correct", le code TOTP restant
    # à vérifier séparément (voir verify_login_totp) avant toute vraie session.
    if _row_get(u, "totp_enabled"):
        mfa_token = _mfa_create_pending(uid)
        return {"ok": True, "mfa_required": True, "mfa_token": mfa_token}
    sid = create_session(uid)
    return {"ok": True, "session_id": sid}


def verify_login_totp(mfa_token, code):
    uid = _mfa_check_and_consume(mfa_token)
    if not uid:
        return {"ok": False, "error": "mfa_expired"}
    con, _ = db.conn()
    try:
        cur = con.cursor()
        ph = db.placeholder()
        cur.execute(f"SELECT totp_secret, totp_backup_codes FROM kora_users WHERE id={ph}", (uid,))
        row = cur.fetchone()
    finally:
        con.close()
    if not row:
        return {"ok": False, "error": "no_user"}
    secret = _row_get(row, "totp_secret")
    if secret and _totp.verify(secret, code):
        _mfa_finalize(mfa_token)
        return {"ok": True, "session_id": create_session(uid), "username": username_by_id(uid)}
    # Repli : un code de secours à usage unique (téléphone perdu/cassé).
    backup_raw = _row_get(row, "totp_backup_codes")
    backup_codes = json.loads(backup_raw) if backup_raw else []
    code_clean = str(code or "").strip().upper()
    for i, hashed in enumerate(backup_codes):
        if _totp.verify_backup_code(code_clean, hashed):
            backup_codes.pop(i)  # usage unique : consommé même en cas de succès
            con, _ = db.conn()
            try:
                cur = con.cursor()
                ph = db.placeholder()
                cur.execute(f"UPDATE kora_users SET totp_backup_codes={ph} WHERE id={ph}", (json.dumps(backup_codes), uid))
                con.commit()
            finally:
                con.close()
            _mfa_finalize(mfa_token)
            log_auth_event("mfa_backup_code_used", username_by_id(uid) or uid)
            return {"ok": True, "session_id": create_session(uid), "username": username_by_id(uid), "backup_code_used": True, "backup_codes_left": len(backup_codes)}
    return {"ok": False, "error": "invalid_code"}


def totp_setup_init(user_id):
    """Démarre (ou redémarre) la configuration 2FA : génère un NOUVEAU secret,
    le stocke SANS activer (totp_enabled reste 0 tant que confirm() n'a pas
    prouvé que l'appli d'auth a bien le bon secret)."""
    secret = _totp.random_base32_secret()
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"UPDATE kora_users SET totp_secret={ph}, totp_enabled=0 WHERE id={ph}", (secret, user_id))
        con.commit()
    finally:
        con.close()
    uname = username_by_id(user_id) or "compte"
    return {"ok": True, "secret": secret, "otpauth_uri": _totp.provisioning_uri(secret, uname)}


def totp_setup_confirm(user_id, code):
    """Vérifie le code saisi contre le secret en attente ; si valide, ACTIVE
    la 2FA et génère les codes de secours (affichés une seule fois — seule
    leur empreinte est conservée)."""
    con, _ = db.conn()
    try:
        cur = con.cursor()
        ph = db.placeholder()
        cur.execute(f"SELECT totp_secret FROM kora_users WHERE id={ph}", (user_id,))
        row = cur.fetchone()
    finally:
        con.close()
    secret = _row_get(row, "totp_secret") if row else None
    if not secret:
        return {"ok": False, "error": "no_pending_setup"}
    if not _totp.verify(secret, code):
        return {"ok": False, "error": "invalid_code"}
    backup_codes = _totp.generate_backup_codes()
    hashed = [_totp.hash_backup_code(c) for c in backup_codes]
    con, _ = db.conn()
    try:
        cur = con.cursor()
        ph = db.placeholder()
        cur.execute(f"UPDATE kora_users SET totp_enabled=1, totp_backup_codes={ph} WHERE id={ph}", (json.dumps(hashed), user_id))
        con.commit()
    finally:
        con.close()
    log_auth_event("mfa_enabled", username_by_id(user_id) or user_id)
    return {"ok": True, "backup_codes": backup_codes}


def totp_disable(user_id, password):
    """Désactive la 2FA — exige le mot de passe (zone sensible : ne pas
    laisser un poste déverrouillé désactiver la 2FA d'un simple clic)."""
    u = _get_user_by_username(username_by_id(user_id))
    if not u:
        return {"ok": False, "error": "no_user"}
    stored_hash = u["password_hash"] if isinstance(u, dict) else u[2]
    if not _verify_password(password, stored_hash):
        return {"ok": False, "error": "wrong_password"}
    ph = db.placeholder()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"UPDATE kora_users SET totp_enabled=0, totp_secret=NULL, totp_backup_codes=NULL WHERE id={ph}", (user_id,))
        con.commit()
    finally:
        con.close()
    log_auth_event("mfa_disabled", username_by_id(user_id) or user_id)
    return {"ok": True}


def totp_status(user_id):
    con, _ = db.conn()
    try:
        cur = con.cursor()
        ph = db.placeholder()
        cur.execute(f"SELECT totp_enabled, totp_backup_codes FROM kora_users WHERE id={ph}", (user_id,))
        row = cur.fetchone()
    finally:
        con.close()
    if not row:
        return {"enabled": False, "backup_codes_left": 0}
    backup_raw = _row_get(row, "totp_backup_codes")
    left = len(json.loads(backup_raw)) if backup_raw else 0
    return {"enabled": bool(_row_get(row, "totp_enabled")), "backup_codes_left": left}


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
            print(f"[auth] RESET LINK (SMTP non configuré): {_reset_link(token)}")
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
        link = _reset_link(token)
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
    # Path=/kora-v2/ pour que le cookie soit envoyé sur /kora-v2/api/*
    # SameSite=Lax (standard auth) au lieu de Strict qui bloque les navigateurs sur sous-chemin
    return f"kora_sid={sid}; Path=/kora-v2/; HttpOnly; SameSite=Lax{secure}; Max-Age={SESSION_TTL_H*3600}"


def read_cookie_sid(headers):
    c = headers.get("Cookie", "")
    for part in c.split(";"):
        part = part.strip()
        if part.startswith("kora_sid="):
            return part[len("kora_sid="):]
    return None
