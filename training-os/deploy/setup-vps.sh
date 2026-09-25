#!/usr/bin/env bash
# =====================================================================
# TRAINING OS AI — installation automatique sur un VPS (staging ou production)
#
# Prérequis : serveur Ubuntu 22.04 / 24.04 neuf, 2 vCPU, 4 Go RAM, 40 Go disque,
#             accès root (ou sudo) en SSH.
#
# Utilisation (sur le serveur) :
#   curl -fsSL https://raw.githubusercontent.com/ettienkouassi/ettienkouassi.github.io/main/training-os/deploy/setup-vps.sh -o setup-vps.sh
#   sudo ACME_EMAIL=vous@exemple.com ADMIN_EMAIL=vous@exemple.com bash setup-vps.sh
#
# Variables (toutes optionnelles sauf ACME_EMAIL et ADMIN_EMAIL) :
#   APP_ENV       staging (défaut) | production
#   APP_DOMAIN    ex. staging.trainingos.ai — sans domaine : <IP>.sslip.io est utilisé automatiquement
#   VERIFY_DOMAIN ex. verify-staging.trainingos.ai — défaut : verify.<APP_DOMAIN>
#   ACME_EMAIL    email pour les certificats HTTPS Let's Encrypt
#   ADMIN_EMAIL   email du super administrateur de la plateforme
#   SEED_DEMO     yes (défaut en staging) | no — charge le centre de démonstration
#   REPO_URL      défaut : https://github.com/ettienkouassi/ettienkouassi.github.io.git
#   BRANCH        défaut : main
#   ANTHROPIC_API_KEY, SMTP_HOST, SMTP_USER, SMTP_PASSWORD, MAIL_FROM  (sinon à compléter plus tard)
#
# Le script est ré-exécutable : il ne régénère jamais les secrets existants.
# =====================================================================
set -euo pipefail

APP_ENV="${APP_ENV:-staging}"
REPO_URL="${REPO_URL:-https://github.com/ettienkouassi/ettienkouassi.github.io.git}"
BRANCH="${BRANCH:-main}"
INSTALL_DIR="/opt/trainingos"
APP_DIR="$INSTALL_DIR/training-os"
ENV_FILE="$APP_DIR/.env.production"

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Exécutez ce script en root : sudo bash setup-vps.sh"
[ -n "${ACME_EMAIL:-}" ] || die "ACME_EMAIL est obligatoire (email pour les certificats HTTPS)."
[ -n "${ADMIN_EMAIL:-}" ] || die "ADMIN_EMAIL est obligatoire (compte super administrateur)."
case "$APP_ENV" in staging|production) ;; *) die "APP_ENV doit valoir staging ou production" ;; esac
SEED_DEMO="${SEED_DEMO:-$([ "$APP_ENV" = staging ] && echo yes || echo no)}"
[ "$APP_ENV" = production ] && [ "$SEED_DEMO" = yes ] && die "Les données de démonstration sont interdites en production."

# ------------------------------------------------------------------ système
log "1/9 Mise à jour du système et paquets de base"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get -y -qq upgrade
apt-get install -y -qq ca-certificates curl git openssl ufw fail2ban unattended-upgrades >/dev/null
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null || true

log "2/9 Mémoire d'échange (le build Next.js a besoin d'environ 2 Go)"
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$MEM_MB" -lt 3800 ] && ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "   swap de 2 Go créé (RAM : ${MEM_MB} Mo)"
fi

log "3/9 Pare-feu : SSH, HTTP, HTTPS uniquement (la base n'est jamais exposée)"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null
systemctl enable --now fail2ban >/dev/null 2>&1 || true

log "4/9 Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
systemctl enable --now docker >/dev/null
docker compose version >/dev/null || die "Docker Compose v2 introuvable"

