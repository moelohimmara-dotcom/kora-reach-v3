"""reach_agent.py — orchestrateur (cerveau Reach), reconçu selon CDC KORA V3.

Cycle on-demand (mutex) :
  whitelist versionnee -> collecte (redirections bloquees) -> normalisation
  (fenetre glissante 24h, anomalie date) -> filtre Guinee INTL -> dedup ->
  regroupement en dossiers (Jaccard 0.5) -> article_retenu -> writer LLM -> audit -> rapport.
Toute defaillance source/LLM = isolee (jamais crash global).
"""
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
import re
import threading
import core.config as config
import collection.whitelist as wl
from collection.fetchers import fetch_source
from collection.normalizer import normalize, TZ, _parse_date
from collection.guinea_filter import filter_guinea
from collection.dedup import url_hash, is_dup
from collection.dossiers import regrouper_dossiers, pick_article_retenu, score_item
from editorial.state_store import (seen, mark, new_cycle, end_cycle, init as _init_state,
                          get_avg_article_seconds, record_article_seconds)
from generation.writer import write_article, llm_circuit_status, angle_directive, simple_completion

# Flag d'annulation de cycle (bouton « Interrompre » côté UI)
CANCEL_FLAG = {"requested": False}

def cancel_cycle():
    """Demande l'interruption du cycle en cours (arrêt propre après l'article en cours)."""
    CANCEL_FLAG["requested"] = True

# Progression du cycle en cours (lue par /api/last -> loader plein écran
# "Article X sur Y"). Un seul cycle actif à la fois (mutex fichier), un seul
# writer -> pas besoin de lock, simple dict remplacé/lu par polling HTTP.
# eta_seconds/avg_sec_per_article (2026-08-19, demande explicite : estimation
# de temps annoncée dès le lancement) : recalculés à chaque article terminé,
# voir _update_progress_eta() plus bas.
CYCLE_PROGRESS = {"cycle_id": None, "current": 0, "total": 0,
                   "eta_seconds": None, "avg_sec_per_article": None}
_CYCLE_ELAPSED = {"start_ts": None, "done": 0}
# Génération d'articles PARALLELE (2026-08-20) : plusieurs threads écrivent
# CYCLE_PROGRESS/_CYCLE_ELAPSED en même temps -> l'ancienne hypothèse "un seul
# writer, pas besoin de lock" (voir commentaire ci-dessus) ne tient plus.
_PROGRESS_LOCK = threading.Lock()

def get_progress() -> dict:
    """Copie de l'état de progression du cycle en cours (0/0 si aucun)."""
    return dict(CYCLE_PROGRESS)

def _reset_progress(cid=None, total=0):
    CYCLE_PROGRESS["cycle_id"] = cid
    CYCLE_PROGRESS["current"] = 0
    CYCLE_PROGRESS["total"] = total
    CYCLE_PROGRESS["eta_seconds"] = None
    CYCLE_PROGRESS["avg_sec_per_article"] = None
    _CYCLE_ELAPSED["start_ts"] = datetime.now(TZ).timestamp() if total else None
    _CYCLE_ELAPSED["done"] = 0

def _update_progress_eta():
    """Rafraîchit l'estimation de temps restant après chaque article terminé.
    Utilise le rythme RÉEL de CE cycle dès qu'au moins 1 article est fini
    (plus fiable : reflète l'état actuel des fournisseurs LLM) ; avant ça,
    se rabat sur la moyenne historique persistée (déjà utile dès l'article 1,
    voir get_avg_article_seconds()).

    Bug corrige 2026-08-20 (rapporte : ETA affichait "46 min" des l'article 1
    alors que le cycle tournait bien a 3 articles en parallele) : la branche
    done>0 est deja correcte SANS changement -- elapsed/done est un debit
    OBSERVE (naturellement plus rapide si plusieurs articles avancent en
    meme temps, peu importe le mecanisme). Seule la branche de repli AVANT
    le 1er article termine etait fausse : get_avg_article_seconds() est une
    latence LLM PAR ARTICLE (mesuree seule, avant la parallelisation), et la
    multiplier directement par le nombre d'articles restants ignore que
    plusieurs tournent en meme temps -> ETA ~3x trop pessimiste. Diviser par
    cycle_concurrency corrige l'estimation initiale (avant qu'un rythme reel
    de CE cycle soit disponible)."""
    done = _CYCLE_ELAPSED["done"]
    total = CYCLE_PROGRESS["total"]
    remaining = max(total - done, 0)
    concurrency = max(1, int(config.LIMITS.get("cycle_concurrency", 1)))
    if done > 0 and _CYCLE_ELAPSED["start_ts"]:
        elapsed = datetime.now(TZ).timestamp() - _CYCLE_ELAPSED["start_ts"]
        pace = elapsed / done
        eta_seconds = round(pace * remaining)
    else:
        pace = get_avg_article_seconds()
        eta_seconds = round((pace * remaining) / concurrency)
    CYCLE_PROGRESS["avg_sec_per_article"] = round(pace)
    CYCLE_PROGRESS["eta_seconds"] = eta_seconds

def estimate_launch_message() -> dict:
    """Estimation IMMÉDIATE renvoyée dans la réponse de POST /api/cycle
    (2026-08-19, demande explicite : prévenir l'utilisateur du temps
    approximatif dès le lancement, avant même de connaître le nombre
    d'articles -- connu seulement après la collecte, ~15-30s). Se base sur
    la moyenne mobile persistée (voir state_store) + l'état du disjoncteur
    LLM pour prévenir explicitement d'un ralentissement probable."""
    avg = get_avg_article_seconds()
    cb = llm_circuit_status()
    degraded = cb.get("failures", 0) >= 1 and not cb.get("open_until")
    per_article_min = avg / 60.0
    if per_article_min < 1.5:
        rough = "moins de 2 min par article"
    elif per_article_min < 3:
        rough = "environ 2 à 3 min par article"
    elif per_article_min < 5:
        rough = "environ 3 à 5 min par article"
    else:
        rough = f"environ {round(per_article_min)} min par article"
    note = (f"Estimation : {rough}. Le nombre d'articles sera connu après la "
            f"collecte (~15-30s), l'estimation totale s'affinera ensuite en direct.")
    if degraded:
        note += " Un fournisseur IA montre des signes de ralentissement en ce moment : la génération pourrait être plus lente que d'habitude."
    return {"avg_sec_per_article": round(avg), "note": note, "degraded": degraded}

