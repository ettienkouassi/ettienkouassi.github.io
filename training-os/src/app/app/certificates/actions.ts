"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { certificates } from "@/db/schema";
import { parseForm, toActionError, UserError, zId, type ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requireOrg, STAFF } from "@/lib/auth/context";
import { issueCertificate } from "@/server/certificates";
import { deliverQueued } from "@/server/communications";

export async function revokeCertificateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF, "certificates.issue");
    const { data, state } = parseForm(z.object({ id: zId, reason: z.string().min(5, "Motif obligatoire").max(300) }), fd);
    if (!data) return state!;
    await ctx.db(async (tx) => {
      const [c] = await tx.select().from(certificates).where(eq(certificates.id, data.id)).limit(1);
      if (!c) throw new UserError("Certificat introuvable.");
      if (c.status === "revoked") throw new UserError("Déjà révoqué.");
      await tx.update(certificates).set({ status: "revoked", revokedAt: new Date(), revokeReason: data.reason }).where(eq(certificates.id, c.id));
      await audit(tx, ctx.user, ctx.orgId, { action: "certificate.revoke", entityType: "certificate", entityId: c.id, summary: `${ctx.user.firstName} ${ctx.user.lastName} a révoqué le certificat ${c.code} — ${data.reason}` });
    });
    revalidatePath("/app/certificates");
    return { ok: true, message: "Certificat révoqué : la page de vérification l'indique désormais." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function issueManyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF, "certificates.issue");
    const ids = fd.getAll("enrollmentId").map((v) => zId.parse(v)).slice(0, 200);
    if (!ids.length) return { error: "Sélectionnez au moins un étudiant." };
    const results: string[] = [];
    const mails: (string | null)[] = [];
    let ok = 0;
    for (const id of ids) {
      try {
        const r = await ctx.db((tx) => issueCertificate(tx, ctx.orgId, ctx.user, id));
        mails.push(r.mailId);
        ok++;
      } catch (e) {
        results.push((e as Error).message);
      }
    }
    await deliverQueued(ctx.orgId, mails);
    revalidatePath("/app/certificates");
    return { ok: true, message: `${ok} certificat(s) généré(s).${results.length ? `\n${results.length} échec(s) : ${results.slice(0, 3).join(" ; ")}` : ""}` };
  } catch (e) {
    return toActionError(e);
  }
}
