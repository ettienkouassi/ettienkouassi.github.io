export function formatMoney(amount: number | null | undefined, currency = "XOF"): string {
  const v = Number(amount ?? 0);
  const n = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(v).replace(/ /g, " ");
  return currency === "XOF" || currency === "XAF" ? `${n} FCFA` : `${n} ${currency}`;
}

export function formatDate(d: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" }): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d.length === 10 ? `${d}T00:00:00` : d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", opts).format(date);
}

export function formatDateTime(d: string | Date | null | undefined): string {
  return formatDate(d, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatPercent(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v.toFixed(digits)} %`;
}

export function fullName(p: { firstName: string; lastName: string } | null | undefined): string {
  return p ? `${p.firstName} ${p.lastName}` : "—";
}

/** Date du jour au format AAAA-MM-JJ dans le fuseau du centre. */
export function todayISO(timeZone = "Africa/Abidjan", base = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(base);
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export const LABELS = {
  sessionStatus: { draft: "Brouillon", open: "Ouverte", full: "Complète", in_progress: "En cours", completed: "Terminée", cancelled: "Annulée" },
  enrollmentStatus: {
    prospect: "Prospect",
    preregistered: "Préinscrit",
    registered: "Inscrit",
    active: "Actif",
    completed: "Terminé",
    dropped: "Abandonné",
    cancelled: "Annulé",
  },
  paymentMethod: { cash: "Espèces", bank_transfer: "Virement", card: "Carte", mobile_money: "Mobile Money", other: "Autre" },
  paymentStatus: { paid: "Payé", partial: "Partiellement payé", unpaid: "Impayé", overdue: "En retard", cancelled: "Annulé" },
  attendanceStatus: { present: "Présent", absent: "Absent", late: "Retard", excused: "Excusé" },
  assessmentType: { quiz: "Quiz", exercise: "Exercice", assignment: "Devoir", exam: "Examen", final_project: "Projet final" },
  prospectStatus: {
    new: "Nouveau prospect",
    contacted: "Contacté",
    interested: "Intéressé",
    offer_sent: "Devis/offre envoyé",
    preregistered: "Préinscrit",
    enrolled: "Inscrit",
    client: "Client",
    lost: "Perdu",
  },
  courseStatus: { draft: "Brouillon", published: "Publiée", archived: "Archivée" },
  visibility: { students: "Visible par les étudiants", instructors: "Formateurs uniquement", admin: "Privé administrateur" },
  orgStatus: { onboarding: "En configuration", active: "Actif", suspended: "Suspendu", archived: "Archivé" },
} as const;
