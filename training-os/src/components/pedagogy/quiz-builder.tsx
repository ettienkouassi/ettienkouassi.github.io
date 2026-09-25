"use client";

import { useState } from "react";

type Q = { question: string; options: string[]; answer: number };

/** Éditeur de questions à choix multiples ; sérialise en JSON dans un champ caché. */
export function QuizBuilder({ initial }: { initial?: Q[] | null }) {
  const [qs, setQs] = useState<Q[]>(initial ?? []);
  const upd = (i: number, patch: Partial<Q>) => setQs(qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  return (
    <div className="space-y-3">
      <input type="hidden" name="questionsJson" value={qs.length ? JSON.stringify(qs) : ""} />
      {qs.map((q, i) => (
        <div key={i} className="rounded-lg border border-slate-200 p-3">
          <div className="flex gap-2">
            <input className="input" placeholder={`Question ${i + 1}`} value={q.question} onChange={(e) => upd(i, { question: e.target.value })} />
            <button type="button" className="btn-ghost btn-sm text-red-600" onClick={() => setQs(qs.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
          <div className="mt-2 space-y-1">
            {q.options.map((o, k) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input type="radio" checked={q.answer === k} onChange={() => upd(i, { answer: k })} title="Bonne réponse" />
                <input className="input py-1" value={o} placeholder={`Réponse ${k + 1}`} onChange={(e) => upd(i, { options: q.options.map((x, m) => (m === k ? e.target.value : x)) })} />
              </label>
            ))}
            {q.options.length < 6 && (
              <button type="button" className="link text-xs" onClick={() => upd(i, { options: [...q.options, ""] })}>
                + réponse
              </button>
            )}
          </div>
        </div>
      ))}
      <button type="button" className="btn-secondary btn-sm" onClick={() => setQs([...qs, { question: "", options: ["", ""], answer: 0 }])}>
        + Question (QCM corrigé automatiquement)
      </button>
    </div>
  );
}
