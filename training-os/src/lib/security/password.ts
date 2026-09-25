import { hash, verify } from "@node-rs/argon2";
import { z } from "zod";

// Paramètres Argon2id (recommandations OWASP 2024+)
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export const passwordSchema = z
  .string()
  .min(10, "Le mot de passe doit contenir au moins 10 caractères")
  .max(128, "Le mot de passe est trop long")
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v), {
    message: "Le mot de passe doit contenir une minuscule, une majuscule et un chiffre",
  });

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(hashed: string | null | undefined, password: string): Promise<boolean> {
  if (!hashed) {
    // Travail factice pour éviter l'énumération d'utilisateurs par mesure du temps de réponse
    await hash(password, OPTIONS);
    return false;
  }
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}

/** Mot de passe temporaire lisible (comptes créés par un administrateur). */
export function temporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `${out.slice(0, 7)}-${out.slice(7)}9aA`;
}
