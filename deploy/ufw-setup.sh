#!/usr/bin/env bash
# ufw-setup.sh — pare-feu minimal (à lancer une seule fois sur le VPS)
# Usage : bash ufw-setup.sh
set -e
echo "=== Configuration UFW (ne laisse que 22/80/443) ==="
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH         # 22 (à durcir en clé SSH après)
ufw allow 80/tcp          # HTTP (certbot)
ufw allow 443/tcp         # HTTPS
ufw --force enable
echo "UFW activé. Ports ouverts : 22, 80, 443."
echo "⚠️  Passe SSH en clé (disable PasswordAuthentication) après coup."
