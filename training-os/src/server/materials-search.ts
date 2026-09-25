import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { courseModules, courses, materialChunks, materials } from "@/db/schema";
import type { Tx } from "@/db/tenant";

/**
 * Recherche documentaire (RAG) dans les supports autorisés : plein texte
 * PostgreSQL en français, restreint aux formations et visibilités passées.
 */
export async function searchMaterials(
  tx: Tx,
  opts: { orgId: string; courseIds: string[]; visibilities: ("students" | "instructors" | "admin")[]; query: string; limit?: number },
) {
  if (opts.courseIds.length === 0 || !opts.query.trim()) return [];
  const q = opts.query.slice(0, 300);
  const tsq = sql`websearch_to_tsquery('french', ${q})`;
  // Repli : requête « OU » pour les questions formulées en langage naturel
  const orQuery = q
    .toLowerCase()
    .normalize("NFC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2)
    .slice(0, 12)
    .join(" | ");
  const tsqOr = orQuery ? sql`to_tsquery('french', ${orQuery})` : tsq;
  const rows = await tx
    .select({
      material: materials.title,
      course: courses.name,
      module: courseModules.title,
      excerpt: sql<string>`ts_headline('french', ${materialChunks.content}, ${tsqOr}, 'MaxWords=60, MinWords=25, MaxFragments=2, StartSel=«, StopSel=»')`,
      rank: sql<number>`ts_rank(${materialChunks.tsv}, ${tsqOr})`,
    })
    .from(materialChunks)
    .innerJoin(materials, eq(materials.id, materialChunks.materialId))
    .innerJoin(courses, eq(courses.id, materialChunks.courseId))
    .leftJoin(courseModules, eq(courseModules.id, materials.moduleId))
    .where(
      and(
        eq(materialChunks.organizationId, opts.orgId),
        inArray(materialChunks.courseId, opts.courseIds),
        inArray(materials.visibility, opts.visibilities),
        sql`${materialChunks.tsv} @@ ${tsqOr}`,
      ),
    )
    .orderBy(sql`ts_rank(${materialChunks.tsv}, ${tsqOr}) desc`)
    .limit(opts.limit ?? 6);
  return rows.map((r) => ({ support: r.material, formation: r.course, module: r.module, extrait: r.excerpt }));
}
