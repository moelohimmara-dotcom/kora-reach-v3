"""totp.py — TOTP (RFC 6238) et codes de secours, stdlib pur (hashlib/hmac/
base64/secrets uniquement) — cohérent avec le principe "zéro dépendance"
déjà appliqué dans auth.py. Aucune bibliothèque tierce (pyotp, qrcode...) :
le secret et les codes ne transitent jamais vers un service externe (pas de
génération de QR via une API tierce non plus — l'utilisateur saisit la clé
manuellement dans son appli d'authentification, méthode de repli standard
supportée par Google/Microsoft/Authy au même titre que le QR).
"""
import base64
import hashlib
import hmac
import secrets
import struct
import time

STEP = 30          # fenêtre de temps standard (secondes)
DIGITS = 6          # longueur du code standard
WINDOW = 1          # tolère ±1 pas (dérive d'horloge) de part et d'autre


def random_base32_secret(length=20):
    """Secret aléatoire (160 bits par défaut, standard TOTP), encodé base32
    sans padding — format attendu par toutes les applis d'authentification."""
    raw = secrets.token_bytes(length)
    return base64.b32encode(raw).decode("ascii").rstrip("=")


def _hotp(secret_b32, counter, digits=DIGITS):
    # Complète le padding base32 retiré au stockage (b32decode l'exige).
    pad = secret_b32 + "=" * ((8 - len(secret_b32) % 8) % 8)
    key = base64.b32decode(pad.upper())
    msg = struct.pack(">Q", counter)
    h = hmac.new(key, msg, hashlib.sha1).digest()
    offset = h[-1] & 0x0F
    code = (struct.unpack(">I", h[offset:offset + 4])[0] & 0x7FFFFFFF) % (10 ** digits)
    return str(code).zfill(digits)


def totp_now(secret_b32, digits=DIGITS, step=STEP, at=None):
    counter = int((at if at is not None else time.time()) // step)
    return _hotp(secret_b32, counter, digits)


def verify(secret_b32, code, step=STEP, digits=DIGITS, window=WINDOW, at=None):
    """Compare le code à la fenêtre courante ± `window` pas (dérive d'horloge
    du téléphone). Comparaison en temps constant (hmac.compare_digest)."""
    if not code or not secret_b32:
        return False
    code = str(code).strip().replace(" ", "")
    if not code.isdigit() or len(code) != digits:
        return False
    now = at if at is not None else time.time()
    counter = int(now // step)
    for delta in range(-window, window + 1):
        candidate = _hotp(secret_b32, counter + delta, digits)
        if hmac.compare_digest(candidate, code):
            return True
    return False


def provisioning_uri(secret_b32, username, issuer="KORA"):
    """URI otpauth:// standard — affichée en texte (clé manuelle) plutôt qu'en
    QR (pas de dépendance de génération d'image, pas d'appel à un service
    tiers pour encoder un secret sensible en QR)."""
    import urllib.parse as _up
    label = _up.quote(f"{issuer}:{username}")
    params = _up.urlencode({"secret": secret_b32, "issuer": issuer, "algorithm": "SHA1", "digits": DIGITS, "period": STEP})
    return f"otpauth://totp/{label}?{params}"


def generate_backup_codes(n=8, length=10):
    """Codes de secours à usage unique (perte du téléphone) — alphabet sans
    caractères ambigus (0/O, 1/I/l)."""
    alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
    return ["".join(secrets.choice(alphabet) for _ in range(length)) for _ in range(n)]


def hash_backup_code(code):
    """Même schéma que auth._hash_password (PBKDF2-HMAC-SHA256 + sel), pour
    ne jamais stocker les codes de secours en clair — un code de secours volé
    dans une fuite de base a le même impact qu'un mot de passe volé."""
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", code.encode("utf-8"), salt, 100_000)
    return base64.b64encode(salt).decode() + "$" + base64.b64encode(dk).decode()


def verify_backup_code(code, stored):
    try:
        salt_b64, hash_b64 = stored.split("$", 1)
        salt = base64.b64decode(salt_b64)
        dk = hashlib.pbkdf2_hmac("sha256", code.encode("utf-8"), salt, 100_000)
        return hmac.compare_digest(base64.b64encode(dk).decode(), hash_b64)
    except Exception:
        return False
