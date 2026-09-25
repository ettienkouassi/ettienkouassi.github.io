import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/security/crypto";
import { runDailyJobs } from "@/server/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Tâches quotidiennes (relances, alertes, certificats automatiques, purge).
 * Appelée par le planificateur (Vercel Cron, cron système, GitHub Actions…)
 * avec l'en-tête  Authorization: Bearer <CRON_SECRET>.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const started = Date.now();
  const report = await runDailyJobs();
  console.info(JSON.stringify({ level: "info", event: "cron.daily", durationMs: Date.now() - started, report }));
  return NextResponse.json({ ok: true, durationMs: Date.now() - started, report });
}
export const POST = GET;
