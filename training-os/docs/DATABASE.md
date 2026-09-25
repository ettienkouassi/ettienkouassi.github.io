# Base de données PostgreSQL — schéma V1

Source : `src/db/schema.ts` (Drizzle ORM) → migrations SQL dans `drizzle/`.
Toutes les clés primaires sont des UUID ; les montants sont des entiers dans l'unité de la devise (le FCFA n'a pas de décimales).

## Tables (§30)

| Table | Contenu | Isolation |
|---|---|---|
| `plans` | Starter / Business / Enterprise, limites (étudiants, formateurs, formations, admins, stockage, requêtes IA) | lecture publique, écriture super admin |
| `organizations` | Centres : identité, devise, langue, fuseau, statut, page publique, préfixe de certificat, réglages de relance | le centre ne voit que lui-même |
| `subscriptions` | Abonnement SaaS du centre (plan, période, statut, montant) | RLS centre |
| `users` | Comptes (tous rôles), hash Argon2id, verrouillage, dernière connexion | RLS centre (+ soi-même) |
| `auth_sessions` | Sessions serveur (SHA-256 du jeton, expiration glissante, IP, user-agent) | accès système uniquement |
| `auth_tokens` | Invitations, réinitialisations (hachés, usage unique, expirants) | accès système uniquement |
| `rate_limits` | Limiteur de débit partagé entre instances | accès système |
| `org_counters` | Compteurs atomiques (matricules, numéros de certificat) | RLS centre |
| `instructors` · `students` | Formateurs, étudiants (matricule unique par centre) | RLS centre |
| `courses` · `course_modules` · `course_recommendations` | Formations, modules ordonnés, parcours recommandés, **règles de certification** et **pondération de la progression** | RLS centre |
| `course_sessions` · `session_meetings` | Sessions (dates, horaires, salle, capacité, statut) et séances datées | RLS centre |
| `enrollments` | Inscriptions (prix convenu, remise, statut) — unique (étudiant, session) | RLS centre |
| `payment_schedules` · `payments` | Échéancier ; journal des paiements **immuable** (annulation tracée uniquement) | RLS centre |
| `attendance` | Présent / absent / retard / excusé par séance | RLS centre |
| `assessments` · `assessment_results` | Évaluations (quiz en ligne optionnels) et notes | RLS centre |
| `progress` | Progression par module (%) | RLS centre |
| `materials` · `material_chunks` | Supports, visibilité, index plein texte (`tsvector` français, GIN) | RLS centre |
| `certificates` · `certificate_verifications` | Certificats (instantané public, statut, révocation) et journal des vérifications | RLS centre ; vérification publique via fonction dédiée |
| `prospects` | CRM (pipeline, source, prochaine action) | RLS centre |
| `message_templates` · `communications` · `notifications` · `tasks` | Modèles, emails envoyés, notifications internes, tâches de suivi | RLS centre |
| `ai_conversations` · `ai_messages` · `ai_usage` | Historique et consommation IA | RLS centre |
| `audit_logs` | Journal des actions sensibles | lecture centre, **ajout seul** |

## Sécurité au niveau base (`drizzle/0001_security.sql`)

- **Deux rôles** : `trainingos_owner` (propriétaire, migrations) et `trainingos_app` (application, `NOSUPERUSER NOBYPASSRLS`).
- **Row Level Security activé et forcé** sur toutes les tables métier. Politique : `organization_id = app_current_org()` (paramètre de transaction). Même le propriétaire y est soumis.
- **Clés étrangères composites** `(organization_id, x_id)` : un centre ne peut pas référencer une ligne d'un autre centre, même en connaissant son UUID (les FK classiques contournent le RLS).
- **Droits minimaux** : `DELETE` interdit sur `payments` et `ai_usage` ; `UPDATE`/`DELETE` interdits sur `audit_logs` et `certificate_verifications`.
- **Trigger `payments_guard`** : montant, date, moyen, référence immuables ; annulation irréversible et motif obligatoire.
- **Contraintes CHECK** : montants positifs, remise ≤ prix, pondérations = 100, seuils 0–100, dates de session cohérentes, note de passage ≤ note max.
- **`verify_certificate(code, ip_hash)`** (`SECURITY DEFINER`) : seule porte d'entrée publique ; ne renvoie que nom, formation, centre, durée, date, référence, statut ; journalise la vérification.

## Faire évoluer le schéma

```bash
# 1. modifier src/db/schema.ts
npm run db:generate          # crée drizzle/000X_*.sql
# 2. si nouvelle table métier : ajouter son nom dans TENANT_TABLES et une migration
#    « custom » (npx drizzle-kit generate --custom) avec ENABLE/FORCE RLS + politique + FK composites
npm run db:migrate
npm test                     # les tests d'isolation doivent rester verts
```
