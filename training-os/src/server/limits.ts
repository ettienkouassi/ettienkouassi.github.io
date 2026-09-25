import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { courses, instructors, plans, students, subscriptions, users } from "@/db/schema";
import type { Tx } from "@/db/tenant";
import { UserError } from "@/lib/errors";

type Resource = "students" | "instructors" | "courses" | "admins";

/** Applique les limites du plan d'abonnement (§5.3). Aucun plan = pas de limite (ex. pilote). */
export async function assertPlanLimit(tx: Tx, orgId: string, resource: Resource, adding = 1) {
  const [sub] = await tx
    .select({ p: plans })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(subscriptions.organizationId, orgId), sql`${subscriptions.status} in ('active','trialing')`))
    .orderBy(desc(subscriptions.currentPeriodEnd))
    .limit(1);
  if (!sub) return;
  const limit = { students: sub.p.maxStudents, instructors: sub.p.maxInstructors, courses: sub.p.maxCourses, admins: sub.p.maxAdmins }[resource];
  if (limit === null || limit === undefined) return;
  let current = 0;
  if (resource === "students") current = (await tx.select({ n: sql<number>`count(*)::int` }).from(students).where(and(eq(students.organizationId, orgId), eq(students.isActive, true))))[0].n;
  if (resource === "instructors") current = (await tx.select({ n: sql<number>`count(*)::int` }).from(instructors).where(and(eq(instructors.organizationId, orgId), eq(instructors.isActive, true))))[0].n;
  if (resource === "courses") current = (await tx.select({ n: sql<number>`count(*)::int` }).from(courses).where(and(eq(courses.organizationId, orgId), sql`${courses.status} <> 'archived'`)))[0].n;
  if (resource === "admins")
    current = (await tx.select({ n: sql<number>`count(*)::int` }).from(users).where(and(eq(users.organizationId, orgId), sql`${users.role} in ('org_admin','manager')`, eq(users.isActive, true))))[0].n;
  if (current + adding > limit) {
    const labels = { students: "étudiants", instructors: "formateurs", courses: "formations", admins: "administrateurs" };
    throw new UserError(`Limite de votre abonnement « ${sub.p.name} » atteinte : ${limit} ${labels[resource]} maximum. Passez à un plan supérieur.`);
  }
}
