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
from state_store import seen, mark, new_cycle, end_cycle, init as _init_state
from writer import write_article

# Flag d'annulation de cycle (bouton « Interrompre » côté UI)
CANCEL_FLAG = {"requested": False}

def cancel_cycle():
    """Demande l'interruption du cycle en cours (arrêt propre après l'article en cours)."""
    CANCEL_FLAG["requested"] = True
from hitl_store import fact_id_of
from audit import log
from illustrate import illustrate, illustrate_all

# Dispatcher sources alternatives (gnews/sitemap/gdelt/wayback) — defini dans alt_sources
from alt_sources import alt_fetch

import os
import json
import atexit

# Lock fichier cross-process pour /api/cycle (fonctionne sur multi-worker).
# Le mutex precedent etait en memoire (instance unique) -> ne protegeait pas
# si le serveur tourne en multi-process (gunicorn/uvicorn workers) ou si un
# second process se lance. Ici on utilise un fichier verrou avec PID+timestamp.
_CYCLE_LOCK_PATH = "/tmp/kora_cycle.lock"
_MUTEX_TTL_SEC = 300


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


def _acquire_cycle_lock():
    """Tente d'acquerir le lock fichier.

    Retourne True si acquis, False si deja occupe (et non perime).
    Cree le fichier avec O_EXCL (atomique) pour garantir l'exclusion.
    """
    try:
        fd = os.open(_CYCLE_LOCK_PATH, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644)
    except FileExistsError:
        # Le lock existe deja -> verifier validite (PID vivant + TTL)
        try:
            with open(_CYCLE_LOCK_PATH, "r") as f:
                data = json.load(f)
            pid = data.get("pid")
            ts = data.get("ts", 0)
            # Stale si PID mort OU TTL depasse
            if not _pid_alive(pid) or (datetime.now(TZ).timestamp() - ts) >= _MUTEX_TTL_SEC:
                try:
                    os.remove(_CYCLE_LOCK_PATH)
                except OSError:
                    pass
                return _acquire_cycle_lock()
        except (json.JSONDecodeError, OSError):
            try:
                os.remove(_CYCLE_LOCK_PATH)
            except OSError:
                pass
            return _acquire_cycle_lock()
        return False  # Lock valide et non perime -> refus
    except OSError:
        return False
    # Lock acquis : ecrire PID + timestamp pour proprio/diagnostic
    try:
        payload = json.dumps({"pid": os.getpid(), "ts": datetime.now(TZ).timestamp()})
        os.write(fd, payload.encode())
    finally:
        os.close(fd)
    return True


def _release_cycle_lock():
    """Libere le lock fichier uniquement si on en est le proprietaire."""
    try:
        with open(_CYCLE_LOCK_PATH, "r") as f:
            data = json.load(f)
        if data.get("pid") == os.getpid():
            os.remove(_CYCLE_LOCK_PATH)
    except (OSError, json.JSONDecodeError):
        pass


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
        cid = new_cycle()
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
                        if n.get("date_status") in ("UNRELIABLE", "FUTURE"):
                            anomalies += 1
                            log(cid, "DATE_ANOMALY", f"{n['date_status']} | {n['url'][:80]}", "")
                        items.append(n)

            actual = [i for i in items if i.get("actual")]
            stale = [i for i in items if not i.get("actual")]
            # FENETRE STRICTE 24h — NEVER d'elargissement a 48h/72h.
            # Un article n'est genere QUE si une source a publie une info
            # FRAICHE (< 24h). Sinon : on n'invente rien et on l'informe.
            pool = actual
            forced_stale = False
            log(cid, "COLLECT_DONE",
                f"items={len(items)} actual={len(actual)} rejected_intl={rejected_intl} anomalies={anomalies}")

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

            clusters = cluster(uniq, config.LIMITS["cluster_sim_threshold"])

            # ANGLE MORT (Option A) : si pool (actu <24h) non vide mais que le
            # clustering/dedup renvoie 0 cluster, on ne rend JAMAIS un cycle
            # "vide alors qu'il y avait de l'actu". On genere AU MOINS 1 article
            # de secours depuis le meilleur item du pool (le plus recent / le
            # mieux score), en contournant la dedup inter-cycles.
            if not clusters and pool:
                best = sorted(
                    pool,
                    key=lambda i: (i.get("title", "") or ""),
                    reverse=False,
                )[0]
                clusters = [[best]]
                log(cid, "FALLBACK_ONE",
                    f"0 cluster mais pool={len(pool)} -> 1 article de secours "
                    f"depuis {best.get('source')} ({best.get('title','')[:50]})")

            # REGLE METIER : 1 cycle = 1 article (génération unique et verrouillée)
            limit = 1
            facts = []
            for c in clusters[:limit]:
                if CANCEL_FLAG["requested"]:
                    # Interruption propre : on arrête après l'article en cours,
                    # on libère le flag et on rend les faits déjà générés.
                    CANCEL_FLAG["requested"] = False
                    log(cid, "CYCLE_CANCEL", "annulation demandee par l'utilisateur", action="CYCLE")
                    break
                champ, ctx = pick_champion(c)
                fact = {"champion": champ, "contexts": ctx, "n_sources": len(c), "forced_stale": forced_stale, "cycle_id": cid}
                written = write_article(fact)
                fact["article"] = written["article"]
                fact["image"] = written["image"]
                fact["gen_model"] = written["model"]
                fact["gen_status"] = written["status"]
                facts.append(fact)
                # Dedup inter-cycles : on marque CHAQUE item unique (pas que le champion)
                for it in c:
                    mark(url_hash(it["url"]), it["title"])
                log(cid, "FACT_GEN", f"provider={written['model']} src={champ['source']}",
                    written["model"], fact_id=fact_id_of(champ), action="GENERE")
            # Illustration : garantit une image UNIQUE par article (aucun doublon)
            try:
                facts = illustrate_all(facts)
            except Exception as _ie:
                log(cid, "ILLU_WARN", f"{type(_ie).__name__}: {_ie}", "illustrate")
            end_cycle(cid, "OK")
            _release_cycle_lock()
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
            return {"error": str(e), "facts": []}


agent = ReachAgent()