# ------------------------------------------------------------------ code
log "5/9 Récupération du code ($BRANCH)"
if [ -d "$INSTALL_DIR/.git" ]; then
  git -C "$INSTALL_DIR" fetch -q origin "$BRANCH"
  git -C "$INSTALL_DIR" checkout -q "$BRANCH"
  git -C "$INSTALL_DIR" pull -q --ff-only origin "$BRANCH"
else
  git clone -q --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi
cd "$APP_DIR"

# ------------------------------------------------------------------ configuration
PUBLIC_IP=$(curl -fsS4 --max-time 10 https://api.ipify.org || curl -fsS4 --max-time 10 https://ifconfig.me || true)
if [ -z "${APP_DOMAIN:-}" ]; then
  [ -n "$PUBLIC_IP" ] || die "IP publique introuvable : précisez APP_DOMAIN."
  APP_DOMAIN="app.${PUBLIC_IP//./-}.sslip.io"
  echo "   Pas de domaine fourni : utilisation de $APP_DOMAIN (DNS automatique sslip.io)"
fi
VERIFY_DOMAIN="${VERIFY_DOMAIN:-verify.${APP_DOMAIN#app.}}"

log "6/9 Fichier de configuration et secrets ($ENV_FILE)"
if [ -f "$ENV_FILE" ]; then
  echo "   Configuration existante conservée (secrets inchangés)."
else
  # Hexadécimal : aucun caractère spécial qui casserait les URL PostgreSQL
  hex() { openssl rand -hex "$1"; }
  umask 077
  cat > "$ENV_FILE" <<EOF
# Généré par setup-vps.sh le $(date -u +%Y-%m-%dT%H:%M:%SZ) — NE PAS COMMITER, NE PAS PARTAGER
APP_ENV=$APP_ENV
APP_URL=https://$APP_DOMAIN
VERIFY_URL=https://$VERIFY_DOMAIN
APP_DOMAIN=$APP_DOMAIN
VERIFY_DOMAIN=$VERIFY_DOMAIN
ACME_EMAIL=$ACME_EMAIL

POSTGRES_SUPERUSER_PASSWORD=$(hex 32)
DB_OWNER_PASSWORD=$(hex 32)
DB_APP_PASSWORD=$(hex 32)

APP_SECRET=$(hex 48)
CRON_SECRET=$(hex 32)
SESSION_TTL_HOURS=12

AI_PROVIDER=$([ -n "${ANTHROPIC_API_KEY:-}" ] && echo anthropic || echo mock)
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
AI_MODEL=claude-opus-5
AI_EFFORT=medium

SMTP_HOST=${SMTP_HOST:-}
SMTP_PORT=${SMTP_PORT:-587}
SMTP_USER=${SMTP_USER:-}
SMTP_PASSWORD=${SMTP_PASSWORD:-}
MAIL_FROM="${MAIL_FROM:-TRAINING OS AI <no-reply@$APP_DOMAIN>}"

STORAGE_DRIVER=local

BACKUP_RETENTION_DAYS=30
BACKUP_ENCRYPTION_KEY=$(hex 32)
EOF
  chmod 600 "$ENV_FILE"
  echo "   Secrets générés. Sauvegardez BACKUP_ENCRYPTION_KEY hors du serveur (gestionnaire de mots de passe)."
fi
mkdir -p "$APP_DIR/backups"
COMPOSE=(docker compose --env-file "$ENV_FILE")

# ------------------------------------------------------------------ base et migrations
log "7/9 Base de données, construction des images et migrations"
"${COMPOSE[@]}" up -d db
for _ in $(seq 1 30); do
  "${COMPOSE[@]}" exec -T db pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 2
done
"${COMPOSE[@]}" build app
"${COMPOSE[@]}" --profile tools build migrate
"${COMPOSE[@]}" run --rm migrate npm run db:migrate

# Contrôle de sécurité : le rôle applicatif ne doit ni être superutilisateur ni contourner le RLS
ROLE_CHECK=$("${COMPOSE[@]}" exec -T db psql -U postgres -d trainingos -At -c "select rolsuper::text || ',' || rolbypassrls::text from pg_roles where rolname='trainingos_app'")
[ "$ROLE_CHECK" = "false,false" ] || die "Rôle trainingos_app non sécurisé ($ROLE_CHECK)"
echo "   ✓ Rôle applicatif sans privilège (RLS actif)"

if [ "$SEED_DEMO" = yes ]; then
  HAS_DATA=$("${COMPOSE[@]}" exec -T db psql -U postgres -d trainingos -At -c "select count(*) from organizations")
  if [ "$HAS_DATA" = "0" ]; then
    log "   Chargement des données de démonstration (staging)"
    # Mot de passe aléatoire : le mot de passe par défaut est public (dépôt Git)
    DEMO_PASSWORD="Demo-$(openssl rand -hex 6)-9A"
    echo "DEMO_PASSWORD=$DEMO_PASSWORD" >> "$ENV_FILE"
    "${COMPOSE[@]}" run --rm -e APP_ENV=staging -e SEED_PASSWORD="$DEMO_PASSWORD" migrate npm run db:seed
  else
    echo "   Des données existent déjà : pas de rechargement de la démonstration."
  fi
fi

# ------------------------------------------------------------------ démarrage
log "8/9 Démarrage (application, HTTPS, tâches quotidiennes, sauvegardes)"
"${COMPOSE[@]}" up -d
echo "   Attente du certificat HTTPS et de l'application…"
OK=no
for _ in $(seq 1 60); do
  if curl -fsS --max-time 5 "https://$APP_DOMAIN/api/health" >/dev/null 2>&1; then OK=yes; break; fi
  sleep 5
done

log "9/9 Super administrateur"
EXISTS=$("${COMPOSE[@]}" exec -T db psql -U postgres -d trainingos -At -c "select count(*) from users where role='super_admin' and lower(email)=lower('${ADMIN_EMAIL//\'/}')")
if [ "$EXISTS" = "0" ]; then
  SUPER=$("${COMPOSE[@]}" run --rm migrate npm run --silent create-super-admin -- "$ADMIN_EMAIL" Super Admin 2>&1 | grep -E "Mot de passe temporaire|✗" || true)
else
  SUPER="(compte déjà existant — mot de passe inchangé ; pour le réinitialiser : docker compose --env-file .env.production run --rm migrate npm run create-super-admin -- $ADMIN_EMAIL)"
fi

# Première sauvegarde
"${COMPOSE[@]}" exec -T backup sh /usr/local/bin/backup.sh >/dev/null 2>&1 || true

cat <<EOF

=====================================================================
 TRAINING OS AI — $APP_ENV installé
=====================================================================
 Application   : https://$APP_DOMAIN   $( [ "$OK" = yes ] && echo "(✓ en ligne)" || echo "(⚠ pas encore joignable : vérifiez le DNS puis « docker compose logs caddy app »)" )
 Vérification  : https://$VERIFY_DOMAIN/verify
 Super admin   : $ADMIN_EMAIL
 $SUPER
$( [ "$SEED_DEMO" = yes ] && echo " Démo          : admin@demo.trainingos.ai (et autres comptes du README), mot de passe : $(grep '^DEMO_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)" )
 Configuration : $ENV_FILE  (droits 600)
 Sauvegardes   : $APP_DIR/backups  (quotidiennes, chiffrées)
 IA            : $(grep -q '^AI_PROVIDER=anthropic' "$ENV_FILE" && echo "Claude activé" || echo "mode démo — ajoutez ANTHROPIC_API_KEY puis relancez")
 Emails        : $(grep -q '^SMTP_HOST=.\+' "$ENV_FILE" && echo "SMTP configuré" || echo "non configuré (emails écrits dans les logs) — ajoutez SMTP_*")

 Mise à jour ultérieure : sudo bash $APP_DIR/deploy/update.sh
 Après modification de $ENV_FILE : cd $APP_DIR && docker compose --env-file .env.production up -d
=====================================================================
EOF
