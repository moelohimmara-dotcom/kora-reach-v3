"""hitl_store.py — persistance des décisions HITL (verrou + traçabilité).

Machine à états par fait :
  PENDING_REVIEW -> EDITED -> APPROVED -> TRANSMITTED
                              -> REJECTED
  TRANSMITTED -> RETRACTED (override tracé, droit de rectification)
Chaque décision porte decided_by + decided_at (ISO Conakry). Aucune décision
anonyme. Survit aux redémarrages (SQLite ou PostgreSQL selon DATABASE_BACKEND).
"""
import os
import json
import hashlib
import threading
from datetime import datetime
from zoneinfo import ZoneInfo
import core.config as config
import core.db as db
import editorial.audit as audit

TZ = ZoneInfo(config.LIMITS["timezone"])

STATES = {
    "PENDING_REVIEW", "EDITED", "APPROVED", "REJECTED",
    "TRANSMITTED", "TRANSMISSION_FAILED", "RETRACTED", "TRASHED",
}
# Transitions autorisées depuis chaque état
# Bug corrige 2026-08-20 (rapporte : "Rejeter" puis "Envoyer en brouillon"
# n'aboutissait jamais, sans aucune explication visible) -- audit complet :
# les boutons Approuver/Modifier/Rejeter du tiroir article (voir app.js,
# renderSheet()) s'affichent SANS CONDITION quel que soit le statut actuel
# de l'article, tout comme les actions groupees (Attente/Brouillon/
# Approuver/Corbeille) qui s'appliquent a une selection MELANGEANT
# n'importe quels statuts. Avant ce correctif, la table ci-dessous
# n'autorisait qu'un sous-ensemble de ces combinaisons pourtant TOUTES
# atteignables d'un simple clic -- chaque combinaison manquante echouait
# silencieusement (voir decide()) sans que rien ne le signale a l'ecran.
#
# Principe retenu : les 5 statuts "editoriaux" ci-dessous sont TOUJOURS
# ré-assignables entre eux par un humain (coeur du modele HITL : la
# decision humaine prime, elle doit toujours pouvoir se corriger) --
# aucune raison metier de bloquer par exemple REJECTED -> EDITED. Les
# statuts "systeme" (TRANSMITTED, RETRACTED, TRANSMISSION_FAILED),
# atteints via des fonctions dediees (transmit(), retract(),
# mark_transmission_failed()) et non via decide() generique, restent
# ajoutes explicitement seulement la ou ils avaient deja un sens.
_EDITORIAL_TARGETS = {"PENDING_REVIEW", "EDITED", "APPROVED", "REJECTED", "TRASHED"}
_ALLOWED = {
    "PENDING_REVIEW": _EDITORIAL_TARGETS,
    "EDITED": _EDITORIAL_TARGETS,
    # TRANSMITTED/TRANSMISSION_FAILED/RETRACTED retires des cibles ci-dessous
    # (7e passage de revue de code, 2026-08-20) : ces statuts "systeme" ne
    # doivent JAMAIS resulter de decide() (voir le garde `decision not in
    # _EDITORIAL_TARGETS` en tete de decide()) -- uniquement d'un vrai envoi
    # WordPress (transmit()) ou d'un retract() explicite, qui ecrivent en
    # base directement, hors de ce garde-fou.
    "APPROVED": _EDITORIAL_TARGETS,
    "TRANSMISSION_FAILED": _EDITORIAL_TARGETS,
    # Bug corrige 2026-08-20 (7e passage de revue de code) : mettre APPROVED
    # dans les cibles de REJECTED cassait une regle metier PREEXISTANTE et
    # DELIBEREE (verifiee par verify_hitl.py, script E2E : "re-decider un
    # REJECTED vers APPROVED doit etre refuse -- REJECTED verrouille"). Le bug
    # rapporte concernait uniquement REJECTED -> EDITED ("Envoyer en
    # brouillon"), jamais REJECTED -> APPROVED direct. Un rejet reste donc
    # verrouille contre une ré-approbation DIRECTE (evite qu'un clic sur
    # "Approuver" -- toujours visible dans le tiroir, quel que soit le statut
    # -- ne republie sur WordPress un article qu'un humain venait de rejeter) ;
    # il faut d'abord le repasser par EDITED/PENDING_REVIEW (une action
    # deliberee et distincte) avant de pouvoir l'approuver.
    "REJECTED": _EDITORIAL_TARGETS - {"APPROVED"},
    # Bug corrige 2026-08-20 (5e passage de revue de code) : ouvrir
    # TRANSMITTED vers _EDITORIAL_TARGETS permettait a decide() de faire
    # passer un article DEJA EN LIGNE sur WordPress vers EDITED/PENDING_REVIEW/
    # REJECTED SANS aucun garde-fou (le garde-fou anti-double-transmission de
    # server.py ne couvre que le cas APPROVED) -- une fois passe, par exemple,
    # a EDITED via une action groupee "Brouillon", le statut affiche n'etait
    # plus TRANSMITTED, et un decide(..., "APPROVED", ...) ulterieur
    # re-publiait silencieusement une seconde fois sur WordPress. Seul
    # retract() (fonction dediee, distincte de decide(), qui ramene
    # explicitement a PENDING_REVIEW) peut desormais faire sortir un article
    # de l'etat TRANSMITTED -- meme principe que TRASHED plus bas.
    "TRANSMITTED": set(),
    "RETRACTED": _EDITORIAL_TARGETS,
    # Bug corrige 2026-08-20 (3e passage de revue de code) : mettre TRASHED
    # ici (comme _EDITORIAL_TARGETS le ferait) rendait decide() appelable
    # DEPUIS un fait en corbeille -- mais le mirroir hitl_facts plus bas
    # (`UPDATE hitl_facts SET status=... WHERE ... AND status <> 'TRASHED'`)
    # ignore volontairement toute mise a jour tant que status='TRASHED',
    # precisement pour eviter qu'un decide() generique ne sorte un fait de la
    # corbeille par accident. Resultat avant ce correctif : decide() renvoyait
    # {"ok": True} (hitl_decisions bien mis a jour) mais hitl_facts restait
    # bloque sur TRASHED -- un succes en facade qui ne changeait RIEN a
    # l'ecran, et pire, aurait pu declencher une transmission WordPress sur
    # un article toujours affiche comme "en corbeille". Le SEUL chemin
    # valide pour sortir un fait de la corbeille est restore_fact() (utilise
    # par le bouton dedie "Restaurer" de la vue Corbeille, jamais par le
    # tiroir article generique) : ensemble vide ici, decide() doit refuser
    # explicitement plutot que de mentir sur le resultat.
    "TRASHED": set(),
}


def _ph():
    return db.placeholder()


_initialized = False
# Garde-fou 2026-08-19 (incident distinct trouve sur state_store.py, meme
# schema ici) : le flag seul ne protege pas deux THREADS appelant _init() au
# tout premier appel avant qu'il ne passe a True -- sur Postgres, un CREATE
# TABLE IF NOT EXISTS concurrent pour une table neuve peut lever
# UniqueViolation (pg_type_typname_nsp_index). Verrou de precaution : pas de
# nouvelle table ajoutee ici aujourd'hui, mais ce fichier suit exactement le
# meme patron que celui qui a plante en prod.
_init_lock = threading.Lock()


