import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-5xl">🔍</p>
      <h1 className="text-xl font-semibold">Page introuvable</h1>
      <p className="text-sm text-slate-500">La page demandée n&apos;existe pas ou vous n&apos;y avez pas accès.</p>
      <Link href="/" className="btn-primary">
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}
