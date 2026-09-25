"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { courseSessions, prospects } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { parseForm, zEmail, zId, zOptText, zText, type ActionState } from "@/lib/actions";
import { sendMail } from "@/lib/mail";
import { rateLimit } from "@/lib/security/rate-limit";
import { requestMeta } from "@/lib/request";
import { notify } from "@/server/communications";
import { publicCenter } from "@/server/public-center";

/** Inscription publique (§40) : crée une demande (prospect « préinscrit ») — pas de compte ni de paiement sans validation du centre. */
export async function publicRegisterAction(_: ActionState, fd: FormData): Promise<ActionState> {
  // Pot de miel anti-robots : champ invisible qui doit rester vide
  if (fd.get("website")) return { ok: true, message: "Merci !" };
  const { data, state } = parseForm(
    z.object({
      slug: z.string().max(60),
      courseId: zId,
      sessionId: zId.optional(),
      firstName: zText(80, "Le prénom"),
      lastName: zText(80, "Le nom"),
      phone: z.string().regex(/^[+0-9 ().-]{6,30}$/, "Numéro de téléphone invalide"),
      email: zEmail,
      message: zOptText(1000),
      consent: z.literal("on", { error: "Votre accord est nécessaire pour traiter la demande" }),
    }),
    fd,
  );
  if (!data) return state!;
  const meta = await requestMeta();
  const rl = await rateLimit(`public-register:${meta.ip ?? "unknown"}`, 5, 3600);
  if (!rl.allowed) return { error: "Trop de demandes depuis votre connexion. Réessayez plus tard ou appelez le centre." };
  const c = await publicCenter(data.slug);
  if (!c) return { error: "Centre introuvable." };
  const course = c.courses.find((x) => x.id === data.courseId);
  if (!course) return { error: "Formation introuvable." };
  if (data.sessionId && !c.sessions.some((s) => s.s.id === data.sessionId && s.s.courseId === course.id)) return { error: "Session invalide." };
  await withTenant(c.org.id, null, async (tx) => {
    const [p] = await tx
      .insert(prospects)
      .values({
        organizationId: c.org.id,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        email: data.email,
        desiredCourseId: course.id,
        desiredSessionId: data.sessionId ?? null,
        source: "Inscription en ligne",
        status: "preregistered",
        notes: data.message ?? null,
        nextAction: "Confirmer la préinscription en ligne",
        nextActionAt: new Date().toISOString().slice(0, 10),
      })
      .returning();
    const [s] = data.sessionId ? await tx.select().from(courseSessions).where(and(eq(courseSessions.id, data.sessionId), eq(courseSessions.courseId, course.id))).limit(1) : [];
    await notify(tx, c.org.id, { level: "success", title: `Nouvelle préinscription en ligne : ${p.firstName} ${p.lastName}`, body: `${course.name}${s ? ` — ${s.name}` : ""}`, link: `/app/prospects/${p.id}` });
  });
  await sendMail({
    to: data.email,
    subject: `Votre demande d'inscription — ${course.name}`,
    text: `Bonjour ${data.firstName},\n\nNous avons bien reçu votre demande d'inscription à la formation « ${course.name} ».\nL'équipe de ${c.org.name} vous contactera rapidement pour confirmer votre place et les modalités de paiement.\n\n${c.org.name}\n${c.org.phone ?? ""}`,
  });
  return { ok: true, message: "Demande envoyée ! Le centre vous contactera rapidement pour confirmer votre inscription. Un email de confirmation vient de vous être envoyé." };
}

