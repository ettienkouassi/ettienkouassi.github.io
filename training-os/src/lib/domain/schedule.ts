/** Génère les dates de séances entre deux dates pour des jours de semaine donnés (0 = dimanche … 6 = samedi). */
export function generateMeetingDates(start: string, end: string, weekdays: number[], max = 200): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (d <= last && out.length < max) {
    if (weekdays.includes(d.getUTCDay())) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export const WEEKDAYS = [
  { v: 1, label: "Lun" },
  { v: 2, label: "Mar" },
  { v: 3, label: "Mer" },
  { v: 4, label: "Jeu" },
  { v: 5, label: "Ven" },
  { v: 6, label: "Sam" },
  { v: 0, label: "Dim" },
];