def _init():
    # Garde d'idempotence process-wide : _init() est appelée par ~8 fonctions
    # différentes à chaque requête (count_published, get_dashboard_stats, ...).
    # Sans ce flag, chaque appel ré-exécutait 3 CREATE TABLE + 2 ALTER TABLE
    # (5 connexions Postgres à chaque fois). Sous charge concurrente, les
    # ALTER TABLE (verrou AccessExclusive) se mettaient en file d'attente les
    # uns derrière les autres, et TOUTE requête touchant hitl_facts/articles
    # se retrouvait bloquée en cascade derrière -> connexions Postgres
    # épuisées, service inutilisable (incident du 2026-08-18). La migration
    # de schéma ne doit tourner qu'une fois par démarrage du process, pas par
    # requête.
    global _initialized
    if _initialized:
        return
    with _init_lock:
        if _initialized:
            return
        _init_locked()


def _init_locked():
    global _initialized
    con, mode = db.conn()
    try:
        if mode == "postgres":
            cur = con.cursor()
            cur.execute("""CREATE TABLE IF NOT EXISTS hitl_decisions (
                fact_id TEXT PRIMARY KEY, status TEXT NOT NULL, decision TEXT,
                edited_text TEXT, final_text TEXT, decided_by TEXT, decided_at TEXT,
                transmitted_at TEXT, provider TEXT, http_status INTEGER,
                override_by TEXT, override_at TEXT)""")
            cur.execute("""CREATE TABLE IF NOT EXISTS hitl_facts (
                fact_id TEXT PRIMARY KEY, champion TEXT NOT NULL, contexts TEXT,
                article TEXT, image TEXT, image_meta TEXT, gen_model TEXT,
                n_sources INTEGER DEFAULT 1, status TEXT DEFAULT 'PENDING_REVIEW',
                created_at TEXT, cycle_id TEXT)""")
            con.commit()
        else:
            cur = con.cursor()
            cur.execute("""CREATE TABLE IF NOT EXISTS hitl_decisions (
                fact_id TEXT PRIMARY KEY, status TEXT NOT NULL, decision TEXT,
                edited_text TEXT, final_text TEXT, decided_by TEXT, decided_at TEXT,
                transmitted_at TEXT, provider TEXT, http_status INTEGER,
                override_by TEXT, override_at TEXT)""")
            cur.execute("""CREATE TABLE IF NOT EXISTS hitl_facts (
                fact_id TEXT PRIMARY KEY, champion TEXT NOT NULL, contexts TEXT,
                article TEXT, image TEXT, image_meta TEXT, gen_model TEXT,
                n_sources INTEGER DEFAULT 1, status TEXT DEFAULT 'PENDING_REVIEW',
                created_at TEXT, cycle_id TEXT)""")
            # Table `articles` : en prod PostgreSQL elle est créée par le pipeline
            # WordPress (schéma complet, colonnes wp_* comprises), donc on NE la crée
            # PAS ici en postgres (un schéma minimal masquerait un défaut de setup).
            # En SQLite (dev local) personne ne la crée -> les requêtes de stats
            # (count_published / get_dashboard_stats : SELECT count(*) FROM articles
            # WHERE status='published') échouaient en 500. On la crée donc en SQLite,
            # alignée sur les colonnes réellement écrites par transmit._to_postgres.
            cur.execute("""CREATE TABLE IF NOT EXISTS articles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fact_id TEXT,
                titre TEXT, chapeau TEXT, corps TEXT,
                meta_description TEXT, mots_cles TEXT,
                source_url TEXT, source_nom TEXT, source_level INTEGER,
                image_url TEXT, llm_model_used TEXT,
                status TEXT DEFAULT 'PENDING_REVIEW', origin TEXT,
                created_at TEXT DEFAULT (datetime('now')))""")
            con.commit()
    finally:
        con.close()
    # Corbeille : on ajoute trashed_at (idempotent, supporte les bases existantes)
    try:
        con, mode = db.conn()
        cur = con.cursor()
        if mode == "postgres":
            cur.execute("ALTER TABLE hitl_facts ADD COLUMN IF NOT EXISTS trashed_at TEXT")
        else:
            try:
                cur.execute("ALTER TABLE hitl_facts ADD COLUMN trashed_at TEXT")
            except Exception:
                pass
        con.commit()
    except Exception:
        pass
    finally:
        try: con.close()
        except Exception: pass
    # cycle_id : lien vers le cycle ayant acquis l'info (idempotent)
    try:
        con, mode = db.conn()
        cur = con.cursor()
        if mode == "postgres":
            cur.execute("ALTER TABLE hitl_facts ADD COLUMN IF NOT EXISTS cycle_id TEXT")
        else:
            try:
                cur.execute("ALTER TABLE hitl_facts ADD COLUMN cycle_id TEXT")
            except Exception:
                pass
        con.commit()
    except Exception:
        pass
    finally:
        try: con.close()
        except Exception: pass
    # Video narree (2026-08-20) : statut + chemin + erreur eventuelle,
    # idempotent (meme motif que trashed_at/cycle_id ci-dessus). video_status
    # ∈ {None, 'generating', 'done', 'error'} -- None = jamais demandee.
    # video_stage ajoute 2026-08-21 (barre de progression) : ∈ {None,
    # 'narration', 'image', 'assemblage'} -- uniquement pertinent quand
    # video_status='generating'.
    try:
        con, mode = db.conn()
        cur = con.cursor()
        for col, ctype in (("video_status", "TEXT"), ("video_path", "TEXT"),
                           ("video_duration_sec", "REAL"), ("video_error", "TEXT"),
                           ("video_stage", "TEXT")):
            if mode == "postgres":
                cur.execute(f"ALTER TABLE hitl_facts ADD COLUMN IF NOT EXISTS {col} {ctype}")
            else:
                try:
                    cur.execute(f"ALTER TABLE hitl_facts ADD COLUMN {col} {ctype}")
                except Exception:
                    pass
        con.commit()
    except Exception:
        pass
    finally:
        try: con.close()
        except Exception: pass
    # Traçabilité WordPress (2026-08-23, demande explicite du client : "un
    # article déjà publié/transféré ne doit plus pouvoir être ré-approuvé/
    # retransmis") -- jusqu'ici mark_transmitted() ne stockait AUCUN lien
    # entre un fait KORA et le post WordPress réel qu'il a produit (ni
    # wp_post_id, ni wp_url, ni si c'était en brouillon ou publié) : impossible
    # de savoir depuis le dashboard OÙ se trouve le post correspondant, et
    # impossible de bloquer une retransmission accidentelle sur la base du
    # post déjà existant. Idempotent (même motif que video_status ci-dessus).
    try:
        con, mode = db.conn()
        cur = con.cursor()
        for col, ctype in (("wp_post_id", "TEXT"), ("wp_url", "TEXT"), ("wp_status", "TEXT")):
            if mode == "postgres":
                cur.execute(f"ALTER TABLE hitl_facts ADD COLUMN IF NOT EXISTS {col} {ctype}")
            else:
                try:
                    cur.execute(f"ALTER TABLE hitl_facts ADD COLUMN {col} {ctype}")
                except Exception:
                    pass
        con.commit()
    except Exception:
        pass
    finally:
        try: con.close()
        except Exception: pass
    _initialized = True


_init()


def fact_id_of(champion: dict) -> str:
    raw = (champion.get("url", "") + "|" + champion.get("title", "")).encode()
    return "fact_" + hashlib.sha1(raw).hexdigest()[:16]


