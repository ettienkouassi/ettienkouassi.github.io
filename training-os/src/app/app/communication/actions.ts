"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { enrollments, messageTemplates, organizations, students } from "@/db/schema";
import { parseForm, toActionError, UserError, zBool, zId, type ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requireOrg, STAFF } from "@/lib/auth/context";
import { rateLimit } from "@/lib/security/rate-limit";
import { deliverQueued, DEFAULT_TEMPLATES, notify, queueEmail } from "@/server/communications";

export async function saveTemplateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF, "communications.send");
    const { data, state } = parseForm(z.object({ key: z.string().refine((k) => k in DEFAULT_TEMPLATES, "Modèle inconnu"), subject: z.string().min(1).max(200), body: z.string().min(1).max(5000), isActive: zBool }), fd);
    if (!data) return state!;
    await ctx.db(async (tx) => {
      await tx
        .insert(messageTemplates)
        .values({ organizationId: ctx.orgId, key: data.key, name: DEFAULT_TEMPLATES[data.key].name, subject: data.subject, body: data.body, isActive: data.isActive })
        .onConflictDoUpdate({ target: [messageTemplates.organizationId, messageTemplates.key], set: { subject: data.subject, body: data.body, isActive: data.isActive } });
      await audit(tx, ctx.user, ctx.orgId, { action: "template.update", entityType: "template", entityId: data.key, summary: `${ctx.user.firstName} ${ctx.user.lastName} a modifié le modèle « ${DEFAULT_TEMPLATES[data.key].name} »` });
    });
    revalidatePath("/app/communication");
    return { ok: true, message: "Modèle enregistré." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function sendMessageAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF, "communications.send");
    const { data, state } = parseForm(
      z.object({ sessionId: zId.optional(), subject: z.string().min(1, "Objet obligatoire").max(200), message: z.string().min(1, "Message obligatoire").max(5000), notifyApp: zBool }),
      fd,
    );
    if (!data) return state!;
    const rl = await rateLimit(`bulk-mail:${ctx.orgId}`, 20, 3600);
    if (!rl.allowed) throw new UserError("Limite d'envois groupés atteinte pour l'heure en cours.");
    const ids = await ctx.db(async (tx) => {
      const [org] = await tx.select().from(organizations).where(eq(organizations.id, ctx.orgId)).limit(1);
      const recipients = data.sessionId
        ? await tx
            .select({ s: students })
            .from(enrollments)
            .innerJoin(students, eq(students.id, enrollments.studentId))
            .where(and(eq(enrollments.sessionId, data.sessionId), inArray(enrollments.status, ["preregistered", "registered", "active"])))
        : await tx.select({ s: students }).from(students).where(and(eq(students.organizationId, ctx.orgId), eq(students.isActive, true)));
      if (recipients.length === 0) throw new UserError("Aucun destinataire.");
      const batch = Date.now();
      const out: (string | null)[] = [];
      for (const { s } of recipients) {
        out.push(await queueEmail(tx, ctx.orgId, { templateKey: "custom", to: s.email, studentId: s.id, createdBy: ctx.user.id, dedupeKey: `custom:${batch}:${s.id}`, vars: { prenom: s.firstName, objet: data.subject, message: data.message.replace(/\r/g, ""), centre: org.name } }));
        if (data.notifyApp && s.userId) await notify(tx, ctx.orgId, { userId: s.userId, level: "info", title: data.subject, body: data.message.slice(0, 300) });
      }
      await audit(tx, ctx.user, ctx.orgId, { action: "communication.bulk", entityType: "communication", summary: `${ctx.user.firstName} ${ctx.user.lastName} a envoyé « ${data.subject} » à ${recipients.length} étudiant(s)` });
      return out;
    });
    await deliverQueued(ctx.orgId, ids);
    revalidatePath("/app/communication");
    return { ok: true, message: `Message envoyé à ${ids.filter(Boolean).length} destinataire(s) disposant d'un email.` };
  } catch (e) {
    return toActionError(e);
  }
}
