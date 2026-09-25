/**
 * Données de test (§68) : 1 centre fictif, 5 formateurs, 50 étudiants,
 * 6 formations, plusieurs sessions, paiements, absences, évaluations, certificats.
 * + plans d'abonnement, super administrateur et centre pilote CFCM-CI (vide).
 *
 * Usage : npm run db:seed   (NE JAMAIS exécuter en production)
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import * as s from "../src/db/schema";
import { closeDb } from "../src/db/client";
import { withSystem, withTenant } from "../src/db/tenant";
import { hashPassword } from "../src/lib/security/password";
import { splitInstallments } from "../src/lib/domain/finance";
import { addDaysISO, todayISO, slugify } from "../src/lib/format";
import { issueCertificate } from "../src/server/certificates";
import { DEFAULT_TEMPLATES } from "../src/server/communications";
import { indexMaterial } from "../src/server/material-index";

if (process.env.APP_ENV === "production") {
  console.error("✗ Le seed est interdit en production.");
  process.exit(1);
}

const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? "Demo-Password-2026";

// Générateur pseudo-aléatoire déterministe (données reproductibles)
let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

const FIRST = ["Jean", "Awa", "Kouassi", "Aya", "Yao", "Adjoua", "Koffi", "Mariam", "Serge", "Fatou", "Didier", "Aminata", "Hervé", "Grâce", "Ibrahim", "Christelle", "Moussa", "Estelle", "Franck", "Nadège", "Arnaud", "Salimata", "Olivier", "Raïssa", "Bakary"];
const LAST = ["Kouadio", "Koné", "Traoré", "N'Guessan", "Yao", "Bamba", "Coulibaly", "Konan", "Ouattara", "Diabaté", "Touré", "Kouamé", "Brou", "Aka", "Gbagbo", "Sanogo", "Diallo", "Assi", "Ehui", "Tanoh"];
const JOBS = ["Comptable", "Assistante de direction", "Chargé RH", "Étudiant", "Gestionnaire de stock", "Contrôleur de gestion", "Commercial", "Chef de projet", "Enseignant", "Entrepreneur"];
const COMPANIES = ["SIB", "Orange CI", "MTN CI", "CIE", "Nestlé CI", "Port Autonome d'Abidjan", "Indépendant", "SODECI", "Bolloré", "Ministère"];
const LEVELS = ["BAC", "BTS", "Licence", "Master", "BEPC"];
const SOURCES = ["Facebook", "Bouche-à-oreille", "Site web", "WhatsApp", "Entreprise", "Ancien étudiant"];

async function main() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const today = todayISO("Africa/Abidjan");
  const year = Number(today.slice(0, 4));

  // ------------------------------------------------ remise à zéro (rôle propriétaire, dev uniquement)
  const owner = new Pool({ connectionString: process.env.DATABASE_MIGRATION_URL, max: 1 });
  await owner.query(`truncate table ${["audit_logs", ...s.TENANT_TABLES, "auth_sessions", "auth_tokens", "rate_limits", "users", "organizations", "plans"].map((t) => `"${t}"`).join(", ")} cascade`);
  await owner.end();

  // ------------------------------------------------ plateforme
  const { demo, pilot } = await withSystem(async (tx) => {
    const [starter, business] = await tx
      .insert(s.plans)
      .values([
        { code: "starter", name: "Starter", description: "Pour petits centres", priceMonthly: 50_000, maxStudents: 200, maxInstructors: 5, maxCourses: 10, maxAdmins: 2, storageMb: 2_000, aiRequestsPerMonth: 300 },
        { code: "business", name: "Business", description: "Pour centres structurés", priceMonthly: 100_000, maxStudents: 1_000, maxInstructors: 25, maxCourses: 50, maxAdmins: 5, storageMb: 20_000, aiRequestsPerMonth: 2_000 },
        { code: "enterprise", name: "Enterprise", description: "Écoles et organismes importants — prix sur devis", priceMonthly: null, maxStudents: null, maxInstructors: null, maxCourses: null, maxAdmins: null, storageMb: null, aiRequestsPerMonth: null },
      ])
      .returning();
    // Super admin de démonstration uniquement en local : sur un serveur, utiliser « create-super-admin »
    if (!process.env.APP_ENV || ["development", "test"].includes(process.env.APP_ENV)) {
      await tx.insert(s.users).values({ email: "superadmin@trainingos.ai", passwordHash, firstName: "Super", lastName: "Admin", role: "super_admin", emailVerifiedAt: new Date() });
    }

    const [demo] = await tx
      .insert(s.organizations)
      .values({
        slug: "centre-demo",
        name: "Centre Démo Formation",
        description: "Centre fictif utilisé pour tester l'ensemble de la plateforme.",
        city: "Abidjan",
        address: "Cocody, Riviera 2",
        phone: "+225 07 00 00 00 00",
        email: "contact@centre-demo.ci",
        managerName: "Directrice Démo",
        status: "active",
        publicPageEnabled: true,
        certificatePrefix: "DEMO",
        certificateSignatoryName: "Mme Awa Koné",
        certificateSignatoryTitle: "Directrice pédagogique",
        settings: { reminderDaysBefore: 3, reminderDaysAfter: 3, absenceAlertThreshold: 2 },
      })
      .returning();
    const [pilot] = await tx
      .insert(s.organizations)
      .values({ slug: "cfcm-ci", name: "CFCM-CI", city: "Abidjan", status: "onboarding", certificatePrefix: "CFCM", description: "Centre pilote TRAINING OS AI." })
      .returning();
    await tx.insert(s.subscriptions).values([
      { organizationId: demo.id, planId: business.id, status: "active", currentPeriodStart: `${year}-01-01`, currentPeriodEnd: `${year}-12-31`, amount: 100_000 },
      { organizationId: pilot.id, planId: starter.id, status: "trialing", currentPeriodStart: today, currentPeriodEnd: addDaysISO(today, 60), amount: 0 },
    ]);
    await tx.insert(s.users).values({ organizationId: pilot.id, email: "admin@cfcm-ci.test", passwordHash, firstName: "Admin", lastName: "CFCM", role: "org_admin", mustChangePassword: true });
    return { demo, pilot };
  });
  void pilot;

  // ------------------------------------------------ centre démo
  await withTenant(demo.id, null, async (tx) => {
    const org = demo.id;
    const [admin] = await tx
      .insert(s.users)
      .values([
        { organizationId: org, email: "admin@demo.trainingos.ai", passwordHash, firstName: "Awa", lastName: "Koné", role: "org_admin", emailVerifiedAt: new Date() },
        { organizationId: org, email: "gestion@demo.trainingos.ai", passwordHash, firstName: "Paul", lastName: "Aka", role: "manager", emailVerifiedAt: new Date() },
      ])
      .returning();

    await tx.insert(s.messageTemplates).values(Object.entries(DEFAULT_TEMPLATES).filter(([k]) => k !== "account_created").map(([key, t]) => ({ organizationId: org, key, ...t })));

    // Formateurs
    const instructorDefs = [
      ["Serge", "Yao", "Excel & Power BI"],
      ["Christelle", "Bamba", "Bureautique"],
      ["Didier", "Konan", "Gestion de projet"],
      ["Mariam", "Touré", "Intelligence artificielle"],
      ["Hervé", "Assi", "Microsoft 365"],
    ];
    const instructors: (typeof s.instructors.$inferSelect)[] = [];
    for (const [i, [fn, ln, sp]] of instructorDefs.entries()) {
      const [u] = await tx
        .insert(s.users)
        .values({ organizationId: org, email: `formateur${i + 1}@demo.trainingos.ai`, passwordHash, firstName: fn, lastName: ln, role: "instructor", emailVerifiedAt: new Date() })
        .returning();
      const [ins] = await tx.insert(s.instructors).values({ organizationId: org, userId: u.id, firstName: fn, lastName: ln, email: u.email, specialty: sp }).returning();
      instructors.push(ins);
    }

    // Formations (+ modules)
    const courseDefs: { name: string; cat: string; level: string; hours: number; price: number; instr: number; modules: string[] }[] = [
      { name: "Excel — Du débutant à Expert", cat: "Bureautique", level: "Tous niveaux", hours: 40, price: 100_000, instr: 0, modules: ["Environnement Excel", "Formules", "Fonctions", "Fonctions avancées", "Tableaux croisés dynamiques", "Dashboards", "Automatisation", "Projet final"] },
      { name: "Power BI", cat: "Data", level: "Intermédiaire", hours: 30, price: 150_000, instr: 0, modules: ["Power Query", "Modélisation", "DAX", "Visualisations", "Publication"] },
      { name: "Bureautique", cat: "Bureautique", level: "Débutant", hours: 24, price: 60_000, instr: 1, modules: ["Windows", "Word", "Excel bases", "PowerPoint"] },
      { name: "MS Project", cat: "Gestion de projet", level: "Intermédiaire", hours: 21, price: 120_000, instr: 2, modules: ["Planification", "Ressources", "Suivi", "Reporting"] },
      { name: "IA & ChatGPT au travail", cat: "Intelligence artificielle", level: "Tous niveaux", hours: 12, price: 75_000, instr: 3, modules: ["Comprendre l'IA", "Prompting", "Cas d'usage métiers", "Éthique et sécurité"] },
      { name: "Microsoft 365", cat: "Bureautique", level: "Débutant", hours: 18, price: 80_000, instr: 4, modules: ["Outlook", "Teams", "OneDrive & SharePoint", "Collaboration"] },
    ];
    const courses: (typeof s.courses.$inferSelect & { mods: (typeof s.courseModules.$inferSelect)[] })[] = [];
    for (const d of courseDefs) {
      const [c] = await tx
        .insert(s.courses)
        .values({
          organizationId: org,
          name: d.name,
          slug: slugify(d.name),
          description: `Formation ${d.name} : pratique, orientée cas réels d'entreprise.`,
          category: d.cat,
          level: d.level,
          durationHours: d.hours,
          price: d.price,
          capacity: 20,
          objectives: "Maîtriser les compétences clés et les appliquer en situation professionnelle.",
          prerequisites: d.level === "Débutant" ? "Aucun" : "Connaissances de base en informatique",
          instructorId: instructors[d.instr].id,
          status: "published",
          isPublic: true,
          certMinAttendance: 75,
          certMinGrade: 50,
        })
        .returning();
      const mods = await tx
        .insert(s.courseModules)
        .values(d.modules.map((title, i) => ({ organizationId: org, courseId: c.id, position: i + 1, title, durationHours: Math.round(d.hours / d.modules.length) })))
        .returning();
      courses.push({ ...c, mods });
    }
    const [excel, powerbi, bureautique, msproject, ia, m365] = courses;
    await tx.insert(s.courseRecommendations).values([
      { organizationId: org, fromCourseId: excel.id, toCourseId: powerbi.id, reason: "Vous avez terminé Excel : Power BI constitue une suite logique de votre parcours." },
      { organizationId: org, fromCourseId: bureautique.id, toCourseId: excel.id, reason: "Après la bureautique, approfondissez Excel jusqu'au niveau expert." },
      { organizationId: org, fromCourseId: m365.id, toCourseId: ia.id, reason: "Boostez votre productivité Microsoft 365 avec l'IA." },
      { organizationId: org, fromCourseId: excel.id, toCourseId: msproject.id, reason: "Excel + MS Project : pilotez vos projets de bout en bout." },
    ]);

    // Support indexé pour le RAG
    const [mat] = await tx
      .insert(s.materials)
      .values({ organizationId: org, courseId: excel.id, moduleId: excel.mods[2].id, title: "Support Excel Expert — Module 3 : Fonctions", kind: "file", fileName: "Support_Excel_Expert.txt", mimeType: "text/plain", visibility: "students", uploadedBy: admin.id })
      .returning();
    await indexMaterial(
      tx,
      mat,
      `Module 3 — Les fonctions Excel.
Dans ce module nous étudions les fonctions essentielles : SOMME, MOYENNE, NB, NB.SI, SOMME.SI, SI, ET, OU.
La fonction RECHERCHEV recherche une valeur dans la première colonne d'un tableau et renvoie la valeur d'une autre colonne.
La fonction RECHERCHEX, disponible dans Microsoft 365, remplace RECHERCHEV : elle cherche une valeur dans une plage et renvoie l'élément correspondant d'une autre plage, dans n'importe quelle direction, avec une valeur par défaut si rien n'est trouvé.
Syntaxe : =RECHERCHEX(valeur_cherchée; tableau_recherche; tableau_renvoyé; [si_non_trouvé]).
Les fonctions de texte : GAUCHE, DROITE, STXT, CONCAT, TEXTE.
Les fonctions de date : AUJOURDHUI, DATEDIF, FIN.MOIS.
Exercice : calculer la commission de chaque commercial avec SI et RECHERCHEX.`,
    );

    // Étudiants
    const students: (typeof s.students.$inferSelect)[] = [];
    for (let i = 0; i < 50; i++) {
      const fn = FIRST[i % FIRST.length];
      const ln = LAST[(i * 7) % LAST.length];
      const email = `etudiant${i + 1}@demo.trainingos.ai`;
      let userId: string | null = null;
      if (i < 10 || (i >= 20 && i < 25)) {
        const [u] = await tx.insert(s.users).values({ organizationId: org, email, passwordHash, firstName: fn, lastName: ln, role: "student", emailVerifiedAt: new Date() }).returning();
        userId = u.id;
      }
      const [st] = await tx
        .insert(s.students)
        .values({
          organizationId: org,
          userId,
          matricule: `ETU-${year}-${String(i + 1).padStart(5, "0")}`,
          firstName: fn,
          lastName: ln,
          email,
          phone: `+225 07 ${String(10 + i).padStart(2, "0")} ${String(20 + i).padStart(2, "0")} ${String(30 + i).padStart(2, "0")} ${String(40 + i).padStart(2, "0")}`,
          country: "Côte d'Ivoire",
          profession: pick(JOBS),
          company: pick(COMPANIES),
          educationLevel: pick(LEVELS),
          leadSource: pick(SOURCES),
          lastActivityAt: new Date(Date.now() - Math.floor(rnd() * 20) * 86_400_000),
        })
        .returning();
      students.push(st);
    }
    await tx.insert(s.orgCounters).values({ organizationId: org, key: `student-${year}`, value: 50 });

    // Sessions : une passée (terminée), une en cours, une à venir
    const mkSession = async (course: (typeof courses)[number], name: string, start: string, end: string, status: (typeof s.courseSessions.$inferSelect)["status"], meetings: number) => {
      const [cs] = await tx
        .insert(s.courseSessions)
        .values({ organizationId: org, courseId: course.id, name, startDate: start, endDate: end, days: "Lun, Mer, Ven", startTime: "18:00", endTime: "20:00", room: pick(["Salle A", "Salle B", "Labo 1"]), instructorId: course.instructorId, capacity: 20, status })
        .returning();
      const ms = [];
      const span = Math.max(1, (new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86_400_000);
      for (let k = 0; k < meetings; k++) {
        const date = addDaysISO(start, Math.floor((k * span) / Math.max(1, meetings - 1)));
        const [m] = await tx
          .insert(s.sessionMeetings)
          .values({ organizationId: org, sessionId: cs.id, date, startTime: "18:00", endTime: "20:00", moduleId: course.mods[Math.min(course.mods.length - 1, Math.floor((k / meetings) * course.mods.length))].id, topic: course.mods[Math.min(course.mods.length - 1, Math.floor((k / meetings) * course.mods.length))].title })
          .onConflictDoNothing()
          .returning();
        if (m) ms.push(m);
      }
      return { ...cs, meetings: ms, course };
    };

    const excelPast = await mkSession(excel, `Excel — Session juin ${year}`, `${year}-06-01`, `${year}-07-10`, "completed", 12);
    const excelNow = await mkSession(excel, `Excel — Session septembre ${year}`, addDaysISO(today, -21), addDaysISO(today, 20), "in_progress", 8);
    const bureautiqueNow = await mkSession(bureautique, `Bureautique — Septembre ${year}`, addDaysISO(today, -14), addDaysISO(today, 14), "in_progress", 6);
    const iaNow = await mkSession(ia, `IA & ChatGPT — Septembre ${year}`, addDaysISO(today, -10), addDaysISO(today, 5), "in_progress", 5);
    const m365Past = await mkSession(m365, `Microsoft 365 — Juillet ${year}`, `${year}-07-01`, `${year}-07-25`, "completed", 8);
    await mkSession(powerbi, `Power BI — Octobre ${year}`, addDaysISO(today, 20), addDaysISO(today, 60), "open", 0);
    await mkSession(msproject, `MS Project — Novembre ${year}`, addDaysISO(today, 45), addDaysISO(today, 75), "open", 0);
    await mkSession(excel, `Excel — Session novembre ${year}`, addDaysISO(today, 40), addDaysISO(today, 80), "draft", 0);

    // Inscriptions, paiements, présences, évaluations
    const plan: [typeof excelPast, number[], "completed" | "active"][] = [
      [excelPast, range(0, 12), "completed"],
      [m365Past, range(12, 20), "completed"],
      [excelNow, range(20, 34), "active"],
      [bureautiqueNow, range(34, 44), "active"],
      [iaNow, [...range(44, 50), 0, 1, 2]],
    ].map((x) => [x[0], x[1], (x[2] ?? "active")] as [typeof excelPast, number[], "completed" | "active"]);

    const methods = ["cash", "mobile_money", "bank_transfer", "mobile_money", "card"] as const;
    const toCertify: string[] = [];
    for (const [sess, idxs, status] of plan) {
      const course = sess.course;
      const ass = await tx
        .insert(s.assessments)
        .values([
          { organizationId: org, courseId: course.id, sessionId: sess.id, moduleId: course.mods[1].id, type: "quiz", title: `Quiz — ${course.mods[1].title}`, maxScore: 20, passScore: 10, date: sess.meetings[Math.min(2, Math.max(0, sess.meetings.length - 1))]?.date ?? sess.startDate, createdBy: admin.id, questions: quiz(course.name) },
          { organizationId: org, courseId: course.id, sessionId: sess.id, moduleId: course.mods[course.mods.length - 1].id, type: "exam", title: `Examen final — ${course.name}`, maxScore: 20, passScore: 10, isFinalExam: true, date: sess.endDate, createdBy: admin.id },
        ])
        .returning();
      for (const [n, idx] of idxs.entries()) {
        const st = students[idx];
        const sched = splitInstallments(course.price, 3, sess.startDate, 30);
        const [e] = await tx
          .insert(s.enrollments)
          .values({ organizationId: org, studentId: st.id, sessionId: sess.id, courseId: course.id, status, agreedPrice: course.price, enrolledAt: new Date(`${addDaysISO(sess.startDate, -7)}T09:00:00Z`), createdBy: admin.id, paymentTerms: "3 versements" })
          .returning();
        await tx.insert(s.paymentSchedules).values(sched.map((x) => ({ ...x, organizationId: org, enrollmentId: e.id })));
        // Paiements : la plupart à jour, certains en retard
        const payProfile = status === "completed" ? (n % 5 === 4 ? 2 : 3) : n % 4 === 3 ? 0 : n % 3 === 0 ? 2 : 1;
        for (let k = 0; k < payProfile; k++) {
          if (sched[k].dueDate > today) break;
          await tx.insert(s.payments).values({ organizationId: org, enrollmentId: e.id, amount: sched[k].amount, method: methods[(n + k) % methods.length], reference: `REF-${e.id.slice(0, 6).toUpperCase()}-${k + 1}`, paidAt: sched[k].dueDate, recordedBy: admin.id });
        }
        // Présences (profil d'assiduité variable)
        const weak = n % 6 === 5;
        const pastMeetings = sess.meetings.filter((m) => m.date <= today);
        for (const [k, m] of pastMeetings.entries()) {
          const r = rnd();
          let st2: "present" | "absent" | "late" | "excused" = r < 0.85 ? "present" : r < 0.93 ? "late" : r < 0.97 ? "absent" : "excused";
          if (weak && (k >= pastMeetings.length - 2 || r < 0.4)) st2 = "absent";
          await tx.insert(s.attendance).values({ organizationId: org, meetingId: m.id, enrollmentId: e.id, status: st2, recordedBy: admin.id });
        }
        // Progression par module
        const ratio = status === "completed" ? 1 : Math.min(1, pastMeetings.length / Math.max(1, sess.meetings.length));
        for (const [k, mod] of course.mods.entries()) {
          const pct = status === "completed" ? 100 : Math.max(0, Math.min(100, Math.round((ratio * course.mods.length - k) * 100)));
          if (pct > 0) await tx.insert(s.moduleProgress).values({ organizationId: org, enrollmentId: e.id, moduleId: mod.id, percent: weak ? Math.round(pct * 0.5) : pct, completedAt: pct >= 100 ? new Date() : null });
        }
        // Notes
        const base = weak ? 7 : 11 + rnd() * 8;
        if (ass[0].date && ass[0].date <= today) {
          const sc = Math.round(Math.min(20, base + (rnd() - 0.5) * 4));
          await tx.insert(s.assessmentResults).values({ organizationId: org, assessmentId: ass[0].id, enrollmentId: e.id, score: sc, passed: sc >= 10, gradedBy: admin.id });
        }
        if (status === "completed") {
          const sc = Math.round(Math.min(20, base + (rnd() - 0.3) * 4));
          await tx.insert(s.assessmentResults).values({ organizationId: org, assessmentId: ass[1].id, enrollmentId: e.id, score: sc, passed: sc >= 10, gradedBy: admin.id });
          if (n % 3 !== 2) toCertify.push(e.id);
        }
      }
    }
    // Certificats pour une partie des diplômés (les autres restent « à générer »)
    let issued = 0;
    for (const id of toCertify) {
      try {
        await issueCertificate(tx, org, null, id);
        issued++;
      } catch {
        // non éligible : reste dans les alertes
      }
    }

    // Prospects (CRM)
    const statuses: (typeof s.prospects.$inferSelect)["status"][] = ["new", "contacted", "interested", "offer_sent", "preregistered", "lost", "new", "interested"];
    for (let i = 0; i < 16; i++) {
      await tx.insert(s.prospects).values({
        organizationId: org,
        firstName: pick(FIRST),
        lastName: pick(LAST),
        phone: `+225 05 ${String(60 + i).padStart(2, "0")} 11 22 33`,
        email: `prospect${i + 1}@exemple.ci`,
        desiredCourseId: pick(courses).id,
        source: pick(SOURCES),
        status: statuses[i % statuses.length],
        lastContactAt: new Date(Date.now() - i * 86_400_000),
        nextAction: i % 2 ? "Rappeler pour confirmer la session" : "Envoyer le programme détaillé",
        nextActionAt: addDaysISO(today, (i % 5) - 2),
      });
    }
    console.log(`✓ Centre démo : 5 formateurs, 50 étudiants, ${courses.length} formations, ${issued} certificats`);
    return { excelNow };
  });

  // Vérification : le rôle applicatif voit bien 0 étudiant hors contexte (RLS)
  const leak = await (await import("../src/db/client")).rawDb().execute(sql`select count(*)::int as n from students`);
  console.log(`✓ Contrôle RLS : étudiants visibles sans contexte de centre = ${(leak.rows[0] as { n: number }).n} (attendu : 0)`);

  console.log(`
Comptes de démonstration (mot de passe : ${DEMO_PASSWORD})
${!process.env.APP_ENV || ["development", "test"].includes(process.env.APP_ENV) ? "  Super admin     : superadmin@trainingos.ai\n" : ""}  Admin centre    : admin@demo.trainingos.ai
  Gestionnaire    : gestion@demo.trainingos.ai
  Formateur       : formateur1@demo.trainingos.ai
  Étudiant        : etudiant21@demo.trainingos.ai (Excel en cours) / etudiant1@demo.trainingos.ai (diplômé)
  Centre pilote   : admin@cfcm-ci.test (changement de mot de passe obligatoire)
`);
}

function range(a: number, b: number) {
  return Array.from({ length: b - a }, (_, i) => a + i);
}

function quiz(course: string): s.QuizQuestion[] {
  if (course.startsWith("Excel"))
    return [
      { id: "q1", question: "Quelle fonction additionne une plage de cellules ?", options: ["MOYENNE", "SOMME", "NB", "MAX"], answer: 1 },
      { id: "q2", question: "Quel symbole commence toujours une formule ?", options: ["#", "=", "$", "@"], answer: 1 },
      { id: "q3", question: "Que renvoie NB.SI ?", options: ["Une somme", "Un nombre de cellules répondant à un critère", "Une moyenne", "Un texte"], answer: 1 },
      { id: "q4", question: "RECHERCHEX peut chercher…", options: ["Uniquement vers la droite", "Dans n'importe quelle direction", "Uniquement des nombres", "Uniquement dans un autre fichier"], answer: 1 },
    ];
  return [
    { id: "q1", question: `La formation « ${course} » vise d'abord à…`, options: ["Mémoriser la théorie", "Appliquer en situation professionnelle", "Passer un concours", "Aucune réponse"], answer: 1 },
    { id: "q2", question: "Le meilleur moyen de progresser est de…", options: ["Pratiquer régulièrement", "Attendre l'examen", "Lire uniquement", "Ne rien faire"], answer: 0 },
  ];
}

main()
  .then(() => closeDb())
  .catch(async (e) => {
    console.error("✗ Seed échoué :", e);
    await closeDb();
    process.exit(1);
  });
