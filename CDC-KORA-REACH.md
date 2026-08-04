# CAHIER DES CHARGES — KORA V3 (GuinéePress Intelligence)

**Projet** : Agent IA de journalisme éditorial pour kakilambe.com
**Rédacteur** : Ingénieur logiciel attitré (Hermes)
**Date** : 2026-08-01
**Statut** : Spécification validée, MVP fonctionnel (agent Reach opérationnel)

---

## 1. OBJET

KORA V3 est un pipeline éditorial autonome et semi-automatique qui assure la
veille, la collecte, la détection de faits uniques, la rédaction d'articles de
synthèse et la publication vers WordPress pour le média guinéen kakilambe.com.

Le système remplace tout outil de scraping tiers (Firecrawl, BrightData) par un
**script Python maison** — l'**Agent Reach** — qui collecte les informations
sur les plateformes autorisées uniquement, de façon gouvernée et gratuite.

---

## 2. PÉRIMÈTRE FONCTIONNEL

Le système couvre obligatoirement :

1. **Collecte décentralisée (Agent Reach)** : script Python qui va chercher les
   informations sur les plateformes autorisées (whitelist), en remplacement de
   Firecrawl. RSS (feedparser) + HTML (trafilatura + BeautifulSoup).
2. **Gouvernance des sources** : liste blanche stricte (`source_registry`).
   Aucune URL hors whitelist n'est touchée. `robots.txt` respecté. Rate-limit
   (1 requête / 2s / hôte).
3. **Couverture double** :
   - Nationale : médias guinéens (scope `GN_NAT`).
   - Internationale ciblée : médias internationaux filtrés sur mention explicite
     de la Guinée (scope `INTL`, `guinee_filter`).
4. **Fenêtre 24h obligatoire** : une information n'est "actuelle" que si elle est
   survenue entre 00:00 et 23:59 (fuseau `Africa/Conakry`) du jour de la demande.
   Hors fenêtre -> alerte éditeur ("info d'hier, générer quand même ?").
5. **Détection de sujet commun (anti-spam éditorial)** : quand N médias traitent
   le MÊME fait (ex. match Guinée-Mali 2-1), le système les **clusterise** en 1
   seul fait, sélectionne le **champion le plus parlant**, et synthétise les
   autres en contexte. Zéro doublon publié.
6. **Génération à la demande** (Option A validée) : AUCUN cron automatique.
   L'éditeur déclenche depuis le dashboard ("Lancer un cycle"). Mutex : 1 cycle
   à la fois.
7. **Article illustré** : chaque article généré embarque l'image principale de la
   source champion (OpenGraph via trafilatura `extract_metadata`).
8. **HITL verrouillé** : aucune publication automatique. Statut `PENDING_REVIEW`
   imposé. Validation humaine obligatoire (toggle désactivable impossible).
9. **Traçabilité** : chaque cycle loggue sources, items, doublons, clusters,
   faits générés. State store persistant (SQLite local).
10. **Déploiement léger** : VPS 8GB (Debian), Nginx, systemd. Sender dry-run par
    défaut. Aucune clé API requise pour démontrer le collecteur.

---

## 3. ARCHITECTURE

