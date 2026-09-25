import { and, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { assessmentResults, assessments } from "@/db/schema";
import { formatDate, LABELS } from "@/lib/format";
import { studentScope } from "../scope";

export const metadata = { title: "Mes exercices" };

export default async function Page() {
  const { ctx, sums } = await studentScope();
  const active = sums.filter((s) => ["registered", "active", "completed"].includes(s.status));
  const d = active.length
    ? await ctx.db(async (tx) => ({
        list: await tx.select().from(assessments).where(and(inArray(assessments.sessionId, active.map((s) => s.session.id)), eq(assessments.isPublished, true))),
        res: await tx.select().from(assessmentResults).where(inArray(assessmentResults.enrollmentId, active.map((s) => s.enrollmentId))),
      }))
    : { list: [], res: [] };
  if (!d.list.length) return <Empty title="Aucun exercice pour le moment" />;
  return (
    <>
      <PageHeader title="Mes exercices" subtitle="Quiz en ligne corrigés automatiquement, devoirs et examens." />
      <div className="card divide-y divide-slate-100">
        {d.list
          .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
          .map((a) => {
            const r = d.res.find((x) => x.assessmentId === a.id);
            const online = !!a.questions?.length;
            return (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div>
                  <div className="font-medium">{a.title}</div>
                  <div className="text-xs text-slate-500">
                    {LABELS.assessmentType[a.type]} · {formatDate(a.date)} {a.durationMinutes ? `· ${a.durationMinutes} min` : ""} {online ? `· ${a.questions!.length} questions en ligne` : "· à rendre au formateur"}
                  </div>
                </div>
                {r ? (
                  <Badge tone={r.passed ? "green" : "red"}>
                    {r.score}/{a.maxScore}
                  </Badge>
                ) : online ? (
                  <Link href={`/student/exercises/${a.id}`} className="btn-primary btn-sm">
                    Commencer
                  </Link>
                ) : (
                  <Badge>En attente de note</Badge>
                )}
              </div>
            );
          })}
      </div>
    </>
  );
}
