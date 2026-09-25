#!/bin/sh
# Sauvegarde quotidienne (§62) : base PostgreSQL (format custom) + fichiers (stockage local).
# Chiffrement AES-256 si BACKUP_ENCRYPTION_KEY est défini. Rétention : BACKUP_RETENTION_DAYS (30 par défaut).
# Pour une copie hors site, synchroniser /backups vers un stockage objet (rclone, aws s3 sync…).
set -eu
TS=$(date -u +%Y%m%dT%H%M%SZ)
DIR=/backups
HOST=${PGHOST:-db}
mkdir -p "$DIR"
echo "[backup] $TS début"
# Le RLS est FORCÉ, y compris pour le propriétaire : on active le contournement pour cette session
# de sauvegarde uniquement (paramètre app.bypass_rls lu par les politiques).
PGOPTIONS="-c app.bypass_rls=on" pg_dump -h "$HOST" -U trainingos_owner -d trainingos -Fc -Z 9 --enable-row-security -f "$DIR/db-$TS.dump"
if [ -d /storage ]; then tar -czf "$DIR/files-$TS.tar.gz" -C /storage . ; fi
if [ -n "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  command -v openssl >/dev/null || apk add --no-cache openssl >/dev/null
  for f in "$DIR/db-$TS.dump" "$DIR/files-$TS.tar.gz"; do
    [ -f "$f" ] || continue
    openssl enc -aes-256-cbc -pbkdf2 -salt -in "$f" -out "$f.enc" -pass env:BACKUP_ENCRYPTION_KEY && rm -f "$f"
  done
fi
find "$DIR" -type f -mtime +"${BACKUP_RETENTION_DAYS:-30}" -delete
sha256sum "$DIR"/*"$TS"* > "$DIR/checksums-$TS.txt"
echo "[backup] $TS terminé : $(ls -1 "$DIR" | grep "$TS" | tr '\n' ' ')"
