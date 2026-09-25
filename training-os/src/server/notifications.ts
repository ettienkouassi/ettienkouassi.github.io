import "server-only";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { notifications } from "@/db/schema";
import type { OrgContext } from "@/lib/auth/context";

function scope(ctx: OrgContext) {
  const staff = ctx.role === "org_admin" || ctx.role === "manager";
  return and(eq(notifications.organizationId, ctx.orgId), staff ? or(eq(notifications.userId, ctx.user.id), isNull(notifications.userId)) : eq(notifications.userId, ctx.user.id));
}

export async function unreadCount(ctx: OrgContext) {
  const [r] = await ctx.db((tx) => tx.select({ n: sql<number>`count(*)::int` }).from(notifications).where(and(scope(ctx), isNull(notifications.readAt))));
  return r.n;
}

export async function listNotifications(ctx: OrgContext, limit = 50) {
  return ctx.db((tx) => tx.select().from(notifications).where(scope(ctx)).orderBy(desc(notifications.createdAt)).limit(limit));
}

export async function markAllRead(ctx: OrgContext) {
  await ctx.db((tx) => tx.update(notifications).set({ readAt: new Date() }).where(and(scope(ctx), isNull(notifications.readAt))));
}
