import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { organizations } from "@/db/schema";
import { withSystem } from "@/db/tenant";
import { fileResponse } from "@/lib/api";
import { getObject } from "@/lib/storage";

/** Logo public — uniquement pour les centres dont la page publique est activée. */
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const [o] = await withSystem((tx) => tx.select({ key: organizations.logoKey }).from(organizations).where(and(eq(organizations.slug, slug), eq(organizations.publicPageEnabled, true))).limit(1));
  if (!o?.key) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const res = fileResponse(await getObject(o.key), { mime: o.key.endsWith(".png") ? "image/png" : "image/jpeg", filename: "logo", inline: true });
  res.headers.set("Cache-Control", "public, max-age=3600");
  return res;
}
