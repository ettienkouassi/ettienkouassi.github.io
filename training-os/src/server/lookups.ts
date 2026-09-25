import "server-only";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { courseSessions, courses, instructors } from "@/db/schema";
import type { Tx } from "@/db/tenant";

export async function instructorOptions(tx: Tx, orgId: string) {
  const r = await tx.select().from(instructors).where(and(eq(instructors.organizationId, orgId), eq(instructors.isActive, true))).orderBy(asc(instructors.lastName));
  return r.map((i) => ({ id: i.id, name: `${i.firstName} ${i.lastName}${i.specialty ? ` — ${i.specialty}` : ""}` }));
}

export async function courseOptions(tx: Tx, orgId: string, includeDraft = true) {
  return tx
    .select({ id: courses.id, name: courses.name, price: courses.price })
    .from(courses)
    .where(and(eq(courses.organizationId, orgId), includeDraft ? ne(courses.status, "archived") : eq(courses.status, "published")))
    .orderBy(asc(courses.name));
}

export async function sessionOptions(tx: Tx, orgId: string, opts: { courseId?: string; ids?: string[]; active?: boolean } = {}) {
  const conds = [eq(courseSessions.organizationId, orgId)];
  if (opts.courseId) conds.push(eq(courseSessions.courseId, opts.courseId));
  if (opts.ids) conds.push(inArray(courseSessions.id, opts.ids.length ? opts.ids : ["00000000-0000-0000-0000-000000000000"]));
  if (opts.active) conds.push(inArray(courseSessions.status, ["open", "full", "in_progress", "draft"]));
  return tx
    .select({ id: courseSessions.id, name: courseSessions.name, courseId: courseSessions.courseId, courseName: courses.name, startDate: courseSessions.startDate, status: courseSessions.status, price: courses.price })
    .from(courseSessions)
    .innerJoin(courses, eq(courses.id, courseSessions.courseId))
    .where(and(...conds))
    .orderBy(desc(courseSessions.startDate));
}
