import { desc, eq } from "drizzle-orm";
import { PageHeader, TableWrap } from "@/components/ui";
import { auditLogs, organizations } from "@/db/schema";
import { withSystem } from "@/db/tenant";
import { requirePageUser } from "@/lib/auth/context";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Journal d'audit plateforme" };

export default async function PlatformAudit() {
  await requirePageUser(["super_admin"]);
  const rows = await withSystem((tx) => tx.select({ a: auditLogs, org: organizations.name }).from(auditLogs).leftJoin(organizations, eq(organizations.id, auditLogs.organizationId)).orderBy(desc(auditLogs.createdAt)).limit(200));
  return (
    <>
      <PageHeader title="Journal d'audit" subtitle="200 derniers événements, tous centres confondus." />
      <TableWrap>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Centre</th>
              <th>Action</th>
              <th>Détail</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ a, org }) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap text-xs">{formatDateTime(a.createdAt)}</td>
                <td className="text-xs">{org ?? "Plateforme"}</td>
                <td className="font-mono text-xs">{a.action}</td>
                <td className="text-sm">{a.summary}</td>
                <td className="font-mono text-xs">{a.ip ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </>
  );
}
