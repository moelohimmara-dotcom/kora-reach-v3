#!/usr/bin/env bash
# deploy/agent-deploy.sh — Déploiement direct KORA Reach v3 sans passer par
# /home/remote/kora-deploy (2026-08-22, refacto plan étape 3).
#
# À LANCER DEPUIS LA MACHINE DE DEV/AGENT (pas sur le VPS), à la racine du
# dépôt cloné localement. Usage :
#
#   KORA_SSH_KEY=~/.ssh/kora_client_key bash deploy/agent-deploy.sh [--with-backend] [--skip-smoke]
#
# Ce script est le pendant "sans mot de passe remote" de deploy_check.sh
# (qui, lui, tourne SUR le VPS depuis /home/remote/kora-deploy, avec sudo
# interactif). Ici on utilise directement la clé dédiée kora_client_key
# (lecture/écriture de /opt/kora-reach/, PAS de sudo) pour tout le
# déploiement de fichiers, et on ne sollicite sudo qu'au tout dernier
# moment, pour le redémarrage du service -- voir la section "Redémarrage"
# ci-dessous et deploy/DEPLOY-RUNBOOK.md pour le contexte complet.
#
# Pourquoi ce script existe : c'est la procédure suivie MANUELLEMENT, étape
# par étape, tout au long de la session du 17 au 22/08/2026 (tar+ssh+sha256,
# cf. historique de commits) -- codifiée ici pour ne plus jamais avoir à la
# reconstruire de mémoire ni à deviner les chemins/commandes exactes.
set -euo pipefail

KEY="${KORA_SSH_KEY:-$HOME/.ssh/kora_client_key}"
HOST="kora@213.156.135.139"
REMOTE_APP="/opt/kora-reach"
PUBLIC_URL="https://213.156.135.139.sslip.io/kora-v2"
WITH_BACKEND=0
SKIP_SMOKE=0
for arg in "$@"; do
  case "$arg" in
    --with-backend) WITH_BACKEND=1 ;;
    --skip-smoke) SKIP_SMOKE=1 ;;
    *) echo "Argument inconnu : $arg" >&2; exit 2 ;;
  esac
done

if [ ! -f "$KEY" ]; then
  echo "ERREUR : clé SSH introuvable ($KEY). Fournir KORA_SSH_KEY=chemin/vers/kora_client_key." >&2
  exit 1
fi
if [ ! -d kora-vite ] || [ ! -f server.py ]; then
  echo "ERREUR : lancer ce script depuis la racine de kora-reach-v3 (kora-vite/ et server.py doivent être visibles)." >&2
  exit 1
fi

