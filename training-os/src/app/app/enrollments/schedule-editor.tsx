"use client";

import { useState } from "react";
import { Form, Submit, type FormAction } from "@/components/form";

type Row = { label: string; dueDate: string; amount: number };

export function ScheduleEditor({ action, enrollmentId, initial, total }: { action: FormAction; enrollmentId: string; initial: Row[]; total: number }) {
  const [rows, setRows] = useState<Row[]>(initial.length ? initial : [{ label: "Inscription", dueDate: new Date().toISOString().slice(0, 10), amount: total }]);
  const sum = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <Form action={action} className="space-y-3">
      <input type="hidden" name="enrollmentId" value={enrollmentId} />
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_9rem_8rem_auto] gap-2">
            <input name="label[]" required className="input" value={r.label} onChange={(e) => set(i, { label: e.target.value })} aria-label="Libellé" />
            <input name="dueDate[]" type="date" required className="input" value={r.dueDate} onChange={(e) => set(i, { dueDate: e.target.value })} aria-label="Date" />
            <input name="amount[]" type="number" min={1} required className="input" value={r.amount} onChange={(e) => set(i, { amount: Number(e.target.value) })} aria-label="Montant" />
            <button type="button" className="btn-ghost btn-sm text-red-600" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Supprimer">
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => setRows([...rows, { label: `Échéance ${rows.length + 1}`, dueDate: rows.at(-1)?.dueDate ?? new Date().toISOString().slice(0, 10), amount: Math.max(1, total - sum) }])}
        >
          + Échéance
        </button>
        <span className={`text-sm ${sum === total ? "text-emerald-700" : "text-red-600"}`}>
          Total échéancier : {new Intl.NumberFormat("fr-FR").format(sum)} / {new Intl.NumberFormat("fr-FR").format(total)} FCFA
        </span>
        <Submit className="btn-secondary btn-sm">Enregistrer l&apos;échéancier</Submit>
      </div>
    </Form>
  );
}
