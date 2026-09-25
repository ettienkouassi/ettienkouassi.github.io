/**
 * Accès aux données avec isolation par centre.
 *
 * withTenant : ouvre une transaction et positionne `app.org_id` (+ `app.user_id`).
 *   Les politiques RLS PostgreSQL rendent alors invisibles toutes les lignes
 *   des autres centres — même en cas de bug applicatif d'oubli de filtre.
 *
 * withSystem : contournement explicite du RLS, réservé aux chemins de code de
 *   confiance (authentification, super administrateur, tâches planifiées).
 */
import { sql } from "drizzle-orm";
import { rawDb, type DB } from "./client";

export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export async function withTenant<T>(orgId: string, userId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!orgId) throw new Error("withTenant: organisation manquante");
  return rawDb().transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.org_id', ${orgId}, true), set_config('app.user_id', ${userId ?? ""}, true), set_config('app.bypass_rls', '', true)`,
    );
    return fn(tx);
  });
}

export async function withSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return rawDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.bypass_rls', 'on', true), set_config('app.org_id', '', true)`);
    return fn(tx);
  });
}
