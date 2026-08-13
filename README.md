# KORA Reach v3 — Poste de pilotage éditorial

**KORA Agent** est un agent LLM de veille et de rédaction pour un média guinéen.
Cette application (`kora-reach`) est son **poste de pilotage éditorial** : tableau de
bord de supervision, file de validation HITL (Human-In-The-Loop), gestion des articles
(Articles / Brouillons / Corbeille), sources, et déclenchement des cycles de collecte.

> Stack : backend Python (aiohttp) + agent `reach_agent` + frontend **Vite** (vanilla JS,
> pas de framework) servi en statique. Déployé sur un VPS Debian 12, service `systemd`
> `kora-reach` (port 8766), derrière nginx (`/kora-v2/`).

---

## 1. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Navigateur (mobile / desktop)                               │
│  Frontend Vite  →  /opt/kora-reach/static/  (index.html + JS) │
└───────────────┬─────────────────────────────────────────────┘
                │  HTTPS  /kora-v2/   (nginx reverse proxy)
┌───────────────▼─────────────────────────────────────────────┐
│  nginx  →  /kora-v2/        → static/  (front)               │
│          →  /kora-v2/api/   → 127.0.0.1:8766/api/  (backend) │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│  Backend Python (aiohttp)  — service systemd `kora-reach`     │
│   • server.py      : API REST + auth (cookie kora_sid)        │
│   • auth.py        : PBKDF2-SHA256, rate-limit, reset         │
│   • reach_agent.py : orchestration du cycle de collecte       │
│   • writer.py      : publication WordPress                    │
│   • hitl_store.py  : décisions humaines (APPROVED/REJECTED…)  │
│   • normalizer.py  : normalisation des faits                  │
│   • illustrate.py  : génération d'images                      │
│   • db.py / config.py : Postgres + configuration              │
└───────────────┬─────────────────────────────────────────────┘
                │
        ┌───────▼────────┐      ┌──────────────┐
        │  Postgres       │      │  Ollama LLM   │
        │  (127.0.0.1:5432)│      │  (gemma4)     │
        └────────────────┘      └──────────────┘
```

### Frontend (Vite, vanilla JS)
- `kora-vite/src/app.js` — cœur : rendu des vues (`viewCockpit`, `viewFacts`,
  `viewDrafts`, `viewTrash`, `viewSources`, `viewAudit`, `viewrapide`), `factCard`,
  `factGroup`, `statCard`, binding des événements, `render()`.
- `kora-vite/src/store.js` — état global (state, `setState` anti-récursion, `checkAuth`
  idempotent, `loadFacts`, `loadHITL`, `getFactFilter`/`setFactFilter`).
- `kora-vite/src/shell.js` — coquille HTML (header, rail, bottom-nav, drawers,
  barre de sélection multiple `select-bar`, mini-fenêtres WP/corbeille).
- `kora-vite/src/icons.js` — sprite SVG des icônes (`i-trash`, `i-undo`, `i-edit`, …).
- `kora-vite/src/main.js` — bootstrap : import des Material Icons, `App.bind()` + `App.boot()`.
- `kora-vite/src/style.css` — charte **neumorphisme sombre** KORA (tokens `:root`,
  variantes par thème, layout responsive mobile/tablette/desktop).
- `kora-vite/vite.config.js` — build relatif + cache-busting (nom de fichier unique par
  build pour contourner tout cache navigateur résiduel).

---

## 2. Charte graphique KORA (contraintes respectées)

| Élément | Valeur |
|---------|--------|
| Thème par défaut | **Neumorphisme sombre** (`#1A1D24` / `#E0E5EC` / cacao `#241712`) |
| Police | Oswald (titres) + Source Sans Pro (texte) — `@fontsource/oswald` + `@fontsource/source-sans-3` |
| Accent | Corail `#FF6B4A` |
| Ombres | Douces, diffuses, teintées, faible opacité (~0.1–0.45), **pas** de glow néon (`0 0 Npx`) |
| Touch targets | iOS 44pt / Android 48dp, grille 8pt, marges 16dp |
| Mobile | bottom-nav centrée/équidistante (pas de bouton "Plus" superflu) |
| Desktop | rail 260px ; tablette rail 72px→hover expand |

> **Règle mémoire** : le thème sombre est **imposé** (`initTheme` force `"dark"`).
> Les icônes utilisent la **font Material Icons** importée en JS (pas `@import` CSS
> perdu au build). Les éléments flottants (FAB, barre de sélection) sont **centrés
> dans la zone de contenu** via l'attribut `[data-rail]`, pas en `left:0` fixe.

---

## 3. Écrans / Fonctionnalités

| Route | Vue | Contenu |
|-------|-----|---------|
| `#cockpit` | Tableau de bord | 4 statCards cliquables (Articles / Validés / En attente / Brouillons), santé système, sources, contrôle cycle, activité récente |
| `#facts` | Articles | Filtres (Tous / En attente / Transmis / Rejetés / Brouillons) + grille de cartes + barre de sélection multiple |
| `#drafts` | Brouillons | Articles en cours d'édition (décision `EDITED`) |
| `#trash` | Corbeille | Articles supprimés (restauration 11 jours) |
| `#sources` | Sources | Gouvernance de la whitelist (Niveau 1 / Niveau 2) |
| `#audit` | Validation / Historique | File HITL + journal d'activité |
| `#settings` | Paramètres | Compte, changement mot de passe, personnalisation, libellés |

