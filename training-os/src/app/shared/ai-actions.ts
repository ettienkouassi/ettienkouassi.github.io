"use server";

import { z } from "zod";
import { toActionError, UserError } from "@/lib/actions";
import { requireOrg } from "@/lib/auth/context";
import { rateLimit } from "@/lib/security/rate-limit";
import { askAssistant, type AssistantKind } from "@/server/ai/assistant";

export type ChatState = { error?: string; conversationId?: string; answer?: string; question?: string; toolsUsed?: string[]; at?: number };

const ROLES: Record<AssistantKind, ("org_admin" | "manager" | "instructor" | "student")[]> = {
  director: ["org_admin", "manager"],
  instructor: ["instructor"],
  student: ["student"],
};

export async function chatAction(_: ChatState, fd: FormData): Promise<ChatState> {
  try {
    const kind = z.enum(["director", "instructor", "student"]).parse(fd.get("kind"));
    const ctx = await requireOrg(ROLES[kind], kind === "director" ? "ai.director" : undefined);
    const rl = await rateLimit(`ai:${ctx.user.id}`, 20, 60);
    if (!rl.allowed) throw new UserError("Trop de questions en peu de temps. Patientez une minute.");
    const question = String(fd.get("question") ?? "");
    const convId = fd.get("conversationId");
    const r = await askAssistant(ctx, kind, question, typeof convId === "string" && /^[0-9a-f-]{36}$/.test(convId) ? convId : null);
    return { conversationId: r.conversationId, answer: r.answer, question, toolsUsed: r.toolsUsed, at: Date.now() };
  } catch (e) {
    return { error: toActionError(e).error };
  }
}
