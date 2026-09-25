"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { courseModules, courses, courseSessions, instructors, sessionMeetings } from "@/db/schema";
import { parseForm, toActionError, UserError, zDate, zId, zInt, zOptText, zText, zTime, type ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requireOrg, STAFF } from "@/lib/auth/context";
import { generateMeetingDates, WEEKDAYS } from "@/lib/domain/schedule";

const sessionSchema = z
  .object({
    id: zId.optional(),
    courseId: zId,
    name: zText(150, "Le nom"),
    startDate: zDate,
    endDate: zDate,
    days: z.array(z.coerce.number().int().min(0).max(6)).optional(),
    startTime: zTime,
    endTime: zTime,
    room: zOptText(80),
    instructorId: zId.optional(),
    capacity: zInt(1, 10000),
    status: z.enum(["draft", "open", "full", "in_progress", "completed", "cancelled"]),
  })
  .refine((v) => v.endDate >= v.startDate, { message: "La date de fin doit suivre la date de début", path: ["endDate"] });

export async function saveSessionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const ctx = await requireOrg(STAFF, "sessions.write");
    const { data, state } = parseForm(sessionSchema, fd);
    if (!data) return state!;
    id = await ctx.db(async (tx) => {
      const [c] = await tx.select().from(courses).where(and(eq(courses.id, data.courseId), eq(courses.organizationId, ctx.orgId))).limit(1);
      if (!c) throw new UserError("Formation invalide.");
      if (data.instructorId) {
        const [i] = await tx.select({ id: instructors.id }).from(instructors).where(eq(instructors.id, data.instructorId)).limit(1);
        if (!i) throw new UserError("Formateur invalide.");
      }
      const days = (data.days ?? []).map((d) => WEEKDAYS.find((w) => w.v === d)?.label).filter(Boolean).join(", ");
      const values = {
        courseId: c.id,
        name: data.name,
        startDate: data.startDate,
        endDate: data.endDate,
        days: days || null,
        startTime: data.startTime ?? null,
        endTime: data.endTime ?? null,
        room: data.room ?? null,
        instructorId: data.instructorId ?? null,
        capacity: data.capacity,
        status: data.status,
      };
      if (data.id) {
        const [s] = await tx.update(courseSessions).set(values).where(eq(courseSessions.id, data.id)).returning();
        if (!s) throw new UserError("Session introuvable.");
        await audit(tx, ctx.user, ctx.orgId, { action: "session.update", entityType: "session", entityId: s.id, summary: `${ctx.user.firstName} ${ctx.user.lastName} a modifié la session ${s.name}` });
        return s.id;
      }
      const [s] = await tx.insert(courseSessions).values({ ...values, organizationId: ctx.orgId }).returning();
      // Génère automatiquement les séances si des jours sont fournis
      if (data.days?.length) {
        const dates = generateMeetingDates(data.startDate, data.endDate, data.days);
        const mods = await tx.select().from(courseModules).where(eq(courseModules.courseId, c.id)).orderBy(courseModules.position);
        if (dates.length)
          await tx.insert(sessionMeetings).values(
            dates.map((date, i) => {
              const m = mods.length ? mods[Math.min(mods.length - 1, Math.floor((i / dates.length) * mods.length))] : null;
              return { organizationId: ctx.orgId, sessionId: s.id, date, startTime: data.startTime ?? null, endTime: data.endTime ?? null, moduleId: m?.id ?? null, topic: m?.title ?? null };
            }),
          );
      }
      await audit(tx, ctx.user, ctx.orgId, { action: "session.create", entityType: "session", entityId: s.id, summary: `${ctx.user.firstName} ${ctx.user.lastName} a créé la session ${s.name}` });
      return s.id;
    });
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/app/sessions");
  redirect(`/app/sessions/${id}`);
}

export async function addMeetingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF, "sessions.write");
    const { data, state } = parseForm(z.object({ sessionId: zId, date: zDate, startTime: zTime, endTime: zTime, topic: zOptText(200), moduleId: zId.optional() }), fd);
    if (!data) return state!;
    await ctx.db(async (tx) => {
      const [s] = await tx.select().from(courseSessions).where(eq(courseSessions.id, data.sessionId)).limit(1);
      if (!s) throw new UserError("Session introuvable.");
      await tx.insert(sessionMeetings).values({ organizationId: ctx.orgId, ...data, startTime: data.startTime ?? s.startTime, endTime: data.endTime ?? s.endTime });
    });
    revalidatePath(`/app/sessions/${data.sessionId}`);
    return { ok: true, message: "Séance ajoutée." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteMeetingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF, "sessions.write");
    const id = zId.parse(fd.get("id"));
    const r = await ctx.db(async (tx) => {
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(sql`attendance`).where(sql`meeting_id = ${id}`);
      if (n > 0) throw new UserError("Des présences sont déjà saisies pour cette séance : suppression impossible.");
      return tx.delete(sessionMeetings).where(eq(sessionMeetings.id, id)).returning();
    });
    if (r[0]) revalidatePath(`/app/sessions/${r[0].sessionId}`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
