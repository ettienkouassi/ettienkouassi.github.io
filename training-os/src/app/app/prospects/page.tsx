import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { Card, PageHeader, Stat } from "@/components/ui";
import { courses, prospects } from "@/db/schema";
import { requirePageOrg, STAFF } from "@/lib/auth/context";
import { formatDate, LABELS, todayISO } from "@/lib/format";
import { courseOptions } from "@/server/lookups";
import { ProspectForm } from "./prospect-form";

export const metadata = { title: "Prospects" };
const PIPELINE = ["new", "contacted", "interested", "offer_sent", "preregistered", "enrolled", "client"] as const;

export default async function ProspectsPage() {
  const ctx = await requirePageOrg(STAFF, "prospects.write");
  const { list, cs } = await ctx.db(async (tx) => ({
    list: await tx.select({ p: prospects, course: courses.name }).from(prospects).leftJoin(courses, eq(courses.id, prospects.desiredCourseId)).where(eq(prospects.organizationId, ctx.orgId)).orderBy(desc(prospects.updatedAt)),
    cs: await courseOptions(tx, ctx.orgId),
  }));
  const today = todayISO();
  const won = list.filter((l) => ["enrolled", "client"].includes(l.p.status)).length;
  const bySource = Object.entries(list.reduce<Record<string, number>>((a, l) => ((a[l.p.source ?? "—"] = (a[l.p.source ?? "—"] ?? 0) + 1), a), {})).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <PageHeader title="Prospects (CRM)" subtitle="Suivi des prospects avant leur inscription." />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Prospects" value={list.length} />
        <Stat label="Convertis" value={won} tone="good" />
        <Stat label="Taux de conversion" value={list.length ? `${Math.round((won / list.length) * 100)} %` : "—"} />
        <Stat label="À relancer" value={list.filter((l) => l.p.nextActionAt && l.p.nextActionAt <= today && !["enrolled", "client", "lost"].includes(l.p.status)).length} tone="warn" />
      </div>
      <div className="grid gap-4 xl:grid-cols-4">
        <div className="xl:col-span-3">
          <div className="flex gap-3 overflow-x-auto pb-2">
            {PIPELINE.map((st) => {
              const items = list.filter((l) => l.p.status === st);
              return (
                <section key={st} className="w-64 shrink-0 rounded-xl bg-slate-100 p-2">
                  <h2 className="mb-2 flex justify-between px-1 text-xs font-semibold uppercase text-slate-600">
                    {LABELS.prospectStatus[st]} <span>{items.length}</span>
                  </h2>
                  <ul className="space-y-2">
                    {items.map(({ p, course }) => (
                      <li key={p.id} className="rounded-lg bg-white p-2.5 text-sm shadow-sm">
                        <Link href={`/app/prospects/${p.id}`} className="font-medium hover:underline">
                          {p.firstName} {p.lastName}
                        </Link>
                        <div className="text-xs text-slate-500">{course ?? "Formation non précisée"}</div>
                        {p.nextAction && (
                          <div className={`mt-1 text-xs ${p.nextActionAt && p.nextActionAt <= today ? "font-medium text-amber-700" : "text-slate-500"}`}>
                            → {p.nextAction} {p.nextActionAt ? `(${formatDate(p.nextActionAt, { day: "2-digit", month: "short" })})` : ""}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500">Perdus : {list.filter((l) => l.p.status === "lost").length}</p>
        </div>
        <div className="space-y-4">
          <Card title="Nouveau prospect">
            <ProspectForm courses={cs} />
          </Card>
          <Card title="Sources">
            <ul className="space-y-1 text-sm">
              {bySource.map(([s, n]) => (
                <li key={s} className="flex justify-between">
                  <span>{s}</span>
                  <span className="tabular-nums">{n}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
