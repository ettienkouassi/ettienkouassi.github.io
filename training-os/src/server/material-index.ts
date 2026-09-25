import "server-only";
import { eq } from "drizzle-orm";
import { materialChunks, materials } from "@/db/schema";
import type { Tx } from "@/db/tenant";

/** Extrait le texte d'un support (PDF, DOCX, TXT) pour la recherche documentaire. */
export async function extractText(buffer: Buffer, mime: string): Promise<string> {
  try {
    if (mime === "application/pdf") {
      const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
      const doc = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await pdfText(doc, { mergePages: true });
      return Array.isArray(text) ? text.join("\n") : text;
    }
    if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const mammoth = await import("mammoth");
      const r = await mammoth.extractRawText({ buffer });
      return r.value;
    }
    if (mime === "text/plain") return buffer.toString("utf8");
  } catch (e) {
    console.warn("[materials] extraction impossible", (e as Error).message);
  }
  return "";
}

export function chunkText(text: string, size = 1200, overlap = 150): string[] {
  const clean = text.replace(/\u0000/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(clean.length, i + size);
    if (end < clean.length) {
      const cut = clean.lastIndexOf("\n", end);
      const sp = clean.lastIndexOf(" ", end);
      const best = cut > i + size / 2 ? cut : sp > i + size / 2 ? sp : end;
      end = best;
    }
    chunks.push(clean.slice(i, end).trim());
    if (end >= clean.length) break;
    i = Math.max(end - overlap, i + 1);
  }
  return chunks.filter(Boolean).slice(0, 2000);
}

export async function indexMaterial(tx: Tx, material: { id: string; organizationId: string; courseId: string }, text: string) {
  await tx.delete(materialChunks).where(eq(materialChunks.materialId, material.id));
  const chunks = chunkText(text);
  for (let i = 0; i < chunks.length; i += 200) {
    await tx.insert(materialChunks).values(
      chunks.slice(i, i + 200).map((content, j) => ({ organizationId: material.organizationId, materialId: material.id, courseId: material.courseId, chunkIndex: i + j, content })),
    );
  }
  await tx.update(materials).set({ indexedChunks: chunks.length }).where(eq(materials.id, material.id));
  return chunks.length;
}
