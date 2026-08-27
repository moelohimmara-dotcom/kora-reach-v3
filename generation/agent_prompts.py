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
import core.db as db
import json

KEY_SYSTEM = "agent_prompt_system"
KEY_ADDON = "agent_prompt_addon"
KEY_SKILLS_ENABLED = "agent_skills_enabled"
MAX_LEN = 8000
SPLIT_MARKER = "2. LONGUEUR"

# ---------------------------------------------------------------------------
# COMPETENCES FACULTATIVES (2026-08-27, demande explicite : "lui donner des
# competences (facultatif...)"). Choix retenu (vs description libre) : cases
# a cocher predefinies -- l'agent peut deja s'autogerer via le seul prompt
# systeme (rien n'est obligatoire), ces cases ajoutent des comportements
# PRECIS et TESTABLES a la marge, sans risque de derive incontrolee qu'une
# "competence" en texte libre aurait ouvert (aurait fait doublon avec l'add-on
# qui existe deja pour ca). Chaque "text" est un fragment de prompt ajoute
# A LA SUITE de l'add-on effectif si l'id est active (voir get_overrides()).
# ---------------------------------------------------------------------------
SKILLS = [
    {
        "id": "chiffre_cle_ouverture",
        "label": "Toujours citer un chiffre clé en ouverture",
        "description": "Le chapô doit intégrer explicitement le chiffre le plus marquant des sources (montant, nombre de personnes, pourcentage...) s'il en existe un.",
        "text": "COMPÉTENCE ACTIVÉE — CHIFFRE CLÉ : si les sources contiennent un chiffre marquant (montant, nombre de personnes, pourcentage, date précise), intègre-le explicitement dans le CHAPÔ, pas seulement dans le corps.",
    },
    {
        "id": "structure_5w",
        "label": "Structurer explicitement en 5W (qui/quoi/où/quand/pourquoi)",
        "description": "Le chapô doit répondre visiblement aux 5 questions journalistiques de base, dans cet ordre si possible.",
        "text": "COMPÉTENCE ACTIVÉE — 5W : le CHAPÔ doit répondre explicitement et dans l'ordre à QUI, QUOI, OÙ, QUAND, POURQUOI (dans la mesure où les sources le permettent), sans jamais inventer une réponse absente des sources.",
    },
    {
        "id": "encart_chiffres_cles",
        "label": "Ajouter un encart « Chiffres clés » en fin d'article",
        "description": "Ajoute une courte liste à puces des chiffres importants mentionnés, après le corps de l'article.",
        "text": "COMPÉTENCE ACTIVÉE — ENCART CHIFFRES CLÉS : si au moins 2 chiffres significatifs apparaissent dans les sources, ajoute juste avant la signature 'Par La Rédaction' un court encart '**Chiffres clés**' suivi d'une liste à puces (3 items maximum), strictement basé sur les sources.",
    },
    {
        "id": "citation_directe",
        "label": "Toujours inclure une citation directe si disponible",
        "description": "Privilégie l'insertion d'au moins une citation entre guillemets tirée des sources, pour ancrer l'article dans le réel.",
        "text": "COMPÉTENCE ACTIVÉE — CITATION : si une citation directe (entre guillemets, attribuée à une personne nommée) existe dans les sources, inclus-la telle quelle dans le corps de l'article. N'invente JAMAIS de citation absente des sources.",
    },
    {
        "id": "contexte_recurrence",
        "label": "Ajouter un paragraphe de contexte/récurrence si pertinent",
        "description": "Si le fait s'inscrit dans une série (ex: un 3e éboulement cette année), le signaler.",
        "text": "COMPÉTENCE ACTIVÉE — CONTEXTE : si les sources mentionnent explicitement que ce fait s'inscrit dans une récurrence ou fait suite à des événements similaires, consacre un paragraphe du corps à ce contexte. N'invente jamais de récurrence non mentionnée dans les sources.",
    },
    {
        "id": "ton_institutionnel",
        "label": "Ton plus institutionnel sur les sujets officiels",
        "description": "Adopte un registre plus formel/protocolaire quand l'article concerne le gouvernement, la diplomatie ou une nomination officielle.",
        "text": "COMPÉTENCE ACTIVÉE — TON INSTITUTIONNEL : si le sujet concerne une décision gouvernementale, une nomination officielle ou une relation diplomatique, adopte un registre plus formel et protocolaire que le ton par défaut, sans devenir ampoulé.",
    },
]
_SKILLS_BY_ID = {s["id"]: s for s in SKILLS}


