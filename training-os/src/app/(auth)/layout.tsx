import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-brand-50 via-white to-slate-100 px-4 py-10">
      <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-bold text-brand-900">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white">T</span>
        TRAINING OS <span className="text-brand-600">AI</span>
      </Link>
      <div className="card w-full max-w-md p-6 sm:p-8">{children}</div>
      <p className="mt-6 text-xs text-slate-500">Connexion sécurisée · Données chiffrées en transit (HTTPS)</p>
    </div>
  );
}
