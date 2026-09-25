/**
 * Indicateurs du centre (dashboard, rapports, assistant IA).
 * Tous les calculs sont faits ici, côté serveur, à partir de la base.
 */
import "server-only";
import { and, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  certificates,
  courseSessions,
  courses,
  enrollments,
  organizations,
  payments,
  paymentSchedules,
  prospects,
  sessionMeetings,
  students,
  tasks,
} from "@/db/schema";
import type { Tx } from "@/db/tenant";
import { addDaysISO, todayISO } from "@/lib/format";
import { loadEnrollmentSummaries, type EnrollmentSummary } from "./summaries";

export async function orgInfo(tx: Tx, orgId: string) {
  const [o] = await tx.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  return o;
}

export type Period = "today" | "week" | "month" | "year" | "all";

export function periodRange(period: Period, tz: string, from?: string, to?: string): { from: string; to: string } {
  const today = todayISO(tz);
  if (from && to) return { from, to };
  switch (period) {
    case "today":
      return { from: today, to: today };
    case "week": {
      const d = new Date(`${today}T00:00:00Z`);
      const dow = (d.getUTCDay() + 6) % 7; // lundi = 0
      return { from: addDaysISO(today, -dow), to: today };
    }
    case "month":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "year":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    default:
      return { from: "2000-01-01", to: today };
  }
}

const ACTIVE_STATUSES = ["registered", "active"] as const;

export async function centerOverview(tx: Tx, orgId: string, tz: string) {
  const today = todayISO(tz);
  const month = periodRange("month", tz);
  const [activeStudents] = await tx
    .select({ n: sql<number>`count(distinct ${enrollments.studentId})::int` })
    .from(enrollments)
    .where(and(eq(enrollments.organizationId, orgId), inArray(enrollments.status, [...ACTIVE_STATUSES])));
  const [totalStudents] = await tx.select({ n: count() }).from(students).where(and(eq(students.organizationId, orgId), eq(students.isActive, true)));
  const [newEnrollments] = await tx
    .select({ n: count() })
    .from(enrollments)
    .where(and(eq(enrollments.organizationId, orgId), gte(enrollments.enrolledAt, new Date(`${month.from}T00:00:00Z`))));
  const [activeCourses] = await tx.select({ n: count() }).from(courses).where(and(eq(courses.organizationId, orgId), eq(courses.status, "published")));
  const [runningSessions] = await tx
    .select({ n: count() })
    .from(courseSessions)
    .where(and(eq(courseSessions.organizationId, orgId), lte(courseSessions.startDate, today), gte(courseSessions.endDate, today), sql`${courseSessions.status} not in ('cancelled','draft')`));
  const [collectedMonth] = await tx
    .select({ n: sql<number>`coalesce(sum(${payments.amount}),0)::bigint` })
    .from(payments)
    .where(and(eq(payments.organizationId, orgId), eq(payments.status, "recorded"), gte(payments.paidAt, month.from), lte(payments.paidAt, month.to)));
  const [certsIssued] = await tx.select({ n: count() }).from(certificates).where(and(eq(certificates.organizationId, orgId), eq(certificates.status, "issued")));
  const [completed] = await tx.select({ n: count() }).from(enrollments).where(and(eq(enrollments.organizationId, orgId), eq(enrollments.status, "completed")));

  const summaries = await loadEnrollmentSummaries(tx, orgId, { statuses: ["registered", "active", "completed"] }, tz);
  const open = summaries.filter((s) => s.status !== "completed");
  const outstanding = summaries.reduce((a, s) => a + s.balance.remaining, 0);
  const overdue = summaries.reduce((a, s) => a + s.balance.overdueAmount, 0);
  const rates = open.map((s) => s.attendance.rate).filter((r): r is number => r !== null);
  const attendanceRate = rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10 : null;
  const eligibleNoCert = summaries.filter((s) => s.certification.ready).length;
  const atRisk = open.filter((s) => s.risk.level === "high" || s.risk.level === "medium").length;

  return {
    date: today,
    etudiants_actifs: Number(activeStudents.n),
    etudiants_total: Number(totalStudents.n),
    nouvelles_inscriptions_ce_mois: Number(newEnrollments.n),
    formations_actives: Number(activeCourses.n),
    sessions_en_cours: Number(runningSessions.n),
    encaisse_ce_mois: Number(collectedMonth.n),
    restant_a_encaisser: outstanding,
    montant_en_retard: overdue,
    taux_presence_moyen: attendanceRate,
    formations_terminees: Number(completed.n),
    certificats_delivres: Number(certsIssued.n),
    certificats_a_generer: eligibleNoCert,
    etudiants_a_suivre: atRisk,
    _summaries: summaries,
  };
}

