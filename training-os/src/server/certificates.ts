import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { certificates, courses, enrollments, orgCounters, organizations, students } from "@/db/schema";
import type { Tx } from "@/db/tenant";
import { audit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/session";
import { UserError } from "@/lib/errors";
import { formatDate, todayISO } from "@/lib/format";
import { renderCertificatePdf } from "@/lib/pdf/certificate";
import { getObject, makeKey, putObject } from "@/lib/storage";
import { notify, queueEmail } from "./communications";
import { loadEnrollmentSummaries } from "./summaries";

export async function nextCounter(tx: Tx, orgId: string, key: string): Promise<number> {
  const [r] = await tx
    .insert(orgCounters)
    .values({ organizationId: orgId, key, value: 1 })
    .onConflictDoUpdate({ target: [orgCounters.organizationId, orgCounters.key], set: { value: sql`${orgCounters.value} + 1` } })
    .returning({ value: orgCounters.value });
  return r.value;
}

export function certificateCode(prefix: string, year: number, n: number) {
  const p = prefix.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || "CERT";
  return `${p}-${year}-${String(n).padStart(6, "0")}`;
}

export function verifyUrlFor(code: string) {
  const base = (process.env.VERIFY_URL || process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/verify/${encodeURIComponent(code)}`;
}

/**
 * Workflow de certification (§52) : contrôle d'éligibilité → numéro unique →
 * PDF avec QR code → stockage → marquage terminé → notification étudiant.
 */
export async function issueCertificate(tx: Tx, orgId: string, actor: SessionUser | null, enrollmentId: string, opts: { override?: boolean } = {}) {
  const [org] = await tx.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  const [summary] = await loadEnrollmentSummaries(tx, orgId, { enrollmentIds: [enrollmentId] }, org.timezone);
  if (!summary) throw new UserError("Inscription introuvable.");
  if (summary.certification.certificateCode) throw new UserError("Un certificat a déjà été délivré pour cette inscription.");
  if (["cancelled", "dropped", "prospect", "preregistered"].includes(summary.status)) throw new UserError("Cette inscription n'est pas éligible (statut).");
  if (!summary.certification.eligible && !opts.override) {
    const missing = summary.certification.checks.filter((c) => !c.ok).map((c) => `${c.label} (${c.detail})`);
    throw new UserError(`Conditions non remplies : ${missing.join(" ; ")}`);
  }
  const [course] = await tx.select().from(courses).where(eq(courses.id, summary.course.id)).limit(1);
  const [student] = await tx.select().from(students).where(eq(students.id, summary.student.id)).limit(1);

  const today = todayISO(org.timezone);
  const year = Number(today.slice(0, 4));
  const n = await nextCounter(tx, orgId, `certificate-${year}`);
  const code = certificateCode(org.certificatePrefix, year, n);
  const studentName = `${student.firstName} ${student.lastName}`;
  const completionDate = summary.session.endDate < today ? summary.session.endDate : today;

  let logo: { bytes: Buffer; mime: string } | null = null;
  if (org.logoKey) {
    try {
      logo = { bytes: await getObject(org.logoKey), mime: org.logoKey.endsWith(".png") ? "image/png" : "image/jpeg" };
    } catch {
      logo = null;
    }
  }
  const pdf = await renderCertificatePdf({
    code,
    organizationName: org.name,
    studentName,
    courseName: course.name,
    durationHours: course.durationHours || null,
    completionDate: formatDate(completionDate, { day: "numeric", month: "long", year: "numeric" }),
    signatoryName: org.certificateSignatoryName,
    signatoryTitle: org.certificateSignatoryTitle,
    verifyUrl: verifyUrlFor(code),
    logo,
  });
  const key = makeKey(orgId, "certificates", "pdf");
  await putObject(key, pdf, "application/pdf");

  const [cert] = await tx
    .insert(certificates)
    .values({
      organizationId: orgId,
      enrollmentId,
      studentId: student.id,
      courseId: course.id,
      code,
      studentName,
      courseName: course.name,
      organizationName: org.name,
      durationHours: course.durationHours || null,
      completionDate,
      storageKey: key,
      issuedBy: actor?.id ?? null,
    })
    .returning();

  await tx
    .update(enrollments)
    .set({ status: "completed", completedAt: new Date() })
    .where(and(eq(enrollments.id, enrollmentId), sql`${enrollments.status} in ('registered','active','completed')`));

  if (student.userId) {
    await notify(tx, orgId, { userId: student.userId, level: "success", title: "Votre certificat est disponible 🎓", body: `${course.name} — ${code}`, link: "/student/certificates" });
  }
  const mailId = await queueEmail(tx, orgId, {
    templateKey: "certificate_available",
    to: student.email,
    studentId: student.id,
    createdBy: actor?.id,
    dedupeKey: `certificate:${cert.id}`,
    vars: { prenom: student.firstName, formation: course.name, reference: code, lien_verification: verifyUrlFor(code), centre: org.name },
  });
  await audit(tx, actor, orgId, {
    action: opts.override ? "certificate.issue_override" : "certificate.issue",
    entityType: "certificate",
    entityId: cert.id,
    summary: `${actor ? `${actor.firstName} ${actor.lastName}` : "Système"} a généré le certificat ${code} pour ${studentName} (${course.name})${opts.override ? " — dérogation aux conditions" : ""}`,
  });
  return { certificate: cert, mailId };
}
