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
# -- voir incident de sécurité du 2026-08-23) : extraits ponctuellement de
# deploy/.env via sudo (ce fichier appartient à kora, illisible par
# l'utilisateur `remote` qui exécute ce script -- un `source` direct échoue
# en permission refusée). On ne récupère QUE ces 2 variables, jamais tout le
# fichier : ce script n'a pas besoin des autres secrets qu'il contient
# (clés API LLM, etc.), inutile de les charger dans son environnement.
export KORA_TEST_USER="$(sudo grep '^KORA_TEST_USER=' "$REMOTE_APP/deploy/.env" | head -1 | cut -d= -f2-)"
export KORA_TEST_PASS="$(sudo grep '^KORA_TEST_PASS=' "$REMOTE_APP/deploy/.env" | head -1 | cut -d= -f2-)"
if [ -z "$KORA_TEST_USER" ] || [ -z "$KORA_TEST_PASS" ]; then
  echo "ERREUR: KORA_TEST_USER/KORA_TEST_PASS introuvables dans $REMOTE_APP/deploy/.env"
  exit 1
fi
export TMPDIR="$HOME/tmp"
mkdir -p "$TMPDIR"

cd "$APP_DIR/kora-vite"

# Convention d'exit code des 3 scripts (déjà en place AVANT ce fichier,
# vérifié dans leur code) : 0 = succès propre, 2 = succès MAIS avec du bruit
# JS non bloquant (ex: 403 sur une image externe hors de notre contrôle),
# 1 = vrai échec (au moins une assertion a réellement échoué). Bug trouvé en
# testant ce script en conditions réelles (2026-08-26) : `if node ...; then`
# traite TOUT code non nul comme un échec, donc un exit 2 (bruit, pas un
# echec) declenchait un rollback pour rien -- corrige en verifiant le code
# reel plutot que le succes/echec binaire de bash.
run_suite() {
  local name="$1"; shift
  # set +e/-e autour de l'appel : sans ca, `set -e` (actif en tete de ce
  # fichier) ferait avorter le script des qu'un exit 1 OU 2 survient, avant
  # meme que `local code=$?` ait la moindre chance de lire le vrai code
  # (et `node ... || true` masquerait $? avec celui de `true`, tout aussi
  # inutilisable -- d'ou ce toggle explicite plutot qu'un simple `|| true`).
  set +e
  node "$@"
  local code=$?
  set -e
  if [ "$code" -eq 0 ] || [ "$code" -eq 2 ]; then
    if [ "$code" -eq 2 ]; then
      echo "${name}_PASS (avec bruit JS non bloquant, voir logs ci-dessus)"
    else
      echo "${name}_PASS"
    fi
    return 0
  fi
  echo "${name}_FAIL (code $code)"
  rollback
  exit 1
}

echo "==> Smoke test (non-régression A)"
run_suite SMOKE_A smoke_test.mjs "https://213.156.135.139.sslip.io/kora-v2"

echo "==> Parcours B (Sources/Params/Audit/Corbeille/Sélection)"
run_suite SMOKE_B test_parcours_b.mjs "https://213.156.135.139.sslip.io/kora-v2"

echo "==> Parcours C (Vidéos/Bandeau de cycle/Notifications)"
run_suite SMOKE_C test_parcours_c.mjs "https://213.156.135.139.sslip.io/kora-v2"

echo "DEPLOY_OK_ALL_PASS"
# Ne garde que les 5 dernières sauvegardes de rollback (évite d'accumuler
# indéfiniment -- chaque sauvegarde fait la taille de tout le déploiement).
ls -1dt "$HOME"/kora-rollback-* 2>/dev/null | tail -n +6 | xargs -r sudo rm -rf
