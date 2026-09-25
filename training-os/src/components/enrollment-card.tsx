import Link from "next/link";
import { AttendanceBadge, EnrollmentStatusBadge, PaymentStatusBadge, RiskBadge } from "@/components/badges";
import { Badge, ProgressBar } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import type { EnrollmentSummary } from "@/server/summaries";

/** Carte de synthèse d'une inscription (fiche étudiant, espace étudiant). */
export function EnrollmentCard({ s, adminLinks = false, showRisk = false, showFinance = true }: { s: EnrollmentSummary; adminLinks?: boolean; showRisk?: boolean; showFinance?: boolean }) {
  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">
            {adminLinks ? (
              <Link className="link" href={`/app/enrollments/${s.enrollmentId}`}>
                {s.course.name}
              </Link>
            ) : (
              s.course.name
            )}
          </h3>
          <p className="text-xs text-slate-500">
            {s.session.name} · {formatDate(s.session.startDate)} → {formatDate(s.session.endDate)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <EnrollmentStatusBadge value={s.status} />
          {showFinance && <PaymentStatusBadge value={s.balance.status} />}
          {showRisk && s.risk.level !== "none" && <RiskBadge level={s.risk.level} />}
          {s.certification.certificateCode && <Badge tone="purple">🏅 {s.certification.certificateCode}</Badge>}
        </div>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-1 flex justify-between text-xs font-medium text-slate-600">
            <span>Progression globale</span>
          </div>
          <ProgressBar value={s.progress.global} />
          <ul className="mt-3 space-y-1.5">
            {s.modules.map((m) => (
              <li key={m.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] items-center gap-2 text-xs">
                <span className="truncate text-slate-600" title={m.title}>
                  {m.position}. {m.title}
                </span>
                <ProgressBar value={m.percent} tone="blue" />
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-slate-50 p-2">
              <div className="text-xs text-slate-500">Présence</div>
              <div className="font-semibold">{s.attendance.rate === null ? "—" : `${s.attendance.rate} %`}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <div className="text-xs text-slate-500">Moyenne</div>
              <div className="font-semibold">{s.averageGrade === null ? "—" : `${s.averageGrade} %`}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <div className="text-xs text-slate-500">Séances</div>
              <div className="font-semibold">
                {s.attendance.attended}/{s.attendance.total}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1 text-xs">
            {s.attendance.absent > 0 && <AttendanceBadge value="absent" />} {s.attendance.absent > 0 && <span>{s.attendance.absent} absence(s)</span>}
            {s.attendance.late > 0 && <span className="ml-2">{s.attendance.late} retard(s)</span>}
          </div>
          {showFinance && (
          <div className="rounded-lg border border-slate-100 p-3">
            <div className="flex justify-between">
              <span className="text-slate-500">Total</span>
              <span className="font-medium tabular-nums">{formatMoney(s.balance.total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Payé</span>
              <span className="font-medium tabular-nums text-emerald-600">{formatMoney(s.balance.paid)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Reste</span>
              <span className="font-semibold tabular-nums">{formatMoney(s.balance.remaining)}</span>
            </div>
            {s.balance.nextDue && (
              <div className="mt-1 text-xs text-slate-500">
                Prochaine échéance : {formatMoney(s.balance.nextDue.amount)} le {formatDate(s.balance.nextDue.dueDate)}
              </div>
            )}
          </div>
          )}
          {s.results.length > 0 && (
            <ul className="space-y-1 text-xs">
              {s.results.map((r, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="truncate">{r.title}</span>
                  <span className={r.passed ? "text-emerald-700" : "text-red-600"}>
                    {r.score}/{r.maxScore} {r.passed ? "✓" : "✗"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {showRisk && s.risk.signals.length > 0 && (
            <p className="text-xs text-amber-800">
              Indicateurs : {s.risk.signals.map((x) => x.label).join(" · ")} <em>(alerte, pas un diagnostic)</em>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
