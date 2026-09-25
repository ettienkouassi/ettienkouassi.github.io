import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, rawDb } from "@/db/client";
import * as s from "@/db/schema";
import { withSystem, withTenant } from "@/db/tenant";
import { makeCenter } from "./helpers";

/** Vérifie qu'une requête échoue avec le code d'erreur PostgreSQL attendu (42501 = permission refusée). */
async function expectPgError(p: Promise<unknown>, code: string) {
  const err = await p.then(() => null, (e: { cause?: { code?: string }; code?: string }) => e);
  expect(err, "la requête aurait dû échouer").not.toBeNull();
  expect(err!.cause?.code ?? err!.code).toBe(code);
}

let A: Awaited<ReturnType<typeof makeCenter>>;
let B: Awaited<ReturnType<typeof makeCenter>>;

beforeAll(async () => {
  A = await makeCenter("A");
  B = await makeCenter("B");
});
afterAll(async () => closeDb());

describe("Isolation des centres (§4, §31) — Row Level Security PostgreSQL", () => {
  it("sans contexte de centre, l'application ne voit AUCUNE donnée métier", async () => {
    const r = await rawDb().execute<{ n: number }>(sql`select count(*)::int as n from students`);
    expect(r.rows[0].n).toBe(0);
  });

  it("le centre A ne voit que ses étudiants, même sans filtre explicite", async () => {
    const rows = await withTenant(A.org.id, null, (tx) => tx.select().from(s.students));
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.organizationId === A.org.id)).toBe(true);
  });

  it("le centre A ne peut pas lire une ligne de B en connaissant son identifiant", async () => {
    const rows = await withTenant(A.org.id, null, (tx) => tx.select().from(s.students).where(eq(s.students.id, B.student.id)));
    expect(rows).toEqual([]);
  });

  it("le centre A ne peut pas modifier ni supprimer une ligne de B", async () => {
    const upd = await withTenant(A.org.id, null, (tx) => tx.update(s.students).set({ firstName: "Piraté" }).where(eq(s.students.id, B.student.id)).returning());
    expect(upd).toEqual([]);
    const [still] = await withTenant(B.org.id, null, (tx) => tx.select().from(s.students).where(eq(s.students.id, B.student.id)));
    expect(still.firstName).toBe("Jean");
  });

  it("le centre A ne peut pas insérer une ligne au nom de B (WITH CHECK)", async () => {
    // 42501 : violation de politique RLS
    await expectPgError(withTenant(A.org.id, null, (tx) => tx.insert(s.students).values({ organizationId: B.org.id, matricule: "X", firstName: "X", lastName: "Y" })), "42501");
  });

  it("clé étrangère composite : impossible d'inscrire un étudiant de B dans une session de A", async () => {
    // 23503 : clé étrangère (organization_id, student_id) inexistante dans le centre A
    await expectPgError(
      withTenant(A.org.id, null, (tx) => tx.insert(s.enrollments).values({ organizationId: A.org.id, studentId: B.student.id, sessionId: A.session.id, courseId: A.course.id, agreedPrice: 1 })),
      "23503",
    );
  });

  it("les utilisateurs d'un autre centre sont invisibles", async () => {
    const rows = await withTenant(A.org.id, A.admin.id, (tx) => tx.select().from(s.users));
    expect(rows.every((u) => u.organizationId === A.org.id)).toBe(true);
  });

  it("l'organisation courante est la seule visible", async () => {
    const rows = await withTenant(A.org.id, null, (tx) => tx.select().from(s.organizations));
    expect(rows.map((o) => o.id)).toEqual([A.org.id]);
  });

  it("le contexte système (super admin) voit tous les centres", async () => {
    const rows = await withSystem((tx) => tx.select().from(s.organizations));
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Intégrité des journaux et des paiements (§11, §34)", () => {
  it("un paiement ne peut pas être supprimé par l'application", async () => {
    const [p] = await withTenant(A.org.id, null, (tx) => tx.insert(s.payments).values({ organizationId: A.org.id, enrollmentId: A.enrollment.id, amount: 1000, method: "cash", paidAt: "2026-01-05" }).returning());
    await expectPgError(withTenant(A.org.id, null, (tx) => tx.delete(s.payments).where(eq(s.payments.id, p.id))), "42501");
  });

  it("le montant d'un paiement est immuable ; l'annulation exige un motif", async () => {
    const [p] = await withTenant(A.org.id, null, (tx) => tx.insert(s.payments).values({ organizationId: A.org.id, enrollmentId: A.enrollment.id, amount: 2000, method: "cash", paidAt: "2026-01-05" }).returning());
    await expectPgError(withTenant(A.org.id, null, (tx) => tx.update(s.payments).set({ amount: 1 }).where(eq(s.payments.id, p.id))), "P0001");
    await expectPgError(withTenant(A.org.id, null, (tx) => tx.update(s.payments).set({ status: "cancelled" }).where(eq(s.payments.id, p.id))), "P0001");
    const [ok] = await withTenant(A.org.id, null, (tx) => tx.update(s.payments).set({ status: "cancelled", cancelReason: "Erreur de saisie" }).where(eq(s.payments.id, p.id)).returning());
    expect(ok.status).toBe("cancelled");
  });

  it("un montant de paiement négatif ou nul est refusé", async () => {
    await expectPgError(withTenant(A.org.id, null, (tx) => tx.insert(s.payments).values({ organizationId: A.org.id, enrollmentId: A.enrollment.id, amount: 0, method: "cash", paidAt: "2026-01-05" })), "23514");
  });

  it("le journal d'audit est en ajout seul", async () => {
    const [log] = await withTenant(A.org.id, null, (tx) => tx.insert(s.auditLogs).values({ organizationId: A.org.id, action: "test", entityType: "t", summary: "x" }).returning());
    await expectPgError(withTenant(A.org.id, null, (tx) => tx.update(s.auditLogs).set({ summary: "falsifié" }).where(eq(s.auditLogs.id, log.id))), "42501");
    await expectPgError(withTenant(A.org.id, null, (tx) => tx.delete(s.auditLogs).where(eq(s.auditLogs.id, log.id))), "42501");
  });
});
