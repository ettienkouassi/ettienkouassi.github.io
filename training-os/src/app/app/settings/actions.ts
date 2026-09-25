"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { instructors, organizations, users } from "@/db/schema";
import { parseForm, toActionError, UserError, zBool, zEmail, zId, zInt, zOptEmail, zOptText, zPhone, zText, zUrl, type ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requireOrg, STAFF } from "@/lib/auth/context";
import { ROLE_LABELS } from "@/lib/auth/rbac";
import { revokeUserSessions } from "@/lib/auth/session";
import { validateUpload } from "@/lib/security/upload";
import { deleteObject, makeKey, putObject } from "@/lib/storage";
import { assertPlanLimit } from "@/server/limits";
import { createInvitedUser } from "@/server/users";
import type { Tx } from "@/db/tenant";

export async function saveOrgAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF, "settings.write");
    const { data, state } = parseForm(
      z.object({
        name: zText(150, "Le nom"),
        description: zOptText(2000),
        country: zText(80, "Le pays"),
        city: zOptText(80),
        address: zOptText(300),
        phone: zPhone,
        email: zOptEmail,
        website: zUrl,
        managerName: zOptText(120),
        currency: z.string().regex(/^[A-Z]{3}$/, "Code devise ISO (ex. XOF)"),
        timezone: z.string().refine((tz) => { try { new Intl.DateTimeFormat("fr", { timeZone: tz }); return true; } catch { return false; } }, "Fuseau horaire invalide"),
        publicPageEnabled: zBool,
        aiRecommendationsEnabled: zBool,
        certificatePrefix: z.string().regex(/^[A-Za-z0-9]{2,12}$/, "2 à 12 lettres/chiffres"),
        certificateSignatoryName: zOptText(120),
        certificateSignatoryTitle: zOptText(120),
        reminderDaysBefore: zInt(0, 30),
        reminderDaysAfter: zInt(0, 60),
        absenceAlertThreshold: zInt(1, 10),
      }),
      fd,
    );
    if (!data) return state!;
    await ctx.db(async (tx) => {
      const { reminderDaysBefore, reminderDaysAfter, absenceAlertThreshold, ...rest } = data;
      const [before] = await tx.select().from(organizations).where(eq(organizations.id, ctx.orgId)).limit(1);
      await tx
        .update(organizations)
        .set({
          ...rest,
          phone: rest.phone ?? null,
          email: rest.email ?? null,
          website: rest.website ?? null,
          certificatePrefix: rest.certificatePrefix.toUpperCase(),
          settings: { ...before.settings, reminderDaysBefore, reminderDaysAfter, absenceAlertThreshold },
        })
        .where(eq(organizations.id, ctx.orgId));
      await audit(tx, ctx.user, ctx.orgId, { action: "org.update", entityType: "organization", entityId: ctx.orgId, summary: `${ctx.user.firstName} ${ctx.user.lastName} a modifié les paramètres du centre` });
    });
    revalidatePath("/app/settings");
    return { ok: true, message: "Paramètres enregistrés." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function uploadLogoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF, "settings.write");
    const file = fd.get("logo");
    if (!(file instanceof File)) throw new UserError("Aucun fichier.");
    const { buffer, mime, ext } = await validateUpload(file, "image");
    if (mime === "image/webp") throw new UserError("Utilisez un logo PNG ou JPEG (compatible avec les certificats PDF).");
    const key = makeKey(ctx.orgId, "branding", ext);
    await putObject(key, buffer, mime);
    const old = await ctx.db(async (tx) => {
      const [o] = await tx.select({ k: organizations.logoKey }).from(organizations).where(eq(organizations.id, ctx.orgId)).limit(1);
      await tx.update(organizations).set({ logoKey: key }).where(eq(organizations.id, ctx.orgId));
      await audit(tx, ctx.user, ctx.orgId, { action: "org.logo", entityType: "organization", entityId: ctx.orgId, summary: `${ctx.user.firstName} ${ctx.user.lastName} a mis à jour le logo` });
      return o?.k;
    });
    if (old) await deleteObject(old);
    revalidatePath("/app/settings");
    return { ok: true, message: "Logo mis à jour." };
  } catch (e) {
    return toActionError(e);
  }
}

async function countAdmins(tx: Tx, orgId: string, exceptId: string) {
  return (await tx.select({ id: users.id }).from(users).where(and(eq(users.organizationId, orgId), eq(users.role, "org_admin"), eq(users.isActive, true), ne(users.id, exceptId)))).length;
}

