/**
 * Stockage des fichiers (photos, supports, certificats).
 *  - local : disque (développement / serveur unique avec volume persistant)
 *  - s3    : tout stockage compatible S3 (AWS S3, Cloudflare R2, Scaleway, Backblaze B2…)
 * Les fichiers ne sont JAMAIS servis publiquement : ils passent par une route
 * authentifiée qui vérifie les droits avant de les transmettre.
 */
import "server-only";
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomToken } from "@/lib/security/crypto";

const driver = () => process.env.STORAGE_DRIVER ?? "local";
let s3: S3Client | null = null;
const client = () =>
  (s3 ??= new S3Client({
    region: process.env.S3_REGION ?? "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" },
    forcePathStyle: !!process.env.S3_ENDPOINT,
  }));

function localPath(key: string) {
  const root = path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_LOCAL_DIR ?? "./storage");
  const full = path.resolve(/*turbopackIgnore: true*/ root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("Chemin de stockage invalide");
  return full;
}

/** Clé de stockage : préfixée par le centre, nom aléatoire (jamais le nom fourni par l'utilisateur). */
export function makeKey(orgId: string, folder: string, ext: string) {
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase();
  return `org/${orgId}/${folder}/${new Date().getUTCFullYear()}/${randomToken(18)}${safeExt ? "." + safeExt : ""}`;
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  if (driver() === "s3") {
    await client().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: process.env.S3_SSE === "false" ? undefined : "AES256" }));
    return;
  }
  const p = localPath(key);
  await mkdir(/*turbopackIgnore: true*/ path.dirname(p), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ p, body, { mode: 0o600 });
}

export async function getObject(key: string): Promise<Buffer> {
  if (driver() === "s3") {
    const r = await client().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }
  return readFile(/*turbopackIgnore: true*/ localPath(key));
}

export async function deleteObject(key: string) {
  try {
    if (driver() === "s3") await client().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    else await unlink(/*turbopackIgnore: true*/ localPath(key));
  } catch (e) {
    console.warn("[storage] suppression impossible", key, (e as Error).message);
  }
}
