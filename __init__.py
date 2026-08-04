"""
Agent REACH — Collecteur KORA (on-demand, remplace Firecrawl).
Logique métier validée dans LOGIQUE-METIER-REACH.md.

Modules:
  config.py          -> chargement sources autorisées + limites
  source_registry.py -> whitelist (mémoire des sources)
  guardrails.py      -> whitelist stricte, robots, rate-limit
  fetchers.py        -> RSS (feedparser) + HTML (trafilatura)
  normalizer.py      -> schéma commun
  dedup.py           -> hash url + similarité titre
  clusterer.py       -> fingerprint + clustering par sujet (sans LLM)
  state_store.py     -> mémoire SQLite locale (persistance)
  reach_agent.py     -> orchestrateur (le cerveau Reach)
  run.py             -> CLI: déclenche un cycle à la demande
"""
