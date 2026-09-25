/**
 * Synthèse par inscription : solde, présence, résultats, progression,
 * éligibilité au certificat et risque de décrochage.
 * Source unique utilisée par le dashboard, les fiches, les rapports et l'IA
 * (l'IA reçoit ces chiffres calculés côté serveur — elle ne calcule rien).
 */
import "server-only";
import { and, asc, eq, inArray, type SQL } from "drizzle-orm";
import {
  assessmentResults,
  assessments,
  attendance,
  certificates,
  courseModules,
  courseSessions,
  courses,
  enrollments,
  moduleProgress,
  payments,
  paymentSchedules,
  sessionMeetings,
  students,
} from "@/db/schema";
import type { Tx } from "@/db/tenant";
import { computeBalance, type Balance } from "@/lib/domain/finance";
import {
  attendanceStats,
  averagePercent,
  certificationEligibility,
  computeProgress,
  dropoutRisk,
  type AttendanceStats,
  type CertificationCheck,
  type ResultInput,
  type RiskLevel,
  type RiskSignal,
} from "@/lib/domain/pedagogy";
import { todayISO } from "@/lib/format";

export type EnrollmentSummary = {
  enrollmentId: string;
  status: (typeof enrollments.$inferSelect)["status"];
  enrolledAt: Date;
  student: { id: string; firstName: string; lastName: string; matricule: string; email: string | null; phone: string | null; lastActivityAt: Date | null };
  course: { id: string; name: string; durationHours: number };
  session: { id: string; name: string; startDate: string; endDate: string; status: string; instructorId: string | null };
  balance: Balance;
  attendance: AttendanceStats;
  averageGrade: number | null;
  results: (ResultInput & { title: string })[];
  modules: { id: string; title: string; position: number; percent: number }[];
  progress: { global: number; modules: number | null; assessments: number | null; attendance: number | null };
  certification: { eligible: boolean; ready: boolean; checks: CertificationCheck[]; certificateCode: string | null; certificateId: string | null };
  risk: { level: RiskLevel; score: number; signals: RiskSignal[] };
};

export type SummaryFilter = {
  enrollmentIds?: string[];
  studentId?: string;
  sessionIds?: string[];
  courseId?: string;
  statuses?: (typeof enrollments.$inferSelect)["status"][];
};

