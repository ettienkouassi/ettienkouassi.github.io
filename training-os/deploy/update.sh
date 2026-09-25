#!/usr/bin/env bash
# Mise à jour d'une installation VPS : sauvegarde → code → images → migrations → redémarrage → contrôle.
#   sudo bash /opt/trainingos/training-os/deploy/update.sh        (BRANCH=main par défaut)
set -euo pipefail
BRANCH="${BRANCH:-main}"
APP_DIR="/opt/trainingos/training-os"
cd "$APP_DIR"
COMPOSE=(docker compose --env-file .env.production)
DOMAIN=$(grep '^APP_DOMAIN=' .env.production | cut -d= -f2-)

echo "==> Sauvegarde avant mise à jour"
"${COMPOSE[@]}" exec -T backup sh /usr/local/bin/backup.sh
echo "==> Code ($BRANCH)"
git -C /opt/trainingos fetch -q origin "$BRANCH"
git -C /opt/trainingos checkout -q "$BRANCH"
git -C /opt/trainingos pull -q --ff-only origin "$BRANCH"
echo "==> Images"
"${COMPOSE[@]}" build app
"${COMPOSE[@]}" --profile tools build migrate
echo "==> Migrations"
"${COMPOSE[@]}" run --rm migrate npm run db:migrate
echo "==> Redémarrage"
"${COMPOSE[@]}" up -d
for _ in $(seq 1 30); do
  if curl -fsS --max-time 5 "https://$DOMAIN/api/health"; then echo; echo "✓ Mise à jour terminée"; exit 0; fi
  sleep 5
done
echo "✗ L'application ne répond pas : docker compose --env-file .env.production logs --tail 100 app" >&2
exit 1
