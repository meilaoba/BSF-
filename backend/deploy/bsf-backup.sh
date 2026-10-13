#!/usr/bin/env bash
# ===========================================================================
# Daily PostgreSQL backup for the BSF platform.
#
# Installed as /usr/local/bin/bsf-backup.sh and scheduled from
# /etc/cron.d/bsf-backup (03:30 server time).
#
# Keeps 14 days of dumps. The environment file is backed up alongside the dump
# because it holds the database password and the vendor API keys - losing it
# means losing access to both.
#
# Restore:
#   gunzip -c /var/backups/bsf/bsf-<stamp>.dump.gz > /tmp/restore.dump
#   set -a; . /etc/bsf-backend.env; set +a
#   pg_restore --clean --if-exists --no-owner --no-privileges -d "$DATABASE_URL" /tmp/restore.dump
# ===========================================================================
set -euo pipefail

DIR=/var/backups/bsf
KEEP_DAYS=14
STAMP=$(date +%Y%m%d-%H%M%S)

install -d -m 700 -o root -g root "$DIR"
set -a; . /etc/bsf-backend.env; set +a

pg_dump --no-owner --no-privileges --format=custom "$DATABASE_URL" \
  > "$DIR/bsf-$STAMP.dump"
gzip -f "$DIR/bsf-$STAMP.dump"
chmod 600 "$DIR/bsf-$STAMP.dump.gz"

cp /etc/bsf-backend.env "$DIR/env-$STAMP.bak"
chmod 600 "$DIR/env-$STAMP.bak"

find "$DIR" -maxdepth 1 -type f -name '*.gz' -mtime "+$KEEP_DAYS" -delete
find "$DIR" -maxdepth 1 -type f -name 'env-*.bak' -mtime "+$KEEP_DAYS" -delete

echo "$(date -Is) backup ok: $DIR/bsf-$STAMP.dump.gz"