def upsert_fact(f: dict) -> str:
    fid = fact_id_of(f.get("champion", {}))
    champ = json.dumps(f.get("champion", {}), ensure_ascii=False)
    ctx = json.dumps(f.get("contexts", []), ensure_ascii=False)
    art = json.dumps(f.get("article", ""), ensure_ascii=False) if isinstance(f.get("article"), (dict, list)) else (f.get("article") or "")
    img = f.get("image", "") or (f.get("champion", {}).get("image", ""))
    img_meta = json.dumps(f.get("image_meta", {}), ensure_ascii=False)
    now = datetime.now(TZ).isoformat(timespec="seconds")
    p = _ph()
    con, mode = db.conn()
    try:
        cur = con.cursor()
        if mode == "postgres":
            cur.execute(
                f"""INSERT INTO hitl_facts (fact_id, champion, contexts, article, image, image_meta, gen_model, n_sources, created_at, cycle_id)
                   VALUES ({p},{p},{p},{p},{p},{p},{p},{p},{p},{p})
                   ON CONFLICT(fact_id) DO UPDATE SET
                     champion=EXCLUDED.champion, contexts=EXCLUDED.contexts, article=EXCLUDED.article,
                     image=EXCLUDED.image, image_meta=EXCLUDED.image_meta, gen_model=EXCLUDED.gen_model,
                     n_sources=EXCLUDED.n_sources, cycle_id=EXCLUDED.cycle_id""",
                (fid, champ, ctx, art, img, img_meta, f.get("gen_model", ""), f.get("n_sources", 1), now, f.get("cycle_id", "")))
        else:
            cur.execute(
                f"""INSERT INTO hitl_facts (fact_id, champion, contexts, article, image, image_meta, gen_model, n_sources, created_at, cycle_id)
                   VALUES ({p},{p},{p},{p},{p},{p},{p},{p},{p},{p})
                   ON CONFLICT(fact_id) DO UPDATE SET
                     champion=excluded.champion, contexts=excluded.contexts, article=excluded.article,
                     image=excluded.image, image_meta=excluded.image_meta, gen_model=excluded.gen_model,
                     n_sources=excluded.n_sources, cycle_id=excluded.cycle_id""",
                (fid, champ, ctx, art, img, img_meta, f.get("gen_model", ""), f.get("n_sources", 1), now, f.get("cycle_id", "")))
        con.commit()
    finally:
        con.close()
    return fid


def list_facts() -> list:
    _init()
    con, mode = db.conn()
    try:
        cur = con.cursor()
        cur.execute(
            """SELECT f.*, d.status AS d_status, d.decided_by, d.decided_at, d.final_text, d.provider
               FROM hitl_facts f
               LEFT JOIN hitl_decisions d ON d.fact_id = f.fact_id
               ORDER BY f.created_at DESC""")
        rows = cur.fetchall()
    finally:
        con.close()
    out = []
    for r in rows:
        d = dict(r)
        champ = json.loads(d["champion"]) if d["champion"] else {}
        # Prevention (2026-08-19, demande explicite apres le correctif de
        # lenteur de /api/hitl) : raw_content (texte source COMPLET scrape,
        # potentiellement plusieurs Ko par source) n'est utilise QUE cote
        # serveur (writer.py, au moment de la generation/regeneration, relu
        # frais depuis get_fact() -- jamais depuis list_facts()). Verifie :
        # AUCUNE reference a raw_content dans le frontend (app.js/store.js),
        # il n'est jamais affiche. Retire ici -> pur gain de poids sans
        # aucun changement cote client. Article deja redige (le texte
        # REELLEMENT affiche) reste inclus, lui, sans changement.
        champ.pop("raw_content", None)
        ctx = json.loads(d["contexts"]) if d["contexts"] else []
        for c in ctx:
            if isinstance(c, dict):
                c.pop("raw_content", None)
        # B1 fix : article stocké en JSON string ("{}" = vide) -> traiter comme ""
        art_raw = d["article"]
        if art_raw and (art_raw.startswith("{") or art_raw.startswith("[")):
            try:
                parsed = json.loads(art_raw)
                # Si c'est un dict/list vide -> considérer comme article vide
                if isinstance(parsed, (dict, list)) and not parsed:
                    art = ""
                else:
                    art = parsed
            except json.JSONDecodeError:
                art = art_raw
        else:
            art = art_raw or ""
        img_meta = json.loads(d["image_meta"]) if d["image_meta"] else {}
        if not img_meta.get("image") and d["image"] and d["image"].startswith("http"):
            img_meta = {"image": d["image"], "provider": "loremflickr", "generated": True}
        # B+C backend : hitl_facts.status prime sur la décision HITL pour la
        # corbeille (priorité absolue). Un fact à la corbeille (status='TRASHED'
        # en base) doit rester "Corbeille" côté frontend, même si hitl_decisions
        # porte une autre décision (ex: remis en attente). Sinon on utilise la
        # décision HITL (d_status) pour refléter APPROVED/REJECTED/EDITED/TRANSMITTED.
        # B+C backend : hitl_facts.status EST la source de vérité (mirroré par decide()
        # et mark_transmitted()). On l'utilise directement — sauf si c'est PENDING_REVIEW
        # et qu'une décision HITL le précise (cas d'un fact décidé mais non mirroiré).
        # Exclusion "RETRACTED" (2026-08-19, bug corrigé) : retract() garde
        # volontairement hitl_decisions.status='RETRACTED' pour la traçabilité
        # (même convention que REJECTED, voir decide()), mais hitl_facts.status
        # est désormais mirroré à 'PENDING_REVIEW' par retract() lui-même -- sans
        # cette exclusion, ce repli écrasait ce mirroring correct en réaffichant
        # "RETRACTED", un statut que le frontend ne reconnaît même pas.
        _raw_status = d.get("status") or "PENDING_REVIEW"
        if _raw_status == "TRASHED":
            _eff_status = "TRASHED"
        elif _raw_status == "PENDING_REVIEW" and d.get("d_status") and d.get("d_status") != "RETRACTED":
            _eff_status = d["d_status"]
        else:
            _eff_status = _raw_status
        out.append({
            "fact_id": d["fact_id"], "champion": champ, "contexts": ctx, "article": art,
            "image": d["image"], "image_meta": img_meta, "gen_model": d["gen_model"],
            "n_sources": d["n_sources"], "status": _eff_status,
            "decided_by": d["decided_by"], "decided_at": d["decided_at"],
            "final_text": d["final_text"], "provider": d["provider"],
            "created_at": d["created_at"],
            # d_status + rejected : pour que le frontend classe correctement
            # les articles rejetes (corbeille + decision HITL REJECTED) dans "Rejetes".
            "d_status": d.get("d_status"),
            "rejected": (_raw_status == "TRASHED" and (d.get("d_status") == "REJECTED" or d.get("decision") == "REJECTED")),
            # Traçabilité WordPress (2026-08-23, voir mark_transmitted()) : le
            # frontend s'en sert pour verrouiller les actions d'un article déjà
            # transmis et afficher un lien direct vers le post réel.
            "wp_post_id": d.get("wp_post_id"),
            "wp_url": d.get("wp_url"),
            "wp_status": d.get("wp_status"),
        })
    return out


def get_fact(fid: str) -> dict | None:
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute("SELECT * FROM hitl_facts WHERE fact_id=%s" % _ph(), (fid,))
        r = cur.fetchone()
    finally:
        con.close()
    return dict(r) if r else None


