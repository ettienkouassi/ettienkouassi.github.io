"use server";

import { revalidatePath } from "next/cache";
import { aiUsage } from "@/db/schema";
import { toActionError, UserError } from "@/lib/actions";
import { estimateCostMicroUsd, getAIProvider } from "@/lib/ai";
import { audit } from "@/lib/audit";
import { requireOrg, STAFF } from "@/lib/auth/context";
import { validateUpload } from "@/lib/security/upload";
import { parseCsv, parseXlsx, type Table } from "@/lib/tabular";
import { commitImport, existingCourseNames, IMPORT_FIELDS, suggestMapping, validateRows, type ImportField, type Mapping } from "@/server/import";

export type ImportState = {
  error?: string;
  headers?: string[];
  sample?: string[][];
  total?: number;
  mapping?: Mapping;
  preview?: { line: number; values: Record<string, string>; errors: string[]; warnings: string[] }[];
  errorCount?: number;
  done?: { created: number; skipped: number; enrollments: number; payments: number; messages: string[] };
  courses?: string[];
  aiUsed?: boolean;
};

async function readTable(fd: FormData): Promise<Table> {
  const file = fd.get("file");
  if (!(file instanceof File)) throw new UserError("Choisissez un fichier Excel (.xlsx) ou CSV.");
  const { buffer, ext } = await validateUpload(file, "import");
  const table = ext === "csv" ? parseCsv(buffer.toString("utf8")) : await parseXlsx(buffer);
  if (!table.headers.length || !table.rows.length) throw new UserError("Le fichier est vide ou sans ligne d'en-tête.");
  if (table.rows.length > 5000) throw new UserError("5 000 lignes maximum par import.");
  return table;
}

function parseMapping(raw: FormDataEntryValue | null, headers: string[]): Mapping {
  const m: Mapping = {};
  if (typeof raw !== "string") return m;
  const obj = JSON.parse(raw) as Record<string, number>;
  for (const [k, v] of Object.entries(obj)) if (k in IMPORT_FIELDS && Number.isInteger(v) && v >= 0 && v < headers.length) m[k as ImportField] = v;
  return m;
}

/** Étapes 1 à 5 : charger, analyser, proposer la correspondance, détecter les erreurs, aperçu. */
export async function analyzeImportAction(_: ImportState, fd: FormData): Promise<ImportState> {
  try {
    const ctx = await requireOrg(STAFF, "import.run");
    const table = await readTable(fd);
    let mapping = fd.get("mapping") ? parseMapping(fd.get("mapping"), table.headers) : suggestMapping(table.headers);
    let aiUsed = false;
    if (fd.get("useAi") === "1") {
      const provider = getAIProvider();
      if (provider.name !== "mock") {
        // Seuls les EN-TÊTES et 3 lignes d'exemple (anonymisées) sont transmis à l'IA
        const sample = table.rows.slice(0, 3).map((r) => r.map((c) => (/@|\d{6,}/.test(c) ? "[masqué]" : c.slice(0, 30))));
        const props = Object.fromEntries(Object.keys(IMPORT_FIELDS).map((k) => [k, { type: "integer", description: `index de colonne pour ${IMPORT_FIELDS[k as ImportField].label}, -1 si absent` }]));
        const r = await provider.json<Record<string, number>>({
          system: "Tu fais correspondre les colonnes d'un fichier d'import de centre de formation aux champs attendus. Réponds uniquement en JSON.",
          prompt: `Colonnes (index: nom) :\n${table.headers.map((h, i) => `${i}: ${h}`).join("\n")}\n\nExemples de lignes :\n${sample.map((r) => r.join(" | ")).join("\n")}\n\nChamps : ${Object.entries(IMPORT_FIELDS).map(([k, v]) => `${k} (${v.label})`).join(", ")}`,
          schema: { type: "object", properties: props, required: Object.keys(props), additionalProperties: false },
        });
        const m: Mapping = {};
        for (const [k, v] of Object.entries(r.data)) if (k in IMPORT_FIELDS && Number.isInteger(v) && v >= 0 && v < table.headers.length) m[k as ImportField] = v;
        mapping = { ...mapping, ...m };
        aiUsed = true;
        await ctx.db((tx) =>
          tx.insert(aiUsage).values({ organizationId: ctx.orgId, userId: ctx.user.id, assistant: "import", requestType: "column_mapping", model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costMicroUsd: estimateCostMicroUsd(r.model, r.inputTokens, r.outputTokens), status: "ok" }),
        );
      }
    }
    const rows = validateRows(table, mapping);
    return {
      headers: table.headers,
      sample: table.rows.slice(0, 5),
      total: table.rows.length,
      mapping,
      preview: rows.slice(0, 50).map((r) => ({ ...r, values: r.values as Record<string, string> })),
      errorCount: rows.filter((r) => r.errors.length).length,
      courses: await ctx.db((tx) => existingCourseNames(tx, ctx.orgId)),
      aiUsed,
    };
  } catch (e) {
    return { error: toActionError(e).error };
  }
}

/** Étapes 6 et 7 : confirmation puis import (les lignes en erreur sont ignorées). */
export async function commitImportAction(_: ImportState, fd: FormData): Promise<ImportState> {
  try {
    const ctx = await requireOrg(STAFF, "import.run");
    const table = await readTable(fd);
    const mapping = parseMapping(fd.get("mapping"), table.headers);
    if (mapping.lastName === undefined && mapping.fullName === undefined) throw new UserError("Associez au moins la colonne « Nom ».");
    const rows = validateRows(table, mapping);
    const done = await ctx.db(async (tx) => {
      const r = await commitImport(tx, ctx.orgId, ctx.user.id, rows);
      await audit(tx, ctx.user, ctx.orgId, {
        action: "import.students",
        entityType: "import",
        summary: `${ctx.user.firstName} ${ctx.user.lastName} a importé ${r.created} étudiant(s), ${r.enrollments} inscription(s), ${r.payments} paiement(s) depuis un fichier`,
        metadata: { total: rows.length, skipped: r.skipped, errors: rows.filter((x) => x.errors.length).length },
      });
      return r;
    });
    revalidatePath("/app/students");
    return { done };
  } catch (e) {
    return { error: toActionError(e).error };
  }
}
