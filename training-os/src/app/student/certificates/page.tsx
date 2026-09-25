import { eq } from "drizzle-orm";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { certificates } from "@/db/schema";
import { formatDate } from "@/lib/format";
import { verifyUrlFor } from "@/server/certificates";
import { studentScope } from "../scope";

export const metadata = { title: "Mes certificats" };

export default async function Page() {
  const { ctx, studentId, sums } = await studentScope();
  const list = await ctx.db((tx) => tx.select().from(certificates).where(eq(certificates.studentId, studentId)));
  const pending = sums.filter((s) => !s.certification.certificateCode && ["active", "registered", "completed"].includes(s.status));
  return (
    <>
      <PageHeader title="Mes certificats" />
      {list.length === 0 ? (
        <Empty title="Pas encore de certificat">Terminez une formation en remplissant les conditions de réussite pour obtenir votre certificat.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((c) => (
            <Card key={c.id} title={`🏅 ${c.courseName}`} actions={c.status === "issued" ? <Badge tone="green">Valide</Badge> : <Badge tone="red">Révoqué</Badge>}>
              <p className="text-sm text-slate-600">
                Délivré le {formatDate(c.completionDate)} · Réf. <span className="font-mono">{c.code}</span>
              </p>
              {c.status === "issued" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <a className="btn-primary btn-sm" href={`/api/files/certificate/${c.id}`} target="_blank" rel="noopener">
                    Télécharger (PDF)
                  </a>
                  <a className="btn-secondary btn-sm" href={verifyUrlFor(c.code)} target="_blank" rel="noopener">
                    Lien de vérification
                  </a>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      {pending.length > 0 && (
        <Card title="Conditions pour mes certificats en cours" className="mt-6">
          {pending.map((s) => (
            <div key={s.enrollmentId} className="mb-3">
              <div className="text-sm font-medium">{s.course.name}</div>
              <ul className="text-sm">
                {s.certification.checks.map((c) => (
                  <li key={c.key} className={c.ok ? "text-emerald-700" : "text-slate-600"}>
                    {c.ok ? "✓" : "○"} {c.label} ({c.detail})
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
