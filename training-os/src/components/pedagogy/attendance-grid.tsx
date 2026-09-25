"use client";

import { useState } from "react";
import { Form, Submit, type FormAction } from "@/components/form";

type Status = "present" | "absent" | "late" | "excused";
const OPTIONS: { v: Status; label: string; cls: string }[] = [
  { v: "present", label: "Présent", cls: "peer-checked:bg-emerald-600 peer-checked:text-white" },
  { v: "late", label: "Retard", cls: "peer-checked:bg-amber-500 peer-checked:text-white" },
  { v: "absent", label: "Absent", cls: "peer-checked:bg-red-600 peer-checked:text-white" },
  { v: "excused", label: "Excusé", cls: "peer-checked:bg-slate-600 peer-checked:text-white" },
];

export function AttendanceGrid({
  action,
  meetingId,
  rows,
}: {
  action: FormAction;
  meetingId: string;
  rows: { enrollmentId: string; name: string; matricule: string; status: Status | null; note: string | null; stats: string; alert: boolean }[];
}) {
  const [values, setValues] = useState<Record<string, Status | "">>(Object.fromEntries(rows.map((r) => [r.enrollmentId, r.status ?? ""])));
  return (
    <Form action={action}>
      <input type="hidden" name="meetingId" value={meetingId} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="btn-secondary btn-sm" onClick={() => setValues(Object.fromEntries(rows.map((r) => [r.enrollmentId, "present"])))}>
          ✓ Tous présents
        </button>
        <span className="text-xs text-slate-500">{Object.values(values).filter(Boolean).length}/{rows.length} saisis</span>
      </div>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {rows.map((r) => (
          <li key={r.enrollmentId} className="flex flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="font-medium">
                {r.name} {r.alert && <span title="Absences répétées">⚠️</span>}
              </div>
              <div className="text-xs text-slate-500">
                {r.matricule} · {r.stats}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {OPTIONS.map((o) => (
                <label key={o.v} className="cursor-pointer">
                  <input
                    type="radio"
                    className="peer sr-only"
                    name={`status_${r.enrollmentId}`}
                    value={o.v}
                    checked={values[r.enrollmentId] === o.v}
                    onChange={() => setValues({ ...values, [r.enrollmentId]: o.v })}
                  />
                  <span className={`inline-block rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400 ${o.cls}`}>{o.label}</span>
                </label>
              ))}
              <input name={`note_${r.enrollmentId}`} defaultValue={r.note ?? ""} placeholder="Note" className="input w-32 py-1 text-xs" />
            </div>
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <Submit>Enregistrer les présences</Submit>
      </div>
    </Form>
  );
}