from editorial.hitl_store import fact_id_of, cleanup_orphan_decisions, get_fact, upsert_fact
from editorial.audit import log
from generation.illustrate import illustrate, illustrate_all

# Dispatcher sources alternatives (gnews/sitemap/gdelt/wayback) — defini dans alt_sources
from collection.alt_sources import alt_fetch

import os
import json
import atexit

# Lock fichier cross-process pour /api/cycle (fonctionne sur multi-worker).
# Le mutex precedent etait en memoire (instance unique) -> ne protegeait pas
# si le serveur tourne en multi-process (gunicorn/uvicorn workers) ou si un
# second process se lance. Ici on utilise un fichier verrou avec PID+timestamp.
#
# Emplacement (2026-08-19, diagnostic P1 §6) : etait en dur sur /tmp, qui sur
# ce VPS n'est PAS inscriptible par l'utilisateur kora (permissions 755, uid
# different) — seul le PrivateTmp=true du service systemd (mount /tmp prive et
# isole) rendait ca fonctionnel, sans que ce soit documente ni garanti hors de
# ce contexte precis (debug manuel, script one-off, tests). On utilise desormais
# un repertoire sous le code de l'app (garanti inscriptible : c'est le seul
# chemin autorise en ecriture par ReadWritePaths dans le durcissement systemd),
# override possible via KORA_CYCLE_LOCK_PATH pour un deploiement different.
# Racine du repo, pas le dossier de ce fichier (2026-08-20, refactor
# monolithe modulaire : reach_agent.py vit desormais dans orchestration/) --
# sans consequence fonctionnelle (ReadWritePaths=/opt/kora-reach couvre tout
# l'arbre, y compris les sous-dossiers), mais garde l'emplacement previsible
# et coherent avec les autres fichiers d'etat (reach_state.db etc.).
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_CYCLE_LOCK_PATH = os.environ.get(
    "KORA_CYCLE_LOCK_PATH",
    os.path.join(_REPO_ROOT, ".kora_cycle.lock"),
)
# Bug corrige 2026-08-19 (incident prod : 2 cycles concurrents sur le meme
# process, faits generes en double) : 300s (5 min) etait bien trop court
# face a un cycle reel de plusieurs articles (chaque article passe par 2-3
# appels LLM sequentiels -- generation, extension si besoin, relecture --
# largement de quoi depasser 5 min a 3-5 articles, et jusqu'a
# daily_article_limit=10 dans le pire cas). Une fois le TTL depasse alors
# que le cycle tournait TOUJOURS reellement, /api/health rapportait a tort
# "libre", ce qui permettait a un nouveau /api/cycle de "voler" le verrou
# (voir le vrai bug de race ci-dessous) pendant que le premier tournait
# encore. 3600s (1h) couvre large ; le bouton root "Forcer la liberation du
# mutex" reste l'echappatoire manuelle si un cycle plante vraiment.
_MUTEX_TTL_SEC = 3600

# Bug corrige 2026-08-19 (meme incident) : le serveur est un seul PROCESS
# multi-THREADS (pas multi-process) -- la source du bug n'etait donc pas
# une vraie race inter-process mais une race INTRA-process, plus subtile :
# _acquire_cycle_lock() creait le fichier vide (O_CREAT|O_EXCL) PUIS
# ecrivait son contenu (pid/ts) en 2 etapes distinctes. Un 2e thread
# arrivant EXACTEMENT entre les deux lisait un fichier VIDE, le prenait
# pour un lock corrompu, le supprimait, et recreait le sien -- pendant que
# le 1er thread finissait d'ecrire dans son propre fd, dorénavant orphelin
# (fichier deplace sous ses pieds). Resultat observe : 2 lignes "cycles"
# RUNNING creees a 24ms d'intervalle, 2 cycles reels tournant en parallele,
# partageant (et se marchant dessus) le meme CYCLE_PROGRESS global.
# Ce verrou en memoire (100% atomique, aucune fenetre de race possible en
# Python) ferme cette fenetre pour de bon : SEULE l'ecriture du fichier
# reste utile pour la resilience inter-process/redemarrage, plus pour
# l'exclusion elle-meme (assuree ici, avant meme de toucher au fichier).
_CYCLE_THREAD_GATE = threading.Lock()


def _pid_alive(pid):
    """True si le PID existe toujours (process en vie). Cross-platform via /proc."""
    if pid is None:
        return False
    try:
        os.kill(pid, 0)  # ne tue pas, teste juste l'existence
    except ProcessLookupError:
        return False
    except PermissionError:
        return True  # existe mais pas nos droits -> on considère vivant
    return True


