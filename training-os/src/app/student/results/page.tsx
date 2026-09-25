import { and, eq, inArray } from "drizzle-orm";
import { Badge, Empty, PageHeader, TableWrap } from "@/components/ui";
import { assessmentResults, assessments } from "@/db/schema";
import { formatDate, LABELS } from "@/lib/format";
import { studentScope } from "../scope";

export const metadata = { title: "Mes résultats" };

export default async function Page() {
  const { ctx, sums } = await studentScope();
  const ids = sums.map((s) => s.enrollmentId);
  const rows = ids.length
    ? await ctx.db((tx) =>
        tx
          .select({ r: assessmentResults, a: assessments })
          .from(assessmentResults)
          .innerJoin(assessments, eq(assessments.id, assessmentResults.assessmentId))
          .where(and(inArray(assessmentResults.enrollmentId, ids), eq(assessments.isPublished, true))),
      )
    : [];
  if (!rows.length) return <Empty title="Aucun résultat pour le moment" />;
  return (
    <>
      <PageHeader title="Mes résultats" />
      <TableWrap>
        <table className="table">
          <thead>
            <tr>
              <th>Évaluation</th>
              <th>Type</th>
              <th>Date</th>
              <th className="num">Note</th>
              <th className="num">%</th>
              <th>Résultat</th>
              <th>Appréciation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ r, a }) => (
              <tr key={r.id}>
                <td>{a.title}</td>
                <td>{LABELS.assessmentType[a.type]}</td>
                <td>{formatDate(a.date)}</td>
                <td className="num">
                  {r.score} / {a.maxScore}
                </td>
                <td className="num">{Math.round((r.score / a.maxScore) * 100)} %</td>
                <td>{r.passed ? <Badge tone="green">Réussi</Badge> : <Badge tone="red">Non réussi</Badge>}</td>
                <td className="text-sm text-slate-600">{r.feedback ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <p className="mt-3 text-sm text-slate-600">
        Moyennes :{" "}
        {sums
          .filter((s) => s.averageGrade !== null)
          .map((s) => `${s.course.name} ${s.averageGrade} %`)
          .join(" · ") || "—"}
      </p>
    </>
  );
}
