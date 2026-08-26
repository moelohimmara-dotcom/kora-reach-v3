#!/usr/bin/env bash
# deploy_check.sh — Déploiement KORA + test de non-régression (smoke) + rollback auto
# Usage (depuis ~/kora-deploy sur le VPS) : bash deploy_check.sh
# Build le front, sauvegarde l'existant, déploie, redémarre, puis lance les 3
# suites de non-régression. Si UNE SEULE échoue : restaure automatiquement
# la version précédente et redémarre dessus -- ne laisse JAMAIS une prod
# cassée en place après un échec de ce script (2026-08-26, correctif :
# avant ce changement, un `exit 1` sur smoke test laissait le déploiement
# fautif tel quel, sans aucun retour arrière).
set -e

APP_DIR="$HOME/kora-deploy"
REMOTE_STATIC="/opt/kora-reach/static"
REMOTE_APP="/opt/kora-reach"
SERVICE="kora-reach"
BACKEND_DIRS="collection core editorial generation identity orchestration publishing"
BACKUP_ROOT="$HOME/kora-rollback-$(date +%Y%m%d%H%M%S)"

echo "==> Sauvegarde de l'existant (rollback possible) -> $BACKUP_ROOT"
mkdir -p "$BACKUP_ROOT"
sudo cp -a "$REMOTE_STATIC" "$BACKUP_ROOT/static"
sudo cp -a "$REMOTE_APP/server.py" "$BACKUP_ROOT/server.py"
for d in $BACKEND_DIRS; do
  sudo cp -a "$REMOTE_APP/$d" "$BACKUP_ROOT/$d"
done

# Repli automatique : restaure la sauvegarde ci-dessus et redémarre dessus.
# Appelé UNIQUEMENT si un smoke test échoue APRES un déploiement déjà en
# place -- jamais sur un échec de build (rien n'a encore été déployé à ce
# stade, restaurer ne changerait rien).
rollback() {
  echo "==> ROLLBACK: restauration de la version précédente ($BACKUP_ROOT)"
  sudo cp -rf "$BACKUP_ROOT/static/." "$REMOTE_STATIC/"
  sudo cp -f "$BACKUP_ROOT/server.py" "$REMOTE_APP/server.py"
  for d in $BACKEND_DIRS; do
    sudo cp -rf "$BACKUP_ROOT/$d/." "$REMOTE_APP/$d/"
  done
  sudo chown -R kora:kora "$REMOTE_STATIC" "$REMOTE_APP/server.py" $(for d in $BACKEND_DIRS; do echo "$REMOTE_APP/$d"; done)
  sudo systemctl restart "$SERVICE"
  echo "==> ROLLBACK terminé -- la version précédente est de nouveau en ligne."
}

echo "==> Build frontend"
cd "$APP_DIR/kora-vite"
npm run build

echo "==> Déploiement statique"
sudo cp -rf dist/. "$REMOTE_STATIC/"
sudo chown -R kora:kora "$REMOTE_STATIC/"

echo "==> Déploiement backend"
cd "$APP_DIR"
sudo cp -f server.py "$REMOTE_APP/server.py"
for d in $BACKEND_DIRS; do
  sudo cp -rf "$d/." "$REMOTE_APP/$d/"
done
sudo chown -R kora:kora "$REMOTE_APP/server.py" $(for d in $BACKEND_DIRS; do echo "$REMOTE_APP/$d"; done)

echo "==> Restart service + nginx reload"
sudo systemctl restart "$SERVICE"
# Attente ACTIVE réelle (pas un sleep fixe -- le service peut mettre
# plusieurs secondes selon ce qu'il a à finir avant de redémarrer).
for i in $(seq 1 30); do
  systemctl is-active --quiet "$SERVICE" && break
  sleep 2
done
sudo nginx -s reload

# Identifiants du compte de TEST (2026-08-26, jamais en dur dans les scripts
# -- voir incident de sécurité du 2026-08-23) : lus depuis deploy/.env,
# JAMAIS commis dans le dépôt.
set -a
source "$REMOTE_APP/deploy/.env"
set +a
export TMPDIR="$HOME/tmp"
mkdir -p "$TMPDIR"

cd "$APP_DIR/kora-vite"

echo "==> Smoke test (non-régression A)"
if node smoke_test.mjs "https://213-156-135-139.sslip.io/kora-v2"; then
  echo "SMOKE_A_PASS"
else
  echo "SMOKE_A_FAIL"
  rollback
  exit 1
fi

echo "==> Parcours B (Sources/Params/Audit/Corbeille/Sélection)"
if node test_parcours_b.mjs "https://213-156-135-139.sslip.io/kora-v2"; then
  echo "SMOKE_B_PASS"
else
  echo "SMOKE_B_FAIL"
  rollback
  exit 1
fi

echo "==> Parcours C (Vidéos/Bandeau de cycle/Notifications)"
if node test_parcours_c.mjs "https://213-156-135-139.sslip.io/kora-v2"; then
  echo "SMOKE_C_PASS"
else
  echo "SMOKE_C_FAIL"
  rollback
  exit 1
fi

echo "DEPLOY_OK_ALL_PASS"
# Ne garde que les 5 dernières sauvegardes de rollback (évite d'accumuler
# indéfiniment -- chaque sauvegarde fait la taille de tout le déploiement).
ls -1dt "$HOME"/kora-rollback-* 2>/dev/null | tail -n +6 | xargs -r sudo rm -rf
