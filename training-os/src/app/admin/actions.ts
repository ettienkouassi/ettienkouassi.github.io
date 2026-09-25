"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { messageTemplates, organizations, plans, subscriptions } from "@/db/schema";
import { withSystem } from "@/db/tenant";
import { parseForm, toActionError, UserError, zDate, zEmail, zId, zInt, zMoney, zOptEmail, zOptText, zPhone, zText, zUrl, type ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requireSuperAdmin } from "@/lib/auth/context";
import { slugify } from "@/lib/format";
import { DEFAULT_TEMPLATES } from "@/server/communications";
import { createInvitedUser } from "@/server/users";

const orgSchema = z.object({
  name: zText(150, "Le nom"),
  slug: z.string().regex(/^[a-z0-9-]{3,40}$/, "3 à 40 caractères : minuscules, chiffres, tirets").optional(),
  country: zText(80, "Le pays"),
  city: zOptText(80),
  address: zOptText(300),
  phone: zPhone,
  email: zOptEmail,
  website: zUrl,
  managerName: zOptText(120),
  currency: z.string().regex(/^[A-Z]{3}$/),
  locale: z.enum(["fr", "en"]),
  timezone: z.string().min(3).max(60),
});

export async function createOrgAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const admin = await requireSuperAdmin();
    const { data, state } = parseForm(
      orgSchema.extend({ planId: zId, trialDays: zInt(0, 365), adminEmail: zEmail, adminFirstName: zText(80, "Le prénom"), adminLastName: zText(80, "Le nom") }),
      fd,
    );
    if (!data) return state!;
    const { planId, trialDays, adminEmail, adminFirstName, adminLastName, ...o } = data;
    const inv = await withSystem(async (tx) => {
      const slug = o.slug ?? slugify(o.name);
      const [exists] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug)).limit(1);
      if (exists) throw new UserError("Cet identifiant (slug) est déjà utilisé.");
      const [plan] = await tx.select().from(plans).where(eq(plans.id, planId)).limit(1);
      if (!plan) throw new UserError("Plan invalide.");
      const [org] = await tx
        .insert(organizations)
        .values({ ...o, slug, phone: o.phone ?? null, email: o.email ?? null, website: o.website ?? null, status: "onboarding", certificatePrefix: slug.replace(/-/g, "").slice(0, 8).toUpperCase() || "CERT" })
        .returning();
      id = org.id;
      const start = new Date().toISOString().slice(0, 10);
      const end = new Date(Date.now() + Math.max(1, trialDays) * 86_400_000).toISOString().slice(0, 10);
      await tx.insert(subscriptions).values({ organizationId: org.id, planId, status: trialDays > 0 ? "trialing" : "active", currentPeriodStart: start, currentPeriodEnd: end, amount: trialDays > 0 ? 0 : (plan.priceMonthly ?? 0), currency: plan.currency });
      await tx.insert(messageTemplates).values(Object.entries(DEFAULT_TEMPLATES).filter(([k]) => !["account_created", "custom"].includes(k)).map(([key, t]) => ({ organizationId: org.id, key, ...t })));
      const inv = await createInvitedUser(tx, org.id, { email: adminEmail, firstName: adminFirstName, lastName: adminLastName, role: "org_admin" });
      await audit(tx, admin, org.id, { action: "platform.org_create", entityType: "organization", entityId: org.id, summary: `${admin.firstName} ${admin.lastName} (TRAINING OS) a créé le centre ${org.name} et invité ${adminEmail}` });
      return inv;
    });
    await inv.send();
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/admin/organizations");
  redirect(`/admin/organizations/${id!}`);
}

