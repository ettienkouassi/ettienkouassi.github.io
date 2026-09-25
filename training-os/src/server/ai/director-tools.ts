import "server-only";
import { and, eq, ilike, inArray, sql } from "drizzle-orm";
import { courseRecommendations, courses, enrollments, prospects, students } from "@/db/schema";
import type { ToolDef } from "@/lib/ai/types";
import type { OrgContext } from "@/lib/auth/context";
import { centerOverview, courseStats, periodRange, revenue, todayActions, type Period } from "../metrics";
import { loadEnrollmentSummaries } from "../summaries";

const str = (v: unknown, max = 100) => (typeof v === "string" ? v.slice(0, max) : undefined);
const num = (v: unknown, d: number, min = 1, max = 200) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d;
};

/**
 * Outils de l'assistant du directeur (§19). Tous en LECTURE SEULE, exécutés dans
 * la transaction RLS du centre. Aucune coordonnée personnelle (téléphone, email)
 * n'est transmise au modèle : minimisation des données (§49).
 */
export function directorTools(ctx: OrgContext, tz: string): ToolDef[] {
  const summaries = (statuses?: ("registered" | "active" | "completed" | "dropped")[]) =>
    ctx.db((tx) => loadEnrollmentSummaries(tx, ctx.orgId, { statuses: statuses ?? ["registered", "active", "completed"] }, tz));
  const name = (s: { student: { firstName: string; lastName: string } }) => `${s.student.firstName} ${s.student.lastName}`;

  return [
    {
      name: "get_center_overview",
      description: "Indicateurs clés du centre : étudiants actifs, inscriptions du mois, formations actives, sessions en cours, encaissé du mois, restant à encaisser, retards, taux de présence moyen, certificats.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run: async () => {
        const o = await ctx.db((tx) => centerOverview(tx, ctx.orgId, tz));
        const { _summaries: _s, ...rest } = o;
        return { ...rest, devise: "FCFA" };
      },
    },
    {
      name: "get_revenue",
      description: "Montants encaissés (paiements enregistrés) sur une période, avec ventilation. Utiliser pour « combien avons-nous encaissé ».",
      inputSchema: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["today", "week", "month", "year", "all"], description: "Période prédéfinie" },
          from: { type: "string", description: "Date de début AAAA-MM-JJ (optionnel, remplace period)" },
          to: { type: "string", description: "Date de fin AAAA-MM-JJ (optionnel)" },
          group_by: { type: "string", enum: ["course", "session", "method", "month", "day"] },
        },
        additionalProperties: false,
      },
      run: async (i) => {
        const period = (["today", "week", "month", "year", "all"].includes(String(i.period)) ? i.period : "month") as Period;
        const valid = (d: unknown) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
        const range = periodRange(period, tz, valid(i.from) ? (i.from as string) : undefined, valid(i.to) ? (i.to as string) : undefined);
        const g = (["course", "session", "method", "month", "day"].includes(String(i.group_by)) ? i.group_by : "course") as "course";
        return { ...(await ctx.db((tx) => revenue(tx, ctx.orgId, range, g))), devise: "FCFA" };
      },
    },
    {
      name: "list_unpaid",
      description: "Étudiants ayant encore un solde à payer (ou seulement ceux en retard), avec montant restant et prochaine échéance.",
      inputSchema: {
        type: "object",
        properties: { only_overdue: { type: "boolean" }, course: { type: "string", description: "Filtre sur le nom de la formation" }, limit: { type: "integer" } },
        additionalProperties: false,
      },
      run: async (i) => {
        const course = str(i.course)?.toLowerCase();
        const list = (await summaries(["registered", "active", "completed"]))
          .filter((s) => s.balance.remaining > 0 && (!i.only_overdue || s.balance.overdueAmount > 0) && (!course || s.course.name.toLowerCase().includes(course)))
          .sort((a, b) => b.balance.overdueAmount - a.balance.overdueAmount || b.balance.remaining - a.balance.remaining);
        return {
          nombre: list.length,
          total_restant: list.reduce((a, s) => a + s.balance.remaining, 0),
          etudiants: list.slice(0, num(i.limit, 30)).map((s) => ({
            etudiant: name(s),
            matricule: s.student.matricule,
            formation: s.course.name,
            total: s.balance.total,
            paye: s.balance.paid,
            reste: s.balance.remaining,
            en_retard: s.balance.overdueAmount,
            prochaine_echeance: s.balance.nextDue,
          })),
        };
      },
    },
    {
      name: "list_low_attendance",
      description: "Étudiants dont le taux de présence est inférieur à un seuil (défaut 75 %).",
      inputSchema: { type: "object", properties: { threshold: { type: "number" }, limit: { type: "integer" } }, additionalProperties: false },
      run: async (i) => {
        const t = num(i.threshold, 75, 1, 100);
        const list = (await summaries(["registered", "active"])).filter((s) => s.attendance.rate !== null && s.attendance.rate < t).sort((a, b) => (a.attendance.rate ?? 0) - (b.attendance.rate ?? 0));
        return {
          seuil: t,
          nombre: list.length,
          etudiants: list.slice(0, num(i.limit, 30)).map((s) => ({
            etudiant: name(s),
            formation: s.course.name,
            taux_presence: s.attendance.rate,
            absences: s.attendance.absent,
            retards: s.attendance.late,
            absences_consecutives: s.attendance.consecutiveAbsences,
          })),
        };
      },
    },
    {
      name: "list_at_risk_students",
      description: "Étudiants nécessitant un suivi selon des indicateurs (absences, résultats, inactivité, retards de paiement). C'est une alerte, pas un diagnostic.",
      inputSchema: { type: "object", properties: { limit: { type: "integer" } }, additionalProperties: false },
      run: async (i) => {
        const list = (await summaries(["registered", "active"])).filter((s) => s.risk.level !== "none").sort((a, b) => b.risk.score - a.risk.score);
        return {
          avertissement: "Alerte basée sur des indicateurs observés, pas un diagnostic.",
          etudiants: list.slice(0, num(i.limit, 30)).map((s) => ({ etudiant: name(s), formation: s.course.name, niveau: s.risk.level, indicateurs: s.risk.signals.map((x) => x.label) })),
        };
      },
    },
    {
      name: "get_course_stats",
      description: "Statistiques par formation : inscrits, actifs, terminés, abandons, progression moyenne, taux de réussite. Trié par nombre d'inscrits.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run: async () => courseStats(await summaries(["registered", "active", "completed", "dropped"])),
    },
    {
      name: "find_students_by_course",
      description: "Liste des étudiants d'une formation, filtrable par statut (ex. ceux qui ont terminé Excel).",
      inputSchema: {
        type: "object",
        properties: { course: { type: "string" }, status: { type: "string", enum: ["completed", "active", "registered", "dropped", "any"] } },
        required: ["course"],
        additionalProperties: false,
      },
      run: async (i) => {
        const course = (str(i.course) ?? "").toLowerCase();
        const status = str(i.status) ?? "completed";
        const list = (await summaries(["registered", "active", "completed", "dropped"])).filter(
          (s) => s.course.name.toLowerCase().includes(course) && (status === "any" || s.status === status),
        );
        return { formation_recherchee: i.course, statut: status, nombre: list.length, etudiants: list.map((s) => ({ etudiant: name(s), session: s.session.name, statut: s.status, progression: s.progress.global })) };
      },
    },
    {
      name: "suggest_upsell_candidates",
      description: "Anciens étudiants susceptibles d'être intéressés par une formation cible : ont terminé une formation qui y mène (recommandations configurées) et n'y sont pas encore inscrits.",
      inputSchema: { type: "object", properties: { course: { type: "string", description: "Formation cible, ex. Power BI" } }, required: ["course"], additionalProperties: false },
      run: async (i) => {
        const target = str(i.course) ?? "";
        return ctx.db(async (tx) => {
          const [t] = await tx.select().from(courses).where(and(eq(courses.organizationId, ctx.orgId), ilike(courses.name, `%${target.replace(/[%_]/g, "")}%`))).limit(1);
          if (!t) return { erreur: `Aucune formation ne correspond à « ${target} ».` };
          const reco = await tx.select({ from: courseRecommendations.fromCourseId, reason: courseRecommendations.reason }).from(courseRecommendations).where(eq(courseRecommendations.toCourseId, t.id));
          if (reco.length === 0) return { formation: t.name, candidats: [], note: "Aucune formation prérequise n'est configurée comme menant à cette formation." };
          const done = await tx
            .select({ studentId: enrollments.studentId, first: students.firstName, last: students.lastName, course: courses.name })
            .from(enrollments)
            .innerJoin(students, eq(students.id, enrollments.studentId))
            .innerJoin(courses, eq(courses.id, enrollments.courseId))
            .where(and(eq(enrollments.status, "completed"), inArray(enrollments.courseId, reco.map((r) => r.from))));
          const already = new Set(
            (await tx.select({ s: enrollments.studentId }).from(enrollments).where(and(eq(enrollments.courseId, t.id), sql`${enrollments.status} <> 'cancelled'`))).map((r) => r.s),
          );
          const seen = new Set<string>();
          const cands = done.filter((d) => !already.has(d.studentId) && !seen.has(d.studentId) && seen.add(d.studentId));
          return { formation: t.name, nombre: cands.length, candidats: cands.map((c) => ({ etudiant: `${c.first} ${c.last}`, a_termine: c.course })) };
        });
      },
    },
    {
      name: "list_certificates_to_issue",
      description: "Étudiants remplissant toutes les conditions de certification mais sans certificat généré.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run: async () => {
        const list = (await summaries(["registered", "active", "completed"])).filter((s) => s.certification.ready);
        return { nombre: list.length, etudiants: list.map((s) => ({ etudiant: name(s), formation: s.course.name, session: s.session.name })) };
      },
    },
    {
      name: "list_prospects_pipeline",
      description: "Pipeline commercial : nombre de prospects par étape et prospects à relancer.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run: async () =>
        ctx.db(async (tx) => {
          const byStatus = await tx.select({ statut: prospects.status, n: sql<number>`count(*)::int` }).from(prospects).where(eq(prospects.organizationId, ctx.orgId)).groupBy(prospects.status);
          const conv = byStatus.reduce((a, r) => a + r.n, 0);
          const won = byStatus.filter((r) => ["enrolled", "client"].includes(r.statut)).reduce((a, r) => a + r.n, 0);
          return { par_etape: byStatus, total: conv, taux_conversion: conv ? Math.round((won / conv) * 1000) / 10 : null };
        }),
    },
    {
      name: "get_today_actions",
      description: "Synthèse des actions prioritaires du jour : séances, retards de paiement, échéances proches, étudiants à suivre, certificats à générer, prospects à relancer, sessions presque complètes, tâches.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run: async () => ctx.db((tx) => todayActions(tx, ctx.orgId, tz)),
    },
    {
      name: "search_student",
      description: "Recherche un étudiant par nom et renvoie sa situation (formations, progression, présence, solde).",
      inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false },
      run: async (i) => {
        const q = (str(i.name, 80) ?? "").replace(/[%_]/g, "");
        return ctx.db(async (tx) => {
          const found = await tx
            .select({ id: students.id })
            .from(students)
            .where(and(eq(students.organizationId, ctx.orgId), sql`(${students.firstName} || ' ' || ${students.lastName}) ilike ${"%" + q + "%"} or (${students.lastName} || ' ' || ${students.firstName}) ilike ${"%" + q + "%"}`))
            .limit(5);
          const out = [];
          for (const f of found) {
            const sums = await loadEnrollmentSummaries(tx, ctx.orgId, { studentId: f.id }, tz);
            out.push(
              sums.map((s) => ({
                etudiant: name(s),
                formation: s.course.name,
                statut: s.status,
                progression: s.progress.global,
                taux_presence: s.attendance.rate,
                moyenne: s.averageGrade,
                reste_a_payer: s.balance.remaining,
                certificat: s.certification.certificateCode,
              })),
            );
          }
          return out.flat();
        });
      },
    },
  ];
}
