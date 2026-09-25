"use server";

import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { users } from "@/db/schema";
import { withSystem } from "@/db/tenant";
import { parseForm, zEmail, type ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/context";
import { homePathFor } from "@/lib/auth/rbac";
import { createSession, destroyCurrentSession, revokeUserSessions } from "@/lib/auth/session";
import { sendMail } from "@/lib/mail";
import { hashPassword, passwordSchema, verifyPassword } from "@/lib/security/password";
import { rateLimit, resetRateLimit } from "@/lib/security/rate-limit";
import { requestMeta } from "@/lib/request";
import { appUrl, consumeAuthToken, createAuthToken } from "@/server/auth-tokens";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const GENERIC_LOGIN_ERROR = "Email ou mot de passe incorrect.";

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { data, state } = parseForm(z.object({ email: zEmail, password: z.string().min(1, "Mot de passe requis").max(200) }), fd);
  if (!data) return state!;
  const meta = await requestMeta();

  const ipLimit = await rateLimit(`login:ip:${meta.ip ?? "unknown"}`, 30, 15 * 60);
  const emailLimit = await rateLimit(`login:email:${data.email}`, 10, 15 * 60);
  if (!ipLimit.allowed || !emailLimit.allowed) {
    return { error: `Trop de tentatives. Réessayez dans ${Math.ceil(Math.max(ipLimit.retryAfterSec, emailLimit.retryAfterSec) / 60)} minute(s).` };
  }

  const user = await withSystem(async (tx) => (await tx.select().from(users).where(sql`lower(${users.email}) = ${data.email}`).limit(1))[0]);

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    await verifyPassword(null, data.password); // temps constant
    return { error: `Compte temporairement verrouillé après plusieurs échecs. Réessayez dans ${LOCK_MINUTES} minutes ou réinitialisez votre mot de passe.` };
  }

  const valid = await verifyPassword(user?.passwordHash, data.password);
  if (!user || !valid || !user.isActive) {
    if (user) {
      const failed = user.failedLoginCount + 1;
      await withSystem(async (tx) => {
        await tx
          .update(users)
          .set({ failedLoginCount: failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null })
          .where(eq(users.id, user.id));
        await audit(tx, null, user.organizationId, {
          action: "auth.login_failed",
          entityType: "user",
          entityId: user.id,
          summary: `Échec de connexion pour ${user.email}${failed >= MAX_FAILED ? " — compte verrouillé" : ""}`,
        });
      });
    }
    return { error: GENERIC_LOGIN_ERROR };
  }

  await withSystem(async (tx) => {
    await tx.update(users).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, user.id));
    await audit(tx, user, user.organizationId, {
      action: "auth.login",
      entityType: "user",
      entityId: user.id,
      summary: `${user.firstName} ${user.lastName} s'est connecté(e)`,
    });
  });
  await resetRateLimit(`login:email:${data.email}`);
  await createSession(user.id, meta);
  redirect(user.mustChangePassword ? "/change-password" : homePathFor(user.role));
}

export async function logoutAction() {
  await destroyCurrentSession();
  redirect("/login");
}

export async function forgotPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { data, state } = parseForm(z.object({ email: zEmail }), fd);
  if (!data) return state!;
  const meta = await requestMeta();
  const limit = await rateLimit(`forgot:${meta.ip ?? "unknown"}`, 5, 60 * 60);
  const done: ActionState = { ok: true, message: "Si un compte existe pour cette adresse, un email contenant un lien de réinitialisation vient d'être envoyé (valable 1 heure)." };
  if (!limit.allowed) return done; // même réponse : pas d'énumération
  const token = await withSystem(async (tx) => {
    const [u] = await tx.select().from(users).where(sql`lower(${users.email}) = ${data.email}`).limit(1);
    if (!u || !u.isActive) return null;
    return { token: await createAuthToken(tx, u.id, "password_reset", 1), user: u };
  });
  if (token) {
    await sendMail({
      to: token.user.email,
      subject: "Réinitialisation de votre mot de passe — TRAINING OS AI",
      text: `Bonjour ${token.user.firstName},\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 heure) :\n${appUrl(`/reset-password/${token.token}`)}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
    });
  }
  return done;
}

export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { data, state } = parseForm(
    z.object({ token: z.string().min(10).max(100), password: passwordSchema, confirm: z.string() }).refine((v) => v.password === v.confirm, { message: "Les mots de passe ne correspondent pas", path: ["confirm"] }),
    fd,
  );
  if (!data) return state!;
  const meta = await requestMeta();
  const limit = await rateLimit(`reset:${meta.ip ?? "unknown"}`, 10, 60 * 60);
  if (!limit.allowed) return { error: "Trop de tentatives, réessayez plus tard." };
  const hashed = await hashPassword(data.password);
  const userId = await withSystem(async (tx) => {
    const t = await consumeAuthToken(tx, data.token, ["password_reset", "invitation"]);
    if (!t) return null;
    const [u] = await tx
      .update(users)
      .set({ passwordHash: hashed, mustChangePassword: false, emailVerifiedAt: new Date(), failedLoginCount: 0, lockedUntil: null })
      .where(eq(users.id, t.userId))
      .returning();
    await audit(tx, null, u.organizationId, { action: "auth.password_reset", entityType: "user", entityId: u.id, summary: `${u.email} a défini un nouveau mot de passe (lien email)` });
    return u.id;
  });
  if (!userId) return { error: "Ce lien est invalide ou a expiré. Faites une nouvelle demande." };
  await revokeUserSessions(userId);
  return { ok: true, message: "Mot de passe enregistré. Vous pouvez maintenant vous connecter." };
}

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { data, state } = parseForm(
    z
      .object({ current: z.string().min(1, "Mot de passe actuel requis"), password: passwordSchema, confirm: z.string() })
      .refine((v) => v.password === v.confirm, { message: "Les mots de passe ne correspondent pas", path: ["confirm"] })
      .refine((v) => v.password !== v.current, { message: "Le nouveau mot de passe doit être différent", path: ["password"] }),
    fd,
  );
  if (!data) return state!;
  const limit = await rateLimit(`change-pw:${user.id}`, 10, 15 * 60);
  if (!limit.allowed) return { error: "Trop de tentatives, réessayez plus tard." };
  const row = await withSystem(async (tx) => (await tx.select().from(users).where(eq(users.id, user.id)).limit(1))[0]);
  if (!(await verifyPassword(row?.passwordHash, data.current))) return { fieldErrors: { current: ["Mot de passe actuel incorrect"] }, error: "Mot de passe actuel incorrect." };
  const hashed = await hashPassword(data.password);
  await withSystem(async (tx) => {
    await tx.update(users).set({ passwordHash: hashed, mustChangePassword: false }).where(eq(users.id, user.id));
    await audit(tx, user, user.organizationId, { action: "auth.password_change", entityType: "user", entityId: user.id, summary: `${user.firstName} ${user.lastName} a changé son mot de passe` });
  });
  await revokeUserSessions(user.id, user.sessionId);
  redirect(homePathFor(user.role));
}
