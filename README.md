# KORA Reach v3

Agent de veille et de rédaction assistée (fact-checking, clustering, publication).
Frontend cockpit dark (vanilla JS + Vite) + backend Python (API REST, Postgres).

> **Design system** : KORA dark. La charte, les tokens et les règles vivent dans
> **[`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md)** — **seule source de vérité** (ne pas
> redupliquer les valeurs ici, sous peine de redérive). Vérification vivante : route `/style-guide`.

---

## Architecture

```
Navigateur
   │  HTTPS (443)
   ▼
nginx  (sites-enabled/kora-reach)
   ├─ /            → /opt/kora-reach/static/          (front KORA, SPA)
   ├─ /kora-v2/    → /opt/kora-reach/static/          (front legacy)
   └─ /kora-v2/api/→ proxy 127.0.0.1:8766            (backend)
                                          │
                              Backend Python (systemd: kora-reach)
                                server.py  (port 8766)
                                  └─ Postgres 127.0.0.1:5432 (db: kora)
```

### Composants
| Élément | Emplacement (VPS) | Rôle |
|---|---|---|
| Frontend servi | `/opt/kora-reach/static/` | Build Vite (`dist/`) copié ici |
| Frontend source | `kora-vite/` (ce repo) | Vite + vanilla JS (app.js, style.css) |
| Backend | `/opt/kora-reach/` (server.py + modules) | API REST, agents, DB |
| Venv backend | `/opt/kora-reach/.venv/` | Python + psycopg2 |
| Config env | `/opt/kora-reach/deploy/.env` | Secrets (jamais committés) |
| nginx | `/etc/nginx/sites-enabled/kora-reach` | Reverse proxy + static |
| Service | `systemctl kora-reach` | Démarre le backend (port 8766) |

### Sources du repo
- `kora-vite/` — frontend (Vite, build → `dist/`)
- `*.py` à la racine — backend (server.py, db.py, auth.py, hitl_store.py, …)
- `deploy/` — scripts de déploiement
- `maquettes-dark/` — référence visuelle (HTML dark, counts live)
- `nginx_kora-reach.conf` — config nginx de référence (copiée dans sites-enabled)

---

## Prérequis (machine locale / CI)

- Node.js ≥ 18 + npm
- Python ≥ 3.11 (le backend utilise un venv sur le VPS)
- Accès SSH au VPS (clé `~/.ssh/kora_ed25519`), user `remote`
- Un clone de ce repo (`git clone … && git checkout master`)

---

## Setup local (dev frontend)

```bash
# 1. Frontend
cd kora-vite
npm install
npm run dev          # serveur Vite local (http://localhost:5173)

# 2. Pour pointer le front local vers le backend de prod (optionnel) :
#    BASE = "/kora-v2" est codé en dur dans app.js ; le backend prod tourne
#    sur https://<VPS>/kora-v2/api/. En local, utilise un tunnel ou un proxy.
```

Le backend n'est pas lancé en local (dépend de la DB Postgres du VPS).
Pour tester le front localement sans backend, voir `CONTRIBUTING.md` (mode démo).

---

## Build & Déploiement (frontend → VPS)

Workflow validé (non-destructif) :

```bash
cd kora-vite
npm install                          # si node_modules absent
rm -rf node_modules/.vite dist
npm run build                        # → dist/

# Copier le build vers le VPS
scp -r dist/. remote@213.156.135.139:/opt/kora-reach/static/
ssh remote@213.156.135.139 "sudo chown -R kora:kora /opt/kora-reach/static/"
ssh remote@213.156.135.139 "sudo nginx -s reload"          # sinon index.html en cache
ssh remote@213.156.135.139 "sudo systemctl restart kora-reach"
```

**Ordre critique** : `cp` → `chown kora:kora` → `nginx -s reload` → `restart kora-reach`.
Sans `nginx -s reload`, nginx sert un `index.html` stale (cache proxy).

---

## Rollback non-destructif (RÈGLE KORA)

**Jamais** `git reset --hard` / `git push --force` en prod.

Pour annuler une modif frontend sans casser l'historique :

```bash
# 1. Restaurer les fichiers frontend à un commit connu bon
git checkout <commit-bon> -- kora-vite/src/app.js kora-vite/src/style.css

# 2. Rebuild + redeploy (voir ci-dessus)
# 3. Committer le retour-arrière
git add -A && git commit -m "revert(front): retour <commit-bon>"
git push origin master
```

Exemple réel : `git checkout bed6443 -- kora-vite/src/*` puis commit (revert BizLink).

---

## Secrets & sécurité

- **Aucun secret dans le repo**. `.env` est gitignoré. `.env.example` liste les
  variables (valeurs masquées).
- Le backend lit `PG_PASSWORD` depuis `deploy/.env` (EnvironmentFile systemd).
- Le serveur n'expose que des `SELECT` côté dashboard interne ; l'API principale
  est protégée par session (`kora_sid`, HttpOnly, Secure, SameSite=Lax).
- Chemins sensibles : ne jamais committer `.htpasswd`, `deploy/.env`, clés API.

---

## Fail2Ban & accès SSH (anti-blocage déploiement)

Fail2Ban protège SSH (et nginx). Config versionnée dans `deploy/fail2ban/`.

**Install / restore** :
```bash
sudo cp deploy/fail2ban/kora.local /etc/fail2ban/jail.d/kora.local
sudo cp deploy/fail2ban/sshd.conf /etc/fail2ban/jail.d/sshd.conf
sudo fail2ban-client reload
```

**Hardening 2026-08-15** (évite qu'un déploiement légitime se fasse auto-bannir) :
- `maxretry` sshd : `3 → 10` (tolère les tentatives de connexion répétées du sandbox).
- `ignoreip` : réseaux internes + IP publique du VPS (`213.156.135.139`) whitelistés.
- `banaction = ufw` (les bans ajoutent des règles REJECT ufw).

**Si le déploiement est bloqué (SSH `Connection refused`, web `000`)** :
1. Vérifier si l'IP est bannie : `sudo fail2ban-client status sshd`
2. Dé-banner (une IP à la fois) :
   ```bash
   sudo fail2ban-client set sshd unbanip <IP>
   ```
   (`unban --all` n'est PAS supporté par cette version — dé-banner IP par IP.)
3. Si la VM est injoignable en SSH mais accessible via la console KVM du provider,
   utiliser la console pour dé-banner, puis redémarrer si besoin :
   `sudo systemctl start sshd`.

> Note : un `Connection refused` alors que `sshd` tourne (`systemctl status sshd` →
> active) + `ss -ltnp | grep :22` → `0.0.0.0:22` = IP bannie par Fail2Ban, pas un
> service down. Dé-banner règle le problème sans reboot.

---

## Chemins utiles (prod)

| URL | Contenu |
|---|---|
| `https://<VPS>/` | Cockpit KORA (SPA, dark) |
| `https://<VPS>/#cockpit` | Vue tableau de bord |
| `https://<VPS>/kora-v2/api/health` | Santé backend (JSON) |
| `https://<VPS>/kora-v2/maquettes/` | Maquettes dark de référence |

VPS actuel : `213.156.135.139` (host `213-156-135-139.sslip.io`).

---

## Structure des données (backend = source unique)

Tous les compteurs du cockpit viennent de `get_dashboard_stats()` (backend).
Le front consomme `s.stats.*` — **ne jamais recalculer côté front**.

Tables principales : `articles`, `audit_events`, `hitl_decisions`, `hitl_facts`,
`kora_config`, `kora_sessions`, `kora_users`.
