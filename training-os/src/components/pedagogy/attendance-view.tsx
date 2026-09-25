import { and, asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { saveAttendanceAction } from "@/app/shared/pedagogy-actions";
import { Alert, Card, Empty } from "@/components/ui";
import { attendance, sessionMeetings } from "@/db/schema";
import type { OrgContext } from "@/lib/auth/context";
import { formatDate, todayISO } from "@/lib/format";
import { sessionOptions } from "@/server/lookups";
import { orgInfo } from "@/server/metrics";
import { loadEnrollmentSummaries } from "@/server/summaries";
import { AttendanceGrid } from "./attendance-grid";

/** Feuille de présence partagée (administration et formateur). */
export async function AttendanceView({ ctx, allowedSessionIds, sessionId, meetingId }: { ctx: OrgContext; allowedSessionIds?: string[]; sessionId?: string; meetingId?: string }) {
  const data = await ctx.db(async (tx) => {
    const org = await orgInfo(tx, ctx.orgId);
    const sessions = (await sessionOptions(tx, ctx.orgId, { ids: allowedSessionIds })).filter((s) => s.status !== "cancelled");
    const current = sessions.find((s) => s.id === sessionId) ?? sessions.find((s) => s.status === "in_progress") ?? null;
    if (!current) return { sessions, current: null, org };
    const meetings = await tx.select().from(sessionMeetings).where(eq(sessionMeetings.sessionId, current.id)).orderBy(asc(sessionMeetings.date), asc(sessionMeetings.startTime));
    const today = todayISO(org.timezone);
    const meeting =
      meetings.find((m) => m.id === meetingId) ?? [...meetings].reverse().find((m) => m.date <= today) ?? meetings[0] ?? null;
    const sums = await loadEnrollmentSummaries(tx, ctx.orgId, { sessionIds: [current.id], statuses: ["preregistered", "registered", "active", "completed"] }, org.timezone);
    const existing = meeting && sums.length
      ? await tx.select().from(attendance).where(and(eq(attendance.meetingId, meeting.id), inArray(attendance.enrollmentId, sums.map((s) => s.enrollmentId))))
      : [];
    return { sessions, current, meetings, meeting, sums, existing, today, org };
  });

  if (data.sessions.length === 0) return <Empty title="Aucune session disponible" />;
  const { sessions, current } = data;
  return (
    <div className="space-y-4">
      <form className="flex flex-wrap gap-2">
        <select name="session" defaultValue={current?.id} className="input w-auto max-w-md">
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.courseName} — {s.name}
            </option>
          ))}
        </select>
        <button className="btn-secondary">Choisir</button>
      </form>
      {!current || !("meetings" in data) ? (
        <Alert>Sélectionnez une session.</Alert>
      ) : data.meetings!.length === 0 ? (
        <Alert tone="amber">Aucune séance planifiée pour cette session. Ajoutez des séances depuis la page de la session.</Alert>
      ) : (
        <div className="grid gap-4 lg:grid-cols-4">
          <Card title="Séances" bodyClassName="max-h-[70vh] overflow-y-auto p-2">
            <ul className="space-y-0.5 text-sm">
              {data.meetings!.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`?session=${current.id}&meeting=${m.id}`}
                    className={`block rounded-lg px-2 py-1.5 ${m.id === data.meeting?.id ? "bg-brand-50 font-semibold text-brand-700" : "hover:bg-slate-50"} ${m.date > data.today! ? "text-slate-400" : ""}`}
                  >
                    {formatDate(m.date, { weekday: "short", day: "2-digit", month: "short" })}
                    <span className="block truncate text-xs font-normal text-slate-500">{m.topic}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <div className="lg:col-span-3">
            {data.meeting && (
              <>
                <h2 className="mb-3 font-semibold">
                  Séance du {formatDate(data.meeting.date, { weekday: "long", day: "numeric", month: "long" })} {data.meeting.topic ? `— ${data.meeting.topic}` : ""}
                </h2>
                {data.sums!.length === 0 ? (
                  <Empty title="Aucun étudiant inscrit à cette session" />
                ) : (
                  <AttendanceGrid
                    action={saveAttendanceAction}
                    meetingId={data.meeting.id}
                    rows={data.sums!.map((s) => {
                      const ex = data.existing!.find((e) => e.enrollmentId === s.enrollmentId);
                      return {
                        enrollmentId: s.enrollmentId,
                        name: `${s.student.lastName} ${s.student.firstName}`,
                        matricule: s.student.matricule,
                        status: ex?.status ?? null,
                        note: ex?.note ?? null,
                        stats: `Présence ${s.attendance.rate ?? "—"} % · ${s.attendance.absent} abs. · ${s.attendance.late} retard(s) · ${s.attendance.attended}/${s.attendance.total} séances`,
                        alert: s.attendance.consecutiveAbsences >= 2,
                      };
                    })}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

