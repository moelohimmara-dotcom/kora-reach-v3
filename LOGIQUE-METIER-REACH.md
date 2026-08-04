# Logique Métier — Agent REACH (Collecteur KORA, on-demand)

Document de référence : décrit la logique AVANT le code. Validé par l'utilisateur.
Aucune ligne de code ici — seulement le comportement du système.

## 0. Principe
Agent Reach = collecteur maison qui remplace Firecrawl. Déclenché À LA DEMANDE
par l'éditeur (jamais cron auto, jamais API externe B). Il va chercher les infos
sur les plateformes AUTORISÉES (whitelist), les clusterise par sujet, synthétise
les doublons, et ne génère QUE des faits uniques dans la fenêtre 24h.

## 1. Déclenchement (Option A validée)
- Éditeur clique "Lancer un cycle" (ou demande ciblée : catégorie / topic / nb).
- Mutex serveur : 1 seul cycle à la fois. Si en cours -> refus poli.
- AUCUN cron automatique (on-demand pur). Cron réactivable plus tard en option.

## 2. Collecte (Reach)
Pour chaque source de la whitelist (ordre source_level 1 -> 2 -> 3) :
- Garde-fous : URL dans whitelist ? robots.txt OK ? rate-limit (1 req/2s) ?
- Fetch : RSS via feedparser d'abord, sinon HTML via trafilatura.
- Timeout 10s, retry 2x. Échec = log + source suivante (jamais crash global).

## 3. Normalisation
Chaque item brut -> schéma commun :
  {title, url, summary, published_at, source, source_level, scope, raw_content}
scope = "GN_NAT" (média guinéen) | "INTL" (média international).
Pour INTL : ne RETENIR que si contenu mentionne "Guinée"/"Guinéen"/entités Guinée.

## 4. Fenêtre 24h (Règle 0)
- NOW en fuseau Africa/Conakry. J0_00 = aujourd'hui 00:00, J0_24 = demain 00:00.
- ACTUELLE si J0_00 <= published_at < J0_24.
- PÉRIMÉE si published_at < J0_00.
- Comportement :
  * Demande "actu du jour" -> ne prend QUE les ACTUELLE.
  * Tous PÉRIMÉS -> message "info date d'hier (hors 24h). Générer quand même ?".
    Non -> arrêt propre. Oui -> génère depuis pool périmé.
  * Pool vide -> "Aucune publication détectée. Surveillance en cours." (attente).
- Si published_at inconnu -> supposé ACTUELLE + log du doute.

## 5. Clustering par sujet (anti-spam, Règle 2)
- Fingerprint léger (sans LLM) : mots-clés dominants (TF-IDF / entités noms
  propres+lieux+dates+chiffres), cluster_key = hash des N mots-clés normalisés.
- Regroupement : items partageant cluster_key相似 (cosinus > 0.7) -> 1 cluster = 1 fait.
- Pertinence_score par item : +source_level, +richesse contenu, +factuel
  (chiffres/dates), +fraîcheur, +originalité.
- Champion = item score max -> source principale. Autres = contextes (syn thèse).

## 6. Synthèse (réécriture enrichie)
Pour chaque cluster (fait unique) :
  contexte = [champion.raw] + [autres items tronqués]
  article = writer(champion, contextes)  # pyramide inversée, 5W, signature Kora
-> 1 article par fait, nourri multi-sources, zéro doublon.

## 7. Lot + Garde-fous (Règle 3)
- N = min(demandé, nb_clusters, daily_article_limit).
- Génération isolée (try/except par article) :
  * LLM fallback groq->cerebras->openrouter ; writer ; _validate_style (retry 2x).
  * Échec -> statut FAILED, continue.
  * upsert (jamais nouvelle ligne sur régénération).
  * statut = PENDING_REVIEW (JAMAIS PUBLISHED auto, HITL verrouillé).
- Rapport : {générés, échoués, doublons_skippés, sources_OK/total}.

## 8. Invariants "sans erreur"
1. Aucun crash global (try/except par source ET par article).
2. 1 cycle à la fois (mutex).
3. Jamais de publication auto (HITL).
4. Jamais de doublon (dedup + upsert).
5. Pool vide -> attente propre, pas d'erreur.
6. INTL sans mention Guinée -> jamais collecté.
7. Fenêtre 24h en fuseau Conakry.

## 9. Sources autorisées (whitelist initiale, à confirmer)
GN_NAT (niveau 1) : mosaiqueguinee.com, guineenews.org, guinee360.com,
  mediaguinee.com, guineematin.com, guineelive.com, guineefoot, lejourguinee,
  lelynx.
INTL (niveau 2, filtré "Guinée") : rfi.fr (tag guinea), AFP, Jeune Afrique,
  Reuters Africa.
Repli (niveau 3) : Tavily news days=1 si pools 1/2 vides (optionnel).
