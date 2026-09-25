import { asc } from "drizzle-orm";
import { Field, Form, Select, Submit } from "@/components/form";
import { Card, PageHeader } from "@/components/ui";
import { plans } from "@/db/schema";
import { withSystem } from "@/db/tenant";
import { requirePageUser } from "@/lib/auth/context";
import { createOrgAction } from "../../actions";
import { OrgFields } from "../../org-fields";

export const metadata = { title: "Nouveau centre" };

export default async function NewOrgPage() {
  await requirePageUser(["super_admin"]);
  const ps = await withSystem((tx) => tx.select().from(plans).orderBy(asc(plans.priceMonthly)));
  return (
    <>
      <PageHeader title="Nouveau centre de formation" subtitle="Le centre est créé en « configuration » ; son administrateur reçoit une invitation sécurisée." />
      <Form action={createOrgAction} className="space-y-4">
        <Card title="Centre">
          <OrgFields />
        </Card>
        <Card title="Abonnement">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select name="planId" label="Plan" required options={ps.map((p) => ({ value: p.id, label: p.name }))} />
            <Field name="trialDays" label="Période d'essai (jours)" type="number" min={0} defaultValue={30} required />
          </div>
        </Card>
        <Card title="Administrateur du centre">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field name="adminFirstName" label="Prénom" required />
            <Field name="adminLastName" label="Nom" required />
            <Field name="adminEmail" label="Email" type="email" required />
          </div>
        </Card>
        <div className="flex justify-end">
          <Submit>Créer le centre</Submit>
        </div>
      </Form>
    </>
  );
}
