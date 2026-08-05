"""reach_agent.py — orchestrateur (cerveau Reach), reconçu selon CDC KORA V3.

Cycle on-demand (mutex) :
  whitelist versionnée -> collecte (redirections bloquées) -> normalisation
  (fenêtre glissante 24h, anomalie date) -> filtre Guinée INTL -> dedup ->
  clustering Jaccard 0.5 -> champion -> writer LLM -> audit -> rapport.
Toute défaillance source/LLM = isolée (jamais crash global).
"""
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
import config
import whitelist as wl
from fetchers import fetch_source
from normalizer import normalize, TZ, _parse_date
from guinea_filter import filter_guinea
from dedup import url_hash, is_dup
from clusterer import cluster, pick_champion
from state_store import seen, mark, new_cycle, end_cycle, init as _init_state
from writer import write_article
from hitl_store import fact_id_of
from audit import log
from illustrate import illustrate

class ReachAgent:
    def __init__(self):
        self.mutex = False

    def run(self, demand: int = None, scope_filter: str = None,
            initiator: str = "editor", force: bool = False) -> dict:
        if self.mutex:
            return {"error": "cycle_en_cours", "facts": []}
        self.mutex = True
        _init_state()  # (re)crée les tables si la DB a été resetée
        cid = new_cycle()
        cycle_start = datetime.now(TZ)
        log(cid, "CYCLE_START", f"initiator={initiator} scope={scope_filter} whitelist_v={wl.WHITELIST_VERSION}", action="CYCLE")
        try:
            items = []
            sources_ok = 0
            rejected_intl = 0
            anomalies = 0
            # Collecte PARALLÈLE des sources (évite le blocage séquentiel lent)
            from concurrent.futures import ThreadPoolExecutor, as_completed
            entries = [e for e in wl.active_entries()
                       if not scope_filter or e.category == scope_filter]

            def _collect(e):
                if e.vector_primary in ("rss", "html"):
                    raws, src = fetch_source(e), e
                else:
                    raws, src = alt_fetch(e), e
                # Fallback sitemap si la collecte primaire est vide (sites derrière Cloudflare)
                if not raws and getattr(e, "vector_secondary", "") == "sitemap":
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
            pool = actual
            forced_stale = False
            if not pool and force and stale:
                # Génération forcée : on limite aux 48h précédentes (fenêtre élargie
                # par rapport aux 24h strictes, mais pas l'historique complet).
                cutoff = cycle_start - timedelta(hours=48)
                recent_stale = [
                    i for i in stale
                    if i.get("date_normalized") and _parse_date(i["date_normalized"]) >= cutoff
                ]
                pool = recent_stale if recent_stale else stale[:2]
                forced_stale = True
                log(cid, "FORCE_STALE", f"pool={len(pool)} sur {len(stale)} stale (fenetre 72h)")
            log(cid, "COLLECT_DONE",
                f"items={len(items)} actual={len(actual)} rejected_intl={rejected_intl} anomalies={anomalies}")

            if not pool:
                # Aucune source n'a publié d'info FRAÎCHE (< 24h) : on n'invente rien.
                msg = ("Pour l'instant, il n'y a pas d'informations. Aucune actualité "
                       "fraîche n'a été publiée dans les dernières 24 heures. "
                       "Reviens plus tard.")
                if stale:
                    msg = (f"Pour l'instant, il n'y a pas d'informations. "
                           f"{len(stale)} info(s) collectée(s) datent de plus de 24h "
                           f"(sources peu actives ou dates non fiables). Reviens plus tard "
                           f"— ou utilise « Générer quand même » pour les 48h précédentes.")
                end_cycle(cid, "EMPTY")
                self.mutex = False
                return {"status": "empty_or_stale", "message": msg,
                        "whitelist_version": wl.WHITELIST_VERSION,
                        "sources_ok": sources_ok, "total_items": len(items),
                        "rejected_intl": rejected_intl, "date_anomalies": anomalies,
                        "stale_count": len(stale), "facts": []}

            # Dedup mémoire
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

            limit = 1  # 1 article par génération (règle métier 2026-08)
            facts = []
            for c in clusters[:limit]:
                champ, ctx = pick_champion(c)
                fact = {"champion": champ, "contexts": ctx, "n_sources": len(c), "forced_stale": forced_stale}
                written = write_article(fact)
                fact["article"] = written["article"]
                fact["image"] = written["image"]
                fact["gen_model"] = written["model"]
                fact["gen_status"] = written["status"]
                facts.append(fact)
                mark(url_hash(champ["url"]), champ["title"])
            # Illustration : garantit une image UNIQUE par article (aucun doublon)
            try:
                facts = illustrate_all(facts)
            except Exception as _ie:
                log(cid, "ILLU_WARN", f"{type(_ie).__name__}: {_ie}", "illustrate")
            log(cid, "FACT_GEN", f"provider={written['model']} src={champ['source']}",
                written["model"], fact_id=fact_id_of(champ), action="GENERE")

            end_cycle(cid, "OK")
            self.mutex = False
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
            self.mutex = False
            return {"error": str(e), "facts": []}

agent = ReachAgent()
