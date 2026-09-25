/**
 * Crée (ou réinitialise) un super administrateur en production.
 * Usage : npm run create-super-admin -- email@domaine.com "Prénom" "Nom"
 * Un mot de passe temporaire est affiché UNE fois ; il devra être changé à la 1re connexion.
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { closeDb } from "../src/db/client";
import { users } from "../src/db/schema";
import { withSystem } from "../src/db/tenant";
import { hashPassword, temporaryPassword } from "../src/lib/security/password";

async function main() {
  const [email, firstName = "Super", lastName = "Admin"] = process.argv.slice(2);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email requis : npm run create-super-admin -- email@domaine.com Prénom Nom");
  const pwd = temporaryPassword();
  const hash = await hashPassword(pwd);
  await withSystem(async (tx) => {
    const [u] = await tx.select().from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`).limit(1);
    if (u) {
      if (u.role !== "super_admin") throw new Error("Cet email appartient déjà à un utilisateur de centre.");
      await tx.update(users).set({ passwordHash: hash, mustChangePassword: true, isActive: true, failedLoginCount: 0, lockedUntil: null }).where(sql`id = ${u.id}`);
    } else {
      await tx.insert(users).values({ email: email.toLowerCase(), firstName, lastName, role: "super_admin", passwordHash: hash, mustChangePassword: true });
    }
  });
  console.log(`✓ Super administrateur ${email}\n  Mot de passe temporaire : ${pwd}\n  (à changer à la première connexion)`);
}

main()
  .then(() => closeDb())
  .catch(async (e) => {
    console.error("✗", e.message);
    await closeDb();
    process.exit(1);
  });
