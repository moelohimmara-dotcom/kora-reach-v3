#!/bin/bash
# Sauvegarde PostgreSQL KORA -> local (cron quotidien recommande)
# Usage: ./backup_pg.sh  (a lancer cote VPS)
# Le mot de passe vient de PGPASSWORD (exporte dans le cron ou ~/.pgpass)
set -e
BACKUP_DIR="/opt/kora-reach/backups"
mkdir -p "$BACKUP_DIR"
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump -h 127.0.0.1 -U kora -d kora -F c -f "$BACKUP_DIR/kora_pg_$DATE.dump"
echo "SAVED: $BACKUP_DIR/kora_pg_$DATE.dump"
ls -la "$BACKUP_DIR"/*.dump | tail -3
