"""collection — recuperer et filtrer l'actualite brute.

Modules : fetchers.py (RSS/HTML), alt_sources.py (vecteurs de repli :
sitemap, Google News RSS, GDELT, Wayback), whitelist.py (gouvernance des
sources autorisees, en base), guardrails.py (whitelist stricte, robots,
rate-limit), normalizer.py (schema commun), guinea_filter.py (filtre
pertinence Guinee), dedup.py (hash URL + similarite titre), dossiers.py
(regroupement en dossiers par sujet, sans LLM ; anciennement clusterer.py).

Depend de : core (db, config). Rien d'autre.
Ne doit PAS dependre de : identity, generation, editorial, publishing —
collecter et filtrer une actualite ne regarde jamais qui est connecte, ni
comment elle sera ensuite redigee/stockee/publiee.
"""
