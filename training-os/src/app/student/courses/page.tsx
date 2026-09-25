import { EnrollmentCard } from "@/components/enrollment-card";
import { Empty, PageHeader } from "@/components/ui";
import { studentScope } from "../scope";

export const metadata = { title: "Mes formations" };

export default async function Page() {
  const { sums } = await studentScope();
  return (
    <>
      <PageHeader title="Mes formations" />
      {sums.length === 0 ? (
        <Empty title="Aucune formation" />
      ) : (
        <div className="space-y-4">
          {sums.map((s) => (
            <EnrollmentCard key={s.enrollmentId} s={s} />
          ))}
        </div>
      )}
    </>
  );
}
