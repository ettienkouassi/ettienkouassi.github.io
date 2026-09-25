import { asc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { CourseStatusBadge } from "@/components/badges";
import { Empty, PageHeader, TableWrap } from "@/components/ui";
import { courses, courseSessions, enrollments, instructors } from "@/db/schema";
import { requirePageOrg, STAFF } from "@/lib/auth/context";
import { can } from "@/lib/auth/rbac";
import { formatMoney } from "@/lib/format";

export const metadata = { title: "Formations" };

export default async function CoursesPage() {
  const ctx = await requirePageOrg(STAFF, "courses.read");
  const rows = await ctx.db((tx) =>
    tx
      .select({
        c: courses,
        instr: sql<string | null>`${instructors.firstName} || ' ' || ${instructors.lastName}`,
        sessions: sql<number>`(select count(*)::int from ${courseSessions} s where s.course_id = ${courses.id})`,
        learners: sql<number>`(select count(*)::int from ${enrollments} e where e.course_id = ${courses.id} and e.status in ('registered','active'))`,
      })
      .from(courses)
      .leftJoin(instructors, eq(instructors.id, courses.instructorId))
      .where(eq(courses.organizationId, ctx.orgId))
      .orderBy(asc(courses.name)),
  );
  return (
    <>
      <PageHeader
        title="Formations"
        subtitle={`${rows.length} formation(s)`}
        actions={
          can(ctx.role, "courses.write") && (
            <Link href="/app/courses/new" className="btn-primary">
              + Nouvelle formation
            </Link>
          )
        }
      />
      {rows.length === 0 ? (
        <Empty title="Aucune formation" action={<Link href="/app/courses/new" className="btn-primary">Créer une formation</Link>} />
      ) : (
        <TableWrap>
          <table className="table">
            <thead>
              <tr>
                <th>Formation</th>
                <th className="hidden md:table-cell">Catégorie</th>
                <th className="hidden md:table-cell">Formateur</th>
                <th className="num">Durée</th>
                <th className="num">Prix</th>
                <th className="num">Sessions</th>
                <th className="num">Étudiants actifs</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, instr, sessions, learners }) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/app/courses/${c.id}`} className="link font-medium">
                      {c.name}
                    </Link>
                    <div className="text-xs text-slate-500">{c.level}</div>
                  </td>
                  <td className="hidden md:table-cell">{c.category ?? "—"}</td>
                  <td className="hidden md:table-cell">{instr ?? "—"}</td>
                  <td className="num">{c.durationHours} h</td>
                  <td className="num">{formatMoney(c.price, c.currency)}</td>
                  <td className="num">{sessions}</td>
                  <td className="num">{learners}</td>
                  <td>
                    <CourseStatusBadge value={c.status} />
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
