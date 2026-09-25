import { asc, eq, inArray } from "drizzle-orm";
import { SessionStatusBadge } from "@/components/badges";
import { Card, Empty, PageHeader, ProgressBar } from "@/components/ui";
import { courseModules, courseSessions, courses, sessionMeetings } from "@/db/schema";
import { formatDate } from "@/lib/format";
import { readSP, type SP } from "@/lib/search-params";
import { orgInfo } from "@/server/metrics";
import { loadEnrollmentSummaries } from "@/server/summaries";
import { instructorScope } from "../scope";

export const metadata = { title: "Mes sessions" };

export default async function InstructorSessions({ searchParams }: { searchParams: SP }) {
  const { ctx, sessionIds } = await instructorScope();
  const { get } = await readSP(searchParams);
  const d = await ctx.db(async (tx) => {
    const org = await orgInfo(tx, ctx.orgId);
    const list = sessionIds.length ? await tx.select({ s: courseSessions, c: courses }).from(courseSessions).innerJoin(courses, eq(courses.id, courseSessions.courseId)).where(inArray(courseSessions.id, sessionIds)).orderBy(asc(courseSessions.startDate)) : [];
    const sel = list.find((l) => l.s.id === get("session")) ?? list.find((l) => l.s.status === "in_progress") ?? list[0];
    if (!sel) return { list, sel: null };
    return {
      list,
      sel,
      meetings: await tx.select().from(sessionMeetings).where(eq(sessionMeetings.sessionId, sel.s.id)).orderBy(asc(sessionMeetings.date)),
      mods: await tx.select().from(courseModules).where(eq(courseModules.courseId, sel.c.id)).orderBy(asc(courseModules.position)),
      sums: await loadEnrollmentSummaries(tx, ctx.orgId, { sessionIds: [sel.s.id], statuses: ["registered", "active", "completed"] }, org.timezone),
    };
  });
  if (!d.sel) return <Empty title="Aucune session attribuée" />;
  const { sel } = d;
  return (
    <>
      <PageHeader title="Mes sessions" />
      <form className="mb-4 flex gap-2">
        <select name="session" defaultValue={sel.s.id} className="input w-auto">
          {d.list.map((l) => (
            <option key={l.s.id} value={l.s.id}>
              {l.c.name} — {l.s.name}
            </option>
          ))}
        </select>
        <button className="btn-secondary">Afficher</button>
      </form>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={sel.s.name} className="lg:col-span-2">
          <p className="text-sm text-slate-600">
            <SessionStatusBadge value={sel.s.status} /> {sel.c.name} · {formatDate(sel.s.startDate)} → {formatDate(sel.s.endDate)} · {sel.s.days} {sel.s.startTime?.slice(0, 5)} · {sel.s.room}
          </p>
          <table className="table mt-4">
            <thead>
              <tr>
                <th>Étudiant</th>
                <th className="min-w-32">Progression</th>
                <th className="num">Présence</th>
                <th className="num">Moyenne</th>
              </tr>
            </thead>
            <tbody>
              {d.sums!.map((s) => (
                <tr key={s.enrollmentId}>
                  <td>
                    {s.student.lastName} {s.student.firstName}
                  </td>
                  <td>
                    <ProgressBar value={s.progress.global} />
                  </td>
                  <td className="num">{s.attendance.rate ?? "—"} %</td>
                  <td className="num">{s.averageGrade ?? "—"} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <div className="space-y-4">
          <Card title="Programme">
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {d.mods!.map((m) => (
                <li key={m.id}>{m.title}</li>
              ))}
            </ol>
          </Card>
          <Card title={`Séances (${d.meetings!.length})`}>
            <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
              {d.meetings!.map((m) => (
                <li key={m.id}>
                  {formatDate(m.date, { weekday: "short", day: "2-digit", month: "short" })} — <span className="text-slate-500">{m.topic}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
