import { and, desc, eq, inArray, or } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EnrollmentCard } from "@/components/enrollment-card";
import { ActionButton, Form, Submit } from "@/components/form";
import { Alert, Badge, Card, DL, PageHeader } from "@/components/ui";
import { auditLogs, payments, enrollments, students, courses } from "@/db/schema";
import { requirePageOrg, STAFF } from "@/lib/auth/context";
import { can } from "@/lib/auth/rbac";
import { formatDate, formatDateTime, formatMoney, LABELS } from "@/lib/format";
import { isUuid } from "@/lib/search-params";
import { orgInfo } from "@/server/metrics";
import { recommendationsFor } from "@/server/recommendations";
import { loadEnrollmentSummaries } from "@/server/summaries";
import { inviteStudentAction, toggleStudentActiveAction, uploadStudentPhotoAction } from "../actions";

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await requirePageOrg(STAFF, "students.read");
  const data = await ctx.db(async (tx) => {
    const [s] = await tx.select().from(students).where(and(eq(students.id, id), eq(students.organizationId, ctx.orgId))).limit(1);
    if (!s) return null;
    const org = await orgInfo(tx, ctx.orgId);
    const sums = await loadEnrollmentSummaries(tx, ctx.orgId, { studentId: id }, org.timezone);
    const enrIds = sums.map((x) => x.enrollmentId);
    const pays = enrIds.length
      ? await tx
          .select({ p: payments, course: courses.name })
          .from(payments)
          .innerJoin(enrollments, eq(enrollments.id, payments.enrollmentId))
          .innerJoin(courses, eq(courses.id, enrollments.courseId))
          .where(inArray(payments.enrollmentId, enrIds))
          .orderBy(desc(payments.paidAt))
      : [];
    const history = await tx
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.organizationId, ctx.orgId), or(eq(auditLogs.entityId, id), enrIds.length ? inArray(auditLogs.entityId, enrIds) : undefined)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(30);
    const recos = await recommendationsFor(tx, ctx.orgId, sums);
    return { s, sums, pays, history, recos };
  });
  if (!data) notFound();
  const { s, sums, pays, history, recos } = data;
  const canWrite = can(ctx.role, "students.write");

  return (
    <>
      <PageHeader
        title={`${s.firstName} ${s.lastName}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{s.matricule}</span>
            {!s.isActive && <Badge>archivé</Badge>}
            {s.userId ? <Badge tone="green">Compte étudiant actif</Badge> : <Badge>Pas de compte</Badge>}
          </span>
        }
        actions={
          canWrite && (
            <>
              <Link href={`/app/enrollments/new?student=${s.id}`} className="btn-primary">
                + Inscrire
              </Link>
              <Link href={`/app/students/${s.id}/edit`} className="btn-secondary">
                Modifier
              </Link>
              {!s.userId && (
                <ActionButton action={inviteStudentAction} hidden={{ id: s.id }} className="btn-secondary">
                  Créer l&apos;accès étudiant
                </ActionButton>
              )}
              <ActionButton action={toggleStudentActiveAction} hidden={{ id: s.id }} className="btn-ghost" confirm={s.isActive ? "Archiver cet étudiant ?" : "Réactiver cet étudiant ?"}>
                {s.isActive ? "Archiver" : "Réactiver"}
              </ActionButton>
            </>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Informations générales" className="lg:col-span-2">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="shrink-0">
              {s.photoKey ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/files/student-photo/${s.id}`} alt="" className="h-28 w-28 rounded-xl object-cover ring-1 ring-slate-200" />
              ) : (
                <div className="grid h-28 w-28 place-items-center rounded-xl bg-brand-50 text-3xl font-semibold text-brand-700">
                  {s.firstName[0]}
                  {s.lastName[0]}
                </div>
              )}
              {canWrite && (
                <Form action={uploadStudentPhotoAction} className="mt-2 w-28 space-y-1">
                  <input type="hidden" name="id" value={s.id} />
                  <input type="file" name="photo" accept="image/png,image/jpeg,image/webp" className="w-28 text-[10px]" required />
                  <Submit className="btn-secondary btn-sm w-full">Photo</Submit>
                </Form>
              )}
            </div>
            <DL
              items={[
                ["Téléphone", s.phone],
                ["Email", s.email],
                ["Date de naissance", formatDate(s.birthDate)],
                ["Adresse", [s.address, s.country].filter(Boolean).join(", ") || null],
                ["Profession", s.profession],
                ["Entreprise", s.company],
                ["Niveau d'études", s.educationLevel],
                ["Source", s.leadSource],
              ]}
            />
          </div>
          {s.adminNotes && (
            <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <strong>Notes administratives : </strong>
              {s.adminNotes}
            </div>
          )}
        </Card>
        <Card title="🤖 Recommandations">
          {recos.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune recommandation pour le moment (aucune formation terminée ou recommandations désactivées).</p>
          ) : (
            <ul className="space-y-3">
              {recos.map((r) => (
                <li key={r.course.id} className="rounded-lg border border-brand-100 bg-brand-50/50 p-3 text-sm">
                  <div className="font-semibold text-brand-800">Formation recommandée : {r.course.name}</div>
                  <p className="mt-1 text-xs text-slate-600">Raison : {r.reason}</p>
                  {canWrite && (
                    <Link href={`/app/enrollments/new?student=${s.id}&course=${r.course.id}`} className="link mt-2 inline-block text-xs">
                      Inscrire à cette formation →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Formations, présences, évaluations et progression</h2>
      {sums.length === 0 ? (
        <Alert>Aucune inscription. Utilisez « Inscrire » pour ajouter l&apos;étudiant à une session.</Alert>
      ) : (
        <div className="space-y-4">
          {sums.map((x) => (
            <EnrollmentCard key={x.enrollmentId} s={x} adminLinks showRisk />
          ))}
        </div>
      )}

      {can(ctx.role, "payments.read") && (
        <Card title="Paiements" className="mt-6" bodyClassName="overflow-x-auto">
          {pays.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Aucun paiement enregistré.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Formation</th>
                  <th className="num">Montant</th>
                  <th>Moyen</th>
                  <th>Référence</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {pays.map(({ p, course }) => (
                  <tr key={p.id} className={p.status === "cancelled" ? "text-slate-400 line-through" : ""}>
                    <td>{formatDate(p.paidAt)}</td>
                    <td>{course}</td>
                    <td className="num">{formatMoney(p.amount)}</td>
                    <td>{LABELS.paymentMethod[p.method]}</td>
                    <td className="font-mono text-xs">{p.reference ?? "—"}</td>
                    <td>{p.status === "cancelled" ? <Badge tone="gray">Annulé</Badge> : <Badge tone="green">Enregistré</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      <Card title="Historique" className="mt-6">
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun événement.</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex gap-3">
                <span className="w-36 shrink-0 text-xs text-slate-500">{formatDateTime(h.createdAt)}</span>
                <span>{h.summary}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  );
}
