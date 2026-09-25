import "server-only";
import { auditLogs } from "@/db/schema";
import type { Tx } from "@/db/tenant";
import type { SessionUser } from "@/lib/auth/session";
import { requestMeta } from "@/lib/request";

export type AuditEntry = {
  action: string; // ex. student.create, payment.cancel
  entityType: string;
  entityId?: string | null;
  summary: string; // phrase lisible : « Admin X a créé l'étudiant Y »
  metadata?: Record<string, unknown>;
};

/**
 * Journalise une action sensible (§34) DANS la même transaction que l'action :
 * si l'action échoue, le journal n'est pas écrit ; si le journal échoue, l'action est annulée.
 */
export type Actor = Pick<SessionUser, "id" | "firstName" | "lastName" | "role">;

export async function audit(tx: Tx, actor: Actor | null, orgId: string | null, entry: AuditEntry) {
  let meta: { ip: string | null; userAgent: string | null } = { ip: null, userAgent: null };
  try {
    meta = await requestMeta();
  } catch {
    // hors requête HTTP (script, tâche planifiée)
  }
  await tx.insert(auditLogs).values({
    organizationId: orgId,
    actorUserId: actor?.id ?? null,
    actorLabel: actor ? `${actor.firstName} ${actor.lastName}` : "Système",
    actorRole: actor?.role ?? "system",
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    summary: entry.summary,
    metadata: entry.metadata ?? null,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}
