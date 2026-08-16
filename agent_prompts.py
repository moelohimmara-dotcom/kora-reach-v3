"""agent_prompts.py — prompt système de l'agent éditorial, éditable (zone sensible, §9.5).

Stocké dans la même table que settings.py (kora_config), clés dédiées. Vide/absent =
comportement par défaut : writer.py utilise alors SYSTEM_PROMPT codé en dur (aucune
régression possible en cas d'oubli/erreur).

Deux champs éditables (cf. wireframe 9.5) :
- system  : remplace ENTIÈREMENT le prompt système du rédacteur si non vide.
            ATTENTION : writer.py découpe ce texte sur le marqueur "2. LONGUEUR"
            pour dériver une variante courte (sys_base) réutilisée par la génération
            section par section. Si ce marqueur est supprimé/reformulé, aucun crash —
            mais sys_base redevient le texte entier (perte du découpage voulu).
            L'UI avertit de ce risque et propose un bouton "Réinitialiser par défaut".
- addon   : instructions complémentaires ("prompt user"/add-on), ajoutées À LA SUITE
            du prompt système effectif (défaut ou override). Ne touche jamais le
            marqueur "2. LONGUEUR" du prompt de base -> sans risque sur le split().

Toute modification est tracée dans le journal d'audit (audit.py, action=MODIFIE).
"""
import db

KEY_SYSTEM = "agent_prompt_system"
KEY_ADDON = "agent_prompt_addon"
MAX_LEN = 8000
SPLIT_MARKER = "2. LONGUEUR"


def _ph():
    return db.placeholder()


def _ensure_table():
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(
            "CREATE TABLE IF NOT EXISTS kora_config (key TEXT PRIMARY KEY, value TEXT)"
        )
        con.commit()
    finally:
        con.close()


def get_overrides() -> dict:
    """Retourne {"system": "", "addon": ""} — chaînes vides si non surchargé."""
    _ensure_table()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(
            f"SELECT key, value FROM kora_config WHERE key IN ({_ph()},{_ph()})",
            (KEY_SYSTEM, KEY_ADDON),
        )
        rows = cur.fetchall()
    finally:
        con.close()
    d = {r["key"]: r["value"] for r in rows}
    return {
        "system": d.get(KEY_SYSTEM) or "",
        "addon": d.get(KEY_ADDON) or "",
    }


def set_override(field: str, value: str, editor: str = None) -> dict:
    if field not in ("system", "addon"):
        return {"ok": False, "error": "champ inconnu"}
    value = (value or "").strip()
    if len(value) > MAX_LEN:
        return {"ok": False, "error": f"Texte trop long (max {MAX_LEN} caractères)"}
    if field == "system" and value and SPLIT_MARKER not in value:
        # Pas bloquant : juste un avertissement renvoyé au front (voir server.py).
        warning = (
            f"Le marqueur interne '{SPLIT_MARKER}' est absent — la génération "
            "section par section utilisera le prompt entier au lieu d'un extrait "
            "raccourci. L'article restera cohérent mais le comportement diffère "
            "légèrement du prompt d'origine."
        )
    else:
        warning = None

    key = KEY_SYSTEM if field == "system" else KEY_ADDON
    _ensure_table()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        if db.is_postgres():
            cur.execute(f"DELETE FROM kora_config WHERE key={_ph()}", (key,))
            if value:
                cur.execute(
                    f"INSERT INTO kora_config(key,value) VALUES({_ph()},{_ph()})",
                    (key, value),
                )
        else:
            if value:
                cur.execute(
                    f"INSERT OR REPLACE INTO kora_config(key,value) VALUES({_ph()},{_ph()})",
                    (key, value),
                )
            else:
                cur.execute(f"DELETE FROM kora_config WHERE key={_ph()}", (key,))
        con.commit()
    finally:
        con.close()

    try:
        import audit
        label = "prompt système" if field == "system" else "instructions complémentaires (add-on)"
        action = "réinitialisé par défaut" if not value else "modifié"
        audit.log(
            "settings", "AGENT_PROMPT_MODIFIE",
            detail=f"{label} {action} par {editor or 'inconnu'}",
            action="MODIFIE", editor=editor,
        )
    except Exception:
        pass

    return {"ok": True, "warning": warning, "overrides": get_overrides()}


def reset(field: str, editor: str = None) -> dict:
    return set_override(field, "", editor=editor)
