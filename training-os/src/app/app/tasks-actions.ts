"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { tasks } from "@/db/schema";
import { toActionError, zId, type ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requireOrg, STAFF } from "@/lib/auth/context";

export async function completeTaskAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF, "students.write");
    const id = zId.parse(fd.get("id"));
    await ctx.db(async (tx) => {
      const [t] = await tx.update(tasks).set({ status: "done", completedAt: new Date() }).where(and(eq(tasks.id, id), eq(tasks.status, "open"))).returning();
      if (t) await audit(tx, ctx.user, ctx.orgId, { action: "task.done", entityType: "task", entityId: t.id, summary: `${ctx.user.firstName} ${ctx.user.lastName} a traité la tâche « ${t.title} »` });
    });
    revalidatePath("/app");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