def _ph():
    return db.placeholder()


def _ensure_table():
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(
            "CREATE TABLE IF NOT EXISTS kora_config (key TEXT PRIMARY KEY, value TEXT)"
        )
        cur.execute(
            """CREATE TABLE IF NOT EXISTS kora_style_examples (
                id TEXT PRIMARY KEY, filename TEXT, extracted_text TEXT,
                uploaded_at TEXT, uploaded_by TEXT)"""
        )
        con.commit()
    finally:
        con.close()


def _get_skills_enabled() -> list:
    _ensure_table()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"SELECT value FROM kora_config WHERE key={_ph()}", (KEY_SKILLS_ENABLED,))
        row = cur.fetchone()
    finally:
        con.close()
    if not row:
        return []
    raw = row["value"] if isinstance(row, dict) else row[0]
    try:
        ids = json.loads(raw or "[]")
    except Exception:
        return []
    return [i for i in ids if i in _SKILLS_BY_ID]  # ignore les ids obsolètes


def set_skills_enabled(ids: list, editor: str = None) -> dict:
    """Active/désactive les compétences facultatives (voir SKILLS ci-dessus).
    Facultatif par construction : liste vide = comportement par défaut du
    prompt système seul, jamais bloquant."""
    valid_ids = [i for i in (ids or []) if i in _SKILLS_BY_ID]
    _ensure_table()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        value = json.dumps(valid_ids)
        if db.is_postgres():
            cur.execute(f"DELETE FROM kora_config WHERE key={_ph()}", (KEY_SKILLS_ENABLED,))
            cur.execute(f"INSERT INTO kora_config(key,value) VALUES({_ph()},{_ph()})",
                        (KEY_SKILLS_ENABLED, value))
        else:
            cur.execute(f"INSERT OR REPLACE INTO kora_config(key,value) VALUES({_ph()},{_ph()})",
                        (KEY_SKILLS_ENABLED, value))
        con.commit()
    finally:
        con.close()
    try:
        import editorial.audit as audit
        audit.log("settings", "AGENT_SKILLS_MODIFIE",
                   detail=f"compétences activées : {', '.join(valid_ids) or 'aucune'} (par {editor or 'inconnu'})",
                   action="MODIFIE", editor=editor)
    except Exception:
        pass
    return {"ok": True, "skills_enabled": valid_ids}


# ---------------------------------------------------------------------------
# EXEMPLES DE STYLE REDACTIONNEL (2026-08-27, demande explicite : "fournir
# des exemples de style redactionnel via fichier"). Formats couverts en 1ere
# phase (decision explicite) : texte brut/.md, .docx, .pdf -- l'image/capture
# (OCR) est reportee, decision separee prise avec l'utilisateur. Stockage
# dedie (pas kora_config) : plusieurs exemples possibles, avec metadonnees.
# ---------------------------------------------------------------------------
MAX_STYLE_EXAMPLES = 5          # borne le nombre d'exemples (evite un prompt
                                 # demesure au fil du temps si jamais nettoye)
STYLE_EXCERPT_LEN = 1200        # caracteres injectes au prompt par exemple


_MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 Mo, large pour du texte/docx/pdf de style