| Couche | Technologie | Rôle |
|---|---|---|
| Collecte | Python 3.13 + feedparser + trafilatura + bs4 | Agent Reach (scrape whitelist) |
| Normalisation | Python (schéma commun) | title/url/summary/date/source/scope/raw/image/actual |
| Clustering | Python (empreinte entités, Jaccard) | fusion multi-sources par fait |
| LLM | Ollama Cloud (gpt-oss:120b-cloud) en priorité, fallback TokenRouter/kimi, Groq/Cerebras/OpenRouter, template | rédaction synthèse |
| Backend API | FastAPI (existante KORA) | routes /api/agent/* |
| Orchestration | LangGraph (kora_graph_semi HITL) | pipeline scrape→select→write→illustrate→publish |
| Frontend | Next.js 15 (dashboard éditeur) | /dashboard, /agent, /articles |
| Base | Supabase Postgres (RAW_FEEDS, ARTICLES, PROVIDER_STATES) | persistance |
| Publication | WordPress REST + QStash (espacement) | push kakilambe.com |
| Infra | VPS Debian, Nginx, systemd | hébergement |

---

## 4. AGENT REACH — DÉTAIL (implémenté et testé)

### 4.1 Modules (dossier /kora-reach/)
- `config.py` — whitelist 11 sources (9 GN_NAT + 2 INTL filtré Guinée), limites.
- `guardrails.py` — whitelist stricte, robots.txt, rate-limit.
- `fetchers.py` — RSS (feedparser) + HTML (trafilatura + bs4, liens articles + image).
- `normalizer.py` — schéma commun + fenêtre 24h (fuseau Conakry).
- `dedup.py` — hash url + similarité titre.
- `clusterer.py` — fingerprint entités + clustering Jaccard (seuil 0.5).
- `state_store.py` — SQLite mémoire (vu/dedup).
- `writer.py` — génération LLM (Ollama Cloud → TokenRouter → template fallback).
- `alt_sources.py` — vecteurs alternatifs (sitemap XML, Google News RSS, GDELT, Wayback CDX) pour contourner blocage bot sans coût.
- `reach_agent.py` — orchestrateur (mutex, cycle on-demand, dispatch fmt→fetchers/alt_sources).
- `run.py` — CLI déclenchement.

### 4.2 Algorithme de cycle (on-demand)
1. Éditeur déclenche (mutex vérifié).
2. Pour chaque source whitelist (niveau 1→2 actifs, 3 repli désactivé) :
   - `fmt` rss/html → `fetchers.py` (feedparser / trafilatura+bs4).
   - `fmt` gnews/sitemap/gdelt/wayback → `alt_sources.py` (vecteurs alternatifs).
   - Garde-fous appliqués (whitelist, robots.txt, rate-limit).
3. Normalisation + marquage fenêtre 24h.
4. Dedup mémoire (hash + titre).
5. Clustering par entités (fusion multi-sources même fait).
6. Sélection champion par `pertinence_score` (source_level + richesse + factuel).
7. Pour chaque fait : `write_article()` → article de synthèse + image.
8. Rapport : {sources_ok, items, clusters, facts_to_generate, status}.
9. Fin de cycle, mutex libéré.

### 4.3 Tests réels exécutés
- Collecte médias GN : 8 sources GN_NAT actives → ~106 articles (Mosaique,
  Guinéenews, Guinée360, Mediaguinee, Guineematin, Guinee7, Africa Guinee, Vision Guinee).
- Collecte panafricaine : RFI Guinée + BBC Afrique + France24 Afrique → filtre
  "Guinée" prouvé (ex. massacre Zogota, stade Conakry 2009, pluies Conakry).
- **Vecteurs alternatifs (alt_sources)** : Google News RSS → 100 articles Guinée
  (agrège APAnews, Jeune Afrique, TV5 indirectement). Cycle INTL → 4 sources
  actives, 28 items, faits générés depuis Google News. GDELT/Wayback/Sitemap :
  codés, à activer sur VPS (réseau ouvert) — bloqués dans l'environnement de dev.
- Clustering : 3 sources match Guinée-Mali 2-1 → **1 cluster** (fusion prouvée),
  champion + 2 contextes ; fait économie BCRG séparé.
- Article illustré : image OpenGraph extraite et propagée (ex. Alpha-Bacar-
  Bah-Oury.jpg).
- Writer : flux fact→article prouvé (dry-run template + hook Ollama/Tok en place).
- CLI : `python run.py --scope GN_NAT --demand 3` → rapport JSON valide.

---

## 5. GARDE-FOUS (non négociables)

- Jamais de scraping hors whitelist.
- Jamais de publication auto (HITL).
- Jamais de crash global (try/except par source ET par article).
- Jamais de doublon (dedup + upsert).
- Fenêtre 24h stricte (fuseau Conakry).
- INTL sans mention Guinée = jamais collecté.
- Clé API jamais en clair dans le code (variable d'environnement locale).

---

## 6. SÉCURITÉ & DÉPLOIEMENT

- **HTTPS** : à activer (nom de domaine à pointer vers 213.156.135.139, Certbot).
- **Auth** : cookie applicatif maison (`ADMIN_SECRET_KEY`) + Basic Auth Nginx sur
  /system. À durcir (JWT/bcrypt recommandé avant exposition publique).
- **RGPD** : données locale, opt-out, consent.
- **Déploiement** : git pull + rebuild frontend + restart systemd (manuel, post-
  suppression app DigitalOcean).
- **Dépendances** : uv venv, trafilatura/feedparser/bs4/requests (collecte),
  litellm (LLM si clés).

---

## 7. HORS-SCOPE & VECTEURS ALTERNATIFS

### 7.1 Hors-scope
- Scraping JS lourd (Playwright) — évité volontairement.
- Réseaux sociaux (Facebook/Telegram) comme source primaire.
- Multilingue hors FR (article en français).
- Comptes payants — uniquement free-tier / open-source.

### 7.2 Vecteurs alternatifs (couverture sites protégés, FREE, légal)
Pour les sites sans RSS ou se protégeant des bots, Reach utilise (niveau 2/3) :
- **Sitemap XML** : liste URLs articles WP/CMS, quasi jamais bloquée.
- **Google News RSS** : Google a déjà crawlé → zéro blocage bot pour nous.
- **GDELT Doc API** : agrégateur mondial gratuit, query=Guinée.
- **Wayback CDX** : archive.org, dernier snapshot si site down/bloqué.
Ces vecteurs contournent Cloudflare/anti-bot **sans headless browser ni payant**.
TV5MONDE (pas de RSS) est couvert indirectement via Google News + Wayback (repli).

---

## 8. ROADMAP (restant)

| # | Tâche | État |
|---|---|---|
| 1 | Agent Reach collecte+fusion+images | ✅ fait |
| 2 | Writer LLM réel (Ollama Cloud) | ⏳ clé valide requise |
| 3 | Test source INTL RFI/BBC/France24 réel | ✅ fait (filtre Guinée prouvé) |
| 4 | Vecteurs alternatifs (sitemap/Google News/GDELT/Wayback) | ✅ fait (Google News prouvé, reste VPS) |
| 5 | Branchement Reach → writer.py KORA existant | ⏳ à faire |
| 6 | Intégration Supabase (RAW_FEEDS/ARTICLES) | ⏳ à faire |
| 7 | HTTPS + durcissement auth | ⏳ à faire |
| 8 | Dashboard éditeur (déclenchement cycle) | ⏳ existant KORA, à wirer |

---

## 9. LIVRABLES ATTENDUS

- Document de spécification (celui-ci).
- Code Agent Reach (`/kora-reach/`) runnable et testé.
- TDR (cahier des charges synthétique) séparé.
- Article de synthèse illustré généré sur demande éditeur.

---

**Signé** : Ingénieur logiciel attitré — spécification figée après validation
logique métier avant tout code (règle ADR : logique avant code).
