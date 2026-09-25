import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/context";
import { homePathFor } from "@/lib/auth/rbac";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect(homePathFor(user.role));
  const features = [
    ["🎓", "Étudiants & inscriptions", "Fiches complètes, inscriptions, import Excel de vos fichiers existants."],
    ["💰", "Paiements & échéanciers", "Soldes calculés automatiquement, relances J-3 / J / J+3, historique infalsifiable."],
    ["✅", "Présences & progression", "Feuille d'appel en un clic, taux de présence, progression par module."],
    ["🏅", "Certificats vérifiables", "PDF avec QR code et page de vérification publique."],
    ["🤖", "Assistant IA", "« Qui doit encore payer ? », « Que dois-je faire aujourd'hui ? » — réponses à partir de VOS données."],
    ["🛡️", "Sécurité", "Isolation stricte des centres, chiffrement HTTPS, journal d'audit, sauvegardes."],
  ];
  return (
    <div className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <span className="flex items-center gap-2 text-lg font-bold text-brand-900">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white">T</span>
          TRAINING OS <span className="text-brand-600">AI</span>
        </span>
        <div className="flex gap-2">
          <Link href="/verify" className="btn-ghost">
            Vérifier un certificat
          </Link>
          <Link href="/login" className="btn-primary">
            Se connecter
          </Link>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-4 py-16 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">Operating System for Training Centers</p>
        <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">Gérez tout votre centre de formation depuis une seule plateforme.</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
          Étudiants, formations, sessions, paiements, présences, évaluations, certificats et intelligence artificielle — fini les fichiers Excel, cahiers et messages éparpillés.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/login" className="btn-primary px-6 py-3 text-base">
            Accéder à mon espace
          </Link>
          <a href="mailto:contact@trainingos.ai" className="btn-secondary px-6 py-3 text-base">
            Demander une démo
          </a>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(([icon, title, text]) => (
          <div key={title} className="card p-6">
            <div className="text-3xl">{icon}</div>
            <h2 className="mt-3 font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">{text}</p>
          </div>
        ))}
      </section>
      <section className="bg-slate-50 py-12">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <h2 className="text-2xl font-semibold">Starter · Business · Enterprise</h2>
          <p className="mt-2 text-slate-600">À partir de 50 000 FCFA/mois. Installation, formation des administrateurs et support inclus selon la formule.</p>
        </div>
      </section>
      <footer className="py-6 text-center text-xs text-slate-500">© {new Date().getFullYear()} TRAINING OS AI · Centre pilote : CFCM-CI (Côte d&apos;Ivoire)</footer>
    </div>
  );
}
