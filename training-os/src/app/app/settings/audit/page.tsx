import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { Pagination } from "@/components/pagination";
import { PageHeader, TableWrap } from "@/components/ui";
import { auditLogs } from "@/db/schema";
import { requirePageOrg, STAFF } from "@/lib/auth/context";
import { formatDateTime } from "@/lib/format";
import { likeEscape, readSP, type SP } from "@/lib/search-params";
import { SettingsTabs } from "../tabs";

export const metadata = { title: "Journal d'audit" };
const PER = 50;

export default async function AuditPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requirePageOrg(STAFF, "audit.read");
  const { get, page } = await readSP(searchParams);
  const q = get("q");
  const where = and(eq(auditLogs.organizationId, ctx.orgId), q ? ilike(auditLogs.summary, likeEscape(q)) : undefined);
  const { rows, total } = await ctx.db(async (tx) => ({
    rows: await tx.select().from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt)).limit(PER).offset((page - 1) * PER),
    total: (await tx.select({ n: sql<number>`count(*)::int` }).from(auditLogs).where(where))[0].n,
  }));
  return (
    <>
      <PageHeader title="Journal d'audit" subtitle="Historique infalsifiable des actions sensibles (création, modification de montants, paiements, présences, certificats, connexions, exports)." />
      <SettingsTabs active="audit" />
      <form className="mb-3 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Rechercher…" className="input max-w-md" />
        <button className="btn-secondary">Rechercher</button>
      </form>
      <TableWrap>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Action</th>
              <th>Détail</th>
              <th className="hidden md:table-cell">Adresse IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-xs">{formatDateTime(r.createdAt)}</td>
                <td className="font-mono text-xs">{r.action}</td>
                <td className="text-sm">{r.summary}</td>
                <td className="hidden font-mono text-xs text-slate-500 md:table-cell">{r.ip ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <Pagination page={page} total={total} perPage={PER} baseParams={{ q }} />
    </>
  );
}
