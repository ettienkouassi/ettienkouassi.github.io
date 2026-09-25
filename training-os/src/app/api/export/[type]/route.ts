import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { assessmentResults, assessments, attendance, courseSessions, courses, enrollments, payments, sessionMeetings, students, users } from "@/db/schema";
import { apiError, fileResponse } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireOrg, STAFF } from "@/lib/auth/context";
import type { Permission } from "@/lib/auth/rbac";
import { LABELS, todayISO } from "@/lib/format";
import { rateLimit } from "@/lib/security/rate-limit";
import { toCsv, toXlsx } from "@/lib/tabular";
import { orgInfo } from "@/server/metrics";
import { loadEnrollmentSummaries } from "@/server/summaries";

const PERMS: Record<string, Permission> = {
  students: "students.read",
  enrollments: "reports.read",
  payments: "payments.read",
  balances: "payments.read",
  attendance: "reports.read",
  results: "reports.read",
};
const date = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** Exports CSV / Excel (§48). Chaque export est journalisé (données personnelles). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  try {
    const { type } = await params;
    const perm = PERMS[type];
    if (!perm) return NextResponse.json({ error: "Export inconnu" }, { status: 404 });
    const ctx = await requireOrg(STAFF, perm);
    const rl = await rateLimit(`export:${ctx.user.id}`, 30, 3600);
    if (!rl.allowed) return NextResponse.json({ error: "Trop d'exports, réessayez plus tard." }, { status: 429 });
    const format = req.nextUrl.searchParams.get("format") === "csv" ? "csv" : "xlsx";
    const from = date(req.nextUrl.searchParams.get("from"));
    const to = date(req.nextUrl.searchParams.get("to"));

    const { headers, rows, title } = await ctx.db(async (tx) => {
      const org = await orgInfo(tx, ctx.orgId);
      if (type === "students") {
        const r = await tx.select().from(students).where(eq(students.organizationId, ctx.orgId)).orderBy(asc(students.lastName));
        return {
          title: "Étudiants",
          headers: ["Matricule", "Nom", "Prénom", "Téléphone", "Email", "Date de naissance", "Pays", "Profession", "Entreprise", "Niveau", "Source", "Actif"],
          rows: r.map((s) => [s.matricule, s.lastName, s.firstName, s.phone, s.email, s.birthDate, s.country, s.profession, s.company, s.educationLevel, s.leadSource, s.isActive ? "oui" : "non"]),
        };
      }
      if (type === "payments") {
        const conds = [eq(payments.organizationId, ctx.orgId)];
        if (from) conds.push(gte(payments.paidAt, from));
        if (to) conds.push(lte(payments.paidAt, to));
        const r = await tx
          .select({ p: payments, s: students, c: courses.name, u: users.email })
          .from(payments)
          .innerJoin(enrollments, eq(enrollments.id, payments.enrollmentId))
          .innerJoin(students, eq(students.id, enrollments.studentId))
          .innerJoin(courses, eq(courses.id, enrollments.courseId))
          .leftJoin(users, eq(users.id, payments.recordedBy))
          .where(and(...conds))
          .orderBy(desc(payments.paidAt));
        return {
          title: "Paiements",
          headers: ["Date", "Matricule", "Étudiant", "Formation", "Montant", "Moyen", "Référence", "Statut", "Enregistré par", "Commentaire", "Motif d'annulation"],
          rows: r.map(({ p, s, c, u }) => [p.paidAt, s.matricule, `${s.lastName} ${s.firstName}`, c, p.amount, LABELS.paymentMethod[p.method], p.reference, p.status === "cancelled" ? "Annulé" : "Enregistré", u, p.comment, p.cancelReason]),
        };
      }
      if (type === "balances" || type === "enrollments") {
        const sums = await loadEnrollmentSummaries(tx, ctx.orgId, {}, org.timezone);
        return {
          title: type === "balances" ? "Soldes" : "Inscriptions",
          headers: ["Matricule", "Étudiant", "Formation", "Session", "Statut", "Inscrit le", "Total", "Payé", "Reste", "En retard", "Statut paiement", "Présence %", "Moyenne %", "Progression %", "Certificat"],
          rows: sums.map((s) => [
            s.student.matricule,
            `${s.student.lastName} ${s.student.firstName}`,
            s.course.name,
            s.session.name,
            LABELS.enrollmentStatus[s.status],
            s.enrolledAt.toISOString().slice(0, 10),
            s.balance.total,
            s.balance.paid,
            s.balance.remaining,
            s.balance.overdueAmount,
            LABELS.paymentStatus[s.balance.status],
            s.attendance.rate,
            s.averageGrade,
            s.progress.global,
            s.certification.certificateCode ?? "",
          ]),
        };
      }
      if (type === "attendance") {
        const conds = [eq(attendance.organizationId, ctx.orgId)];
        if (from) conds.push(gte(sessionMeetings.date, from));
        if (to) conds.push(lte(sessionMeetings.date, to));
        const r = await tx
          .select({ a: attendance, m: sessionMeetings, s: students, cs: courseSessions.name })
          .from(attendance)
          .innerJoin(sessionMeetings, eq(sessionMeetings.id, attendance.meetingId))
          .innerJoin(courseSessions, eq(courseSessions.id, sessionMeetings.sessionId))
          .innerJoin(enrollments, eq(enrollments.id, attendance.enrollmentId))
          .innerJoin(students, eq(students.id, enrollments.studentId))
          .where(and(...conds))
          .orderBy(desc(sessionMeetings.date), asc(students.lastName));
        return {
          title: "Présences",
          headers: ["Date", "Session", "Séance", "Matricule", "Étudiant", "Statut", "Note"],
          rows: r.map(({ a, m, s, cs }) => [m.date, cs, m.topic, s.matricule, `${s.lastName} ${s.firstName}`, LABELS.attendanceStatus[a.status], a.note]),
        };
      }
      const r = await tx
        .select({ r: assessmentResults, a: assessments, s: students, c: courses.name })
        .from(assessmentResults)
        .innerJoin(assessments, eq(assessments.id, assessmentResults.assessmentId))
        .innerJoin(enrollments, eq(enrollments.id, assessmentResults.enrollmentId))
        .innerJoin(students, eq(students.id, enrollments.studentId))
        .innerJoin(courses, eq(courses.id, assessments.courseId))
        .where(eq(assessmentResults.organizationId, ctx.orgId))
        .orderBy(asc(courses.name), asc(assessments.title), asc(students.lastName));
      return {
        title: "Résultats",
        headers: ["Formation", "Évaluation", "Type", "Date", "Matricule", "Étudiant", "Note", "Sur", "%", "Réussi"],
        rows: r.map(({ r: x, a, s, c }) => [c, a.title, LABELS.assessmentType[a.type], a.date, s.matricule, `${s.lastName} ${s.firstName}`, x.score, a.maxScore, Math.round((x.score / a.maxScore) * 1000) / 10, x.passed ? "oui" : "non"]),
      };
    });

    await ctx.db((tx) =>
      audit(tx, ctx.user, ctx.orgId, { action: "export", entityType: type, summary: `${ctx.user.firstName} ${ctx.user.lastName} a exporté « ${title} » (${rows.length} lignes, ${format.toUpperCase()})` }),
    );
    const name = `${title}_${todayISO()}.${format}`;
    if (format === "csv") return fileResponse(Buffer.from(toCsv(headers, rows), "utf8"), { mime: "text/csv; charset=utf-8", filename: name });
    return fileResponse(await toXlsx(title, headers, rows), { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename: name });
  } catch (e) {
    return apiError(e);
  }
}