export async function updateOrgAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const admin = await requireSuperAdmin();
    const { data, state } = parseForm(orgSchema.extend({ id: zId }), fd);
    if (!data) return state!;
    const { id, slug, ...o } = data;
    void slug;
    await withSystem(async (tx) => {
      await tx.update(organizations).set({ ...o, phone: o.phone ?? null, email: o.email ?? null, website: o.website ?? null }).where(eq(organizations.id, id));
      await audit(tx, admin, id, { action: "platform.org_update", entityType: "organization", entityId: id, summary: `${admin.firstName} ${admin.lastName} (TRAINING OS) a modifié les informations du centre` });
    });
    revalidatePath(`/admin/organizations/${id}`);
    return { ok: true, message: "Centre mis à jour." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setOrgStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const admin = await requireSuperAdmin();
    const id = zId.parse(fd.get("id"));
    const status = z.enum(["onboarding", "active", "suspended", "archived"]).parse(fd.get("status"));
    await withSystem(async (tx) => {
      const [o] = await tx
        .update(organizations)
        .set({ status, suspendedAt: status === "suspended" ? new Date() : null, deletedAt: status === "archived" ? new Date() : null, publicPageEnabled: status === "archived" ? false : sql`${organizations.publicPageEnabled}` })
        .where(eq(organizations.id, id))
        .returning();
      if (!o) throw new UserError("Centre introuvable.");
      await audit(tx, admin, id, { action: `platform.org_${status}`, entityType: "organization", entityId: id, summary: `${admin.firstName} ${admin.lastName} (TRAINING OS) a passé le centre ${o.name} au statut « ${status} »` });
    });
    revalidatePath(`/admin/organizations/${id}`);
    return { ok: true, message: "Statut mis à jour." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveSubscriptionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const admin = await requireSuperAdmin();
    const { data, state } = parseForm(
      z.object({ organizationId: zId, planId: zId, status: z.enum(["trialing", "active", "past_due", "expired", "cancelled"]), currentPeriodStart: zDate, currentPeriodEnd: zDate, amount: zMoney, notes: zOptText(500) }),
      fd,
    );
    if (!data) return state!;
    await withSystem(async (tx) => {
      const [existing] = await tx.select().from(subscriptions).where(eq(subscriptions.organizationId, data.organizationId)).orderBy(sql`${subscriptions.currentPeriodEnd} desc`).limit(1);
      if (existing) await tx.update(subscriptions).set(data).where(eq(subscriptions.id, existing.id));
      else await tx.insert(subscriptions).values(data);
      await audit(tx, admin, data.organizationId, { action: "platform.subscription", entityType: "subscription", entityId: data.organizationId, summary: `${admin.firstName} ${admin.lastName} (TRAINING OS) a mis à jour l'abonnement (${data.status})` });
    });
    revalidatePath(`/admin/organizations/${data.organizationId}`);
    return { ok: true, message: "Abonnement enregistré." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function inviteOrgAdminAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const admin = await requireSuperAdmin();
    const { data, state } = parseForm(z.object({ organizationId: zId, email: zEmail, firstName: zText(80, "Le prénom"), lastName: zText(80, "Le nom") }), fd);
    if (!data) return state!;
    const inv = await withSystem(async (tx) => {
      const inv = await createInvitedUser(tx, data.organizationId, { ...data, role: "org_admin" });
      await audit(tx, admin, data.organizationId, { action: "platform.admin_invite", entityType: "user", entityId: inv.user.id, summary: `${admin.firstName} ${admin.lastName} (TRAINING OS) a invité l'administrateur ${data.email}` });
      return inv;
    });
    await inv.send();
    revalidatePath(`/admin/organizations/${data.organizationId}`);
    return { ok: true, message: `Invitation envoyée à ${data.email}.` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function savePlanAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const admin = await requireSuperAdmin();
    const opt = z.coerce.number().int().min(0).optional();
    const { data, state } = parseForm(
      z.object({
        id: zId.optional(),
        code: z.string().regex(/^[a-z0-9-]{2,30}$/),
        name: zText(60, "Le nom"),
        description: zOptText(300),
        priceMonthly: zMoney.optional(),
        maxStudents: opt,
        maxInstructors: opt,
        maxCourses: opt,
        maxAdmins: opt,
        storageMb: opt,
        aiRequestsPerMonth: opt,
      }),
      fd,
    );
    if (!data) return state!;
    const { id, ...v } = data;
    const values = { ...v, priceMonthly: v.priceMonthly ?? null, maxStudents: v.maxStudents ?? null, maxInstructors: v.maxInstructors ?? null, maxCourses: v.maxCourses ?? null, maxAdmins: v.maxAdmins ?? null, storageMb: v.storageMb ?? null, aiRequestsPerMonth: v.aiRequestsPerMonth ?? null };
    await withSystem(async (tx) => {
      if (id) await tx.update(plans).set(values).where(eq(plans.id, id));
      else await tx.insert(plans).values(values);
      await audit(tx, admin, null, { action: "platform.plan", entityType: "plan", entityId: id ?? values.code, summary: `${admin.firstName} ${admin.lastName} a enregistré le plan ${values.name}` });
    });
    revalidatePath("/admin/plans");
    return { ok: true, message: "Plan enregistré." };
  } catch (e) {
    return toActionError(e);
  }
}

