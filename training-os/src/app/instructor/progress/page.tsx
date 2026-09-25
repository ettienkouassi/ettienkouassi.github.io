import { ProgressView } from "@/components/pedagogy/progress-view";
import { PageHeader } from "@/components/ui";
import { isUuid, readSP, type SP } from "@/lib/search-params";
import { instructorScope } from "../scope";

export const metadata = { title: "Progression" };

export default async function Page({ searchParams }: { searchParams: SP }) {
  const { ctx, sessionIds } = await instructorScope();
  const { get } = await readSP(searchParams);
  return (
    <>
      <PageHeader title="Progression" subtitle="Avancement par module de chaque étudiant." />
      <ProgressView ctx={ctx} allowedSessionIds={sessionIds} sessionId={isUuid(get("session")) ? get("session") : undefined} />
    </>
  );
}
