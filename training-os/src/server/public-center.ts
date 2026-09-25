import "server-only";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { courseModules, courseSessions, courses, enrollments, organizations } from "@/db/schema";
import { withSystem, withTenant } from "@/db/tenant";

/** Données PUBLIQUES d'un centre (page vitrine) : uniquement les informations commerciales publiées. */
export async function publicCenter(slug: string) {
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return null;
  const org = await withSystem(async (tx) => {
    const [o] = await tx
      .select({
        id: organizations.id,
        slug: organizations.slug,
        name: organizations.name,
        description: organizations.description,
        city: organizations.city,
        country: organizations.country,
        address: organizations.address,
        phone: organizations.phone,
        email: organizations.email,
        website: organizations.website,
        currency: organizations.currency,
        timezone: organizations.timezone,
        hasLogo: sql<boolean>`${organizations.logoKey} is not null`,
      })
      .from(organizations)
      .where(and(eq(organizations.slug, slug), eq(organizations.publicPageEnabled, true), inArray(organizations.status, ["active", "onboarding"])))
      .limit(1);
    return o ?? null;
  });
  if (!org) return null;
  const data = await withTenant(org.id, null, async (tx) => {
    const cs = await tx.select().from(courses).where(and(eq(courses.organizationId, org.id), eq(courses.status, "published"), eq(courses.isPublic, true))).orderBy(asc(courses.name));
    const ids = cs.map((c) => c.id);
    const today = new Date().toISOString().slice(0, 10);
    const sessions = ids.length
      ? await tx
          .select({
            s: courseSessions,
            taken: sql<number>`(select count(*)::int from ${enrollments} e where e.session_id = ${courseSessions.id} and e.status in ('preregistered','registered','active'))`,
          })
          .from(courseSessions)
          .where(and(inArray(courseSessions.courseId, ids), inArray(courseSessions.status, ["open", "full"]), gte(courseSessions.endDate, today)))
          .orderBy(asc(courseSessions.startDate))
      : [];
    const mods = ids.length ? await tx.select().from(courseModules).where(inArray(courseModules.courseId, ids)).orderBy(asc(courseModules.position)) : [];
    return { courses: cs, sessions, mods };
  });
  return { org, ...data };
}
