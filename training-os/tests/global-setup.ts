import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/** Base de test remise à zéro puis migrée (rôle propriétaire) avant la suite. */
export default async function setup() {
  config({ path: ".env.test", override: true });
  const pool = new Pool({ connectionString: process.env.DATABASE_MIGRATION_URL, max: 1 });
  await pool.query("drop schema if exists drizzle cascade; drop schema if exists public cascade; create schema public;");
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
}
