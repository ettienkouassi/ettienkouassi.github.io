/** Réinitialise la base de DÉVELOPPEMENT : suppression du schéma, migrations, données de test. */
import "dotenv/config";
import { execSync } from "node:child_process";
import { Pool } from "pg";

async function main() {
  if (process.env.APP_ENV === "production" || process.env.APP_ENV === "staging") throw new Error("Interdit hors développement.");
  const pool = new Pool({ connectionString: process.env.DATABASE_MIGRATION_URL, max: 1 });
  await pool.query("drop schema if exists drizzle cascade; drop schema public cascade; create schema public;");
  await pool.end();
  execSync("npm run db:migrate && npm run db:seed", { stdio: "inherit" });
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
