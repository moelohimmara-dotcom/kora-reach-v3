# Environnement de test (staging)

Mis en place le 2026-08-27 — point le plus grave après les sauvegardes
identifié le 26/08 : jusqu'ici, tout test (y compris la non-régression
automatisée de `deploy_check.sh`) tournait directement contre la prod.

## Ce que c'est

Une copie complète et isolée de KORA, sur le même VPS, jamais capable de
toucher aux vraies données du client ni de publier réellement sur WordPress :

| | Production | Staging |
|---|---|---|
| Service systemd | `kora-reach` | `kora-reach-staging` |
| Port | 8766 | 8768 |
| Base Postgres | `kora` | `kora_staging` (clone périodique de `kora`, jamais l'inverse) |
| Code | `/opt/kora-reach` | `/opt/kora-reach-staging/repo` |
| URL | `https://213.156.135.139.sslip.io/kora-v2/` | `https://staging.213.156.135.139.sslip.io/kora-v2/` |
| Certificat TLS | Let's Encrypt dédié | Let's Encrypt dédié (sous-domaine séparé, exprès pour ne jamais partager de cookie de session avec la prod) |
| WordPress | Identifiants réels présents | **Aucun identifiant WordPress dans `deploy/.env`** -- `publishing/transmit.mode()` retombe forcément sur un mode sans appel réseau réel vers kakilambe.com. Ne jamais ajouter WP_URL/WP_USER/WP_APP_PASS ici. |

## Pourquoi une base "kora_staging" séparée plutôt que partagée

Un test qui modifie/supprime des données doit pouvoir le faire sans aucun
risque pour les vraies données éditoriales. `kora_staging` est semée à partir
d'un vrai dump de production (voir ci-dessous), donc les tests restent
réalistes, mais rien de ce qui s'y passe ne remonte jamais vers `kora`.

## Rafraîchir les données de staging depuis un vrai backup

```bash
# Sur le VPS
sudo -u kora pg_dump -Fc kora -f /opt/kora-reach/backups/staging_seed.dump
sudo -u postgres psql -c "DROP DATABASE kora_staging;"
sudo -u postgres psql -c "CREATE DATABASE kora_staging OWNER kora;"
sudo -u kora pg_restore -d kora_staging /opt/kora-reach/backups/staging_seed.dump
sudo rm -f /opt/kora-reach/backups/staging_seed.dump
```

## Mettre à jour le code de staging

```bash
cd /opt/kora-reach-staging/repo
sudo -u kora git pull
cd kora-vite && sudo -u kora npm install --no-audit --no-fund && sudo -u kora npm run build
sudo -u kora cp -rf dist/. ../static/
sudo systemctl restart kora-reach-staging
```

## Fichiers de config versionnés ici

- `kora-reach-staging.service` → `/etc/systemd/system/kora-reach-staging.service`
- `kora-reach-staging.nginx.conf` → `/etc/nginx/sites-available/kora-reach-staging` (+ symlink `sites-enabled`)

## Compte de test

`kora_test_bot` (role `advanced`) existe dans les deux bases (`kora` et
`kora_staging`) -- identifiants dans `deploy/.env` (`KORA_TEST_USER`/
`KORA_TEST_PASS`), jamais en dur dans le code (voir incident du 2026-08-23).
