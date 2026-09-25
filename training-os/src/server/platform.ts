import "server-only";
import { eq, gte, sql } from "drizzle-orm";
import { aiUsage, courses, instructors, organizations, plans, students, subscriptions } from "@/db/schema";
import { withSystem } from "@/db/tenant";

/** Indicateurs globaux de la plateforme (§5.1) — accès super administrateur uniquement. */
export async function platformStats() {
  return withSystem(async (tx) => {
    const orgs = await tx.select().from(organizations);
    const n = async (q: Promise<{ n: number }[]>) => (await q)[0].n;
    const subs = await tx
      .select({ s: subscriptions, p: plans, org: organizations.name })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .innerJoin(organizations, eq(organizations.id, subscriptions.organizationId));
    const today = new Date().toISOString().slice(0, 10);
    const activeSubs = subs.filter((x) => ["active", "trialing", "past_due"].includes(x.s.status) && x.s.currentPeriodEnd >= today);
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const growth: { month: string; n: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(monthStart);
      d.setUTCMonth(d.getUTCMonth() - i);
      const key = d.toISOString().slice(0, 7);
      growth.push({ month: key, n: orgs.filter((o) => o.createdAt.toISOString().slice(0, 7) === key).length });
    }
    return {
      centres: orgs.length,
      actifs: orgs.filter((o) => o.status === "active").length,
      suspendus: orgs.filter((o) => o.status === "suspended").length,
      enConfiguration: orgs.filter((o) => o.status === "onboarding").length,
      etudiants: await n(tx.select({ n: sql<number>`count(*)::int` }).from(students)),
      formations: await n(tx.select({ n: sql<number>`count(*)::int` }).from(courses)),
      formateurs: await n(tx.select({ n: sql<number>`count(*)::int` }).from(instructors)),
      mrr: activeSubs.filter((x) => x.s.status === "active").reduce((a, x) => a + x.s.amount, 0),
      abonnementsActifs: activeSubs.length,
      abonnementsExpires: subs.filter((x) => x.s.status === "expired" || x.s.currentPeriodEnd < today).length,
      nouveauxCentres: orgs.filter((o) => o.createdAt >= monthStart).length,
      growth,
      aiThisMonth: await n(tx.select({ n: sql<number>`count(*)::int` }).from(aiUsage).where(gte(aiUsage.createdAt, monthStart))),
      recent: [...orgs].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 5),
      expiringSoon: subs.filter((x) => x.s.currentPeriodEnd >= today && x.s.currentPeriodEnd <= new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)),
    };
  });
}