def set_video_status(fact_id: str, status: str, path: str = None,
                      duration_sec: float = None, error: str = None,
                      stage: str = None) -> None:
    """Met a jour le statut de generation video d'un fact (2026-08-20).
    status attendu : 'generating' | 'done' | 'error'. `stage` (2026-08-21,
    barre de progression) : 'narration' | 'image' | 'assemblage', pertinent
    uniquement pendant status='generating'. Jamais leve (fail-open, coherent
    avec le reste de ce module) -- une ecriture de statut qui rate ne doit
    jamais faire planter le pipeline video appelant."""
    ph = _ph()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(
            f"UPDATE hitl_facts SET video_status={ph}, video_path={ph}, "
            f"video_duration_sec={ph}, video_error={ph}, video_stage={ph} WHERE fact_id={ph}",
            (status, path, duration_sec, error, stage, fact_id),
        )
        con.commit()
    except Exception:
        pass
    finally:
        con.close()


def get(fact_id: str) -> dict | None:
    _init()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute("SELECT * FROM hitl_decisions WHERE fact_id=%s" % _ph(), (fact_id,))
        row = cur.fetchone()
    finally:
        con.close()
    return dict(row) if row else None


def list_all() -> list:
    _init()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute("SELECT * FROM hitl_decisions ORDER BY decided_at DESC")
        rows = cur.fetchall()
    finally:
        con.close()
    return [dict(r) for r in rows]


def decide(fact_id: str, decision: str, decided_by: str,
           edited_text: str = "", final_text: str = "") -> dict:
    if not decided_by or not decided_by.strip():
        return {"error": "decision_anonyme_refusee"}
    # Bug corrige 2026-08-20 (7e passage de revue de code) : decide() est LA
    # DECISION EDITORIALE HUMAINE (via le tiroir article / les actions
    # groupees) -- jamais le chemin des transitions "systeme" (TRANSMITTED,
    # TRANSMISSION_FAILED, RETRACTED), qui doivent SEULEMENT resulter d'un
    # vrai envoi WordPress (transmit()/mark_transmitted()/
    # mark_transmission_failed()) ou d'un retract() explicite. _ALLOWED
    # autorisait pourtant deja ces cibles depuis APPROVED/TRANSMISSION_FAILED
    # (pour permettre a CES fonctions dediees, qui n'appellent PAS decide(),
    # de fonctionner -- un vestige historique). server.py ne validait pas non
    # plus le champ `decision` recu du client avant de l'y transmettre tel
    # quel : un appel direct a /api/hitl/decide avec decision="TRANSMITTED"
    # aurait donc pu afficher un article comme publie sur WordPress SANS
    # AUCUN envoi reel. Garde-fou pose ici, au niveau le plus bas (protege
    # tout appelant present et futur, pas seulement server.py) :
    if decision not in _EDITORIAL_TARGETS:
        return {"error": "decision_invalide", "decision": decision}
    existing = get(fact_id)
    # cur_state vient de hitl_decisions.status, PAS hitl_facts.status : c'est
    # le statut "editorial" (la derniere decision humaine), qui est la
    # colonne que _ALLOWED est concu pour gouverner. Les deux colonnes
    # divergent volontairement dans un cas : un REJETE met hitl_facts a
    # TRASHED tout en laissant hitl_decisions.status='REJECTED' (tracabilite,
    # voir plus bas) -- c'est PRECISEMENT ce qui permet a "Rejeter" puis
    # "Envoyer en brouillon" de fonctionner (REJECTED -> EDITED est autorise
    # dans _ALLOWED) sans pour autant permettre de sortir un fait VRAIMENT en
    # corbeille (trash_facts(), ou hitl_decisions.status='TRASHED' aussi) --
    # celui-la est bloque des ce garde-fou par _ALLOWED["TRASHED"] = set().
    # (Bug corrige 2026-08-20, 6e passage de revue de code : lire hitl_facts
    # ici semblait plus "coherent avec l'ecriture protegee" mais cassait en
    # realite le cas d'usage meme que cette tache visait a reparer -- voir
    # tests/test_smoke_hitl_transitions.py, test 3, pour la regression exacte.)
    cur_state = existing["status"] if existing else "PENDING_REVIEW"
    if decision not in _ALLOWED.get(cur_state, set()):
        return {"error": "transition_interdite", "from": cur_state, "to": decision}
    now = datetime.now(TZ).isoformat(timespec="seconds")
    p = _ph()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        # Re-verification juste avant l'ecriture (revue de code 2026-08-20,
        # 7e passage) : cur_state a ete lu plus haut via une connexion SEPAREE
        # (get(fact_id) ouvre/ferme la sienne) -- entre ce moment-la et
        # maintenant, un appel CONCURRENT (ex: trash_facts() depuis une autre
        # requete) a pu changer hitl_decisions.status. Sans cette
        # re-verification, l'ecriture ci-dessous se ferait "en aveugle" sur la
        # base d'un etat perime, pouvant par exemple faire ressortir un fait
        # d'une VRAIE corbeille sans passer par restore_fact(). Ne reduit pas
        # la fenetre a zero (get() reste une requete separee, pas un SELECT ...
        # FOR UPDATE dans la meme transaction), mais la ramene de "toute la
        # duree de traitement de la requete HTTP" a "deux requetes SQL
        # consecutives sur la meme connexion" -- attenuation proportionnee
        # pour un outil a faible concurrence (petite equipe editoriale), pas
        # une garantie absolue d'atomicite.
        cur.execute(f"SELECT status FROM hitl_decisions WHERE fact_id={p}", (fact_id,))
        _fresh = cur.fetchone()
        _fresh_state = _fresh["status"] if _fresh else "PENDING_REVIEW"
        if decision not in _ALLOWED.get(_fresh_state, set()):
            return {"error": "transition_interdite", "from": _fresh_state, "to": decision,
                    "detail": "L'état de l'article a changé entre-temps (action concurrente) — réessayez."}
        # Bug corrige 2026-08-20 (11e passage de revue de code) : la
        # re-verification ci-dessus reduit la fenetre de course mais ne
        # l'annule pas -- un COMMIT concurrent (ex: trash_facts()) pouvait
        # encore s'intercaler entre CE SELECT et l'UPDATE hitl_facts plus bas
        # (qui n'a plus de garde "AND status <> 'TRASHED'" depuis le 6e
        # passage, precisement pour laisser passer REJECTED -> EDITED). Pour
        # rendre l'ecriture reellement sure sans reintroduire le blocage
        # REJECTED/TRASHED, l'UPDATE hitl_facts ci-dessous devient une
        # ecriture CONDITIONNELLE (compare-and-swap) : elle ne s'applique que
        # si hitl_facts.status est TOUJOURS celui lu ICI, MAINTENANT -- si un
        # autre thread/requete l'a change entre-temps, 0 ligne est affectee
        # et on le detecte via rowcount plutot que d'ecraser aveuglement.
        cur.execute(f"SELECT status FROM hitl_facts WHERE fact_id={p}", (fact_id,))
        _facts_row = cur.fetchone()
        _fresh_facts_status = _facts_row["status"] if _facts_row else None
        # Bug corrige 2026-08-20 (8e passage de revue de code) : cette
        # branche testait encore `existing` (lu plus haut, via une connexion
        # SEPAREE, potentiellement perime -- voir re-verification ci-dessus)
        # au lieu de `_fresh` (qu'on vient de relire sur CETTE connexion,
        # juste avant). Avec `existing`, une premiere decide() concurrente
        # sur un fait sans ligne hitl_decisions pouvait faire croire a TORT
        # qu'aucune ligne n'existe encore (existing=None) alors que `_fresh`
        # venait justement d'en trouver une -- tentative d'INSERT sur une
        # cle deja prise (violation de contrainte) au lieu d'un UPDATE propre.
        if _fresh:
            cur.execute(
                f"""UPDATE hitl_decisions SET status={p}, decision={p}, edited_text={p},
                   final_text={p}, decided_by={p}, decided_at={p} WHERE fact_id={p}""",
                (decision, decision, edited_text, final_text, decided_by, now, fact_id))
        else:
            cur.execute(
                f"""INSERT INTO hitl_decisions
                   (fact_id, status, decision, edited_text, final_text, decided_by, decided_at)
                   VALUES ({p},{p},{p},{p},{p},{p},{p})""",
                (fact_id, decision, decision, edited_text, final_text, decided_by, now))
        # Miroir du statut dans hitl_facts : list_facts() priorise hitl_facts.status,
        # donc sans ça un fact EDITED/APPROVED/REJECTED/TRANSMITTED/PENDING_REVIEW
        # reste affiche avec son ANCIEN statut (rebond via hitl_decisions non
        # repercute) -> compteurs instables, et surtout : l'action semble reussir
        # (decide() renvoie ok=True, hitl_decisions est bien mis a jour) mais RIEN
        # ne change visuellement pour l'utilisateur.
        #
        # Bug corrige 2026-08-19 (rapporte en prod : "Remettre en attente" sur un
        # brouillon disait avoir reussi mais l'article restait affiche comme
        # brouillon) : cette liste blanche ("EDITED", "APPROVED", "TRANSMITTED")
        # etait incomplete -- "PENDING_REVIEW" (utilise par finishDraft() cote
        # frontend, EXPLICITEMENT autorise dans _ALLOWED["EDITED"] ci-dessus,
        # commentaire "terminer l'edition, ramener a la normale") n'y figurait
        # pas, donc decide() faisait tout SAUF la seule chose visible par
        # l'utilisateur. Generalise a "toute decision sauf REJECTED" (qui a sa
        # propre regle ci-dessus) au lieu d'une liste blanche a maintenir a la
        # main a chaque nouvelle valeur -- exactement le genre d'oubli qui vient
        # de se produire.
        # Bug corrige 2026-08-20 (6e passage de revue de code) : ces deux
        # UPDATE portaient un garde "AND status <> 'TRASHED'" cense empecher
        # decide() de sortir un fait de la VRAIE corbeille (trash_facts()) --
        # mais cette protection est desormais assuree EN AMONT par le
        # garde-fou _ALLOWED (voir cur_state/_ALLOWED["TRASHED"] = set() plus
        # haut : decide() ne peut plus jamais atteindre ce bloc pour un fait
        # dont hitl_decisions.status='TRASHED'). Le garde ici etait donc a la
        # fois redondant pour ce cas ET nuisible pour un autre : un article
        # REJETE (hitl_decisions.status='REJECTED', hitl_facts.status='TRASHED'
        # par effet de bord) qui passe legitimement a EDITED/APPROVED/etc. via
        # decide() se voyait bloque par ce meme "status <> 'TRASHED'", alors
        # que le garde-fou _ALLOWED avait deja valide la transition -- exactement
        # le bug rapporte ("Rejeter" puis "Envoyer en brouillon" sans effet).
        if decision in ("REJECTED", "TRASHED"):
            # Rejeter = envoyer DIRECTEMENT en corbeille (demande utilisateur 2026-08-14).
            # hitl_facts passe en TRASHED + trashed_at ; la décision HITL reste REJECTED
            # (traçabilité : on distingue un rejet d'une suppression manuelle).
            cur.execute(
                f"UPDATE hitl_facts SET status='TRASHED', trashed_at={p} WHERE fact_id={p} AND status={p}",
                (now, fact_id, _fresh_facts_status))
        else:
            cur.execute(
                f"UPDATE hitl_facts SET status={p} WHERE fact_id={p} AND status={p}",
                (decision, fact_id, _fresh_facts_status))
        if cur.rowcount == 0 and _fresh_facts_status is not None:
            # Compare-and-swap manque : hitl_facts a change entre notre
            # lecture et notre ecriture (course concurrente). On annule
            # PLUTOT que de laisser hitl_decisions et hitl_facts diverger
            # silencieusement -- l'utilisateur voit une erreur claire et peut
            # simplement rejouer l'action sur l'etat desormais a jour.
            con.rollback()
            return {"error": "conflit_concurrent", "detail": "L'article a été modifié entre-temps par une autre action — réessayez."}
        con.commit()
    finally:
        con.close()
    # Bug corrige 2026-08-20 (12e passage de revue de code) : "TRASHED" est
    # une cible decide() legitime depuis _EDITORIAL_TARGETS mais n'avait pas
    # d'entree ici -> journal d'audit incoherent ("MODIFIE" au lieu de
    # "CORBEILLE") selon que la mise en corbeille passe par decide() ou par
    # trash_facts() (qui logue bien "CORBEILLE" pour le meme resultat final).
    _act = {"EDITED": "MODIFIE", "APPROVED": "APPROUVE", "REJECTED": "REJETE",
            "TRASHED": "CORBEILLE", "PENDING_REVIEW": "MODIFIE"}.get(decision, "MODIFIE")
    audit.log(None, f"DECIDE_{decision}", f"fact={fact_id} by={decided_by}",
              fact_id=fact_id, action=_act, editor=decided_by)
    # from_status ajoute par la revue de code du 2026-08-20 : expose le
    # statut d'origine de la transition pour tracabilite/tests. Le garde-fou
    # anti-double-transmission WordPress est desormais assure a DEUX niveaux :
    # _ALLOWED["TRANSMITTED"] = set() refuse categoriquement tout decide()
    # depuis un fait transmis (seul retract() en sort) ; server.py ajoute en
    # plus un pre-check explicite (get_fact(fid) AVANT d'appeler decide())
    # pour renvoyer un message clair ("deja publie") plutot que l'erreur
    # generique "transition_interdite" -- defense en profondeur, pas le seul
    # rempart.
    return {"ok": True, "fact_id": fact_id, "status": decision, "decided_by": decided_by, "from_status": cur_state}


