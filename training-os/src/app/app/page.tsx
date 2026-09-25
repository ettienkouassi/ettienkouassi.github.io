import Link from "next/link";
import { BarChart } from "@/components/bar-chart";
import { RiskBadge } from "@/components/badges";
import { ActionButton } from "@/components/form";
import { Alert, Card, PageHeader, Stat } from "@/components/ui";
import { completeTaskAction } from "./tasks-actions";
import { requirePageOrg, STAFF } from "@/lib/auth/context";
import { can } from "@/lib/auth/rbac";
import { addDaysISO, formatDate, formatMoney, formatPercent } from "@/lib/format";
import { centerOverview, orgInfo, revenue, revenueByCourse, todayActions } from "@/server/metrics";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const ctx = await requirePageOrg(STAFF, "dashboard.view");
  const showMoney = can(ctx.role, "payments.read");
  const data = await ctx.db(async (tx) => {
    const org = await orgInfo(tx, ctx.orgId);
    const o = await centerOverview(tx, ctx.orgId, org.timezone);
    const monthStart = `${addDaysISO(o.date, -150).slice(0, 7)}-01`;
    const monthly = await revenue(tx, ctx.orgId, { from: monthStart, to: o.date }, "month");
    const byCourse = await revenueByCourse(tx, ctx.orgId, o._summaries);
    const actions = await todayActions(tx, ctx.orgId, org.timezone, o._summaries);
    return { org, o, monthly, byCourse, actions };
  });
  const { o, monthly, byCourse, actions, org } = data;
  const totalBilled = byCourse.reduce((a, c) => a + c.facture, 0);
  const months: { label: string; value: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(`${o.date.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - i);
    const key = d.toISOString().slice(0, 7);
    months.push({ label: formatDate(`${key}-01`, { month: "short", year: "2-digit" }), value: monthly.details.find((m) => m.label === key)?.amount ?? 0 });
  }

  const alerts = [
    actions.paiements_en_retard.length > 0 && { tone: "red" as const, text: `${actions.paiements_en_retard.length} étudiant(s) en retard de paiement`, href: "/app/payments?filter=overdue" },
    actions.echeances_dans_3_jours.length > 0 && { tone: "amber" as const, text: `${actions.echeances_dans_3_jours.length} échéance(s) dans les 3 prochains jours`, href: "/app/payments?filter=due" },
    actions.etudiants_a_suivre.length > 0 && { tone: "amber" as const, text: `${actions.etudiants_a_suivre.length} étudiant(s) nécessitant un suivi (alerte basée sur des indicateurs)`, href: "#suivi" },
    actions.certificats_a_generer.length > 0 && { tone: "blue" as const, text: `${actions.certificats_a_generer.length} certificat(s) à générer`, href: "/app/certificates" },
    ...actions.sessions_presque_completes.map((s) => ({ tone: "blue" as const, text: `La session ${s.session} est presque complète (${s.inscrits}/${s.capacite})`, href: "/app/sessions" })),
    actions.prospects_a_relancer.length > 0 && { tone: "blue" as const, text: `${actions.prospects_a_relancer.length} prospect(s) à relancer`, href: "/app/prospects" },
  ].filter(Boolean) as { tone: "red" | "amber" | "blue"; text: string; href: string }[];

  return (
    <>
      <PageHeader
        title={`Bonjour ${ctx.user.firstName} 👋`}
        subtitle={`${org.name} · ${formatDate(o.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}
        actions={
          can(ctx.role, "ai.director") && (
            <Link href="/app/assistant?q=Qu'est-ce que je dois faire aujourd'hui ?" className="btn-primary">
              🤖 Que dois-je faire aujourd&apos;hui ?
            </Link>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Étudiants actifs" value={o.etudiants_actifs} hint={`${o.etudiants_total} au total`} href="/app/students" />
        <Stat label="Nouvelles inscriptions" value={o.nouvelles_inscriptions_ce_mois} hint="ce mois-ci" href="/app/enrollments" />
        <Stat label="Formations actives" value={o.formations_actives} href="/app/courses" />
        <Stat label="Sessions en cours" value={o.sessions_en_cours} href="/app/sessions" />
        <Stat label="Taux de présence" value={formatPercent(o.taux_presence_moyen)} tone={(o.taux_presence_moyen ?? 100) < 75 ? "warn" : "good"} href="/app/attendance" />
        {showMoney && <Stat label="Encaissé ce mois" value={formatMoney(o.encaisse_ce_mois)} tone="good" href="/app/payments" />}
        {showMoney && <Stat label="Reste à encaisser" value={formatMoney(o.restant_a_encaisser)} href="/app/payments?filter=unpaid" />}
        {showMoney && <Stat label="Paiements en retard" value={formatMoney(o.montant_en_retard)} tone={o.montant_en_retard > 0 ? "bad" : "default"} href="/app/payments?filter=overdue" />}
        <Stat label="Formations terminées" value={o.formations_terminees} />
        <Stat label="Certificats délivrés" value={o.certificats_delivres} hint={o.certificats_a_generer ? `${o.certificats_a_generer} à générer` : undefined} href="/app/certificates" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card title="Alertes" className="lg:col-span-1">
          {alerts.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune alerte. Tout est à jour ✅</p>
          ) : (
            <ul className="space-y-2">
              {alerts.map((a, i) => (
                <li key={i}>
                  <Link href={a.href} className="block">
                    <Alert tone={a.tone}>{a.text}</Alert>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {showMoney && (
          <Card title="Encaissements — 6 derniers mois" className="lg:col-span-2">
            <BarChart data={months} format={(v) => formatMoney(v)} label="Montants encaissés par mois" />
            <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
              <div>
                <div className="text-xs text-slate-500">Chiffre d&apos;affaires (inscriptions)</div>
                <div className="font-semibold">{formatMoney(totalBilled)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Encaissé</div>
                <div className="font-semibold text-emerald-600">{formatMoney(byCourse.reduce((a, c) => a + c.encaisse, 0))}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Restant</div>
                <div className="font-semibold text-amber-600">{formatMoney(byCourse.reduce((a, c) => a + c.reste, 0))}</div>
              </div>
            </div>
          </Card>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {showMoney && (
          <Card title="Revenus par formation" bodyClassName="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Formation</th>
                  <th className="num">Inscr.</th>
                  <th className="num">Facturé</th>
                  <th className="num">Encaissé</th>
                  <th className="num">Reste</th>
                </tr>
              </thead>
              <tbody>
                {byCourse.map((c) => (
                  <tr key={c.formation}>
                    <td>{c.formation}</td>
                    <td className="num">{c.inscriptions}</td>
                    <td className="num">{formatMoney(c.facture)}</td>
                    <td className="num">{formatMoney(c.encaisse)}</td>
                    <td className="num">{formatMoney(c.reste)}</td>
                  </tr>
                ))}
                {byCourse.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-slate-500">
                      Aucune inscription pour le moment.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        )}
        <Card title="Séances du jour">
          {actions.seances_du_jour.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune séance programmée aujourd&apos;hui.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {actions.seances_du_jour.map((s, i) => (
                <li key={i} className="flex justify-between py-2">
                  <span>{s.session}</span>
                  <span className="text-slate-500">
                    {s.heure ?? ""} {s.sujet ? `· ${s.sujet}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {actions.taches_ouvertes.length > 0 && (
        <Card title={`Tâches de suivi (${actions.taches_ouvertes.length})`} className="mt-4">
          <ul className="divide-y divide-slate-100 text-sm">
            {actions.taches_ouvertes.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  {t.title}
                  {t.studentId && (
                    <Link className="link ml-2 text-xs" href={`/app/students/${t.studentId}`}>
                      fiche →
                    </Link>
                  )}
                </span>
                <ActionButton action={completeTaskAction} hidden={{ id: t.id }}>
                  ✓ Traité
                </ActionButton>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div id="suivi" className="mt-4">
        <Card title="Étudiants nécessitant un suivi" actions={<span className="text-xs text-slate-500">Alerte basée sur des indicateurs — pas un diagnostic</span>} bodyClassName="overflow-x-auto">
          {o._summaries.filter((s) => s.risk.level === "high" || s.risk.level === "medium").length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Aucun signal particulier.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Étudiant</th>
                  <th>Formation</th>
                  <th>Niveau</th>
                  <th>Indicateurs</th>
                </tr>
              </thead>
              <tbody>
                {o._summaries
                  .filter((s) => s.risk.level === "high" || s.risk.level === "medium")
                  .sort((a, b) => b.risk.score - a.risk.score)
                  .slice(0, 15)
                  .map((s) => (
                    <tr key={s.enrollmentId}>
                      <td>
                        <Link className="link" href={`/app/students/${s.student.id}`}>
                          {s.student.firstName} {s.student.lastName}
                        </Link>
                      </td>
                      <td>{s.course.name}</td>
                      <td>
                        <RiskBadge level={s.risk.level} />
                      </td>
                      <td className="text-xs text-slate-600">{s.risk.signals.map((x) => x.label).join(" · ")}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
