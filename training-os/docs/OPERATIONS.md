# Exploitation : sauvegardes, restauration, monitoring, incidents

## Sauvegardes (§62)

| Quoi | Quand | Où | Rétention |
|---|---|---|---|
| Base PostgreSQL (`pg_dump -Fc`) | tous les jours 02:15 UTC (service `backup`) et avant chaque déploiement | `./backups/db-*.dump[.enc]` | 30 jours (`BACKUP_RETENTION_DAYS`) |
| Fichiers (photos, supports, certificats) | idem | `./backups/files-*.tar.gz[.enc]` | 30 jours |
| Copie hors site | quotidienne (à configurer) | stockage objet dans une autre région | 90 jours conseillés |

- Chiffrement AES-256 si `BACKUP_ENCRYPTION_KEY` est défini (conserver cette clé HORS du serveur, par ex. gestionnaire de mots de passe de la direction).
- Un fichier `checksums-*.txt` accompagne chaque sauvegarde.
- Le RLS étant forcé même pour le propriétaire, les scripts ouvrent une session de sauvegarde avec `PGOPTIONS="-c app.bypass_rls=on"` et `--enable-row-security` : c'est la procédure à utiliser pour tout export manuel.

Copie hors site (exemple rclone vers Cloudflare R2, à ajouter en crontab hôte) :
```bash
15 3 * * * rclone sync /opt/trainingos/training-os/backups r2:trainingos-backups --max-age 48h
```

Sauvegarde manuelle immédiate : `docker compose --env-file .env.production exec backup sh /usr/local/bin/backup.sh`

## Restauration — procédure testée

**Test mensuel obligatoire** (une sauvegarde non testée n'est pas une sauvegarde) :
```bash
docker compose --env-file .env.production exec backup sh /usr/local/bin/restore.sh /backups/db-AAAAMMJJTHHMMSSZ.dump
# → restaure dans la base « trainingos_restore » et affiche le nombre de centres, étudiants, paiements
```
Comparer ces compteurs avec la production, noter le résultat et la durée dans le registre d'exploitation, puis supprimer la base de test.

**Restauration réelle de la production** (incident majeur) :
1. Mettre l'application en maintenance : `docker compose stop app cron`
2. Sauvegarder l'état actuel, même corrompu : `exec backup sh /usr/local/bin/backup.sh`
3. `exec backup sh /usr/local/bin/restore.sh /backups/<fichier> trainingos`
4. Restaurer les fichiers : `tar -xzf files-….tar.gz -C <volume storage>`
5. `docker compose up -d app cron`, contrôler `/api/health`, se connecter, vérifier les derniers paiements
6. Informer les centres de la fenêtre de données perdue (RPO ≤ 24 h ; RTO visé < 2 h)

Procédure validée pendant le développement : dump de la base de démonstration → restauration dans une base vierge → 53 étudiants et 86 paiements retrouvés à l'identique.

## Monitoring (§63)

| Quoi surveiller | Comment |
|---|---|
| Disponibilité / panne | Sonde externe (UptimeRobot, Better Stack, Uptime Kuma) sur `https://app…/api/health` toutes les minutes ; alerte SMS/email. Répond 503 si la base est indisponible |
| Erreurs serveur | Logs JSON `event: "request.error"` (instrumentation.ts) avec référence `digest` affichée à l'utilisateur. `docker compose logs -f app` ou collecte (Loki/Grafana, Better Stack, Datadog). Pour Sentry : brancher son SDK dans `instrumentation.ts` |
| Temps de réponse | `latencyMs` de `/api/health`, logs d'accès JSON de Caddy (durée de chaque requête) |
| Consommation IA / erreurs API IA | Espace super admin → Consommation IA (requêtes, jetons, coût estimé, erreurs, refus, quotas) |
| Saturation | `docker stats`, espace disque (`df -h`, alerte à 80 %), connexions PostgreSQL (`select count(*) from pg_stat_activity`) |
| Relances / emails | Communication → Historique (statuts envoyé / échec) ; log `cron.daily` quotidien |
| Paiements | Journal d'audit (`payment.record`, `payment.cancel`), rapport paiements |
| Sécurité | Journal d'audit : `auth.login_failed`, verrouillages, exports, changements de rôle |

## Procédure d'incident

1. **Détecter** : alerte de monitoring, signalement d'un centre (support).
2. **Qualifier** (15 min) : périmètre (un centre / tous), gravité (P1 indisponibilité ou fuite de données, P2 fonction majeure, P3 mineure).
3. **Contenir** : P1 sécurité → révoquer les sessions (`delete from auth_sessions`), changer les secrets concernés, suspendre le centre si nécessaire.
4. **Corriger / restaurer** : correctif via le flux normal (staging puis production) ou restauration (ci-dessus).
5. **Communiquer** : informer les centres concernés ; en cas de violation de données personnelles, notification à l'autorité compétente (ARTCI en Côte d'Ivoire) dans les délais légaux.
6. **Post-mortem** sous 5 jours : cause, chronologie, actions préventives.

## Tâches récurrentes

| Fréquence | Tâche |
|---|---|
| Quotidien (auto) | Tâches planifiées, sauvegarde |
| Hebdomadaire | Revue des erreurs et des échecs d'emails, espace disque |
| Mensuel | **Test de restauration**, mises à jour de sécurité (`npm audit`, image de base, OS), revue des comptes du personnel inactifs |
| Trimestriel | Revue des accès super admin, rotation des secrets SMTP/S3/IA |
