import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { deleteMaterialAction, saveMaterialAction } from "@/app/shared/material-actions";
import { ActionButton, Field, Form, Select, Submit } from "@/components/form";
import { Badge, Card, Empty } from "@/components/ui";
import { courseModules, courses, materials } from "@/db/schema";
import type { OrgContext } from "@/lib/auth/context";
import { formatDate, LABELS } from "@/lib/format";

/** Supports pédagogiques (§15) — administration et formateurs. */
export async function MaterialsView({ ctx, allowedCourseIds }: { ctx: OrgContext; allowedCourseIds?: string[] }) {
  const data = await ctx.db(async (tx) => {
    const cs = await tx
      .select({ id: courses.id, name: courses.name })
      .from(courses)
      .where(and(eq(courses.organizationId, ctx.orgId), allowedCourseIds ? inArray(courses.id, allowedCourseIds.length ? allowedCourseIds : ["00000000-0000-0000-0000-000000000000"]) : undefined))
      .orderBy(asc(courses.name));
    const ids = cs.map((c) => c.id);
    const list = ids.length
      ? await tx
          .select({ m: materials, course: courses.name, module: courseModules.title })
          .from(materials)
          .innerJoin(courses, eq(courses.id, materials.courseId))
          .leftJoin(courseModules, eq(courseModules.id, materials.moduleId))
          .where(and(inArray(materials.courseId, ids), ctx.role === "instructor" ? inArray(materials.visibility, ["students", "instructors"]) : undefined))
          .orderBy(asc(courses.name), desc(materials.createdAt))
      : [];
    const mods = ids.length ? await tx.select({ id: courseModules.id, title: courseModules.title, courseId: courseModules.courseId, course: courses.name }).from(courseModules).innerJoin(courses, eq(courses.id, courseModules.courseId)).where(inArray(courseModules.courseId, ids)).orderBy(asc(courses.name), asc(courseModules.position)) : [];
    return { cs, list, mods };
  });
  const vis = Object.entries(LABELS.visibility).filter(([v]) => ctx.role !== "instructor" || v !== "admin");
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        {data.list.length === 0 ? (
          <Empty title="Aucun support" />
        ) : (
          <div className="card divide-y divide-slate-100">
            {data.list.map(({ m, course, module }) => (
              <div key={m.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="font-medium">
                    {m.kind === "file" ? "📄" : "🔗"}{" "}
                    {m.kind === "file" ? (
                      <a className="link" href={`/api/files/material/${m.id}`} target="_blank" rel="noopener">
                        {m.title}
                      </a>
                    ) : (
                      <a className="link" href={m.url!} target="_blank" rel="noopener noreferrer nofollow">
                        {m.title}
                      </a>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    {course}
                    {module ? ` · ${module}` : ""} · {formatDate(m.createdAt)}
                    {m.sizeBytes ? ` · ${(m.sizeBytes / 1024 / 1024).toFixed(1)} Mo` : ""}
                    {m.indexedChunks > 0 ? ` · indexé IA (${m.indexedChunks})` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={m.visibility === "students" ? "green" : m.visibility === "instructors" ? "blue" : "amber"}>{LABELS.visibility[m.visibility]}</Badge>
                  {(ctx.role !== "instructor" || m.uploadedBy === ctx.user.id) && (
                    <ActionButton action={deleteMaterialAction} hidden={{ id: m.id }} className="btn-ghost btn-sm text-red-600" confirm="Supprimer ce support ?">
                      ✕
                    </ActionButton>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Card title="Déposer un support">
        {data.cs.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune formation disponible.</p>
        ) : (
          <Form action={saveMaterialAction} resetOnSuccess>
            <Field name="title" label="Titre" required />
            <Select name="courseId" label="Formation" required options={data.cs.map((c) => ({ value: c.id, label: c.name }))} placeholder="Choisir…" />
            <Select name="moduleId" label="Module (facultatif)" options={data.mods.map((m) => ({ value: m.id, label: `${m.course} — ${m.title}` }))} placeholder="—" />
            <Select name="visibility" label="Visibilité" required options={vis.map(([value, label]) => ({ value, label }))} defaultValue="students" />
            <Field name="file" label="Fichier" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.mp4,.webm,.txt" hint="PDF, Word, PowerPoint, Excel, images, vidéos (50 Mo max). Les PDF/Word sont indexés pour l'assistant IA." />
            <Field name="url" label="…ou lien" type="url" placeholder="https://" />
            <Submit className="btn-primary w-full" pendingText="Envoi…">
              Déposer
            </Submit>
          </Form>
        )}
      </Card>
    </div>
  );
}
