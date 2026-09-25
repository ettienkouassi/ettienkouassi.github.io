import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, formatMoney } from "@/lib/format";
import { publicCenter } from "@/server/public-center";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const c = await publicCenter((await params).slug);
  return c ? { title: `${c.org.name} — Formations`, description: c.org.description ?? undefined } : {};
}

export default async function CenterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await publicCenter(slug);
  if (!c) notFound();
  return (
    <>
      <section className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-900 px-6 py-12 text-white">
        <h1 className="text-3xl font-bold text-white sm:text-4xl">{c.org.name}</h1>
        {c.org.description && <p className="mt-3 max-w-2xl text-brand-100">{c.org.description}</p>}
        <a href="#formations" className="mt-6 inline-block rounded-lg bg-white px-4 py-2 font-medium text-brand-700">
          Voir les formations
        </a>
      </section>
      <h2 id="formations" className="mb-4 mt-10 text-2xl font-semibold">
        Nos formations
      </h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {c.courses.map((co) => {
          const next = c.sessions.find((s) => s.s.courseId === co.id);
          return (
            <Link key={co.id} href={`/c/${slug}/courses/${co.slug}`} className="card flex flex-col p-5 transition hover:border-brand-300 hover:shadow">
              <div className="text-xs uppercase tracking-wide text-brand-600">{co.category}</div>
              <h3 className="mt-1 text-lg font-semibold">{co.name}</h3>
              <p className="mt-2 line-clamp-3 flex-1 text-sm text-slate-600">{co.description}</p>
              <div className="mt-4 flex items-end justify-between text-sm">
                <span>
                  {co.durationHours} h · {co.level}
                  <span className="block text-xs text-slate-500">{next ? `Prochaine session : ${formatDate(next.s.startDate)}` : "Sessions à venir"}</span>
                </span>
                <span className="font-semibold text-brand-700">{formatMoney(co.price, co.currency)}</span>
              </div>
            </Link>
          );
        })}
      </div>
      {c.sessions.length > 0 && (
        <>
          <h2 className="mb-4 mt-10 text-2xl font-semibold">Prochaines sessions</h2>
          <div className="card divide-y divide-slate-100">
            {c.sessions.slice(0, 10).map(({ s, taken }) => {
              const co = c.courses.find((x) => x.id === s.courseId)!;
              const left = Math.max(0, s.capacity - taken);
              return (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                  <div>
                    <div className="font-medium">{co.name}</div>
                    <div className="text-sm text-slate-500">
                      {formatDate(s.startDate)} → {formatDate(s.endDate)} · {s.days} {s.startTime?.slice(0, 5)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm ${left ? "text-emerald-700" : "text-red-600"}`}>{left ? `${left} place(s)` : "Complet"}</span>
                    {left > 0 && (
                      <Link href={`/c/${slug}/courses/${co.slug}?session=${s.id}#inscription`} className="btn-primary btn-sm">
                        S&apos;inscrire
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
