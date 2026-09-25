/**
 * Monitoring (§63) : journalisation structurée (JSON) des erreurs serveur,
 * exploitable par l'hébergeur (Vercel, Render, Fly, Docker + Loki/Grafana…)
 * ou un outil APM. Pour Sentry/Datadog, brancher leur SDK ici.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Validation de la configuration au démarrage : un secret manquant ou une
    // configuration de production non sécurisée (HTTP, TLS base désactivé…) bloque le lancement.
    if (process.env.NEXT_PHASE !== "phase-production-build") {
      const { env } = await import("./lib/env");
      env();
    }
    console.info(JSON.stringify({ level: "info", event: "server.start", env: process.env.APP_ENV, version: process.env.APP_VERSION ?? "1.0.0" }));
  }
}

export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routerKind: string; routePath: string; routeType: string }) {
  const e = err as Error & { digest?: string };
  console.error(
    JSON.stringify({
      level: "error",
      event: "request.error",
      message: e?.message?.slice(0, 500),
      digest: e?.digest,
      method: request.method,
      // on ne journalise pas les paramètres (données personnelles possibles)
      route: context.routePath,
      routeType: context.routeType,
      at: new Date().toISOString(),
    }),
  );
}
