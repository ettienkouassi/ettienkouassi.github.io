import { describe, expect, it } from "vitest";
import { attendanceStats, averagePercent, certificationEligibility, computeProgress, dropoutRisk } from "@/lib/domain/pedagogy";

describe("Présences (§12)", () => {
  it("calcule taux, absences, retards et absences consécutives", () => {
    const s = attendanceStats([{ status: "present" }, { status: "late" }, { status: "excused" }, { status: "absent" }, { status: "absent" }]);
    expect(s.attended).toBe(2);
    expect(s.absent).toBe(2);
    expect(s.late).toBe(1);
    expect(s.rate).toBe(50); // 2 présences / 4 (l'excusée est exclue)
    expect(s.consecutiveAbsences).toBe(2);
  });
  it("une absence excusée n'interrompt pas la série d'absences", () => {
    expect(attendanceStats([{ status: "absent" }, { status: "excused" }, { status: "absent" }]).consecutiveAbsences).toBe(2);
  });
  it("aucune séance → taux inconnu", () => {
    expect(attendanceStats([]).rate).toBeNull();
  });
});

describe("Progression (§14)", () => {
  it("pondère présence, modules et évaluations", () => {
    const p = computeProgress({
      attendanceRate: 100,
      modulePercents: [100, 80, 60, 100],
      results: [{ score: 16, maxScore: 20, passed: true }],
      weights: { attendance: 30, modules: 30, assessments: 40 },
    });
    expect(p.modules).toBe(85);
    expect(p.assessments).toBe(80);
    expect(p.global).toBe(87.5);
  });
  it("redistribue le poids d'une composante sans donnée", () => {
    const p = computeProgress({ attendanceRate: 80, modulePercents: [], results: [], weights: { attendance: 30, modules: 30, assessments: 40 } });
    expect(p.global).toBe(80);
  });
  it("moyenne en pourcentage", () => {
    expect(averagePercent([{ score: 10, maxScore: 20, passed: true }, { score: 30, maxScore: 40, passed: true }])).toBe(62.5);
  });
});

describe("Certification (§52)", () => {
  const rules = { minAttendance: 75, minGrade: 50, requireAllModules: true, requireFinalExam: true, requireFullPayment: true };
  it("éligible lorsque toutes les conditions sont remplies", () => {
    const r = certificationEligibility({ rules, attendanceRate: 90, averageGrade: 70, modulePercents: [100, 100], finalExamPassed: true, remainingBalance: 0 });
    expect(r.eligible).toBe(true);
  });
  it("liste les conditions manquantes", () => {
    const r = certificationEligibility({ rules, attendanceRate: 60, averageGrade: 70, modulePercents: [100, 50], finalExamPassed: null, remainingBalance: 5000 });
    expect(r.eligible).toBe(false);
    expect(r.checks.filter((c) => !c.ok).map((c) => c.key)).toEqual(["attendance", "modules", "final_exam", "payment"]);
  });
});

describe("Risque de décrochage (§23)", () => {
  it("aucun signal → aucun niveau", () => {
    const r = dropoutRisk({ attendance: attendanceStats([{ status: "present" }]), results: [], daysSinceLastActivity: 1, missedAssessments: 0, overdueAmount: 0 });
    expect(r.level).toBe("none");
  });
  it("cumule les signaux en niveau d'alerte", () => {
    const r = dropoutRisk({
      attendance: attendanceStats([{ status: "present" }, { status: "absent" }, { status: "absent" }]),
      results: [{ score: 5, maxScore: 20, passed: false }],
      daysSinceLastActivity: 20,
      missedAssessments: 1,
      overdueAmount: 1000,
    });
    expect(r.level).toBe("high");
    expect(r.signals.map((s) => s.key)).toContain("consecutive_absences");
  });
});
