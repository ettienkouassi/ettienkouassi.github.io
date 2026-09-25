/**
 * Calculs financiers (§11, §53) — fonctions pures, testées unitairement.
 * Les chiffres financiers ne sont JAMAIS calculés par l'IA (§50).
 */
export type ScheduleInput = { id?: string; position: number; label: string; dueDate: string; amount: number };
export type PaymentInput = { amount: number; status: "recorded" | "cancelled" };

export type InstallmentState = "paid" | "partial" | "due" | "overdue";
export type EnrollmentPaymentStatus = "paid" | "partial" | "unpaid" | "overdue" | "cancelled";

export type Installment = ScheduleInput & { paid: number; remaining: number; state: InstallmentState };

export type Balance = {
  total: number;
  paid: number;
  remaining: number;
  overdueAmount: number;
  status: EnrollmentPaymentStatus;
  nextDue: { label: string; dueDate: string; amount: number } | null;
  installments: Installment[];
};

export function netPrice(agreedPrice: number, discount = 0): number {
  return Math.max(0, agreedPrice - discount);
}

export function computeBalance(input: {
  agreedPrice: number;
  discount?: number;
  payments: PaymentInput[];
  schedules: ScheduleInput[];
  today: string; // AAAA-MM-JJ
  cancelled?: boolean;
}): Balance {
  const total = netPrice(input.agreedPrice, input.discount ?? 0);
  const paid = input.payments.filter((p) => p.status === "recorded").reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, total - paid);

  // Répartition des paiements sur les échéances par ordre chronologique (FIFO)
  const sorted = [...input.schedules].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.position - b.position);
  let pool = paid;
  const installments: Installment[] = sorted.map((s) => {
    const alloc = Math.min(pool, s.amount);
    pool -= alloc;
    const rest = s.amount - alloc;
    let state: InstallmentState = "due";
    if (rest === 0) state = "paid";
    else if (s.dueDate < input.today) state = "overdue";
    else if (alloc > 0) state = "partial";
    return { ...s, paid: alloc, remaining: rest, state };
  });

  const overdueAmount = installments.filter((i) => i.state === "overdue").reduce((s, i) => s + i.remaining, 0);
  const next = installments.find((i) => i.remaining > 0);

  let status: EnrollmentPaymentStatus;
  if (input.cancelled) status = "cancelled";
  else if (remaining === 0) status = "paid";
  else if (overdueAmount > 0) status = "overdue";
  else if (paid > 0) status = "partial";
  else status = "unpaid";

  return {
    total,
    paid,
    remaining,
    overdueAmount,
    status,
    nextDue: next ? { label: next.label, dueDate: next.dueDate, amount: next.remaining } : null,
    installments,
  };
}

/** Vérifie qu'un échéancier couvre exactement le prix net. */
export function validateSchedule(total: number, schedules: Pick<ScheduleInput, "amount" | "dueDate">[]): string | null {
  if (schedules.length === 0) return null;
  if (schedules.some((s) => !(s.amount > 0))) return "Chaque échéance doit avoir un montant positif.";
  const sum = schedules.reduce((s, x) => s + x.amount, 0);
  if (sum !== total) return `La somme des échéances (${sum}) doit être égale au montant dû (${total}).`;
  return null;
}

/** Génère un échéancier en N versements égaux (le reste de l'arrondi sur le premier). */
export function splitInstallments(total: number, count: number, firstDue: string, intervalDays = 30): ScheduleInput[] {
  if (count < 1) return [];
  const base = Math.floor(total / count);
  const first = total - base * (count - 1);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(`${firstDue}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i * intervalDays);
    return {
      position: i + 1,
      label: i === 0 ? "Inscription" : `Échéance ${i + 1}`,
      dueDate: d.toISOString().slice(0, 10),
      amount: i === 0 ? first : base,
    };
  });
}
