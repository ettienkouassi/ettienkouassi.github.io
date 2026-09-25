import { Card, Empty, PageHeader, ProgressBar } from "@/components/ui";
import { studentScope } from "../scope";

export const metadata = { title: "Ma progression" };

export default async function Page() {
  const { sums } = await studentScope();
  if (!sums.length) return <Empty title="Aucune formation" />;
  return (
    <>
      <PageHeader title="Ma progression" subtitle="Calculée à partir de la présence, des modules terminés et des évaluations." />
      <div className="space-y-4">
        {sums.map((s) => (
          <Card key={s.enrollmentId} title={`Formation : ${s.course.name}`}>
            <ul className="space-y-2">
              {s.modules.map((m) => (
                <li key={m.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] items-center gap-3 text-sm">
                  <span className="truncate">
                    Module {m.position} — {m.title}
                  </span>
                  <ProgressBar value={m.percent} tone="blue" />
                </li>
              ))}
            </ul>
            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="mb-1 text-sm font-semibold">Progression globale</div>
              <ProgressBar value={s.progress.global} />
              <p className="mt-2 text-xs text-slate-500">
                Présence : {s.progress.attendance ?? "—"} % · Modules : {s.progress.modules ?? "—"} % · Évaluations : {s.progress.assessments ?? "—"} %
              </p>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
