import { and, desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { SessionStatusBadge } from "@/components/badges";
import { Empty, PageHeader, ProgressBar, TableWrap } from "@/components/ui";
import { courses, courseSessions, enrollments, instructors } from "@/db/schema";
import { requirePageOrg, STAFF } from "@/lib/auth/context";
import { formatDate, LABELS } from "@/lib/format";
import { readSP, type SP } from "@/lib/search-params";

export const metadata = { title: "Sessions" };

export default async function SessionsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requirePageOrg(STAFF, "sessions.write");
  const { get } = await readSP(searchParams);
  const status = get("status");
  const validStatus = status in LABELS.sessionStatus ? (status as keyof typeof LABELS.sessionStatus) : null;
  const rows = await ctx.db((tx) =>
    tx
      .select({
        s: courseSessions,
        course: courses.name,
        instr: sql<string | null>`${instructors.firstName} || ' ' || ${instructors.lastName}`,
        n: sql<number>`(select count(*)::int from ${enrollments} e where e.session_id = ${courseSessions.id} and e.status in ('preregistered','registered','active','completed'))`,
      })
      .from(courseSessions)
      .innerJoin(courses, eq(courses.id, courseSessions.courseId))
      .leftJoin(instructors, eq(instructors.id, sql`coalesce(${courseSessions.instructorId}, ${courses.instructorId})`))
      .where(and(eq(courseSessions.organizationId, ctx.orgId), validStatus ? eq(courseSessions.status, validStatus) : undefined))
      .orderBy(desc(courseSessions.startDate)),
  );
  return (
    <>
      <PageHeader
        title="Sessions"
        subtitle="Une formation peut avoir plusieurs sessions."
        actions={
          <Link href="/app/sessions/new" className="btn-primary">
            + Nouvelle session
          </Link>
        }
      />
      <form className="mb-4 flex gap-2">
        <select name="status" defaultValue={status} className="input w-auto">
          <option value="">Tous les statuts</option>
          {Object.entries(LABELS.sessionStatus).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <button className="btn-secondary">Filtrer</button>
      </form>
      {rows.length === 0 ? (
        <Empty title="Aucune session" />
      ) : (
        <TableWrap>
          <table className="table">
            <thead>
              <tr>
                <th>Session</th>
                <th className="hidden md:table-cell">Formation</th>
                <th>Dates</th>
                <th className="hidden lg:table-cell">Horaires</th>
                <th className="hidden lg:table-cell">Formateur</th>
                <th className="min-w-40">Remplissage</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, course, instr, n }) => (
                <tr key={s.id}>
                  <td>
                    <Link href={`/app/sessions/${s.id}`} className="link font-medium">
                      {s.name}
                    </Link>
                    <div className="text-xs text-slate-500">{s.room}</div>
                  </td>
                  <td className="hidden md:table-cell">{course}</td>
                  <td className="whitespace-nowrap text-xs">
                    {formatDate(s.startDate)}
                    <br />→ {formatDate(s.endDate)}
                  </td>
                  <td className="hidden text-xs lg:table-cell">
                    {s.days} {s.startTime ? `· ${s.startTime.slice(0, 5)}–${s.endTime?.slice(0, 5) ?? ""}` : ""}
                  </td>
                  <td className="hidden lg:table-cell">{instr ?? "—"}</td>
                  <td>
                    <div className="text-xs text-slate-500">
                      {n}/{s.capacity}
                    </div>
                    <ProgressBar value={(n / s.capacity) * 100} tone="blue" />
                  </td>
                  <td>
                    <SessionStatusBadge value={s.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </>
  );
}
