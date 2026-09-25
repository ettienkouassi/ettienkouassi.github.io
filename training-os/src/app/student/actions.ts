"use server";

import { and, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { assessmentResults, assessments, enrollments, students } from "@/db/schema";
import { toActionError, UserError, zId, type ActionState } from "@/lib/actions";
import { requireOrg } from "@/lib/auth/context";

/** Soumission d'un quiz en ligne : correction automatique côté serveur (les réponses ne sont jamais envoyées au navigateur). */
export async function submitQuizAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const ctx = await requireOrg(["student"]);
    if (!ctx.studentId) throw new UserError("Profil étudiant introuvable.");
    id = zId.parse(fd.get("assessmentId"));
    await ctx.db(async (tx) => {
      const [a] = await tx.select().from(assessments).where(and(eq(assessments.id, id), eq(assessments.isPublished, true))).limit(1);
      if (!a?.questions?.length) throw new UserError("Quiz introuvable.");
      const [e] = await tx
        .select()
        .from(enrollments)
        .where(
          and(
            eq(enrollments.studentId, ctx.studentId!),
            eq(enrollments.courseId, a.courseId),
            inArray(enrollments.status, ["registered", "active"]),
            a.sessionId ? eq(enrollments.sessionId, a.sessionId) : undefined,
          ),
        )
        .limit(1);
      if (!e) throw new UserError("Ce quiz ne fait pas partie de vos formations en cours.");
      const [done] = await tx.select({ id: assessmentResults.id }).from(assessmentResults).where(and(eq(assessmentResults.assessmentId, a.id), eq(assessmentResults.enrollmentId, e.id))).limit(1);
      if (done) throw new UserError("Vous avez déjà répondu à ce quiz.");
      const answers = a.questions.map((q) => {
        const v = fd.get(`q_${q.id}`);
        const n = typeof v === "string" ? Number(v) : -1;
        return Number.isInteger(n) && n >= 0 && n < q.options.length ? n : -1;
      });
      const totalPts = a.questions.reduce((s, q) => s + (q.points ?? 1), 0);
      const got = a.questions.reduce((s, q, i) => s + (answers[i] === q.answer ? (q.points ?? 1) : 0), 0);
      const score = Math.round((got / totalPts) * a.maxScore * 100) / 100;
      await tx.insert(assessmentResults).values({ organizationId: ctx.orgId, assessmentId: a.id, enrollmentId: e.id, score, passed: score >= a.passScore, answers, feedback: `Correction automatique : ${got}/${totalPts} bonne(s) réponse(s).` });
      await tx.update(students).set({ lastActivityAt: new Date() }).where(eq(students.id, ctx.studentId!));
    });
  } catch (e) {
    return toActionError(e);
  }
  redirect(`/student/exercises/${id}`);
}
