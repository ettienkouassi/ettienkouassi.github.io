import { PageHeader } from "@/components/ui";
import { requirePageOrg, STAFF } from "@/lib/auth/context";
import { instructorOptions } from "@/server/lookups";
import { saveCourseAction } from "../actions";
import { CourseForm } from "../course-form";

export const metadata = { title: "Nouvelle formation" };

export default async function NewCoursePage() {
  const ctx = await requirePageOrg(STAFF, "courses.write");
  const instr = await ctx.db((tx) => instructorOptions(tx, ctx.orgId));
  return (
    <>
      <PageHeader title="Nouvelle formation" subtitle="Vous pourrez ajouter les modules, sessions et supports après la création." />
      <CourseForm action={saveCourseAction} instructors={instr} />
    </>
  );
}
