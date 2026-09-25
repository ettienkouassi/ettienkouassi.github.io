import { Field, Select } from "@/components/form";
import type { organizations } from "@/db/schema";

export function OrgFields({ o }: { o?: typeof organizations.$inferSelect }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field name="name" label="Nom du centre" required defaultValue={o?.name} />
      {!o && <Field name="slug" label="Identifiant (URL publique)" hint="Ex. cfcm-ci → /c/cfcm-ci. Laisser vide pour générer." />}
      <Field name="managerName" label="Responsable" defaultValue={o?.managerName} />
      <Field name="country" label="Pays" required defaultValue={o?.country ?? "Côte d'Ivoire"} />
      <Field name="city" label="Ville" defaultValue={o?.city} />
      <Field name="address" label="Adresse" defaultValue={o?.address} />
      <Field name="phone" label="Téléphone" defaultValue={o?.phone} />
      <Field name="email" label="Email" type="email" defaultValue={o?.email} />
      <Field name="website" label="Site web" type="url" defaultValue={o?.website} />
      <Field name="currency" label="Devise" required defaultValue={o?.currency ?? "XOF"} />
      <Select
        name="locale"
        label="Langue"
        required
        defaultValue={o?.locale ?? "fr"}
        options={[
          { value: "fr", label: "Français" },
          { value: "en", label: "English" },
        ]}
      />
      <Field name="timezone" label="Fuseau horaire" required defaultValue={o?.timezone ?? "Africa/Abidjan"} />
    </div>
  );
}
