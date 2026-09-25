"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { courseModules, courseRecommendations, courses, instructors } from "@/db/schema";
import { parseForm, toActionError, UserError, zBool, zId, zInt, zMoney, zOptText, zText, type ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requireOrg, STAFF } from "@/lib/auth/context";
import { slugify } from "@/lib/format";
import type { Tx } from "@/db/tenant";
import { assertPlanLimit } from "@/server/limits";

const courseSchema = z
  .object({
    name: zText(150, "Le nom"),
    description: zOptText(4000),
    category: zOptText(80),
    level: zOptText(80),
    durationHours: zInt(0, 5000),
    price: zMoney,
    capacity: zInt(1, 10000).optional(),
    prerequisites: zOptText(2000),
    objectives: zOptText(4000),
    program: zOptText(10000),
    instructorId: zId.optional(),
    status: z.enum(["draft", "published", "archived"]),
    isPublic: zBool,
    certMinAttendance: zInt(0, 100),
    certMinGrade: zInt(0, 100),
    certRequireAllModules: zBool,
    certRequireFinalExam: zBool,
    certRequireFullPayment: zBool,
    certAutoIssue: zBool,
    weightAttendance: zInt(0, 100),
    weightModules: zInt(0, 100),
    weightAssessments: zInt(0, 100),
  })
  .refine((v) => v.weightAttendance + v.weightModules + v.weightAssessments === 100, { message: "La somme des pondérations doit faire 100", path: ["weightAssessments"] });

async function checkInstructor(tx: Tx, orgId: string, id?: string) {
  if (!id) return;
  const [i] = await tx.select({ id: instructors.id }).from(instructors).where(and(eq(instructors.id, id), eq(instructors.organizationId, orgId))).limit(1);
  if (!i) throw new UserError("Formateur invalide.");
}

export async function saveCourseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const ctx = await requireOrg(STAFF, "courses.write");
    const { data, state } = parseForm(courseSchema.and(z.object({ id: zId.optional() })), fd);
    if (!data) return state!;
    id = await ctx.db(async (tx) => {
      await checkInstructor(tx, ctx.orgId, data.instructorId);
      const { id: existingId, ...values } = data;
      const payload = { ...values, instructorId: values.instructorId ?? null, capacity: values.capacity ?? null };
      if (existingId) {
        const [c] = await tx.update(courses).set(payload).where(and(eq(courses.id, existingId), eq(courses.organizationId, ctx.orgId))).returning();
        if (!c) throw new UserError("Formation introuvable.");
        await audit(tx, ctx.user, ctx.orgId, { action: "course.update", entityType: "course", entityId: c.id, summary: `${ctx.user.firstName} ${ctx.user.lastName} a modifié la formation ${c.name}` });
        return c.id;
      }
      await assertPlanLimit(tx, ctx.orgId, "courses");
      let slug = slugify(values.name) || "formation";
      const [dup] = await tx.select({ n: sql<number>`count(*)::int` }).from(courses).where(and(eq(courses.organizationId, ctx.orgId), sql`${courses.slug} like ${slug + "%"}`));
      if (dup.n > 0) slug = `${slug}-${dup.n + 1}`;
      const [c] = await tx.insert(courses).values({ ...payload, organizationId: ctx.orgId, slug }).returning();
      await audit(tx, ctx.user, ctx.orgId, { action: "course.create", entityType: "course", entityId: c.id, summary: `${ctx.user.firstName} ${ctx.user.lastName} a créé la formation ${c.name}` });
      return c.id;
    });
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/app/courses");
  redirect(`/app/courses/${id}`);
}

export async function addModuleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF, "courses.write");
    const { data, state } = parseForm(z.object({ courseId: zId, title: zText(150, "Le titre"), description: zOptText(1000), durationHours: zInt(0, 1000).optional() }), fd);
    if (!data) return state!;
    await ctx.db(async (tx) => {
      const [c] = await tx.select().from(courses).where(eq(courses.id, data.courseId)).limit(1);
      if (!c) throw new UserError("Formation introuvable.");
      const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${courseModules.position}),0)::int` }).from(courseModules).where(eq(courseModules.courseId, c.id));
      await tx.insert(courseModules).values({ organizationId: ctx.orgId, courseId: c.id, position: max + 1, title: data.title, description: data.description, durationHours: data.durationHours });
      await audit(tx, ctx.user, ctx.orgId, { action: "course.module_add", entityType: "course", entityId: c.id, summary: `Module « ${data.title} » ajouté à ${c.name}` });
    });
    revalidatePath(`/app/courses/${data.courseId}`);
    return { ok: true, message: "Module ajouté." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function moveModuleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF, "courses.write");
    const id = zId.parse(fd.get("id"));
    const dir = fd.get("dir") === "up" ? -1 : 1;
    const courseId = await ctx.db(async (tx) => {
      const [m] = await tx.select().from(courseModules).where(eq(courseModules.id, id)).limit(1);
      if (!m) throw new UserError("Module introuvable.");
      const [other] = await tx
        .select()
        .from(courseModules)
        .where(and(eq(courseModules.courseId, m.courseId), eq(courseModules.position, m.position + dir)))
        .limit(1);
      if (other) {
        await tx.update(courseModules).set({ position: m.position }).where(eq(courseModules.id, other.id));
        await tx.update(courseModules).set({ position: other.position }).where(eq(courseModules.id, m.id));
      }
      return m.courseId;
    });
    revalidatePath(`/app/courses/${courseId}`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteModuleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF, "courses.write");
    const id = zId.parse(fd.get("id"));
    const courseId = await ctx.db(async (tx) => {
      const [m] = await tx.delete(courseModules).where(eq(courseModules.id, id)).returning();
      if (!m) throw new UserError("Module introuvable.");
      // renumérotation
      await tx.execute(sql`update course_modules set position = position - 1 where course_id = ${m.courseId} and position > ${m.position}`);
      await audit(tx, ctx.user, ctx.orgId, { action: "course.module_delete", entityType: "course", entityId: m.courseId, summary: `Module « ${m.title} » supprimé` });
      return m.courseId;
    });
    revalidatePath(`/app/courses/${courseId}`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function addRecommendationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF, "courses.write");
    const { data, state } = parseForm(z.object({ fromCourseId: zId, toCourseId: zId, reason: zOptText(300) }), fd);
    if (!data) return state!;
    if (data.fromCourseId === data.toCourseId) return { error: "Choisissez une autre formation." };
    await ctx.db(async (tx) => {
      await tx.insert(courseRecommendations).values({ organizationId: ctx.orgId, ...data }).onConflictDoNothing();
    });
    revalidatePath(`/app/courses/${data.fromCourseId}`);
    return { ok: true, message: "Recommandation ajoutée." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteRecommendationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF, "courses.write");
    const id = zId.parse(fd.get("id"));
    const r = await ctx.db((tx) => tx.delete(courseRecommendations).where(eq(courseRecommendations.id, id)).returning());
    if (r[0]) revalidatePath(`/app/courses/${r[0].fromCourseId}`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
