"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ImportState } from "./actions";

type Act = (s: ImportState, fd: FormData) => Promise<ImportState>;
const FIELDS: [string, string, boolean][] = [
  ["lastName", "Nom", true],
  ["firstName", "Prénom", true],
  ["fullName", "Nom complet (si une seule colonne)", false],
  ["phone", "Téléphone", false],
  ["email", "Email", false],
  ["matricule", "Matricule", false],
  ["birthDate", "Date de naissance", false],
  ["profession", "Profession", false],
  ["company", "Entreprise", false],
  ["educationLevel", "Niveau d'études", false],
  ["course", "Formation", false],
  ["session", "Session", false],
  ["amount", "Montant (prix)", false],
  ["amountPaid", "Montant déjà payé", false],
];

function Btn({ children, className = "btn-primary", name, value }: { children: React.ReactNode; className?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending} name={name} value={value}>
      {pending ? "Traitement…" : children}
    </button>
  );
}

export function ImportWizard({ analyze, commit, aiAvailable }: { analyze: Act; commit: Act; aiAvailable: boolean }) {
  const [a, analyzeAction] = useActionState(analyze, {});
  const [c, commitAction] = useActionState(commit, {});
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const current = { ...(a.mapping ?? {}), ...mapping } as Record<string, number>;

  const withFile = (fn: (fd: FormData) => void) => (fd: FormData) => {
    if (file) fd.set("file", file);
    fd.set("mapping", JSON.stringify(current));
    fn(fd);
  };

  if (c.done)
    return (
      <div className="card space-y-2 p-5">
        <h2 className="text-lg font-semibold text-emerald-700">✓ Import terminé</h2>
        <p className="text-sm">
          {c.done.created} étudiant(s) créé(s), {c.done.skipped} déjà existant(s), {c.done.enrollments} inscription(s), {c.done.payments} paiement(s).
        </p>
        {c.done.messages.length > 0 && (
          <ul className="max-h-60 list-disc overflow-y-auto pl-5 text-xs text-slate-600">
            {c.done.messages.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        )}
        <a href="/app/students" className="btn-primary">
          Voir les étudiants
        </a>
      </div>
    );

  return (
    <div className="space-y-4">
      <form action={withFile(analyzeAction)} className="card space-y-3 p-5">
        <h2 className="font-semibold">1. Charger le fichier</h2>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.csv"
          required={!file}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setMapping({});
          }}
          className="block text-sm"
        />
        <p className="text-xs text-slate-500">Excel (.xlsx) ou CSV, 5 Mo et 5 000 lignes maximum. Exemple de colonnes : Nom | Prénom | Téléphone | Email | Formation | Montant</p>
        <div className="flex flex-wrap gap-2">
          <Btn>2. Analyser les colonnes</Btn>
          {aiAvailable && (
            <Btn className="btn-secondary" name="useAi" value="1">
              🤖 Analyser avec l&apos;IA
            </Btn>
          )}
        </div>
        {a.error && <p className="text-sm text-red-600">{a.error}</p>}
      </form>

      {a.headers && (
        <form action={withFile(commitAction)} className="space-y-4">
          <div className="card p-5">
            <h2 className="font-semibold">3. Correspondance des colonnes {a.aiUsed && <span className="text-xs font-normal text-brand-600">(proposée par l&apos;IA — vérifiez)</span>}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {FIELDS.map(([key, label, req]) => (
                <label key={key} className="text-sm">
                  <span className="label">
                    {label} {req && <span className="text-red-500">*</span>}
                  </span>
                  <select className="input" value={current[key] ?? -1} onChange={(e) => setMapping({ ...current, [key]: Number(e.target.value) })}>
                    <option value={-1}>— ignorer —</option>
                    {a.headers!.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Colonne ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <button type="button" className="btn-secondary btn-sm mt-3" onClick={() => fileRef.current?.form?.requestSubmit()}>
              Recalculer l&apos;aperçu avec cette correspondance
            </button>
            {a.courses && a.courses.length > 0 && <p className="mt-2 text-xs text-slate-500">Formations reconnues : {a.courses.join(", ")}</p>}
          </div>
          <div className="card overflow-x-auto p-5">
            <h2 className="font-semibold">
              4–5. Aperçu et erreurs — {a.total} ligne(s), <span className={a.errorCount ? "text-red-600" : "text-emerald-600"}>{a.errorCount} en erreur</span>
            </h2>
            <table className="table mt-3">
              <thead>
                <tr>
                  <th>Ligne</th>
                  <th>Nom</th>
                  <th>Prénom</th>
                  <th>Téléphone</th>
                  <th>Email</th>
                  <th>Formation</th>
                  <th>Montant</th>
                  <th>Contrôle</th>
                </tr>
              </thead>
              <tbody>
                {a.preview!.map((r) => (
                  <tr key={r.line} className={r.errors.length ? "bg-red-50" : ""}>
                    <td>{r.line}</td>
                    <td>{r.values.lastName}</td>
                    <td>{r.values.firstName}</td>
                    <td>{r.values.phone}</td>
                    <td>{r.values.email}</td>
                    <td>{r.values.course}</td>
                    <td>{r.values.amount}</td>
                    <td className="text-xs">
                      {r.errors.map((e) => (
                        <div key={e} className="text-red-600">
                          ✗ {e}
                        </div>
                      ))}
                      {r.warnings.map((e) => (
                        <div key={e} className="text-amber-700">
                          ⚠ {e}
                        </div>
                      ))}
                      {!r.errors.length && !r.warnings.length && <span className="text-emerald-600">OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {a.total! > 50 && <p className="mt-2 text-xs text-slate-500">Aperçu limité aux 50 premières lignes.</p>}
          </div>
          <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
            <p className="text-sm">6. Confirmez : les lignes en erreur seront ignorées, les étudiants déjà existants (même email/téléphone) ne seront pas dupliqués.</p>
            <Btn>7. Importer {a.total! - (a.errorCount ?? 0)} ligne(s)</Btn>
          </div>
          {c.error && <p className="text-sm text-red-600">{c.error}</p>}
        </form>
      )}
    </div>
  );
}
