import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { students } from "@/db/schema";
import { requirePageOrg } from "@/lib/auth/context";
import { orgInfo } from "@/server/metrics";
import { loadEnrollmentSummaries } from "@/server/summaries";

/** Contexte étudiant : uniquement SES données (filtre studentId + RLS du centre). */
export async function studentScope() {
  const ctx = await requirePageOrg(["student"]);
  if (!ctx.studentId) redirect("/login");
  const studentId = ctx.studentId;
  const data = await ctx.db(async (tx) => {
    const org = await orgInfo(tx, ctx.orgId);
    const [me] = await tx.select().from(students).where(eq(students.id, studentId)).limit(1);
    // Activité (utilisée par l'indicateur de décrochage « absence de connexion »)
    await tx.update(students).set({ lastActivityAt: new Date() }).where(eq(students.id, studentId));
    const sums = (await loadEnrollmentSummaries(tx, ctx.orgId, { studentId }, org.timezone)).filter((s) => !["cancelled", "prospect"].includes(s.status));
    return { org, me, sums };
  });
  return { ctx, studentId, ...data };
}
