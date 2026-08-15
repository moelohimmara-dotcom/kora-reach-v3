# Contributing — KORA Reach

Guide pour reprendre le projet à froid (clone → run → modifier → déployer).

## 1. Clone & install

```bash
git clone <repo> kora-reach
cd kora-reach
git checkout master

# Frontend
cd kora-vite && npm install && cd ..

# Backend (sur le VPS uniquement — dépend de Postgres)
# Le venv existe déjà sur le VPS : /opt/kora-reach/.venv
```

## 2. Configuration env

```bash
cp .env.example /opt/kora-reach/deploy/.env   # côté VPS
# Renseigner les vraies valeurs (jamais committées)
```

Variables requises (voir `.env.example`) :
`ADMIN_USER`, `ADMIN_PASS`, `ADMIN_EMAIL`, `PG_PASSWORD`,
`DATABASE_BACKEND`, `KORA_HTTPS`, `KORA_PUBLIC_HOST`,
`NVIDIA_API_KEY`, `OLLAMA_API_KEY`, `OLLAMA_MODEL`, `TR_KEY`.

## 3. Dev frontend en local

```bash
cd kora-vite
npm run dev          # http://localhost:5173
```

Le front appelle `BASE = "/kora-v2"` (codé en dur dans `app.js`).
Pour tester contre le backend de prod, utilise un tunnel :

```bash
ssh -L 8766:127.0.0.1:8766 remote@213.156.135.139   # puis cible 127.0.0.1:8766
```

**Mode démo** (sans backend) : un dashboard interne séparé peut servir des
données factices si la DB est injoignable — voir `server.py` (fallback DEMO).
Le cockpit principal nécessite le backend.

## 4. Conventions de code

- **Frontend** : vanilla JS (`app.js`), CSS simple (`style.css`). Pas de framework UI.
  - Icônes = SVG inline (Material), **jamais d'emoji**.
  - Mobile-first ; tablette/desktop par media queries (`767px` / `1024px`).
  - Design system dark (`style.css` → tokens `--bg`, `--accent`, …).
- **Backend** : Python stdlib + psycopg2. Modules à plat (`db.py`, `auth.py`, …).
- **Commits** : préfixe type + scope (`feat(cockpit):`, `fix(front):`, `revert(front):`).

## 5. Workflow non-destructif (OBLIGATOIRE)

1. Modifier le code dans `kora-vite/` (front) ou `*.py` (back).
2. `npm run build` (front) → `dist/`.
3. Déployer (voir README « Build & Déploiement »).
4. **Vérifier en production** (curl `/api/health`, ou capture navigateur) AVANT de dire fini.
5. `git add -A && git commit && git push origin master`.
6. Jamais `git reset --hard` / `git push --force` en prod.
7. Pour annuler : `git checkout <bon> -- <fichiers>` puis commit de revert.

## 6. Tests & vérification

- Santé backend : `curl https://<VPS>/kora-v2/api/health` → `{"status":"ok"}`.
- Compteurs : comparer `s.stats.*` (front) vs `get_dashboard_stats()` (back).
- UI : capture navigateur desktop + mobile (≤820px) requise avant livraison.
- Script de vérif interne : `scripts/verify_stats.py`.

## 7.À éviter (leçons projet)

- ❌ Écraser un compte admin en prod (non-destructive rule).
- ❌ `rm` aveugle sur le VPS ; préférer `git checkout` pour rollback.
- ❌ Secrets en clair dans le repo ou les logs.
- ❌ Build sans `nginx -s reload` après (cache index.html).
- ❌ Modifier le front sans vérifier le rendu réel (DOM, pas de théorie).
