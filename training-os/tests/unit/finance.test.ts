import { describe, expect, it } from "vitest";
import { computeBalance, netPrice, splitInstallments, validateSchedule } from "@/lib/domain/finance";

describe("Paiements (§11, §53, §58)", () => {
  it("exemple du cahier des charges : 100 000 F, paiement 30 000 F → payé 30 000, reste 70 000", () => {
    const b = computeBalance({ agreedPrice: 100_000, payments: [{ amount: 30_000, status: "recorded" }], schedules: [], today: "2026-09-25" });
    expect(b.paid).toBe(30_000);
    expect(b.remaining).toBe(70_000);
    expect(b.status).toBe("partial");
  });

  it("workflow §53 : 30 000 + 35 000 + 35 000, payé 65 000 → reste 35 000, prochaine échéance 15 octobre", () => {
    const schedules = [
      { position: 1, label: "Inscription", dueDate: "2026-09-01", amount: 30_000 },
      { position: 2, label: "Échéance 2", dueDate: "2026-09-15", amount: 35_000 },
      { position: 3, label: "Échéance 3", dueDate: "2026-10-15", amount: 35_000 },
    ];
    const b = computeBalance({
      agreedPrice: 100_000,
      payments: [
        { amount: 30_000, status: "recorded" },
        { amount: 35_000, status: "recorded" },
      ],
      schedules,
      today: "2026-09-25",
    });
    expect(b.paid).toBe(65_000);
    expect(b.remaining).toBe(35_000);
    expect(b.nextDue).toEqual({ label: "Échéance 3", dueDate: "2026-10-15", amount: 35_000 });
    expect(b.status).toBe("partial");
    expect(b.overdueAmount).toBe(0);
  });

  it("détecte un retard lorsque l'échéance passée n'est pas couverte", () => {
    const b = computeBalance({
      agreedPrice: 100_000,
      payments: [{ amount: 30_000, status: "recorded" }],
      schedules: [
        { position: 1, label: "A", dueDate: "2026-09-01", amount: 30_000 },
        { position: 2, label: "B", dueDate: "2026-09-15", amount: 70_000 },
      ],
      today: "2026-09-25",
    });
    expect(b.status).toBe("overdue");
    expect(b.overdueAmount).toBe(70_000);
    expect(b.installments.map((i) => i.state)).toEqual(["paid", "overdue"]);
  });

  it("ignore les paiements annulés", () => {
    const b = computeBalance({ agreedPrice: 50_000, payments: [{ amount: 50_000, status: "cancelled" }], schedules: [], today: "2026-01-01" });
    expect(b.paid).toBe(0);
    expect(b.status).toBe("unpaid");
  });

  it("applique la remise et marque soldé", () => {
    const b = computeBalance({ agreedPrice: 100_000, discount: 10_000, payments: [{ amount: 90_000, status: "recorded" }], schedules: [], today: "2026-01-01" });
    expect(b.total).toBe(90_000);
    expect(b.status).toBe("paid");
    expect(netPrice(100, 200)).toBe(0);
  });

  it("répartit les paiements partiels sur les échéances (FIFO)", () => {
    const b = computeBalance({
      agreedPrice: 90,
      payments: [{ amount: 40, status: "recorded" }],
      schedules: [
        { position: 1, label: "1", dueDate: "2026-12-01", amount: 30 },
        { position: 2, label: "2", dueDate: "2026-12-15", amount: 30 },
        { position: 3, label: "3", dueDate: "2026-12-30", amount: 30 },
      ],
      today: "2026-11-01",
    });
    expect(b.installments.map((i) => [i.paid, i.state])).toEqual([
      [30, "paid"],
      [10, "partial"],
      [0, "due"],
    ]);
  });

  it("inscription annulée → statut annulé", () => {
    expect(computeBalance({ agreedPrice: 10, payments: [], schedules: [], today: "2026-01-01", cancelled: true }).status).toBe("cancelled");
  });

  it("génère un échéancier dont la somme est exacte", () => {
    const s = splitInstallments(100_000, 3, "2026-09-01", 30);
    expect(s.reduce((a, x) => a + x.amount, 0)).toBe(100_000);
    expect(s.map((x) => x.dueDate)).toEqual(["2026-09-01", "2026-10-01", "2026-10-31"]);
    expect(validateSchedule(100_000, s)).toBeNull();
    expect(validateSchedule(100_000, [{ amount: 50_000, dueDate: "2026-01-01" }])).toMatch(/somme/);
    expect(validateSchedule(100, [{ amount: 0, dueDate: "2026-01-01" }])).toMatch(/positif/);
  });
});
