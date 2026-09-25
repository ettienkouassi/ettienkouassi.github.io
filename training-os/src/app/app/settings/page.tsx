import { Checkbox, Field, Form, Submit, TextArea } from "@/components/form";
import { Card, PageHeader } from "@/components/ui";
import { requirePageOrg, STAFF } from "@/lib/auth/context";
import { orgInfo } from "@/server/metrics";
import { saveOrgAction, uploadLogoAction } from "./actions";
import { SettingsTabs } from "./tabs";

export const metadata = { title: "Paramètres" };

export default async function SettingsPage() {
  const ctx = await requirePageOrg(STAFF, "settings.write");
  const o = await ctx.db((tx) => orgInfo(tx, ctx.orgId));
  return (
    <>
      <PageHeader title="Paramètres" subtitle={o.name} />
      <SettingsTabs active="org" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Form action={saveOrgAction} className="space-y-4 lg:col-span-2">
          <Card title="Informations du centre">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="name" label="Nom" required defaultValue={o.name} className="sm:col-span-2" />
              <Field name="managerName" label="Responsable" defaultValue={o.managerName} />
              <Field name="phone" label="Téléphone" defaultValue={o.phone} />
              <Field name="email" label="Email" type="email" defaultValue={o.email} />
              <Field name="website" label="Site web" type="url" defaultValue={o.website} />
              <Field name="country" label="Pays" required defaultValue={o.country} />
              <Field name="city" label="Ville" defaultValue={o.city} />
              <Field name="address" label="Adresse" defaultValue={o.address} className="sm:col-span-2" />
              <Field name="currency" label="Devise" required defaultValue={o.currency} />
              <Field name="timezone" label="Fuseau horaire" required defaultValue={o.timezone} />
            </div>
            <TextArea name="description" label="Description (page publique)" defaultValue={o.description} className="mt-4" />
            <div className="mt-4 space-y-2">
              <Checkbox name="publicPageEnabled" label={`Activer la page publique du centre (/c/${o.slug})`} defaultChecked={o.publicPageEnabled} />
              <Checkbox name="aiRecommendationsEnabled" label="Afficher les recommandations de formation (IA de recommandation)" defaultChecked={o.aiRecommendationsEnabled} />
            </div>
          </Card>
          <Card title="Certificats">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field name="certificatePrefix" label="Préfixe de numérotation" required defaultValue={o.certificatePrefix} hint="Ex. CFCM → CFCM-2026-000125" />
              <Field name="certificateSignatoryName" label="Signataire" defaultValue={o.certificateSignatoryName} />
              <Field name="certificateSignatoryTitle" label="Fonction du signataire" defaultValue={o.certificateSignatoryTitle} />
            </div>
          </Card>
          <Card title="Relances & alertes automatiques">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field name="reminderDaysBefore" label="Rappel avant échéance (jours)" type="number" min={0} max={30} required defaultValue={o.settings.reminderDaysBefore ?? 3} />
              <Field name="reminderDaysAfter" label="Relance après retard (jours)" type="number" min={0} max={60} required defaultValue={o.settings.reminderDaysAfter ?? 3} />
              <Field name="absenceAlertThreshold" label="Alerte après N absences consécutives" type="number" min={1} max={10} required defaultValue={o.settings.absenceAlertThreshold ?? 2} />
            </div>
          </Card>
          <div className="flex justify-end">
            <Submit>Enregistrer</Submit>
          </div>
        </Form>
        <Card title="Logo">
          {o.logoKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/api/files/logo/current" alt="Logo" className="mb-3 max-h-24 rounded" />
          ) : (
            <p className="mb-3 text-sm text-slate-500">Aucun logo.</p>
          )}
          <Form action={uploadLogoAction}>
            <Field name="logo" label="Fichier PNG ou JPEG (2 Mo max)" type="file" accept="image/png,image/jpeg" required />
            <Submit className="btn-secondary">Téléverser</Submit>
          </Form>
        </Card>
      </div>
    </>
  );
}
