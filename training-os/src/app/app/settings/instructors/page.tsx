import { asc, eq } from "drizzle-orm";
import { Checkbox, Field, Form, Submit, TextArea } from "@/components/form";
import { Badge, Card, PageHeader } from "@/components/ui";
import { instructors } from "@/db/schema";
import { requirePageOrg, STAFF } from "@/lib/auth/context";
import { saveInstructorAction } from "../actions";
import { SettingsTabs } from "../tabs";

export const metadata = { title: "Formateurs" };

export default async function InstructorsPage() {
  const ctx = await requirePageOrg(STAFF, "instructors.write");
  const list = await ctx.db((tx) => tx.select().from(instructors).where(eq(instructors.organizationId, ctx.orgId)).orderBy(asc(instructors.lastName)));
  return (
    <>
      <PageHeader title="Formateurs" subtitle={`${list.length} formateur(s)`} />
      <SettingsTabs active="instructors" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {list.map((i) => (
            <details key={i.id} className="card p-4">
              <summary className="flex cursor-pointer items-center justify-between">
                <span>
                  <span className="font-medium">
                    {i.firstName} {i.lastName}
                  </span>
                  <span className="ml-2 text-sm text-slate-500">{i.specialty}</span>
                </span>
                <span className="flex gap-1">
                  {i.userId ? <Badge tone="green">Accès actif</Badge> : <Badge>Sans accès</Badge>}
                  {!i.isActive && <Badge tone="red">Inactif</Badge>}
                </span>
              </summary>
              <Form action={saveInstructorAction} className="mt-4 space-y-3">
                <input type="hidden" name="id" value={i.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field name="firstName" label="Prénom" required defaultValue={i.firstName} />
                  <Field name="lastName" label="Nom" required defaultValue={i.lastName} />
                  <Field name="email" label="Email" type="email" defaultValue={i.email} />
                  <Field name="phone" label="Téléphone" defaultValue={i.phone} />
                  <Field name="specialty" label="Spécialité" defaultValue={i.specialty} className="sm:col-span-2" />
                </div>
                <TextArea name="bio" label="Biographie" defaultValue={i.bio} rows={2} />
                <Checkbox name="isActive" label="Actif" defaultChecked={i.isActive} />
                {!i.userId && <Checkbox name="createAccount" label="Créer son accès formateur (invitation par email)" />}
                <Submit className="btn-secondary btn-sm">Enregistrer</Submit>
              </Form>
            </details>
          ))}
        </div>
        <Card title="Ajouter un formateur">
          <Form action={saveInstructorAction} resetOnSuccess>
            <Field name="firstName" label="Prénom" required />
            <Field name="lastName" label="Nom" required />
            <Field name="email" label="Email" type="email" />
            <Field name="phone" label="Téléphone" />
            <Field name="specialty" label="Spécialité" />
            <Checkbox name="createAccount" label="Créer son accès formateur (invitation)" />
            <Submit className="btn-primary w-full">Ajouter</Submit>
          </Form>
        </Card>
      </div>
    </>
  );
}