def mark_transmitted(fact_id: str, provider: str, http_status: int,
                     final_text: str = "", wp_post_id: str = "", wp_url: str = "",
                     wp_status: str = "") -> dict:
    """wp_post_id/wp_url/wp_status (2026-08-23, demande explicite du client :
    empêcher qu'un article déjà publié/transféré puisse être ré-approuvé ou
    retransmis, et pouvoir tracer OÙ se trouve le post réel) -- vides si le
    provider n'est pas WordPress (ex: Supabase/Postgres seul), jamais
    inventés. Persistés en base pour que le frontend affiche un lien direct
    vers le post existant plutôt qu'un état "à décider" trompeur."""
    p = _ph()
    now = datetime.now(TZ).isoformat(timespec="seconds")
    con, _ = db.conn()
    try:
        cur = con.cursor()
        if final_text:
            cur.execute(
                f"UPDATE hitl_decisions SET status='TRANSMITTED', transmitted_at={p}, "
                f"provider={p}, http_status={p}, final_text={p} WHERE fact_id={p}",
                (now, provider, http_status, final_text, fact_id))
        else:
            cur.execute(
                f"UPDATE hitl_decisions SET status='TRANSMITTED', transmitted_at={p}, "
                f"provider={p}, http_status={p} WHERE fact_id={p}",
                (now, provider, http_status, fact_id))
        # Miroir dans hitl_facts (voir decide())
        cur.execute(
            f"UPDATE hitl_facts SET status='TRANSMITTED', wp_post_id={p}, wp_url={p}, "
            f"wp_status={p} WHERE fact_id={p} AND status <> 'TRASHED'",
            (str(wp_post_id) if wp_post_id else None, wp_url or None, wp_status or None, fact_id))
        con.commit()
    finally:
        con.close()
    audit.log(None, "TRANSMIT", f"fact={fact_id} provider={provider} http={http_status}",
              fact_id=fact_id, action="TRANSMIS", editor="system")
    return {"ok": True, "fact_id": fact_id, "status": "TRANSMITTED"}


