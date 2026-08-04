# SPEC-KORA-V3 — FORMAT ASSIMILABLE (reconception exécution)

> Dérivé du CDC GPT 5.5 (message.txt). Optimisé pour exécution agent : décisions
> tranchées vs À CONCEVOIR, écarts vs code actuel, modules + portes d'acceptation.
> Règle héritée : logique métier avant code, anti-hallucination, ZÉRO fiction.

## A. DÉCISIONS TRANSCHÉES (du CDC + nos décisions conservatrices validées)
| ID | Décision | Valeur retenue |
|----|----------|----------------|
| DEC-002 | Vecteurs par source | RSS pour RFI/BBC/F24/GoogleNews ; HTML+sitemap pour GN ; gnews pour Google News |
| DEC-004 | Article sans date fiable | EXCLU du corpus actif + signalé anomalie (PAS `actual=True`) |
| DEC-009 | WordPress | Brouillon uniquement après approbation |
| DEC-010 | Image OpenGraph sans droit | NON publiée (décision humaine requise) |
| DEC-005 | Champion | score sur critères observables (complétude, date, OG, fraîcheur, pas erreur) — PAS réputation |
| DEC-007 | Transitivité clustering | cluster par composante connexe Jaccard≥0.5 |
| HITL | Jamais de pub auto | statut PENDING_REVIEW imposé |
| Mutex | 1 cycle | refus concurrent |

## B. ÉCARTS CRITIQUES vs CODE ACTUEL (à reconcevoir)
1. **Whitelist non versionnée** : config.py plat, pas d'ID interne, pas de
   domaines/sous-domaines/redirections autorisés. → `whitelist.py` + matrice.
2. **Redirections hors whitelist non bloquées** : `requests` suit les redirects
   par défaut. → refus post-redirect (guardrails).
3. **guinee_filter naïf** : booléen, ne rejette pas Guinée-Bissau/Équatoriale/
   Papouasie. → désambiguïsation stricte.
4. **Fenêtre 24h permissive** : `is_actual` retourne True si date inconnue +
   fenêtre = jour calendaire (pas glissante depuis heure cycle). → fenêtre
   glissante stricte + anomalie date.
5. **Pas de piste d'audit structurée** : state_store SQLite minimal, pas
   d'événements traçables (qui/quand/quel fournisseur/rejets). → `audit.py`.
6. **Pas de schéma normalisé complet** : manque auteur, url canonique, erreurs
   extraction, empreinte. → enrichir normalizer.

## C. MODULES (prompt §1→§6) + PORTE
| Module | Fichier cible | Porte (CA) |
|--------|--------------|-----------|
| Whitelist versionnée | whitelist.py | 12 sources matrice + redirection bloquée + version |
| Collecte + redirections | fetchers.py + guardrails.py | 0 req hors whitelist, redirect bloquée |
| Normalisation stricte | normalizer.py | fenêtre glissante + anomalie date |
| Filtre Guinée | guinea_filter.py | rejet Bissau/Équatorial/Papouasie |
| Dedup + cluster | dedup.py + clusterer.py | fusion 3→1, champion justifié |
| Writer LLM | writer.py | dry-run + Ollama + fallback |
| Orchestration | reach_agent.py | mutex + dispatch + rapport |
| Audit | audit.py | événements sans secret |

## D. ORDRE D'EXÉCUTION (phases CDC)
G0 cadrage → G1 whitelist → G2 modèle → L4 collecte → L5 norme/filtre →
L6 dedup/cluster → L7 LLM → L8 HITL → L9 UI → L10 WP → L11 déploy → L12 recette.

## E. GARDE-FOUX TRANSVERSELS (injectés partout)
Jamais hors whitelist / jamais pub auto / jamais crash global / fenêtre 24h
stricte / INTL sans Guinée = rejet / jamais clé en clair / 1 cycle / LLM pas
d'accès Internet / jamais source inventée / approbation non transférable /
image pas publiée sur seule OG / jamais retry infini / jamais fallback silencieux
/ consensus ≠ vérité / date jamais inventée / rejet jamais silencieux / whitelist
figée par cycle / jamais cron auto / données mini dans prompt LLM.
