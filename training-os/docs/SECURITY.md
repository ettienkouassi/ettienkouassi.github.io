# Sécurité — TRAINING OS AI

Correspondance avec le cahier des charges §33, §34, §49–51 et l'OWASP Top 10.

## Mesures en place

| Exigence | Mise en œuvre | Vérification |
|---|---|---|
| **HTTPS** | TLS par Caddy (Let's Encrypt) ou l'hébergeur ; HSTS 2 ans + preload ; `upgrade-insecure-requests` ; cookies `Secure` en HTTPS ; démarrage refusé si `APP_URL` n'est pas en HTTPS en production | `src/lib/env.ts`, `next.config.ts` |
| **Mots de passe** | Argon2id (19 Mio, 2 itérations) ; ≥ 10 caractères, majuscule, minuscule, chiffre ; aucun mot de passe envoyé par email (invitation par lien unique 72 h) | `password.ts`, tests |
| **Authentification** | Sessions serveur : jeton aléatoire 256 bits dans un cookie `__Host-` HttpOnly, SameSite=Lax ; seul son SHA-256 est stocké ; expiration glissante (12 h par défaut) ; révocation de toutes les sessions au changement de mot de passe ou de rôle | `session.ts` |
| **Anti force brute** | 10 tentatives / 15 min par email, 30 par IP ; verrouillage 15 min après 5 échecs ; temps de réponse constant (pas d'énumération des comptes) ; réponse identique pour « mot de passe oublié » | `(auth)/actions.ts` |
| **Contrôle d'accès** | Permission vérifiée dans CHAQUE action serveur et route API (jamais seulement dans l'interface) ; formateurs limités à leurs sessions ; étudiants à leurs données | `rbac.ts`, `context.ts` |
| **Isolation des centres** | Filtrage applicatif + Row Level Security forcé + FK composites | `tests/integration/tenant-isolation.test.ts` |
| **Journalisation** | `audit_logs` écrit dans la même transaction que l'action ; ajout seul au niveau base ; connexions, échecs, montants, paiements, présences, notes, certificats, exports, rôles | `audit.ts` |
| **Limitation des requêtes** | Limiteur PostgreSQL partagé : connexion, mot de passe oublié, IA (20/min/utilisateur), exports (30/h), inscription publique (5/h/IP), vérification de certificat (30/min/IP), envois groupés | `rate-limit.ts` |
| **Protection des API / CSRF** | Server Actions : contrôle d'origine natif Next.js ; routes `/api` en écriture : en-tête `Origin` obligatoire et identique à l'hôte ; cron : secret en temps constant | `proxy.ts` |
| **Validation des données** | Schémas Zod sur toutes les entrées ; UUID validés ; LIKE échappés ; URL http(s) uniquement | `lib/actions.ts` |
| **Injections** | Requêtes paramétrées (Drizzle) ; aucune concaténation SQL de données utilisateur ; CSV/Excel protégés contre l'injection de formules ; rendu React (pas de `dangerouslySetInnerHTML`, Markdown IA rendu en texte) | tests `safeCell` |
| **XSS / clickjacking** | CSP stricte à nonce + `strict-dynamic`, `object-src 'none'`, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Permissions-Policy` | `proxy.ts` |
| **Fichiers** | Type réel vérifié par signature binaire, tailles maximales, noms aléatoires, jamais servis publiquement (route authentifiée + contrôle de droits), `Content-Disposition` + CSP `sandbox` | `upload.ts`, `/api/files` |
| **Secrets** | Uniquement côté serveur (`ANTHROPIC_API_KEY`, SMTP, S3, `APP_SECRET`, `CRON_SECRET`) ; aucune variable `NEXT_PUBLIC_*` sensible ; `.env*` exclus de Git ; validation au démarrage | `.gitignore`, `env.ts` |
| **Sauvegardes** | Dump quotidien chiffrable AES-256, rétention 30 j, sommes de contrôle, script de restauration testé | `deploy/backup.sh`, `docs/OPERATIONS.md` |
| **Données personnelles** | Minimisation (pas de données sensibles inutiles), IP hachée sur la page publique, consentement sur l'inscription publique, archivage/suppression d'un centre sur demande | |

## IA (§49–51)

- Clé API jamais exposée au navigateur ; tous les appels partent du serveur.
- Accès **minimal** : l'IA ne voit que ce que renvoient des outils en lecture seule exécutés dans la transaction RLS du centre ; les outils ne transmettent ni téléphone ni email ; l'assistant étudiant ne reçoit que les données de l'étudiant connecté (test `workflows.test.ts`).
- **Pas d'hallucination de chiffres** : les montants et taux sont calculés par le serveur ; consigne explicite de répondre « Je ne dispose pas de cette information… » en l'absence de donnée.
- Défense contre l'injection de prompt : les résultats d'outils sont déclarés comme données, les outils sont en lecture seule (aucune action destructrice possible via l'IA).
- Import assisté par IA : seuls les en-têtes et 3 lignes d'exemple masquées (emails/numéros) sont envoyés.
- Quotas par plan et journal complet (`ai_usage`).

## Points d'attention (décisions assumées)

- Le paramètre `app.bypass_rls` peut être positionné par le rôle applicatif : il est réservé aux chemins de code de confiance (`withSystem`). Toute injection SQL permettrait de l'activer — d'où l'usage exclusif de requêtes paramétrées. Évolution possible : rôle système distinct avec `BYPASSRLS` pour ces chemins.
- Les notifications « à tous les administrateurs » ont un état lu/non lu partagé (V1).
- Paiement en ligne non activé en V1 : aucune donnée de carte n'est traitée par la plateforme.

## Signaler une vulnérabilité

Écrire à security@trainingos.ai (à créer) ; ne pas ouvrir de ticket public.

## Checklist avant mise en production

- [ ] Secrets générés aléatoirement (`openssl rand -base64 48`) et stockés dans le gestionnaire de l'hébergeur
- [ ] `APP_URL` en HTTPS, domaine et DNS vérifiés, certificat valide
- [ ] Rôle `trainingos_app` : `select rolbypassrls, rolsuper from pg_roles where rolname='trainingos_app'` → `f, f`
- [ ] `npm test` vert sur la base de staging (tests d'isolation)
- [ ] Sauvegarde automatique active **et restauration testée** (voir OPERATIONS.md)
- [ ] Super admin créé avec `create-super-admin`, mot de passe changé, compte de démo absent
- [ ] SMTP avec SPF, DKIM et DMARC configurés sur le domaine d'envoi
- [ ] Monitoring de `/api/health` et alertes configurés
