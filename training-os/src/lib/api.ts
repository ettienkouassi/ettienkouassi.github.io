import "server-only";
import { NextResponse } from "next/server";
import { AuthError, UserError } from "@/lib/errors";

export function apiError(e: unknown) {
  if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: 400 });
  console.error("[api]", e);
  return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
}

/** Réponse fichier durcie : pas de reniflage de type, pas d'exécution de script, pas de cache partagé. */
export function fileResponse(body: Buffer, opts: { mime: string; filename?: string; inline?: boolean }) {
  const safeName = (opts.filename ?? "fichier").replace(/[^\w.\- ]+/g, "_").slice(0, 120);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": opts.mime,
      "Content-Length": String(body.length),
      "Content-Disposition": `${opts.inline ? "inline" : "attachment"}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(opts.filename ?? "fichier")}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      "Cache-Control": "private, max-age=300",
    },
  });
}
