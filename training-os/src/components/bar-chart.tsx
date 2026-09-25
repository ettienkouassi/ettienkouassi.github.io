/**
 * Histogramme simple (une seule série) en HTML/CSS : barres fines à extrémité
 * arrondie ancrées sur la ligne de base, espacement de 2px, info-bulle au survol,
 * valeurs en texte (jamais couleur seule). La même donnée est disponible en tableau.
 */
export function BarChart({ data, format, label }: { data: { label: string; value: number }[]; format: (v: number) => string; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure aria-label={label}>
      <div className="flex h-44 items-end gap-0.5 border-b border-slate-300" role="list">
        {data.map((d) => (
          <div key={d.label} role="listitem" className="group relative flex h-full flex-1 flex-col justify-end px-[1px]" title={`${d.label} : ${format(d.value)}`}>
            <div className="pointer-events-none absolute -top-1 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow group-hover:block">
              {d.label} · {format(d.value)}
            </div>
            <div className="mx-auto w-full max-w-10 rounded-t bg-brand-500 transition group-hover:bg-brand-700" style={{ height: `${Math.max(d.value > 0 ? 2 : 0, (d.value / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-0.5 text-[10px] text-slate-500">
        {data.map((d) => (
          <div key={d.label} className="flex-1 truncate text-center">
            {d.label}
          </div>
        ))}
      </div>
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  );
}
