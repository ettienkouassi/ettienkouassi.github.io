import { and, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Form, Submit } from "@/components/form";
import { Alert, Card, PageHeader } from "@/components/ui";
import { assessmentResults, assessments } from "@/db/schema";
import { isUuid } from "@/lib/search-params";
import { submitQuizAction } from "../../actions";
import { studentScope } from "../../scope";

export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { ctx, sums } = await studentScope();
  const active = sums.filter((s) => ["registered", "active", "completed"].includes(s.status));
  if (!active.length) notFound();
  const d = await ctx.db(async (tx) => {
    const [a] = await tx.select().from(assessments).where(and(eq(assessments.id, id), inArray(assessments.sessionId, active.map((s) => s.session.id)), eq(assessments.isPublished, true))).limit(1);
    if (!a) return null;
    const [r] = await tx.select().from(assessmentResults).where(and(eq(assessmentResults.assessmentId, a.id), inArray(assessmentResults.enrollmentId, active.map((s) => s.enrollmentId)))).limit(1);
    return { a, r };
  });
  if (!d || !d.a.questions?.length) notFound();
  const { a, r } = d;
  const questions = a.questions!;
  return (
    <>
      <PageHeader title={a.title} subtitle={a.description ?? undefined} actions={<Link href="/student/exercises" className="btn-ghost">← Retour</Link>} />
      {r ? (
        <Card>
          <Alert tone={r.passed ? "green" : "amber"} title={`Votre note : ${r.score} / ${a.maxScore}`}>
            {r.feedback}
          </Alert>
          <ol className="mt-4 space-y-3">
            {questions.map((q, i) => {
              const given = r.answers?.[i];
              const ok = given === q.answer;
              return (
                <li key={q.id} className="text-sm">
                  <div className="font-medium">
                    {i + 1}. {q.question}
                  </div>
                  <div className={ok ? "text-emerald-700" : "text-red-600"}>
                    Votre réponse : {given !== undefined && given >= 0 ? q.options[given] : "—"} {ok ? "✓" : `✗ (bonne réponse : ${q.options[q.answer]})`}
                  </div>
                </li>
              );
            })}
          </ol>
          <Link href="/student/assistant" className="btn-secondary mt-4">
            🤖 Demander à l&apos;assistant d&apos;expliquer mes erreurs
          </Link>
        </Card>
      ) : (
        <Form action={submitQuizAction} confirm="Valider vos réponses ? Vous ne pourrez plus les modifier.">
          <input type="hidden" name="assessmentId" value={a.id} />
          {questions.map((q, i) => (
            <Card key={q.id} title={`${i + 1}. ${q.question}`}>
              <div className="space-y-2">
                {q.options.map((o, k) => (
                  <label key={k} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm hover:bg-slate-50">
                    <input type="radio" name={`q_${q.id}`} value={k} required />
                    {o}
                  </label>
                ))}
              </div>
            </Card>
          ))}
          <div className="flex justify-end">
            <Submit>Valider mes réponses</Submit>
          </div>
        </Form>
      )}
    </>
  );
}