### Bulles / barres flottantes
- **Barre de sélection multiple** (`#selectBar`) : apparaît en mode sélection (Articles) ;
  4 actions (Attente / Corbeille / Brouillon / Publier), centrée, 2 lignes sur mobile.
- **FAB cycle** : bouton flottant bas-droite (desktop) pour lancer un cycle.

---

## 4. Historique des corrections récentes (UI/UX)

Toutes déployées en production et vérifiées par tests Playwright (contexte frais, cache
désactivé) + capture visuelle.

| Commit | Correction |
|--------|-----------|
| `5a67da0` | Thème force **dark neumorphisme** par défaut (était en clair) |
| `0aaf7d1` | **Material Icons** importées en JS (icônes affichées comme texte brut avant) |
| `56f1245` | **Corbeille** ajoutée au menu (rail / drawer / bottom-nav / overflow) |
| `007a4da` | `checkAuth` `_checking` reset + boot route strip `/kora-v2` (dashboard vide après login) |
| `1b34494` | `checkAuth` idempotent + render guard (récursion `Maximum call stack`) |
| `a1c6591` | `factCard` fallback titre/source (évite `"undefined"` affiché) |
| `33a9e25` | **"Lancer un cycle"** (header) branché + état de vérité (busy/health) dans le statut |
| `3d8c453` | `cycle-force` + FAB désactivés pendant un cycle (verrou visuel) |
| `9385cdd` | Bulle sélection mobile : icône seule sur actions secondaires (plus de troncature) |
| `fe6563f` | Bulle sélection mobile : 2 lignes + icônes |
| `45a2ed8` | Carte "Validés" compte **APPROVED** uniquement (état de vérité) |
| `2c679ad` | `factGroup` affiche cartes sans image + état vide cohérent |
| `8278c89` | `viewFacts` : branches **transmitted/rejected** manquantes (page "undefined") |
| `afa1b56` | `viewFacts` : normalise `factFilter` en minuscules (bug `undefined` Transmis/Rejetés/Attente/Brouillons) |
| `babf162` | `factCard` `onerror` → **picsum** fiable (plus de placeholder vide) |
| *(courant)* | `factGroup` : branche **EDITED** ajoutée → filtre "Brouillons" dans Articles affiche les 4 brouillons |

### Bugs récurrents résolus (patterns)
1. **Cache navigateur** : après chaque déploiement, le navigateur (et le browser tool)
   garde l'ancien build. → `vite.config.js` génère un **nom de fichier unique par build**
   (`index-<BUILD_ID>.js`) + `?v=BUILD_ID` dans `index.html`. **L'utilisateur doit faire
   un `Ctrl+Maj+R`** pour voir les changements.
2. **Récursion** au boot/navigation → extraction de `boot()` hors de `bind()`,
   `checkAuth` idempotent, garde-fou `setState` (cap 8).
3. **Cohérence des filtres** : `factGroup` doit gérer TOUS les statuts
   (`PENDING_REVIEW`, `TRANSMITTED`, `REJECTED`, `EDITED`) ; `viewFacts` compare le
   filtre **normalisé en minuscules**.

---

## 5. Déploiement (VPS)

**Service** : `kora-reach` (systemd, port 8766, user `kora`), VPS `213.156.135.139`
(Debian 12). Front servi depuis `/opt/kora-reach/static/`.

### Backend
```bash
# Sur le VPS, repo cloné dans ~/kora-deploy
cd ~/kora-deploy
git pull
# (les fichiers Python sont copiés au build via le script de déploiement interne)
sudo systemctl restart kora-reach
```

### Frontend
```bash
cd ~/kora-deploy/kora-vite
npm install
npm run build
sudo cp -rf dist/. /opt/kora-reach/static/
sudo chown -R kora:kora /opt/kora-reach/static/
sudo systemctl restart kora-reach
sudo nginx -s reload      # IMPORTANT : le cache proxy nginx sert un index.html stale sinon
```

