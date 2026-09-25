import { MaterialsView } from "@/components/pedagogy/materials-view";
import { PageHeader } from "@/components/ui";
import { instructorScope } from "../scope";

export const metadata = { title: "Supports" };

export default async function Page() {
  const { ctx, courseIds } = await instructorScope();
  return (
    <>
      <PageHeader title="Supports" subtitle="Supports autorisés de vos formations." />
      <MaterialsView ctx={ctx} allowedCourseIds={courseIds} />
    </>
  );
}
