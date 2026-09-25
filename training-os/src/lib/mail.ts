import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!process.env.SMTP_HOST) return null;
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    requireTLS: Number(process.env.SMTP_PORT ?? 587) === 587,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  return transporter;
}

export type MailInput = { to: string; subject: string; text: string };

/** Envoie un email texte. Sans SMTP configuré (développement), le message est écrit dans les logs. */
export async function sendMail(input: MailInput): Promise<{ ok: boolean; error?: string }> {
  const t = getTransporter();
  if (!t) {
    console.info(`[mail:dev] À: ${input.to}\nObjet: ${input.subject}\n${input.text}\n---`);
    return { ok: true };
  }
  try {
    await t.sendMail({ from: process.env.MAIL_FROM, to: input.to, subject: input.subject, text: input.text });
    return { ok: true };
  } catch (e) {
    console.error("[mail] échec d'envoi", (e as Error).message);
    return { ok: false, error: (e as Error).message.slice(0, 300) };
  }
}

/** Remplace les variables {{nom}} d'un modèle. singleLine : retire les retours ligne (objets d'email). */
export function renderTemplate(template: string, vars: Record<string, string | number | null | undefined>, singleLine = false): string {
  const out = template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k: string) => {
    const v = vars[k];
    return v === null || v === undefined ? "" : String(v);
  });
  return singleLine ? out.replace(/[\r\n]+/g, " ").slice(0, 250) : out;
}
