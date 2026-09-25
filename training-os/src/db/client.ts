import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __tosPool?: Pool; __tosDb?: DB };

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant");
  const ssl =
    process.env.DATABASE_SSL === "true"
      ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" }
      : undefined;
  return new Pool({
    connectionString: url,
    ssl,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // garde-fou : aucune requête ne peut bloquer indéfiniment
    statement_timeout: 30_000,
  });
}

/** Connexion brute — NE PAS utiliser directement pour les données métier : passer par withTenant / withSystem. */
export function rawDb(): DB {
  if (!globalForDb.__tosDb) {
    globalForDb.__tosPool = createPool();
    globalForDb.__tosDb = drizzle(globalForDb.__tosPool, { schema });
  }
  return globalForDb.__tosDb;
}

export async function closeDb() {
  await globalForDb.__tosPool?.end();
  globalForDb.__tosPool = undefined;
  globalForDb.__tosDb = undefined;
}