def extract_text_from_upload(filename: str, data_url: str) -> dict:
    """Décode un fichier envoyé en data-URL base64 (même convention que le
    logo, voir core/settings.py::_valid_logo) et en extrait le texte selon
    l'extension. Formats couverts (décision explicite du 2026-08-27) : texte
    brut/.md, .docx, .pdf. Retourne {"ok": True, "text": ...} ou
    {"ok": False, "error": ...} -- ne lève jamais (appelant = endpoint HTTP)."""
    import base64
    import re as _re
    if not data_url or ";base64," not in data_url:
        return {"ok": False, "error": "format_data_url_invalide"}
    try:
        _, b64 = data_url.split(";base64,", 1)
        raw = base64.b64decode(b64, validate=True)
    except Exception:
        return {"ok": False, "error": "decodage_base64_echoue"}
    if len(raw) > _MAX_UPLOAD_BYTES:
        return {"ok": False, "error": f"fichier_trop_volumineux_max_{_MAX_UPLOAD_BYTES // (1024*1024)}Mo"}

    ext = (filename or "").lower().rsplit(".", 1)[-1] if "." in (filename or "") else ""
    try:
        if ext in ("txt", "md", "markdown"):
            text = raw.decode("utf-8", errors="replace")
        elif ext == "docx":
            import io
            import docx
            d = docx.Document(io.BytesIO(raw))
            text = "\n".join(p.text for p in d.paragraphs if p.text)
        elif ext == "pdf":
            import io
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(raw))
            text = "\n".join((p.extract_text() or "") for p in reader.pages)
        else:
            return {"ok": False, "error": f"format_non_supporte_.{ext}_(txt/md/docx/pdf uniquement pour l'instant)"}
    except Exception as e:
        return {"ok": False, "error": f"extraction_echouee: {type(e).__name__}"}

    text = _re.sub(r"\n{3,}", "\n\n", text).strip()
    if not text:
        return {"ok": False, "error": "aucun_texte_extrait_fichier_vide_ou_image_seule"}
    return {"ok": True, "text": text}


# ---------------------------------------------------------------------------
# SUGGESTIONS PREDEFINIES D'EXEMPLES DE STYLE (2026-08-27, demande explicite :
# "il faut ajouter une fonctionnalite qui apporte quelques suggestions
# predefinies au user"). Le user n'a pas forcement un fichier sous la main --
# ces presets sont des extraits reels et courts (ecrits pour KORA, contexte
# Guinee/Conakry) qu'il peut ajouter en un clic comme exemple de style, au
# meme titre qu'un upload. Reutilisent le meme stockage (kora_style_examples)
# et le meme circuit prompt -- aucune logique dupliquee.
# ---------------------------------------------------------------------------
STYLE_PRESETS = [
    {
        "id": "sobre_institutionnel",
        "label": "Sobre et institutionnel",
        "description": "Registre formel, phrases courtes, aucun effet de style — adapté aux communiqués officiels.",
        "text": ("Le ministère de l'Administration du territoire a annoncé, dans un communiqué diffusé "
                 "ce lundi, la tenue d'une réunion de coordination avec les gouverneurs de région. "
                 "La rencontre, prévue à Conakry, doit porter sur le suivi des instructions "
                 "gouvernementales relatives à la décentralisation. Aucune date de clôture n'a été "
                 "précisée à ce stade."),
    },
    {
        "id": "narratif_vivant",
        "label": "Narratif et vivant",
        "description": "Ancre le fait dans une scène concrète avant d'aller à l'essentiel — plus incarné, sans perdre en rigueur.",
        "text": ("Il est un peu plus de 7 heures quand les premiers commerçants du marché de Madina "
                 "découvrent les grilles fermées. Depuis la nuit, un incendie a ravagé une dizaine "
                 "d'étals dans la section réservée aux tissus. Les sapeurs-pompiers, arrivés vers "
                 "5 heures, ont maîtrisé les flammes avant qu'elles n'atteignent les entrepôts voisins. "
                 "Aucune victime n'est à déplorer, mais les pertes matérielles s'annoncent lourdes."),
    },
    {
        "id": "incisif_direct",
        "label": "Incisif et direct",
        "description": "Phrases très courtes, va droit au fait marquant, peu de contexte en ouverture — pour une actualité chaude.",
        "text": ("Coupure générale. Depuis mardi soir, plusieurs quartiers de Conakry sont privés "
                 "d'électricité. La société en charge évoque une panne technique sur le réseau haute "
                 "tension. Aucun délai de rétablissement n'a été communiqué. Les habitants, eux, "
                 "s'organisent déjà avec des groupes électrogènes."),
    },
    {
        "id": "factuel_dense",
        "label": "Factuel et dense",
        "description": "Beaucoup d'information par phrase, chiffres et dates intégrés naturellement — pour l'économie ou les données.",
        "text": ("La production nationale de bauxite a atteint 108 millions de tonnes en 2025, en "
                 "hausse de 12 % par rapport à l'année précédente, selon les chiffres publiés mercredi "
                 "par le ministère des Mines. Cette progression s'explique principalement par la montée "
                 "en puissance de trois nouveaux sites d'exploitation dans la préfecture de Boké, "
                 "entrés en production au second semestre."),
    },
]
_STYLE_PRESETS_BY_ID = {p["id"]: p for p in STYLE_PRESETS}