def _try_file_lock():
    """Tente d'acquerir le verrou FICHIER (utile inter-process/redemarrage —
    le verrou en memoire ci-dessus couvre deja l'exclusion intra-process).

    Ecriture ATOMIQUE : contenu (pid/ts) ecrit d'abord dans un fichier
    temporaire prive, puis publie au chemin final via os.link() (echoue avec
    FileExistsError si deja pris, comme O_EXCL, mais SANS jamais laisser un
    lecteur concurrent observer un fichier vide/partiel -- c'est cette
    fenetre-la, entre la creation vide et l'ecriture du contenu, qui causait
    la race du 2026-08-19 : un fichier vide etait lu comme "corrompu",
    supprime, et recree par un 2e thread pendant que le 1er finissait
    d'ecrire dans un fd desormais orphelin).
    """
    payload = json.dumps({"pid": os.getpid(), "ts": datetime.now(TZ).timestamp()}).encode()
    tmp_path = f"{_CYCLE_LOCK_PATH}.{os.getpid()}.{threading.get_ident()}.tmp"
    try:
        with open(tmp_path, "wb") as f:
            f.write(payload)
        try:
            os.link(tmp_path, _CYCLE_LOCK_PATH)
        except FileExistsError:
            # Deja pris par quelqu'un d'autre -> verifier validite (PID mort/TTL depasse)
            try:
                with open(_CYCLE_LOCK_PATH, "r") as f:
                    data = json.load(f)
                pid = data.get("pid")
                ts = data.get("ts", 0)
                if not _pid_alive(pid) or (datetime.now(TZ).timestamp() - ts) >= _MUTEX_TTL_SEC:
                    try:
                        os.remove(_CYCLE_LOCK_PATH)
                    except OSError:
                        pass
                    return _try_file_lock()
            except (json.JSONDecodeError, OSError):
                try:
                    os.remove(_CYCLE_LOCK_PATH)
                except OSError:
                    pass
                return _try_file_lock()
            return False  # Lock valide et non perime -> refus
        except PermissionError as e:
            print(f"[CYCLE_LOCK_PERMISSION_ERROR] impossible d'ecrire {_CYCLE_LOCK_PATH}: {e}")
            return False
        except OSError as e:
            print(f"[CYCLE_LOCK_ERROR] {_CYCLE_LOCK_PATH}: {e}")
            return False
        return True
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass


def _acquire_cycle_lock():
    """Verrou combine : d'abord le verrou en memoire (exclusion intra-process,
    instantanee et sans aucune fenetre de race possible), puis le verrou
    fichier (exclusion inter-process/redemarrage). Retourne True si acquis
    dans son ensemble, False sinon -- dans ce cas le verrou memoire, s'il
    avait ete pris, est relache immediatement (rien a nettoyer côté fichier)."""
    if not _CYCLE_THREAD_GATE.acquire(blocking=False):
        return False
    ok = _try_file_lock()
    if not ok:
        _CYCLE_THREAD_GATE.release()
    return ok


def _release_cycle_lock():
    """Libere le lock fichier uniquement si on en est le proprietaire, PUIS le
    verrou memoire (dans cet ordre : tant que le fichier existe encore, un
    autre process/thread doit continuer a le voir comme occupe)."""
    try:
        with open(_CYCLE_LOCK_PATH, "r") as f:
            data = json.load(f)
        if data.get("pid") == os.getpid():
            os.remove(_CYCLE_LOCK_PATH)
    except (OSError, json.JSONDecodeError):
        pass
    if _CYCLE_THREAD_GATE.locked():
        _CYCLE_THREAD_GATE.release()


def force_release_cycle_lock():
    """Libère le verrou de cycle (fichier + mémoire) SANS vérifier le PID
    propriétaire (wireframe 12.5 — action critique console root).
    _release_cycle_lock() refuse volontairement de toucher au lock d'un
    autre process ; celle-ci est l'échappatoire manuelle explicite pour un
    cycle bloqué au-delà du TTL (1h) qu'on ne veut pas attendre. Retourne
    True si un lock (fichier et/ou mémoire) a été effectivement supprimé,
    False s'il n'y en avait pas."""
    file_released = False
    try:
        os.remove(_CYCLE_LOCK_PATH)
        file_released = True
    except OSError:
        pass
    mem_released = False
    if _CYCLE_THREAD_GATE.locked():
        _CYCLE_THREAD_GATE.release()
        mem_released = True
    return file_released or mem_released


def _is_cycle_locked():
    """Lecture seule pour l'API : True si lock valide (PID vivant + TTL)."""
    try:
        with open(_CYCLE_LOCK_PATH, "r") as f:
            data = json.load(f)
        pid = data.get("pid")
        ts = data.get("ts", 0)
        if not _pid_alive(pid):
            return False
        return (datetime.now(TZ).timestamp() - ts) < _MUTEX_TTL_SEC
    except (OSError, json.JSONDecodeError):
        return False


# ---------------------------------------------------------------------------
# FUSION SEMANTIQUE DES DOSSIERS (2026-08-26) -- voir appel dans le cycle
# principal ci-dessous pour le contexte complet. Reste ICI (orchestration),
# jamais dans collection/dossiers.py qui est explicitement "sans LLM" par
# conception (docstring du module).
#
# CHOIX D'IMPLEMENTATION (revu apres un premier essai infructueux) : une
# premiere version comparait les dossiers PAR PAIRES, en ne soumettant a
# l'arbitrage LLM que les paires partageant deja au moins une entite nommee
# (heuristique de pre-filtrage bon marche). Teste en conditions reelles sur
# deux formulations tres differentes du meme eboulement de Dar-es-Salam SANS
# aucun nom propre partage (l'un citait "Conakry", l'autre "Dar-es-Salam",
# zero intersection) : la paire n'etait JAMAIS soumise au LLM, donc jamais
# fusionnee -- exactement le cas d'usage demande ("peu importe la subtilite
# la plus ingenieuse") passait au travers du garde-fou cense le couvrir. Un
# filtre par recouvrement lexical brut souffre du meme defaut (deux
# reformulations d'un meme fait peuvent ne partager quasiment aucun mot).
#
# Solution retenue : UN SEUL appel LLM par cycle, qui voit la liste ENTIERE
# des dossiers numerotes et identifie lui-meme les groupes decrivant le meme
# fait -- le modele juge sur le SENS, pas sur un filtre lexical en amont qui
# pourrait exclure a tort le cas precisement vise. Cout : 1 appel (pas O(n^2))
# quel que soit le nombre de dossiers, borne par _SEMANTIC_BATCH_CAP pour
# eviter un prompt demesure sur un cycle exceptionnellement charge.
# ---------------------------------------------------------------------------
_SEMANTIC_BATCH_CAP = 60  # au-dela, les dossiers excedentaires ne sont pas
                          # soumis a cette passe (regroupement lexical seul) --
                          # protege la latence du cycle sur un jour tres chargé.

