#!/usr/bin/env bash
# install.sh — déploiement idempotent de KORA Reach sur le VPS (en tant que root)
# Usage : bash install.sh
# Pré-requis : Debian/Ubuntu, nginx, python3.11+, git, ufw, fail2ban installés.
set -e

APP_DIR=/opt/kora-reach
DEPLOY=$APP_DIR/deploy
USER=kora

echo "=== 1. Utilisateur non-root $USER ==="
if ! id "$USER" &>/dev/null; then
  useradd --system --create-home --shell /usr/sbin/nologin "$USER" || useradd --system "$USER"
fi

echo "=== 2. Copie du code ==="
mkdir -p "$APP_DIR"
cp -r /root/kora-deploy/* "$APP_DIR"/ 2>/dev/null || cp -r ./ "$APP_DIR"/
chown -R "$USER:$USER" "$APP_DIR"

echo "=== 3. Venv + deps ==="
python3 -m venv "$APP_DIR/.venv"
"$APP_DIR/.venv/bin/pip" install --quiet --upgrade pip
"$APP_DIR/.venv/bin/pip" install --quiet -r "$APP_DIR/requirements.txt" 2>/dev/null || \
  "$APP_DIR/.venv/bin/pip" install --quiet feedparser trafilatura beautifulsoup4 python-docx

echo "=== 4. .env (à remplir APRÈS) ==="
if [ ! -f "$DEPLOY/.env" ]; then
  cp "$DEPLOY/.env.example" "$DEPLOY/.env"
  echo "⚠️  Édite $DEPLOY/.env avec les VRAIES clés (SUPABASE, WP, FAL) avant de lancer."
fi
chmod 600 "$DEPLOY/.env"
chown "$USER:$USER" "$DEPLOY/.env"

echo "=== 5. systemd ==="
cp "$DEPLOY/kora-reach.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now kora-reach

echo "=== 6. nginx ==="
cp "$DEPLOY/nginx-kora.conf" /etc/nginx/sites-available/kora-reach
ln -sf /etc/nginx/sites-available/kora-reach /etc/nginx/sites-enabled/kora-reach
nginx -t && systemctl reload nginx

echo "=== 7. fail2ban ==="
cp "$DEPLOY/fail2ban-jail.local" /etc/fail2ban/jail.d/kora.local 2>/dev/null || true
systemctl restart fail2ban 2>/dev/null || true

echo "✅ Déploiement terminé. Vérifie : systemctl status kora-reach ; curl -I http://localhost:8765/api/health"
echo "Puis : certbot --nginx -d kora.tondomaine.com"
