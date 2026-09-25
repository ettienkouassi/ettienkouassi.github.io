"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assessmentResults, assessments, attendance, courseModules, courseSessions, enrollments, moduleProgress, organizations, sessionMeetings, students } from "@/db/schema";
import type { Tx } from "@/db/tenant";
import { parseForm, toActionError, UserError, zId, type ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requireOrg, STAFF_AND_INSTRUCTOR, type OrgContext } from "@/lib/auth/context";
import { deliverQueued, notify, queueEmail } from "@/server/communications";
import { instructorSessionIds } from "@/server/summaries";

/** Un formateur ne peut agir que sur SES sessions ; le personnel sur toutes celles du centre. */
async function assertSessionAccess(tx: Tx, ctx: OrgContext, sessionId: string) {
  const [s] = await tx.select().from(courseSessions).where(and(eq(courseSessions.id, sessionId), eq(courseSessions.organizationId, ctx.orgId))).limit(1);
  if (!s) throw new UserError("Session introuvable.");
  if (ctx.role === "instructor") {
    const allowed = await instructorSessionIds(tx, ctx.instructorId);
    if (!allowed.includes(sessionId)) throw new UserError("Cette session ne vous est pas attribuée.");
  }
  return s;
}

const STATUS = z.enum(["present", "absent", "late", "excused"]);

export async function saveAttendanceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF_AND_INSTRUCTOR, "attendance.write");
    const meetingId = zId.parse(fd.get("meetingId"));
    const entries: { enrollmentId: string; status: z.infer<typeof STATUS>; note?: string }[] = [];
    for (const [k, v] of fd.entries()) {
      const m = k.match(/^status_([0-9a-f-]{36})$/);
      if (m && typeof v === "string" && v) {
        const note = fd.get(`note_${m[1]}`);
        entries.push({ enrollmentId: m[1], status: STATUS.parse(v), note: typeof note === "string" && note.trim() ? note.trim().slice(0, 300) : undefined });
      }
    }
    if (entries.length === 0) return { error: "Aucune présence saisie." };
    const count = await ctx.db(async (tx) => {
      const [meeting] = await tx.select().from(sessionMeetings).where(eq(sessionMeetings.id, meetingId)).limit(1);
      if (!meeting) throw new UserError("Séance introuvable.");
      const session = await assertSessionAccess(tx, ctx, meeting.sessionId);
      // Uniquement les inscriptions de CETTE session
      const valid = new Set(
        (await tx.select({ id: enrollments.id }).from(enrollments).where(and(eq(enrollments.sessionId, session.id), inArray(enrollments.id, entries.map((e) => e.enrollmentId))))).map((r) => r.id),
      );
      let n = 0;
      for (const e of entries) {
        if (!valid.has(e.enrollmentId)) continue;
        await tx
          .insert(attendance)
          .values({ organizationId: ctx.orgId, meetingId, enrollmentId: e.enrollmentId, status: e.status, note: e.note ?? null, recordedBy: ctx.user.id })
          .onConflictDoUpdate({ target: [attendance.meetingId, attendance.enrollmentId], set: { status: e.status, note: e.note ?? null, recordedBy: ctx.user.id, recordedAt: new Date() } });
        n++;
      }
      const absents = entries.filter((e) => e.status === "absent" && valid.has(e.enrollmentId)).length;
      await audit(tx, ctx.user, ctx.orgId, {
        action: "attendance.record",
        entityType: "session",
        entityId: session.id,
        summary: `${ctx.user.firstName} ${ctx.user.lastName} a enregistré les présences du ${meeting.date} (${session.name}) : ${n} étudiant(s), ${absents} absence(s)`,
      });
      return n;
    });
    revalidatePath("/app/attendance");
    revalidatePath("/instructor/attendance");
    return { ok: true, message: `Présences enregistrées pour ${count} étudiant(s).` };
  } catch (e) {
    return toActionError(e);
  }
}

const quizQuestion = z.object({ question: z.string().min(1).max(500), options: z.array(z.string().min(1).max(200)).min(2).max(6), answer: z.number().int().min(0) });

