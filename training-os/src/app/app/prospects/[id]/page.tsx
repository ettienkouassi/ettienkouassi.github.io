import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProspectStatusBadge } from "@/components/badges";
import { ActionButton } from "@/components/form";
import { Card, PageHeader } from "@/components/ui";
import { prospects } from "@/db/schema";
import { requirePageOrg, STAFF } from "@/lib/auth/context";
import { formatDateTime } from "@/lib/format";
import { isUuid } from "@/lib/search-params";
import { courseOptions } from "@/server/lookups";
import { convertProspectAction } from "../actions";
import { ProspectForm } from "../prospect-form";

export default async function ProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await requirePageOrg(STAFF, "prospects.write");
  const { p, cs } = await ctx.db(async (tx) => ({
    p: (await tx.select().from(prospects).where(and(eq(prospects.id, id), eq(prospects.organizationId, ctx.orgId))).limit(1))[0],
    cs: await courseOptions(tx, ctx.orgId),
  }));
  if (!p) notFound();
  return (
    <>
      <PageHeader
        title={`${p.firstName} ${p.lastName}`}
        subtitle={
          <span className="flex items-center gap-2">
            <ProspectStatusBadge value={p.status} /> Dernier contact : {formatDateTime(p.lastContactAt)}
          </span>
        }
        actions={
          <>
            <Link href="/app/prospects" className="btn-ghost">
              ← Pipeline
            </Link>
            {p.convertedStudentId ? (
              <Link href={`/app/students/${p.convertedStudentId}`} className="btn-secondary">
                Voir la fiche étudiant
              </Link>
            ) : null}
            <ActionButton action={convertProspectAction} hidden={{ id: p.id }} className="btn-primary">
              {p.convertedStudentId ? "Inscrire à une session" : "Convertir en étudiant et inscrire"}
            </ActionButton>
          </>
        }
      />
      <Card className="max-w-2xl">
        <ProspectForm p={p} courses={cs} />
      </Card>
    </>
  );
}