def mark_transmission_failed(fact_id: str, provider: str, http_status: int) -> dict:
    p = _ph()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(
            f"UPDATE hitl_decisions SET status='TRANSMISSION_FAILED', provider={p}, http_status={p} WHERE fact_id={p}",
            (provider, http_status, fact_id))
        # Bug corrige 2026-08-19 (meme categorie que decide()/retract() : le
        # mirroir vers hitl_facts, source de verite pour list_facts(), manquait
        # ici aussi -> un echec de transmission restait invisible, l'article
        # affichait toujours son ancien statut "Approuve" comme si de rien
        # n'etait, sans aucun signal qu'il fallait reessayer.
        cur.execute(f"UPDATE hitl_facts SET status='TRANSMISSION_FAILED' WHERE fact_id={p} AND status <> 'TRASHED'",
                    (fact_id,))
        con.commit()
    finally:
        con.close()
    audit.log(None, "TRANSMIT_FAILED", f"fact={fact_id} provider={provider} http={http_status}",
              fact_id=fact_id, action="ECHEC", editor="system")
    return {"ok": True, "fact_id": fact_id, "status": "TRANSMISSION_FAILED"}


def retract(fact_id: str, by: str) -> dict:
    cur = get(fact_id)
    if not cur:
        return {"error": "introuvable"}
    # Bug corrige 2026-08-20 : le bouton "Annuler la decision" s'affiche
    # aussi pour status === "EDITED" (voir app.js) mais ce garde-fou l'excluait
    # -- meme classe de bug que le trou dans _ALLOWED ci-dessus.
    #
    # "TRANSMITTED" RETIRÉ des états autorisés (2026-08-23, demande explicite
    # du client, remontée par son propre client final : "lorsqu'un article
    # est déjà publié ou transféré vers WordPress ... ça ne doit plus être
    # possible [de le réapprouver]"). Root cause identifiée : retract()
    # ramenait un fait TRANSMITTED à PENDING_REVIEW en base KORA SANS RIEN
    # TOUCHER côté WordPress -- le post réel restait en ligne (brouillon ou
    # publié), mais le dashboard affichait de nouveau "En attente" avec le
    # bouton "Approuver & transmettre" actif. Ré-approuver à ce moment-là
    # créait un SECOND post WordPress dupliqué (aucune déduplication côté
    # WordPress, contrairement à l'entrepôt Postgres/Supabase qui dédupe sur
    # source_url) -- exactement le symptôme rapporté. Une fois un article
    # RÉELLEMENT transmis, KORA ne propose plus AUCUN chemin de retour vers
    # un état "à décider" : le dashboard devient une trace historique
    # fidèle de ce qui a été envoyé. Pour corriger un envoi fait par erreur,
    # l'action se fait directement sur WordPress (dépublier/supprimer le
    # post), jamais depuis KORA qui n'a de toute façon aucune vue sur l'état
    # réel du post une fois transmis.
    if cur["status"] not in ("APPROVED", "EDITED"):
        return {"error": "retrait_non_autorise_depuis", "status": cur["status"]}
    now = datetime.now(TZ).isoformat(timespec="seconds")
    p = _ph()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(
            f"UPDATE hitl_decisions SET status='RETRACTED', override_by={p}, override_at={p} WHERE fact_id={p}",
            (by, now, fact_id))
        # Bug corrige 2026-08-19 (rapporte en prod : "Annuler la decision"
        # semblait fonctionner mais rien ne changeait vraiment) : cette fonction
        # ne touchait QUE hitl_decisions, jamais hitl_facts.status -- la source
        # de verite lue par list_facts(). L'article restait donc affiche avec
        # son statut APPROVED/TRANSMITTED d'origine. hitl_decisions.status
        # reste volontairement 'RETRACTED' (tracabilite, meme convention que
        # REJECTED dans decide()) ; c'est hitl_facts qui doit refleter l'etat
        # reellement visible : de retour en attente de validation normale.
        cur.execute(f"UPDATE hitl_facts SET status='PENDING_REVIEW' WHERE fact_id={p} AND status <> 'TRASHED'",
                    (fact_id,))
        con.commit()
    finally:
        con.close()
    audit.log(None, "RETRACT", f"fact={fact_id} by={by}", fact_id=fact_id,
              action="MODIFIE", editor=by)
    return {"ok": True, "fact_id": fact_id, "status": "RETRACTED", "by": by}


# ---------------------------------------------------------------------------
# Corbeille (restauration 11 jours) + suppression définitive (RGPD)
# ---------------------------------------------------------------------------
TRASH_RETENTION_DAYS = 11


def _fact_rows(where: str, params: tuple) -> list:
    p = _ph()
    con, mode = db.conn()
    try:
        cur = con.cursor()
        cur.execute(
            f"SELECT fact_id, champion, contexts, article, image, image_meta, gen_model, "
            f"n_sources, status, created_at, trashed_at FROM hitl_facts WHERE {where}",
            params)
        if mode == "sqlite":
            rows = cur.fetchall()
            out = []
            for r in rows:
                d = dict(r)
                out.append(d)
        else:
            rows = cur.fetchall()
            out = [dict(r) for r in rows]
    finally:
        con.close()
    # Normalise les champs JSON (champion/contexts/article/image_meta) comme list_facts()
    for d in out:
        try:
            d["champion"] = json.loads(d["champion"]) if d["champion"] else {}
        except Exception:
            d["champion"] = {}
        try:
            d["contexts"] = json.loads(d["contexts"]) if d["contexts"] else []
        except Exception:
            d["contexts"] = []
        try:
            a = d["article"]
            d["article"] = json.loads(a) if (a and a.startswith("{")) else a
        except Exception:
            pass
        try:
            d["image_meta"] = json.loads(d["image_meta"]) if d["image_meta"] else {}
        except Exception:
            d["image_meta"] = {}
    return out


