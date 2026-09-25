import { and, asc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui";
import { students } from "@/db/schema";
import { requirePageOrg, STAFF } from "@/lib/auth/context";
import { formatDate, formatMoney, todayISO } from "@/lib/format";
import { isUuid, readSP, type SP } from "@/lib/search-params";
import { sessionOptions } from "@/server/lookups";
import { createEnrollmentAction } from "../actions";
import { EnrollmentForm } from "../enrollment-form";

export const metadata = { title: "Nouvelle inscription" };

export default async function NewEnrollmentPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requirePageOrg(STAFF, "enrollments.write");
  const { get } = await readSP(searchParams);
  const course = get("course");
  const { st, se } = await ctx.db(async (tx) => ({
    st: await tx.select({ id: students.id, f: students.firstName, l: students.lastName, m: students.matricule }).from(students).where(and(eq(students.organizationId, ctx.orgId), eq(students.isActive, true))).orderBy(asc(students.lastName)),
    se: await sessionOptions(tx, ctx.orgId, { active: true, courseId: isUuid(course) ? course : undefined }),
  }));
  const sessionParam = get("session");
  return (
    <>
      <PageHeader title="Nouvelle inscription" subtitle="Sélectionnez l'étudiant, la session, le prix et les modalités de paiement." />
      <EnrollmentForm
        action={createEnrollmentAction}
        today={todayISO()}
        students={st.map((s) => ({ id: s.id, label: `${s.l} ${s.f} — ${s.m}` }))}
        sessions={se.filter((s) => s.status !== "completed").map((s) => ({ id: s.id, courseId: s.courseId, price: s.price, label: `${s.courseName} — ${s.name} (${formatDate(s.startDate)}) · ${formatMoney(s.price)}` }))}
        defaults={{ studentId: isUuid(get("student")) ? get("student") : undefined, sessionId: isUuid(sessionParam) ? sessionParam : se.find((s) => s.courseId === course)?.id, prospectId: isUuid(get("prospect")) ? get("prospect") : undefined }}
      />
    </>
  );
}