_SEMANTIC_GROUP_SYSTEM = (
    "Tu es analyste de presse tres rigoureux. On te donne une liste numerotee "
    "de resumes d'actualite collectes INDEPENDAMMENT lors du meme cycle de "
    "collecte -- certains peuvent decrire EXACTEMENT le meme evenement/fait "
    "reel precis, meme avec des mots, un angle, un niveau de detail ou une "
    "langue tres differents (c'est precisement ce que tu dois detecter, pas "
    "seulement des textes qui se ressemblent lexicalement). Identifie "
    "UNIQUEMENT les groupes de numeros qui parlent du MEME fait precis -- "
    "PAS seulement le meme theme general, le meme lieu, ou la meme categorie "
    "d'actualite (ex: deux faits divers differents survenus tous les deux a "
    "Conakry ne sont PAS le meme fait). En cas de doute reel, NE les groupe "
    "PAS (une fusion a tort est pire qu'une non-fusion : elle ferait "
    "disparaitre un fait distinct de l'actualite du jour).\n\n"
    "Reponds STRICTEMENT selon ce format, une ligne par groupe trouve "
    "(numeros separes par des virgules, au moins 2 numeros par ligne, "
    "AUCUN autre texte) :\nGROUPE: n1,n2\n\nSi aucun groupe n'existe, reponds "
    "UNIQUEMENT : AUCUN"
)

_GROUPE_LINE_RE = re.compile(r"groupe\s*:\s*([\d,\s]+)", re.IGNORECASE)


def _llm_find_semantic_groups(dossiers: list) -> list:
    """Un seul appel LLM : renvoie une liste de groupes (listes d'indices)
    de dossiers jugés décrire le même fait réel. Liste vide si aucun groupe,
    si l'appel échoue, ou si aucune clé LLM n'est configurée (repli
    silencieux -- cette passe est un raffinement, jamais un point de
    blocage du cycle)."""
    batch = dossiers[:_SEMANTIC_BATCH_CAP]
    lines = []
    for idx, d in enumerate(batch):
        it = d[0]
        excerpt = (it.get("title", "") + " -- " + it.get("raw_content", "")[:220]).replace("\n", " ")
        lines.append(f"{idx}. {excerpt[:300]}")
    if len(lines) < 2:
        return []
    user = "\n".join(lines)
    try:
        out = simple_completion(_SEMANTIC_GROUP_SYSTEM, user, max_tokens=400)
    except Exception:
        return []
    if not out or out.strip().upper().startswith("AUCUN"):
        return []
    groups = []
    for m in _GROUPE_LINE_RE.finditer(out):
        nums = sorted({int(n) for n in re.findall(r"\d+", m.group(1)) if int(n) < len(batch)})
        if len(nums) >= 2:
            groups.append(nums)
    return groups


