import { asc } from "drizzle-orm";
import { Field, Form, Submit } from "@/components/form";
import { Card, PageHeader } from "@/components/ui";
import { plans } from "@/db/schema";
import { withSystem } from "@/db/tenant";
import { requirePageUser } from "@/lib/auth/context";
import { savePlanAction } from "../actions";

export const metadata = { title: "Plans" };

function PlanForm({ p }: { p?: typeof plans.$inferSelect }) {
  return (
    <Form action={savePlanAction} resetOnSuccess={!p}>
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="code" label="Code" required defaultValue={p?.code} />
        <Field name="name" label="Nom" required defaultValue={p?.name} />
        <Field name="priceMonthly" label="Prix mensuel (FCFA, vide = sur devis)" type="number" min={0} defaultValue={p?.priceMonthly} />
        <Field name="maxStudents" label="Étudiants max" type="number" min={0} defaultValue={p?.maxStudents} />
        <Field name="maxInstructors" label="Formateurs max" type="number" min={0} defaultValue={p?.maxInstructors} />
        <Field name="maxCourses" label="Formations max" type="number" min={0} defaultValue={p?.maxCourses} />
        <Field name="maxAdmins" label="Administrateurs max" type="number" min={0} defaultValue={p?.maxAdmins} />
        <Field name="storageMb" label="Stockage (Mo)" type="number" min={0} defaultValue={p?.storageMb} />
        <Field name="aiRequestsPerMonth" label="Requêtes IA / mois" type="number" min={0} defaultValue={p?.aiRequestsPerMonth} />
        <Field name="description" label="Description" defaultValue={p?.description} />
      </div>
      <p className="text-xs text-slate-500">Laisser une limite vide = illimité.</p>
      <Submit className="btn-secondary">Enregistrer</Submit>
    </Form>
  );
}

export default async function PlansPage() {
  await requirePageUser(["super_admin"]);
  const ps = await withSystem((tx) => tx.select().from(plans).orderBy(asc(plans.priceMonthly)));
  return (
    <>
      <PageHeader title="Plans d'abonnement" subtitle="Starter, Business, Enterprise — limites appliquées automatiquement." />
      <div className="grid gap-4 lg:grid-cols-2">
        {ps.map((p) => (
          <Card key={p.id} title={p.name}>
            <PlanForm p={p} />
          </Card>
        ))}
        <Card title="Nouveau plan">
          <PlanForm />
        </Card>
      </div>
    </>
  );
}
