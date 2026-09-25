# Architecture technique — TRAINING OS AI V1

## Vue d'ensemble

```
Navigateur (ordinateur / tablette / smartphone)
   │ HTTPS (TLS terminé par Caddy, Vercel ou le load balancer)
   ▼
Next.js 16 — un seul déploiement
   ├─ proxy.ts ............ en-têtes de sécurité, CSP à nonce, anti-CSRF API, redirection optimiste
   ├─ Pages (Server Components) ... rendu serveur, aucune donnée sensible calculée côté client
   ├─ Server Actions ...... toutes les écritures : authN → rôle → validation Zod → transaction RLS → audit
   ├─ Route handlers /api . fichiers authentifiés, exports, cron, santé, logo public
   └─ src/server/* ........ logique métier (synthèses, métriques, IA, certificats, import, tâches)
   │
   ├──► PostgreSQL 16 : rôle applicatif sans privilège + Row Level Security + FK composites
   ├──► Stockage fichiers : disque (volume) ou S3 compatible (R2, Scaleway, AWS…)
   ├──► SMTP (Brevo, Mailjet, SES…) : emails transactionnels et relances
   └──► API IA (Claude par défaut) : appelée uniquement côté serveur, via une interface remplaçable
```

Un monolithe modulaire a été retenu volontairement : une équipe réduite, un seul artefact à déployer, et la possibilité de passer de 1 à plusieurs milliers de centres (§69) grâce à PostgreSQL et au caractère sans état des instances web (sessions en base, limiteur de débit en base).

## Arborescence

```
training-os/
├─ drizzle/                 migrations SQL (0000 schéma, 0001 sécurité : RLS, rôles, FK composites, triggers)
├─ scripts/                 migrate, seed, reset, create-super-admin, run-jobs
├─ deploy/                  Caddyfile, init PostgreSQL, backup.sh, restore.sh, .env.production.example
├─ src/
│  ├─ proxy.ts              (ex-middleware) sécurité HTTP
│  ├─ instrumentation.ts    validation de la configuration au démarrage + logs d'erreurs JSON
│  ├─ db/                   schema.ts, client.ts, tenant.ts (withTenant / withSystem)
│  ├─ lib/
│  │  ├─ auth/              sessions, rôles & permissions, contexte utilisateur
│  │  ├─ security/          argon2, jetons, limitation de débit, validation des fichiers
│  │  ├─ domain/            calculs PURS testés : finances, présence, progression, certification, risque
│  │  ├─ ai/                interface AIProvider, implémentation Claude, fournisseur de démonstration
│  │  └─ …                  audit, mail, stockage, PDF, CSV/Excel, formats
│  ├─ server/               services : synthèses d'inscription, métriques, assistant IA, jobs, import…
│  ├─ components/           UI (formulaires, tableaux, vues pédagogiques partagées)
│  └─ app/                  routes : /admin, /app, /instructor, /student, /c/[slug], /verify, /api
└─ tests/                   unitaires (domain) + intégration PostgreSQL (isolation, sécurité, parcours)
```

## Principes structurants

1. **Multi-tenant dès le départ (§73)** — chaque table métier porte `organization_id`. Le contexte de centre est fixé par transaction (`set_config('app.org_id', …, true)`) : compatible avec les poolers de connexions (PgBouncer, Supabase, Neon).
2. **Une source de vérité pour les chiffres** — `loadEnrollmentSummaries()` calcule solde, présence, moyenne, progression, éligibilité au certificat et indicateurs de décrochage à partir des fonctions pures de `src/lib/domain`. Dashboard, fiches, rapports, exports et IA l'utilisent tous : impossible d'afficher deux chiffres différents.
3. **L'IA ne calcule pas (§50)** — elle appelle des outils serveur en lecture seule qui renvoient des chiffres déjà calculés ; le modèle ne fait que choisir l'outil et rédiger.
4. **Écritures traçables** — chaque Server Action suit le même schéma : authentification → permission → validation Zod → transaction RLS → journal d'audit dans la même transaction → revalidation.
5. **Remplaçabilité** — IA (`AIProvider`), stockage (`local`/`s3`), email (SMTP) et hébergeur (Docker standard) sont interchangeables par configuration.

## Rôles et contrôle d'accès

| Rôle | Périmètre | Mise en œuvre |
|---|---|---|
| Super admin | Plateforme | Espace `/admin`, accès via `withSystem` (contournement RLS explicite et journalisé) ; aucune permission dans l'espace d'un centre |
| Admin centre | Tout son centre | Toutes les permissions de `rbac.ts` |
| Gestionnaire | Administratif limité | Pas de gestion des utilisateurs, paramètres, annulation de paiements, émission de certificats |
| Formateur | Ses sessions | Permissions pédagogiques + contrôle `assertSessionAccess` (sessions attribuées uniquement), pas de données financières |
| Étudiant | Ses propres données | Toutes les requêtes filtrées par `studentId` (en plus du RLS du centre) |

## IA

- `src/lib/ai/types.ts` définit `AIProvider` (chat avec outils, sortie JSON structurée). `anthropic.ts` l'implémente avec le SDK officiel : boucle d'outils manuelle bornée (6 tours), réflexion adaptative, cache de prompt, repli automatique en cas de refus. Pour changer de modèle : variable `AI_MODEL` ; pour changer de fournisseur : nouvelle classe + `getAIProvider()`.
- Assistants : directeur (12 outils : vue d'ensemble, encaissements, impayés, présence, décrochage, statistiques formations, étudiants par formation, candidats à une formation, certificats à générer, pipeline, actions du jour, recherche d'étudiant), formateur (ses sessions, recherche dans ses supports), étudiant (sa situation, recherche dans ses supports).
- RAG (§21) : les PDF/DOCX/TXT déposés sont découpés et indexés en recherche plein texte PostgreSQL (dictionnaire français). Pas de base vectorielle ni de fournisseur d'embeddings à ajouter en V1 ; une colonne `pgvector` pourra compléter l'index plus tard sans changer l'interface `searchMaterials`.
- Journalisation (§51) : `ai_usage` (utilisateur, date, assistant, modèle, jetons, coût estimé, outils, statut, erreur, latence) + quotas mensuels par plan.

## Tâches planifiées

`/api/cron/daily` (protégée par `CRON_SECRET`) ou `npm run jobs:daily` : relances J-3 / J / J+3 configurables (§54), tâches de suivi après N absences consécutives (§12), certificats automatiques ou alertes (§52), sessions ≥ 90 % (§28), échéances du lendemain, purge des sessions expirées et du limiteur. Idempotentes grâce aux clés de déduplication (`communications`, `notifications`, `tasks`).
