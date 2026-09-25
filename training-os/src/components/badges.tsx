import { LABELS } from "@/lib/format";
import { Badge, type Tone } from "./ui";

const map = <K extends string>(labels: Record<K, string>, tones: Record<K, Tone>) =>
  function StatusBadge({ value }: { value: K }) {
    return <Badge tone={tones[value] ?? "gray"}>{labels[value] ?? value}</Badge>;
  };

export const SessionStatusBadge = map(LABELS.sessionStatus, { draft: "gray", open: "blue", full: "purple", in_progress: "green", completed: "gray", cancelled: "red" });
export const EnrollmentStatusBadge = map(LABELS.enrollmentStatus, {
  prospect: "gray",
  preregistered: "amber",
  registered: "blue",
  active: "green",
  completed: "purple",
  dropped: "red",
  cancelled: "red",
});
export const PaymentStatusBadge = map(LABELS.paymentStatus, { paid: "green", partial: "blue", unpaid: "amber", overdue: "red", cancelled: "gray" });
export const AttendanceBadge = map(LABELS.attendanceStatus, { present: "green", absent: "red", late: "amber", excused: "gray" });
export const ProspectStatusBadge = map(LABELS.prospectStatus, {
  new: "gray",
  contacted: "blue",
  interested: "blue",
  offer_sent: "purple",
  preregistered: "amber",
  enrolled: "green",
  client: "green",
  lost: "red",
});
export const CourseStatusBadge = map(LABELS.courseStatus, { draft: "gray", published: "green", archived: "red" });
export const OrgStatusBadge = map(LABELS.orgStatus, { onboarding: "amber", active: "green", suspended: "red", archived: "gray" });

export function RiskBadge({ level }: { level: "none" | "low" | "medium" | "high" }) {
  if (level === "none") return <Badge tone="green">RAS</Badge>;
  const t = { low: ["amber", "À surveiller"], medium: ["amber", "Suivi conseillé"], high: ["red", "Suivi prioritaire"] } as const;
  return <Badge tone={t[level][0]}>⚠ {t[level][1]}</Badge>;
}
