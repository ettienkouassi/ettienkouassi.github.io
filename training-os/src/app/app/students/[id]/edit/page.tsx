import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { students } from "@/db/schema";
import { requirePageOrg, STAFF } from "@/lib/auth/context";
import { updateStudentAction } from "../../actions";
import { StudentForm } from "../../student-form";

export default async function EditStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageOrg(STAFF, "students.write");
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [s] = await ctx.db((tx) => tx.select().from(students).where(eq(students.id, id)).limit(1));
  if (!s) notFound();
  return (
    <>
      <PageHeader title={`Modifier — ${s.firstName} ${s.lastName}`} />
      <StudentForm action={updateStudentAction} student={s} />
    </>
  );
}
