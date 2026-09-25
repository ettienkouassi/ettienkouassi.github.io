import "server-only";
import { z } from "zod";
import { AuthError, UserError } from "@/lib/errors";

export { UserError };

export type ActionState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  data?: Record<string, unknown>;
};


/** Convertit un FormData en objet (les champs vides deviennent undefined). */
export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (typeof v !== "string") {
      out[k] = v;
      continue;
    }
    const val = v.trim();
    if (k.endsWith("[]")) {
      const key = k.slice(0, -2);
      (out[key] as string[] | undefined) ??= [];
      if (val !== "") (out[key] as string[]).push(val);
    } else {
      out[k] = val === "" ? undefined : val;
    }
  }
  return out;
}

export function parseForm<S extends z.ZodType>(schema: S, fd: FormData): { data?: z.infer<S>; state?: ActionState } {
  const parsed = schema.safeParse(formToObject(fd));
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { state: { error: "Veuillez corriger les champs indiqués.", fieldErrors } };
  }
  return { data: parsed.data };
}

/** Traduit une exception en message affichable sans divulguer de détail technique. */
export function toActionError(e: unknown): ActionState {
  if (e instanceof AuthError || e instanceof UserError) return { error: e.message };
  const pgCode = (e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
  if (pgCode === "23505") return { error: "Cet enregistrement existe déjà (doublon)." };
  if (pgCode === "23503") return { error: "Cet élément est lié à d'autres données et ne peut pas être modifié ainsi." };
  if (pgCode === "23514") return { error: "Les valeurs saisies ne respectent pas les règles de gestion." };
  if (pgCode === "P0001") return { error: (e as { message?: string; cause?: { message?: string } }).cause?.message ?? (e as Error).message };
  // Les redirections Next.js doivent être relancées
  if ((e as { digest?: string })?.digest?.startsWith?.("NEXT_REDIRECT")) throw e;
  console.error("[action] erreur inattendue", e);
  return { error: "Une erreur inattendue est survenue. Réessayez ou contactez le support." };
}

// ---- Schémas réutilisables
export const zId = z.string().uuid("Identifiant invalide");
export const zOptText = (max = 500) => z.string().max(max, `${max} caractères maximum`).optional();
export const zText = (max = 200, label = "Ce champ") =>
  z.string({ error: `${label} est obligatoire` }).min(1, `${label} est obligatoire`).max(max, `${max} caractères maximum`);
export const zEmail = z.string().trim().toLowerCase().email("Adresse email invalide").max(200);
export const zOptEmail = zEmail.optional();
export const zPhone = z
  .string()
  .max(30)
  .regex(/^[+0-9 ().-]{6,30}$/, "Numéro de téléphone invalide")
  .optional();
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (AAAA-MM-JJ)");
export const zOptDate = zDate.optional();
export const zTime = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Heure invalide").optional();
export const zMoney = z.coerce
  .number({ error: "Montant invalide" })
  .int("Le montant doit être un nombre entier")
  .min(0, "Le montant ne peut pas être négatif")
  .max(1_000_000_000_000, "Montant trop élevé");
export const zPositiveMoney = zMoney.refine((v) => v > 0, "Le montant doit être supérieur à 0");
export const zInt = (min = 0, max = 1_000_000) => z.coerce.number().int().min(min).max(max);
export const zBool = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")])
  .optional()
  .transform((v) => v === "on" || v === "true" || v === "1");
export const zUrl = z.string().url("URL invalide").max(500).refine((u) => /^https?:\/\//i.test(u), "Seules les URL http(s) sont autorisées").optional();
