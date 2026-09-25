import { and, asc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CourseStatusBadge, SessionStatusBadge } from "@/components/badges";
import { ActionButton, Field, Form, Select, Submit } from "@/components/form";
import { Card, DL, PageHeader, Tabs } from "@/components/ui";
import { courseModules, courseRecommendations, courses, courseSessions, enrollments, instructors } from "@/db/schema";
import { requirePageOrg, STAFF } from "@/lib/auth/context";
import { can } from "@/lib/auth/rbac";
import { formatDate, formatMoney } from "@/lib/format";
import { isUuid, readSP, type SP } from "@/lib/search-params";
import { courseOptions, instructorOptions } from "@/server/lookups";
import { addModuleAction, addRecommendationAction, deleteModuleAction, deleteRecommendationAction, moveModuleAction, saveCourseAction } from "../actions";
import { CourseForm } from "../course-form";

export default async function CoursePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { get } = await readSP(searchParams);
  const tab = get("tab") || "overview";
  const ctx = await requirePageOrg(STAFF, "courses.read");
  const canWrite = can(ctx.role, "courses.write");
  const data = await ctx.db(async (tx) => {
    const [c] = await tx.select().from(courses).where(and(eq(courses.id, id), eq(courses.organizationId, ctx.orgId))).limit(1);
    if (!c) return null;
    const mods = await tx.select().from(courseModules).where(eq(courseModules.courseId, id)).orderBy(asc(courseModules.position));
    const sessions = await tx
      .select({ s: courseSessions, n: sql<number>`(select count(*)::int from ${enrollments} e where e.session_id = ${courseSessions.id} and e.status in ('preregistered','registered','active','completed'))` })
      .from(courseSessions)
      .where(eq(courseSessions.courseId, id))
      .orderBy(asc(courseSessions.startDate));
    const recos = await tx
      .select({ r: courseRecommendations, name: courses.name })
      .from(courseRecommendations)
      .innerJoin(courses, eq(courses.id, courseRecommendations.toCourseId))
      .where(eq(courseRecommendations.fromCourseId, id));
    const [instr] = c.instructorId ? await tx.select().from(instructors).where(eq(instructors.id, c.instructorId)) : [];
    return { c, mods, sessions, recos, instr, allCourses: await courseOptions(tx, ctx.orgId), instrOpts: await instructorOptions(tx, ctx.orgId) };
  });
  if (!data) notFound();
  const { c, mods, sessions, recos, instr } = data;

  return (
    <>
      <PageHeader
        title={c.name}
        subtitle={
          <span className="flex items-center gap-2">
            <CourseStatusBadge value={c.status} /> {c.category} · {c.durationHours} h · {formatMoney(c.price, c.currency)}
          </span>
        }
        actions={
          can(ctx.role, "sessions.write") && (
            <Link href={`/app/sessions/new?course=${c.id}`} className="btn-primary">
              + Nouvelle session
            </Link>
          )
        }
      />
      <Tabs
        active={tab}
        tabs={[
          { key: "overview", label: "Vue d'ensemble", href: `?tab=overview` },
          ...(canWrite ? [{ key: "edit", label: "Modifier", href: `?tab=edit` }] : []),
        ]}
      />
      {tab === "edit" && canWrite ? (
        <CourseForm action={saveCourseAction} course={c} instructors={data.instrOpts} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Card title="Informations">
              <DL
                items={[
                  ["Niveau", c.level],
                  ["Formateur", instr ? `${instr.firstName} ${instr.lastName}` : null],
                  ["Places par défaut", c.capacity],
                  ["Page publique", c.isPublic ? "Oui" : "Non"],
                  ["Prérequis", c.prerequisites],
                  ["Objectifs", c.objectives],
                ]}
              />
              {c.description && <p className="mt-4 whitespace-pre-line text-sm text-slate-700">{c.description}</p>}
              {c.program && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-medium">Programme détaillé</summary>
                  <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{c.program}</p>
                </details>
              )}
            </Card>
            <Card title={`Modules (${mods.length})`}>
              <ol className="divide-y divide-slate-100">
                {mods.map((m, i) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span>
                      <span className="mr-2 font-mono text-xs text-slate-400">{m.position}.</span>
                      {m.title} {m.durationHours ? <span className="text-xs text-slate-500">({m.durationHours} h)</span> : null}
                    </span>
                    {canWrite && (
                      <span className="flex gap-1">
                        {i > 0 && (
                          <ActionButton action={moveModuleAction} hidden={{ id: m.id, dir: "up" }} className="btn-ghost btn-sm">
                            ↑
                          </ActionButton>
                        )}
                        {i < mods.length - 1 && (
                          <ActionButton action={moveModuleAction} hidden={{ id: m.id, dir: "down" }} className="btn-ghost btn-sm">
                            ↓
                          </ActionButton>
                        )}
                        <ActionButton action={deleteModuleAction} hidden={{ id: m.id }} className="btn-ghost btn-sm text-red-600" confirm="Supprimer ce module ? La progression associée sera perdue.">
                          ✕
                        </ActionButton>
                      </span>
                    )}
                  </li>
                ))}
              </ol>
              {canWrite && (
                <Form action={addModuleAction} className="mt-3 flex flex-wrap items-end gap-2" resetOnSuccess>
                  <input type="hidden" name="courseId" value={c.id} />
                  <Field name="title" label="Nouveau module" required className="min-w-48 flex-1" />
                  <Field name="durationHours" label="Heures" type="number" min={0} className="w-24" />
                  <Submit className="btn-secondary">Ajouter</Submit>
                </Form>
              )}
            </Card>
          </div>
          <div className="space-y-4">
            <Card title="Sessions">
              {sessions.length === 0 ? (
                <p className="text-sm text-slate-500">Aucune session.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {sessions.map(({ s, n }) => (
                    <li key={s.id} className="flex items-center justify-between gap-2">
                      <Link href={`/app/sessions/${s.id}`} className="link">
                        {s.name}
                        <span className="block text-xs text-slate-500">
                          {formatDate(s.startDate)} · {n}/{s.capacity} inscrits
                        </span>
                      </Link>
                      <SessionStatusBadge value={s.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Certification">
              <ul className="space-y-1 text-sm">
                <li>Présence minimale : {c.certMinAttendance} %</li>
                <li>Moyenne minimale : {c.certMinGrade} %</li>
                {c.certRequireAllModules && <li>Tous les modules terminés</li>}
                {c.certRequireFinalExam && <li>Examen final réussi</li>}
                {c.certRequireFullPayment && <li>Paiement complet</li>}
                <li className="text-slate-500">{c.certAutoIssue ? "Émission automatique" : "Validation administrative"}</li>
              </ul>
            </Card>
            <Card title="Formations suivantes recommandées">
              <ul className="space-y-2 text-sm">
                {recos.map(({ r, name }) => (
                  <li key={r.id} className="flex items-start justify-between gap-2">
                    <span>
                      → {name}
                      {r.reason && <span className="block text-xs text-slate-500">{r.reason}</span>}
                    </span>
                    {canWrite && (
                      <ActionButton action={deleteRecommendationAction} hidden={{ id: r.id }} className="btn-ghost btn-sm text-red-600">
                        ✕
                      </ActionButton>
                    )}
                  </li>
                ))}
                {recos.length === 0 && <li className="text-slate-500">Aucune.</li>}
              </ul>
              {canWrite && (
                <Form action={addRecommendationAction} className="mt-3 space-y-2" resetOnSuccess>
                  <input type="hidden" name="fromCourseId" value={c.id} />
                  <Select name="toCourseId" label="Formation" required options={data.allCourses.filter((x) => x.id !== c.id).map((x) => ({ value: x.id, label: x.name }))} placeholder="Choisir…" />
                  <Field name="reason" label="Raison affichée" placeholder="Suite logique de votre parcours…" />
                  <Submit className="btn-secondary btn-sm">Ajouter</Submit>
                </Form>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
