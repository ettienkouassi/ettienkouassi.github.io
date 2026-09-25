#!/bin/sh
# Restauration (§62). À exécuter dans le conteneur « backup » :
#   docker compose exec backup sh /usr/local/bin/restore.sh /backups/db-20260925T021500Z.dump [base_cible]
# Par défaut, restaure dans une base « trainingos_restore » (ne touche PAS la production).
# Pour remplacer la production : arrêter « app », restaurer avec base_cible=trainingos, relancer.
set -eu
FILE=${1:?Fichier de sauvegarde requis}
TARGET=${2:-trainingos_restore}
HOST=${PGHOST:-db}
if echo "$FILE" | grep -q '\.enc$'; then
  command -v openssl >/dev/null || apk add --no-cache openssl >/dev/null
  openssl enc -d -aes-256-cbc -pbkdf2 -in "$FILE" -out /tmp/restore.dump -pass env:BACKUP_ENCRYPTION_KEY
  FILE=/tmp/restore.dump
fi
psql -h "$HOST" -U trainingos_owner -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $TARGET" -c "CREATE DATABASE $TARGET OWNER trainingos_owner"
PGOPTIONS="-c app.bypass_rls=on" pg_restore -h "$HOST" -U trainingos_owner -d "$TARGET" --no-owner --role=trainingos_owner --exit-on-error "$FILE"
psql -h "$HOST" -U trainingos_owner -d "$TARGET" -c "GRANT CONNECT ON DATABASE $TARGET TO trainingos_app"
echo "[restore] Base $TARGET restaurée depuis $1"
# Contrôle d'intégrité minimal
PGOPTIONS="-c app.bypass_rls=on" psql -h "$HOST" -U trainingos_owner -d "$TARGET" -At -c "select 'centres=' || count(*) from organizations" -c "select 'etudiants=' || count(*) from students" -c "select 'paiements=' || count(*) from payments" || true
