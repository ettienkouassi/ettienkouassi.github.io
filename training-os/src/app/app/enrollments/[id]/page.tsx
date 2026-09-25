import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EnrollmentStatusBadge, PaymentStatusBadge } from "@/components/badges";
import { EnrollmentCard } from "@/components/enrollment-card";
import { ActionButton, Field, Form, Select, Submit, TextArea } from "@/components/form";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { enrollments, payments, users } from "@/db/schema";
import { requirePageOrg, STAFF } from "@/lib/auth/context";
import { can } from "@/lib/auth/rbac";
import { formatDate, formatMoney, LABELS, todayISO } from "@/lib/format";
import { isUuid } from "@/lib/search-params";
import { orgInfo } from "@/server/metrics";
import { loadEnrollmentSummaries } from "@/server/summaries";
import { cancelPaymentAction, issueCertificateAction, recordPaymentAction, saveScheduleAction, updateEnrollmentAction } from "../actions";
import { ScheduleEditor } from "../schedule-editor";

export default async function EnrollmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await requirePageOrg(STAFF, "enrollments.write");
  const data = await ctx.db(async (tx) => {
    const [e] = await tx.select().from(enrollments).where(and(eq(enrollments.id, id), eq(enrollments.organizationId, ctx.orgId))).limit(1);
    if (!e) return null;
    const org = await orgInfo(tx, ctx.orgId);
    const [s] = await loadEnrollmentSummaries(tx, ctx.orgId, { enrollmentIds: [id] }, org.timezone);
    const pays = await tx
      .select({ p: payments, by: users.firstName, byL: users.lastName })
      .from(payments)
      .leftJoin(users, eq(users.id, payments.recordedBy))
      .where(eq(payments.enrollmentId, id))
      .orderBy(desc(payments.paidAt), desc(payments.createdAt));
    return { e, s, pays, today: todayISO(org.timezone) };
  });
  if (!data) notFound();
  const { e, s, pays, today } = data;
  const b = s.balance;

  return (
    <>
      <PageHeader
        title={`${s.student.firstName} ${s.student.lastName} — ${s.course.name}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <EnrollmentStatusBadge value={s.status} /> <PaymentStatusBadge value={b.status} />
            <Link className="link" href={`/app/sessions/${s.session.id}`}>
              {s.session.name}
            </Link>
          </span>
        }
        actions={
          <Link href={`/app/students/${s.student.id}`} className="btn-secondary">
            Fiche étudiant
          </Link>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <EnrollmentCard s={s} showRisk />
          <Card title="Échéancier">
            <table className="table mb-4">
              <thead>
                <tr>
                  <th>Échéance</th>
                  <th>Date</th>
                  <th className="num">Montant</th>
                  <th className="num">Payé</th>
                  <th className="num">Reste</th>
                  <th>État</th>
                </tr>
              </thead>
              <tbody>
                {b.installments.map((i) => (
                  <tr key={i.id ?? i.position}>
                    <td>{i.label}</td>
                    <td>{formatDate(i.dueDate)}</td>
                    <td className="num">{formatMoney(i.amount)}</td>
                    <td className="num">{formatMoney(i.paid)}</td>
                    <td className="num">{formatMoney(i.remaining)}</td>
                    <td>
                      {i.state === "paid" ? <Badge tone="green">Payée</Badge> : i.state === "overdue" ? <Badge tone="red">En retard</Badge> : i.state === "partial" ? <Badge tone="blue">Partielle</Badge> : <Badge>À venir</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {can(ctx.role, "payments.write") && (
              <details>
                <summary className="cursor-pointer text-sm font-medium text-brand-700">Modifier l&apos;échéancier</summary>
                <div className="mt-3">
                  <ScheduleEditor action={saveScheduleAction} enrollmentId={e.id} total={b.total} initial={b.installments.map((i) => ({ label: i.label, dueDate: i.dueDate, amount: i.amount }))} />
                </div>
              </details>
            )}
          </Card>
          <Card title="Historique des paiements" bodyClassName="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="num">Montant</th>
                  <th>Moyen</th>
                  <th>Référence</th>
                  <th>Enregistré par</th>
                  <th>Commentaire</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pays.map(({ p, by, byL }) => (
                  <tr key={p.id} className={p.status === "cancelled" ? "text-slate-400" : ""}>
                    <td>{formatDate(p.paidAt)}</td>
                    <td className={`num ${p.status === "cancelled" ? "line-through" : ""}`}>{formatMoney(p.amount)}</td>
                    <td>{LABELS.paymentMethod[p.method]}</td>
                    <td className="font-mono text-xs">{p.reference ?? "—"}</td>
                    <td className="text-xs">{by ? `${by} ${byL}` : "—"}</td>
                    <td className="text-xs">
                      {p.comment}
                      {p.status === "cancelled" && <div className="text-red-600">Annulé : {p.cancelReason}</div>}
                    </td>
                    <td>
                      {p.status === "recorded" && can(ctx.role, "payments.cancel") && (
                        <details>
                          <summary className="btn-ghost btn-sm cursor-pointer text-red-600">Annuler</summary>
                          <Form action={cancelPaymentAction} className="mt-2 w-56 space-y-2">
                            <input type="hidden" name="id" value={p.id} />
                            <Field name="reason" label="Motif" required />
                            <Submit className="btn-danger btn-sm">Confirmer</Submit>
                          </Form>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
                {pays.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-slate-500">
                      Aucun paiement.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
        <div className="space-y-4">
          {can(ctx.role, "payments.write") && b.remaining > 0 && e.status !== "cancelled" && (
            <Card title="Enregistrer un paiement">
              <Form action={recordPaymentAction} resetOnSuccess>
                <input type="hidden" name="enrollmentId" value={e.id} />
                <Field name="amount" label="Montant (FCFA)" type="number" min={1} max={b.remaining} required defaultValue={b.nextDue?.amount ?? b.remaining} />
                <Select name="method" label="Moyen de paiement" required options={Object.entries(LABELS.paymentMethod).map(([value, label]) => ({ value, label }))} defaultValue="mobile_money" />
                <Field name="reference" label="Référence" placeholder="N° de transaction, reçu…" />
                <Field name="paidAt" label="Date" type="date" required defaultValue={today} max={today} />
                <TextArea name="comment" label="Commentaire" rows={2} />
                <Submit className="btn-primary w-full">Enregistrer</Submit>
              </Form>
            </Card>
          )}
          <Card title="Certificat">
            {s.certification.certificateCode ? (
              <div className="space-y-2 text-sm">
                <Alert tone="green">Certificat délivré : {s.certification.certificateCode}</Alert>
                <a className="btn-secondary w-full" href={`/api/files/certificate/${s.certification.certificateId}`} target="_blank" rel="noopener">
                  Télécharger le PDF
                </a>
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <ul className="space-y-1">
                  {s.certification.checks.map((c) => (
                    <li key={c.key} className={c.ok ? "text-emerald-700" : "text-red-600"}>
                      {c.ok ? "✓" : "✗"} {c.label} <span className="text-xs text-slate-500">({c.detail})</span>
                    </li>
                  ))}
                </ul>
                {can(ctx.role, "certificates.issue") &&
                  (s.certification.eligible ? (
                    <ActionButton action={issueCertificateAction} hidden={{ enrollmentId: e.id }} className="btn-primary w-full">
                      🏅 Générer le certificat
                    </ActionButton>
                  ) : (
                    ctx.role === "org_admin" && (
                      <ActionButton action={issueCertificateAction} hidden={{ enrollmentId: e.id, override: "1" }} className="btn-secondary btn-sm" confirm="Délivrer le certificat par dérogation (conditions non remplies) ? Cette action est journalisée.">
                        Délivrer par dérogation
                      </ActionButton>
                    )
                  ))}
              </div>
            )}
          </Card>
          <Card title="Modifier l'inscription">
            <Form action={updateEnrollmentAction}>
              <input type="hidden" name="id" value={e.id} />
              <Select name="status" label="Statut" required defaultValue={e.status} options={Object.entries(LABELS.enrollmentStatus).map(([value, label]) => ({ value, label }))} />
              <Field name="agreedPrice" label="Prix convenu" type="number" min={0} required defaultValue={e.agreedPrice} hint={ctx.role !== "org_admin" ? "Modifiable uniquement par l'administrateur." : undefined} />
              <Field name="discount" label="Remise" type="number" min={0} required defaultValue={e.discount} />
              <TextArea name="notes" label="Notes" defaultValue={e.notes} rows={2} />
              <Submit className="btn-secondary w-full">Enregistrer</Submit>
            </Form>
          </Card>
        </div>
      </div>
    </>
  );
}
