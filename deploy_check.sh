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
