import { and, asc, eq, gte, inArray } from "drizzle-orm";
import Link from "next/link";
import { RiskBadge, SessionStatusBadge } from "@/components/badges";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { courseSessions, courses, sessionMeetings } from "@/db/schema";
import { formatDate, todayISO } from "@/lib/format";
import { orgInfo } from "@/server/metrics";
import { loadEnrollmentSummaries } from "@/server/summaries";
import { instructorScope } from "./scope";

export const metadata = { title: "Espace formateur" };

export default async function InstructorHome() {
  const { ctx, sessionIds } = await instructorScope();
  const d = await ctx.db(async (tx) => {
    const org = await orgInfo(tx, ctx.orgId);
    const today = todayISO(org.timezone);
    const sessions = sessionIds.length ? await tx.select({ s: courseSessions, c: courses.name }).from(courseSessions).innerJoin(courses, eq(courses.id, courseSessions.courseId)).where(inArray(courseSessions.id, sessionIds)).orderBy(asc(courseSessions.startDate)) : [];
    const upcoming = sessionIds.length
      ? await tx
          .select({ m: sessionMeetings, s: courseSessions.name })
          .from(sessionMeetings)
          .innerJoin(courseSessions, eq(courseSessions.id, sessionMeetings.sessionId))
          .where(and(inArray(sessionMeetings.sessionId, sessionIds), gte(sessionMeetings.date, today)))
          .orderBy(asc(sessionMeetings.date))
          .limit(8)
      : [];
    const sums = await loadEnrollmentSummaries(tx, ctx.orgId, { sessionIds, statuses: ["registered", "active"] }, org.timezone);
    return { sessions, upcoming, sums, today };
  });
  const rates = d.sums.map((s) => s.attendance.rate).filter((x): x is number => x !== null);
  return (
    <>
      <PageHeader title={`Bonjour ${ctx.user.firstName} 👋`} subtitle="Votre espace formateur" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Sessions" value={d.sessions.length} href="/instructor/sessions" />
        <Stat label="Étudiants actifs" value={d.sums.length} href="/instructor/students" />
        <Stat label="Présence moyenne" value={rates.length ? `${(rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(0)} %` : "—"} />
        <Stat label="À suivre" value={d.sums.filter((s) => s.risk.level === "high" || s.risk.level === "medium").length} tone="warn" />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Prochaines séances">
          {d.upcoming.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune séance à venir.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {d.upcoming.map(({ m, s }) => (
                <li key={m.id} className="flex items-center justify-between py-2">
                  <span>
                    <strong>{m.date === d.today ? "Aujourd'hui" : formatDate(m.date, { weekday: "short", day: "2-digit", month: "short" })}</strong> {m.startTime?.slice(0, 5)} — {s}
                    <span className="block text-xs text-slate-500">{m.topic}</span>
                  </span>
                  <Link href={`/instructor/attendance?session=${m.sessionId}&meeting=${m.id}`} className="btn-secondary btn-sm">
                    Présences
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Étudiants nécessitant un suivi" actions={<span className="text-xs text-slate-500">alerte, pas un diagnostic</span>}>
          {d.sums.filter((s) => s.risk.level !== "none").length === 0 ? (
            <p className="text-sm text-slate-500">Rien à signaler.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {d.sums
                .filter((s) => s.risk.level !== "none")
                .sort((a, b) => b.risk.score - a.risk.score)
                .slice(0, 8)
                .map((s) => (
                  <li key={s.enrollmentId} className="flex items-start justify-between gap-2">
                    <span>
                      {s.student.firstName} {s.student.lastName}
                      <span className="block text-xs text-slate-500">{s.risk.signals.map((x) => x.label).join(" · ")}</span>
                    </span>
                    <RiskBadge level={s.risk.level} />
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>
      <h2 className="mb-3 mt-6 font-semibold">Mes sessions</h2>
      {d.sessions.length === 0 ? (
        <Empty title="Aucune session ne vous est encore attribuée" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {d.sessions.map(({ s, c }) => (
            <Link key={s.id} href={`/instructor/sessions?session=${s.id}`} className="card p-4 hover:border-brand-300">
              <div className="flex justify-between gap-2">
                <span className="font-medium">{s.name}</span>
                <SessionStatusBadge value={s.status} />
              </div>
              <div className="text-xs text-slate-500">
                {c} · {formatDate(s.startDate)} → {formatDate(s.endDate)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
