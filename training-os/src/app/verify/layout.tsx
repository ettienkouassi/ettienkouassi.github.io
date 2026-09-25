import Link from "next/link";

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-slate-50 px-4 py-10">
      <Link href="/" className="mb-8 flex items-center gap-2 font-bold text-brand-900">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm text-white">T</span>
        TRAINING OS <span className="text-brand-600">AI</span> · Vérification
      </Link>
      <div className="w-full max-w-lg">{children}</div>
    </div>
  );
}
