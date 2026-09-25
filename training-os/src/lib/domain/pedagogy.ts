/**
 * Présences, progression, certification et risque de décrochage — fonctions pures.
 */
export type AttendanceStatus = "present" | "absent" | "late" | "excused";

export type AttendanceStats = {
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  attended: number;
  rate: number | null; // % ; les absences excusées sont exclues du dénominateur
  consecutiveAbsences: number; // absences consécutives les plus récentes
};

/** records doit être trié par date croissante de séance. */
export function attendanceStats(records: { status: AttendanceStatus }[]): AttendanceStats {
  const c = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const r of records) c[r.status]++;
  const attended = c.present + c.late;
  const denom = records.length - c.excused;
  let consecutive = 0;
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].status === "absent") consecutive++;
    else if (records[i].status === "excused") continue;
    else break;
  }
  return {
    total: records.length,
    ...c,
    attended,
    rate: denom > 0 ? round1((attended / denom) * 100) : null,
    consecutiveAbsences: consecutive,
  };
}

export type ResultInput = { score: number; maxScore: number; passed: boolean; isFinalExam?: boolean; date?: string | null };

export function averagePercent(results: ResultInput[]): number | null {
  if (results.length === 0) return null;
  const s = results.reduce((acc, r) => acc + (r.maxScore > 0 ? (r.score / r.maxScore) * 100 : 0), 0);
  return round1(s / results.length);
}

export type ProgressInput = {
  attendanceRate: number | null;
  modulePercents: number[]; // un pourcentage par module de la formation (0 si non commencé)
  results: ResultInput[];
  weights: { attendance: number; modules: number; assessments: number };
};

/**
 * Progression globale pondérée (§14). Une composante sans donnée est ignorée et
 * son poids redistribué, pour ne pas pénaliser un étudiant en début de formation.
 */
export function computeProgress(p: ProgressInput): { global: number; modules: number | null; assessments: number | null; attendance: number | null } {
  const modules = p.modulePercents.length ? round1(p.modulePercents.reduce((a, b) => a + b, 0) / p.modulePercents.length) : null;
  const assessments = averagePercent(p.results);
  const parts: [number | null, number][] = [
    [p.attendanceRate, p.weights.attendance],
    [modules, p.weights.modules],
    [assessments, p.weights.assessments],
  ];
  const active = parts.filter(([v, w]) => v !== null && w > 0) as [number, number][];
  const wsum = active.reduce((s, [, w]) => s + w, 0);
  const global = wsum > 0 ? round1(active.reduce((s, [v, w]) => s + Math.min(100, v) * w, 0) / wsum) : 0;
  return { global, modules, assessments, attendance: p.attendanceRate };
}

export type CertificationRules = {
  minAttendance: number;
  minGrade: number;
  requireAllModules: boolean;
  requireFinalExam: boolean;
  requireFullPayment: boolean;
};

export type CertificationCheck = { key: string; label: string; ok: boolean; detail: string };

export function certificationEligibility(input: {
  rules: CertificationRules;
  attendanceRate: number | null;
  averageGrade: number | null;
  modulePercents: number[];
  finalExamPassed: boolean | null; // null = aucun examen final saisi
  remainingBalance: number;
}): { eligible: boolean; checks: CertificationCheck[] } {
  const r = input.rules;
  const checks: CertificationCheck[] = [];
  checks.push({
    key: "attendance",
    label: `Présence minimale ${r.minAttendance} %`,
    ok: r.minAttendance === 0 || (input.attendanceRate ?? 0) >= r.minAttendance,
    detail: input.attendanceRate === null ? "Aucune présence enregistrée" : `${input.attendanceRate} %`,
  });
  checks.push({
    key: "grade",
    label: `Moyenne minimale ${r.minGrade} %`,
    ok: r.minGrade === 0 || (input.averageGrade ?? 0) >= r.minGrade,
    detail: input.averageGrade === null ? "Aucune note" : `${input.averageGrade} %`,
  });
  if (r.requireAllModules) {
    const done = input.modulePercents.filter((x) => x >= 100).length;
    checks.push({
      key: "modules",
      label: "Tous les modules terminés",
      ok: input.modulePercents.length > 0 && done === input.modulePercents.length,
      detail: `${done}/${input.modulePercents.length} modules`,
    });
  }
  if (r.requireFinalExam) {
    checks.push({
      key: "final_exam",
      label: "Examen final réussi",
      ok: input.finalExamPassed === true,
      detail: input.finalExamPassed === null ? "Non passé" : input.finalExamPassed ? "Réussi" : "Échoué",
    });
  }
  if (r.requireFullPayment) {
    checks.push({
      key: "payment",
      label: "Paiement complet",
      ok: input.remainingBalance <= 0,
      detail: input.remainingBalance <= 0 ? "Soldé" : `Reste ${input.remainingBalance}`,
    });
  }
  return { eligible: checks.every((c) => c.ok), checks };
}

export type RiskSignal = { key: string; label: string; weight: number };
export type RiskLevel = "none" | "low" | "medium" | "high";

/**
 * Détection du risque de décrochage (§23).
 * IMPORTANT : il s'agit d'une ALERTE fondée sur des indicateurs observables,
 * pas d'un diagnostic automatique. Le libellé affiché doit le rappeler.
 */
export function dropoutRisk(input: {
  attendance: AttendanceStats;
  results: ResultInput[]; // triés par date croissante
  daysSinceLastActivity: number | null;
  missedAssessments: number;
  overdueAmount: number;
}): { level: RiskLevel; score: number; signals: RiskSignal[] } {
  const s: RiskSignal[] = [];
  const a = input.attendance;
  if (a.consecutiveAbsences >= 2) s.push({ key: "consecutive_absences", label: `${a.consecutiveAbsences} absences consécutives`, weight: 3 });
  if (a.rate !== null && a.total >= 3 && a.rate < 70) s.push({ key: "low_attendance", label: `Taux de présence faible (${a.rate} %)`, weight: 2 });
  const avg = averagePercent(input.results);
  if (avg !== null && avg < 50) s.push({ key: "low_grades", label: `Moyenne insuffisante (${avg} %)`, weight: 2 });
  if (input.results.length >= 3) {
    const last = input.results[input.results.length - 1];
    const prev = averagePercent(input.results.slice(0, -1)) ?? 0;
    const lastPct = (last.score / last.maxScore) * 100;
    if (prev - lastPct >= 15) s.push({ key: "declining", label: "Baisse récente des résultats", weight: 1 });
  }
  if (input.daysSinceLastActivity !== null && input.daysSinceLastActivity >= 14)
    s.push({ key: "inactive", label: `Aucune connexion depuis ${input.daysSinceLastActivity} jours`, weight: 1 });
  if (input.missedAssessments > 0) s.push({ key: "missed_work", label: `${input.missedAssessments} évaluation(s) non réalisée(s)`, weight: 1 });
  if (input.overdueAmount > 0) s.push({ key: "overdue_payment", label: "Paiement en retard", weight: 1 });
  const score = s.reduce((x, y) => x + y.weight, 0);
  const level: RiskLevel = score >= 5 ? "high" : score >= 3 ? "medium" : score >= 1 ? "low" : "none";
  return { level, score, signals: s };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
