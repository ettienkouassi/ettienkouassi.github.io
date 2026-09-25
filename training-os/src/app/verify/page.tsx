import { redirect } from "next/navigation";

export const metadata = { title: "Vérifier un certificat" };

async function go(fd: FormData) {
  "use server";
  const code = String(fd.get("code") ?? "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 40);
  if (code) redirect(`/verify/${code}`);
}

export default function VerifyIndex() {
  return (
    <div className="card p-6">
      <h1 className="text-xl font-semibold">Vérifier un certificat</h1>
      <p className="mt-1 text-sm text-slate-500">Saisissez la référence imprimée sur le certificat (ex. CFCM-2026-000125) ou scannez son QR code.</p>
      <form action={go} className="mt-4 flex gap-2">
        <input name="code" required className="input" placeholder="CERT-2026-000001" />
        <button className="btn-primary">Vérifier</button>
      </form>
    </div>
  );
}
