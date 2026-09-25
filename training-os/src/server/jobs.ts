/**
 * Tâches planifiées (§28, §54) : relances de paiement, alertes d'absence,
 * sessions presque complètes, certificats à générer, émission automatique.
 * Idempotentes grâce aux clés de déduplication.
 */
import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { courseSessions, courses, enrollments, organizations, students, tasks, users } from "@/db/schema";
import { withSystem, withTenant } from "@/db/tenant";
import { formatDate, formatMoney, addDaysISO, todayISO } from "@/lib/format";
import { purgeRateLimits } from "@/lib/security/rate-limit";
import { purgeExpiredSessions } from "@/lib/auth/session";
import { issueCertificate } from "./certificates";
import { deliverQueued, notify, queueEmail } from "./communications";
import { loadEnrollmentSummaries } from "./summaries";

export async function runDailyJobs() {
  const orgs = await withSystem((tx) => tx.select().from(organizations).where(inArray(organizations.status, ["active", "onboarding"])));
  const report: Record<string, unknown> = {};
  for (const org of orgs) {
    try {
      report[org.slug] = await runOrgJobs(org);
      await deliverQueued(org.id);
    } catch (e) {
      console.error(`[jobs] ${org.slug}`, e);
      report[org.slug] = { error: (e as Error).message };
    }
  }
  await purgeRateLimits();
  await purgeExpiredSessions();
  return report;
}