def add_style_preset(preset_id: str, editor: str = None) -> dict:
    """Ajoute une suggestion prédéfinie (voir STYLE_PRESETS) comme exemple de
    style, sans passer par un upload -- même stockage, même circuit que
    add_style_example()."""
    preset = _STYLE_PRESETS_BY_ID.get(preset_id)
    if not preset:
        return {"ok": False, "error": "suggestion_inconnue"}
    return add_style_example(f"Suggestion prédéfinie : {preset['label']}", preset["text"], editor=editor)


def list_style_examples() -> list:
    _ensure_table()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute("SELECT id, filename, extracted_text, uploaded_at, uploaded_by "
                    "FROM kora_style_examples ORDER BY uploaded_at DESC")
        rows = cur.fetchall()
    finally:
        con.close()
    out = []
    for r in rows:
        d = dict(r) if isinstance(r, dict) else {
            "id": r[0], "filename": r[1], "extracted_text": r[2], "uploaded_at": r[3], "uploaded_by": r[4]}
        out.append({
            "id": d["id"], "filename": d["filename"],
            "excerpt": (d["extracted_text"] or "")[:200],
            "length": len(d["extracted_text"] or ""),
            "uploaded_at": d["uploaded_at"], "uploaded_by": d["uploaded_by"],
        })
    return out


def add_style_example(filename: str, extracted_text: str, editor: str = None) -> dict:
    text = (extracted_text or "").strip()
    if not text:
        return {"ok": False, "error": "aucun_texte_extrait"}
    if len(list_style_examples()) >= MAX_STYLE_EXAMPLES:
        return {"ok": False, "error": f"maximum_{MAX_STYLE_EXAMPLES}_exemples_atteint"}
    import uuid
    from datetime import datetime, timezone
    _ensure_table()
    eid = "style_" + uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc).isoformat()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(
            f"INSERT INTO kora_style_examples(id,filename,extracted_text,uploaded_at,uploaded_by) "
            f"VALUES ({_ph()},{_ph()},{_ph()},{_ph()},{_ph()})",
            (eid, filename, text, now, editor))
        con.commit()
    finally:
        con.close()
    try:
        import editorial.audit as audit
        audit.log("settings", "AGENT_STYLE_EXAMPLE_AJOUTE",
                   detail=f"exemple de style ajouté : {filename} ({len(text)} car.) par {editor or 'inconnu'}",
                   action="MODIFIE", editor=editor)
    except Exception:
        pass
    return {"ok": True, "id": eid}


def delete_style_example(example_id: str, editor: str = None) -> dict:
    _ensure_table()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"DELETE FROM kora_style_examples WHERE id={_ph()}", (example_id,))
        found = cur.rowcount > 0
        con.commit()
    finally:
        con.close()
    if found:
        try:
            import editorial.audit as audit
            audit.log("settings", "AGENT_STYLE_EXAMPLE_SUPPRIME",
                       detail=f"exemple de style supprimé : {example_id} par {editor or 'inconnu'}",
                       action="MODIFIE", editor=editor)
        except Exception:
            pass
    return {"ok": found}


