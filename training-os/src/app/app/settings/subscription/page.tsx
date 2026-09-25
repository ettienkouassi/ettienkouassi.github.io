import { and, desc, eq, gte, sql } from "drizzle-orm";
import { Card, DL, PageHeader, ProgressBar } from "@/components/ui";
import { aiUsage, courses, instructors, plans, students, subscriptions } from "@/db/schema";
import { requirePageOrg, STAFF } from "@/lib/auth/context";
import { formatDate, formatMoney } from "@/lib/format";
import { SettingsTabs } from "../tabs";

export const metadata = { title: "Abonnement" };

export default async function SubscriptionPage() {
  const ctx = await requirePageOrg(STAFF, "settings.write");
  const d = await ctx.db(async (tx) => {
    const [sub] = await tx.select({ s: subscriptions, p: plans }).from(subscriptions).innerJoin(plans, eq(plans.id, subscriptions.planId)).where(eq(subscriptions.organizationId, ctx.orgId)).orderBy(desc(subscriptions.currentPeriodEnd)).limit(1);
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const count = async (q: Promise<{ n: number }[]>) => (await q)[0].n;
    return {
      sub,
      students: await count(tx.select({ n: sql<number>`count(*)::int` }).from(students).where(and(eq(students.organizationId, ctx.orgId), eq(students.isActive, true)))),
      instructors: await count(tx.select({ n: sql<number>`count(*)::int` }).from(instructors).where(and(eq(instructors.organizationId, ctx.orgId), eq(instructors.isActive, true)))),
      courses: await count(tx.select({ n: sql<number>`count(*)::int` }).from(courses).where(and(eq(courses.organizationId, ctx.orgId), sql`${courses.status} <> 'archived'`))),
      ai: await count(tx.select({ n: sql<number>`count(*)::int` }).from(aiUsage).where(and(eq(aiUsage.organizationId, ctx.orgId), gte(aiUsage.createdAt, monthStart), eq(aiUsage.status, "ok")))),
    };
  });
  const usage = (label: string, used: number, max: number | null | undefined) => (
    <div key={label}>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-slate-600">
          {used} / {max ?? "illimité"}
        </span>
      </div>
      {max ? <ProgressBar value={(used / max) * 100} tone="blue" /> : null}
    </div>
  );
  return (
    <>
      <PageHeader title="Abonnement" />
      <SettingsTabs active="subscription" />
      {!d.sub ? (
        <Card>Aucun abonnement. Contactez TRAINING OS AI.</Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={`Plan ${d.sub.p.name}`}>
            <DL
              items={[
                ["Statut", d.sub.s.status],
                ["Période", `${formatDate(d.sub.s.currentPeriodStart)} → ${formatDate(d.sub.s.currentPeriodEnd)}`],
                ["Tarif", d.sub.p.priceMonthly ? `${formatMoney(d.sub.p.priceMonthly)} / mois` : "Sur devis"],
                ["Stockage", d.sub.p.storageMb ? `${d.sub.p.storageMb / 1000} Go` : "Illimité"],
              ]}
            />
          </Card>
          <Card title="Utilisation">
            <div className="space-y-4">
              {usage("Étudiants actifs", d.students, d.sub.p.maxStudents)}
              {usage("Formateurs", d.instructors, d.sub.p.maxInstructors)}
              {usage("Formations", d.courses, d.sub.p.maxCourses)}
              {usage("Requêtes IA ce mois-ci", d.ai, d.sub.p.aiRequestsPerMonth)}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
