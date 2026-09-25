import { and, eq, gte, lte, sql } from "drizzle-orm";
import { BarChart } from "@/components/bar-chart";
import { PrintButton } from "@/components/print-button";
import { Card, PageHeader, Stat, Tabs } from "@/components/ui";
import { certificates, enrollments, prospects, students } from "@/db/schema";
import { requirePageOrg, STAFF } from "@/lib/auth/context";
import { formatMoney, LABELS } from "@/lib/format";
import { isUuid, readSP, type SP } from "@/lib/search-params";
import { courseOptions, sessionOptions } from "@/server/lookups";
import { courseStats, orgInfo, periodRange, revenue, revenueByCourse, type Period } from "@/server/metrics";
import { loadEnrollmentSummaries } from "@/server/summaries";

export const metadata = { title: "Rapports" };

export default async function ReportsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requirePageOrg(STAFF, "reports.read");
  const { get } = await readSP(searchParams);
  const tab = get("tab") || "finance";
  const period = (["today", "week", "month", "year", "all"].includes(get("period")) ? get("period") : "month") as Period;
  const courseId = isUuid(get("course")) ? get("course") : undefined;
  const sessionId = isUuid(get("session")) ? get("session") : undefined;

  const d = await ctx.db(async (tx) => {
    const org = await orgInfo(tx, ctx.orgId);
    const range = periodRange(period, org.timezone);
    let sums = await loadEnrollmentSummaries(tx, ctx.orgId, { courseId, sessionIds: sessionId ? [sessionId] : undefined }, org.timezone);
    sums = sums.filter((s) => s.status !== "prospect");
    const rev = await revenue(tx, ctx.orgId, range, "course");
    const revMethod = await revenue(tx, ctx.orgId, range, "method");
    const revSession = await revenue(tx, ctx.orgId, range, "session");
    const revDaily = await revenue(tx, ctx.orgId, range, period === "year" || period === "all" ? "month" : "day");
    const byStatus = await tx.select({ s: prospects.status, n: sql<number>`count(*)::int` }).from(prospects).where(eq(prospects.organizationId, ctx.orgId)).groupBy(prospects.status);
    const bySource = await tx.select({ s: prospects.source, n: sql<number>`count(*)::int` }).from(prospects).where(eq(prospects.organizationId, ctx.orgId)).groupBy(prospects.source);
    const bySourceStudents = await tx.select({ s: students.leadSource, n: sql<number>`count(*)::int` }).from(students).where(eq(students.organizationId, ctx.orgId)).groupBy(students.leadSource);
    const newEnr = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(enrollments)
      .where(and(eq(enrollments.organizationId, ctx.orgId), gte(enrollments.enrolledAt, new Date(`${range.from}T00:00:00Z`)), lte(enrollments.enrolledAt, new Date(`${range.to}T23:59:59Z`))));
    // Réinscriptions : étudiants ayant au moins 2 inscriptions
    const [reenroll] = await tx.execute<{ returning: number; total: number }>(
      sql`select count(*) filter (where n > 1)::int as returning, count(*)::int as total from (select student_id, count(*) n from ${enrollments} where organization_id = ${ctx.orgId} and status <> 'cancelled' group by student_id) t`,
    ).then((r) => r.rows);
    const certCount = await tx.select({ n: sql<number>`count(*)::int` }).from(certificates).where(and(eq(certificates.organizationId, ctx.orgId), gte(certificates.completionDate, range.from), lte(certificates.completionDate, range.to)));
    return { org, range, sums, rev, revMethod, revSession, revDaily, byStatus, bySource, bySourceStudents, newEnr: newEnr[0].n, reenroll, certs: certCount[0].n, courses: await courseOptions(tx, ctx.orgId), sessions: await sessionOptions(tx, ctx.orgId) };
  });
  const { sums } = d;
  const active = sums.filter((s) => ["registered", "active"].includes(s.status));
  const rates = active.map((s) => s.attendance.rate).filter((x): x is number => x !== null);
  const grades = sums.map((s) => s.averageGrade).filter((x): x is number => x !== null);
  const graded = sums.filter((s) => s.results.length > 0);
  const totalProspects = d.byStatus.reduce((a, r) => a + r.n, 0);
  const won = d.byStatus.filter((r) => ["enrolled", "client"].includes(r.s)).reduce((a, r) => a + r.n, 0);
  const periodLabel = { today: "Aujourd'hui", week: "Cette semaine", month: "Ce mois", year: "Cette année", all: "Depuis le début" }[period];

  const filters = (
    <form className="no-print mb-4 flex flex-wrap gap-2">
      <input type="hidden" name="tab" value={tab} />
      <select name="period" defaultValue={period} className="input w-auto">
        <option value="today">Jour</option>
        <option value="week">Semaine</option>
        <option value="month">Mois</option>
        <option value="year">Année</option>
        <option value="all">Tout</option>
      </select>
      <select name="course" defaultValue={courseId ?? ""} className="input w-auto max-w-xs">
        <option value="">Toutes les formations</option>
        {d.courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select name="session" defaultValue={sessionId ?? ""} className="input w-auto max-w-xs">
        <option value="">Toutes les sessions</option>
        {d.sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <button className="btn-secondary">Appliquer</button>
    </form>
  );

  return (
    <>
      <PageHeader title="Rapports & tableaux de bord" subtitle={`${d.org.name} · ${periodLabel} (${d.range.from} → ${d.range.to})`} actions={<PrintButton />} />
      <Tabs
        active={tab}
        tabs={[
          { key: "finance", label: "Financier", href: `?tab=finance&period=${period}` },
          { key: "pedagogy", label: "Pédagogique", href: `?tab=pedagogy&period=${period}` },
          { key: "commercial", label: "Commercial", href: `?tab=commercial&period=${period}` },
          { key: "exports", label: "Exports", href: `?tab=exports&period=${period}` },
        ]}
      />
      {filters}

      {tab === "finance" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Chiffre d'affaires" value={formatMoney(sums.reduce((a, s) => a + s.balance.total, 0))} hint="inscriptions filtrées" />
            <Stat label={`Encaissé (${periodLabel.toLowerCase()})`} value={formatMoney(d.rev.total_encaisse)} tone="good" />
            <Stat label="Restant" value={formatMoney(sums.reduce((a, s) => a + s.balance.remaining, 0))} tone="warn" />
            <Stat label="Impayés (aucun versement)" value={sums.filter((s) => s.balance.status === "unpaid").length} />
            <Stat label="En retard" value={formatMoney(sums.reduce((a, s) => a + s.balance.overdueAmount, 0))} tone="bad" />
          </div>
          <Card title="Encaissements sur la période">
            <BarChart data={d.revDaily.details.map((x) => ({ label: x.label.slice(5) || x.label, value: x.amount }))} format={(v) => formatMoney(v)} label="Encaissements" />
          </Card>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Revenus par formation (période)">
              <SimpleTable rows={d.rev.details.map((x) => [x.label, formatMoney(x.amount)])} />
            </Card>
            <Card title="Revenus par session (période)">
              <SimpleTable rows={d.revSession.details.map((x) => [x.label, formatMoney(x.amount)])} />
            </Card>
            <Card title="Par moyen de paiement">
              <SimpleTable rows={d.revMethod.details.map((x) => [LABELS.paymentMethod[x.label as keyof typeof LABELS.paymentMethod] ?? x.label, formatMoney(x.amount)])} />
            </Card>
          </div>
          <Card title="Facturé / encaissé / restant par formation" bodyClassName="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Formation</th>
                  <th className="num">Inscriptions</th>
                  <th className="num">Facturé</th>
                  <th className="num">Encaissé</th>
                  <th className="num">Reste</th>
                </tr>
              </thead>
              <tbody>
                {(await ctx.db((tx) => revenueByCourse(tx, ctx.orgId, sums))).map((r) => (
                  <tr key={r.formation}>
                    <td>{r.formation}</td>
                    <td className="num">{r.inscriptions}</td>
                    <td className="num">{formatMoney(r.facture)}</td>
                    <td className="num">{formatMoney(r.encaisse)}</td>
                    <td className="num">{formatMoney(r.reste)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {tab === "pedagogy" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Stat label="Taux de présence" value={rates.length ? `${(rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(1)} %` : "—"} />
            <Stat label="Taux de réussite" value={graded.length ? `${Math.round((graded.filter((s) => s.certification.eligible).length / graded.length) * 100)} %` : "—"} />
            <Stat label="Moyenne générale" value={grades.length ? `${(grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(1)} %` : "—"} />
            <Stat label="Progression moyenne" value={sums.length ? `${Math.round(sums.reduce((a, s) => a + s.progress.global, 0) / sums.length)} %` : "—"} />
            <Stat label="Abandons" value={sums.filter((s) => s.status === "dropped").length} tone="bad" />
            <Stat label="Formations terminées" value={sums.filter((s) => s.status === "completed").length} tone="good" />
          </div>
          <Card title="Par formation" bodyClassName="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Formation</th>
                  <th className="num">Inscrits</th>
                  <th className="num">Actifs</th>
                  <th className="num">Terminés</th>
                  <th className="num">Abandons</th>
                  <th className="num">Progression moy.</th>
                  <th className="num">Taux de réussite</th>
                </tr>
              </thead>
              <tbody>
                {courseStats(sums).map((c) => (
                  <tr key={c.formation}>
                    <td>{c.formation}</td>
                    <td className="num">{c.inscrits}</td>
                    <td className="num">{c.actifs}</td>
                    <td className="num">{c.termines}</td>
                    <td className="num">{c.abandons}</td>
                    <td className="num">{c.progression_moyenne} %</td>
                    <td className="num">{c.taux_reussite === null ? "—" : `${c.taux_reussite} %`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="text-xs text-slate-500">Certificats délivrés sur la période : {d.certs}</p>
        </div>
      )}

      {tab === "commercial" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Prospects" value={totalProspects} />
            <Stat label={`Inscriptions (${periodLabel.toLowerCase()})`} value={d.newEnr} />
            <Stat label="Taux de conversion" value={totalProspects ? `${Math.round((won / totalProspects) * 100)} %` : "—"} />
            <Stat label="Anciens étudiants" value={sums.filter((s) => s.status === "completed").length} />
            <Stat label="Taux de réinscription" value={d.reenroll?.total ? `${Math.round((d.reenroll.returning / d.reenroll.total) * 100)} %` : "—"} hint={`${d.reenroll?.returning ?? 0} étudiant(s) avec ≥ 2 formations`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Pipeline prospects">
              <SimpleTable rows={d.byStatus.map((r) => [LABELS.prospectStatus[r.s], String(r.n)])} />
            </Card>
            <Card title="Sources des prospects">
              <SimpleTable rows={d.bySource.map((r) => [r.s ?? "—", String(r.n)])} />
            </Card>
            <Card title="Sources des étudiants">
              <SimpleTable rows={d.bySourceStudents.map((r) => [r.s ?? "—", String(r.n)])} />
            </Card>
          </div>
          <Card title="Formations demandées (inscriptions)">
            <SimpleTable rows={courseStats(sums).map((c) => [c.formation, String(c.inscrits)])} />
          </Card>
        </div>
      )}

      {tab === "exports" && (
        <Card title="Exporter les données">
          <ul className="divide-y divide-slate-100">
            {[
              ["students", "Rapport étudiants"],
              ["enrollments", "Rapport inscriptions (avec progression, présence, soldes)"],
              ["payments", "Rapport paiements (période sélectionnée)"],
              ["balances", "Soldes et impayés"],
              ["attendance", "Rapport présences (période sélectionnée)"],
              ["results", "Rapport évaluations"],
            ].map(([k, l]) => (
              <li key={k} className="flex items-center justify-between py-3 text-sm">
                <span>{l}</span>
                <span className="flex gap-2">
                  <a className="btn-secondary btn-sm" href={`/api/export/${k}?format=xlsx&from=${d.range.from}&to=${d.range.to}`}>
                    Excel
                  </a>
                  <a className="btn-secondary btn-sm" href={`/api/export/${k}?format=csv&from=${d.range.from}&to=${d.range.to}`}>
                    CSV
                  </a>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">Format PDF : utilisez « Imprimer / PDF » sur les onglets Financier, Pédagogique ou Commercial. Les exports sont journalisés.</p>
        </Card>
      )}
    </>
  );
}

function SimpleTable({ rows }: { rows: string[][] }) {
  if (!rows.length) return <p className="text-sm text-slate-500">Aucune donnée.</p>;
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-slate-100 last:border-0">
            <td className="py-1.5">{r[0]}</td>
            <td className="py-1.5 text-right tabular-nums">{r[1]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
