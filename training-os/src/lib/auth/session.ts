import "server-only";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { authSessions, organizations, users } from "@/db/schema";
import { withSystem } from "@/db/tenant";
import { randomToken, sha256 } from "@/lib/security/crypto";
import type { Role } from "./rbac";

const isSecure = () => (process.env.APP_URL ?? "").startsWith("https://");
/** Préfixe __Host- : cookie lié à l'hôte, Secure, Path=/ (impossible à injecter depuis un sous-domaine). */
export const SESSION_COOKIE = () => (isSecure() ? "__Host-tos_session" : "tos_session");

const ttlHours = () => Number(process.env.SESSION_TTL_HOURS ?? 12);

export type SessionUser = {
  id: string;
  sessionId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  organizationId: string | null;
  organizationName: string | null;
  organizationStatus: string | null;
  mustChangePassword: boolean;
};

export async function createSession(userId: string, meta: { ip: string | null; userAgent: string | null }) {
  const token = randomToken(32);
  const id = sha256(token);
  const expiresAt = new Date(Date.now() + ttlHours() * 3600_000);
  await withSystem((tx) =>
    tx.insert(authSessions).values({ id, userId, expiresAt, ip: meta.ip, userAgent: meta.userAgent }),
  );
  const jar = await cookies();
  jar.set(SESSION_COOKIE(), token, {
    httpOnly: true,
    secure: isSecure(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function readSessionToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE())?.value ?? null;
}

export async function validateSessionToken(token: string): Promise<SessionUser | null> {
  if (!token || token.length > 100) return null;
  const id = sha256(token);
  return withSystem(async (tx) => {
    const rows = await tx
      .select({
        sessionId: authSessions.id,
        expiresAt: authSessions.expiresAt,
        lastSeenAt: authSessions.lastSeenAt,
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        isActive: users.isActive,
        organizationId: users.organizationId,
        mustChangePassword: users.mustChangePassword,
        organizationName: organizations.name,
        organizationStatus: organizations.status,
      })
      .from(authSessions)
      .innerJoin(users, eq(users.id, authSessions.userId))
      .leftJoin(organizations, eq(organizations.id, users.organizationId))
      .where(and(eq(authSessions.id, id), gt(authSessions.expiresAt, new Date())))
      .limit(1);
    const row = rows[0];
    if (!row || !row.isActive) return null;
    // Glissement de session : prolongation si l'utilisateur est actif (au plus toutes les 15 min)
    if (Date.now() - new Date(row.lastSeenAt).getTime() > 15 * 60_000) {
      await tx
        .update(authSessions)
        .set({ lastSeenAt: new Date(), expiresAt: new Date(Date.now() + ttlHours() * 3600_000) })
        .where(eq(authSessions.id, id));
    }
    return {
      id: row.id,
      sessionId: row.sessionId,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      role: row.role,
      organizationId: row.organizationId,
      organizationName: row.organizationName,
      organizationStatus: row.organizationStatus,
      mustChangePassword: row.mustChangePassword,
    };
  });
}

export async function destroyCurrentSession() {
  const token = await readSessionToken();
  if (token) {
    await withSystem((tx) => tx.delete(authSessions).where(eq(authSessions.id, sha256(token))));
  }
  const jar = await cookies();
  jar.delete(SESSION_COOKIE());
}

/** Révoque toutes les sessions d'un utilisateur (changement de mot de passe, désactivation…). */
export async function revokeUserSessions(userId: string, exceptSessionId?: string) {
  await withSystem((tx) =>
    tx
      .delete(authSessions)
      .where(
        exceptSessionId
          ? and(eq(authSessions.userId, userId), sql`${authSessions.id} <> ${exceptSessionId}`)
          : eq(authSessions.userId, userId),
      ),
  );
}

export async function purgeExpiredSessions() {
  await withSystem((tx) => tx.delete(authSessions).where(lt(authSessions.expiresAt, new Date())));
}
