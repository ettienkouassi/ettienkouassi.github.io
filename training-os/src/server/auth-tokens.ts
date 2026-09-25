import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { authTokens } from "@/db/schema";
import type { Tx } from "@/db/tenant";
import { randomToken, sha256 } from "@/lib/security/crypto";

export async function createAuthToken(tx: Tx, userId: string, type: "password_reset" | "email_verification" | "invitation", ttlHours: number) {
  const token = randomToken(32);
  // Un seul jeton actif par type et utilisateur
  await tx.delete(authTokens).where(and(eq(authTokens.userId, userId), eq(authTokens.type, type), isNull(authTokens.usedAt)));
  await tx.insert(authTokens).values({ userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlHours * 3600_000) });
  return token;
}

export async function consumeAuthToken(tx: Tx, token: string, types: ("password_reset" | "email_verification" | "invitation")[]) {
  if (!token || token.length > 100) return null;
  const [t] = await tx
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, sha256(token)), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())))
    .limit(1);
  if (!t || !types.includes(t.type)) return null;
  await tx.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, t.id));
  return t;
}

export async function peekAuthToken(tx: Tx, token: string) {
  if (!token || token.length > 100) return null;
  const [t] = await tx
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, sha256(token)), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())))
    .limit(1);
  return t ?? null;
}

export function appUrl(path: string) {
  return `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}${path}`;
}