### Règle d'or (mémoire utilisateur)
- **Ne JAMAIS reset le mot de passe admin** pendant un déploiement (verrouillage du compte).
- Toujours `nginx -s reload` après copie du `dist/` (sinon l'ancien `index.html` est servi).
- Vérifier le build déployé : `cat /opt/kora-reach/static/index.html` + `curl` de l'API.

---

## 5b. Setup local (reprise par un tiers / dev)

Le dépôt est **récupérable et exploitable** : code source complet, aucun secret fuité,
docs métier solides. Procédure pas-à-pas pour faire tourner en local sans le VPS.

### Prérequis
- Python 3.10+ et Node 18+ installés.
- Une base **PostgreSQL** (recommandée) OU SQLite si le backend le supporte en dev.
- (Optionnel) comptes Supabase / WordPress / FAL / Ollama pour les intégrations.

### Backend
```bash
git clone https://github.com/moelohimmara-dotcom/kora-reach-v3.git
cd kora-reach

# 1) Environnement virtuel
python3 -m venv .venv
source .venv/bin/activate

# 2) Dépendances (toutes listées dans requirements.txt)
pip install -r requirements.txt

# 3) Configuration d'environnement
cp deploy/.env.example .env
# Éditer .env et renseigner AU MINIMUM :
#   PG_HOST / PG_PORT / PG_DATABASE / PG_USER / PG_PASSWORD
#   ADMIN_USER / ADMIN_PASS
#   (le reste peut rester vide en dev)
nano .env

# 4) Base de données
# Créer la base + lancer les migrations (voir docs/ ou deploy/*.sql si présents)
createdb kora
# (scripts de migration éventuels dans le dossier deploy/ ou docs/)

# 5) Lancer le serveur (stdlib http.server, ThreadingHTTPServer)
python server.py
# → écoute sur $PORT (défaut 8766), sert kora-vite/dist + /api/*
```

### Frontend (dev)
```bash
cd kora-vite
npm install
npm run dev          # Vite dev server (HMR) sur http://localhost:5173
# ou build + sert le dist via le backend :
npm run build
# le backend sert alors ./kora-vite/dist (KORA_STATIC)
```

### Vérification
```bash
curl -k https://localhost:8766/api/health        # ou /api/facts
# Login admin
curl -k -X POST https://localhost:8766/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"<ADMIN_PASS>"}' -c cookies.txt
```

### Points d'attention pour le repreneur
- **`requirements.txt`** contient toutes les libs importées (dont `psycopg2-binary`,
  `paramiko`). Vérifie après install qu'aucun `ModuleNotFoundError` ne survient.
- **`.env.example`** liste **toutes** les variables lues par le code. Toute variable
  manquante fait crasher le boot (ex : `PG_PASSWORD` requis pour PostgreSQL).
- Le serveur est en **stdlib** (`http.server`), pas aiohttp/flask — aucune dépendance
  web lourde n'est requise.
- Le front utilise un **cache-busting par build** (`vite.config.js`) : après un rebuild,
  forcer un reload (`Ctrl+Maj+R`) côté navigateur.

---

## 6. Authentification

- Endpoint : `POST /kora-v2/api/auth/login` → `Set-Cookie kora_sid`
- Cookie : `kora_sid`, `Path=/kora-v2/`, `SameSite=Lax`, `Secure`, `HttpOnly`
- Hash : **PBKDF2-SHA256** (rounds configurables via `KORA_PBKDF2_ROUNDS`)
- Admin (prod) : `admin` / mot de passe dans `/opt/kora-reach/deploy/.env` (`ADMIN_PASS`)
- Rate-limit login : 20 tentatives / 10 min par IP (mémoire)
- Reset mot de passe : email + token temporisé (`KORA_RESET_TTL_MIN`)

> ⚠️ Le fichier `.env` contient des secrets (DB password, admin pass, clés API) et est
> **gitignored** — il n'est **jamais** commité ni poussé sur GitHub.

---

## 7. Bonnes pratiques de dépannage (validateurs)

1. **Tester le réel**, ne pas théoriser : Playwright en contexte frais avec
   `Cache-Control: no-store` + `serviceWorkers: 'block'` + `caches.delete()`.
2. **Isoler la zone** : ne modifier QUE la fonction/le sélecteur CSS concerné (pas de
   dérapage sur le rendu global).
3. **Vérifier par le code + le DOM**, pas par l'œil du modèle de vision (il lisse les
   défauts). Capturer une vraie capture d'écran et la confirmer.
4. **Commit + push AVANT de déclarer fini** : un fichier modifié non committé ne sera pas
   servi par le VPS (cause racine d'une Corbeille manquante par le passé).
5. **Reload forcé** côté utilisateur (`Ctrl+Maj+R`) après chaque déploiement.

---

## 8. Structure du dépôt

```
kora-reach/
├── README.md                 # ce fichier
├── .gitignore                # secrets, dist/, node_modules/, artifacts de debug
├── auth.py  server.py  db.py  config.py
├── reach_agent.py  writer.py  hitl_store.py  normalizer.py  illustrate.py
├── deploy/                   # systemd units (.service), .env (gitignored)
├── kora-vite/
│   ├── vite.config.js
│   ├── package.json
│   ├── dist/                 # build généré (gitignored)
│   └── src/
│       ├── main.js  app.js  store.js  shell.js  icons.js  style.css
│       └── (m3-backup/ ignoré — ancienne version non déployée)
└── _quarantine/  test-results/  __test__/   # artifacts locaux (gitignored)
```

---

## 9. URLs

- **App (prod)** : `https://213-156-135-139.sslip.io/kora-v2/#cockpit`
- API : `https://213-156-135-139.sslip.io/kora-v2/api/...`
- Admin : `admin` / (voir `deploy/.env` → `ADMIN_PASS`)

---

*Dernière mise à jour : 2026-08-13 — corrections UI/UX terminées et déployées.*
