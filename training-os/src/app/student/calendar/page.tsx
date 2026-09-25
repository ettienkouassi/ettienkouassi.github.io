import { asc, eq, inArray } from "drizzle-orm";
import { Card, Empty, PageHeader } from "@/components/ui";
import { attendance, courseSessions, sessionMeetings } from "@/db/schema";
import { formatDate, LABELS, todayISO } from "@/lib/format";
import { studentScope } from "../scope";

export const metadata = { title: "Mon calendrier" };

export default async function Page() {
  const { ctx, org, sums } = await studentScope();
  const sessionIds = sums.filter((s) => s.status !== "dropped").map((s) => s.session.id);
  const enrIds = sums.map((s) => s.enrollmentId);
  const d = await ctx.db(async (tx) => ({
    meetings: sessionIds.length
      ? await tx.select({ m: sessionMeetings, s: courseSessions }).from(sessionMeetings).innerJoin(courseSessions, eq(courseSessions.id, sessionMeetings.sessionId)).where(inArray(sessionMeetings.sessionId, sessionIds)).orderBy(asc(sessionMeetings.date), asc(sessionMeetings.startTime))
      : [],
    att: enrIds.length ? await tx.select().from(attendance).where(inArray(attendance.enrollmentId, enrIds)) : [],
  }));
  if (!d.meetings.length) return <Empty title="Aucune séance planifiée" />;
  const today = todayISO(org.timezone);
  const byMonth = new Map<string, typeof d.meetings>();
  for (const x of d.meetings) (byMonth.get(x.m.date.slice(0, 7)) ?? byMonth.set(x.m.date.slice(0, 7), []).get(x.m.date.slice(0, 7))!).push(x);
  return (
    <>
      <PageHeader title="Mon calendrier" />
      <div className="space-y-4">
        {[...byMonth.entries()].map(([month, items]) => (
          <Card key={month} title={formatDate(`${month}-01`, { month: "long", year: "numeric" })}>
            <ul className="divide-y divide-slate-100 text-sm">
              {items.map(({ m, s }) => {
                const a = d.att.find((x) => x.meetingId === m.id);
                return (
                  <li key={m.id} className={`flex items-center justify-between py-2 ${m.date < today ? "text-slate-500" : ""}`}>
                    <span>
                      <strong>{formatDate(m.date, { weekday: "short", day: "2-digit" })}</strong> {m.startTime?.slice(0, 5)}–{m.endTime?.slice(0, 5)} · {s.name}
                      <span className="block text-xs">
                        {m.topic} {s.room ? `· ${s.room}` : ""}
                      </span>
                    </span>
                    <span className="text-xs">{a ? LABELS.attendanceStatus[a.status] : m.date === today ? "Aujourd'hui" : ""}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
