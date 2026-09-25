import { Checkbox, Field, Form, Select, Submit, TextArea, type FormAction } from "@/components/form";
import type { courses } from "@/db/schema";

export function CourseForm({ action, course, instructors }: { action: FormAction; course?: typeof courses.$inferSelect; instructors: { id: string; name: string }[] }) {
  const c = course;
  return (
    <Form action={action} className="space-y-6">
      {c && <input type="hidden" name="id" value={c.id} />}
      <div className="card space-y-4 p-5">
        <h2 className="font-semibold">Informations</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="name" label="Nom de la formation" required defaultValue={c?.name} className="sm:col-span-2" />
          <Field name="category" label="Catégorie" defaultValue={c?.category} placeholder="Bureautique, Data…" />
          <Field name="level" label="Niveau" defaultValue={c?.level} placeholder="Débutant, Intermédiaire…" />
          <Field name="durationHours" label="Durée (heures)" type="number" min={0} required defaultValue={c?.durationHours ?? 0} />
          <Field name="price" label="Prix (FCFA)" type="number" min={0} step={1} required defaultValue={c?.price ?? 0} />
          <Field name="capacity" label="Nombre de places par défaut" type="number" min={1} defaultValue={c?.capacity} />
          <Select name="instructorId" label="Formateur principal" options={instructors.map((i) => ({ value: i.id, label: i.name }))} defaultValue={c?.instructorId} placeholder="—" />
          <Select
            name="status"
            label="Statut"
            required
            defaultValue={c?.status ?? "draft"}
            options={[
              { value: "draft", label: "Brouillon" },
              { value: "published", label: "Publiée" },
              { value: "archived", label: "Archivée" },
            ]}
          />
          <div className="flex items-end">
            <Checkbox name="isPublic" label="Afficher sur la page publique du centre" defaultChecked={c?.isPublic} />
          </div>
        </div>
        <TextArea name="description" label="Description" defaultValue={c?.description} />
        <TextArea name="objectives" label="Objectifs" defaultValue={c?.objectives} />
        <TextArea name="prerequisites" label="Prérequis" defaultValue={c?.prerequisites} rows={2} />
        <TextArea name="program" label="Programme détaillé" defaultValue={c?.program} rows={5} />
      </div>
      <div className="card space-y-4 p-5">
        <h2 className="font-semibold">Conditions de certification</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="certMinAttendance" label="Présence minimale (%)" type="number" min={0} max={100} required defaultValue={c?.certMinAttendance ?? 75} />
          <Field name="certMinGrade" label="Moyenne minimale (%)" type="number" min={0} max={100} required defaultValue={c?.certMinGrade ?? 50} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Checkbox name="certRequireAllModules" label="Tous les modules terminés" defaultChecked={c?.certRequireAllModules} />
          <Checkbox name="certRequireFinalExam" label="Examen final réussi" defaultChecked={c?.certRequireFinalExam} />
          <Checkbox name="certRequireFullPayment" label="Paiement complet exigé" defaultChecked={c?.certRequireFullPayment} />
          <Checkbox name="certAutoIssue" label="Émission automatique (sinon validation administrative)" defaultChecked={c?.certAutoIssue} />
        </div>
      </div>
      <div className="card space-y-4 p-5">
        <h2 className="font-semibold">Calcul de la progression (pondération, total = 100)</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field name="weightAttendance" label="Présence" type="number" min={0} max={100} required defaultValue={c?.weightAttendance ?? 30} />
          <Field name="weightModules" label="Modules terminés" type="number" min={0} max={100} required defaultValue={c?.weightModules ?? 30} />
          <Field name="weightAssessments" label="Évaluations" type="number" min={0} max={100} required defaultValue={c?.weightAssessments ?? 40} />
        </div>
      </div>
      <div className="flex justify-end">
        <Submit>{c ? "Enregistrer" : "Créer la formation"}</Submit>
      </div>
    </Form>
  );
}
