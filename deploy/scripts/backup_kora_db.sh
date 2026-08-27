#!/usr/bin/env bash
# backup_kora_db.sh — Sauvegarde quotidienne de la base KORA (Postgres) +
# copie hors VPS sur Supabase Storage (2026-08-26, demande explicite :
# "aucune sauvegarde automatique" identifie comme le manque le plus grave
# de KORA -- une seule sauvegarde manuelle existait, datee de 23 jours).
#
# Retention 30 jours, LOCALE (sur le VPS) ET DISTANTE (Supabase Storage,
# projet dedie "kora-backups", isole de tout autre usage) -- protege a la
# fois contre une erreur/corruption recente (repli local rapide) et contre
# la perte totale du VPS (copie ailleurs).
set -e

BACKUP_DIR="/opt/kora-reach/backups"
RETENTION_DAYS=30
TS="$(date +%Y%m%d_%H%M%S)"
DUMP_FILE="$BACKUP_DIR/kora_pg_${TS}.dump.gz"

# Identifiants Supabase (jamais en dur -- lus depuis deploy/.env, meme
# convention que le reste des secrets de ce projet).
SUPABASE_URL="$(grep '^SUPABASE_BACKUP_URL=' /opt/kora-reach/deploy/.env | cut -d= -f2-)"
SUPABASE_KEY="$(grep '^SUPABASE_BACKUP_KEY=' /opt/kora-reach/deploy/.env | cut -d= -f2-)"
BUCKET="kora-backups"

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ]; then
  echo "ERREUR: SUPABASE_BACKUP_URL/SUPABASE_BACKUP_KEY introuvables dans deploy/.env"
  exit 1
fi

echo "==> Dump Postgres -> $DUMP_FILE"
pg_dump -Fc kora | gzip > "$DUMP_FILE"

echo "==> Upload vers Supabase Storage (bucket: $BUCKET)"
OBJECT_PATH="$(basename "$DUMP_FILE")"
HTTP_CODE=$(curl -sS -o $BACKUP_DIR/.tmp_upload_resp.json -w '%{http_code}' \
  -X POST "${SUPABASE_URL}/storage/v1/object/${BUCKET}/${OBJECT_PATH}" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/gzip" \
  --data-binary "@${DUMP_FILE}")
if [ "$HTTP_CODE" != "200" ]; then
  echo "ERREUR upload Supabase (HTTP $HTTP_CODE) :"
  cat $BACKUP_DIR/.tmp_upload_resp.json 2>/dev/null
  rm -f $BACKUP_DIR/.tmp_upload_resp.json
  exit 1
fi
rm -f $BACKUP_DIR/.tmp_upload_resp.json
echo "==> Upload OK : ${OBJECT_PATH}"

echo "==> Purge locale (> ${RETENTION_DAYS}j)"
find "$BACKUP_DIR" -maxdepth 1 -name 'kora_pg_*.dump.gz' -mtime +${RETENTION_DAYS} -delete

echo "==> Purge distante Supabase (> ${RETENTION_DAYS}j)"
CUTOFF_EPOCH=$(( $(date +%s) - RETENTION_DAYS * 86400 ))
curl -sS "${SUPABASE_URL}/storage/v1/object/list/${BUCKET}" \
  -H "apikey: ${SUPABASE_KEY}" -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" -d '{"limit":1000,"prefix":""}' \
  | CUTOFF_EPOCH="$CUTOFF_EPOCH" python3 -c '
import sys, json, os
from datetime import datetime, timezone
try:
    items = json.load(sys.stdin)
    cutoff = datetime.fromtimestamp(int(os.environ["CUTOFF_EPOCH"]), tz=timezone.utc)
    for it in items:
        created = datetime.fromisoformat(it["created_at"].replace("Z", "+00:00"))
        if created < cutoff:
            print(it["name"])
except Exception:
    pass  # liste vide ou erreur -- rien a purger, jamais bloquant
' > $BACKUP_DIR/.tmp_stale_objects.txt 2>/dev/null || true

if [ -s $BACKUP_DIR/.tmp_stale_objects.txt ]; then
  while IFS= read -r name; do
    [ -z "$name" ] && continue
    curl -sS -X DELETE "${SUPABASE_URL}/storage/v1/object/${BUCKET}/${name}" \
      -H "apikey: ${SUPABASE_KEY}" -H "Authorization: Bearer ${SUPABASE_KEY}" \
      -o /dev/null
    echo "  purge distante : $name"
  done < $BACKUP_DIR/.tmp_stale_objects.txt
fi
rm -f $BACKUP_DIR/.tmp_stale_objects.txt

echo "BACKUP_OK"
