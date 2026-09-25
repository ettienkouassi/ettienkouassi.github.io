# Hébergement et déploiement

## Environnements (§59)

| Environnement | Rôle | Base | Domaine suggéré |
|---|---|---|---|
| Development | Poste du développeur | PostgreSQL local (`docker-compose.dev.yml`) | `localhost:3000` |
| Staging | Tests, recette, démonstrations au pilote | Base séparée, données fictives | `staging.trainingos.ai` |
| Production | Utilisateurs réels | Base dédiée, sauvegardes, monitoring | `app.trainingos.ai` + `verify.trainingos.ai` |

Règle : **jamais de développement directement en production**. Chaque environnement a ses propres secrets et sa propre base.

## Flux de déploiement (§60)

```
Code → Git (branche + pull request) → CI (typecheck, lint, audit, tests RLS, build, image Docker)
     → Staging (branche release/staging, automatique) → Validation fonctionnelle
     → Production (workflow manuel, approbation obligatoire de l'environnement GitHub « production »)
```

Workflows : `.github/workflows/training-os-ci.yml` et `training-os-deploy.yml` (à la racine du dépôt).
Le déploiement fait : sauvegarde → migrations → redémarrage → contrôle `/api/health`.

---

## Option A — Serveur VPS avec Docker (recommandée pour le pilote)

Maîtrise complète des données et coût prévisible (~10–25 €/mois : Hetzner, OVHcloud, Scaleway, DigitalOcean ; 2 vCPU / 4 Go / 80 Go SSD suffisent pour le pilote).

```bash
# Sur le serveur (Ubuntu 24.04), en tant qu'utilisateur sudo
curl -fsSL https://get.docker.com | sh
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable   # base NON exposée
sudo mkdir -p /opt/trainingos && sudo chown $USER /opt/trainingos && cd /opt/trainingos
git clone <dépôt> . && cd training-os         # ou: images GHCR via le workflow de déploiement
cp deploy/.env.production.example .env.production && nano .env.production    # secrets !
chmod 600 .env.production

docker compose --env-file .env.production up -d --build db
docker compose --env-file .env.production run --rm migrate                      # schéma + RLS
docker compose --env-file .env.production run --rm migrate \
  npm run create-super-admin -- vous@domaine.com Prénom Nom                     # mot de passe temporaire affiché
docker compose --env-file .env.production up -d                                 # app + caddy (HTTPS) + cron + backup
curl -fsS https://app.trainingos.ai/api/health
```

Services : `db` (PostgreSQL 16, non exposé), `app` (Next.js, non-root, healthcheck), `caddy` (HTTPS automatique, HTTP/3), `cron` (tâches quotidiennes 06:45 UTC), `backup` (dump quotidien 02:15 UTC). Stockage des fichiers : volume `storage` (ou S3 via `STORAGE_DRIVER=s3`).

Durcissement serveur recommandé : connexion SSH par clé uniquement (`PasswordAuthentication no`), `unattended-upgrades`, `fail2ban`, copie hors site de `./backups` (rclone vers un stockage objet dans une autre région).

## Option B — Services managés (Vercel + Neon/Supabase + Cloudflare R2)

Adaptée à la montée en charge sans administration système.

1. **Base** : créer un projet Neon ou Supabase (région Europe, la plus proche de l'Afrique de l'Ouest). Avec le rôle propriétaire :
   ```sql
   CREATE ROLE trainingos_app LOGIN PASSWORD '…' NOSUPERUSER NOBYPASSRLS;
   GRANT CONNECT ON DATABASE <base> TO trainingos_app;
   ```
   Puis, depuis votre poste : `DATABASE_MIGRATION_URL=<url propriétaire> npm run db:migrate` et vérifier `select rolbypassrls from pg_roles where rolname='trainingos_app'` → `f`.
   Le contexte de centre est positionné par transaction : compatible avec les poolers (Supabase port 6543, Neon « pooled »).
2. **Stockage** : bucket Cloudflare R2 (ou S3) privé → `STORAGE_DRIVER=s3`, `S3_ENDPOINT`, `S3_BUCKET`, clés d'accès limitées à ce bucket.
3. **Application** : importer le dépôt dans Vercel, *Root Directory* = `training-os`, variables d'environnement de `.env.example` (avec `DATABASE_SSL=true`). `vercel.json` déclare la tâche quotidienne ; Vercel envoie automatiquement `Authorization: Bearer $CRON_SECRET`.
4. **Sauvegardes** : sauvegardes automatiques et restauration à un instant T du fournisseur + export logique hebdomadaire (voir OPERATIONS.md).

## Option C — Render / Railway / Fly.io

Utiliser le `Dockerfile` (cible `runner`), une base PostgreSQL managée, une commande de pré-déploiement `npm run db:migrate` avec l'image cible `tools`, et un cron HTTP vers `/api/cron/daily`.

---

## Nom de domaine (§61)

Vérifier la disponibilité de `trainingos.ai` (registre .ai, ~70–90 $/an) ; alternatives : `trainingos.africa`, `trainingos.ci`, `trainingos.app`.

| Enregistrement | Cible |
|---|---|
| `app.trainingos.ai` A/AAAA | IP du serveur (ou CNAME Vercel) |
| `verify.trainingos.ai` A/AAAA | même serveur (`VERIFY_URL`), les QR codes des certificats pointent ici |
| `staging.trainingos.ai` | serveur de staging |
| MX / SPF / DKIM / DMARC | fournisseur SMTP (indispensable pour la délivrabilité des relances) |

`centre.trainingos.ai` (§39) : prévu — ajouter un enregistrement DNS joker `*.trainingos.ai` et une réécriture `sous-domaine → /c/[slug]` dans `proxy.ts`.

## Variables d'environnement

Voir `.env.example` (développement) et `deploy/.env.production.example` (production). L'application **refuse de démarrer** si la configuration est invalide ou non sécurisée en production (HTTP, secret par défaut, base distante sans TLS).