def _style_examples_prompt_block() -> str:
    """Concatène les exemples de style (tronqués) en un bloc de prompt --
    fonction interne, appelée par get_overrides() pour composer
    l'add-on effectif envoyé au rédacteur."""
    examples = list_style_examples()
    if not examples:
        return ""
    parts = ["EXEMPLES DE STYLE RÉDACTIONNEL DE RÉFÉRENCE (fournis par l'éditeur -- "
             "imite le TON et le RYTHME de ces extraits, sans jamais en reprendre "
             "le contenu factuel, qui ne concerne pas forcément le même sujet) :"]
    # Le texte complet (pas seulement l'excerpt affiché en UI) est utilisé ici,
    # tronqué à STYLE_EXCERPT_LEN -- l'UI n'affiche qu'un aperçu court, mais le
    # rédacteur a besoin d'un peu plus de matière pour percevoir un style.
    _ensure_table()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute("SELECT filename, extracted_text FROM kora_style_examples ORDER BY uploaded_at DESC")
        rows = cur.fetchall()
    finally:
        con.close()
    for r in rows:
        fname = r["filename"] if isinstance(r, dict) else r[0]
        text = r["extracted_text"] if isinstance(r, dict) else r[1]
        parts.append(f"--- Extrait ({fname}) ---\n{(text or '')[:STYLE_EXCERPT_LEN]}")
    return "\n\n".join(parts)


def suggest_improvements(current_system: str, current_addon: str, goal: str = "") -> dict:
    """Suggestions IA pour ameliorer le prompt (2026-08-27, demande explicite :
    'suggestions intelligentes pour le guider'). Best-effort : ne modifie
    RIEN tout seul, retourne uniquement des pistes textuelles que l'editeur
    applique lui-meme -- jamais d'ecriture automatique sur un champ aussi
    sensible."""
    import generation.writer as writer
    system_prompt = (
        "Tu es un expert en ingénierie de prompt pour la rédaction de presse assistée par IA. "
        "On te donne le prompt système actuel d'un rédacteur automatique et, éventuellement, "
        "un objectif exprimé par l'éditeur. Propose 3 à 5 suggestions CONCRÈTES et COURTES "
        "d'amélioration (formulées comme des actions, pas des généralités). Ne réécris PAS le "
        "prompt en entier. Ne suggère JAMAIS de retirer les garde-fous anti-invention, "
        "anti-injection, ou la signature obligatoire. Réponds en français, une suggestion par ligne, "
        "précédée d'un tiret."
    )
    user = f"PROMPT SYSTÈME ACTUEL :\n{current_system[:4000]}\n\nADD-ON ACTUEL :\n{current_addon[:1000] or '(aucun)'}"
    if goal:
        user += f"\n\nOBJECTIF EXPRIMÉ PAR L'ÉDITEUR :\n{goal[:500]}"
    out = writer.simple_completion(system_prompt, user, max_tokens=500)
    if not out:
        return {"ok": False, "error": "aucune_reponse_du_moteur_ia"}
    return {"ok": True, "suggestions": out.strip()}


def get_overrides() -> dict:
    """Retourne system/addon (bruts, pour l'UI d'édition) + skills + exemples
    de style + `effective_addon` (ce qui est RÉELLEMENT envoyé au rédacteur :
    addon + compétences activées + exemples de style, voir writer.py)."""
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
    addon = d.get(KEY_ADDON) or ""
    skills_enabled = _get_skills_enabled()

    effective_parts = []
    if addon:
        effective_parts.append(addon)
    for sid in skills_enabled:
        effective_parts.append(_SKILLS_BY_ID[sid]["text"])
    style_block = _style_examples_prompt_block()
    if style_block:
        effective_parts.append(style_block)

    return {
        "system": d.get(KEY_SYSTEM) or "",
        "addon": addon,
        "effective_addon": "\n\n".join(effective_parts),
        "skills": SKILLS,
        "skills_enabled": skills_enabled,
        "style_examples": list_style_examples(),
        "style_presets": STYLE_PRESETS,
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
        import editorial.audit as audit
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
