import { and, desc, eq, gte, lte } from "drizzle-orm";
import Link from "next/link";
import { PaymentStatusBadge } from "@/components/badges";
import { Badge, PageHeader, Stat, TableWrap, Tabs } from "@/components/ui";
import { courses, enrollments, payments, students } from "@/db/schema";
import { requirePageOrg, STAFF } from "@/lib/auth/context";
import { addDaysISO, formatDate, formatMoney, LABELS, todayISO } from "@/lib/format";
import { readSP, type SP } from "@/lib/search-params";
import { orgInfo } from "@/server/metrics";
import { loadEnrollmentSummaries } from "@/server/summaries";

export const metadata = { title: "Paiements" };
const d = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

export default async function PaymentsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requirePageOrg(STAFF, "payments.read");
  const { get } = await readSP(searchParams);
  const tab = get("tab") || "balances";
  const filter = get("filter") || "unpaid";
  const data = await ctx.db(async (tx) => {
    const org = await orgInfo(tx, ctx.orgId);
    const sums = await loadEnrollmentSummaries(tx, ctx.orgId, { statuses: ["preregistered", "registered", "active", "completed", "dropped"] }, org.timezone);
    const from = d(get("from")) || `${new Date().toISOString().slice(0, 7)}-01`;
    const to = d(get("to")) || new Date().toISOString().slice(0, 10);
    const journal =
      tab === "journal"
        ? await tx
            .select({ p: payments, s: students, c: courses.name, eId: enrollments.id })
            .from(payments)
            .innerJoin(enrollments, eq(enrollments.id, payments.enrollmentId))
            .innerJoin(students, eq(students.id, enrollments.studentId))
            .innerJoin(courses, eq(courses.id, enrollments.courseId))
            .where(and(eq(payments.organizationId, ctx.orgId), gte(payments.paidAt, from), lte(payments.paidAt, to)))
            .orderBy(desc(payments.paidAt), desc(payments.createdAt))
        : [];
    return { sums, journal, from, to, tz: org.timezone };
  });
  const { sums, journal, from, to } = data;
  const today = todayISO(data.tz);
  const in7 = addDaysISO(today, 7);
  const filtered = sums.filter((s) => {
    if (filter === "overdue") return s.balance.overdueAmount > 0;
    if (filter === "due") return s.balance.nextDue && s.balance.nextDue.dueDate <= in7 && s.balance.remaining > 0;
    if (filter === "paid") return s.balance.status === "paid";
    if (filter === "all") return true;
    return s.balance.remaining > 0;
  });
  const totals = {
    billed: sums.reduce((a, s) => a + s.balance.total, 0),
    paid: sums.reduce((a, s) => a + s.balance.paid, 0),
    remaining: sums.reduce((a, s) => a + s.balance.remaining, 0),
    overdue: sums.reduce((a, s) => a + s.balance.overdueAmount, 0),
  };
  const journalTotal = journal.filter((j) => j.p.status === "recorded").reduce((a, j) => a + j.p.amount, 0);

  return (
    <>
      <PageHeader
        title="Paiements"
        actions={
          <>
            <a href="/api/export/balances?format=xlsx" className="btn-secondary">
              ⬇ Soldes (Excel)
            </a>
            <a href={`/api/export/payments?format=xlsx&from=${from}&to=${to}`} className="btn-secondary">
              ⬇ Paiements (Excel)
            </a>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Chiffre d'affaires" value={formatMoney(totals.billed)} />
        <Stat label="Encaissé" value={formatMoney(totals.paid)} tone="good" />
        <Stat label="Reste à payer" value={formatMoney(totals.remaining)} tone="warn" />
        <Stat label="En retard" value={formatMoney(totals.overdue)} tone={totals.overdue ? "bad" : "default"} />
      </div>
      <Tabs
        active={tab}
        tabs={[
          { key: "balances", label: "Soldes par inscription", href: "?tab=balances" },
          { key: "journal", label: "Journal des encaissements", href: "?tab=journal" },
        ]}
      />
      {tab === "balances" ? (
        <>
          <div className="mb-3 flex flex-wrap gap-2 text-sm">
            {[
              ["unpaid", "Doivent encore payer"],
              ["overdue", "En retard"],
              ["due", "Échéance sous 7 jours"],
              ["paid", "Soldés"],
              ["all", "Tous"],
            ].map(([k, l]) => (
              <Link key={k} href={`?tab=balances&filter=${k}`} className={k === filter ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>
                {l}
              </Link>
            ))}
          </div>
          <TableWrap>
            <table className="table">
              <thead>
                <tr>
                  <th>Étudiant</th>
                  <th>Formation</th>
                  <th className="num">Total</th>
                  <th className="num">Payé</th>
                  <th className="num">Reste</th>
                  <th className="num">En retard</th>
                  <th>Prochaine échéance</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.enrollmentId}>
                    <td>
                      <Link className="link" href={`/app/enrollments/${s.enrollmentId}`}>
                        {s.student.lastName} {s.student.firstName}
                      </Link>
                      <div className="text-xs text-slate-500">{s.student.phone}</div>
                    </td>
                    <td className="text-sm">{s.course.name}</td>
                    <td className="num">{formatMoney(s.balance.total)}</td>
                    <td className="num">{formatMoney(s.balance.paid)}</td>
                    <td className="num font-medium">{formatMoney(s.balance.remaining)}</td>
                    <td className="num text-red-600">{s.balance.overdueAmount ? formatMoney(s.balance.overdueAmount) : "—"}</td>
                    <td className="whitespace-nowrap text-xs">{s.balance.nextDue ? `${formatMoney(s.balance.nextDue.amount)} · ${formatDate(s.balance.nextDue.dueDate)}` : "—"}</td>
                    <td>
                      <PaymentStatusBadge value={s.balance.status} />
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center text-slate-500">
                      Aucun résultat.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableWrap>
        </>
      ) : (
        <>
          <form className="mb-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="tab" value="journal" />
            <label className="text-sm">
              Du <input type="date" name="from" defaultValue={from} className="input" />
            </label>
            <label className="text-sm">
              Au <input type="date" name="to" defaultValue={to} className="input" />
            </label>
            <button className="btn-secondary">Afficher</button>
            <span className="ml-auto text-sm">
              Total encaissé : <strong>{formatMoney(journalTotal)}</strong>
            </span>
          </form>
          <TableWrap>
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Étudiant</th>
                  <th>Formation</th>
                  <th className="num">Montant</th>
                  <th>Moyen</th>
                  <th>Référence</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {journal.map(({ p, s, c, eId }) => (
                  <tr key={p.id} className={p.status === "cancelled" ? "text-slate-400" : ""}>
                    <td>{formatDate(p.paidAt)}</td>
                    <td>
                      <Link className="link" href={`/app/enrollments/${eId}`}>
                        {s.lastName} {s.firstName}
                      </Link>
                    </td>
                    <td>{c}</td>
                    <td className="num">{formatMoney(p.amount)}</td>
                    <td>{LABELS.paymentMethod[p.method]}</td>
                    <td className="font-mono text-xs">{p.reference ?? "—"}</td>
                    <td>{p.status === "cancelled" ? <Badge tone="gray">Annulé</Badge> : <Badge tone="green">OK</Badge>}</td>
                  </tr>
                ))}
                {journal.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-slate-500">
                      Aucun paiement sur la période.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableWrap>
        </>
      )}
    </>
  );
}
