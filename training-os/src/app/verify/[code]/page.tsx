import { sql } from "drizzle-orm";
import Link from "next/link";
import { rawDb } from "@/db/client";
import { formatDate } from "@/lib/format";
import { hashIp } from "@/lib/security/crypto";
import { rateLimit } from "@/lib/security/rate-limit";
import { requestMeta } from "@/lib/request";

export const metadata = { title: "Vérification de certificat", robots: { index: false } };

type Row = {
  code: string;
  status: "issued" | "revoked";
  student_name: string;
  course_name: string;
  organization_name: string;
  duration_hours: number | null;
  completion_date: string;
  issued_at: Date;
  revoked_at: Date | null;
};

/**
 * Page publique (§16, §41) : n'affiche QUE les informations nécessaires à
 * l'authentification. La base elle-même (fonction verify_certificate) limite
 * les colonnes renvoyées. Limitation de débit contre l'énumération.
 */
export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw).toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 40);
  const meta = await requestMeta();
  const rl = await rateLimit(`verify:${meta.ip ?? "unknown"}`, 30, 60);
  if (!rl.allowed) {
    return <div className="card p-6 text-sm">Trop de vérifications. Réessayez dans une minute.</div>;
  }
  const res = code ? await rawDb().execute<Row>(sql`select * from verify_certificate(${code}, ${hashIp(meta.ip)})`) : { rows: [] as Row[] };
  const c = res.rows[0];
  if (!c) {
    return (
      <div className="card border-red-200 p-6 text-center">
        <div className="text-4xl">❌</div>
        <h1 className="mt-2 text-xl font-semibold text-red-700">Certificat introuvable</h1>
        <p className="mt-1 text-sm text-slate-600">
          Aucun certificat ne correspond à la référence <span className="font-mono">{code || "—"}</span>. Vérifiez la saisie ou contactez le centre émetteur.
        </p>
        <Link href="/verify" className="btn-secondary mt-4">
          Nouvelle vérification
        </Link>
      </div>
    );
  }
  const revoked = c.status === "revoked";
  return (
    <div className={`card p-6 ${revoked ? "border-red-300" : "border-emerald-300"}`}>
      <div className="text-center">
        <div className="text-5xl">{revoked ? "⚠️" : "✅"}</div>
        <h1 className={`mt-2 text-2xl font-semibold ${revoked ? "text-red-700" : "text-emerald-700"}`}>{revoked ? "Certificat révoqué" : "Certificat authentique"}</h1>
        {revoked && <p className="mt-1 text-sm text-red-700">Ce certificat a été révoqué par le centre émetteur le {formatDate(c.revoked_at)}.</p>}
      </div>
      <dl className="mt-6 space-y-3 text-sm">
        {[
          ["Nom", c.student_name],
          ["Formation", c.course_name],
          ["Centre", c.organization_name],
          ["Durée", c.duration_hours ? `${c.duration_hours} heures` : null],
          ["Date", formatDate(c.completion_date, { day: "numeric", month: "long", year: "numeric" })],
          ["Référence", c.code],
        ]
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
      </dl>
      <p className="mt-6 text-center text-xs text-slate-400">Vérification effectuée le {formatDate(new Date(), { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })} via TRAINING OS AI.</p>
    </div>
  );
}
