import { AssessmentsView } from "@/components/pedagogy/assessments-view";
import { PageHeader } from "@/components/ui";
import { isUuid, readSP, type SP } from "@/lib/search-params";
import { instructorScope } from "../scope";

export const metadata = { title: "Évaluations" };

export default async function Page({ searchParams }: { searchParams: SP }) {
  const { ctx, sessionIds } = await instructorScope();
  const { get } = await readSP(searchParams);
  return (
    <>
      <PageHeader title="Évaluations" subtitle="Créez des exercices et quiz, saisissez les notes." />
      <AssessmentsView ctx={ctx} allowedSessionIds={sessionIds} assessmentId={isUuid(get("assessment")) ? get("assessment") : undefined} mode={get("mode")} />
    </>
  );
}