export async function revenue(tx: Tx, orgId: string, range: { from: string; to: string }, groupBy: "course" | "session" | "method" | "month" | "day" = "course") {
  const base = and(eq(payments.organizationId, orgId), eq(payments.status, "recorded"), gte(payments.paidAt, range.from), lte(payments.paidAt, range.to));
  const [total] = await tx.select({ n: sql<number>`coalesce(sum(${payments.amount}),0)::bigint`, c: count() }).from(payments).where(base);
  let groups: { label: string; amount: number; count: number }[] = [];
  if (groupBy === "course" || groupBy === "session") {
    const col = groupBy === "course" ? courses.name : courseSessions.name;
    const rows = await tx
      .select({ label: col, amount: sql<number>`sum(${payments.amount})::bigint`, c: count() })
      .from(payments)
      .innerJoin(enrollments, eq(enrollments.id, payments.enrollmentId))
      .innerJoin(courses, eq(courses.id, enrollments.courseId))
      .innerJoin(courseSessions, eq(courseSessions.id, enrollments.sessionId))
      .where(base)
      .groupBy(col)
      .orderBy(desc(sql`sum(${payments.amount})`));
    groups = rows.map((r) => ({ label: r.label, amount: Number(r.amount), count: Number(r.c) }));
  } else if (groupBy === "method") {
    const rows = await tx.select({ label: payments.method, amount: sql<number>`sum(${payments.amount})::bigint`, c: count() }).from(payments).where(base).groupBy(payments.method);
    groups = rows.map((r) => ({ label: r.label, amount: Number(r.amount), count: Number(r.c) }));
  } else {
    // format en littéral (liste blanche) : un paramètre différent dans GROUP BY serait rejeté par PostgreSQL
    const expr = groupBy === "month" ? sql<string>`to_char(${payments.paidAt}, 'YYYY-MM')` : sql<string>`to_char(${payments.paidAt}, 'YYYY-MM-DD')`;
    const rows = await tx.select({ label: expr, amount: sql<number>`sum(${payments.amount})::bigint`, c: count() }).from(payments).where(base).groupBy(expr).orderBy(expr);
    groups = rows.map((r) => ({ label: r.label, amount: Number(r.amount), count: Number(r.c) }));
  }
  return { periode: range, total_encaisse: Number(total.n), nombre_paiements: Number(total.c), details: groups };
}

/** Chiffre d'affaires facturé (inscriptions) vs encaissé, par formation. */
export async function revenueByCourse(tx: Tx, orgId: string, summaries: EnrollmentSummary[]) {
  const m = new Map<string, { formation: string; inscriptions: number; facture: number; encaisse: number; reste: number }>();
  for (const s of summaries) {
    const r = m.get(s.course.id) ?? { formation: s.course.name, inscriptions: 0, facture: 0, encaisse: 0, reste: 0 };
    r.inscriptions++;
    r.facture += s.balance.total;
    r.encaisse += s.balance.paid;
    r.reste += s.balance.remaining;
    m.set(s.course.id, r);
  }
  return [...m.values()].sort((a, b) => b.facture - a.facture);
}

export function courseStats(summaries: EnrollmentSummary[]) {
  const m = new Map<string, { formation: string; inscrits: number; actifs: number; termines: number; abandons: number; progression_moyenne: number; taux_reussite: number | null; _prog: number[]; _pass: boolean[] }>();
  for (const s of summaries) {
    const r = m.get(s.course.id) ?? { formation: s.course.name, inscrits: 0, actifs: 0, termines: 0, abandons: 0, progression_moyenne: 0, taux_reussite: null, _prog: [], _pass: [] };
    r.inscrits++;
    if (s.status === "active" || s.status === "registered") r.actifs++;
    if (s.status === "completed") r.termines++;
    if (s.status === "dropped") r.abandons++;
    r._prog.push(s.progress.global);
    if (s.averageGrade !== null) r._pass.push(s.certification.eligible);
    m.set(s.course.id, r);
  }
  return [...m.values()]
    .map(({ _prog, _pass, ...r }) => ({
      ...r,
      progression_moyenne: _prog.length ? Math.round(_prog.reduce((a, b) => a + b, 0) / _prog.length) : 0,
      taux_reussite: _pass.length ? Math.round((_pass.filter(Boolean).length / _pass.length) * 100) : null,
    }))
    .sort((a, b) => b.inscrits - a.inscrits);
}

