import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { Field, Form, Submit } from "@/components/form";
import { Badge, Card, PageHeader, TableWrap } from "@/components/ui";
import { certificates, certificateVerifications } from "@/db/schema";
import { requirePageOrg, STAFF } from "@/lib/auth/context";
import { can } from "@/lib/auth/rbac";
import { formatDate } from "@/lib/format";
import { orgInfo } from "@/server/metrics";
import { verifyUrlFor } from "@/server/certificates";
import { loadEnrollmentSummaries } from "@/server/summaries";
import { issueManyAction, revokeCertificateAction } from "./actions";

export const metadata = { title: "Certificats" };

export default async function CertificatesPage() {
  const ctx = await requirePageOrg(STAFF, "students.read");
  const canIssue = can(ctx.role, "certificates.issue");
  const { issued, ready } = await ctx.db(async (tx) => {
    const org = await orgInfo(tx, ctx.orgId);
    const issued = await tx
      .select({ c: certificates, checks: sql<number>`(select count(*)::int from ${certificateVerifications} v where v.certificate_id = ${certificates.id})` })
      .from(certificates)
      .where(eq(certificates.organizationId, ctx.orgId))
      .orderBy(desc(certificates.issuedAt));
    const sums = await loadEnrollmentSummaries(tx, ctx.orgId, { statuses: ["registered", "active", "completed"] }, org.timezone);
    return { issued, ready: sums.filter((s) => s.certification.ready) };
  });
  return (
    <>
      <PageHeader title="Certificats" subtitle="Génération automatique ou validation administrative, numéro unique, QR code et page de vérification publique." />
      <Card title={`Éligibles au certificat (${ready.length})`} className="mb-6">
        {/* Le formulaire reste monté pour afficher le message de confirmation après génération */}
        <Form action={issueManyAction}>
          {ready.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun étudiant en attente de certificat.</p>
          ) : (
            <>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {ready.map((s) => (
                  <li key={s.enrollmentId}>
                    <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-2 text-sm">
                      <input type="checkbox" name="enrollmentId" value={s.enrollmentId} defaultChecked className="mt-1" disabled={!canIssue} />
                      <span>
                        <span className="font-medium">
                          {s.student.firstName} {s.student.lastName}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {s.course.name} · présence {s.attendance.rate} % · moyenne {s.averageGrade} %
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {canIssue && (
                <div className="flex justify-end">
                  <Submit pendingText="Génération…">🏅 Générer les certificats sélectionnés</Submit>
                </div>
              )}
            </>
          )}
        </Form>
      </Card>
      <TableWrap>
        <table className="table">
          <thead>
            <tr>
              <th>Numéro</th>
              <th>Étudiant</th>
              <th>Formation</th>
              <th>Date</th>
              <th className="num">Vérifications</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {issued.map(({ c, checks }) => (
              <tr key={c.id}>
                <td className="font-mono text-xs">
                  <a className="link" href={verifyUrlFor(c.code)} target="_blank" rel="noopener">
                    {c.code}
                  </a>
                </td>
                <td>
                  <Link className="link" href={`/app/students/${c.studentId}`}>
                    {c.studentName}
                  </Link>
                </td>
                <td>{c.courseName}</td>
                <td>{formatDate(c.completionDate)}</td>
                <td className="num">{checks}</td>
                <td>{c.status === "issued" ? <Badge tone="green">Valide</Badge> : <Badge tone="red">Révoqué</Badge>}</td>
                <td className="whitespace-nowrap">
                  <a className="btn-ghost btn-sm" href={`/api/files/certificate/${c.id}`} target="_blank" rel="noopener">
                    PDF
                  </a>
                  {canIssue && c.status === "issued" && (
                    <details className="inline-block">
                      <summary className="btn-ghost btn-sm cursor-pointer text-red-600">Révoquer</summary>
                      <Form action={revokeCertificateAction} className="mt-2 w-56 space-y-2">
                        <input type="hidden" name="id" value={c.id} />
                        <Field name="reason" label="Motif" required />
                        <Submit className="btn-danger btn-sm">Confirmer</Submit>
                      </Form>
                    </details>
                  )}
                </td>
              </tr>
            ))}
            {issued.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-slate-500">
                  Aucun certificat délivré.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableWrap>
    </>
  );
}