def list_trashed() -> list:
    # Corbeille : on joint hitl_decisions pour marquer les articles REJETES
    # (statut TRASHED + decision HITL REJECTED) -> le frontend peut filtrer "Rejetés"
    # de facon coherente avec le dashboard (s.stats.rejected, certifie par le backend).
    p = _ph()
    con, mode = db.conn()
    try:
        cur = con.cursor()
        cur.execute(
            f"SELECT f.fact_id, f.champion, f.contexts, f.article, f.image, f.image_meta, "
            f"f.gen_model, f.n_sources, f.status, f.created_at, f.trashed_at, "
            f"d.status AS d_status, d.decision "
            f"FROM hitl_facts f LEFT JOIN hitl_decisions d ON d.fact_id = f.fact_id "
            f"WHERE f.status='TRASHED' ORDER BY f.trashed_at DESC NULLS LAST", ())
        if mode == "sqlite":
            rows = cur.fetchall()
            out = [dict(r) for r in rows]
        else:
            out = [dict(r) for r in cur.fetchall()]
        for d in out:
            try: d["champion"] = json.loads(d["champion"]) if d["champion"] else {}
            except Exception: d["champion"] = {}
            # Meme prevention que list_facts() : raw_content jamais affiche cote frontend.
            if isinstance(d["champion"], dict):
                d["champion"].pop("raw_content", None)
            try: d["contexts"] = json.loads(d["contexts"]) if d["contexts"] else []
            except Exception: d["contexts"] = []
            for c in d["contexts"]:
                if isinstance(c, dict):
                    c.pop("raw_content", None)
            try:
                a = d["article"]
                d["article"] = json.loads(a) if (a and a.startswith("{")) else a
            except Exception: pass
            try: d["image_meta"] = json.loads(d["image_meta"]) if d["image_meta"] else {}
            except Exception: d["image_meta"] = {}
            # Champ derive : article rejete (corbeille + decision REJECTED)
            d["rejected"] = (d.get("d_status") == "REJECTED" or d.get("decision") == "REJECTED")
        return out
    finally:
        con.close()


def trash_facts(ids: list) -> dict:
    ids = [str(i) for i in (ids or [])]
    if not ids:
        return {"ok": True, "trashed": 0}
    now = datetime.now(TZ).isoformat(timespec="seconds")
    p = _ph()
    ph = ",".join([p] * len(ids))
    con, _ = db.conn()
    try:
        cur = con.cursor()
        # 1) hitl_facts : statut TRASHED + timestamp
        cur.execute(
            f"UPDATE hitl_facts SET status='TRASHED', trashed_at={p} WHERE fact_id IN ({ph})",
            (now, *ids))
        n = cur.rowcount
        # 2) hitl_decisions : miroir du statut pour que list_facts() le voie (LEFT JOIN sur d_status)
        for fid in ids:
            cur.execute(
                f"""INSERT INTO hitl_decisions (fact_id, status, decision, edited_text, final_text, decided_by, decided_at)
                   VALUES ({p},{p},{p},{p},{p},{p},{p})
                   ON CONFLICT(fact_id) DO UPDATE SET
                     status=EXCLUDED.status, decision=EXCLUDED.decision, decided_by=EXCLUDED.decided_by, decided_at=EXCLUDED.decided_at""",
                (fid, "TRASHED", "TRASHED", "", "", "system", now))
        con.commit()
    finally:
        con.close()
    for fid in ids:
        audit.log(None, "TRASH", f"fact={fid}", fact_id=fid, action="CORBEILLE", editor="system")
    return {"ok": True, "trashed": n}


def restore_fact(fact_id: str) -> dict:
    p = _ph()
    now = datetime.now(TZ).isoformat(timespec="seconds")
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(
            f"UPDATE hitl_facts SET status='PENDING_REVIEW', trashed_at=NULL WHERE fact_id={p}",
            (fact_id,))
        # Miroir dans hitl_decisions pour cohérence list_facts()
        cur.execute(
            f"""INSERT INTO hitl_decisions (fact_id, status, decision, edited_text, final_text, decided_by, decided_at)
               VALUES ({p},{p},{p},{p},{p},{p},{p})
               ON CONFLICT(fact_id) DO UPDATE SET
                 status=EXCLUDED.status, decision=EXCLUDED.decision, decided_by=EXCLUDED.decided_by, decided_at=EXCLUDED.decided_at""",
            (fact_id, "PENDING_REVIEW", "PENDING_REVIEW", "", "", "system", now))
        con.commit()
    finally:
        con.close()
    audit.log(None, "RESTORE", f"fact={fact_id}", fact_id=fact_id, action="RESTAURE", editor="system")
    return {"ok": True, "fact_id": fact_id, "status": "PENDING_REVIEW"}


def delete_facts(ids: list) -> dict:
    """Suppression DÉFINITIVE (RGPD). Efface fait + décision + audit liée."""
    ids = [str(i) for i in (ids or [])]
    if not ids:
        return {"ok": True, "deleted": 0}
    p = _ph()
    ph = ",".join([p] * len(ids))
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(f"DELETE FROM hitl_facts WHERE fact_id IN ({ph})", tuple(ids))
        # Bug trouvé 2026-08-22 (suppression en masse d'articles défectueux) :
        # `n` était lu APRÈS la 2e requête -- cur.rowcount reflétait donc le
        # nombre de lignes hitl_decisions supprimées (souvent moins que le
        # nombre de faits, une décision n'existant pas toujours), jamais le
        # nombre RÉEL de faits supprimés. Capturé immédiatement après le
        # DELETE qui compte réellement.
        n = cur.rowcount
        cur.execute(f"DELETE FROM hitl_decisions WHERE fact_id IN ({ph})", tuple(ids))
        con.commit()
    finally:
        con.close()
    for fid in ids:
        try:
            audit.delete_events([fid])
        except Exception:
            pass
        audit.log(None, "DELETE_FACT", f"fact={fid}", fact_id=fid, action="SUPPRIME", editor="system")
    return {"ok": True, "deleted": n}


def purge_trashed(days: int = TRASH_RETENTION_DAYS) -> int:
    """Suppression définitive automatique des éléments corbeille > days jours."""
    from datetime import timedelta
    cutoff = (datetime.now(TZ) - timedelta(days=days)).isoformat(timespec="seconds")
    p = _ph()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(
            f"SELECT fact_id FROM hitl_facts WHERE status='TRASHED' AND trashed_at IS NOT NULL AND trashed_at < {p}",
            (cutoff,))
        ids = [r[0] for r in cur.fetchall()]
    finally:
        con.close()
    if ids:
        delete_facts(ids)
        audit.log(None, "PURGE_TRASH", f"{len(ids)} element(s) corbeille > {days}j supprime(s)",
                  action="PURGE", editor="system")
    return len(ids)


def count_published() -> int:
    """Compte les articles RÉELLEMENT publiés (table `articles`, status='published').
    Sert à réconcilier le compteur 'Publiés' du dashboard avec la réalité.
    Comparaison via lower(status) : l'agent écrit 'PENDING_REVIEW' (majuscules)
    tandis que le passage à 'published' est fait par le pipeline WordPress, dont
    la casse n'est pas garantie -> on normalise pour ne pas rater de publiés."""
    _init()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute("SELECT count(*) FROM articles WHERE lower(status) = 'published'")
        row = cur.fetchone()
        if row is None:
            return 0
        # sqlite -> sqlite3.Row (indexable) ; psycopg (RealDictCursor) -> dict
        val = list(row.values())[0] if isinstance(row, dict) else row[0]
        return int(val or 0)
    finally:
        con.close()


def count_rejected() -> int:
    """Compte les articles REJETÉS (source unique de vérité du dashboard).
    Un article rejeté = soit status REJECTED (rejet direct), soit en corbeille
    (TRASHED) avec une decision HITL REJECTED. Les deux comptent comme 'rejetes'."""
    _init()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(
            "SELECT count(*) FROM hitl_facts f "
            "LEFT JOIN hitl_decisions d ON d.fact_id = f.fact_id "
            "WHERE f.status = 'REJECTED' "
            "   OR (f.status = 'TRASHED' AND d.status = 'REJECTED')")
        row = cur.fetchone()
        if row is None:
            return 0
        val = list(row.values())[0] if isinstance(row, dict) else row[0]
        return int(val or 0)
    finally:
        con.close()


