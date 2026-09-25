@AGENTS.md

# TRAINING OS AI — notes pour les agents

- Français partout (UI, messages d'erreur, commentaires, docs).
- Toute donnée métier passe par `ctx.db(...)` / `withTenant` (RLS) ; `withSystem` uniquement pour l'auth, le super admin, les tâches planifiées et la page publique.
- Nouvelle table métier : `organization_id` + ajout dans `TENANT_TABLES` + migration custom (ENABLE/FORCE RLS, politique, FK composites). Les tests `tests/integration/tenant-isolation.test.ts` doivent rester verts.
- Écritures = Server Actions : `requireOrg(roles, permission)` → Zod (`parseForm`) → transaction → `audit()` dans la même transaction → `revalidatePath`.
- Les chiffres (soldes, taux, progression) viennent de `src/lib/domain/*` via `loadEnrollmentSummaries` — jamais recalculés ailleurs, jamais par l'IA.
- Vérifier : `npm run typecheck && npm run lint && npm test && npm run build`.
