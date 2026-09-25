"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-5xl">⚠️</p>
      <h1 className="text-xl font-semibold">Une erreur est survenue</h1>
      <p className="max-w-md text-sm text-slate-500">L&apos;incident a été enregistré. Réessayez ; si le problème persiste, contactez le support en indiquant la référence ci-dessous.</p>
      {error.digest && <code className="rounded bg-slate-100 px-2 py-1 text-xs">Réf. {error.digest}</code>}
      <button onClick={reset} className="btn-primary">
        Réessayer
      </button>
    </div>
  );
}
