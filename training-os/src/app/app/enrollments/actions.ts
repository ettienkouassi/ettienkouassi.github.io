"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { courseSessions, courses, enrollments, organizations, payments, paymentSchedules, prospects, students } from "@/db/schema";
import { parseForm, toActionError, UserError, zDate, zId, zInt, zMoney, zOptText, zPositiveMoney, type ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requireOrg, STAFF } from "@/lib/auth/context";
import { computeBalance, netPrice, splitInstallments, validateSchedule } from "@/lib/domain/finance";
import { formatDate, formatMoney, LABELS, todayISO } from "@/lib/format";
import { issueCertificate } from "@/server/certificates";
import { deliverQueued, queueEmail } from "@/server/communications";

const ACTIVE = ["preregistered", "registered", "active"] as const;

export async function createEnrollmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const ctx = await requireOrg(STAFF, "enrollments.write");
    const { data, state } = parseForm(
      z.object({
        studentId: zId,
        sessionId: zId,
        agreedPrice: zMoney,
        discount: zMoney.optional(),
        status: z.enum(["preregistered", "registered", "active"]),
        installments: zInt(1, 24),
        firstDueDate: zDate,
        intervalDays: zInt(1, 180),
        paymentTerms: zOptText(300),
        notes: zOptText(1000),
        prospectId: zId.optional(),
      }),
      fd,
    );
    if (!data) return state!;
    const res = await ctx.db(async (tx) => {
      const [st] = await tx.select().from(students).where(and(eq(students.id, data.studentId), eq(students.organizationId, ctx.orgId))).limit(1);
      if (!st) throw new UserError("Étudiant introuvable.");
      // Verrou sur la session : empêche le surbooking en cas d'inscriptions simultanées
      const [row] = await tx
        .select({ s: courseSessions, c: courses })
        .from(courseSessions)
        .innerJoin(courses, eq(courses.id, courseSessions.courseId))
        .where(eq(courseSessions.id, data.sessionId))
        .for("update", { of: courseSessions })
        .limit(1);
      if (!row) throw new UserError("Session introuvable.");
      if (["cancelled", "completed"].includes(row.s.status)) throw new UserError("Cette session n'accepte plus d'inscriptions.");
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(enrollments)
        .where(and(eq(enrollments.sessionId, row.s.id), inArray(enrollments.status, [...ACTIVE])));
      if (n >= row.s.capacity) throw new UserError(`Session complète (${n}/${row.s.capacity}). Augmentez la capacité ou choisissez une autre session.`);
      const discount = data.discount ?? 0;
      if (discount > data.agreedPrice) throw new UserError("La remise ne peut pas dépasser le prix.");
      const [e] = await tx
        .insert(enrollments)
        .values({
          organizationId: ctx.orgId,
          studentId: st.id,
          sessionId: row.s.id,
          courseId: row.c.id,
          status: data.status,
          agreedPrice: data.agreedPrice,
          discount,
          currency: row.c.currency,
          paymentTerms: data.paymentTerms ?? `${data.installments} versement(s)`,
          notes: data.notes,
          createdBy: ctx.user.id,
        })
        .returning();
      const total = netPrice(data.agreedPrice, discount);
      if (total > 0) {
        const sched = splitInstallments(total, data.installments, data.firstDueDate, data.intervalDays);
        await tx.insert(paymentSchedules).values(sched.map((x) => ({ ...x, organizationId: ctx.orgId, enrollmentId: e.id })));
      }
      if (n + 1 >= row.s.capacity && row.s.status === "open") await tx.update(courseSessions).set({ status: "full" }).where(eq(courseSessions.id, row.s.id));
      if (data.prospectId) await tx.update(prospects).set({ status: "enrolled", convertedStudentId: st.id }).where(eq(prospects.id, data.prospectId));
      const [org] = await tx.select().from(organizations).where(eq(organizations.id, ctx.orgId)).limit(1);
      const mail = await queueEmail(tx, ctx.orgId, {
        templateKey: "registration_confirmation",
        to: st.email,
        studentId: st.id,
        createdBy: ctx.user.id,
        dedupeKey: `registration:${e.id}`,
        vars: { prenom: st.firstName, formation: row.c.name, session: row.s.name, date_debut: formatDate(row.s.startDate), montant: formatMoney(total), centre: org.name },
      });
      await audit(tx, ctx.user, ctx.orgId, {
        action: "enrollment.create",
        entityType: "enrollment",
        entityId: e.id,
        summary: `${ctx.user.firstName} ${ctx.user.lastName} a inscrit ${st.firstName} ${st.lastName} à ${row.s.name} (${formatMoney(total)})`,
      });
      return { id: e.id, mail };
    });
    id = res.id;
    await deliverQueued(ctx.orgId, [res.mail]);
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/app/enrollments");
  redirect(`/app/enrollments/${id}`);
}

