#!/usr/bin/env bash
# deploy_check.sh — Déploiement KORA + test de non-régression (smoke)
# Usage (depuis ~/kora-deploy sur le VPS) : bash deploy_check.sh
# Build le front, déploie, redémarre, puis lance le smoke test.
# Échoue (exit 1) si le smoke test détecte une régression.
set -e

APP_DIR="$HOME/kora-deploy"
REMOTE_STATIC="/opt/kora-reach/static"
SERVICE="kora-reach"

echo "==> Build frontend"
cd "$APP_DIR/kora-vite"
npm run build

echo "==> Déploiement statique"
sudo cp -rf dist/. "$REMOTE_STATIC/"
sudo chown -R kora:kora "$REMOTE_STATIC/"

# Déploiement backend (2026-08-22, correctif : cette étape n'existait pas --
# seul le frontend était synchronisé, /opt/kora-reach/server.py restait figé
# quel que soit le nombre de "git pull" + rebuild sur $APP_DIR. Découvert en
# déployant la page Vidéos : /api/videos répondait 404 malgré un dépôt à jour.
# cp SANS --delete/-rsync : ne touche que les fichiers listés ici, ne purge
# jamais les scripts/diagnostics ad hoc déjà présents dans /opt/kora-reach.)
echo "==> Déploiement backend"
cd "$APP_DIR"
REMOTE_APP="/opt/kora-reach"
sudo cp -f server.py "$REMOTE_APP/server.py"
for d in collection core editorial generation identity orchestration publishing; do
  sudo cp -rf "$d/." "$REMOTE_APP/$d/"
done
sudo chown -R kora:kora "$REMOTE_APP/server.py" $(for d in collection core editorial generation identity orchestration publishing; do echo "$REMOTE_APP/$d"; done)

echo "==> Restart service + nginx reload"
sudo systemctl restart "$SERVICE"
sudo nginx -s reload

echo "==> Smoke test (non-régression A)"
export TMPDIR="$HOME/tmp"
if node smoke_test.mjs "https://213-156-135-139.sslip.io/kora-v2"; then
  echo "SMOKE_A_PASS"
else
  echo "SMOKE_A_FAIL"
  exit 1
fi

echo "==> Parcours B (Sources/Params/Audit/Corbeille/Sélection)"
if node test_parcours_b.mjs "https://213-156-135-139.sslip.io/kora-v2"; then
  echo "SMOKE_B_PASS"
else
  echo "SMOKE_B_FAIL"
  exit 1
fi

echo "DEPLOY_OK_ALL_PASS"
