# README-DEPLOY.md — Déploiement VPS blindé de KORA Reach

> Ce fichier couvre l'INSTALLATION INITIALE d'un VPS neuf. Pour déployer
> une mise à jour sur le VPS de production déjà en place, voir
> [`DEPLOY-RUNBOOK.md`](DEPLOY-RUNBOOK.md) — architecture réelle, procédure
> humaine (`deploy_check.sh`) et procédure agent (`agent-deploy.sh`).

## Prérequis
- VPS Debian/Ubuntu (ex. 213.156.135.139), accès root
- nginx, python3.11+, git, ufw, fail2ban
- Un nom de domaine pointant vers le VPS (ex. kora.tondomaine.com)

## 1. Préparer les credentials (CÔTÉ VPS, jamais dans le repo)
```bash
cd /opt/kora-reach/deploy
nano .env   # remplir SUPABASE_URL/KEY, WP_USER/APP_PASS
chmod 600 .env
```
⚠️ Clés à RÉVOQUER après le test et recréer des clés dédiées « KORA ».

## 2. Lancer le déploiement
```bash
bash /opt/kora-reach/deploy/install.sh
```

## 3. HTTPS
```bash
certbot --nginx -d kora.tondomaine.com
```

## 4. Vérifier
```bash
systemctl status kora-reach
curl -s http://localhost:8765/api/health
curl -s http://localhost:8765/api/whitelist | head -c 200
```

## 5. Sécuriser SSH (OBLIGATOIRE après coup)
- Créer une clé SSH ed25519 côté admin, ajouter la pub dans `/root/.ssh/authorized_keys`
- `nano /etc/ssh/sshd_config` → `PasswordAuthentication no`, `PermitRootLogin prohibit-password`
- `systemctl restart ssh`
- Changer le mot de passe root : `passwd root`
- `bash /opt/kora-reach/deploy/ufw-setup.sh`

## Blinding en résumé
- Service en user non-root `kora`, `NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=strict`
- `.env` 600, jamais versionné
- nginx en reverse proxy (8765 non exposé), rate-limit, headers sécu, CSP
- UFW : 22/80/443 seulement
- fail2ban : SSH + nginx
- HTTPS obligatoire (certbot)

## Variables critiques
| Var | Usage | Secret |
|-----|-------|--------|
| SUPABASE_KEY | écriture articles HITL | OUI (service_role) |
| WP_APP_PASS | publication WP | OUI (app-password) |
| _(aucune)_ | images de couverture : sources réelles + repli stock (LoremFlickr/Picsum), rien à configurer (2026-08-21) | - |
| EDITOR_NAME | attribution HITL | non |

## Rollback
`systemctl stop kora-reach` + `rm /etc/nginx/sites-enabled/kora-reach`.
