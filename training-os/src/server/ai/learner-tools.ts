import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { courseSessions, enrollments, sessionMeetings } from "@/db/schema";
import type { ToolDef } from "@/lib/ai/types";
import type { OrgContext } from "@/lib/auth/context";
import { todayISO } from "@/lib/format";
import { searchMaterials } from "../materials-search";
import { instructorSessionIds, loadEnrollmentSummaries } from "../summaries";

/**
 * Outils de l'assistant étudiant (§20, §21, §49) : l'IA ne reçoit QUE les
 * données de l'étudiant connecté (filtre sur ctx.studentId, en plus du RLS).
 */
export function studentTools(ctx: OrgContext, tz: string): ToolDef[] {
  const studentId = ctx.studentId;
  if (!studentId) return [];
  const myCourseIds = () =>
    ctx.db(async (tx) =>
      (
        await tx
          .selectDistinct({ c: enrollments.courseId })
          .from(enrollments)
          .where(and(eq(enrollments.studentId, studentId), inArray(enrollments.status, ["registered", "active", "completed"])))
      ).map((r) => r.c),
    );
  return [
    {
      name: "get_my_overview",
      description: "Situation de l'étudiant connecté : formations, progression par module, présence, notes, solde et prochaines séances.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run: async () =>
        ctx.db(async (tx) => {
          const sums = await loadEnrollmentSummaries(tx, ctx.orgId, { studentId }, tz);
          const sessionIds = sums.map((s) => s.session.id);
          const upcoming = sessionIds.length
            ? await tx
                .select({ date: sessionMeetings.date, heure: sessionMeetings.startTime, sujet: sessionMeetings.topic, session: courseSessions.name })
                .from(sessionMeetings)
                .innerJoin(courseSessions, eq(courseSessions.id, sessionMeetings.sessionId))
                .where(and(inArray(sessionMeetings.sessionId, sessionIds)))
            : [];
          const today = todayISO(tz);
          return {
            formations: sums.map((s) => ({
              formation: s.course.name,
              statut: s.status,
              progression_globale: s.progress.global,
              modules: s.modules.map((m) => ({ module: m.title, progression: m.percent })),
              taux_presence: s.attendance.rate,
              absences: s.attendance.absent,
              moyenne: s.averageGrade,
              notes: s.results.map((r) => ({ evaluation: r.title, note: `${r.score}/${r.maxScore}`, reussi: r.passed })),
              reste_a_payer: s.balance.remaining,
              prochaine_echeance: s.balance.nextDue,
              certificat: s.certification.certificateCode,
            })),
            prochaines_seances: upcoming.filter((u) => u.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5),
          };
        }),
    },
    {
      name: "search_course_materials",
      description: "Recherche dans les supports de cours de l'étudiant (PDF, Word…). À utiliser pour toute question « selon le cours ».",
      inputSchema: { type: "object", properties: { query: { type: "string", description: "Mots-clés de recherche" } }, required: ["query"], additionalProperties: false },
      run: async (i) => {
        const courseIds = await myCourseIds();
        const res = await ctx.db((tx) => searchMaterials(tx, { orgId: ctx.orgId, courseIds, visibilities: ["students"], query: String(i.query ?? "") }));
        return res.length ? res : { resultat: "Aucun passage correspondant dans les supports disponibles." };
      },
    },
  ];
}

/** Outils de l'assistant pédagogique du formateur — limités à SES sessions. */
export function instructorTools(ctx: OrgContext, tz: string): ToolDef[] {
  return [
    {
      name: "get_my_sessions_overview",
      description: "Sessions du formateur avec, pour chaque étudiant, progression, présence, moyenne et indicateurs de suivi.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run: async () =>
        ctx.db(async (tx) => {
          const ids = await instructorSessionIds(tx, ctx.instructorId);
          const sums = await loadEnrollmentSummaries(tx, ctx.orgId, { sessionIds: ids, statuses: ["registered", "active", "completed"] }, tz);
          return sums.map((s) => ({
            session: s.session.name,
            formation: s.course.name,
            etudiant: `${s.student.firstName} ${s.student.lastName}`,
            progression: s.progress.global,
            presence: s.attendance.rate,
            moyenne: s.averageGrade,
            alerte: s.risk.level === "none" ? null : s.risk.signals.map((x) => x.label),
          }));
        }),
    },
    {
      name: "search_course_materials",
      description: "Recherche dans les supports des formations du formateur.",
      inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false },
      run: async (i) =>
        ctx.db(async (tx) => {
          const ids = await instructorSessionIds(tx, ctx.instructorId);
          if (!ids.length) return [];
          const courseIds = [...new Set((await tx.select({ c: courseSessions.courseId }).from(courseSessions).where(inArray(courseSessions.id, ids))).map((r) => r.c))];
          return searchMaterials(tx, { orgId: ctx.orgId, courseIds, visibilities: ["students", "instructors"], query: String(i.query ?? "") });
        }),
    },
  ];
}
