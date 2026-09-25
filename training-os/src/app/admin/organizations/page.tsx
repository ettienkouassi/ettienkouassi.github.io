import { asc, sql } from "drizzle-orm";
import Link from "next/link";
import { OrgStatusBadge } from "@/components/badges";
import { PageHeader, TableWrap } from "@/components/ui";
import { organizations, students, users } from "@/db/schema";
import { withSystem } from "@/db/tenant";
import { requirePageUser } from "@/lib/auth/context";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Centres" };

export default async function OrgsPage() {
  await requirePageUser(["super_admin"]);
  const rows = await withSystem((tx) =>
    tx
      .select({
        o: organizations,
        students: sql<number>`(select count(*)::int from ${students} s where s.organization_id = ${organizations.id})`,
        users: sql<number>`(select count(*)::int from ${users} u where u.organization_id = ${organizations.id} and u.role <> 'student')`,
      })
      .from(organizations)
      .orderBy(asc(organizations.name)),
  );
  return (
    <>
      <PageHeader title="Centres de formation" subtitle={`${rows.length} centre(s)`} actions={<Link href="/admin/organizations/new" className="btn-primary">+ Nouveau centre</Link>} />
      <TableWrap>
        <table className="table">
          <thead>
            <tr>
              <th>Centre</th>
              <th>Ville</th>
              <th className="num">Étudiants</th>
              <th className="num">Personnel</th>
              <th>Créé le</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ o, students: s, users: u }) => (
              <tr key={o.id}>
                <td>
                  <Link href={`/admin/organizations/${o.id}`} className="link font-medium">
                    {o.name}
                  </Link>
                  <div className="font-mono text-xs text-slate-400">{o.slug}</div>
                </td>
                <td>
                  {o.city}, {o.country}
                </td>
                <td className="num">{s}</td>
                <td className="num">{u}</td>
                <td>{formatDate(o.createdAt)}</td>
                <td>
                  <OrgStatusBadge value={o.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </>
  );
}
