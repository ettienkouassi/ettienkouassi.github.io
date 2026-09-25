import { AttendanceView } from "@/components/pedagogy/attendance-view";
import { PageHeader } from "@/components/ui";
import { isUuid, readSP, type SP } from "@/lib/search-params";
import { instructorScope } from "../scope";

export const metadata = { title: "Présences" };

export default async function Page({ searchParams }: { searchParams: SP }) {
  const { ctx, sessionIds } = await instructorScope();
  const { get } = await readSP(searchParams);
  return (
    <>
      <PageHeader title="Présences" subtitle="Présent · Absent · Retard · Excusé" />
      <AttendanceView ctx={ctx} allowedSessionIds={sessionIds} sessionId={isUuid(get("session")) ? get("session") : undefined} meetingId={isUuid(get("meeting")) ? get("meeting") : undefined} />
    </>
  );
}
