import Link from "next/link";
import { notFound } from "next/navigation";
import { publicCenter } from "@/server/public-center";

export default async function CenterLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await publicCenter(slug);
  if (!c) notFound();
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href={`/c/${slug}`} className="flex items-center gap-3">
            {c.org.hasLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/public/logo/${slug}`} alt="" className="h-10 w-auto" />
            ) : (
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 font-bold text-white">{c.org.name[0]}</span>
            )}
            <span className="text-lg font-semibold">{c.org.name}</span>
          </Link>
          <Link href="/login" className="btn-secondary btn-sm">
            Espace étudiant
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        {c.org.name} · {[c.org.address, c.org.city, c.org.country].filter(Boolean).join(", ")} · {c.org.phone} · {c.org.email}
        <div className="mt-1">
          Propulsé par <Link href="/" className="link">TRAINING OS AI</Link>
        </div>
      </footer>
    </div>
  );
}
