"use client";

import { useState } from "react";
import { Field, Form, Select, Submit, TextArea, type FormAction } from "@/components/form";

type Opt = { id: string; label: string };
type SessionOpt = { id: string; label: string; price: number; courseId: string };

export function EnrollmentForm({
  action,
  students,
  sessions,
  defaults,
  today,
}: {
  action: FormAction;
  students: Opt[];
  sessions: SessionOpt[];
  defaults: { studentId?: string; sessionId?: string; prospectId?: string };
  today: string;
}) {
  const initial = sessions.find((s) => s.id === defaults.sessionId);
  const [price, setPrice] = useState<number>(initial?.price ?? 0);
  const [discount, setDiscount] = useState<number>(0);
  const [installments, setInstallments] = useState<number>(3);
  const net = Math.max(0, price - discount);
  const per = installments > 0 ? Math.floor(net / installments) : net;
  return (
    <Form action={action} className="card space-y-4 p-5">
      {defaults.prospectId && <input type="hidden" name="prospectId" value={defaults.prospectId} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Select name="studentId" label="1. Étudiant" required options={students.map((s) => ({ value: s.id, label: s.label }))} defaultValue={defaults.studentId} placeholder="Choisir un étudiant…" />
        <div>
          <label className="label" htmlFor="f-sessionId">
            2–3. Formation et session <span className="text-red-500">*</span>
          </label>
          <select
            id="f-sessionId"
            name="sessionId"
            required
            className="input"
            defaultValue={defaults.sessionId ?? ""}
            onChange={(e) => setPrice(sessions.find((s) => s.id === e.target.value)?.price ?? 0)}
          >
            <option value="">Choisir une session…</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-agreedPrice">
            4. Prix (FCFA) <span className="text-red-500">*</span>
          </label>
          <input id="f-agreedPrice" name="agreedPrice" type="number" min={0} required className="input" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
        </div>
        <div>
          <label className="label" htmlFor="f-discount">
            Remise (FCFA)
          </label>
          <input id="f-discount" name="discount" type="number" min={0} className="input" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
        </div>
      </div>
      <fieldset className="rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-medium">5. Modalités de paiement</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="f-installments">
              Nombre de versements
            </label>
            <input id="f-installments" name="installments" type="number" min={1} max={24} className="input" value={installments} onChange={(e) => setInstallments(Math.max(1, Number(e.target.value)))} />
          </div>
          <Field name="firstDueDate" label="1re échéance" type="date" required defaultValue={today} />
          <Field name="intervalDays" label="Intervalle (jours)" type="number" min={1} defaultValue={30} />
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Montant dû : <strong>{new Intl.NumberFormat("fr-FR").format(net)} FCFA</strong>
          {installments > 1 && <> — environ {new Intl.NumberFormat("fr-FR").format(per)} FCFA par versement (ajustable ensuite)</>}
        </p>
        <Field name="paymentTerms" label="Conditions (texte libre)" className="mt-3" placeholder="Ex. : inscription + 2 mensualités" />
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          name="status"
          label="Statut"
          required
          defaultValue="registered"
          options={[
            { value: "preregistered", label: "Préinscrit" },
            { value: "registered", label: "Inscrit" },
            { value: "active", label: "Actif" },
          ]}
        />
      </div>
      <TextArea name="notes" label="Notes" />
      <div className="flex justify-end">
        <Submit>6. Enregistrer l&apos;inscription</Submit>
      </div>
    </Form>
  );
}
