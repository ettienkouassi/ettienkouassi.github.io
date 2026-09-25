import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { courseRecommendations, courses, organizations } from "@/db/schema";
import type { Tx } from "@/db/tenant";
import type { EnrollmentSummary } from "./summaries";

/**
 * Recommandations de formation (§22, §55) : suite logique d'un parcours terminé.
 * Règles explicites configurées par le centre (pas de boîte noire) ;
 * désactivables dans les paramètres.
 */
export async function recommendationsFor(tx: Tx, orgId: string, summaries: EnrollmentSummary[]) {
  const [org] = await tx.select({ on: organizations.aiRecommendationsEnabled }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!org?.on) return [];
  const completed = summaries.filter((s) => s.status === "completed").map((s) => s.course.id);
  const taken = new Set(summaries.filter((s) => s.status !== "cancelled").map((s) => s.course.id));
  if (!completed.length) return [];
  const rows = await tx
    .select({ from: courseRecommendations.fromCourseId, reason: courseRecommendations.reason, course: courses })
    .from(courseRecommendations)
    .innerJoin(courses, eq(courses.id, courseRecommendations.toCourseId))
    .where(and(inArray(courseRecommendations.fromCourseId, completed), eq(courses.status, "published")));
  const seen = new Set<string>();
  return rows
    .filter((r) => !taken.has(r.course.id) && !seen.has(r.course.id) && seen.add(r.course.id))
    .map((r) => ({
      course: r.course,
      reason: r.reason ?? `Vous avez terminé ${summaries.find((s) => s.course.id === r.from)?.course.name} : cette formation constitue une suite logique de votre parcours.`,
    }));
}
