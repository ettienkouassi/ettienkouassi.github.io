import "server-only";
import { sql } from "drizzle-orm";
import { organizations, users } from "@/db/schema";
import { withSystem, type Tx } from "@/db/tenant";
import { UserError } from "@/lib/errors";
import { renderTemplate, sendMail } from "@/lib/mail";
import { eq } from "drizzle-orm";
import { appUrl, createAuthToken } from "./auth-tokens";
import { DEFAULT_TEMPLATES } from "./communications";

/**
 * Crée un compte utilisateur SANS mot de passe et envoie une invitation
 * (lien à usage unique, 72 h) : aucun mot de passe ne transite par email.
 * L'unicité de l'email est globale : on vérifie via le contexte système.
 */
export async function createInvitedUser(
  tx: Tx,
  orgId: string,
  u: { email: string; firstName: string; lastName: string; role: "org_admin" | "manager" | "instructor" | "student"; phone?: string | null },
) {
  const email = u.email.trim().toLowerCase();
  const exists = await withSystem(async (stx) => (await stx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`).limit(1))[0]);
  if (exists) throw new UserError("Un compte existe déjà avec cet email.");
  const [user] = await tx.insert(users).values({ organizationId: orgId, email, firstName: u.firstName, lastName: u.lastName, role: u.role, phone: u.phone ?? null }).returning();
  const token = await createAuthToken(tx, user.id, "invitation", 72);
  const [org] = await tx.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
  const tpl = DEFAULT_TEMPLATES.account_created;
  const link = appUrl(`/reset-password/${token}`);
  const mail = {
    to: email,
    subject: renderTemplate(tpl.subject, { centre: org?.name }, true),
    text: renderTemplate(tpl.body, { prenom: u.firstName, email, lien: link, centre: org?.name }),
  };
  return { user, link, send: () => sendMail(mail) };
}
