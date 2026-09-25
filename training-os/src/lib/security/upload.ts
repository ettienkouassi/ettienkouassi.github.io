import "server-only";
import { fileTypeFromBuffer } from "file-type";

export type UploadKind = "image" | "material" | "import";

const RULES: Record<UploadKind, { maxBytes: number; mimes: Record<string, string> }> = {
  image: {
    maxBytes: 2 * 1024 * 1024,
    mimes: { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" },
  },
  material: {
    maxBytes: 50 * 1024 * 1024,
    mimes: {
      "application/pdf": "pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
      "application/msword": "doc",
      "application/vnd.ms-excel": "xls",
      "application/vnd.ms-powerpoint": "ppt",
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "video/mp4": "mp4",
      "video/webm": "webm",
      "text/plain": "txt",
    },
  },
  import: {
    maxBytes: 5 * 1024 * 1024,
    mimes: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx", "text/csv": "csv" },
  },
};

// Les formats Office/ZIP et texte ne sont pas toujours identifiables par signature
const ZIP_BASED = new Set(["docx", "pptx", "xlsx"]);
const CFB_BASED = new Set(["doc", "xls", "ppt"]);

/**
 * Valide un fichier téléversé : taille, type réel (signature binaire, pas seulement
 * l'extension ou le Content-Type déclaré par le navigateur).
 */
export async function validateUpload(file: File, kind: UploadKind): Promise<{ buffer: Buffer; mime: string; ext: string }> {
  const rule = RULES[kind];
  if (!file || file.size === 0) throw new Error("Aucun fichier reçu.");
  if (file.size > rule.maxBytes) throw new Error(`Fichier trop volumineux (maximum ${Math.round(rule.maxBytes / 1024 / 1024)} Mo).`);
  const buffer = Buffer.from(await file.arrayBuffer());
  const declaredExt = (file.name.split(".").pop() ?? "").toLowerCase();
  const detected = await fileTypeFromBuffer(buffer);

  if (detected && rule.mimes[detected.mime]) return { buffer, mime: detected.mime, ext: rule.mimes[detected.mime] };

  // Office Open XML détecté comme zip générique
  if (detected?.mime === "application/zip" && ZIP_BASED.has(declaredExt)) {
    const mime = Object.entries(rule.mimes).find(([, e]) => e === declaredExt)?.[0];
    if (mime) return { buffer, mime, ext: declaredExt };
  }
  if (detected?.mime === "application/x-cfb" && CFB_BASED.has(declaredExt)) {
    const mime = Object.entries(rule.mimes).find(([, e]) => e === declaredExt)?.[0];
    if (mime) return { buffer, mime, ext: declaredExt };
  }
  // Texte / CSV : pas de signature ; on refuse tout contenu binaire
  if (!detected && (declaredExt === "csv" || declaredExt === "txt")) {
    const mime = declaredExt === "csv" ? "text/csv" : "text/plain";
    if (rule.mimes[mime] && !buffer.subarray(0, 4096).includes(0)) return { buffer, mime, ext: declaredExt };
  }
  throw new Error("Type de fichier non autorisé.");
}