export async function loadEnrollmentSummaries(tx: Tx, orgId: string, filter: SummaryFilter = {}, timeZone = "Africa/Abidjan"): Promise<EnrollmentSummary[]> {
  const conds: SQL[] = [eq(enrollments.organizationId, orgId)];
  if (filter.enrollmentIds) {
    if (filter.enrollmentIds.length === 0) return [];
    conds.push(inArray(enrollments.id, filter.enrollmentIds));
  }
  if (filter.studentId) conds.push(eq(enrollments.studentId, filter.studentId));
  if (filter.sessionIds) {
    if (filter.sessionIds.length === 0) return [];
    conds.push(inArray(enrollments.sessionId, filter.sessionIds));
  }
  if (filter.courseId) conds.push(eq(enrollments.courseId, filter.courseId));
  if (filter.statuses?.length) conds.push(inArray(enrollments.status, filter.statuses));

  const rows = await tx
    .select({ e: enrollments, s: students, c: courses, cs: courseSessions })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .innerJoin(courseSessions, eq(courseSessions.id, enrollments.sessionId))
    .where(and(...conds))
    .orderBy(asc(students.lastName), asc(students.firstName));
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.e.id);
  const courseIds = [...new Set(rows.map((r) => r.c.id))];

  // Requêtes séquentielles : une transaction = une connexion (pas de requêtes concurrentes)
  const pays = await tx.select({ enrollmentId: payments.enrollmentId, amount: payments.amount, status: payments.status }).from(payments).where(inArray(payments.enrollmentId, ids));
  const scheds = await tx.select().from(paymentSchedules).where(inArray(paymentSchedules.enrollmentId, ids));
  const att = await tx
      .select({ enrollmentId: attendance.enrollmentId, status: attendance.status, date: sessionMeetings.date, startTime: sessionMeetings.startTime })
      .from(attendance)
      .innerJoin(sessionMeetings, eq(sessionMeetings.id, attendance.meetingId))
      .where(inArray(attendance.enrollmentId, ids))
      .orderBy(asc(sessionMeetings.date), asc(sessionMeetings.startTime));
  const res = await tx
      .select({
        enrollmentId: assessmentResults.enrollmentId,
        score: assessmentResults.score,
        passed: assessmentResults.passed,
        maxScore: assessments.maxScore,
        isFinalExam: assessments.isFinalExam,
        date: assessments.date,
        title: assessments.title,
        gradedAt: assessmentResults.gradedAt,
      })
      .from(assessmentResults)
      .innerJoin(assessments, eq(assessments.id, assessmentResults.assessmentId))
      .where(inArray(assessmentResults.enrollmentId, ids));
  const prog = await tx.select().from(moduleProgress).where(inArray(moduleProgress.enrollmentId, ids));
  const mods = await tx.select().from(courseModules).where(inArray(courseModules.courseId, courseIds)).orderBy(asc(courseModules.position));
  const certs = await tx.select({ id: certificates.id, enrollmentId: certificates.enrollmentId, code: certificates.code, status: certificates.status }).from(certificates).where(inArray(certificates.enrollmentId, ids));


  // Évaluations passées non réalisées (pour le risque)
  const pastAssessments = await tx
    .select({ id: assessments.id, courseId: assessments.courseId, sessionId: assessments.sessionId, date: assessments.date })
    .from(assessments)
    .where(and(eq(assessments.organizationId, orgId), inArray(assessments.courseId, courseIds), eq(assessments.isPublished, true)));

  const group = <T extends { enrollmentId: string }>(list: T[]) => {
    const m = new Map<string, T[]>();
    for (const x of list) (m.get(x.enrollmentId) ?? m.set(x.enrollmentId, []).get(x.enrollmentId)!).push(x);
    return m;
  };
  const gp = group(pays), gs = group(scheds), ga = group(att), gr = group(res), gprog = group(prog);
  const certByEnr = new Map(certs.filter((c) => c.status === "issued").map((c) => [c.enrollmentId, c]));
  const modsByCourse = new Map<string, typeof mods>();
  for (const m of mods) (modsByCourse.get(m.courseId) ?? modsByCourse.set(m.courseId, []).get(m.courseId)!).push(m);

  const today = todayISO(timeZone);
  const now = Date.now();

  return rows.map(({ e, s, c, cs }) => {
    const balance = computeBalance({
      agreedPrice: e.agreedPrice,
      discount: e.discount,
      payments: gp.get(e.id) ?? [],
      schedules: (gs.get(e.id) ?? []).map((x) => ({ id: x.id, position: x.position, label: x.label, dueDate: x.dueDate, amount: x.amount })),
      today,
      cancelled: e.status === "cancelled",
    });
    const att = attendanceStats(ga.get(e.id) ?? []);
    const results = (gr.get(e.id) ?? [])
      .map((r) => ({ score: Number(r.score), maxScore: Number(r.maxScore), passed: r.passed, isFinalExam: r.isFinalExam, date: r.date, title: r.title, gradedAt: r.gradedAt }))
      .sort((a, b) => (a.date ?? a.gradedAt.toISOString()).localeCompare(b.date ?? b.gradedAt.toISOString()));
    const courseMods = modsByCourse.get(c.id) ?? [];
    const progByModule = new Map((gprog.get(e.id) ?? []).map((p) => [p.moduleId, p.percent]));
    const modules = courseMods.map((m) => ({ id: m.id, title: m.title, position: m.position, percent: progByModule.get(m.id) ?? 0 }));
    const progress = computeProgress({
      attendanceRate: att.rate,
      modulePercents: modules.map((m) => m.percent),
      results,
      weights: { attendance: c.weightAttendance, modules: c.weightModules, assessments: c.weightAssessments },
    });
    const avg = averagePercent(results);
    const finals = results.filter((r) => r.isFinalExam);
    const cert = certificationEligibility({
      rules: {
        minAttendance: c.certMinAttendance,
        minGrade: c.certMinGrade,
        requireAllModules: c.certRequireAllModules,
        requireFinalExam: c.certRequireFinalExam,
        requireFullPayment: c.certRequireFullPayment,
      },
      attendanceRate: att.rate,
      averageGrade: avg,
      modulePercents: modules.map((m) => m.percent),
      finalExamPassed: finals.length ? finals.some((f) => f.passed) : null,
      remainingBalance: balance.remaining,
    });
    const doneAssessmentCount = results.length;
    const dueAssessments = pastAssessments.filter(
      (a) => a.courseId === c.id && (!a.sessionId || a.sessionId === cs.id) && a.date && a.date < today,
    ).length;
    const risk =
      e.status === "active" || e.status === "registered"
        ? dropoutRisk({
            attendance: att,
            results,
            daysSinceLastActivity: s.lastActivityAt ? Math.floor((now - new Date(s.lastActivityAt).getTime()) / 86_400_000) : null,
            missedAssessments: Math.max(0, dueAssessments - doneAssessmentCount),
            overdueAmount: balance.overdueAmount,
          })
        : { level: "none" as const, score: 0, signals: [] };
    const issued = certByEnr.get(e.id);
    return {
      enrollmentId: e.id,
      status: e.status,
      enrolledAt: e.enrolledAt,
      student: { id: s.id, firstName: s.firstName, lastName: s.lastName, matricule: s.matricule, email: s.email, phone: s.phone, lastActivityAt: s.lastActivityAt },
      course: { id: c.id, name: c.name, durationHours: c.durationHours },
      session: { id: cs.id, name: cs.name, startDate: cs.startDate, endDate: cs.endDate, status: cs.status, instructorId: cs.instructorId ?? c.instructorId },
      balance,
      attendance: att,
      averageGrade: avg,
      results,
      modules,
      progress,
      certification: {
        eligible: cert.eligible,
        // prêt à délivrer : conditions remplies ET formation terminée (session finie ou inscription clôturée)
        ready: cert.eligible && !issued && (e.status === "completed" || cs.endDate <= today),
        checks: cert.checks, certificateCode: issued?.code ?? null, certificateId: issued?.id ?? null },
      risk,
    };
  });
}

/** Sessions visibles par un formateur : celles qui lui sont attribuées ou dont il porte la formation. */
export async function instructorSessionIds(tx: Tx, instructorId: string | null): Promise<string[]> {
  if (!instructorId) return [];
  const rows = await tx
    .select({ id: courseSessions.id, sInstr: courseSessions.instructorId, cInstr: courses.instructorId })
    .from(courseSessions)
    .innerJoin(courses, eq(courses.id, courseSessions.courseId));
  return rows.filter((r) => r.sInstr === instructorId || (!r.sInstr && r.cInstr === instructorId)).map((r) => r.id);
}
