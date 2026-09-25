import { and, asc, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { saveAssessmentAction, saveGradesAction } from "@/app/shared/pedagogy-actions";
import { Checkbox, Field, Form, Select, Submit, TextArea } from "@/components/form";
import { Badge, Card, Empty } from "@/components/ui";
import { assessmentResults, assessments, courseModules, courseSessions, courses, enrollments, students } from "@/db/schema";
import type { OrgContext } from "@/lib/auth/context";
import { formatDate, LABELS } from "@/lib/format";
import { sessionOptions } from "@/server/lookups";
import { QuizBuilder } from "./quiz-builder";

/** Évaluations & saisie des notes (administration et formateur). */
export async function AssessmentsView({ ctx, allowedSessionIds, assessmentId, mode }: { ctx: OrgContext; allowedSessionIds?: string[]; assessmentId?: string; mode?: string }) {
  const data = await ctx.db(async (tx) => {
    const sessions = await sessionOptions(tx, ctx.orgId, { ids: allowedSessionIds });
    const sessionIds = sessions.map((s) => s.id);
    const list = sessionIds.length
      ? await tx
          .select({ a: assessments, session: courseSessions.name, course: courses.name })
          .from(assessments)
          .innerJoin(courseSessions, eq(courseSessions.id, assessments.sessionId))
          .innerJoin(courses, eq(courses.id, assessments.courseId))
          .where(and(eq(assessments.organizationId, ctx.orgId), inArray(assessments.sessionId, sessionIds)))
          .orderBy(desc(assessments.date))
      : [];
    const selected = list.find((l) => l.a.id === assessmentId) ?? null;
    let grading: { enrollmentId: string; name: string; score: number | null; feedback: string | null; submitted: boolean }[] = [];
    let modules: { id: string; title: string }[] = [];
    if (selected) {
      const rows = await tx
        .select({ e: enrollments.id, f: students.firstName, l: students.lastName, r: assessmentResults })
        .from(enrollments)
        .innerJoin(students, eq(students.id, enrollments.studentId))
        .leftJoin(assessmentResults, and(eq(assessmentResults.enrollmentId, enrollments.id), eq(assessmentResults.assessmentId, selected.a.id)))
        .where(and(eq(enrollments.sessionId, selected.a.sessionId!), inArray(enrollments.status, ["registered", "active", "completed"])))
        .orderBy(asc(students.lastName));
      grading = rows.map((r) => ({ enrollmentId: r.e, name: `${r.l} ${r.f}`, score: r.r ? Number(r.r.score) : null, feedback: r.r?.feedback ?? null, submitted: !!r.r?.answers }));
      modules = await tx.select({ id: courseModules.id, title: courseModules.title }).from(courseModules).where(eq(courseModules.courseId, selected.a.courseId)).orderBy(courseModules.position);
    }
    return { sessions, list, selected, grading, modules };
  });
  const { sessions, list, selected, grading } = data;

  if (mode === "new" || (selected && mode === "edit")) {
    const a = selected?.a;
    return (
      <Card title={a ? `Modifier — ${a.title}` : "Nouvelle évaluation"}>
        <Form action={saveAssessmentAction}>
          {a && <input type="hidden" name="id" value={a.id} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <Select name="sessionId" label="Session" required options={sessions.map((s) => ({ value: s.id, label: `${s.courseName} — ${s.name}` }))} defaultValue={a?.sessionId} placeholder="Choisir…" />
            <Select name="type" label="Type" required options={Object.entries(LABELS.assessmentType).map(([value, label]) => ({ value, label }))} defaultValue={a?.type ?? "quiz"} />
            <Field name="title" label="Titre" required defaultValue={a?.title} className="sm:col-span-2" />
            <Field name="date" label="Date" type="date" defaultValue={a?.date} />
            <Field name="durationMinutes" label="Durée (minutes)" type="number" min={0} defaultValue={a?.durationMinutes} />
            <Field name="maxScore" label="Note maximale" type="number" min={1} step="0.5" required defaultValue={a?.maxScore ?? 20} />
            <Field name="passScore" label="Seuil de réussite" type="number" min={0} step="0.5" required defaultValue={a?.passScore ?? 10} />
            {data.modules.length > 0 && <Select name="moduleId" label="Module" options={data.modules.map((m) => ({ value: m.id, label: m.title }))} defaultValue={a?.moduleId} placeholder="—" />}
            <div className="flex items-end">
              <Checkbox name="isFinalExam" label="Examen final (condition de certification)" defaultChecked={a?.isFinalExam} />
            </div>
          </div>
          <TextArea name="description" label="Consignes" defaultValue={a?.description} />
          <div>
            <p className="label">Questions en ligne (facultatif — les étudiants répondent depuis leur espace)</p>
            <QuizBuilder initial={a?.questions?.map((q) => ({ question: q.question, options: q.options, answer: q.answer })) ?? null} />
          </div>
          <div className="flex justify-end gap-2">
            <Link href="?" className="btn-ghost">
              Annuler
            </Link>
            <Submit>Enregistrer</Submit>
          </div>
        </Form>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Évaluations" actions={<Link href="?mode=new" className="btn-primary btn-sm">+ Nouvelle</Link>} bodyClassName="p-2 max-h-[75vh] overflow-y-auto">
        {list.length === 0 ? (
          <p className="p-2 text-sm text-slate-500">Aucune évaluation.</p>
        ) : (
          <ul className="space-y-0.5">
            {list.map((l) => (
              <li key={l.a.id}>
                <Link href={`?assessment=${l.a.id}`} className={`block rounded-lg px-2 py-2 text-sm ${l.a.id === selected?.a.id ? "bg-brand-50" : "hover:bg-slate-50"}`}>
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-medium">{l.a.title}</span>
                    <Badge tone={l.a.isFinalExam ? "purple" : "gray"}>{LABELS.assessmentType[l.a.type]}</Badge>
                  </div>
                  <div className="text-xs text-slate-500">
                    {l.session} · {formatDate(l.a.date)}
                    {l.a.questions?.length ? ` · ${l.a.questions.length} QCM en ligne` : ""}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <div className="lg:col-span-2">
        {!selected ? (
          <Empty title="Sélectionnez une évaluation pour saisir les notes" />
        ) : (
          <Card
            title={`${selected.a.title} — notes /${selected.a.maxScore} (réussite ≥ ${selected.a.passScore})`}
            actions={
              <Link href={`?assessment=${selected.a.id}&mode=edit`} className="btn-secondary btn-sm">
                Modifier
              </Link>
            }
          >
            <Form action={saveGradesAction}>
              <input type="hidden" name="assessmentId" value={selected.a.id} />
              <ul className="divide-y divide-slate-100">
                {grading.map((g) => (
                  <li key={g.enrollmentId} className="grid items-center gap-2 py-2 sm:grid-cols-[1fr_7rem_1.2fr]">
                    <span className="text-sm">
                      {g.name} {g.submitted && <Badge tone="blue">en ligne</Badge>}
                      {g.score !== null && (g.score >= selected.a.passScore ? <span className="ml-1 text-emerald-600">✓</span> : <span className="ml-1 text-red-600">✗</span>)}
                    </span>
                    <input name={`score_${g.enrollmentId}`} type="number" step="0.25" min={0} max={selected.a.maxScore} defaultValue={g.score ?? ""} className="input" aria-label={`Note de ${g.name}`} />
                    <input name={`feedback_${g.enrollmentId}`} defaultValue={g.feedback ?? ""} placeholder="Appréciation" className="input" />
                  </li>
                ))}
              </ul>
              {grading.length > 0 && (
                <p className="text-xs text-slate-500">
                  Moyenne actuelle :{" "}
                  {(() => {
                    const s = grading.filter((g) => g.score !== null);
                    return s.length ? `${(s.reduce((a, g) => a + g.score!, 0) / s.length).toFixed(2)} / ${selected.a.maxScore} — réussite ${Math.round((s.filter((g) => g.score! >= selected.a.passScore).length / s.length) * 100)} %` : "—";
                  })()}
                </p>
              )}
              <div className="flex justify-end">
                <Submit>Enregistrer les notes</Submit>
              </div>
            </Form>
          </Card>
        )}
      </div>
    </div>
  );
}
