import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { instructors, students } from "@/db/schema";
import { withTenant, type Tx } from "@/db/tenant";
import { AuthError } from "@/lib/errors";
import { can, homePathFor, type Permission, type Role } from "./rbac";
import { readSessionToken, validateSessionToken, type SessionUser } from "./session";

export { AuthError };

/** Utilisateur courant (mis en cache pour la durée de la requête). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = await readSessionToken();
  if (!token) return null;
  return validateSessionToken(token);
});

export type OrgContext = {
  user: SessionUser;
  orgId: string;
  role: Role;
  instructorId: string | null;
  studentId: string | null;
  /** Exécute fn dans une transaction isolée sur le centre de l'utilisateur. */
  db: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
};

async function buildOrgContext(user: SessionUser): Promise<OrgContext> {
  const orgId = user.organizationId!;
  const run = <T,>(fn: (tx: Tx) => Promise<T>) => withTenant(orgId, user.id, fn);
  let instructorId: string | null = null;
  let studentId: string | null = null;
  if (user.role === "instructor") {
    const r = await run((tx) => tx.select({ id: instructors.id }).from(instructors).where(eq(instructors.userId, user.id)).limit(1));
    instructorId = r[0]?.id ?? null;
  } else if (user.role === "student") {
    const r = await run((tx) => tx.select({ id: students.id }).from(students).where(eq(students.userId, user.id)).limit(1));
    studentId = r[0]?.id ?? null;
  }
  return { user, orgId, role: user.role, instructorId, studentId, db: run };
}

/** Pour les pages : redirige vers /login si non connecté, ou vers l'espace adapté si rôle non autorisé. */
export async function requirePageUser(allowed: Role[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  if (!allowed.includes(user.role)) redirect(homePathFor(user.role));
  if (user.role !== "super_admin" && (user.organizationStatus === "suspended" || user.organizationStatus === "archived")) redirect("/suspended");
  return user;
}

export async function requirePageOrg(allowed: Role[], permission?: Permission): Promise<OrgContext> {
  const user = await requirePageUser(allowed);
  if (!user.organizationId) redirect("/login");
  if (permission && !can(user.role, permission)) redirect(homePathFor(user.role));
  return buildOrgContext(user);
}

/** Pour les Server Actions / routes API : lève une AuthError au lieu de rediriger. */
export async function requireOrg(allowed: Role[], permission?: Permission): Promise<OrgContext> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Session expirée, veuillez vous reconnecter.", 401);
  if (!user.organizationId || !allowed.includes(user.role)) throw new AuthError("Accès refusé.");
  if (user.organizationStatus === "suspended" || user.organizationStatus === "archived") throw new AuthError("Ce centre est suspendu.");
  if (permission && !can(user.role, permission)) throw new AuthError("Vous n'avez pas la permission d'effectuer cette action.");
  return buildOrgContext(user);
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Session expirée.", 401);
  if (user.role !== "super_admin") throw new AuthError("Accès refusé.");
  return user;
}

export const STAFF: Role[] = ["org_admin", "manager"];
export const STAFF_AND_INSTRUCTOR: Role[] = ["org_admin", "manager", "instructor"];
