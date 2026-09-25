"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { courseModules, courseSessions, courses, materials } from "@/db/schema";
import { parseForm, toActionError, UserError, zId, zOptText, zText, zUrl, type ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requireOrg, STAFF_AND_INSTRUCTOR } from "@/lib/auth/context";
import { validateUpload } from "@/lib/security/upload";
import { deleteObject, makeKey, putObject } from "@/lib/storage";
import { extractText, indexMaterial } from "@/server/material-index";
import { instructorSessionIds } from "@/server/summaries";

export async function saveMaterialAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let uploadedKey: string | null = null;
  try {
    const ctx = await requireOrg(STAFF_AND_INSTRUCTOR, "materials.write");
    const { data, state } = parseForm(
      z.object({
        courseId: zId,
        moduleId: zId.optional(),
        sessionId: zId.optional(),
        title: zText(200, "Le titre"),
        description: zOptText(1000),
        url: zUrl,
        visibility: z.enum(["students", "instructors", "admin"]),
      }),
      fd,
    );
    if (!data) return state!;
    if (ctx.role === "instructor" && data.visibility === "admin") return { error: "Un formateur ne peut pas créer de support privé administrateur." };
    const file = fd.get("file");
    const hasFile = file instanceof File && file.size > 0;
    if (!hasFile && !data.url) return { error: "Ajoutez un fichier ou un lien." };

    let upload: { buffer: Buffer; mime: string; ext: string } | null = null;
    if (hasFile) {
      upload = await validateUpload(file as File, "material");
      uploadedKey = makeKey(ctx.orgId, "materials", upload.ext);
      await putObject(uploadedKey, upload.buffer, upload.mime);
    }
    const text = upload ? await extractText(upload.buffer, upload.mime) : "";
    const res = await ctx.db(async (tx) => {
      const [c] = await tx.select().from(courses).where(and(eq(courses.id, data.courseId), eq(courses.organizationId, ctx.orgId))).limit(1);
      if (!c) throw new UserError("Formation invalide.");
      if (ctx.role === "instructor") {
        const ids = await instructorSessionIds(tx, ctx.instructorId);
        const ok = ids.length && (await tx.select({ id: courseSessions.id }).from(courseSessions).where(and(inArray(courseSessions.id, ids), eq(courseSessions.courseId, c.id))).limit(1)).length;
        if (!ok) throw new UserError("Cette formation ne vous est pas attribuée.");
      }
      if (data.moduleId) {
        const [m] = await tx.select().from(courseModules).where(and(eq(courseModules.id, data.moduleId), eq(courseModules.courseId, c.id))).limit(1);
        if (!m) throw new UserError("Module invalide.");
      }
      if (data.sessionId) {
        const [s] = await tx.select().from(courseSessions).where(and(eq(courseSessions.id, data.sessionId), eq(courseSessions.courseId, c.id))).limit(1);
        if (!s) throw new UserError("Session invalide.");
      }
      const [m] = await tx
        .insert(materials)
        .values({
          organizationId: ctx.orgId,
          courseId: c.id,
          moduleId: data.moduleId ?? null,
          sessionId: data.sessionId ?? null,
          title: data.title,
          description: data.description,
          kind: upload ? "file" : "link",
          storageKey: uploadedKey,
          fileName: upload ? (file as File).name.slice(0, 200) : null,
          mimeType: upload?.mime ?? null,
          sizeBytes: upload ? (file as File).size : null,
          url: upload ? null : data.url,
          visibility: data.visibility,
          uploadedBy: ctx.user.id,
        })
        .returning();
      const chunks = text ? await indexMaterial(tx, m, text) : 0;
      await audit(tx, ctx.user, ctx.orgId, { action: "material.create", entityType: "material", entityId: m.id, summary: `${ctx.user.firstName} ${ctx.user.lastName} a déposé le support « ${m.title} » (${c.name})` });
      return chunks;
    });
    revalidatePath("/app/materials");
    revalidatePath("/instructor/materials");
    return { ok: true, message: `Support enregistré.${res ? ` ${res} passage(s) indexé(s) pour l'assistant IA.` : ""}` };
  } catch (e) {
    if (uploadedKey) await deleteObject(uploadedKey);
    return toActionError(e);
  }
}

export async function deleteMaterialAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF_AND_INSTRUCTOR, "materials.write");
    const id = zId.parse(fd.get("id"));
    const key = await ctx.db(async (tx) => {
      const [m] = await tx.select().from(materials).where(eq(materials.id, id)).limit(1);
      if (!m) throw new UserError("Support introuvable.");
      if (ctx.role === "instructor" && m.uploadedBy !== ctx.user.id) throw new UserError("Vous ne pouvez supprimer que vos propres supports.");
      await tx.delete(materials).where(eq(materials.id, id));
      await audit(tx, ctx.user, ctx.orgId, { action: "material.delete", entityType: "material", entityId: id, summary: `${ctx.user.firstName} ${ctx.user.lastName} a supprimé le support « ${m.title} »` });
      return m.storageKey;
    });
    if (key) await deleteObject(key);
    revalidatePath("/app/materials");
    revalidatePath("/instructor/materials");
    return { ok: true, message: "Support supprimé." };
  } catch (e) {
    return toActionError(e);
  }
}
