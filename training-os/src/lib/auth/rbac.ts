/**
 * Rôles et permissions (§29).
 * Règle fondamentale : un utilisateur n'accède qu'aux données que son rôle
 * ET son centre lui permettent. Le centre est garanti par le RLS ; le rôle ici.
 */
export type Role = "super_admin" | "org_admin" | "manager" | "instructor" | "student";

export const PERMISSIONS = [
  "dashboard.view",
  "students.read",
  "students.write",
  "prospects.write",
  "courses.read",
  "courses.write",
  "sessions.write",
  "instructors.write",
  "enrollments.write",
  "payments.read",
  "payments.write",
  "payments.cancel",
  "attendance.write",
  "assessments.write",
  "progress.write",
  "materials.write",
  "certificates.issue",
  "communications.send",
  "reports.read",
  "ai.director",
  "import.run",
  "settings.write",
  "users.manage",
  "audit.read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = new Set<Permission>(PERMISSIONS);

const ROLE_PERMISSIONS: Record<Role, Set<Permission>> = {
  super_admin: new Set(), // le super admin agit via l'espace /admin, pas dans les données d'un centre
  org_admin: ALL,
  manager: new Set<Permission>([
    "dashboard.view",
    "students.read",
    "students.write",
    "prospects.write",
    "courses.read",
    "sessions.write",
    "enrollments.write",
    "payments.read",
    "payments.write",
    "attendance.write",
    "assessments.write",
    "progress.write",
    "materials.write",
    "communications.send",
    "reports.read",
    "ai.director",
    "import.run",
  ]),
  // Le formateur n'agit que sur les sessions qui lui sont attribuées (contrôle supplémentaire côté service)
  instructor: new Set<Permission>(["attendance.write", "assessments.write", "progress.write", "materials.write", "courses.read"]),
  student: new Set(),
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export const STAFF_ROLES: Role[] = ["org_admin", "manager"];

export function homePathFor(role: Role): string {
  switch (role) {
    case "super_admin":
      return "/admin";
    case "instructor":
      return "/instructor";
    case "student":
      return "/student";
    default:
      return "/app";
  }
}

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super administrateur",
  org_admin: "Administrateur du centre",
  manager: "Gestionnaire",
  instructor: "Formateur",
  student: "Étudiant",
};
