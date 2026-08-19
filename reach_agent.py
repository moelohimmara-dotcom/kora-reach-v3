"""reach_agent.py — orchestrateur (cerveau Reach), reconçu selon CDC KORA V3.

Cycle on-demand (mutex) :
  whitelist versionnee -> collecte (redirections bloquees) -> normalisation
  (fenetre glissante 24h, anomalie date) -> filtre Guinee INTL -> dedup ->
  clustering Jaccard 0.5 -> champion -> writer LLM -> audit -> rapport.
Toute defaillance source/LLM = isolee (jamais crash global).
"""
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
import config
import whitelist as wl
from fetchers import fetch_source
from normalizer import normalize, TZ, _parse_date
from guinea_filter import filter_guinea
from dedup import url_hash, is_dup
from clusterer import cluster, pick_champion, score_item
from state_store import (seen, mark, new_cycle, end_cycle, init as _init_state,
                          get_avg_article_seconds, record_article_seconds)
from writer import write_article, llm_circuit_status

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
    voir get_avg_article_seconds())."""
    done = _CYCLE_ELAPSED["done"]
    total = CYCLE_PROGRESS["total"]
    remaining = max(total - done, 0)
    if done > 0 and _CYCLE_ELAPSED["start_ts"]:
        elapsed = datetime.now(TZ).timestamp() - _CYCLE_ELAPSED["start_ts"]
        pace = elapsed / done
    else:
        pace = get_avg_article_seconds()
    CYCLE_PROGRESS["avg_sec_per_article"] = round(pace)
    CYCLE_PROGRESS["eta_seconds"] = round(pace * remaining)

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

from hitl_store import fact_id_of, cleanup_orphan_decisions
from audit import log
from illustrate import illustrate, illustrate_all

# Dispatcher sources alternatives (gnews/sitemap/gdelt/wayback) — defini dans alt_sources
from alt_sources import alt_fetch

import os
import json
import atexit
import threading

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
_CYCLE_LOCK_PATH = os.environ.get(
    "KORA_CYCLE_LOCK_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), ".kora_cycle.lock"),
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
                if e.vector_primary in ("rss", "html"):
                    raws, src = fetch_source(e), e
                else:
                    raws, src = alt_fetch(e), e
                # Fallback sitemap si la collecte primaire est vide (sites derriere Cloudflare)
                # B5 fix : étendu à TOUTE source HTML/RSS vide, pas seulement vector_secondary="sitemap"
                if not raws and e.vector_primary in ("rss", "html"):
                    raws = alt_fetch(e, primary="sitemap")
                    src = e
                return raws, src

            with ThreadPoolExecutor(max_workers=8) as ex:
                futs = {ex.submit(_collect, e): e for e in entries}
                for fut in as_completed(futs):
                    try:
                        raws, e = fut.result()
                    except Exception:
                        continue
                    if raws:
                        sources_ok += 1
                    for r in raws:
                        n = normalize(r, e, cycle_start)
                        if e.guinee_filter:
                            text_filter = (n["title"] + " " + n.get("summary", "")
                                           + " " + n["raw_content"])[:2500]
                            ok, motif = filter_guinea(text_filter, title=n["title"])
                            if not ok:
                                rejected_intl += 1
                                log(cid, "REJECT_INTL", f"{motif} | {n['title'][:60]}", "")
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

            clusters = cluster(uniq, config.LIMITS["cluster_sim_threshold"])

            # Garde-fou defensif : cluster() ne peut structurellement pas renvoyer
            # 0 cluster pour une liste uniq non vide (tout item non place demarre
            # son propre cluster) -> filet de securite pour ne jamais perdre un item.
            if not clusters and uniq:
                clusters = [[it] for it in uniq]
                log(cid, "FALLBACK_SINGLETONS",
                    f"clustering n'a produit aucun groupe -> {len(uniq)} clusters singleton")

            # REGLE METIER (LOGIQUE-METIER-REACH.md §7, retablie 2026-08-19) :
            # Kora Agent genere TOUS les articles issus des faits FRAIS et
            # uniques collectes lors du cycle (un cluster = un fait = un
            # article), meme si cela prend du temps. N = min(demande explicite,
            # nb clusters disponibles, garde-fou quotidien). Les clusters les
            # plus pertinents (score du champion) sont generes en premier, afin
            # qu'une interruption utilisateur laisse toujours les faits les plus
            # importants deja traites.
            clusters.sort(key=lambda c: max(score_item(i) for i in c), reverse=True)
            safety_cap = config.LIMITS.get("daily_article_limit", 10)
            limit = min(demand, len(clusters), safety_cap) if demand else min(len(clusters), safety_cap)
            _reset_progress(cid=cid, total=limit)
            _update_progress_eta()  # estimation initiale (moyenne historique) avant le 1er article
            facts = []
            for idx, c in enumerate(clusters[:limit]):
                if CANCEL_FLAG["requested"]:
                    # Interruption propre : on arrête après l'article en cours,
                    # on libère le flag et on rend les faits déjà générés.
                    CANCEL_FLAG["requested"] = False
                    log(cid, "CYCLE_CANCEL", "annulation demandee par l'utilisateur", action="CYCLE")
                    break
                CYCLE_PROGRESS["current"] = idx + 1
                champ, ctx = pick_champion(c)
                # Par fact, pas globalement au cycle : seul un item réellement
                # bypassé (STALE, jamais présent hors "Forcer") doit porter le
                # tag "Hors fenêtre 48h" -- un cycle forcé peut très bien
                # mélanger des faits frais normaux et des faits bypassés.
                fact_forced_stale = champ.get("date_status") == "STALE"
                fact = {"champion": champ, "contexts": ctx, "n_sources": len(c), "forced_stale": fact_forced_stale, "cycle_id": cid}
                _t0 = datetime.now(TZ).timestamp()
                # Bug corrige 2026-08-19 (rapporte : "Interrompre" restait
                # sans effet plusieurs minutes) : avant ce correctif, le SEUL
                # point de controle de CANCEL_FLAG etait ici, ENTRE deux
                # articles -- avec ~400s/article en moyenne observes en prod
                # (jusqu'a 4 appels LLM sequentiels par article), un clic sur
                # "Interrompre" pendant la generation de l'article en cours
                # n'avait litteralement AUCUN effet avant que celui-ci ne
                # finisse. should_cancel est revérifié entre CHAQUE passe LLM
                # a l'interieur de write_article() (voir writer.py).
                written = write_article(fact, should_cancel=lambda: CANCEL_FLAG["requested"])
                _elapsed = datetime.now(TZ).timestamp() - _t0
                # Alimente l'estimation de temps affichée au lancement d'un
                # cycle (2026-08-19, demande explicite) : moyenne mobile
                # persistée, mise à jour à CHAQUE article réellement généré.
                try:
                    record_article_seconds(_elapsed)
                except Exception:
                    pass
                _CYCLE_ELAPSED["done"] += 1
                _update_progress_eta()
                # Annulation detectee EN COURS de generation (status="cancelled",
                # voir writer.py) : written["article"] est vide, ce fact n'a
                # aucun contenu publiable -> on ne l'ajoute PAS a facts (un
                # article vide dans les resultats serait pire qu'un article en
                # moins) et on sort de la boucle immediatement, sans attendre
                # le prochain tour (CANCEL_FLAG deja consomme ici, pas besoin
                # que le garde-fou en tete de boucle le refasse).
                if written.get("status") == "cancelled":
                    CANCEL_FLAG["requested"] = False
                    log(cid, "CYCLE_CANCEL", "annulation prise en compte en cours d'article", action="CYCLE")
                    break
                fact["article"] = written["article"]
                fact["image"] = written["image"]
                fact["gen_model"] = written["model"]
                fact["gen_status"] = written["status"]
                fact["critique_issues"] = written.get("critique_issues", 0)
                facts.append(fact)
                # Dedup inter-cycles : on marque CHAQUE item unique (pas que le champion)
                for it in c:
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
            # Illustration : garantit une image UNIQUE par article (aucun doublon)
            try:
                facts = illustrate_all(facts)
            except Exception as _ie:
                log(cid, "ILLU_WARN", f"{type(_ie).__name__}: {_ie}", "illustrate")
            end_cycle(cid, "OK")
            _release_cycle_lock()
            _reset_progress()
            log(cid, "CYCLE_END", f"facts={len(facts)} clusters={len(clusters)}")
            return {
                "status": "ok",
                "cycle_id": cid,
                "whitelist_version": wl.WHITELIST_VERSION,
                "sources_ok": sources_ok,
                "total_items": len(items),
                "rejected_intl": rejected_intl,
                "date_anomalies": anomalies,
                "skipped_dup": skipped,
                "clusters": len(clusters),
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
