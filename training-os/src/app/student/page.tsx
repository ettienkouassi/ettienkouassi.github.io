import { and, asc, gte, inArray, eq } from "drizzle-orm";
import Link from "next/link";
import { Alert, Card, PageHeader, ProgressBar, Stat } from "@/components/ui";
import { courseSessions, sessionMeetings } from "@/db/schema";
import { formatDate, formatMoney, todayISO } from "@/lib/format";
import { recommendationsFor } from "@/server/recommendations";
import { studentScope } from "./scope";

export const metadata = { title: "Mon espace" };

export default async function StudentHome() {
  const { ctx, org, sums } = await studentScope();
  const today = todayISO(org.timezone);
  const d = await ctx.db(async (tx) => ({
    next: sums.length
      ? await tx
          .select({ m: sessionMeetings, s: courseSessions })
          .from(sessionMeetings)
          .innerJoin(courseSessions, eq(courseSessions.id, sessionMeetings.sessionId))
          .where(and(inArray(sessionMeetings.sessionId, sums.map((s) => s.session.id)), gte(sessionMeetings.date, today)))
          .orderBy(asc(sessionMeetings.date))
          .limit(3)
      : [],
    recos: await recommendationsFor(tx, ctx.orgId, sums),
  }));
  const active = sums.filter((s) => ["registered", "active"].includes(s.status));
  const remaining = sums.reduce((a, s) => a + s.balance.remaining, 0);
  const overdue = sums.reduce((a, s) => a + s.balance.overdueAmount, 0);
  return (
    <>
      <PageHeader title={`Bonjour ${ctx.user.firstName} 👋`} subtitle={org.name} />
      {overdue > 0 && (
        <div className="mb-4">
          <Alert tone="red" title="Paiement en retard">
            Un montant de {formatMoney(overdue)} est en retard. <Link className="underline" href="/student/payments">Voir mes paiements</Link>
          </Alert>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Formations en cours" value={active.length} href="/student/courses" />
        <Stat label="Terminées" value={sums.filter((s) => s.status === "completed").length} />
        <Stat label="Reste à payer" value={formatMoney(remaining)} tone={remaining ? "warn" : "good"} href="/student/payments" />
        <Stat label="Certificats" value={sums.filter((s) => s.certification.certificateCode).length} href="/student/certificates" />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Ma progression">
          {active.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune formation en cours.</p>
          ) : (
            <ul className="space-y-3">
              {active.map((s) => (
                <li key={s.enrollmentId}>
                  <div className="mb-1 text-sm font-medium">{s.course.name}</div>
                  <ProgressBar value={s.progress.global} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Prochaines séances">
          {d.next.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune séance à venir.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {d.next.map(({ m, s }) => (
                <li key={m.id} className="py-2">
                  <strong>{m.date === today ? "Aujourd'hui" : formatDate(m.date, { weekday: "long", day: "numeric", month: "long" })}</strong> {m.startTime?.slice(0, 5)} · {s.room}
                  <div className="text-xs text-slate-500">
                    {s.name} — {m.topic}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {d.recos.length > 0 && (
        <Card title="🤖 Recommandé pour vous" className="mt-4">
          <ul className="grid gap-3 md:grid-cols-2">
            {d.recos.map((r) => (
              <li key={r.course.id} className="rounded-lg border border-brand-100 bg-brand-50/60 p-3">
                <div className="font-semibold text-brand-800">Formation recommandée : {r.course.name}</div>
                <p className="mt-1 text-sm text-slate-600">Raison : {r.reason}</p>
                {org.publicPageEnabled && (
                  <Link href={`/c/${org.slug}/courses/${r.course.slug}`} className="link mt-2 inline-block text-sm">
                    Voir la formation et s&apos;inscrire →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="mt-4 text-center">
        <Link href="/student/assistant" className="btn-primary">
          🤖 Poser une question à mon assistant
        </Link>
      </div>
    </>
  );
}
