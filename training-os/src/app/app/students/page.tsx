import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import Link from "next/link";
import { Pagination } from "@/components/pagination";
import { Badge, Empty, PageHeader, TableWrap } from "@/components/ui";
import { enrollments, students } from "@/db/schema";
import { requirePageOrg, STAFF } from "@/lib/auth/context";
import { can } from "@/lib/auth/rbac";
import { formatDate } from "@/lib/format";
import { likeEscape, readSP, type SP } from "@/lib/search-params";

export const metadata = { title: "Étudiants" };
const PER_PAGE = 25;

export default async function StudentsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requirePageOrg(STAFF, "students.read");
  const { get, page } = await readSP(searchParams);
  const q = get("q").trim();
  const status = get("status") || "active";
  const where = and(
    eq(students.organizationId, ctx.orgId),
    status === "archived" ? eq(students.isActive, false) : status === "all" ? undefined : eq(students.isActive, true),
    q
      ? or(
          ilike(sql`${students.firstName} || ' ' || ${students.lastName}`, likeEscape(q)),
          ilike(sql`${students.lastName} || ' ' || ${students.firstName}`, likeEscape(q)),
          ilike(students.matricule, likeEscape(q)),
          ilike(students.email, likeEscape(q)),
          ilike(students.phone, likeEscape(q)),
        )
      : undefined,
  );
  const { rows, total } = await ctx.db(async (tx) => {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(students).where(where);
    const rows = await tx
      .select({
        s: students,
        nb: sql<number>`(select count(*)::int from ${enrollments} e where e.student_id = ${students.id} and e.status not in ('cancelled'))`,
      })
      .from(students)
      .where(where)
      .orderBy(asc(students.lastName), asc(students.firstName))
      .limit(PER_PAGE)
      .offset((page - 1) * PER_PAGE);
    return { rows, total: n };
  });

  return (
    <>
      <PageHeader
        title="Étudiants"
        subtitle={`${total} étudiant(s)`}
        actions={
          <>
            <a href="/api/export/students?format=xlsx" className="btn-secondary">
              ⬇ Excel
            </a>
            {can(ctx.role, "import.run") && (
              <Link href="/app/settings/import" className="btn-secondary">
                ⬆ Importer
              </Link>
            )}
            {can(ctx.role, "students.write") && (
              <Link href="/app/students/new" className="btn-primary">
                + Nouvel étudiant
              </Link>
            )}
          </>
        }
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Rechercher : nom, matricule, téléphone, email…" className="input max-w-md flex-1" />
        <select name="status" defaultValue={status} className="input w-auto">
          <option value="active">Actifs</option>
          <option value="archived">Archivés</option>
          <option value="all">Tous</option>
        </select>
        <button className="btn-secondary">Filtrer</button>
      </form>
      {rows.length === 0 ? (
        <Empty title="Aucun étudiant trouvé" action={<Link href="/app/students/new" className="btn-primary">Ajouter un étudiant</Link>} />
      ) : (
        <TableWrap>
          <table className="table">
            <thead>
              <tr>
                <th>Matricule</th>
                <th>Nom</th>
                <th className="hidden md:table-cell">Téléphone</th>
                <th className="hidden lg:table-cell">Email</th>
                <th className="hidden md:table-cell">Profession</th>
                <th>Formations</th>
                <th className="hidden lg:table-cell">Créé le</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, nb }) => (
                <tr key={s.id}>
                  <td className="whitespace-nowrap font-mono text-xs">{s.matricule}</td>
                  <td>
                    <Link href={`/app/students/${s.id}`} className="link font-medium">
                      {s.lastName} {s.firstName}
                    </Link>
                    {!s.isActive && <Badge tone="gray">archivé</Badge>}
                    {s.userId && <span title="Compte étudiant actif"> 🔑</span>}
                  </td>
                  <td className="hidden whitespace-nowrap md:table-cell">{s.phone ?? "—"}</td>
                  <td className="hidden lg:table-cell">{s.email ?? "—"}</td>
                  <td className="hidden md:table-cell">{s.profession ?? "—"}</td>
                  <td>{nb}</td>
                  <td className="hidden lg:table-cell">{formatDate(s.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      <Pagination page={page} total={total} perPage={PER_PAGE} baseParams={{ q, status }} />
    </>
  );
}
