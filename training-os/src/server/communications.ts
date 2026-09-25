import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { communications, messageTemplates, notifications } from "@/db/schema";
import { withTenant, type Tx } from "@/db/tenant";
import { renderTemplate, sendMail } from "@/lib/mail";

export const DEFAULT_TEMPLATES: Record<string, { name: string; subject: string; body: string }> = {
  registration_confirmation: {
    name: "Confirmation d'inscription",
    subject: "Confirmation de votre inscription — {{formation}}",
    body: "Bonjour {{prenom}},\n\nVotre inscription à la formation « {{formation}} » (session {{session}}) est confirmée.\nDébut : {{date_debut}}.\nMontant : {{montant}}.\n\nÀ bientôt,\n{{centre}}",
  },
  payment_confirmation: {
    name: "Confirmation de paiement",
    subject: "Paiement reçu — {{montant}}",
    body: "Bonjour {{prenom}},\n\nNous confirmons la réception de votre paiement de {{montant}} pour « {{formation}} ».\nDéjà payé : {{paye}} — Reste à payer : {{reste}}.\n\nMerci,\n{{centre}}",
  },
  payment_reminder_before: {
    name: "Rappel d'échéance (avant)",
    subject: "Rappel : échéance le {{date_echeance}}",
    body: "Bonjour {{prenom}},\n\nPour rappel, une échéance de {{montant}} pour « {{formation}} » arrive le {{date_echeance}}.\n\nMerci,\n{{centre}}",
  },
  payment_due_today: {
    name: "Échéance du jour",
    subject: "Votre paiement arrive à échéance aujourd'hui",
    body: "Bonjour {{prenom}},\n\nVotre paiement de {{montant}} pour « {{formation}} » arrive à échéance aujourd'hui.\n\nMerci,\n{{centre}}",
  },
  payment_overdue: {
    name: "Paiement en retard",
    subject: "Votre paiement est en retard",
    body: "Bonjour {{prenom}},\n\nSauf erreur de notre part, un montant de {{montant}} pour « {{formation}} » est en retard depuis le {{date_echeance}}.\nMerci de régulariser ou de contacter le centre.\n\n{{centre}}",
  },
  session_reminder: {
    name: "Rappel de séance",
    subject: "Rappel : séance du {{date}}",
    body: "Bonjour {{prenom}},\n\nRappel : séance de « {{formation}} » le {{date}} à {{heure}} ({{salle}}).\n\n{{centre}}",
  },
  absence: {
    name: "Absence",
    subject: "Nous avons remarqué votre absence",
    body: "Bonjour {{prenom}},\n\nVous avez été absent(e) lors des dernières séances de « {{formation}} ». N'hésitez pas à nous contacter si vous rencontrez une difficulté.\n\n{{centre}}",
  },
  result: {
    name: "Résultat disponible",
    subject: "Votre résultat est disponible — {{evaluation}}",
    body: "Bonjour {{prenom}},\n\nVotre résultat pour « {{evaluation}} » est disponible dans votre espace étudiant.\n\n{{centre}}",
  },
  certificate_available: {
    name: "Certificat disponible",
    subject: "Votre certificat est disponible 🎓",
    body: "Bonjour {{prenom}},\n\nFélicitations ! Votre certificat pour « {{formation}} » est disponible dans votre espace étudiant.\nRéférence : {{reference}}\nVérification : {{lien_verification}}\n\n{{centre}}",
  },
  custom: {
    name: "Message libre",
    subject: "{{objet}}",
    body: "Bonjour {{prenom}},\n\n{{message}}\n\n{{centre}}",
  },
  account_created: {
    name: "Création de compte",
    subject: "Votre accès à {{centre}}",
    body: "Bonjour {{prenom}},\n\nUn compte a été créé pour vous sur TRAINING OS AI ({{centre}}).\nIdentifiant : {{email}}\n\nPour activer votre compte et choisir votre mot de passe, ouvrez ce lien (valable 72 heures) :\n{{lien}}\n\nSi vous n'attendiez pas cet email, ignorez-le.",
  },
};

async function getTemplate(tx: Tx, orgId: string, key: string) {
  const [t] = await tx.select().from(messageTemplates).where(and(eq(messageTemplates.organizationId, orgId), eq(messageTemplates.key, key))).limit(1);
  if (t) return t.isActive ? t : null;
  return DEFAULT_TEMPLATES[key] ?? null;
}

/**
 * Met un email en file d'attente (dans la transaction appelante).
 * dedupeKey empêche d'envoyer deux fois la même relance.
 * Retourne l'identifiant, ou null si déjà envoyé / modèle désactivé / pas d'adresse.
 */
export async function queueEmail(
  tx: Tx,
  orgId: string,
  opts: { templateKey: string; to: string | null | undefined; vars: Record<string, string | number | null | undefined>; studentId?: string | null; createdBy?: string | null; dedupeKey?: string },
): Promise<string | null> {
  if (!opts.to) return null;
  const tpl = await getTemplate(tx, orgId, opts.templateKey);
  if (!tpl) return null;
  const rows = await tx
    .insert(communications)
    .values({
      organizationId: orgId,
      channel: "email",
      templateKey: opts.templateKey,
      studentId: opts.studentId ?? null,
      toAddress: opts.to,
      subject: renderTemplate(tpl.subject, opts.vars, true),
      body: renderTemplate(tpl.body, opts.vars).replace(/\{\{[^}]*\}\}/g, ""),
      status: "queued",
      dedupeKey: opts.dedupeKey ?? null,
      createdBy: opts.createdBy ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: communications.id });
  return rows[0]?.id ?? null;
}

/** Envoie les emails en attente (après validation de la transaction). */
export async function deliverQueued(orgId: string, ids?: (string | null)[]) {
  const list = ids?.filter((x): x is string => !!x);
  if (ids && !list?.length) return;
  const pending = await withTenant(orgId, null, (tx) =>
    tx
      .select()
      .from(communications)
      .where(and(eq(communications.organizationId, orgId), eq(communications.status, "queued"), list ? inArray(communications.id, list) : undefined))
      .limit(200),
  );
  for (const c of pending) {
    const r = await sendMail({ to: c.toAddress, subject: c.subject, text: c.body });
    await withTenant(orgId, null, (tx) =>
      tx
        .update(communications)
        .set(r.ok ? { status: "sent", sentAt: new Date(), error: null } : { status: "failed", error: r.error ?? "échec" })
        .where(eq(communications.id, c.id)),
    );
  }
}

export async function notify(
  tx: Tx,
  orgId: string,
  n: { userId?: string | null; level?: "info" | "success" | "warning" | "urgent"; title: string; body?: string; link?: string; dedupeKey?: string },
) {
  await tx
    .insert(notifications)
    .values({ organizationId: orgId, userId: n.userId ?? null, level: n.level ?? "info", title: n.title, body: n.body, link: n.link, dedupeKey: n.dedupeKey ?? null })
    .onConflictDoNothing();
}
