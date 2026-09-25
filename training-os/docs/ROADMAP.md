# Avancement, pilote CFCM-CI et suite

## État des phases (§66, §72)

| Phase / étape | Statut |
|---|---|
| 0 · A — Cahier des charges & architecture | ✅ `docs/ARCHITECTURE.md` |
| B — Schéma PostgreSQL | ✅ `docs/DATABASE.md`, migrations |
| C — Maquettes | ✅ remplacées par l'application fonctionnelle (toutes les interfaces existent) |
| D · E · F — Dépôt, application Next.js, base & authentification | ✅ |
| 2 — Centres / utilisateurs / rôles | ✅ |
| 3 — Étudiants / formations / sessions | ✅ |
| 4 — Inscriptions / paiements | ✅ |
| 5 — Présences / évaluations / progression | ✅ |
| 6 — Certificats | ✅ |
| 7 — Dashboards | ✅ direction, financier, pédagogique, commercial, super admin |
| 8 — IA | ✅ assistant directeur, formateur, étudiant, RAG, recommandations, décrochage, import |
| 9 · H — Tests | ✅ unitaires + intégration PostgreSQL + parcours navigateur |
| 10 · I — Déploiement staging | ⏳ à faire : choisir l'hébergeur, acheter le domaine, suivre DEPLOYMENT.md |
| 11 · J — Pilote CFCM-CI | ⏳ plan ci-dessous |
| 12 — Corrections | ⏳ |
| K — Production | ⏳ checklist SECURITY.md |
| 13 · L — Commercialisation | ⏳ |

## Critères de réussite du MVP (§57) — tous couverts

1. Créer une formation ✅ · 2. Créer une session ✅ · 3. Créer/importer des étudiants ✅ · 4. Inscrire ✅ · 5. Enregistrer un paiement ✅ · 6. Suivre le solde ✅ · 7. Enregistrer la présence ✅ · 8. Enregistrer une note ✅ · 9. Calculer la progression ✅ · 10. Générer le certificat ✅ · 11. Vérifier le certificat ✅ · 12. Utiliser l'assistant IA ✅ · 13. Consulter les indicateurs ✅

## Plan de pilote CFCM-CI (§67)

**Semaine 0 — Préparation**
- Staging en ligne, super admin créé, centre CFCM-CI créé depuis `/admin` (plan pilote), invitation de la direction.
- Récupérer auprès de CFCM-CI : logo (PNG), signataire des certificats, fichiers Excel existants (étudiants, paiements), grille tarifaire, calendrier des sessions.

**Semaine 1 — Onboarding (§65)**
1. Informations du centre et logo · 2. Formations pilotes (Excel, Power BI, Microsoft 365, MS Project, IA/ChatGPT, Bureautique) avec modules · 3. Import Excel des étudiants · 4. Formateurs + invitations · 5. Moyens de paiement et règles de relance · 6. Règles de certification · 7. Activation du centre.
- Formation des administrateurs (2 h) et des formateurs (1 h : présences, notes, supports).

**Semaines 2–6 — Exploitation réelle en parallèle** de l'existant (double saisie limitée aux paiements la 1re semaine), point hebdomadaire, collecte des retours dans un tableau (bloquant / gênant / souhait).

**Semaine 7 — Bilan** : indicateurs (temps de saisie, relances envoyées, taux de recouvrement, usage IA), décision de passage en production.

## Évolutions prévues

- **V1.1** : sous-domaine par centre, réinitialisation du mot de passe par SMS, paiement Mobile Money (CinetPay / PayDunya / Wave), reçus de paiement PDF, tableau des tâches de suivi, notifications push.
- **V2 (§45)** : application mobile, WhatsApp Business officiel, SMS avancés, facturation avancée, intégrations comptables, Microsoft 365 / Google Workspace, multi-pays.
- **V3** : marketplace, API publique, tuteur IA avancé, analyse prédictive, IA vocale.

## Modèle économique (§42–43) — rappel

Starter 50 000 FCFA/mois · Business 100 000 FCFA/mois · Enterprise sur devis ; frais d'installation, formation, support premium, dépassement de quota IA. Les limites de chaque plan sont appliquées automatiquement et modifiables dans `/admin/plans`.
