# TRAINING OS AI

**Operating System for Training Centers** — SaaS multi-centres de gestion et d'intelligence artificielle pour centres de formation.
Centre pilote : **CFCM-CI** (Côte d'Ivoire).

> Nous ne construisons pas « le logiciel de CFCM-CI ». Nous construisons TRAINING OS AI, dont CFCM-CI est le premier centre pilote. (§73)

## Ce que fait la V1

| Espace | Fonctions |
|---|---|
| **Super admin** (`/admin`) | Tableau de bord global, centres (création, suspension, archivage), plans Starter/Business/Enterprise, abonnements, consommation IA, audit plateforme |
| **Centre** (`/app`) | Dashboard + alertes, étudiants (fiche complète, photo, historique, recommandations IA), prospects (CRM pipeline), formations & modules, sessions & séances, inscriptions, paiements & échéanciers, présences, évaluations & quiz, progression, supports (RAG), certificats (PDF + QR), communication (emails, modèles), rapports (financier, pédagogique, commercial, exports Excel/CSV/PDF), assistant IA du directeur, paramètres (utilisateurs, rôles, formateurs, import Excel, audit, abonnement) |
| **Formateur** (`/instructor`) | Ses sessions, ses étudiants, présences, évaluations, supports, progression, assistant pédagogique |
| **Étudiant** (`/student`) | Profil, formations, calendrier, supports, exercices (quiz corrigés automatiquement), résultats, progression, paiements, certificats, assistant IA, notifications |
| **Public** | Page vitrine de chaque centre (`/c/[centre]`), inscription en ligne, vérification des certificats (`/verify/[code]`) |

## Démarrage rapide (développement)

Prérequis : Node.js 22+, PostgreSQL 16 (ou Docker).

```bash
cd training-os
cp .env.example .env                                  # ajuster si besoin
docker compose -f docker-compose.dev.yml up -d        # PostgreSQL + rôles (ou votre propre PostgreSQL)
npm install
npm run db:migrate                                    # schéma + sécurité (RLS)
npm run db:seed                                       # données de test (§68)
npm run dev                                           # http://localhost:3000
```

Comptes de démonstration (mot de passe `Demo-Password-2026`) :

| Rôle | Email |
|---|---|
| Super admin | `superadmin@trainingos.ai` |
| Admin centre | `admin@demo.trainingos.ai` |
| Gestionnaire | `gestion@demo.trainingos.ai` |
| Formateur | `formateur1@demo.trainingos.ai` |
| Étudiant (en cours) | `etudiant21@demo.trainingos.ai` |
| Étudiant (diplômé) | `etudiant1@demo.trainingos.ai` |

Sans clé `ANTHROPIC_API_KEY`, l'IA fonctionne en **mode démonstration** : elle restitue les chiffres calculés par le serveur, sans reformulation.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` / `build` / `start` | Développement / build / production |
| `npm run typecheck` · `lint` · `test` | Contrôles qualité (57+ tests unitaires et d'intégration) |
| `npm run db:generate` | Génère une migration après modification de `src/db/schema.ts` |
| `npm run db:migrate` | Applique les migrations (rôle propriétaire) |
| `npm run db:seed` · `db:reset` | Données de test · remise à zéro (développement uniquement) |
| `npm run create-super-admin -- email Prénom Nom` | Crée le super admin en production |
| `npm run jobs:daily` | Relances, alertes, certificats auto (sinon via `/api/cron/daily`) |

## Documentation

- [Architecture technique](docs/ARCHITECTURE.md) — étape A
- [Base de données](docs/DATABASE.md) — étape B
- [Sécurité](docs/SECURITY.md) — §33, §34, §49–51
- [Hébergement & déploiement](docs/DEPLOYMENT.md) — §59–61, étapes I et K
- [Exploitation : sauvegardes, restauration, monitoring, incidents](docs/OPERATIONS.md) — §62–63
- [Plan de pilote CFCM-CI & suite](docs/ROADMAP.md) — §66–67, étapes J et L
- [Guide utilisateur / FAQ](docs/GUIDE.md) — §64, §65

## Stack

Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL 16 + Row Level Security · Drizzle ORM · Argon2id · pdf-lib + QR code · ExcelJS · API Claude (Anthropic) avec couche d'abstraction multi-fournisseurs · Vitest · Docker · GitHub Actions.
