import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, rawDb } from "@/db/client";
import * as s from "@/db/schema";
import { withSystem, withTenant } from "@/db/tenant";
import { MockProvider } from "@/lib/ai/mock";
import { rateLimit } from "@/lib/security/rate-limit";
import { directorTools } from "@/server/ai/director-tools";
import { studentTools } from "@/server/ai/learner-tools";
import { consumeAuthToken, createAuthToken } from "@/server/auth-tokens";
import { issueCertificate } from "@/server/certificates";
import { commitImport, validateRows } from "@/server/import";
import { runDailyJobs } from "@/server/jobs";
import { indexMaterial } from "@/server/material-index";
import { searchMaterials } from "@/server/materials-search";
import { loadEnrollmentSummaries } from "@/server/summaries";
import { ctxFor, makeCenter } from "./helpers";

let C: Awaited<ReturnType<typeof makeCenter>>;
let D: Awaited<ReturnType<typeof makeCenter>>;

beforeAll(async () => {
  C = await makeCenter("Flux");
  D = await makeCenter("Autre");
});
afterAll(async () => closeDb());

describe("Parcours MVP (§57) : paiement → présence → note → progression → certificat → vérification", () => {
  it("calcule le solde après paiement (100 000 F, 30 000 payés → reste 70 000)", async () => {
    await withTenant(C.org.id, null, (tx) => tx.insert(s.payments).values({ organizationId: C.org.id, enrollmentId: C.enrollment.id, amount: 30_000, method: "mobile_money", paidAt: "2026-01-05" }));
    const [sum] = await withTenant(C.org.id, null, (tx) => loadEnrollmentSummaries(tx, C.org.id, { enrollmentIds: [C.enrollment.id] }));
    expect(sum.balance.paid).toBe(30_000);
    expect(sum.balance.remaining).toBe(70_000);
  });

  it("refuse le certificat tant que les conditions ne sont pas remplies", async () => {
    await expect(withTenant(C.org.id, null, (tx) => issueCertificate(tx, C.org.id, null, C.enrollment.id))).rejects.toThrow(/Conditions non remplies/);
  });

  it("présences + notes + modules → éligible → certificat avec numéro unique → vérification publique", async () => {
    await withTenant(C.org.id, null, async (tx) => {
      for (const m of C.meetings) await tx.insert(s.attendance).values({ organizationId: C.org.id, meetingId: m.id, enrollmentId: C.enrollment.id, status: "present" });
      const [a] = await tx.insert(s.assessments).values({ organizationId: C.org.id, courseId: C.course.id, sessionId: C.session.id, type: "exam", title: "Final", maxScore: 20, passScore: 10, isFinalExam: true }).returning();
      await tx.insert(s.assessmentResults).values({ organizationId: C.org.id, assessmentId: a.id, enrollmentId: C.enrollment.id, score: 15, passed: true });
      for (const m of C.mods) await tx.insert(s.moduleProgress).values({ organizationId: C.org.id, enrollmentId: C.enrollment.id, moduleId: m.id, percent: 100 });
    });
    const [sum] = await withTenant(C.org.id, null, (tx) => loadEnrollmentSummaries(tx, C.org.id, { enrollmentIds: [C.enrollment.id] }));
    expect(sum.attendance.rate).toBe(100);
    expect(sum.averageGrade).toBe(75);
    expect(sum.progress.global).toBe(90); // (30×100 + 30×100 + 40×75) / 100
    expect(sum.certification.eligible).toBe(true);

    const { certificate } = await withTenant(C.org.id, null, (tx) => issueCertificate(tx, C.org.id, null, C.enrollment.id));
    expect(certificate.code).toMatch(/^CERT-\d{4}-000001$/);
    await expect(withTenant(C.org.id, null, (tx) => issueCertificate(tx, C.org.id, null, C.enrollment.id))).rejects.toThrow(/déjà/);

    const res = await rawDb().execute<Record<string, unknown>>(sql`select * from verify_certificate(${certificate.code.toLowerCase()}, 'iphash')`);
    expect(res.rows).toHaveLength(1);
    // Seuls les champs autorisés sont exposés (§41)
    expect(Object.keys(res.rows[0]).sort()).toEqual(["code", "completion_date", "course_name", "duration_hours", "issued_at", "organization_name", "revoked_at", "status", "student_name"]);
    expect(res.rows[0].student_name).toBe("Jean Kouadio");
    const logs = await withTenant(C.org.id, null, (tx) => tx.select().from(s.certificateVerifications).where(eq(s.certificateVerifications.certificateId, certificate.id)));
    expect(logs).toHaveLength(1);
    const [e] = await withTenant(C.org.id, null, (tx) => tx.select().from(s.enrollments).where(eq(s.enrollments.id, C.enrollment.id)));
    expect(e.status).toBe("completed");
  });

  it("un code inexistant ne renvoie rien", async () => {
    const res = await rawDb().execute(sql`select * from verify_certificate('NOPE-0000', null)`);
    expect(res.rows).toHaveLength(0);
  });
});

