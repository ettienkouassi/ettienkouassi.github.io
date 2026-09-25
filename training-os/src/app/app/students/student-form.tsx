import { Field, Form, Select, Submit, TextArea, type FormAction } from "@/components/form";
import type { students } from "@/db/schema";

const LEVELS = ["BEPC", "BAC", "BTS", "Licence", "Master", "Doctorat", "Autre"].map((v) => ({ value: v, label: v }));
const SOURCES = ["Facebook", "WhatsApp", "Site web", "Bouche-à-oreille", "Entreprise", "Ancien étudiant", "Salon / événement", "Autre"].map((v) => ({ value: v, label: v }));

export function StudentForm({ action, student }: { action: FormAction; student?: typeof students.$inferSelect }) {
  return (
    <Form action={action} className="card space-y-5 p-5">
      {student && <input type="hidden" name="id" value={student.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="lastName" label="Nom" required defaultValue={student?.lastName} />
        <Field name="firstName" label="Prénom" required defaultValue={student?.firstName} />
        <Field name="matricule" label="Matricule" defaultValue={student?.matricule} hint={student ? undefined : "Laisser vide pour une génération automatique."} />
        <Field name="birthDate" label="Date de naissance" type="date" defaultValue={student?.birthDate} />
        <Field name="phone" label="Téléphone" type="tel" defaultValue={student?.phone} placeholder="+225 07 00 00 00 00" />
        <Field name="email" label="Email" type="email" defaultValue={student?.email} />
        <Field name="address" label="Adresse" defaultValue={student?.address} className="sm:col-span-2" />
        <Field name="country" label="Pays" defaultValue={student?.country ?? "Côte d'Ivoire"} />
        <Select name="educationLevel" label="Niveau d'études" options={LEVELS} defaultValue={student?.educationLevel} placeholder="—" />
        <Field name="profession" label="Profession" defaultValue={student?.profession} />
        <Field name="company" label="Entreprise" defaultValue={student?.company} />
        <Select name="leadSource" label="Source du prospect" options={SOURCES} defaultValue={student?.leadSource} placeholder="—" />
      </div>
      <TextArea name="adminNotes" label="Notes administratives" defaultValue={student?.adminNotes} hint="Visible uniquement par l'administration. Ne saisissez pas d'informations sensibles inutiles (santé, religion…)." />
      <div className="flex justify-end">
        <Submit>{student ? "Enregistrer" : "Créer l'étudiant"}</Submit>
      </div>
    </Form>
  );
}