export async function inviteUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF, "users.manage");
    const { data, state } = parseForm(z.object({ email: zEmail, firstName: zText(80, "Le prénom"), lastName: zText(80, "Le nom"), role: z.enum(["org_admin", "manager", "instructor"]) }), fd);
    if (!data) return state!;
    const inv = await ctx.db(async (tx) => {
      if (data.role !== "instructor") await assertPlanLimit(tx, ctx.orgId, "admins");
      else await assertPlanLimit(tx, ctx.orgId, "instructors");
      const inv = await createInvitedUser(tx, ctx.orgId, data);
      if (data.role === "instructor") await tx.insert(instructors).values({ organizationId: ctx.orgId, userId: inv.user.id, firstName: data.firstName, lastName: data.lastName, email: data.email });
      await audit(tx, ctx.user, ctx.orgId, { action: "user.invite", entityType: "user", entityId: inv.user.id, summary: `${ctx.user.firstName} ${ctx.user.lastName} a invité ${data.email} (${ROLE_LABELS[data.role]})` });
      return inv;
    });
    await inv.send();
    revalidatePath("/app/settings/users");
    return { ok: true, message: `Invitation envoyée à ${data.email}.` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF, "users.manage");
    const { data, state } = parseForm(z.object({ id: zId, role: z.enum(["org_admin", "manager", "instructor", "student"]), isActive: zBool }), fd);
    if (!data) return state!;
    if (data.id === ctx.user.id) return { error: "Vous ne pouvez pas modifier votre propre rôle ou statut." };
    await ctx.db(async (tx) => {
      const [u] = await tx.select().from(users).where(and(eq(users.id, data.id), eq(users.organizationId, ctx.orgId))).limit(1);
      if (!u) throw new UserError("Utilisateur introuvable.");
      if (u.role === "student" !== (data.role === "student")) throw new UserError("Un compte étudiant ne peut pas devenir un compte du personnel (et inversement).");
      if (u.role === "org_admin" && (data.role !== "org_admin" || !data.isActive) && (await countAdmins(tx, ctx.orgId, u.id)) === 0) throw new UserError("Le centre doit conserver au moins un administrateur actif.");
      await tx.update(users).set({ role: data.role, isActive: data.isActive }).where(eq(users.id, u.id));
      await audit(tx, ctx.user, ctx.orgId, {
        action: "user.update",
        entityType: "user",
        entityId: u.id,
        summary: `${ctx.user.firstName} ${ctx.user.lastName} a modifié le compte ${u.email} : ${ROLE_LABELS[u.role]} → ${ROLE_LABELS[data.role]}, ${data.isActive ? "actif" : "désactivé"}`,
      });
    });
    // Changement de droits : on ferme les sessions existantes
    await revokeUserSessions(data.id);
    revalidatePath("/app/settings/users");
    return { ok: true, message: "Compte mis à jour." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveInstructorAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF, "instructors.write");
    const { data, state } = parseForm(
      z.object({ id: zId.optional(), firstName: zText(80, "Le prénom"), lastName: zText(80, "Le nom"), email: zOptEmail, phone: zPhone, specialty: zOptText(120), bio: zOptText(2000), isActive: zBool.optional(), createAccount: zBool }),
      fd,
    );
    if (!data) return state!;
    const inv = await ctx.db(async (tx) => {
      const { id, createAccount, ...v } = data;
      const values = { ...v, email: v.email ?? null, phone: v.phone ?? null, isActive: id ? !!v.isActive : true };
      let instructorId = id;
      if (id) {
        const [i] = await tx.update(instructors).set(values).where(eq(instructors.id, id)).returning();
        if (!i) throw new UserError("Formateur introuvable.");
        await audit(tx, ctx.user, ctx.orgId, { action: "instructor.update", entityType: "instructor", entityId: i.id, summary: `${ctx.user.firstName} ${ctx.user.lastName} a modifié le formateur ${i.firstName} ${i.lastName}` });
      } else {
        await assertPlanLimit(tx, ctx.orgId, "instructors");
        const [i] = await tx.insert(instructors).values({ ...values, organizationId: ctx.orgId }).returning();
        instructorId = i.id;
        await audit(tx, ctx.user, ctx.orgId, { action: "instructor.create", entityType: "instructor", entityId: i.id, summary: `${ctx.user.firstName} ${ctx.user.lastName} a ajouté le formateur ${i.firstName} ${i.lastName}` });
      }
      if (createAccount) {
        const [i] = await tx.select().from(instructors).where(eq(instructors.id, instructorId!)).limit(1);
        if (i.userId) throw new UserError("Ce formateur a déjà un compte.");
        if (!i.email) throw new UserError("Renseignez l'email du formateur pour créer son accès.");
        const inv = await createInvitedUser(tx, ctx.orgId, { email: i.email, firstName: i.firstName, lastName: i.lastName, role: "instructor" });
        await tx.update(instructors).set({ userId: inv.user.id }).where(eq(instructors.id, i.id));
        return inv;
      }
      return null;
    });
    if (inv) await inv.send();
    revalidatePath("/app/settings/instructors");
    return { ok: true, message: inv ? "Formateur enregistré et invitation envoyée." : "Formateur enregistré." };
  } catch (e) {
    return toActionError(e);
  }
}
