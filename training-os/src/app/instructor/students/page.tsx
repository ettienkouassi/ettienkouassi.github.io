import { EnrollmentCard } from "@/components/enrollment-card";
import { Empty, PageHeader } from "@/components/ui";
import { orgInfo } from "@/server/metrics";
import { loadEnrollmentSummaries } from "@/server/summaries";
import { instructorScope } from "../scope";

export const metadata = { title: "Mes étudiants" };

export default async function InstructorStudents() {
  const { ctx, sessionIds } = await instructorScope();
  const sums = await ctx.db(async (tx) => loadEnrollmentSummaries(tx, ctx.orgId, { sessionIds, statuses: ["registered", "active", "completed"] }, (await orgInfo(tx, ctx.orgId)).timezone));
  return (
    <>
      <PageHeader title="Mes étudiants" subtitle="Uniquement les étudiants des sessions qui vous sont attribuées. Les données financières détaillées restent réservées à l'administration." />
      {sums.length === 0 ? (
        <Empty title="Aucun étudiant" />
      ) : (
        <div className="space-y-4">
          {sums.map((s) => (
            <EnrollmentCard key={s.enrollmentId} s={s} showRisk showFinance={false} />
          ))}
        </div>
      )}
    </>
  );
}
