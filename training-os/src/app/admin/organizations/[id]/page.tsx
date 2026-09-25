import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { OrgStatusBadge } from "@/components/badges";
import { ActionButton, Field, Form, Select, Submit, TextArea } from "@/components/form";
import { Card, PageHeader } from "@/components/ui";
import { aiUsage, courses, enrollments, organizations, plans, students, subscriptions, users } from "@/db/schema";
import { withSystem } from "@/db/tenant";
import { requirePageUser } from "@/lib/auth/context";
import { ROLE_LABELS } from "@/lib/auth/rbac";
import { formatDateTime } from "@/lib/format";
import { isUuid } from "@/lib/search-params";
import { inviteOrgAdminAction, saveSubscriptionAction, setOrgStatusAction, updateOrgAction } from "../../actions";
import { OrgFields } from "../../org-fields";

export default async function OrgPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await requirePageUser(["super_admin"]);
  const d = await withSystem(async (tx) => {
    const [o] = await tx.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    if (!o) return null;
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    const c = async (q: Promise<{ n: number }[]>) => (await q)[0].n;
    return {
      o,
      sub: (await tx.select().from(subscriptions).where(eq(subscriptions.organizationId, id)).orderBy(desc(subscriptions.currentPeriodEnd)).limit(1))[0],
      plans: await tx.select().from(plans).orderBy(asc(plans.name)),
      staff: await tx.select().from(users).where(and(eq(users.organizationId, id), sql`${users.role} in ('org_admin','manager','instructor')`)),
      students: await c(tx.select({ n: sql<number>`count(*)::int` }).from(students).where(eq(students.organizationId, id))),
      courses: await c(tx.select({ n: sql<number>`count(*)::int` }).from(courses).where(eq(courses.organizationId, id))),
      enrollments: await c(tx.select({ n: sql<number>`count(*)::int` }).from(enrollments).where(eq(enrollments.organizationId, id))),
      ai: await c(tx.select({ n: sql<number>`count(*)::int` }).from(aiUsage).where(and(eq(aiUsage.organizationId, id), gte(aiUsage.createdAt, monthStart)))),
    };
  });
  if (!d) notFound();
  const { o, sub } = d;
  return (
    <>
      <PageHeader
        title={o.name}
        subtitle={
          <span className="flex items-center gap-2">
            <OrgStatusBadge value={o.status} /> /c/{o.slug} · {d.students} étudiants · {d.courses} formations · {d.enrollments} inscriptions · {d.ai} requêtes IA ce mois
          </span>
        }
        actions={
          <>
            {o.status !== "active" && o.status !== "archived" && (
              <ActionButton action={setOrgStatusAction} hidden={{ id: o.id, status: "active" }} className="btn-primary">
                {o.status === "suspended" ? "Réactiver" : "Activer"}
              </ActionButton>
            )}
            {o.status === "active" && (
              <ActionButton action={setOrgStatusAction} hidden={{ id: o.id, status: "suspended" }} className="btn-danger" confirm="Suspendre ce centre ? Ses utilisateurs ne pourront plus accéder à la plateforme (données conservées).">
                Suspendre
              </ActionButton>
            )}
            {o.status !== "archived" && (
              <ActionButton action={setOrgStatusAction} hidden={{ id: o.id, status: "archived" }} className="btn-ghost text-red-600" confirm="Archiver ce centre ? Accès fermé ; données conservées selon la politique de conservation (suppression définitive sur demande écrite, après export).">
                Archiver
              </ActionButton>
            )}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Informations" className="lg:col-span-2">
          <Form action={updateOrgAction}>
            <input type="hidden" name="id" value={o.id} />
            <OrgFields o={o} />
            <Submit className="btn-secondary">Enregistrer</Submit>
          </Form>
        </Card>
        <div className="space-y-4">
          <Card title="Abonnement">
            <Form action={saveSubscriptionAction}>
              <input type="hidden" name="organizationId" value={o.id} />
              <Select name="planId" label="Plan" required options={d.plans.map((p) => ({ value: p.id, label: p.name }))} defaultValue={sub?.planId} />
              <Select
                name="status"
                label="Statut"
                required
                defaultValue={sub?.status ?? "trialing"}
                options={[
                  { value: "trialing", label: "Essai" },
                  { value: "active", label: "Actif" },
                  { value: "past_due", label: "Impayé" },
                  { value: "expired", label: "Expiré" },
                  { value: "cancelled", label: "Résilié" },
                ]}
              />
              <Field name="currentPeriodStart" label="Début" type="date" required defaultValue={sub?.currentPeriodStart} />
              <Field name="currentPeriodEnd" label="Fin" type="date" required defaultValue={sub?.currentPeriodEnd} />
              <Field name="amount" label="Montant mensuel (FCFA)" type="number" min={0} required defaultValue={sub?.amount ?? 0} />
              <TextArea name="notes" label="Notes" defaultValue={sub?.notes} rows={2} />
              <Submit className="btn-secondary w-full">Enregistrer</Submit>
            </Form>
          </Card>
          <Card title="Administrateurs & personnel">
            <ul className="mb-4 space-y-1 text-sm">
              {d.staff.map((u) => (
                <li key={u.id}>
                  {u.firstName} {u.lastName} — {ROLE_LABELS[u.role]}
                  <span className="block text-xs text-slate-500">
                    {u.email} · dernière connexion {formatDateTime(u.lastLoginAt)}
                  </span>
                </li>
              ))}
            </ul>
            <Form action={inviteOrgAdminAction} resetOnSuccess>
              <input type="hidden" name="organizationId" value={o.id} />
              <Field name="firstName" label="Prénom" required />
              <Field name="lastName" label="Nom" required />
              <Field name="email" label="Email" type="email" required />
              <Submit className="btn-secondary w-full">Inviter un administrateur</Submit>
            </Form>
          </Card>
        </div>
      </div>
    </>
  );
}
