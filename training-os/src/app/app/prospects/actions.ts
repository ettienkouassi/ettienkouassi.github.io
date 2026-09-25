"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { courses, prospects, students } from "@/db/schema";
import { parseForm, toActionError, UserError, zId, zOptDate, zOptEmail, zOptText, zPhone, zText, type ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requireOrg, STAFF } from "@/lib/auth/context";
import { LABELS } from "@/lib/format";
import { nextCounter } from "@/server/certificates";
import { assertPlanLimit } from "@/server/limits";

const STATUSES = ["new", "contacted", "interested", "offer_sent", "preregistered", "enrolled", "client", "lost"] as const;

const schema = z.object({
  id: zId.optional(),
  firstName: zText(80, "Le prénom"),
  lastName: zText(80, "Le nom"),
  phone: zPhone,
  email: zOptEmail,
  desiredCourseId: zId.optional(),
  source: zOptText(80),
  status: z.enum(STATUSES),
  nextAction: zOptText(200),
  nextActionAt: zOptDate,
  notes: zOptText(2000),
});

export async function saveProspectAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF, "prospects.write");
    const { data, state } = parseForm(schema, fd);
    if (!data) return state!;
    await ctx.db(async (tx) => {
      if (data.desiredCourseId) {
        const [c] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, data.desiredCourseId)).limit(1);
        if (!c) throw new UserError("Formation invalide.");
      }
      const { id, ...v } = data;
      const values = { ...v, phone: v.phone ?? null, email: v.email ?? null, desiredCourseId: v.desiredCourseId ?? null, nextActionAt: v.nextActionAt ?? null };
      if (id) {
        const [before] = await tx.select().from(prospects).where(eq(prospects.id, id)).limit(1);
        if (!before) throw new UserError("Prospect introuvable.");
        await tx.update(prospects).set({ ...values, lastContactAt: before.status !== values.status ? new Date() : before.lastContactAt }).where(eq(prospects.id, id));
        if (before.status !== values.status)
          await audit(tx, ctx.user, ctx.orgId, {
            action: "prospect.status",
            entityType: "prospect",
            entityId: id,
            summary: `${ctx.user.firstName} ${ctx.user.lastName} a passé ${values.firstName} ${values.lastName} de « ${LABELS.prospectStatus[before.status]} » à « ${LABELS.prospectStatus[values.status]} »`,
          });
      } else {
        const [p] = await tx.insert(prospects).values({ ...values, organizationId: ctx.orgId, assignedTo: ctx.user.id }).returning();
        await audit(tx, ctx.user, ctx.orgId, { action: "prospect.create", entityType: "prospect", entityId: p.id, summary: `${ctx.user.firstName} ${ctx.user.lastName} a ajouté le prospect ${p.firstName} ${p.lastName}` });
      }
    });
    revalidatePath("/app/prospects");
    return { ok: true, message: "Prospect enregistré." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function moveProspectAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF, "prospects.write");
    const id = zId.parse(fd.get("id"));
    const status = z.enum(STATUSES).parse(fd.get("status"));
    await ctx.db(async (tx) => {
      const [p] = await tx.update(prospects).set({ status, lastContactAt: new Date() }).where(eq(prospects.id, id)).returning();
      if (!p) throw new UserError("Prospect introuvable.");
      await audit(tx, ctx.user, ctx.orgId, { action: "prospect.status", entityType: "prospect", entityId: id, summary: `${p.firstName} ${p.lastName} → ${LABELS.prospectStatus[status]}` });
    });
    revalidatePath("/app/prospects");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

/** Convertit un prospect en étudiant puis ouvre le formulaire d'inscription pré-rempli. */
export async function convertProspectAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let target: string;
  try {
    const ctx = await requireOrg(STAFF, "students.write");
    const id = zId.parse(fd.get("id"));
    target = await ctx.db(async (tx) => {
      const [p] = await tx.select().from(prospects).where(eq(prospects.id, id)).limit(1);
      if (!p) throw new UserError("Prospect introuvable.");
      let studentId = p.convertedStudentId;
      if (!studentId) {
        await assertPlanLimit(tx, ctx.orgId, "students");
        const year = new Date().getUTCFullYear();
        const n = await nextCounter(tx, ctx.orgId, `student-${year}`);
        const [s] = await tx
          .insert(students)
          .values({ organizationId: ctx.orgId, matricule: `ETU-${year}-${String(n).padStart(5, "0")}`, firstName: p.firstName, lastName: p.lastName, phone: p.phone, email: p.email, leadSource: p.source })
          .returning();
        studentId = s.id;
        await tx.update(prospects).set({ convertedStudentId: s.id, status: "preregistered" }).where(eq(prospects.id, p.id));
        await audit(tx, ctx.user, ctx.orgId, { action: "prospect.convert", entityType: "student", entityId: s.id, summary: `${ctx.user.firstName} ${ctx.user.lastName} a converti le prospect ${p.firstName} ${p.lastName} en étudiant (${s.matricule})` });
      }
      return `/app/enrollments/new?student=${studentId}&prospect=${p.id}${p.desiredCourseId ? `&course=${p.desiredCourseId}` : ""}`;
    });
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/app/prospects");
  redirect(target);
}