def count_deleted() -> int:
    """Compte les articles DÉFINITIVEMENT SUPPRIMÉS (poubelle vidée / purge).
    Source : journal d'audit (action SUPPRIME ou PURGE).
    Délègue à audit.count_deleted() (2026-08-20, bug corrigé : cette fonction
    interrogeait auparavant une table 'audit_events' Postgres homonyme mais
    JAMAIS alimentée par le vrai journal -- gelée depuis une ancienne
    migration -- voir audit.count_deleted() pour le détail)."""
    return audit.count_deleted()


def get_dashboard_stats() -> dict:
    """SOURCE UNIQUE DE VÉRITÉ (SSOT) pour tous les compteurs du dashboard.
    Calcule EN UNE SEULE requête SQL agrégée tous les états du cycle de vie,
    pour garantir que le tableau de bord, la sidebar et la base sont cohérents.
    Remplace les recalculs divergents cotes front (cat.pending, s.trash, etc.)

    Invariant garanti (2026-08-19, bug corrigé — "Tous 86" mais somme des
    filtres = 89) : pending + transmitted + rejected + drafts + trash ==
    total_facts, TOUJOURS, par CONSTRUCTION (pending est calculé comme le
    reste, pas comme une requête séparée qui peut diverger). 'pending'
    absorbe tout le reste (catch-all, résiste à un nouveau statut HITL
    qu'on oublierait d'ajouter ici demain).

    Répartition trash/rejected (révisée 2026-08-22, demande explicite) : un
    article TRASHED dont la décision HITL est REJECTED compte désormais
    dans 'trash' (PAS dans 'rejected') -- cohérent avec le bouton qui l'y a
    envoyé ("Rejeter -> Mettre à la corbeille"), et il apparaît bien sur la
    page Corbeille (voir viewTrash(), app.js, dont le filtre d'exclusion a
    été retiré le même jour). 'rejected' ne compte donc que les faits au
    statut REJECTED direct (jamais produit par decide() aujourd'hui, qui
    convertit toujours REJECTED en TRASHED -- ce compteur reste à 0 en
    pratique, résultat voulu). Précédente règle (19/08, inverse : trash
    excluait les TRASHED+REJECTED) abandonnée le 22/08 : elle rendait le
    bouton "Mettre à la corbeille" trompeur, l'article n'apparaissant
    alors NULLE PART dans l'interface Corbeille malgré son statut."""
    _init()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        # 1) Compteurs par statut de hitl_facts (source de vérité des articles)
        cur.execute(
            "SELECT status, count(*) FROM hitl_facts GROUP BY status")
        by_status = {}
        for row in cur.fetchall():
            if isinstance(row, dict):
                key = row.get("status")
                cnt = int(row.get("count") or 0)
            else:
                key = row[0]
                cnt = int(row[1] or 0)
            by_status[key] = cnt
        total_facts = sum(by_status.values())
        edited = by_status.get("EDITED", 0)
        # "Transmis" couvre TRANSMITTED et APPROVED (même catégorie côté front,
        # voir factCategory() dans app.js).
        transmitted = by_status.get("TRANSMITTED", 0) + by_status.get("APPROVED", 0)
        trashed_total = by_status.get("TRASHED", 0)
        rejected_status = by_status.get("REJECTED", 0)
        # 2) Corbeille = TOUT le TRASHED, sans exception (2026-08-22, demande
        # explicite) -- y compris un article rejeté via "Rejeter -> Mettre à
        # la corbeille" (decide(..., "REJECTED") le passe en status=TRASHED,
        # voir decide() plus haut). Avant ce correctif, CET article ne
        # comptait QUE dans "Rejetés" et n'apparaissait même pas sur la page
        # Corbeille (viewTrash() le filtrait) -- contradiction avec le
        # libellé du bouton qui l'y avait envoyé.
        trash = trashed_total
        # 3) Rejetés EXCLUSIF de Corbeille désormais : ne compte que les
        # faits au statut REJECTED direct (jamais utilisé par decide(), qui
        # convertit toujours REJECTED en TRASHED -- voir plus haut) -- reste
        # correct si un futur chemin de code introduit un statut REJECTED
        # non trashé. En pratique, ce compteur peut donc rester à 0 : c'est
        # le comportement voulu, pas un bug (voir count_rejected() pour la
        # définition historique, désormais utilisée uniquement là où un
        # besoin explicite de "rejeté, trashé ou non" persiste).
        rejected = rejected_status
        # 4) Pending = TOUT LE RESTE (PENDING_REVIEW + TRANSMISSION_FAILED +
        # RETRACTED + tout statut futur non explicitement traité ci-dessus).
        # Calculé par SOUSTRACTION plutôt que par une requête dédiée : garantit
        # que la somme des 5 catégories == total_facts par construction, quel
        # que soit l'état du cycle de vie ajouté un jour sans mettre à jour
        # cette fonction — l'invariant ne peut plus se briser silencieusement.
        pending = total_facts - transmitted - rejected - edited - trash
        # 5) Articles reellement en circulation (hors corbeille/rejetes) - Option C
        in_circulation = pending + transmitted + edited
        # 6) Publies (table articles)
        cur.execute("SELECT count(*) FROM articles WHERE lower(status) = 'published'")
        row = cur.fetchone()
        published = int((list(row.values())[0] if isinstance(row, dict) else row[0]) or 0)
        # 7) Supprimes (audit) -- delegue a audit.count_deleted() (2026-08-20,
        # bug corrige : cette requete directe visait la table 'audit_events'
        # Postgres, jamais alimentee par le vrai journal, voir audit.py)
        deleted = audit.count_deleted()
        return {
            # total_facts = "Articles" partout dans l'UI (sidebar, dashboard, filtre
            # "Tous" de la page Articles) : c'est la SEULE definition dont la somme
            # des 6 filtres (pending+transmitted+rejected+drafts+trash) egale
            # TOUJOURS le total affiche, par construction (voir invariant plus haut).
            # Ne PAS utiliser un total qui exclut une des 6 categories ici : ca
            # recree exactement le bug "Tous X mais somme des filtres = Y" deja
            # corrige une fois (2026-08-19) et qui a resurgi le 2026-08-19 sous
            # une autre forme (sidebar/dashboard affichant 80 quand "Tous" = 89).
            "total_facts": total_facts,
            "articles": in_circulation,        # sous-total "en circulation" (hors corbeille ET rejetes) -- usage ponctuel seulement, PAS pour le badge "Articles"
            "pending": pending,               # a decider (+ etats residuels)
            "transmitted": transmitted,       # publies/transmis (+ approuves)
            "drafts": edited,                 # brouillons
            "trash": trash,                   # corbeille (TRASHED, hors rejetes)
            "rejected_status": rejected_status,  # facts au statut REJECTED (rare)
            "rejected": rejected,             # rejetes (statut REJECTED + corbeille rejetee)
            "published": published,           # articles publies
            "deleted": deleted,               # definitivement supprimes
        }
    finally:
        con.close()

def cleanup_orphan_decisions() -> int:
    """Supprime les décisions HITL orphelines (fact_id absent de hitl_facts).
    Évite les stats fantômes dans le journal de décision."""
    _init()
    con, _ = db.conn()
    try:
        cur = con.cursor()
        cur.execute(
            "DELETE FROM hitl_decisions "
            "WHERE fact_id NOT IN (SELECT fact_id FROM hitl_facts)")
        n = cur.rowcount
        con.commit()
        return int(n or 0)
    finally:
        con.close()

