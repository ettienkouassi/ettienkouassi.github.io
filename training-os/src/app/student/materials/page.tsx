import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { Card, Empty, PageHeader } from "@/components/ui";
import { courseModules, materials } from "@/db/schema";
import { studentScope } from "../scope";

export const metadata = { title: "Mes supports" };

export default async function Page() {
  const { ctx, sums } = await studentScope();
  const valid = sums.filter((s) => ["registered", "active", "completed"].includes(s.status));
  const list = valid.length
    ? await ctx.db((tx) =>
        tx
          .select({ m: materials, module: courseModules.title, pos: courseModules.position })
          .from(materials)
          .leftJoin(courseModules, eq(courseModules.id, materials.moduleId))
          .where(
            and(
              eq(materials.visibility, "students"),
              inArray(materials.courseId, valid.map((s) => s.course.id)),
              or(isNull(materials.sessionId), inArray(materials.sessionId, valid.map((s) => s.session.id))),
            ),
          ),
      )
    : [];
  if (!list.length) return <Empty title="Aucun support disponible" />;
  return (
    <>
      <PageHeader title="Mes supports" />
      <div className="space-y-4">
        {valid.map((s) => {
          const items = list.filter((l) => l.m.courseId === s.course.id).sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99));
          if (!items.length) return null;
          return (
            <Card key={s.enrollmentId} title={s.course.name}>
              <ul className="divide-y divide-slate-100">
                {items.map(({ m, module }) => (
                  <li key={m.id} className="py-2 text-sm">
                    {m.kind === "file" ? (
                      <a className="link" href={`/api/files/material/${m.id}`} target="_blank" rel="noopener">
                        📄 {m.title}
                      </a>
                    ) : (
                      <a className="link" href={m.url!} target="_blank" rel="noopener noreferrer nofollow">
                        🔗 {m.title}
                      </a>
                    )}
                    <span className="block text-xs text-slate-500">{module ?? "Général"}</span>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </>
  );
}
