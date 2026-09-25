/**
 * Applique les migrations avec le rôle PROPRIÉTAIRE (DATABASE_MIGRATION_URL).
 * L'application, elle, se connecte avec le rôle sans privilège (DATABASE_URL).
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const url = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_MIGRATION_URL manquant");
  const ssl = process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" } : undefined;
  const pool = new Pool({ connectionString: url, ssl, max: 1 });
  const db = drizzle(pool);
  console.log("→ Application des migrations…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("✓ Migrations appliquées");
  await pool.end();
}

main().catch((e) => {
  console.error("✗ Échec de la migration :", e);
  process.exit(1);
});