/** « Qu'est-ce que je dois faire aujourd'hui ? » (§71) */
export async function todayActions(tx: Tx, orgId: string, tz: string, summaries?: EnrollmentSummary[]) {
  const today = todayISO(tz);
  const sums = summaries ?? (await loadEnrollmentSummaries(tx, orgId, { statuses: ["registered", "active", "completed"] }, tz));
  const dueSoon = await tx
    .select({ enrollmentId: paymentSchedules.enrollmentId, dueDate: paymentSchedules.dueDate })
    .from(paymentSchedules)
    .where(and(eq(paymentSchedules.organizationId, orgId), gte(paymentSchedules.dueDate, today), lte(paymentSchedules.dueDate, addDaysISO(today, 3))));
  const dueIds = new Set(dueSoon.map((d) => d.enrollmentId));
  const meetingsToday = await tx
    .select({ session: courseSessions.name, start: sessionMeetings.startTime, topic: sessionMeetings.topic })
    .from(sessionMeetings)
    .innerJoin(courseSessions, eq(courseSessions.id, sessionMeetings.sessionId))
    .where(and(eq(sessionMeetings.organizationId, orgId), eq(sessionMeetings.date, today)));
  const openTasks = await tx
    .select({ id: tasks.id, title: tasks.title, dueDate: tasks.dueDate, studentId: tasks.studentId })
    .from(tasks)
    .where(and(eq(tasks.organizationId, orgId), eq(tasks.status, "open")))
    .orderBy(tasks.dueDate)
    .limit(20);
  const prospectsToCall = await tx
    .select({ nom: sql<string>`${prospects.firstName} || ' ' || ${prospects.lastName}`, action: prospects.nextAction, date: prospects.nextActionAt })
    .from(prospects)
    .where(and(eq(prospects.organizationId, orgId), lte(prospects.nextActionAt, today), sql`${prospects.status} not in ('client','lost','enrolled')`))
    .limit(20);
  const sessionsAlmostFull = await tx
    .select({ name: courseSessions.name, capacity: courseSessions.capacity, n: sql<number>`count(${enrollments.id})::int` })
    .from(courseSessions)
    .leftJoin(enrollments, and(eq(enrollments.sessionId, courseSessions.id), inArray(enrollments.status, ["registered", "active", "preregistered"])))
    .where(and(eq(courseSessions.organizationId, orgId), eq(courseSessions.status, "open")))
    .groupBy(courseSessions.id);

  const name = (s: EnrollmentSummary) => `${s.student.firstName} ${s.student.lastName}`;
  return {
    date: today,
    seances_du_jour: meetingsToday.map((m) => ({ session: m.session, heure: m.start?.slice(0, 5) ?? null, sujet: m.topic })),
    paiements_en_retard: sums.filter((s) => s.balance.overdueAmount > 0).map((s) => ({ etudiant: name(s), formation: s.course.name, en_retard: s.balance.overdueAmount, reste_total: s.balance.remaining })),
    echeances_dans_3_jours: sums.filter((s) => dueIds.has(s.enrollmentId) && s.balance.nextDue).map((s) => ({ etudiant: name(s), montant: s.balance.nextDue!.amount, date: s.balance.nextDue!.dueDate })),
    etudiants_a_suivre: sums
      .filter((s) => s.risk.level === "high" || s.risk.level === "medium")
      .map((s) => ({ etudiant: name(s), formation: s.course.name, niveau_alerte: s.risk.level, indicateurs: s.risk.signals.map((x) => x.label) })),
    certificats_a_generer: sums.filter((s) => s.certification.ready).map((s) => ({ etudiant: name(s), formation: s.course.name })),
    prospects_a_relancer: prospectsToCall,
    sessions_presque_completes: sessionsAlmostFull.filter((s) => s.n / s.capacity >= 0.9).map((s) => ({ session: s.name, inscrits: s.n, capacite: s.capacity })),
    taches_ouvertes: openTasks,
  };
}
