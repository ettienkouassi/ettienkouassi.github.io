import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EnrollmentStatusBadge, PaymentStatusBadge, RiskBadge, SessionStatusBadge } from "@/components/badges";
import { ActionButton, Field, Form, Submit } from "@/components/form";
import { Card, PageHeader, ProgressBar, Tabs } from "@/components/ui";
import { courses, courseSessions, sessionMeetings } from "@/db/schema";
import { requirePageOrg, STAFF } from "@/lib/auth/context";
import { formatDate, formatMoney } from "@/lib/format";
import { isUuid, readSP, type SP } from "@/lib/search-params";
import { courseOptions, instructorOptions } from "@/server/lookups";
import { orgInfo } from "@/server/metrics";
import { loadEnrollmentSummaries } from "@/server/summaries";
import { addMeetingAction, deleteMeetingAction, saveSessionAction } from "../actions";
import { SessionForm } from "../session-form";

export default async function SessionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { get } = await readSP(searchParams);
  const tab = get("tab") || "students";
  const ctx = await requirePageOrg(STAFF, "sessions.write");
  const data = await ctx.db(async (tx) => {
    const [row] = await tx
      .select({ s: courseSessions, c: courses })
      .from(courseSessions)
      .innerJoin(courses, eq(courses.id, courseSessions.courseId))
      .where(and(eq(courseSessions.id, id), eq(courseSessions.organizationId, ctx.orgId)))
      .limit(1);
    if (!row) return null;
    const org = await orgInfo(tx, ctx.orgId);
    const sums = await loadEnrollmentSummaries(tx, ctx.orgId, { sessionIds: [id] }, org.timezone);
    const meetings = await tx.select().from(sessionMeetings).where(eq(sessionMeetings.sessionId, id)).orderBy(asc(sessionMeetings.date), asc(sessionMeetings.startTime));
    return { ...row, sums, meetings, courses: await courseOptions(tx, ctx.orgId), instructors: await instructorOptions(tx, ctx.orgId) };
  });
  if (!data) notFound();
  const { s, c, sums, meetings } = data;
  const active = sums.filter((x) => !["cancelled", "dropped", "prospect"].includes(x.status));

  return (
    <>
      <PageHeader
        title={s.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <SessionStatusBadge value={s.status} />
            <Link className="link" href={`/app/courses/${c.id}`}>
              {c.name}
            </Link>
            · {formatDate(s.startDate)} → {formatDate(s.endDate)} · {s.days} {s.startTime?.slice(0, 5)} · {s.room}
          </span>
        }
        actions={
          <>
            <Link href={`/app/attendance?session=${s.id}`} className="btn-secondary">
              ✅ Présences
            </Link>
            <Link href={`/app/enrollments/new?session=${s.id}`} className="btn-primary">
              + Inscrire un étudiant
            </Link>
          </>
        }
      />
      <div className="mb-4 max-w-md">
        <div className="mb-1 text-xs text-slate-500">
          Remplissage : {active.length}/{s.capacity}
        </div>
        <ProgressBar value={(active.length / s.capacity) * 100} tone="blue" />
      </div>
      <Tabs
        active={tab}
        tabs={[
          { key: "students", label: `Étudiants (${active.length})`, href: "?tab=students" },
          { key: "meetings", label: `Séances (${meetings.length})`, href: "?tab=meetings" },
          { key: "edit", label: "Modifier", href: "?tab=edit" },
        ]}
      />
      {tab === "edit" && <SessionForm action={saveSessionAction} session={s} courses={data.courses} instructors={data.instructors} />}
      {tab === "meetings" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Séances" className="lg:col-span-2" bodyClassName="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Horaire</th>
                  <th>Sujet</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {meetings.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap">{formatDate(m.date, { weekday: "short", day: "2-digit", month: "short" })}</td>
                    <td className="text-xs">
                      {m.startTime?.slice(0, 5)}–{m.endTime?.slice(0, 5)}
                    </td>
                    <td>{m.topic ?? "—"}</td>
                    <td className="text-right">
                      <Link href={`/app/attendance?session=${s.id}&meeting=${m.id}`} className="link mr-2 text-xs">
                        Présences
                      </Link>
                      <ActionButton action={deleteMeetingAction} hidden={{ id: m.id }} className="btn-ghost btn-sm text-red-600" confirm="Supprimer cette séance ?">
                        ✕
                      </ActionButton>
                    </td>
                  </tr>
                ))}
                {meetings.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center text-slate-500">
                      Aucune séance planifiée.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
          <Card title="Ajouter une séance">
            <Form action={addMeetingAction} resetOnSuccess>
              <input type="hidden" name="sessionId" value={s.id} />
              <Field name="date" label="Date" type="date" required />
              <div className="grid grid-cols-2 gap-2">
                <Field name="startTime" label="Début" type="time" defaultValue={s.startTime?.slice(0, 5)} />
                <Field name="endTime" label="Fin" type="time" defaultValue={s.endTime?.slice(0, 5)} />
              </div>
              <Field name="topic" label="Sujet" />
              <Submit className="btn-secondary w-full">Ajouter</Submit>
            </Form>
          </Card>
        </div>
      )}
      {tab === "students" && (
        <Card bodyClassName="overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Étudiant</th>
                <th>Statut</th>
                <th className="min-w-32">Progression</th>
                <th className="num">Présence</th>
                <th className="num">Moyenne</th>
                <th className="num">Reste à payer</th>
                <th>Paiement</th>
                <th>Suivi</th>
              </tr>
            </thead>
            <tbody>
              {sums.map((x) => (
                <tr key={x.enrollmentId}>
                  <td>
                    <Link className="link" href={`/app/students/${x.student.id}`}>
                      {x.student.lastName} {x.student.firstName}
                    </Link>
                    <div className="font-mono text-xs text-slate-400">{x.student.matricule}</div>
                  </td>
                  <td>
                    <EnrollmentStatusBadge value={x.status} />
                  </td>
                  <td>
                    <ProgressBar value={x.progress.global} />
                  </td>
                  <td className="num">{x.attendance.rate === null ? "—" : `${x.attendance.rate} %`}</td>
                  <td className="num">{x.averageGrade === null ? "—" : `${x.averageGrade} %`}</td>
                  <td className="num">
                    <Link className="link" href={`/app/enrollments/${x.enrollmentId}`}>
                      {formatMoney(x.balance.remaining)}
                    </Link>
                  </td>
                  <td>
                    <PaymentStatusBadge value={x.balance.status} />
                  </td>
                  <td>
                    <RiskBadge level={x.risk.level} />
                  </td>
                </tr>
              ))}
              {sums.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-slate-500">
                    Aucun inscrit.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
