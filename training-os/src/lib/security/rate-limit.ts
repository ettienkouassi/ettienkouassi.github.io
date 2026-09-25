import { sql } from "drizzle-orm";
import { rawDb } from "@/db/client";

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSec: number };

/**
 * Limiteur à fenêtre fixe stocké dans PostgreSQL : fonctionne avec plusieurs
 * instances (serverless, conteneurs) sans service supplémentaire.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
  const res = await rawDb().execute<{ count: number; window_start: Date }>(sql`
    insert into rate_limits (key, window_start, count)
    values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSec}) then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSec}) then now() else rate_limits.window_start end
    returning count, window_start
  `);
  const row = res.rows[0];
  const count = Number(row.count);
  const elapsed = (Date.now() - new Date(row.window_start).getTime()) / 1000;
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSec: Math.max(1, Math.ceil(windowSec - elapsed)),
  };
}

export async function resetRateLimit(key: string) {
  await rawDb().execute(sql`delete from rate_limits where key = ${key}`);
}

/** Nettoyage périodique (appelé par la tâche planifiée). */
export async function purgeRateLimits() {
  await rawDb().execute(sql`delete from rate_limits where window_start < now() - interval '1 day'`);
}
