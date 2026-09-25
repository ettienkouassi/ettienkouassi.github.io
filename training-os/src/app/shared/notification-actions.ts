"use server";

import { revalidatePath } from "next/cache";
import { toActionError, type ActionState } from "@/lib/actions";
import { requireOrg } from "@/lib/auth/context";
import { markAllRead } from "@/server/notifications";

export async function markAllReadAction(_: ActionState): Promise<ActionState> {
  try {
    const ctx = await requireOrg(["org_admin", "manager", "instructor", "student"]);
    await markAllRead(ctx);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