SSH() { ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$HOST" "$@"; }
SCP_IN() { ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$HOST" "cat > $1" < "$2"; }

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "==> [1/6] Build frontend"
( cd kora-vite && npm run build )

echo "==> [2/6] Empaquetage + envoi du frontend (tar+ssh+sha256)"
tar -czf "$WORKDIR/dist.tar.gz" -C kora-vite/dist .
LOCAL_SHA=$(sha256sum "$WORKDIR/dist.tar.gz" | cut -d' ' -f1)
SCP_IN "/home/kora/dist.tar.gz" "$WORKDIR/dist.tar.gz"
REMOTE_SHA=$(SSH "sha256sum /home/kora/dist.tar.gz | cut -d' ' -f1")
if [ "$LOCAL_SHA" != "$REMOTE_SHA" ]; then
  echo "ERREUR : sha256 différent après transfert (local=$LOCAL_SHA distant=$REMOTE_SHA) -- ABANDON, rien n'est déployé." >&2
  exit 1
fi
echo "    sha256 vérifié : $LOCAL_SHA"

echo "==> [3/6] Déploiement statique (backup horodaté avant écrasement)"
SSH "set -e
TS=\$(date +%Y%m%d-%H%M%S)
cd $REMOTE_APP
cp -a static static.bak.\$TS
rm -rf /home/kora/dist_new && mkdir -p /home/kora/dist_new
tar -xzf /home/kora/dist.tar.gz -C /home/kora/dist_new
rm -rf static/assets static/index.html
cp -a /home/kora/dist_new/. static/
rm -rf /home/kora/dist.tar.gz /home/kora/dist_new
echo 'STATIC_DEPLOYED (backup: static.bak.'\$TS')'
"

if [ "$WITH_BACKEND" = "1" ]; then
  echo "==> [4/6] Empaquetage + envoi du backend (server.py + modules)"
  tar -czf "$WORKDIR/backend.tar.gz" \
    server.py collection core editorial generation identity orchestration publishing
  LOCAL_SHA=$(sha256sum "$WORKDIR/backend.tar.gz" | cut -d' ' -f1)
  SCP_IN "/home/kora/backend.tar.gz" "$WORKDIR/backend.tar.gz"
  REMOTE_SHA=$(SSH "sha256sum /home/kora/backend.tar.gz | cut -d' ' -f1")
  if [ "$LOCAL_SHA" != "$REMOTE_SHA" ]; then
    echo "ERREUR : sha256 backend différent après transfert -- ABANDON du volet backend (le frontend, lui, est déjà déployé ci-dessus)." >&2
    exit 1
  fi
  SSH "set -e
  TS=\$(date +%Y%m%d-%H%M%S)
  cd $REMOTE_APP
  cp -a server.py server.py.bak.\$TS
  rm -rf /home/kora/backend_new && mkdir -p /home/kora/backend_new
  tar -xzf /home/kora/backend.tar.gz -C /home/kora/backend_new
  cp -f /home/kora/backend_new/server.py server.py
  for d in collection core editorial generation identity orchestration publishing; do
    cp -rf /home/kora/backend_new/\$d/. \$d/
  done
  rm -rf /home/kora/backend.tar.gz /home/kora/backend_new
  ./.venv/bin/python -c 'import server' && echo 'BACKEND_IMPORT_OK' || (echo 'BACKEND_IMPORT_ECHEC -- restaurer server.py.bak.'\$TS' !' >&2; exit 1)
  "
else
  echo "==> [4/6] Backend ignoré (pas de --with-backend demandé)"
fi

echo "==> [5/6] Redémarrage du service"
# kora_client_key n'a PAS de sudo par défaut -- systemctl restart exige root.
# `sudo -n` échoue silencieusement (sans bloquer sur un prompt) si aucune
# règle NOPASSWD n'a été posée pour ce cas précis. Voir
# deploy/DEPLOY-RUNBOOK.md § "Sudoers optionnel" pour la règle à ajouter
# (une fois, par le compte remote/root) afin que cette étape devienne
# entièrement automatique.
if SSH "sudo -n systemctl restart kora-reach && sudo -n nginx -s reload" 2>/dev/null; then
  echo "    Service redémarré automatiquement (sudoers NOPASSWD actif)."
else
  echo "    ⚠ Redémarrage automatique impossible (pas de sudo NOPASSWD pour kora)."
  echo "    Fichiers déjà déployés sur le VPS -- il reste à demander à Mister Marcket :"
  echo "      ssh remote@213.156.135.139"
  echo "      sudo systemctl restart kora-reach && sudo nginx -s reload"
  echo "    (voir deploy/DEPLOY-RUNBOOK.md pour rendre cette étape automatique)"
fi

if [ "$SKIP_SMOKE" = "1" ]; then
  echo "==> [6/6] Smoke tests ignorés (--skip-smoke)"
  exit 0
fi

echo "==> [6/6] Smoke tests (Parcours A/B/C) -- nécessite playwright-core en local"
cd kora-vite
if [ ! -d node_modules/playwright-core ]; then
  echo "    playwright-core absent localement -- smoke tests ignorés."
  echo "    (ils tournent de toute façon côté VPS si quelqu'un lance deploy_check.sh)"
  exit 0
fi
FAIL=0
for f in smoke_test.mjs test_parcours_b.mjs test_parcours_c.mjs; do
  # Variante locale : playwright-core + chromium sans binaire système fixe
  # (le chromium livré avec deploy_check.sh est spécifique au VPS Debian).
  TMP_LOCAL="$(mktemp).mjs"
  sed -E "s/from 'playwright'/from 'playwright-core'/; s/chromium\.launch\(\{[^}]*\}\)/chromium.launch()/" "$f" > "$TMP_LOCAL"
  if node "$TMP_LOCAL" "$PUBLIC_URL"; then
    echo "    ✓ $f"
  else
    echo "    ✗ $f (voir sortie ci-dessus)"
    FAIL=1
  fi
  rm -f "$TMP_LOCAL"
done
[ "$FAIL" = "0" ] && echo "DEPLOY_OK_ALL_PASS" || { echo "SMOKE_FAIL -- vérifier avant de considérer le déploiement sain."; exit 1; }
