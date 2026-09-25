import { Field, Form, Select, Submit, TextArea } from "@/components/form";
import type { prospects } from "@/db/schema";
import { LABELS } from "@/lib/format";
import { saveProspectAction } from "./actions";

export function ProspectForm({ p, courses }: { p?: typeof prospects.$inferSelect; courses: { id: string; name: string }[] }) {
  return (
    <Form action={saveProspectAction} resetOnSuccess={!p}>
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="lastName" label="Nom" required defaultValue={p?.lastName} />
        <Field name="firstName" label="Prénom" required defaultValue={p?.firstName} />
        <Field name="phone" label="Téléphone" type="tel" defaultValue={p?.phone} />
        <Field name="email" label="Email" type="email" defaultValue={p?.email} />
        <Select name="desiredCourseId" label="Formation souhaitée" options={courses.map((c) => ({ value: c.id, label: c.name }))} defaultValue={p?.desiredCourseId} placeholder="—" />
        <Field name="source" label="Source" defaultValue={p?.source} placeholder="Facebook, WhatsApp…" />
        <Select name="status" label="Statut" required options={Object.entries(LABELS.prospectStatus).map(([value, label]) => ({ value, label }))} defaultValue={p?.status ?? "new"} />
        <Field name="nextActionAt" label="Date de prochaine action" type="date" defaultValue={p?.nextActionAt} />
        <Field name="nextAction" label="Prochaine action" defaultValue={p?.nextAction} className="sm:col-span-2" />
      </div>
      <TextArea name="notes" label="Notes" defaultValue={p?.notes} rows={2} />
      <Submit className="btn-primary w-full">{p ? "Enregistrer" : "Ajouter le prospect"}</Submit>
    </Form>
  );
}