describe("Assistant IA : données minimales et cloisonnées (§19, §49, §50)", () => {
  it("les outils du directeur ne voient que le centre et ne transmettent ni téléphone ni email", async () => {
    const tools = directorTools(ctxFor(C, "org_admin"), "Africa/Abidjan");
    const unpaid = (await tools.find((t) => t.name === "list_unpaid")!.run({})) as { etudiants: Record<string, unknown>[] };
    expect(unpaid.etudiants.length).toBeGreaterThan(0);
    const json = JSON.stringify(unpaid);
    expect(json).not.toMatch(/@t\.test/);
    expect(json).not.toContain(D.student.matricule);
  });

  it("le mode démonstration répond avec des chiffres calculés, sans les inventer", async () => {
    const tools = directorTools(ctxFor(C, "org_admin"), "Africa/Abidjan");
    const r = await new MockProvider().chat({ system: "", history: [{ role: "user", content: "Combien avons-nous encaissé ce mois-ci ?" }], tools });
    expect(r.toolsUsed).toEqual(["get_revenue"]);
    const r2 = await new MockProvider().chat({ system: "", history: [{ role: "user", content: "Quelle est la météo ?" }], tools });
    expect(r2.text).toContain("Je ne dispose pas de cette information");
  });

  it("l'assistant étudiant ne reçoit que les données de CET étudiant", async () => {
    const tools = studentTools(ctxFor(C, "student"), "Africa/Abidjan");
    const o = (await tools.find((t) => t.name === "get_my_overview")!.run({})) as { formations: unknown[] };
    expect(o.formations).toHaveLength(1);
    expect(JSON.stringify(o)).not.toContain("Awa"); // l'autre étudiant de la même session
  });

  it("recherche documentaire limitée aux supports visibles par l'étudiant", async () => {
    await withTenant(C.org.id, null, async (tx) => {
      const [pub] = await tx.insert(s.materials).values({ organizationId: C.org.id, courseId: C.course.id, title: "Cours public", kind: "file", visibility: "students" }).returning();
      const [priv] = await tx.insert(s.materials).values({ organizationId: C.org.id, courseId: C.course.id, title: "Corrigé privé", kind: "file", visibility: "admin" }).returning();
      await indexMaterial(tx, pub, "La fonction RECHERCHEX remplace RECHERCHEV dans Excel.");
      await indexMaterial(tx, priv, "Corrigé confidentiel : la fonction RECHERCHEX donne 42.");
    });
    const res = await withTenant(C.org.id, null, (tx) => searchMaterials(tx, { orgId: C.org.id, courseIds: [C.course.id], visibilities: ["students"], query: "fonctions RECHERCHEX" }));
    expect(res.length).toBe(1);
    expect(res[0].support).toBe("Cours public");
  });
});

describe("Import, tâches planifiées, sécurité", () => {
  it("importe des étudiants et ignore les doublons", async () => {
    const rows = validateRows(
      { headers: ["Nom", "Prénom", "Email", "Formation", "Montant", "Payé"], rows: [["Traoré", "Awa", "awa.import@t.test", "Excel", "100000", "50000"], ["Traoré", "Awa", "awa.import@t.test", "", "", ""], ["", "SansNom", "", "", "", ""]] },
      { lastName: 0, firstName: 1, email: 2, course: 3, amount: 4, amountPaid: 5 },
    );
    const r = await withTenant(D.org.id, D.admin.id, (tx) => commitImport(tx, D.org.id, D.admin.id, rows));
    expect(r.created).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.enrollments).toBe(1);
    expect(r.payments).toBe(1);
  });

  it("les tâches quotidiennes sont idempotentes (pas de double relance)", async () => {
    await withTenant(D.org.id, null, async (tx) => {
      const today = new Date().toISOString().slice(0, 10);
      await tx.insert(s.paymentSchedules).values({ organizationId: D.org.id, enrollmentId: D.enrollment.id, position: 1, label: "Échéance", dueDate: today, amount: 100_000 });
      await tx.update(s.students).set({ email: "rappel@t.test" }).where(eq(s.students.id, D.student.id));
    });
    await runDailyJobs();
    await runDailyJobs();
    const mails = await withTenant(D.org.id, null, (tx) => tx.select().from(s.communications).where(and(eq(s.communications.organizationId, D.org.id), eq(s.communications.templateKey, "payment_due_today"))));
    expect(mails).toHaveLength(1);
  });

  it("limitation de débit", async () => {
    const key = `test:${Date.now()}`;
    const results = [];
    for (let i = 0; i < 4; i++) results.push((await rateLimit(key, 3, 60)).allowed);
    expect(results).toEqual([true, true, true, false]);
  });

  it("jeton de réinitialisation : usage unique, stocké haché", async () => {
    const token = await withSystem((tx) => createAuthToken(tx, C.admin.id, "password_reset", 1));
    const stored = await withSystem((tx) => tx.select().from(s.authTokens).where(eq(s.authTokens.userId, C.admin.id)));
    expect(stored[0].tokenHash).not.toBe(token);
    expect(await withSystem((tx) => consumeAuthToken(tx, token, ["password_reset"]))).not.toBeNull();
    expect(await withSystem((tx) => consumeAuthToken(tx, token, ["password_reset"]))).toBeNull();
  });
});