def merge_semantic_duplicates(dossiers: list, cid: str = None) -> list:
    """Fusionne les dossiers qu'un arbitrage LLM (vue d'ensemble, un seul
    appel -- voir _llm_find_semantic_groups) juge décrire le même fait réel,
    même sans noms propres ni mots partagés -- comble la limite structurelle
    du Jaccard purement lexical de regrouper_dossiers (voir docstring
    collection/dossiers.py, "sans LLM" par conception). Repli SILENCIEUX
    (dossiers renvoyés inchangés) si aucun groupe détecté, aucune clé LLM
    configurée, ou en cas d'échec d'appel."""
    if len(dossiers) < 2:
        return dossiers
    groups = _llm_find_semantic_groups(dossiers)
    if not groups:
        return dossiers
    parent = list(range(len(dossiers)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for group in groups:
        for n in group[1:]:
            union(group[0], n)
        if cid:
            titles = [dossiers[n][0]["title"][:50] for n in group]
            log(cid, "SEMANTIC_MERGE", " + ".join(titles))
    merged = {}
    for idx, d in enumerate(dossiers):
        merged.setdefault(find(idx), []).extend(d)
    return list(merged.values())


class ReachAgent:
    def __init__(self):
        # Compat lecture API (desactive) : on delegue au lock fichier
        self._mutex = False
        self._mutex_at = None

    @property
    def is_busy(self):
        """Vrai si un cycle est en cours (lock fichier valide). Lecture propre pour l'API."""
        return _is_cycle_locked()

    def run(self, demand=None, scope_filter=None,
            initiator="editor", force=False):
        # Mutex cross-process avec TTL
        if not _acquire_cycle_lock():
            return {"error": "cycle_en_cours", "facts": []}
        # Securite : si le process crash sans finally, on libere au exit
        atexit.register(_release_cycle_lock)
        _init_state()  # (re)crée les tables si la DB a ete resetee
        # Purge des decisions orphelines (2026-08-19, deplace depuis /api/hitl,
        # ou elle tournait sur CHAQUE lecture -- charge inutile 30s/30s en
        # auto-refresh, contribuait aux ~25s de reponse mesures en prod). Un
        # rythme "une fois par cycle" (plusieurs fois/jour) suffit largement
        # pour ce nettoyage defensif d'un cas rare ; jamais bloquant si echec.
        try:
            cleanup_orphan_decisions()
        except Exception:
            pass
        cid = new_cycle()
        _reset_progress(cid=cid, total=0)
        cycle_start = datetime.now(TZ)
        log(cid, "CYCLE_START", f"initiator={initiator} scope={scope_filter} whitelist_v={wl.WHITELIST_VERSION}", action="CYCLE")
        try:
            items = []
            sources_ok = 0
            rejected_intl = 0
            anomalies = 0
            # Collecte PARALLELE des sources (evite le blocage sequentiel lent)
            from concurrent.futures import ThreadPoolExecutor, as_completed
            entries = [e for e in wl.active_entries()
                       if not scope_filter or e.category == scope_filter]

            def _collect(e):
                # Bug corrigé (2026-08-25, audit fiabilité collecte) :
                # fetch_html()/fetch_rss() peuvent désormais lever une
                # exception sur un vrai échec HTTP (403/404/5xx persistant,
                # voir fetchers.py) au lieu de toujours retourner [] en
                # silence. Avant de considérer cet échec définitif, on tente
                # quand même le repli sitemap ci-dessous (efficace contre
                # certains blocages type Cloudflare) -- primary_exc n'est
                # relevée que si le repli échoue LUI AUSSI, pour que
                # record_fetch_result(ok=False, ...) (voir plus bas, appelé
                # sur l'exception qui s'échappe de _collect) reflète la
                # vraie cause plutôt qu'un silence indiscernable d'une
                # source légitimement sans nouveauté.
                primary_exc = None
                if e.vector_primary in ("rss", "html"):
                    try:
                        raws, src = fetch_source(e), e
                    except Exception as _pe:
                        primary_exc = _pe
                        raws, src = [], e
                else:
                    raws, src = alt_fetch(e), e
                # Fallback sitemap si la collecte primaire est vide (sites derriere Cloudflare)
                # B5 fix : étendu à TOUTE source HTML/RSS vide, pas seulement vector_secondary="sitemap"
                if not raws and e.vector_primary in ("rss", "html"):
                    try:
                        raws = alt_fetch(e, primary="sitemap")
                        src = e
                    except Exception:
                        pass  # repli échoué aussi -> primary_exc (s'il existe) sera relevée ci-dessous
                if not raws and primary_exc:
                    raise primary_exc
                return raws, src

            with ThreadPoolExecutor(max_workers=8) as ex:
                futs = {ex.submit(_collect, e): e for e in entries}
                for fut in as_completed(futs):
                    # Suivi RÉEL du statut de collecte par source (2026-08-24,
                    # suggestion audit UX Sources) : un raws vide N'EST PAS un
                    # échec (une source peut légitimement n'avoir rien de
                    # nouveau) -- seule une exception ici est un vrai échec de
                    # collecte. futs[fut] donne la source même si fut.result()
                    # lève (e n'est pas encore lié dans ce cas).
                    src_for_status = futs[fut]
                    try:
                        raws, e = fut.result()
                    except Exception as fetch_exc:
                        try:
                            wl.record_fetch_result(src_for_status.id, ok=False, error=str(fetch_exc))
                        except Exception:
                            pass
                        continue
                    try:
                        wl.record_fetch_result(e.id, ok=True, n_items=len(raws))
                    except Exception:
                        pass
                    if raws:
                        sources_ok += 1
                    for r in raws:
                        n = normalize(r, e, cycle_start)
                        # Filtre de pertinence Guinée APPLIQUÉ À TOUTE SOURCE, GN_NAT
                        # comme INTL (2026-08-26, demande explicite et répétée de
                        # l'utilisateur -- incident réel confirmé : un article de
                        # "Guinée 360" (source GN_NAT, donc jusque-là EXEMPTÉE de ce
                        # filtre par hypothèse implicite "source guinéenne = forcément
                        # pertinente") portait en réalité sur la guerre Russie-Ukraine
                        # et l'aide de l'UE à l'Ukraine, sans aucun rapport avec la
                        # Guinée -- généré, transmis à la revue humaine sans aucun
                        # garde-fou. Une source guinéenne peut tout à fait publier de
                        # l'actualité internationale générale (fil d'agence, rubrique
                        # "Monde") qui n'a pas plus de pertinence Guinée qu'un article
                        # d'une source internationale non filtrée -- l'hypothèse qui
                        # exemptait le GN_NAT était donc fausse. e.guinee_filter (champ
                        # de configuration par source, voir core/config.py) n'est plus
                        # consulté ici : filter_guinea() (collection/guinea_filter.py,
                        # règle DEC-003 déjà éprouvée sur les sources INTL) s'applique
                        # désormais À TOUS les items, sans exception de source.
                        text_filter = (n["title"] + " " + n.get("summary", "")
                                       + " " + n["raw_content"])[:2500]
                        ok, motif = filter_guinea(text_filter, title=n["title"])
                        if not ok:
                            rejected_intl += 1
                            log(cid, "REJECT_INTL", f"{motif} | {n['title'][:60]} | source={e.name}", "")
                            continue
                        if n.get("date_status") in ("UNRELIABLE", "FUTURE", "OLD_YEAR"):
                            anomalies += 1
                            log(cid, "DATE_ANOMALY", f"{n['date_status']} | {n['url'][:80]}", "")
                        items.append(n)

            actual = [i for i in items if i.get("actual")]
            stale = [i for i in items if not i.get("actual")]
            # FENETRE STRICTE 24h — NEVER d'elargissement a 48h/72h EN USAGE
            # NORMAL (automatique). Un article n'est genere QUE si une source
            # a publie une info FRAICHE (< 24h). Sinon : on n'invente rien et
            # on l'informe.
            #
            # Bouton "Forcer (hors 24h)" (2026-08-19, activé sur demande
            # explicite — était accepté par l'API mais jamais lu ici, donc
            # sans aucun effet) : action MANUELLE et volontaire d'un compte
            # advanced+, bypass UNIQUEMENT la fenêtre glissante de 24h
            # (status "STALE") — jamais les anomalies FUTURE/UNRELIABLE
            # (dates absentes ou incohérentes -> qualité de donnée douteuse,
            # jamais publiable) ni OLD_YEAR (info d'une année révolue -> irait
            # à l'encontre de la règle de fraîcheur "actualité 2026" demandée
            # par ailleurs). Chaque fact issu de ce bypass est marqué
            # forced_stale=True (voir plus bas) pour rester visible/traçable
            # dans l'UI ("Hors fenêtre 48h").
            bypassable_stale = [i for i in items if i.get("date_status") == "STALE"] if force else []
            pool = actual + bypassable_stale
            log(cid, "COLLECT_DONE",
                f"items={len(items)} actual={len(actual)} force={force} bypassed_stale={len(bypassable_stale)} "
                f"rejected_intl={rejected_intl} anomalies={anomalies}")

            if not pool:
                # Aucune source n'a publie d'info fraiche dans les 24h.
                # Regle metier stricte : on ne genere PAS d'article perime, on
                # informe l'utilisateur de patienter (pas de contournement 48h/72h).
                if stale:
                    msg = (f"Aucune information fraiche n'a ete publiee par les sources dans les "
                           f"dernieres 24 heures ({len(stale)} info(s) collectee(s) datent de plus de "
                           f"24h — sources peu actives ou dates non fiables). Patientez et revenez "
                           f"plus tard pour de l'information en temps reel.")
                else:
                    msg = ("Aucune information fraiche n'a ete publiee par les sources dans les "
                           "dernieres 24 heures. Patientez et revenez plus tard pour de "
                           "l'information en temps reel.")
                end_cycle(cid, "EMPTY")
                _release_cycle_lock()
                _reset_progress()
                return {"status": "empty_or_stale", "message": msg,
                        "whitelist_version": wl.WHITELIST_VERSION,
                        "sources_ok": sources_ok, "total_items": len(items),
                        "rejected_intl": rejected_intl, "date_anomalies": anomalies,
                        "stale_count": len(stale), "facts": []}

            # Dedup memoire
            seen_urls, seen_titles = set(), []
            uniq = []
            skipped = 0
            for i in pool:
                uh = url_hash(i["url"])
                if seen(uh) or is_dup(i, seen_urls, seen_titles):
                    skipped += 1
                    continue
                seen_urls.add(uh); seen_titles.append(i["title"])
                uniq.append(i)

            if not uniq:
                # Le pool "frais" (<24h) n'est pas vide, mais TOUT a deja ete
                # traite lors d'un cycle precedent aujourd'hui (dedup inter-
                # cycles). Regle metier : on ne regenere JAMAIS un article deja
                # produit -> on informe l'utilisateur qu'il n'y a rien de NOUVEAU
                # pour l'instant, plutot que de forcer un article de secours
                # depuis un item deja publie.
                end_cycle(cid, "EMPTY")
                _release_cycle_lock()
                _reset_progress()
                msg = (f"Toutes les informations fraîches disponibles aujourd'hui ont déjà "
                       f"été traitées par Kora Agent ({skipped} info(s) déjà couverte(s) lors "
                       f"d'un cycle précédent). Revenez plus tard : Kora Agent vous préviendra "
                       f"dès qu'une nouvelle actualité sera publiée.")
                log(cid, "CYCLE_END", f"uniq_empty skipped={skipped}", action="CYCLE")
                return {"status": "empty_or_stale", "message": msg,
                        "whitelist_version": wl.WHITELIST_VERSION,
                        "sources_ok": sources_ok, "total_items": len(items),
                        "rejected_intl": rejected_intl, "date_anomalies": anomalies,
                        "skipped_dup": skipped, "facts": []}

            dossiers = regrouper_dossiers(uniq, config.LIMITS["dossier_sim_threshold"])

            # Garde-fou defensif : regrouper_dossiers() ne peut structurellement pas
            # renvoyer 0 dossier pour une liste uniq non vide (tout item non place
            # demarre son propre dossier) -> filet de securite pour ne jamais perdre
            # un item.
            if not dossiers and uniq:
                dossiers = [[it] for it in uniq]
                log(cid, "FALLBACK_SINGLETONS",
                    f"regroupement n'a produit aucun dossier -> {len(uniq)} dossiers singleton")

            # FUSION SEMANTIQUE (2026-08-26, demande explicite : "peu importe la
            # subtilite la plus ingenieuse possible, peu importe les differentes
            # manieres employees" -- jamais deux articles generes sur le meme
            # sujet). regrouper_dossiers() ci-dessus est VOLONTAIREMENT sans LLM
            # (voir docstring collection/dossiers.py) et ne fusionne que sur des
            # noms propres textuellement identiques -- deux sources qui racontent
            # le meme fait avec des mots/angles differents et sans nom propre
            # partage passent au travers PAR CONSTRUCTION. Cette passe comble ce
            # trou : un arbitrage LLM tranche uniquement les paires candidates
            # plausibles (au moins 1 entite commune, cf _candidate_semantic_pairs),
            # jamais O(n^2) sur tous les dossiers. Repli silencieux (dossiers
            # inchanges) si aucune cle LLM configuree ou en cas d'echec reseau --
            # jamais de blocage du cycle pour cette passe additionnelle.
            dossiers = merge_semantic_duplicates(dossiers, cid)

            # REGLE METIER (LOGIQUE-METIER-REACH.md §7, retablie 2026-08-19) :
            # Kora Agent genere TOUS les articles issus des faits FRAIS et
            # uniques collectes lors du cycle (un dossier = un fait = un
            # article), meme si cela prend du temps. N = min(demande explicite,
            # nb dossiers disponibles, garde-fou quotidien). Les dossiers les
            # plus pertinents (score de l'article_retenu) sont generes en premier, afin
            # qu'une interruption utilisateur laisse toujours les faits les plus
            # importants deja traites.
            # PRIORISATION PAR "BUZZ" (2026-08-26, demande explicite : "toujours
            # mettre en priorite les informations qui font le plus parler
            # d'elles"). Avant ce correctif, le tri ne dependait QUE du score
            # qualite/fraicheur du meilleur item du dossier (score_item), jamais
            # du nombre de sources distinctes qui convergent dessus (len(d),
            # deja calcule et stocke en aval sous n_sources mais jamais exploite
            # ici) -- un sujet couvert par 8 sources et un sujet couvert par 1
            # seule pouvaient etre generes dans le meme ordre si leur item le
            # plus riche avait un score_item proche. Le nombre de sources est
            # le signal le plus direct de "fait qui fait parler de lui" que ce
            # pipeline puisse mesurer (aucun acces a des donnees d'engagement
            # social) -- pondere pour dominer un ecart de score_item raisonnable
            # sans pour autant faire passer un dossier a 2 sources pauvres avant
            # un scoop a 1 source tres bien sourcee.
            dossiers.sort(key=lambda d: len(d) * 3.0 + max(score_item(i) for i in d), reverse=True)
            safety_cap = config.LIMITS.get("daily_article_limit", 10)
            limit = min(demand, len(dossiers), safety_cap) if demand else min(len(dossiers), safety_cap)
            _reset_progress(cid=cid, total=limit)
            _update_progress_eta()  # estimation initiale (moyenne historique) avant le 1er article

            # Generation PARALLELE des articles (2026-08-20, demande explicite :
            # reduire le temps TOTAL d'un cycle sans reduire la rigueur du
            # pipeline auto-critique par article, qui reste inchange -- voir
            # writer.py). Avant ce changement, chaque article (~400s, jusqu'a
            # 4 appels LLM sequentiels) attendait la fin du precedent : un
            # cycle de 10 articles pouvait depasser 1h. Chaque worker ne
            # touche AUCUN etat partage (pick_article_retenu/write_article sont
            # purs) -- toutes les mutations partagees (CYCLE_PROGRESS,
            # facts, dedup mark(), logs) restent faites par le thread
            # PRINCIPAL au fur et a mesure que les resultats arrivent
            # (as_completed), donc sans besoin de lock supplementaire.
            def _gen_one(dossier):
                if CANCEL_FLAG["requested"]:
                    return {"status": "cancelled"}, None, None, 0.0
                champ, ctx = pick_article_retenu(dossier)
                # Par fact, pas globalement au cycle : seul un item réellement
                # bypassé (STALE, jamais présent hors "Forcer") doit porter le
                # tag "Hors fenêtre 48h" -- un cycle forcé peut très bien
                # mélanger des faits frais normaux et des faits bypassés.
                fact_forced_stale = champ.get("date_status") == "STALE"
                fact = {"article_retenu": champ, "sources_secondaires": ctx, "n_sources": len(dossier), "forced_stale": fact_forced_stale, "cycle_id": cid}
                _t0 = datetime.now(TZ).timestamp()
                # Bug corrige 2026-08-19 (rapporte : "Interrompre" restait
                # sans effet plusieurs minutes) : should_cancel est revérifié
                # entre CHAQUE passe LLM a l'interieur de write_article() (voir
                # writer.py) -- fonctionne pareillement en parallele, chaque
                # worker lit le meme CANCEL_FLAG partage (simple bool, lecture
                # sans risque entre threads).
                written = write_article(fact, should_cancel=lambda: CANCEL_FLAG["requested"])
                _elapsed = datetime.now(TZ).timestamp() - _t0
                return written, fact, champ, _elapsed

            concurrency = max(1, int(config.LIMITS.get("cycle_concurrency", 1)))
            facts_by_idx = {}
            cancel_logged = False
            with ThreadPoolExecutor(max_workers=concurrency) as gen_ex:
                gen_futs = {gen_ex.submit(_gen_one, dossier): (idx, dossier) for idx, dossier in enumerate(dossiers[:limit])}
                for fut in as_completed(gen_futs):
                    idx, dossier = gen_futs[fut]
                    try:
                        written, fact, champ, _elapsed = fut.result()
                    except Exception as _we:
                        log(cid, "GEN_ERROR", f"{type(_we).__name__}: {_we}", action="GENERE")
                        continue
                    # Annulation detectee (avant ou pendant la generation,
                    # voir writer.py) : written["article"] est vide, ce fact
                    # n'a aucun contenu publiable -> on ne l'ajoute PAS a
                    # facts (un article vide serait pire qu'un article en
                    # moins). On ne "break" plus ici (d'autres workers du lot
                    # peuvent deja etre en train de finir legitimement) : on
                    # laisse simplement le flag consomme empecher tout NOUVEAU
                    # demarrage (verifie en tete de _gen_one).
                    if written.get("status") == "cancelled":
                        if not cancel_logged:
                            CANCEL_FLAG["requested"] = False
                            log(cid, "CYCLE_CANCEL", "annulation prise en compte", action="CYCLE")
                            cancel_logged = True
                        continue
                    # Alimente l'estimation de temps affichée au lancement d'un
                    # cycle (2026-08-19, demande explicite) : moyenne mobile
                    # persistée, mise à jour à CHAQUE article réellement généré.
                    try:
                        record_article_seconds(_elapsed)
                    except Exception:
                        pass
                    _CYCLE_ELAPSED["done"] += 1
                    CYCLE_PROGRESS["current"] = _CYCLE_ELAPSED["done"]
                    _update_progress_eta()
                    fact["article"] = written["article"]
                    fact["image"] = written["image"]
                    fact["gen_model"] = written["model"]
                    fact["gen_status"] = written["status"]
                    fact["critique_issues"] = written.get("critique_issues", 0)
                    facts_by_idx[idx] = fact
                    # Dedup inter-cycles : on marque CHAQUE item unique (pas que l'article_retenu)
                    for it in dossier:
                        mark(url_hash(it["url"]), it["title"])
                    log(cid, "FACT_GEN", f"provider={written['model']} src={champ['source']} durée={_elapsed:.0f}s",
                        written["model"], fact_id=fact_id_of(champ), action="GENERE")
                    # Auto-critique (2026-08-19, demande explicite : contrôle qualité
                    # orthographe/grammaire/accords/conjugaison/cohérence sémantique
                    # AVANT sortie du texte final -- voir writer._self_review_pass).
                    # Journalisé séparément pour rester consultable/auditable même
                    # si l'article final ne montre plus la trace des corrections.
                    if written.get("critique_issues"):
                        log(cid, "AUTOCRITIQUE",
                            f"{written['critique_issues']} probleme(s) corrige(s) | {(written.get('critique_report') or '')[:300]}",
                            written["model"], fact_id=fact_id_of(champ), action="CORRIGE")
            # Ordre stable = ordre de priorite (score de l'article_retenu), pas l'ordre
            # d'arrivee (aleatoire en parallele) : preserve le meme comportement
            # qu'avant pour tout code aval qui suppose cet ordre.
            facts = [facts_by_idx[i] for i in sorted(facts_by_idx)]
            # Illustration : garantit une image UNIQUE par article (aucun doublon)
            try:
                facts = illustrate_all(facts)
            except Exception as _ie:
                log(cid, "ILLU_WARN", f"{type(_ie).__name__}: {_ie}", "illustrate")
            end_cycle(cid, "OK")
            _release_cycle_lock()
            _reset_progress()
            log(cid, "CYCLE_END", f"facts={len(facts)} dossiers={len(dossiers)}")
            return {
                "status": "ok",
                "cycle_id": cid,
                "whitelist_version": wl.WHITELIST_VERSION,
                "sources_ok": sources_ok,
                "total_items": len(items),
                "rejected_intl": rejected_intl,
                "date_anomalies": anomalies,
                "skipped_dup": skipped,
                # "dossiers" (2026-08-26, audit de nommage Temps 2 : anciennement
                # "clusters") -- consommé par le frontend (audit.js, dashboard.js).
                "dossiers": len(dossiers),
                "facts_to_generate": len(facts),
                "facts": facts,
            }
        except Exception as e:
            end_cycle(cid, "ERROR")
            log(cid, "CYCLE_ERROR", str(e)[:200])
            _release_cycle_lock()
            _reset_progress()
            return {"error": str(e), "facts": []}


agent = ReachAgent()


def regenerate(fact_id: str, suggestion: str = None, dry_run: bool = None) -> dict:
    """Régénère UN article à partir des INFOS DÉJÀ ACQUISES (table hitl_facts).
    AUCUN re-scraping, AUCUNE requête vers les sources : l'article_retenu/
    sources_secondaires source est relu depuis la base et reste la source
    unique de vérité.
    La 'suggestion' oriente l'angle de rédaction (jamais les faits).
    Retourne le fact mis à jour (avec le nouvel article) + suggestion appliquée.

    2026-08-20, refactor monolithe modulaire : déplacé depuis generation/
    writer.py, où cette fonction violait la frontière entre domaines --
    elle lisait ET écrivait directement dans le stockage éditorial
    (editorial/hitl_store.py) depuis le module de GÉNÉRATION, qui ne
    devrait produire du texte/image que sur ce qu'on lui donne, sans jamais
    connaître la base éditoriale. Cette fonction ORCHESTRE deux domaines
    (generation.writer + editorial.hitl_store) -- sa vraie place est ici,
    pas dans l'un ou l'autre des deux modules qu'elle relie."""
    row = get_fact(fact_id)
    if not row:
        return {"error": "fact_introuvable", "fact_id": fact_id}
    # Reconstituer le fact depuis la base (infos sécurisées)
    champ = row["article_retenu"] if isinstance(row["article_retenu"], dict) else json.loads(row["article_retenu"] or "{}")
    ctx = row["sources_secondaires"] if isinstance(row["sources_secondaires"], list) else json.loads(row["sources_secondaires"] or "[]")
    fact = {
        "article_retenu": champ,
        "sources_secondaires": ctx,
        "image": row.get("image", "") or champ.get("image", ""),
        "image_meta": (row["image_meta"] if isinstance(row["image_meta"], dict)
                       else json.loads(row["image_meta"] or "{}")),
        "n_sources": row.get("n_sources", len(ctx) + 1),
        "forced_stale": False,
    }
    # Consigne d'angle (n'ajoute AUCUN fait, uniquement une orientation de rédaction)
    angle = angle_directive(suggestion)
    if angle:
        fact["_regen_angle"] = angle
        fact["_regen_suggestion"] = suggestion
    written = write_article(fact, dry_run=dry_run)
    # Mise à jour du fact avec le nouvel article + modèle
    fact["article"] = written.get("article", "")
    fact["gen_model"] = written.get("model", "")
    fact["gen_status"] = written.get("status", "")
    fact["image"] = written.get("image", fact["image"])
    # Bug corrige 2026-08-19 (trouve en verifiant le changement de generateur
    # d'images) : seul fact["image"] (l'URL) etait mis a jour, jamais
    # fact["image_meta"] (provider/generated) -> une regeneration changeait
    # bien la photo affichee mais la metadonnee persistee restait celle de
    # l'ANCIEN generateur (ex: "loremflickr" alors que l'image venait
    # desormais de Pollinations), faussant toute verification/audit ulterieur.
    fact["image_meta"] = written.get("image_meta", fact.get("image_meta", {}))
    fid = upsert_fact(fact)
    return {
        "fact_id": fid,
        "article": written.get("article", ""),
        "model": written.get("model", ""),
        "status": written.get("status", ""),
        "suggestion_applied": suggestion or "neutre",
        "angle": angle,
        "critique_issues": written.get("critique_issues", 0),
    }