export async function updateEnrollmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF, "enrollments.write");
    const { data, state } = parseForm(
      z.object({ id: zId, status: z.enum(["prospect", "preregistered", "registered", "active", "completed", "dropped", "cancelled"]), agreedPrice: zMoney, discount: zMoney, notes: zOptText(1000) }),
      fd,
    );
    if (!data) return state!;
    await ctx.db(async (tx) => {
      const [before] = await tx.select().from(enrollments).where(eq(enrollments.id, data.id)).limit(1);
      if (!before) throw new UserError("Inscription introuvable.");
      if (data.discount > data.agreedPrice) throw new UserError("La remise ne peut pas dépasser le prix.");
      const priceChanged = before.agreedPrice !== data.agreedPrice || before.discount !== data.discount;
      if (priceChanged && !(ctx.role === "org_admin")) throw new UserError("Seul l'administrateur peut modifier le montant d'une inscription.");
      await tx
        .update(enrollments)
        .set({ status: data.status, agreedPrice: data.agreedPrice, discount: data.discount, notes: data.notes, completedAt: data.status === "completed" ? (before.completedAt ?? new Date()) : null })
        .where(eq(enrollments.id, data.id));
      if (priceChanged) {
        // L'échéancier doit rester cohérent : on le recalcule sur les échéances restantes
        const sched = await tx.select().from(paymentSchedules).where(eq(paymentSchedules.enrollmentId, data.id)).orderBy(paymentSchedules.position);
        const total = netPrice(data.agreedPrice, data.discount);
        await tx.delete(paymentSchedules).where(eq(paymentSchedules.enrollmentId, data.id));
        if (total > 0) {
          const first = sched[0]?.dueDate ?? todayISO();
          const n = Math.max(1, sched.length);
          await tx.insert(paymentSchedules).values(splitInstallments(total, n, first, 30).map((x, i) => ({ ...x, dueDate: sched[i]?.dueDate ?? x.dueDate, label: sched[i]?.label ?? x.label, organizationId: ctx.orgId, enrollmentId: data.id })));
        }
      }
      const parts = [];
      if (before.status !== data.status) parts.push(`statut ${LABELS.enrollmentStatus[before.status]} → ${LABELS.enrollmentStatus[data.status]}`);
      if (priceChanged) parts.push(`montant ${formatMoney(netPrice(before.agreedPrice, before.discount))} → ${formatMoney(netPrice(data.agreedPrice, data.discount))}`);
      if (parts.length)
        await audit(tx, ctx.user, ctx.orgId, {
          action: priceChanged ? "enrollment.amount_change" : "enrollment.update",
          entityType: "enrollment",
          entityId: data.id,
          summary: `${ctx.user.firstName} ${ctx.user.lastName} a modifié une inscription : ${parts.join(", ")}`,
          metadata: { before: { status: before.status, agreedPrice: before.agreedPrice, discount: before.discount }, after: { status: data.status, agreedPrice: data.agreedPrice, discount: data.discount } },
        });
    });
    revalidatePath(`/app/enrollments/${data.id}`);
    return { ok: true, message: "Inscription mise à jour." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveScheduleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF, "payments.write");
    const { data, state } = parseForm(
      z.object({ enrollmentId: zId, label: z.array(z.string().max(80)), dueDate: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide")), amount: z.array(z.coerce.number().int().min(1)) }),
      fd,
    );
    if (!data) return state!;
    const n = Math.min(data.label.length, data.dueDate.length, data.amount.length);
    const rows = Array.from({ length: n }, (_, i) => ({ position: i + 1, label: data.label[i] || `Échéance ${i + 1}`, dueDate: data.dueDate[i], amount: data.amount[i] }));
    await ctx.db(async (tx) => {
      const [e] = await tx.select().from(enrollments).where(eq(enrollments.id, data.enrollmentId)).limit(1);
      if (!e) throw new UserError("Inscription introuvable.");
      const err = validateSchedule(netPrice(e.agreedPrice, e.discount), rows);
      if (err) throw new UserError(err);
      await tx.delete(paymentSchedules).where(eq(paymentSchedules.enrollmentId, e.id));
      if (rows.length) await tx.insert(paymentSchedules).values(rows.map((r) => ({ ...r, organizationId: ctx.orgId, enrollmentId: e.id })));
      await audit(tx, ctx.user, ctx.orgId, { action: "schedule.update", entityType: "enrollment", entityId: e.id, summary: `${ctx.user.firstName} ${ctx.user.lastName} a modifié l'échéancier (${rows.length} échéance(s))` });
    });
    revalidatePath(`/app/enrollments/${data.enrollmentId}`);
    return { ok: true, message: "Échéancier enregistré." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function recordPaymentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF, "payments.write");
    const { data, state } = parseForm(
      z.object({
        enrollmentId: zId,
        amount: zPositiveMoney,
        method: z.enum(["cash", "bank_transfer", "card", "mobile_money", "other"]),
        reference: zOptText(80),
        paidAt: zDate,
        comment: zOptText(500),
      }),
      fd,
    );
    if (!data) return state!;
    const mail = await ctx.db(async (tx) => {
      const [org] = await tx.select().from(organizations).where(eq(organizations.id, ctx.orgId)).limit(1);
      if (data.paidAt > todayISO(org.timezone)) throw new UserError("La date de paiement ne peut pas être dans le futur.");
      // Verrou sur l'inscription : deux caissiers ne peuvent pas dépasser le solde en parallèle
      const [row] = await tx
        .select({ e: enrollments, st: students, c: courses })
        .from(enrollments)
        .innerJoin(students, eq(students.id, enrollments.studentId))
        .innerJoin(courses, eq(courses.id, enrollments.courseId))
        .where(eq(enrollments.id, data.enrollmentId))
        .for("update", { of: enrollments })
        .limit(1);
      if (!row) throw new UserError("Inscription introuvable.");
      if (row.e.status === "cancelled") throw new UserError("Inscription annulée : aucun paiement possible.");
      const pays = await tx.select({ amount: payments.amount, status: payments.status }).from(payments).where(eq(payments.enrollmentId, row.e.id));
      const bal = computeBalance({ agreedPrice: row.e.agreedPrice, discount: row.e.discount, payments: pays, schedules: [], today: todayISO(org.timezone) });
      if (data.amount > bal.remaining) throw new UserError(`Le montant dépasse le solde restant (${formatMoney(bal.remaining)}).`);
      const [p] = await tx.insert(payments).values({ ...data, organizationId: ctx.orgId, recordedBy: ctx.user.id }).returning();
      if (row.e.status === "preregistered" || row.e.status === "registered") await tx.update(enrollments).set({ status: "active" }).where(and(eq(enrollments.id, row.e.id), eq(enrollments.status, "preregistered")));
      await audit(tx, ctx.user, ctx.orgId, {
        action: "payment.record",
        entityType: "enrollment",
        entityId: row.e.id,
        summary: `${ctx.user.firstName} ${ctx.user.lastName} a enregistré un paiement de ${formatMoney(p.amount)} (${LABELS.paymentMethod[p.method]}) pour ${row.st.firstName} ${row.st.lastName}`,
        metadata: { paymentId: p.id, reference: p.reference },
      });
      return queueEmail(tx, ctx.orgId, {
        templateKey: "payment_confirmation",
        to: row.st.email,
        studentId: row.st.id,
        createdBy: ctx.user.id,
        dedupeKey: `payment:${p.id}`,
        vars: { prenom: row.st.firstName, montant: formatMoney(p.amount), formation: row.c.name, paye: formatMoney(bal.paid + p.amount), reste: formatMoney(bal.remaining - p.amount), centre: org.name },
      });
    });
    await deliverQueued(ctx.orgId, [mail]);
    revalidatePath(`/app/enrollments/${data.enrollmentId}`);
    revalidatePath("/app/payments");
    return { ok: true, message: `Paiement de ${formatMoney(data.amount)} enregistré.` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function cancelPaymentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF, "payments.cancel");
    const { data, state } = parseForm(z.object({ id: zId, reason: z.string().min(5, "Motif obligatoire (5 caractères minimum)").max(300) }), fd);
    if (!data) return state!;
    const enrId = await ctx.db(async (tx) => {
      const [p] = await tx.select().from(payments).where(eq(payments.id, data.id)).limit(1);
      if (!p) throw new UserError("Paiement introuvable.");
      if (p.status === "cancelled") throw new UserError("Paiement déjà annulé.");
      await tx.update(payments).set({ status: "cancelled", cancelledBy: ctx.user.id, cancelledAt: new Date(), cancelReason: data.reason }).where(eq(payments.id, p.id));
      await audit(tx, ctx.user, ctx.orgId, {
        action: "payment.cancel",
        entityType: "enrollment",
        entityId: p.enrollmentId,
        summary: `${ctx.user.firstName} ${ctx.user.lastName} a annulé un paiement de ${formatMoney(p.amount)} — motif : ${data.reason}`,
        metadata: { paymentId: p.id },
      });
      return p.enrollmentId;
    });
    revalidatePath(`/app/enrollments/${enrId}`);
    return { ok: true, message: "Paiement annulé (conservé dans l'historique)." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function issueCertificateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireOrg(STAFF, "certificates.issue");
    const enrollmentId = zId.parse(fd.get("enrollmentId"));
    const override = fd.get("override") === "1" && ctx.role === "org_admin";
    const res = await ctx.db((tx) => issueCertificate(tx, ctx.orgId, ctx.user, enrollmentId, { override }));
    await deliverQueued(ctx.orgId, [res.mailId]);
    revalidatePath(`/app/enrollments/${enrollmentId}`);
    revalidatePath("/app/certificates");
    return { ok: true, message: `Certificat ${res.certificate.code} généré.` };
  } catch (e) {
    return toActionError(e);
  }
}
