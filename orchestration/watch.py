"""orchestration/watch.py — veille passive des sources (2026-08-26, demande
explicite : "peut-être ajouter une fonctionnalité qui prévient l'utilisateur
que de nouvelles informations sont disponibles sur les sources... il pourra
le demander s'il souhaite lancer une génération").

Vérifie périodiquement si des informations FRAÎCHES (<24h) et JAMAIS ENCORE
TRAITÉES par un cycle réel sont apparues sur les sources whitelist, et
prévient l'éditeur par une notification -- SANS JAMAIS déclencher de
génération elle-même. Le principe architectural documenté en tête de
server.py ("Aucun cron : tout cycle est déclenché par l'éditeur") reste
intact : cette veille ne fait qu'OBSERVER et NOTIFIER, la décision de lancer
un cycle reste 100% manuelle.

Réutilise délibérément la MÊME règle de fraîcheur/pertinence que
orchestration/reach_agent.py::run() (fetch_source, filter_guinea appliqué à
TOUTE source depuis le correctif du 2026-08-26, fenêtre stricte <24h via
normalize()["actual"], dédup via editorial.state_store.seen()) -- cette
veille ne doit JAMAIS annoncer une disponibilité qu'un vrai cycle
démentirait ensuite. Ne touche JAMAIS seen_items/mark() (réservé aux VRAIS
cycles de génération) : le dédup anti-spam de notification répétée passe par
un namespace strictement séparé, watch_seen()/watch_mark() (voir
editorial/state_store.py)."""
import threading
import time as _time
from datetime import datetime

import collection.whitelist as wl
from collection.fetchers import fetch_source
from collection.alt_sources import alt_fetch
from collection.normalizer import normalize
from collection.guinea_filter import filter_guinea
from collection.dedup import url_hash
from editorial.state_store import seen, watch_seen, watch_mark
import editorial.notifications as notifications
from editorial.audit import log

# Fréquence de vérification (2026-08-26, choix explicite de l'utilisateur :
# "toutes les 30 min" -- compromis réactivité/charge sur les sources).
WATCH_INTERVAL_SEC = 1800

_thread = None
_stop = threading.Event()


def _collect_fresh_unseen() -> list:
    """Une passe de collecte en LECTURE SEULE : aucun mark() sur seen_items
    (le dédup réel des cycles de génération n'est jamais touché ici), aucun
    appel LLM, aucune génération. Retourne la liste des items frais (<24h,
    pertinence Guinée confirmée) jamais encore couverts par un cycle réel."""
    cycle_start = datetime.now()
    fresh = []
    for e in wl.active_entries():
        try:
            raws = fetch_source(e) if e.vector_primary in ("rss", "html") else alt_fetch(e)
        except Exception:
            continue
        for r in raws:
            try:
                n = normalize(r, e, cycle_start)
            except Exception:
                continue
            if not n.get("actual"):
                continue  # même condition que reach_agent.run() : <24h, date fiable
            text_filter = (n["title"] + " " + n.get("summary", "") + " " + n["raw_content"])[:2500]
            ok, _motif = filter_guinea(text_filter, title=n["title"])
            if not ok:
                continue
            uh = url_hash(n["url"])
            if seen(uh):
                continue  # déjà traité par un vrai cycle -> pas "nouveau"
            fresh.append({"title": n["title"], "url": n["url"], "url_hash": uh})
    return fresh


def check_once() -> dict:
    """Un tick de veille : détecte les items frais jamais notifiés, crée UNE
    notification groupée si au moins un existe, marque ces items comme
    notifiés (namespace watch_notified, séparé du dédup réel -- voir
    docstring du module) pour ne jamais spammer l'utilisateur toutes les
    30 min avec les mêmes items tant qu'il ne lance pas de cycle lui-même.
    Ne lève jamais (best-effort, comme tout le reste de la veille) : une
    panne de cette passe ne doit jamais impacter le service principal."""
    try:
        fresh = _collect_fresh_unseen()
    except Exception as e:
        log("watch", "WATCH_ERROR", f"{type(e).__name__}: {e}", "")
        return {"new_count": 0, "error": str(e)}
    new_items = [it for it in fresh if not watch_seen(it["url_hash"])]
    if not new_items:
        return {"new_count": 0}
    n = len(new_items)
    sample = ", ".join(it["title"][:60] for it in new_items[:3])
    msg = (f"{n} nouvelle{'s' if n > 1 else ''} information{'s' if n > 1 else ''} "
           f"disponible{'s' if n > 1 else ''} sur les sources ({sample}"
           f"{'…' if n > 3 else ''}). Lancez un cycle si vous souhaitez générer des articles.")
    notifications.create("watch_new_content", msg, route="dashboard")
    for it in new_items:
        watch_mark(it["url_hash"])
    log("watch", "WATCH_NOTIFY", f"{n} item(s) frais détecté(s)", "")
    return {"new_count": n}


def _loop():
    # Un premier tick immédiat serait redondant juste après un déploiement/
    # redémarrage (le service redémarre plusieurs fois par jour lors des
    # itérations -- voir historique de session) : on attend un intervalle
    # complet avant la première vérification, jamais de notification
    # surprise à la seconde même où le service vient de repartir.
    while not _stop.wait(WATCH_INTERVAL_SEC):
        try:
            check_once()
        except Exception as e:
            log("watch", "WATCH_LOOP_ERROR", f"{type(e).__name__}: {e}", "")


def start():
    """Démarre la veille en arrière-plan (thread daemon -- jamais bloquant
    pour l'arrêt du service, cette veille n'a aucun état à sauvegarder qui
    ne le soit déjà via watch_mark() au fil de l'eau). Idempotent : un appel
    répété (ex: rechargement de module en test) ne démarre pas de second
    thread."""
    global _thread
    if _thread and _thread.is_alive():
        return
    _stop.clear()
    _thread = threading.Thread(target=_loop, daemon=True, name="kora-watch")
    _thread.start()


def stop():
    _stop.set()
