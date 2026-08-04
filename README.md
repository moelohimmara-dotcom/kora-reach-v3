# KORA Reach V3

Agent de collecte d'actualités guinéennes + workflow éditorial humain (HITL).
Le système collecte, normalise, clusterise et résume des faits d'actualité depuis une
liste blanche de sources guinéennes, génère un article illustré, puis soumet à validation
humaine avant transmission vers WordPress et Supabase.

> Projet déployé sur VPS (nginx `/kora-v2/`). Toute décision de transmission est
> verrouillée : aucune publication automatique sans action explicite de l'éditeur.

## Architecture

```
┌──────────────┐     ┌──────────────────────────┐     ┌────────────────────┐
│  Frontend    │     │  Backend (API JSON)       │     │  Sources + LLM     │
│  Vite / MD3  │ <-> │  server.py (stdlib, zéro  │ <-> │  whitelist guin.   │
│  thèmes      │     │  dépendance) :8765        │     │  Ollama Cloud      │
│  clair/sombre│     │  + HITL store (SQLite)    │     │  (gemma4:31b)      │
└──────────────┘     └──────────────────────────┘     └────────────────────┘
                                  │
                       ┌──────────┴───────────┐
                       │  Transmission HITL   │
                       │  WordPress (WP) +    │
                       │  Supabase (articles) │
                       └──────────────────────┘
```

### Composants backend (`/`)
- `server.py` — serveur HTTP stdlib. Expose `/api/hitl` (faits + décisions),
  `/api/last` (dernier cycle), `/api/cycle` (déclenche une collecte), `/api/hitl/decide`
  (validation APPROUVER/REJETER/MODIFIER), `/api/hitl/retract` (droit de rectification).
- `reach_agent.py` — orchestrateur du cycle : whitelist → collecte → normalisation
  (fenêtre glissante 48h) → filtre Guinée/INTL → dédoublonnage → clustering Jaccard →
  champion → rédaction LLM → illustration → persistance.
- `illustrate.py` — illustration par article. Source par défaut : LoremFlickr
  (photos réelles liées au sujet, par mot-clé). Chaque article reçoit une image
  **unique** (lock dérivé du fact_id + dédoublonnage au niveau cycle). Fallback :
  image OpenGraph du champion.
- `hitl_store.py` — machine à états persistée (SQLite `reach_state.db`) :
  `PENDING_REVIEW → EDITED → APPROVED → TRANSMITTED`, plus `REJECTED` et `RETRACTED`.
  Chaque décision porte `decided_by` + `decided_at` (traçabilité, jamais anonyme).
- `writer.py` — rédaction de l'article (LLM Ollama Cloud, modèle `gemma4:31b`).
- `fetchers.py` / `normalizer.py` / `dedup.py` / `clusterer.py` — collecte,
  normalisation, dédoublonnage par hash d'URL, regroupement par similarité.
- `whitelist.py` — sources autorisées (liste blanche), vérifiées au démarrage.
- `transmit.py` — transmission vers WordPress (API REST) et Supabase (table `articles`).
- `guardrails.py` / `config.py` / `state_store.py` / `audit.py` — garde-fous
  (ex. fuseau Conakry, niveau 1/2), configuration, verrou de cycle, journal d'audit.

### Frontend (`kora-vite/`)
Application Vite, zéro dépendance au runtime (stdlib serveur statique).
- `src/app.js` — UI : tableau de bord, cartes d'articles, **tiroir de validation**
  type média (hero image + chapeau + corps), fermeture par croix / clic-dehors / Échap.
- `src/store.js` — état client, chargement persistant des faits (`/api/hitl`),
  décisions HITL.
- `src/style.css` — thèmes **clair / sombre / cacao** (tokens CSS), ombres soft MD3.
- `src/shell.js` / `src/icons.js` / `src/main.js` — shell applicatif, icônes SVG,
  bootstrap.

## Prérequis
- Python 3.11+ (venv fourni : `.venv/`)
- Node 22 + Vite (pour rebuild le frontend)
- Accès au VPS de déploiement (clés SSH ed25519)
- Variables d'environnement (voir `deploy/.env.example`) :
  `OLLAMA_API_KEY`, `OLLAMA_MODEL`, `SUPABASE_URL`, `SUPABASE_KEY`,
  `WP_USER`, `WP_APP_PASS`

## Setup local (dev)
1. Créer le venv et installer les dépendances Python.
2. Copier `deploy/.env.example` vers `deploy/.env` et renseigner les clés.
3. Lancer le backend : `python server.py` (écoute :8765).
4. Lancer le frontend en dev : `cd kora-vite && npm run dev`.

## Déploiement (VPS)
Les scripts et unités systemd sont dans `deploy/` :
- `kora-reach.service` — backend API (:8765)
- `kora-preview.service` — frontend statique (:8766)
- `nginx-kora-v2.conf` — reverse proxy `/kora-v2/` (Cache-Control no-store) + `/kora-v2/api/`
- `ufw-setup.sh` / `fail2ban-jail.local` — durcissement réseau

Workflow de mise à jour :
1. Modifier le code.
2. Rebuild frontend : `cd kora-vite && npm run build` (sortie dans `dist/`).
3. SCP `dist/` vers `/opt/kora-reach/kora-vite-dist/` et `server.py` + modules vers `/opt/kora-reach/`.
4. `systemctl restart kora-reach kora-preview`.

## Règles métier (résumé)
- **Fenêtre de fraîcheur** : 48h glissantes (rythme lent des médias GN).
- **Transmission** : uniquement après décision `APPROUVER` explicite (HITL verrouillé).
- **Illustrations** : une image réelle et unique par article ; jamais deux articles
  avec la même image.
- **Persistance** : les faits comme les décisions survivent au redémarrage
  (SQLite). Les articles en attente ne disparaissent pas au rechargement.
- **Anti-hallucination** : pas de visage réel, source vérifiée, traçabilité des décisions.

## Structure des dossiers
```
kora-reach/
├── server.py, reach_agent.py, illustrate.py, hitl_store.py
├── writer.py, fetchers.py, normalizer.py, dedup.py, clusterer.py
├── whitelist.py, transmit.py, guardrails.py, config.py, state_store.py, audit.py
├── kora-vite/            # frontend (Vite)
├── deploy/               # configs VPS (nginx, systemd, .env.example)
├── CDC-KORA-REACH.md     # cahier des charges
├── HITL-LOGIQUE.md       # logique de validation
├── SPEC-KORA-V3.md       # spécification
└── backups/              # sauvegardes DB (hors git)
```

## Sécurité
- Clés jamais committées (`.env`, `_key.txt` ignorés par git).
- Accès VPS en clé ed25519 uniquement, utilisateur non-root `kora`.
- Révoquer les tokens d'accès après usage.
