import Link from "next/link";
import { EnrollmentStatusBadge, PaymentStatusBadge } from "@/components/badges";
import { Empty, PageHeader, ProgressBar, TableWrap } from "@/components/ui";
import { requirePageOrg, STAFF } from "@/lib/auth/context";
import { formatDate, formatMoney, LABELS } from "@/lib/format";
import { isUuid, readSP, type SP } from "@/lib/search-params";
import { sessionOptions } from "@/server/lookups";
import { orgInfo } from "@/server/metrics";
import { loadEnrollmentSummaries } from "@/server/summaries";

export const metadata = { title: "Inscriptions" };
type St = keyof typeof LABELS.enrollmentStatus;

export default async function EnrollmentsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requirePageOrg(STAFF, "enrollments.write");
  const { get } = await readSP(searchParams);
  const status = get("status");
  const session = get("session");
  const q = get("q").toLowerCase();
  const { sums, sessions } = await ctx.db(async (tx) => {
    const org = await orgInfo(tx, ctx.orgId);
    return {
      sums: await loadEnrollmentSummaries(tx, ctx.orgId, { statuses: status in LABELS.enrollmentStatus ? [status as St] : undefined, sessionIds: isUuid(session) ? [session] : undefined }, org.timezone),
      sessions: await sessionOptions(tx, ctx.orgId),
    };
  });
  const rows = sums.filter((s) => !q || `${s.student.firstName} ${s.student.lastName} ${s.student.matricule}`.toLowerCase().includes(q)).sort((a, b) => b.enrolledAt.getTime() - a.enrolledAt.getTime());
  return (
    <>
      <PageHeader
        title="Inscriptions"
        subtitle={`${rows.length} inscription(s)`}
        actions={
          <>
            <a href="/api/export/enrollments?format=xlsx" className="btn-secondary">
              ⬇ Excel
            </a>
            <Link href="/app/enrollments/new" className="btn-primary">
              + Nouvelle inscription
            </Link>
          </>
        }
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Nom ou matricule…" className="input max-w-xs" />
        <select name="status" defaultValue={status} className="input w-auto">
          <option value="">Tous les statuts</option>
          {Object.entries(LABELS.enrollmentStatus).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select name="session" defaultValue={session} className="input w-auto max-w-xs">
          <option value="">Toutes les sessions</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button className="btn-secondary">Filtrer</button>
      </form>
      {rows.length === 0 ? (
        <Empty title="Aucune inscription" />
      ) : (
        <TableWrap>
          <table className="table">
            <thead>
              <tr>
                <th>Étudiant</th>
                <th>Formation / session</th>
                <th className="hidden md:table-cell">Inscrit le</th>
                <th>Statut</th>
                <th className="num">Total</th>
                <th className="num">Reste</th>
                <th>Paiement</th>
                <th className="hidden min-w-32 lg:table-cell">Progression</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.enrollmentId}>
                  <td>
                    <Link href={`/app/enrollments/${s.enrollmentId}`} className="link font-medium">
                      {s.student.lastName} {s.student.firstName}
                    </Link>
                  </td>
                  <td>
                    {s.course.name}
                    <div className="text-xs text-slate-500">{s.session.name}</div>
                  </td>
                  <td className="hidden md:table-cell">{formatDate(s.enrolledAt)}</td>
                  <td>
                    <EnrollmentStatusBadge value={s.status} />
                  </td>
                  <td className="num">{formatMoney(s.balance.total)}</td>
                  <td className="num">{formatMoney(s.balance.remaining)}</td>
                  <td>
                    <PaymentStatusBadge value={s.balance.status} />
                  </td>
                  <td className="hidden lg:table-cell">
                    <ProgressBar value={s.progress.global} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </>
  );
}
