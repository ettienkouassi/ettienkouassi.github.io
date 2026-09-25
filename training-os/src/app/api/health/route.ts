import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { rawDb } from "@/db/client";

export const dynamic = "force-dynamic";

/** Sonde de disponibilité (monitoring / load balancer). N'expose aucune information sensible. */
export async function GET() {
  const started = Date.now();
  try {
    await rawDb().execute(sql`select 1`);
    return NextResponse.json({ status: "ok", db: "ok", latencyMs: Date.now() - started, version: process.env.APP_VERSION ?? "1.0.0" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "degraded", db: "down" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
