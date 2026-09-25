import { PageHeader } from "@/components/ui";
import { requirePageOrg, STAFF } from "@/lib/auth/context";
import { readSP, type SP } from "@/lib/search-params";
import { courseOptions, instructorOptions } from "@/server/lookups";
import { saveSessionAction } from "../actions";
import { SessionForm } from "../session-form";

export const metadata = { title: "Nouvelle session" };

export default async function NewSessionPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requirePageOrg(STAFF, "sessions.write");
  const { get } = await readSP(searchParams);
  const { c, i } = await ctx.db(async (tx) => ({ c: await courseOptions(tx, ctx.orgId), i: await instructorOptions(tx, ctx.orgId) }));
  return (
    <>
      <PageHeader title="Nouvelle session" />
      <SessionForm action={saveSessionAction} courses={c} instructors={i} defaultCourseId={get("course")} />
    </>
  );
}
