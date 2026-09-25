import { Field, Form, Select, Submit, type FormAction } from "@/components/form";
import type { courseSessions } from "@/db/schema";
import { LABELS } from "@/lib/format";
import { WEEKDAYS } from "@/lib/domain/schedule";

export function SessionForm({
  action,
  session,
  courses,
  instructors,
  defaultCourseId,
}: {
  action: FormAction;
  session?: typeof courseSessions.$inferSelect;
  courses: { id: string; name: string }[];
  instructors: { id: string; name: string }[];
  defaultCourseId?: string;
}) {
  const s = session;
  const days = s?.days?.split(",").map((d) => d.trim()) ?? [];
  return (
    <Form action={action} className="card space-y-4 p-5">
      {s && <input type="hidden" name="id" value={s.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Select name="courseId" label="Formation" required options={courses.map((c) => ({ value: c.id, label: c.name }))} defaultValue={s?.courseId ?? defaultCourseId} placeholder="Choisir…" />
        <Field name="name" label="Nom de la session" required defaultValue={s?.name} placeholder="Session octobre 2026" />
        <Field name="startDate" label="Date de début" type="date" required defaultValue={s?.startDate} />
        <Field name="endDate" label="Date de fin" type="date" required defaultValue={s?.endDate} />
        <Field name="startTime" label="Heure de début" type="time" defaultValue={s?.startTime?.slice(0, 5)} />
        <Field name="endTime" label="Heure de fin" type="time" defaultValue={s?.endTime?.slice(0, 5)} />
        <Field name="room" label="Salle" defaultValue={s?.room} />
        <Field name="capacity" label="Capacité" type="number" min={1} required defaultValue={s?.capacity ?? 20} />
        <Select name="instructorId" label="Formateur" options={instructors.map((i) => ({ value: i.id, label: i.name }))} defaultValue={s?.instructorId} placeholder="Formateur de la formation" />
        <Select name="status" label="Statut" required options={Object.entries(LABELS.sessionStatus).map(([value, label]) => ({ value, label }))} defaultValue={s?.status ?? "draft"} />
      </div>
      <fieldset>
        <legend className="label">Jours de cours {s ? "" : "(les séances seront générées automatiquement)"}</legend>
        <div className="flex flex-wrap gap-3">
          {WEEKDAYS.map((w) => (
            <label key={w.v} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="days[]" value={w.v} defaultChecked={days.includes(w.label)} className="h-4 w-4 rounded border-slate-300" />
              {w.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex justify-end">
        <Submit>{s ? "Enregistrer" : "Créer la session"}</Submit>
      </div>
    </Form>
  );
}
