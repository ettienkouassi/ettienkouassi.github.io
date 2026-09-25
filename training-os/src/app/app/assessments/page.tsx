import { AssessmentsView } from "@/components/pedagogy/assessments-view";
import { ProgressView } from "@/components/pedagogy/progress-view";
import { PageHeader, Tabs } from "@/components/ui";
import { requirePageOrg, STAFF } from "@/lib/auth/context";
import { isUuid, readSP, type SP } from "@/lib/search-params";

export const metadata = { title: "Évaluations" };

export default async function AssessmentsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requirePageOrg(STAFF, "assessments.write");
  const { get } = await readSP(searchParams);
  const tab = get("tab") || "grades";
  return (
    <>
      <PageHeader
        title="Évaluations & progression"
        subtitle="Quiz, exercices, devoirs, examens, projets finaux — notes, pourcentages, réussite et progression calculés automatiquement."
        actions={
          <a href="/api/export/results?format=xlsx" className="btn-secondary">
            ⬇ Résultats (Excel)
          </a>
        }
      />
      <Tabs
        active={tab}
        tabs={[
          { key: "grades", label: "Évaluations & notes", href: "?tab=grades" },
          { key: "progress", label: "Progression par module", href: "?tab=progress" },
        ]}
      />
      {tab === "progress" ? (
        <ProgressView ctx={ctx} sessionId={isUuid(get("session")) ? get("session") : undefined} />
      ) : (
        <AssessmentsView ctx={ctx} assessmentId={isUuid(get("assessment")) ? get("assessment") : undefined} mode={get("mode")} />
      )}
    </>
  );
}
