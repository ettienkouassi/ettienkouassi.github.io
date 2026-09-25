"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { students } from "@/db/schema";
import { parseForm, toActionError, UserError, zEmail, zId, zOptDate, zOptText, zPhone, zText, type ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requireOrg, STAFF } from "@/lib/auth/context";
import { validateUpload } from "@/lib/security/upload";
import { deleteObject, makeKey, putObject } from "@/lib/storage";
import { nextCounter } from "@/server/certificates";
import { assertPlanLimit } from "@/server/limits";
import { createInvitedUser } from "@/server/users";

const studentSchema = z.object({
  firstName: zText(80, "Le prénom"),
  lastName: zText(80, "Le nom"),
  matricule: z.string().max(40).regex(/^[A-Za-z0-9-_/]+$/, "Caractères autorisés : lettres, chiffres, - _ /").optional(),
  email: zEmail.optional(),
  phone: zPhone,
  birthDate: zOptDate,
  address: zOptText(300),
  country: zOptText(80),
  profession: zOptText(120),
  company: zOptText(120),
  educationLevel: zOptText(80),
  leadSource: zOptText(80),
  adminNotes: zOptText(2000),
});

export async function createStudentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const ctx = await requireOrg(STAFF, "students.write");
    const { data, state } = parseForm(studentSchema, fd);
    if (!data) return state!;
    id = await ctx.db(async (tx) => {
      await assertPlanLimit(tx, ctx.orgId, "students");
      const year = new Date().getUTCFullYear();
      const matricule = data.matricule ?? `ETU-${year}-${String(await nextCounter(tx, ctx.orgId, `student-${year}`)).padStart(5, "0")}`;
      const [s] = await tx
        .insert(students)
        .values({ ...data, organizationId: ctx.orgId, matricule, email: data.email ?? null, phone: data.phone ?? null, birthDate: data.birthDate ?? null })
        .returning();
      await audit(tx, ctx.user, ctx.orgId, {
        action: "student.create",
        entityType: "student",
        entityId: s.id,
        summary: `${ctx.user.firstName} ${ctx.user.lastName} a créé l'étudiant ${s.firstName} ${s.lastName} (${s.matricule})`,
      });
      return s.id;
    });
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/app/students");
  redirect(`/app/students/${id}`);
}

export async function updateStudentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const ctx = await requireOrg(STAFF, "students.write");
    const { data, state } = parseForm(studentSchema.extend({ id: zId }), fd);
    if (!data) return state!;
    id = data.id;
    await ctx.db(async (tx) => {
      const [before] = await tx.select().from(students).where(and(eq(students.id, data.id), eq(students.organizationId, ctx.orgId))).limit(1);
      if (!before) throw new UserError("Étudiant introuvable.");
      const { id: _id, ...rest } = data;
      void _id;
      const values = { ...rest, email: rest.email ?? null, phone: rest.phone ?? null, birthDate: rest.birthDate ?? null, matricule: rest.matricule ?? before.matricule };
      await tx.update(students).set(values).where(eq(students.id, data.id));
      const changed = Object.keys(values).filter((k) => String((before as Record<string, unknown>)[k] ?? "") !== String((values as Record<string, unknown>)[k] ?? ""));
      await audit(tx, ctx.user, ctx.orgId, {
        action: "student.update",
        entityType: "student",
        entityId: data.id,
        summary: `${ctx.user.firstName} ${ctx.user.lastName} a modifié la fiche de ${values.firstName} ${values.lastName}`,
        metadata: { champs: changed },
      });
    });
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath(`/app/students/${id}`);
  redirect(`/app/students/${id}`);
}

export async function toggleStudentActiveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF, "students.write");
    const id = zId.parse(fd.get("id"));
    await ctx.db(async (tx) => {
      const [s] = await tx.select().from(students).where(eq(students.id, id)).limit(1);
      if (!s) throw new UserError("Étudiant introuvable.");
      await tx.update(students).set({ isActive: !s.isActive }).where(eq(students.id, id));
      await audit(tx, ctx.user, ctx.orgId, {
        action: s.isActive ? "student.archive" : "student.restore",
        entityType: "student",
        entityId: id,
        summary: `${ctx.user.firstName} ${ctx.user.lastName} a ${s.isActive ? "archivé" : "réactivé"} l'étudiant ${s.firstName} ${s.lastName}`,
      });
    });
    revalidatePath(`/app/students/${id}`);
    return { ok: true, message: "Statut mis à jour." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function inviteStudentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF, "students.write");
    const id = zId.parse(fd.get("id"));
    const res = await ctx.db(async (tx) => {
      const [s] = await tx.select().from(students).where(eq(students.id, id)).limit(1);
      if (!s) throw new UserError("Étudiant introuvable.");
      if (s.userId) throw new UserError("Cet étudiant possède déjà un compte.");
      if (!s.email) throw new UserError("Renseignez d'abord l'email de l'étudiant.");
      const inv = await createInvitedUser(tx, ctx.orgId, { email: s.email, firstName: s.firstName, lastName: s.lastName, role: "student", phone: s.phone });
      await tx.update(students).set({ userId: inv.user.id }).where(eq(students.id, id));
      await audit(tx, ctx.user, ctx.orgId, { action: "user.invite", entityType: "student", entityId: id, summary: `${ctx.user.firstName} ${ctx.user.lastName} a créé l'accès étudiant de ${s.firstName} ${s.lastName}` });
      return inv;
    });
    await res.send();
    revalidatePath(`/app/students/${id}`);
    return { ok: true, message: `Invitation envoyée à ${res.user.email}.` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function uploadStudentPhotoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF, "students.write");
    const id = zId.parse(fd.get("id"));
    const file = fd.get("photo");
    if (!(file instanceof File)) throw new UserError("Aucun fichier.");
    const { buffer, mime, ext } = await validateUpload(file, "image");
    const key = makeKey(ctx.orgId, "photos", ext);
    await putObject(key, buffer, mime);
    const old = await ctx.db(async (tx) => {
      const [s] = await tx.select({ photoKey: students.photoKey }).from(students).where(eq(students.id, id)).limit(1);
      if (!s) throw new UserError("Étudiant introuvable.");
      await tx.update(students).set({ photoKey: key }).where(eq(students.id, id));
      return s.photoKey;
    });
    if (old) await deleteObject(old);
    revalidatePath(`/app/students/${id}`);
    return { ok: true, message: "Photo mise à jour." };
  } catch (e) {
    return toActionError(e);
  }
}
