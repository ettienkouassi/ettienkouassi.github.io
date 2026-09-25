import "server-only";
import { inArray } from "drizzle-orm";
import { courseSessions } from "@/db/schema";
import { requirePageOrg } from "@/lib/auth/context";
import { instructorSessionIds } from "@/server/summaries";

/** Contexte formateur + périmètre (sessions et formations attribuées). */
export async function instructorScope() {
  const ctx = await requirePageOrg(["instructor"]);
  const { sessionIds, courseIds } = await ctx.db(async (tx) => {
    const sessionIds = await instructorSessionIds(tx, ctx.instructorId);
    const courseIds = sessionIds.length ? [...new Set((await tx.select({ c: courseSessions.courseId }).from(courseSessions).where(inArray(courseSessions.id, sessionIds))).map((r) => r.c))] : [];
    return { sessionIds, courseIds };
  });
  return { ctx, sessionIds, courseIds };
}
