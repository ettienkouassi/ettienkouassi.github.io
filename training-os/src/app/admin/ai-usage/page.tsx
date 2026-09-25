import { desc, eq, gte, sql } from "drizzle-orm";
import { Card, PageHeader, Stat, TableWrap } from "@/components/ui";
import { aiUsage, organizations } from "@/db/schema";
import { withSystem } from "@/db/tenant";
import { requirePageUser } from "@/lib/auth/context";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Consommation IA" };

export default async function AiUsagePage() {
  await requirePageUser(["super_admin"]);
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);
  const d = await withSystem(async (tx) => ({
    byOrg: await tx
      .select({ org: organizations.name, n: sql<number>`count(*)::int`, inT: sql<number>`coalesce(sum(${aiUsage.inputTokens}),0)::int`, outT: sql<number>`coalesce(sum(${aiUsage.outputTokens}),0)::int`, cost: sql<number>`coalesce(sum(${aiUsage.costMicroUsd}),0)::bigint`, errors: sql<number>`count(*) filter (where ${aiUsage.status} <> 'ok')::int` })
      .from(aiUsage)
      .innerJoin(organizations, eq(organizations.id, aiUsage.organizationId))
      .where(gte(aiUsage.createdAt, since))
      .groupBy(organizations.name),
    recent: await tx.select({ u: aiUsage, org: organizations.name }).from(aiUsage).innerJoin(organizations, eq(organizations.id, aiUsage.organizationId)).orderBy(desc(aiUsage.createdAt)).limit(50),
  }));
  const total = d.byOrg.reduce((a, r) => a + Number(r.cost), 0);
  return (
    <>
      <PageHeader title="Consommation IA" subtitle="Journal de chaque requête : utilisateur, date, type, modèle, jetons, coût estimé, erreurs (§51)." />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Requêtes (mois)" value={d.byOrg.reduce((a, r) => a + r.n, 0)} />
        <Stat label="Coût estimé (mois)" value={`${(total / 1_000_000).toFixed(2)} $`} />
        <Stat label="Jetons entrée" value={d.byOrg.reduce((a, r) => a + r.inT, 0).toLocaleString("fr-FR")} />
        <Stat label="Erreurs / refus / quota" value={d.byOrg.reduce((a, r) => a + r.errors, 0)} tone="warn" />
      </div>
      <Card title="Par centre (mois en cours)" className="mb-4" bodyClassName="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Centre</th>
              <th className="num">Requêtes</th>
              <th className="num">Jetons (E/S)</th>
              <th className="num">Coût estimé</th>
              <th className="num">Erreurs</th>
            </tr>
          </thead>
          <tbody>
            {d.byOrg.map((r) => (
              <tr key={r.org}>
                <td>{r.org}</td>
                <td className="num">{r.n}</td>
                <td className="num">
                  {r.inT.toLocaleString("fr-FR")} / {r.outT.toLocaleString("fr-FR")}
                </td>
                <td className="num">{(Number(r.cost) / 1_000_000).toFixed(3)} $</td>
                <td className="num">{r.errors}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <TableWrap>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Centre</th>
              <th>Assistant</th>
              <th>Modèle</th>
              <th>Outils</th>
              <th className="num">Jetons</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {d.recent.map(({ u, org }) => (
              <tr key={u.id}>
                <td className="whitespace-nowrap text-xs">{formatDateTime(u.createdAt)}</td>
                <td>{org}</td>
                <td>{u.assistant}</td>
                <td className="font-mono text-xs">{u.model}</td>
                <td className="text-xs">{u.toolsUsed?.join(", ")}</td>
                <td className="num">{u.inputTokens + u.outputTokens}</td>
                <td className="text-xs">{u.status}{u.error ? ` — ${u.error.slice(0, 60)}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </>
  );
}