async function runOrgJobs(org: typeof organizations.$inferSelect) {
  const tz = org.timezone;
  const today = todayISO(tz);
  const before = org.settings.reminderDaysBefore ?? 3;
  const after = org.settings.reminderDaysAfter ?? 3;
  const absenceThreshold = org.settings.absenceAlertThreshold ?? 2;
  const stats = { reminders: 0, absenceAlerts: 0, autoCertificates: 0 };

  await withTenant(org.id, null, async (tx) => {
    const sums = await loadEnrollmentSummaries(tx, org.id, { statuses: ["registered", "active", "completed"] }, tz);
    const contacts = new Map(
      (await tx.select({ id: students.id, email: students.email, first: students.firstName, userId: students.userId }).from(students).where(eq(students.organizationId, org.id))).map((s) => [s.id, s]),
    );

    for (const s of sums) {
      const c = contacts.get(s.student.id);
      // ---- Relances de paiement : J-before, J, J+after
      for (const inst of s.balance.installments) {
        if (inst.remaining <= 0) continue;
        let key: string | null = null;
        if (inst.dueDate === addDaysISO(today, before)) key = "payment_reminder_before";
        else if (inst.dueDate === today) key = "payment_due_today";
        else if (inst.dueDate === addDaysISO(today, -after)) key = "payment_overdue";
        if (!key) continue;
        const id = await queueEmail(tx, org.id, {
          templateKey: key,
          to: c?.email,
          studentId: s.student.id,
          dedupeKey: `${key}:${inst.id}:${inst.dueDate}`,
          vars: { prenom: s.student.firstName, formation: s.course.name, montant: formatMoney(inst.remaining), date_echeance: formatDate(inst.dueDate), centre: org.name },
        });
        if (id) stats.reminders++;
        if (c?.userId)
          await notify(tx, org.id, {
            userId: c.userId,
            level: key === "payment_overdue" ? "urgent" : "warning",
            title: key === "payment_overdue" ? "Paiement en retard" : "Échéance de paiement",
            body: `${formatMoney(inst.remaining)} — ${formatDate(inst.dueDate)}`,
            link: "/student/payments",
            dedupeKey: `${key}:${inst.id}`,
          });
      }
      // ---- Alerte d'absences consécutives → tâche de suivi (§12)
      if ((s.status === "active" || s.status === "registered") && s.attendance.consecutiveAbsences >= absenceThreshold) {
        const dk = `absence:${s.enrollmentId}:${s.attendance.absent}`;
        const inserted = await tx
          .insert(tasks)
          .values({
            organizationId: org.id,
            title: `Contacter ${s.student.firstName} ${s.student.lastName} (${s.attendance.consecutiveAbsences} absences consécutives)`,
            description: `Formation ${s.course.name} — session ${s.session.name}.`,
            studentId: s.student.id,
            enrollmentId: s.enrollmentId,
            dueDate: today,
            source: "attendance_alert",
            dedupeKey: dk,
          })
          .onConflictDoNothing()
          .returning({ id: tasks.id });
        if (inserted.length) {
          stats.absenceAlerts++;
          await notify(tx, org.id, {
            level: "warning",
            title: `${s.student.firstName} ${s.student.lastName} absent(e) ${s.attendance.consecutiveAbsences} séances consécutives`,
            link: `/app/students/${s.student.id}`,
            dedupeKey: dk,
          });
          await queueEmail(tx, org.id, { templateKey: "absence", to: c?.email, studentId: s.student.id, dedupeKey: dk, vars: { prenom: s.student.firstName, formation: s.course.name, centre: org.name } });
        }
      }
    }

    // ---- Certificats : émission automatique si configurée, sinon alerte
    const eligible = sums.filter((s) => s.certification.ready);
    const autoCourses = new Set(
      (await tx.select({ id: courses.id }).from(courses).where(and(eq(courses.organizationId, org.id), eq(courses.certAutoIssue, true)))).map((r) => r.id),
    );
    for (const s of eligible) {
      if (autoCourses.has(s.course.id)) {
        await issueCertificate(tx, org.id, null, s.enrollmentId);
        stats.autoCertificates++;
      }
    }
    const pending = eligible.filter((s) => !autoCourses.has(s.course.id)).length;
    if (pending > 0)
      await notify(tx, org.id, { level: "info", title: `${pending} certificat(s) à générer`, link: "/app/certificates", dedupeKey: `certs-pending:${today}` });

    // ---- Sessions presque complètes (≥ 90 %)
    const fill = await tx
      .select({ id: courseSessions.id, name: courseSessions.name, capacity: courseSessions.capacity, n: sql<number>`count(${enrollments.id})::int` })
      .from(courseSessions)
      .leftJoin(enrollments, and(eq(enrollments.sessionId, courseSessions.id), inArray(enrollments.status, ["preregistered", "registered", "active"])))
      .where(and(eq(courseSessions.organizationId, org.id), eq(courseSessions.status, "open")))
      .groupBy(courseSessions.id);
    for (const f of fill) {
      if (f.n / f.capacity >= 0.9)
        await notify(tx, org.id, {
          level: "info",
          title: `La session ${f.name} atteint ${Math.round((f.n / f.capacity) * 100)} % de sa capacité`,
          link: `/app/sessions/${f.id}`,
          dedupeKey: `session-fill:${f.id}:${f.n >= f.capacity ? "full" : "90"}`,
        });
    }

    // ---- Paiements arrivant à échéance demain (notification groupée)
    const tomorrow = addDaysISO(today, 1);
    const dueTomorrow = sums.filter((s) => s.balance.installments.some((i) => i.dueDate === tomorrow && i.remaining > 0)).length;
    if (dueTomorrow > 0)
      await notify(tx, org.id, { level: "warning", title: `${dueTomorrow} paiement(s) arrivent à échéance demain`, link: "/app/payments", dedupeKey: `due-tomorrow:${tomorrow}` });
  });
  return stats;
}

/** Nombre d'administrateurs actifs d'un centre (pour les limites de plan). */
export async function countOrgUsers(orgId: string, roles: ("org_admin" | "manager" | "instructor" | "student")[]) {
  const [r] = await withTenant(orgId, null, (tx) =>
    tx.select({ n: sql<number>`count(*)::int` }).from(users).where(and(eq(users.organizationId, orgId), inArray(users.role, roles), eq(users.isActive, true))),
  );
  return r.n;
}
