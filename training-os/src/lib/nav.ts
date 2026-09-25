import type { NavItem } from "@/components/nav-links";
import { can, type Role } from "@/lib/auth/rbac";

// Menu administrateur (§36)
export function staffNav(role: Role): NavItem[] {
  const items: (NavItem & { perm?: Parameters<typeof can>[1] })[] = [
    { href: "/app", label: "Dashboard", icon: "📊", exact: true },
    { href: "/app/students", label: "Étudiants", icon: "🎓", perm: "students.read" },
    { href: "/app/prospects", label: "Prospects", icon: "🧲", perm: "prospects.write" },
    { href: "/app/courses", label: "Formations", icon: "📚", perm: "courses.read" },
    { href: "/app/sessions", label: "Sessions", icon: "🗓️", perm: "sessions.write" },
    { href: "/app/enrollments", label: "Inscriptions", icon: "📝", perm: "enrollments.write" },
    { href: "/app/payments", label: "Paiements", icon: "💰", perm: "payments.read" },
    { href: "/app/attendance", label: "Présences", icon: "✅", perm: "attendance.write" },
    { href: "/app/assessments", label: "Évaluations", icon: "🧪", perm: "assessments.write" },
    { href: "/app/materials", label: "Supports", icon: "📎", perm: "materials.write" },
    { href: "/app/certificates", label: "Certificats", icon: "🏅", perm: "students.read" },
    { href: "/app/communication", label: "Communication", icon: "✉️", perm: "communications.send" },
    { href: "/app/reports", label: "Rapports", icon: "📈", perm: "reports.read" },
    { href: "/app/assistant", label: "Assistant IA", icon: "🤖", perm: "ai.director" },
    { href: "/app/settings", label: "Paramètres", icon: "⚙️", perm: "settings.write" },
  ];
  return items.filter((i) => !i.perm || can(role, i.perm));
}

// Menu formateur (§38)
export const instructorNav: NavItem[] = [
  { href: "/instructor", label: "Accueil", icon: "🏠", exact: true },
  { href: "/instructor/sessions", label: "Mes sessions", icon: "🗓️" },
  { href: "/instructor/students", label: "Mes étudiants", icon: "🎓" },
  { href: "/instructor/attendance", label: "Présences", icon: "✅" },
  { href: "/instructor/assessments", label: "Évaluations", icon: "🧪" },
  { href: "/instructor/materials", label: "Supports", icon: "📎" },
  { href: "/instructor/progress", label: "Progression", icon: "📈" },
  { href: "/instructor/assistant", label: "Assistant IA", icon: "🤖" },
];

// Menu étudiant (§37)
export const studentNav: NavItem[] = [
  { href: "/student", label: "Accueil", icon: "🏠", exact: true },
  { href: "/student/profile", label: "Mon profil", icon: "👤" },
  { href: "/student/courses", label: "Mes formations", icon: "📚" },
  { href: "/student/calendar", label: "Mon calendrier", icon: "🗓️" },
  { href: "/student/materials", label: "Mes supports", icon: "📎" },
  { href: "/student/exercises", label: "Mes exercices", icon: "✏️" },
  { href: "/student/results", label: "Mes résultats", icon: "🧪" },
  { href: "/student/progress", label: "Ma progression", icon: "📈" },
  { href: "/student/payments", label: "Mes paiements", icon: "💳" },
  { href: "/student/certificates", label: "Mes certificats", icon: "🏅" },
  { href: "/student/assistant", label: "Assistant IA", icon: "🤖" },
  { href: "/student/notifications", label: "Notifications", icon: "🔔" },
];

export const superAdminNav: NavItem[] = [
  { href: "/admin", label: "Tableau de bord", icon: "🌍", exact: true },
  { href: "/admin/organizations", label: "Centres", icon: "🏫" },
  { href: "/admin/plans", label: "Plans & abonnements", icon: "💼" },
  { href: "/admin/ai-usage", label: "Consommation IA", icon: "🤖" },
  { href: "/admin/audit", label: "Journal d'audit", icon: "🛡️" },
];
