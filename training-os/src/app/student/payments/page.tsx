import { desc, inArray } from "drizzle-orm";
import { PaymentStatusBadge } from "@/components/badges";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { payments } from "@/db/schema";
import { formatDate, formatMoney, LABELS } from "@/lib/format";
import { studentScope } from "../scope";

export const metadata = { title: "Mes paiements" };

export default async function Page() {
  const { ctx, sums } = await studentScope();
  const ids = sums.map((s) => s.enrollmentId);
  const hist = ids.length ? await ctx.db((tx) => tx.select().from(payments).where(inArray(payments.enrollmentId, ids)).orderBy(desc(payments.paidAt))) : [];
  if (!sums.length) return <Empty title="Aucune inscription" />;
  return (
    <>
      <PageHeader title="Mes paiements" />
      <div className="space-y-4">
        {sums.map((s) => (
          <Card key={s.enrollmentId} title={s.course.name} actions={<PaymentStatusBadge value={s.balance.status} />}>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-xs text-slate-500">Total</div>
                <div className="font-semibold">{formatMoney(s.balance.total)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Payé</div>
                <div className="font-semibold text-emerald-600">{formatMoney(s.balance.paid)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Reste</div>
                <div className="font-semibold">{formatMoney(s.balance.remaining)}</div>
              </div>
            </div>
            {s.balance.nextDue && (
              <p className="mt-3 text-center text-sm">
                Prochaine échéance : <strong>{formatMoney(s.balance.nextDue.amount)}</strong> le {formatDate(s.balance.nextDue.dueDate)}
              </p>
            )}
            <table className="table mt-4">
              <thead>
                <tr>
                  <th>Échéance</th>
                  <th>Date</th>
                  <th className="num">Montant</th>
                  <th>État</th>
                </tr>
              </thead>
              <tbody>
                {s.balance.installments.map((i) => (
                  <tr key={i.position}>
                    <td>{i.label}</td>
                    <td>{formatDate(i.dueDate)}</td>
                    <td className="num">{formatMoney(i.amount)}</td>
                    <td>{i.state === "paid" ? <Badge tone="green">Payée</Badge> : i.state === "overdue" ? <Badge tone="red">En retard</Badge> : i.state === "partial" ? <Badge tone="blue">Partielle</Badge> : <Badge>À venir</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3 className="mt-4 text-sm font-semibold">Paiements reçus</h3>
            <ul className="mt-1 space-y-1 text-sm">
              {hist
                .filter((p) => p.enrollmentId === s.enrollmentId && p.status === "recorded")
                .map((p) => (
                  <li key={p.id} className="flex justify-between">
                    <span>
                      {formatDate(p.paidAt)} · {LABELS.paymentMethod[p.method]} {p.reference ? `· ${p.reference}` : ""}
                    </span>
                    <span className="tabular-nums">{formatMoney(p.amount)}</span>
                  </li>
                ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
