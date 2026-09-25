import { asc, eq } from "drizzle-orm";
import { saveProgressAction } from "@/app/shared/pedagogy-actions";
import { Form, Submit } from "@/components/form";
import { Card, Empty, ProgressBar } from "@/components/ui";
import { courseModules } from "@/db/schema";
import type { OrgContext } from "@/lib/auth/context";
import { sessionOptions } from "@/server/lookups";
import { orgInfo } from "@/server/metrics";
import { loadEnrollmentSummaries } from "@/server/summaries";

/** Grille de progression par module (§14) : saisie du % de chaque module par étudiant. */
export async function ProgressView({ ctx, allowedSessionIds, sessionId }: { ctx: OrgContext; allowedSessionIds?: string[]; sessionId?: string }) {
  const data = await ctx.db(async (tx) => {
    const org = await orgInfo(tx, ctx.orgId);
    const sessions = await sessionOptions(tx, ctx.orgId, { ids: allowedSessionIds });
    const current = sessions.find((s) => s.id === sessionId) ?? sessions.find((s) => s.status === "in_progress") ?? sessions[0];
    if (!current) return { sessions, current: null };
    const mods = await tx.select().from(courseModules).where(eq(courseModules.courseId, current.courseId)).orderBy(asc(courseModules.position));
    const sums = await loadEnrollmentSummaries(tx, ctx.orgId, { sessionIds: [current.id], statuses: ["registered", "active", "completed"] }, org.timezone);
    return { sessions, current, mods, sums };
  });
  if (!data.current) return <Empty title="Aucune session" />;
  return (
    <div className="space-y-4">
      <form className="flex gap-2">
        <input type="hidden" name="tab" value="progress" />
        <select name="session" defaultValue={data.current.id} className="input w-auto max-w-md">
          {data.sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.courseName} — {s.name}
            </option>
          ))}
        </select>
        <button className="btn-secondary">Choisir</button>
      </form>
      <Card title="Progression par module (%)" bodyClassName="overflow-x-auto p-0">
        {data.sums!.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">Aucun étudiant.</p>
        ) : (
          <Form action={saveProgressAction} className="space-y-3 p-3">
            <input type="hidden" name="sessionId" value={data.current.id} />
            <table className="table">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-slate-50">Étudiant</th>
                  {data.mods!.map((m) => (
                    <th key={m.id} className="min-w-20 text-center" title={m.title}>
                      M{m.position}
                    </th>
                  ))}
                  <th className="min-w-36">Global</th>
                </tr>
              </thead>
              <tbody>
                {data.sums!.map((s) => (
                  <tr key={s.enrollmentId}>
                    <td className="sticky left-0 whitespace-nowrap bg-white">
                      {s.student.lastName} {s.student.firstName}
                    </td>
                    {s.modules.map((m) => (
                      <td key={m.id} className="text-center">
                        <input name={`p_${s.enrollmentId}_${m.id}`} type="number" min={0} max={100} step={5} defaultValue={m.percent} className="input w-16 px-1 py-1 text-center text-xs" aria-label={`${m.title} — ${s.student.firstName}`} />
                      </td>
                    ))}
                    <td>
                      <ProgressBar value={s.progress.global} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              {data.mods!.map((m) => (
                <li key={m.id}>
                  M{m.position} : {m.title}
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <Submit>Enregistrer la progression</Submit>
            </div>
          </Form>
        )}
      </Card>
    </div>
  );
}
