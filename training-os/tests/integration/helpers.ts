import * as s from "@/db/schema";
import { withSystem, withTenant } from "@/db/tenant";
import type { OrgContext } from "@/lib/auth/context";
import type { Role } from "@/lib/auth/rbac";

let n = 0;
const uid = () => `${Date.now().toString(36)}${(n++).toString(36)}`;

/** Crée un centre complet minimal : formation (2 modules), session (2 séances), étudiant inscrit. */
export async function makeCenter(name = "Centre") {
  const tag = uid();
  const org = await withSystem(async (tx) => (await tx.insert(s.organizations).values({ slug: `c-${tag}`, name: `${name} ${tag}`, status: "active", publicPageEnabled: true }).returning())[0]);
  return withTenant(org.id, null, async (tx) => {
    const [admin] = await tx.insert(s.users).values({ organizationId: org.id, email: `admin-${tag}@t.test`, firstName: "Ad", lastName: "Min", role: "org_admin" }).returning();
    const [studentUser] = await tx.insert(s.users).values({ organizationId: org.id, email: `stu-${tag}@t.test`, firstName: "Jean", lastName: "Kouadio", role: "student" }).returning();
    const [course] = await tx.insert(s.courses).values({ organizationId: org.id, name: "Excel", slug: `excel-${tag}`, price: 100_000, durationHours: 20, status: "published", isPublic: true }).returning();
    const mods = await tx.insert(s.courseModules).values([1, 2].map((p) => ({ organizationId: org.id, courseId: course.id, position: p, title: `Module ${p}` }))).returning();
    const [session] = await tx.insert(s.courseSessions).values({ organizationId: org.id, courseId: course.id, name: "Session test", startDate: "2026-01-05", endDate: "2026-01-20", capacity: 10, status: "in_progress" }).returning();
    const meetings = await tx.insert(s.sessionMeetings).values([{ organizationId: org.id, sessionId: session.id, date: "2026-01-06" }, { organizationId: org.id, sessionId: session.id, date: "2026-01-08" }]).returning();
    const [student] = await tx.insert(s.students).values({ organizationId: org.id, userId: studentUser.id, matricule: `M-${tag}`, firstName: "Jean", lastName: "Kouadio", email: studentUser.email }).returning();
    const [other] = await tx.insert(s.students).values({ organizationId: org.id, matricule: `M2-${tag}`, firstName: "Awa", lastName: "Koné" }).returning();
    const [enrollment] = await tx.insert(s.enrollments).values({ organizationId: org.id, studentId: student.id, sessionId: session.id, courseId: course.id, agreedPrice: 100_000, status: "active" }).returning();
    const [otherEnrollment] = await tx.insert(s.enrollments).values({ organizationId: org.id, studentId: other.id, sessionId: session.id, courseId: course.id, agreedPrice: 100_000, status: "active" }).returning();
    return { org, admin, studentUser, course, mods, session, meetings, student, other, enrollment, otherEnrollment };
  });
}

export function ctxFor(center: Awaited<ReturnType<typeof makeCenter>>, role: Role, extra: Partial<OrgContext> = {}): OrgContext {
  const user = role === "student" ? center.studentUser : center.admin;
  return {
    user: { id: user.id, sessionId: "test", email: user.email, firstName: user.firstName, lastName: user.lastName, role, organizationId: center.org.id, organizationName: center.org.name, organizationStatus: "active", mustChangePassword: false },
    orgId: center.org.id,
    role,
    instructorId: null,
    studentId: role === "student" ? center.student.id : null,
    db: (fn) => withTenant(center.org.id, user.id, fn),
    ...extra,
  };
}

