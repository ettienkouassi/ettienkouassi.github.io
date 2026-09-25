import { and, eq, inArray } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { certificates, courseSessions, enrollments, materials, organizations, students } from "@/db/schema";
import { apiError, fileResponse } from "@/lib/api";
import { requireOrg } from "@/lib/auth/context";
import { AuthError } from "@/lib/errors";
import { isUuid } from "@/lib/search-params";
import { getObject } from "@/lib/storage";
import { instructorSessionIds } from "@/server/summaries";

/**
 * Téléchargement authentifié des fichiers. Chaque type vérifie les droits
 * (rôle + centre via RLS + propriété) AVANT de lire le fichier.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  try {
    const { kind, id } = await params;
    if (kind !== "logo" && !isUuid(id)) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    const ctx = await requireOrg(["org_admin", "manager", "instructor", "student"]);
    const staff = ctx.role === "org_admin" || ctx.role === "manager";

    const found = await ctx.db(async (tx) => {
      if (kind === "logo") {
        const [o] = await tx.select({ key: organizations.logoKey }).from(organizations).where(eq(organizations.id, ctx.orgId)).limit(1);
        return o?.key ? { key: o.key, mime: o.key.endsWith(".png") ? "image/png" : o.key.endsWith(".webp") ? "image/webp" : "image/jpeg", name: "logo", inline: true } : null;
      }
      if (kind === "student-photo") {
        const [s] = await tx.select().from(students).where(eq(students.id, id)).limit(1);
        if (!s?.photoKey) return null;
        if (!staff && !(ctx.role === "student" && ctx.studentId === s.id) && ctx.role !== "instructor") throw new AuthError("Accès refusé.");
        if (ctx.role === "instructor") {
          const sessions = await instructorSessionIds(tx, ctx.instructorId);
          const ok = sessions.length && (await tx.select({ id: enrollments.id }).from(enrollments).where(and(eq(enrollments.studentId, s.id), inArray(enrollments.sessionId, sessions))).limit(1)).length;
          if (!ok) throw new AuthError("Accès refusé.");
        }
        const ext = s.photoKey.split(".").pop();
        return { key: s.photoKey, mime: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg", name: "photo", inline: true };
      }
      if (kind === "material") {
        const [m] = await tx.select().from(materials).where(eq(materials.id, id)).limit(1);
        if (!m?.storageKey) return null;
        if (!staff) {
          if (m.visibility === "admin") throw new AuthError("Accès refusé.");
          if (ctx.role === "student") {
            if (m.visibility !== "students" || !ctx.studentId) throw new AuthError("Accès refusé.");
            const conds = [eq(enrollments.studentId, ctx.studentId), eq(enrollments.courseId, m.courseId), inArray(enrollments.status, ["registered", "active", "completed"])];
            if (m.sessionId) conds.push(eq(enrollments.sessionId, m.sessionId));
            const ok = await tx.select({ id: enrollments.id }).from(enrollments).where(and(...conds)).limit(1);
            if (!ok.length) throw new AuthError("Accès refusé.");
          }
          if (ctx.role === "instructor") {
            const sessions = await instructorSessionIds(tx, ctx.instructorId);
            const ok = sessions.length && (await tx.select({ id: courseSessions.id }).from(courseSessions).where(and(inArray(courseSessions.id, sessions), eq(courseSessions.courseId, m.courseId))).limit(1)).length;
            if (!ok) throw new AuthError("Accès refusé.");
          }
          if (ctx.role === "student") await tx.update(students).set({ lastActivityAt: new Date() }).where(eq(students.id, ctx.studentId!));
        }
        const inline = ["application/pdf", "image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm", "text/plain"].includes(m.mimeType ?? "");
        return { key: m.storageKey, mime: m.mimeType ?? "application/octet-stream", name: m.fileName ?? "support", inline };
      }
      if (kind === "certificate") {
        const [c] = await tx.select().from(certificates).where(eq(certificates.id, id)).limit(1);
        if (!c?.storageKey) return null;
        if (!staff && !(ctx.role === "student" && ctx.studentId === c.studentId)) throw new AuthError("Accès refusé.");
        if (c.status === "revoked" && !staff) throw new AuthError("Ce certificat a été révoqué.");
        return { key: c.storageKey, mime: "application/pdf", name: `${c.code}.pdf`, inline: true };
      }
      return null;
    });
    if (!found) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    const body = await getObject(found.key);
    return fileResponse(body, { mime: found.mime, filename: found.name, inline: found.inline });
  } catch (e) {
    return apiError(e);
  }
}