export async function saveAssessmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF_AND_INSTRUCTOR, "assessments.write");
    const { data, state } = parseForm(
      z
        .object({
          id: zId.optional(),
          sessionId: zId,
          moduleId: zId.optional(),
          type: z.enum(["quiz", "exercise", "assignment", "exam", "final_project"]),
          title: z.string().min(1, "Titre obligatoire").max(200),
          description: z.string().max(4000).optional(),
          durationMinutes: z.coerce.number().int().min(0).max(1000).optional(),
          maxScore: z.coerce.number().min(1).max(1000),
          passScore: z.coerce.number().min(0).max(1000),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          isFinalExam: z.enum(["on"]).optional(),
          questionsJson: z.string().max(100_000).optional(),
        })
        .refine((v) => v.passScore <= v.maxScore, { message: "Le seuil ne peut pas dépasser la note maximale", path: ["passScore"] }),
      fd,
    );
    if (!data) return state!;
    let questions: { id: string; question: string; options: string[]; answer: number }[] | null = null;
    if (data.questionsJson) {
      try {
        const parsed = z.array(quizQuestion).max(100).parse(JSON.parse(data.questionsJson));
        questions = parsed.filter((q) => q.answer < q.options.length).map((q, i) => ({ id: `q${i + 1}`, ...q }));
      } catch {
        return { error: "Questions du quiz invalides." };
      }
    }
    await ctx.db(async (tx) => {
      const session = await assertSessionAccess(tx, ctx, data.sessionId);
      if (data.moduleId) {
        const [m] = await tx.select().from(courseModules).where(and(eq(courseModules.id, data.moduleId), eq(courseModules.courseId, session.courseId))).limit(1);
        if (!m) throw new UserError("Module invalide.");
      }
      const values = {
        courseId: session.courseId,
        sessionId: session.id,
        moduleId: data.moduleId ?? null,
        type: data.type,
        title: data.title,
        description: data.description ?? null,
        durationMinutes: data.durationMinutes ?? null,
        maxScore: data.maxScore,
        passScore: data.passScore,
        date: data.date ?? null,
        isFinalExam: !!data.isFinalExam,
        questions: questions?.length ? questions : null,
      };
      if (data.id) {
        const [a] = await tx.update(assessments).set(values).where(and(eq(assessments.id, data.id), eq(assessments.sessionId, session.id))).returning();
        if (!a) throw new UserError("Évaluation introuvable.");
        await audit(tx, ctx.user, ctx.orgId, { action: "assessment.update", entityType: "assessment", entityId: a.id, summary: `${ctx.user.firstName} ${ctx.user.lastName} a modifié l'évaluation « ${a.title} »` });
      } else {
        const [a] = await tx.insert(assessments).values({ ...values, organizationId: ctx.orgId, createdBy: ctx.user.id }).returning();
        await audit(tx, ctx.user, ctx.orgId, { action: "assessment.create", entityType: "assessment", entityId: a.id, summary: `${ctx.user.firstName} ${ctx.user.lastName} a créé l'évaluation « ${a.title} » (${session.name})` });
      }
    });
    revalidatePath("/app/assessments");
    revalidatePath("/instructor/assessments");
    return { ok: true, message: "Évaluation enregistrée." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveGradesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF_AND_INSTRUCTOR, "assessments.write");
    const assessmentId = zId.parse(fd.get("assessmentId"));
    const res = await ctx.db(async (tx) => {
      const [a] = await tx.select().from(assessments).where(eq(assessments.id, assessmentId)).limit(1);
      if (!a || !a.sessionId) throw new UserError("Évaluation introuvable.");
      await assertSessionAccess(tx, ctx, a.sessionId);
      const [org] = await tx.select().from(organizations).where(eq(organizations.id, ctx.orgId)).limit(1);
      const enrs = await tx
        .select({ id: enrollments.id, st: students })
        .from(enrollments)
        .innerJoin(students, eq(students.id, enrollments.studentId))
        .where(eq(enrollments.sessionId, a.sessionId));
      const mails: (string | null)[] = [];
      let n = 0;
      for (const e of enrs) {
        const raw = fd.get(`score_${e.id}`);
        if (typeof raw !== "string" || raw.trim() === "") continue;
        const score = Number(raw.replace(",", "."));
        if (!Number.isFinite(score) || score < 0 || score > a.maxScore) throw new UserError(`Note invalide pour ${e.st.firstName} ${e.st.lastName} (0 à ${a.maxScore}).`);
        const fb = fd.get(`feedback_${e.id}`);
        const feedback = typeof fb === "string" && fb.trim() ? fb.trim().slice(0, 1000) : null;
        const [prev] = await tx.select().from(assessmentResults).where(and(eq(assessmentResults.assessmentId, a.id), eq(assessmentResults.enrollmentId, e.id))).limit(1);
        await tx
          .insert(assessmentResults)
          .values({ organizationId: ctx.orgId, assessmentId: a.id, enrollmentId: e.id, score, passed: score >= a.passScore, feedback, gradedBy: ctx.user.id })
          .onConflictDoUpdate({ target: [assessmentResults.assessmentId, assessmentResults.enrollmentId], set: { score, passed: score >= a.passScore, feedback, gradedBy: ctx.user.id, gradedAt: new Date() } });
        n++;
        if (!prev) {
          if (e.st.userId) await notify(tx, ctx.orgId, { userId: e.st.userId, level: "info", title: `Résultat disponible : ${a.title}`, link: "/student/results", dedupeKey: `result:${a.id}:${e.id}` });
          mails.push(await queueEmail(tx, ctx.orgId, { templateKey: "result", to: e.st.email, studentId: e.st.id, dedupeKey: `result:${a.id}:${e.id}`, vars: { prenom: e.st.firstName, evaluation: a.title, centre: org.name } }));
        } else if (Number(prev.score) !== score) {
          await audit(tx, ctx.user, ctx.orgId, {
            action: "grade.update",
            entityType: "assessment",
            entityId: a.id,
            summary: `${ctx.user.firstName} ${ctx.user.lastName} a modifié la note de ${e.st.firstName} ${e.st.lastName} (${a.title}) : ${prev.score} → ${score}`,
          });
        }
      }
      await audit(tx, ctx.user, ctx.orgId, { action: "grade.record", entityType: "assessment", entityId: a.id, summary: `${ctx.user.firstName} ${ctx.user.lastName} a saisi ${n} note(s) pour « ${a.title} »` });
      return { n, mails };
    });
    await deliverQueued(ctx.orgId, res.mails);
    revalidatePath("/app/assessments");
    revalidatePath("/instructor/assessments");
    return { ok: true, message: `${res.n} note(s) enregistrée(s).` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveProgressAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF_AND_INSTRUCTOR, "progress.write");
    const sessionId = zId.parse(fd.get("sessionId"));
    const n = await ctx.db(async (tx) => {
      const session = await assertSessionAccess(tx, ctx, sessionId);
      const enrIds = new Set((await tx.select({ id: enrollments.id }).from(enrollments).where(eq(enrollments.sessionId, session.id))).map((r) => r.id));
      const modIds = new Set((await tx.select({ id: courseModules.id }).from(courseModules).where(eq(courseModules.courseId, session.courseId))).map((r) => r.id));
      let count = 0;
      for (const [k, v] of fd.entries()) {
        const m = k.match(/^p_([0-9a-f-]{36})_([0-9a-f-]{36})$/);
        if (!m || typeof v !== "string" || v === "") continue;
        const [, enrId, modId] = m;
        if (!enrIds.has(enrId) || !modIds.has(modId)) continue;
        const pct = Math.max(0, Math.min(100, Math.round(Number(v))));
        if (!Number.isFinite(pct)) continue;
        await tx
          .insert(moduleProgress)
          .values({ organizationId: ctx.orgId, enrollmentId: enrId, moduleId: modId, percent: pct, completedAt: pct >= 100 ? new Date() : null, updatedBy: ctx.user.id })
          .onConflictDoUpdate({ target: [moduleProgress.enrollmentId, moduleProgress.moduleId], set: { percent: pct, completedAt: pct >= 100 ? new Date() : null, updatedBy: ctx.user.id } });
        count++;
      }
      await audit(tx, ctx.user, ctx.orgId, { action: "progress.update", entityType: "session", entityId: session.id, summary: `${ctx.user.firstName} ${ctx.user.lastName} a mis à jour la progression (${session.name})` });
      return count;
    });
    revalidatePath("/app/attendance");
    revalidatePath("/instructor/progress");
    return { ok: true, message: `Progression enregistrée (${n} valeur(s)).` };
  } catch (e) {
    return toActionError(e);
  }
}
