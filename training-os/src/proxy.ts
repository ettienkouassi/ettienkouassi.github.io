import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (ex-middleware) : en-têtes de sécurité, CSP avec nonce,
 * protection CSRF des routes API, redirection optimiste des pages protégées.
 * L'autorisation réelle est TOUJOURS vérifiée côté serveur (pages, actions, API).
 */
const PROTECTED = ["/app", "/admin", "/instructor", "/student", "/change-password"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isDev = process.env.NODE_ENV === "development";

  // CSRF : les requêtes API qui modifient des données doivent venir de notre origine
  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method) && !pathname.startsWith("/api/cron/")) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (!origin || !host || new URL(origin).host !== host) {
      return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
    }
  }

  const hasSession = request.cookies.has("__Host-tos_session") || request.cookies.has("tos_session");
  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/")) && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  if (PROTECTED.some((p) => pathname.startsWith(p))) {
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}

export const config = {
  matcher: [{ source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)" }],
};
