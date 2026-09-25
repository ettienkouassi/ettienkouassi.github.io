import Link from "next/link";

export function Pagination({ page, total, perPage, baseParams }: { page: number; total: number; perPage: number; baseParams: Record<string, string> }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages <= 1) return <p className="mt-3 text-xs text-slate-500">{total} résultat(s)</p>;
  const href = (p: number) => `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(baseParams).filter(([, v]) => v)), page: String(p) })}`;
  return (
    <div className="mt-3 flex items-center justify-between text-sm">
      <span className="text-xs text-slate-500">
        {total} résultat(s) · page {page}/{pages}
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <Link className="btn-secondary btn-sm" href={href(page - 1)}>
            ← Précédent
          </Link>
        )}
        {page < pages && (
          <Link className="btn-secondary btn-sm" href={href(page + 1)}>
            Suivant →
          </Link>
        )}
      </div>
    </div>
  );
}
