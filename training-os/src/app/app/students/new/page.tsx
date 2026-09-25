import { PageHeader } from "@/components/ui";
import { requirePageOrg, STAFF } from "@/lib/auth/context";
import { createStudentAction } from "../actions";
import { StudentForm } from "../student-form";

export const metadata = { title: "Nouvel étudiant" };

export default async function NewStudentPage() {
  await requirePageOrg(STAFF, "students.write");
  return (
    <>
      <PageHeader title="Nouvel étudiant" subtitle="Seules les informations nécessaires à la formation sont collectées." />
      <StudentForm action={createStudentAction} />
    </>
  );
}
