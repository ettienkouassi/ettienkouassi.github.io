import { AttendanceView } from "@/components/pedagogy/attendance-view";
import { PageHeader } from "@/components/ui";
import { requirePageOrg, STAFF } from "@/lib/auth/context";
import { isUuid, readSP, type SP } from "@/lib/search-params";

export const metadata = { title: "Présences" };

export default async function AttendancePage({ searchParams }: { searchParams: SP }) {
  const ctx = await requirePageOrg(STAFF, "attendance.write");
  const { get } = await readSP(searchParams);
  return (
    <>
      <PageHeader
        title="Présences"
        subtitle="Sélectionnez une session puis une séance. Le taux de présence, les absences et les retards sont calculés automatiquement."
        actions={
          <a href="/api/export/attendance?format=xlsx" className="btn-secondary">
            ⬇ Excel
          </a>
        }
      />
      <AttendanceView ctx={ctx} sessionId={isUuid(get("session")) ? get("session") : undefined} meetingId={isUuid(get("meeting")) ? get("meeting") : undefined} />
    </>
  );
}
