import Link from "next/link";
import { OrgStatusBadge } from "@/components/badges";
import { BarChart } from "@/components/bar-chart";
import { Card, PageHeader, Stat } from "@/components/ui";
import { requirePageUser } from "@/lib/auth/context";
import { formatDate, formatMoney } from "@/lib/format";
import { platformStats } from "@/server/platform";

export const metadata = { title: "Plateforme" };

export default async function AdminHome() {
  await requirePageUser(["super_admin"]);
  const s = await platformStats();
  return (
    <>
      <PageHeader title="Tableau de bord global" subtitle="TRAINING OS AI — toutes les données agrégées de la plateforme" actions={<Link href="/admin/organizations/new" className="btn-primary">+ Nouveau centre</Link>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Centres" value={s.centres} href="/admin/organizations" />
        <Stat label="Centres actifs" value={s.actifs} tone="good" />
        <Stat label="Suspendus" value={s.suspendus} tone={s.suspendus ? "bad" : "default"} />
        <Stat label="Étudiants" value={s.etudiants} />
        <Stat label="Formations" value={s.formations} />
        <Stat label="Formateurs" value={s.formateurs} />
        <Stat label="Revenu récurrent mensuel" value={formatMoney(s.mrr)} tone="good" />
        <Stat label="Abonnements actifs" value={s.abonnementsActifs} />
        <Stat label="Abonnements expirés" value={s.abonnementsExpires} tone={s.abonnementsExpires ? "warn" : "default"} />
        <Stat label="Nouveaux centres (mois)" value={s.nouveauxCentres} />
        <Stat label="Requêtes IA (mois)" value={s.aiThisMonth} href="/admin/ai-usage" />
        <Stat label="En configuration" value={s.enConfiguration} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Croissance : nouveaux centres par mois">
          <BarChart data={s.growth.map((g) => ({ label: formatDate(`${g.month}-01`, { month: "short" }), value: g.n }))} format={(v) => `${v} centre(s)`} label="Nouveaux centres par mois" />
        </Card>
        <div className="space-y-4">
          <Card title="Derniers centres">
            <ul className="space-y-2 text-sm">
              {s.recent.map((o) => (
                <li key={o.id} className="flex justify-between">
                  <Link href={`/admin/organizations/${o.id}`} className="link">
                    {o.name}
                  </Link>
                  <OrgStatusBadge value={o.status} />
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Abonnements arrivant à échéance (14 j)">
            {s.expiringSoon.length === 0 ? (
              <p className="text-sm text-slate-500">Aucun.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {s.expiringSoon.map((x) => (
                  <li key={x.s.id} className="flex justify-between">
                    <span>{x.org}</span>
                    <span>
                      {x.p.name} · {formatDate(x.s.currentPeriodEnd)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
