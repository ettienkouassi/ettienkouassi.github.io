/**
 * Import Excel/CSV (§47) : analyse des colonnes, correspondance proposée,
 * détection des erreurs, aperçu, confirmation, import.
 */
import "server-only";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { courseSessions, courses, enrollments, payments, students } from "@/db/schema";
import type { Tx } from "@/db/tenant";
import { nextCounter } from "./certificates";
import { assertPlanLimit } from "./limits";
import type { Table } from "@/lib/tabular";

export const IMPORT_FIELDS = {
  lastName: { label: "Nom", required: true, synonyms: ["nom", "last name", "lastname", "nom de famille", "surname"] },
  firstName: { label: "Prénom", required: true, synonyms: ["prenom", "prénom", "prenoms", "prénoms", "first name", "firstname"] },
  fullName: { label: "Nom complet", required: false, synonyms: ["nom complet", "nom et prenom", "nom & prenom", "nom et prénoms", "full name", "etudiant", "étudiant", "apprenant"] },
  phone: { label: "Téléphone", required: false, synonyms: ["telephone", "téléphone", "tel", "tél", "contact", "mobile", "portable", "phone", "whatsapp", "numero", "numéro"] },
  email: { label: "Email", required: false, synonyms: ["email", "e-mail", "mail", "courriel", "adresse email"] },
  matricule: { label: "Matricule", required: false, synonyms: ["matricule", "id", "code", "numero etudiant", "n°"] },
  birthDate: { label: "Date de naissance", required: false, synonyms: ["date de naissance", "naissance", "birthdate", "ne le", "né le"] },
  profession: { label: "Profession", required: false, synonyms: ["profession", "metier", "métier", "fonction", "poste"] },
  company: { label: "Entreprise", required: false, synonyms: ["entreprise", "societe", "société", "employeur", "company", "structure"] },
  educationLevel: { label: "Niveau d'études", required: false, synonyms: ["niveau", "niveau d'etudes", "niveau d'études", "diplome", "diplôme"] },
  course: { label: "Formation", required: false, synonyms: ["formation", "cours", "module", "course", "programme"] },
  session: { label: "Session", required: false, synonyms: ["session", "promotion", "promo", "groupe", "vague"] },
  amount: { label: "Montant (prix)", required: false, synonyms: ["montant", "prix", "cout", "coût", "frais", "tarif", "montant total"] },
  amountPaid: { label: "Montant payé", required: false, synonyms: ["paye", "payé", "montant paye", "montant payé", "versement", "avance", "deja paye", "déjà payé"] },
} as const;
export type ImportField = keyof typeof IMPORT_FIELDS;
export type Mapping = Partial<Record<ImportField, number>>; // champ → index de colonne

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9&' ]/g, " ").replace(/\s+/g, " ").trim();

export function suggestMapping(headers: string[]): Mapping {
  const m: Mapping = {};
  const used = new Set<number>();
  // Correspondances exactes d'abord, puis partielles
  for (const pass of ["exact", "partial"] as const) {
    for (const [field, def] of Object.entries(IMPORT_FIELDS) as [ImportField, (typeof IMPORT_FIELDS)[ImportField]][]) {
      if (m[field] !== undefined) continue;
      const idx = headers.findIndex((h, i) => {
        if (used.has(i)) return false;
        const n = norm(h);
        return def.synonyms.some((s) => (pass === "exact" ? n === norm(s) : n.includes(norm(s)) && norm(s).length >= 3));
      });
      if (idx >= 0) {
        m[field] = idx;
        used.add(idx);
      }
    }
  }
  if (m.fullName !== undefined && (m.firstName !== undefined || m.lastName !== undefined)) delete m.fullName;
  return m;
}

export type ParsedRow = {
  line: number;
  values: Partial<Record<ImportField, string>>;
  errors: string[];
  warnings: string[];
};

function parseAmount(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[^\d,.-]/g, "").replace(/\s/g, "").replace(/,(\d{1,2})$/, ".$1").replace(/[,.](?=\d{3}\b)/g, ""));
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

function parseDate(v: string | undefined): string | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

export function validateRows(table: Table, mapping: Mapping): ParsedRow[] {
  const seenEmails = new Set<string>();
  return table.rows.map((r, i) => {
    const values: Partial<Record<ImportField, string>> = {};
    for (const [f, idx] of Object.entries(mapping) as [ImportField, number][]) {
      if (idx !== undefined && idx >= 0) values[f] = (r[idx] ?? "").trim().slice(0, 300);
    }
    if (values.fullName && !values.firstName && !values.lastName) {
      const parts = values.fullName.split(/\s+/);
      values.lastName = parts.shift() ?? "";
      values.firstName = parts.join(" ");
    }
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!values.lastName) errors.push("Nom manquant");
    if (!values.firstName) errors.push("Prénom manquant");
    if (values.email) {
      values.email = values.email.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.push("Email invalide");
      else if (seenEmails.has(values.email)) warnings.push("Email en double dans le fichier");
      seenEmails.add(values.email);
    }
    if (values.phone && !/^[+0-9 ().-]{6,30}$/.test(values.phone)) errors.push("Téléphone invalide");
    if (values.amount && Number.isNaN(parseAmount(values.amount))) errors.push("Montant invalide");
    if (values.amountPaid && Number.isNaN(parseAmount(values.amountPaid))) errors.push("Montant payé invalide");
    if (values.birthDate && !parseDate(values.birthDate)) warnings.push("Date de naissance non reconnue (ignorée)");
    return { line: i + 2, values, errors, warnings };
  });
}

export async function commitImport(tx: Tx, orgId: string, userId: string, rows: ParsedRow[]) {
  const valid = rows.filter((r) => r.errors.length === 0);
  await assertPlanLimit(tx, orgId, "students", valid.length);
  const result = { created: 0, skipped: 0, enrollments: 0, payments: 0, messages: [] as string[] };
  const year = new Date().getUTCFullYear();

  for (const r of valid) {
    const v = r.values;
    const dupConds = [v.email ? ilike(students.email, v.email) : undefined, v.phone ? eq(students.phone, v.phone) : undefined].filter(Boolean);
    let studentId: string | null = null;
    if (dupConds.length) {
      const [dup] = await tx.select({ id: students.id }).from(students).where(and(eq(students.organizationId, orgId), or(...dupConds))).limit(1);
      if (dup) {
        studentId = dup.id;
        result.skipped++;
        result.messages.push(`Ligne ${r.line} : étudiant déjà existant (non recréé)`);
      }
    }
    if (!studentId) {
      const n = await nextCounter(tx, orgId, `student-${year}`);
      const [s] = await tx
        .insert(students)
        .values({
          organizationId: orgId,
          matricule: v.matricule || `ETU-${year}-${String(n).padStart(5, "0")}`,
          firstName: v.firstName!,
          lastName: v.lastName!,
          email: v.email || null,
          phone: v.phone || null,
          birthDate: parseDate(v.birthDate),
          profession: v.profession || null,
          company: v.company || null,
          educationLevel: v.educationLevel || null,
          leadSource: "import",
        })
        .returning({ id: students.id });
      studentId = s.id;
      result.created++;
    }
    if (v.course) {
      const [course] = await tx.select().from(courses).where(and(eq(courses.organizationId, orgId), ilike(courses.name, `%${v.course.replace(/[%_]/g, "")}%`))).limit(1);
      if (!course) {
        result.messages.push(`Ligne ${r.line} : formation « ${v.course} » introuvable (inscription ignorée)`);
        continue;
      }
      const sessionConds = [eq(courseSessions.courseId, course.id)];
      if (v.session) sessionConds.push(ilike(courseSessions.name, `%${v.session.replace(/[%_]/g, "")}%`));
      const [session] = await tx
        .select()
        .from(courseSessions)
        .where(and(...sessionConds, sql`${courseSessions.status} <> 'cancelled'`))
        .orderBy(desc(courseSessions.startDate))
        .limit(1);
      if (!session) {
        result.messages.push(`Ligne ${r.line} : aucune session trouvée pour « ${course.name} »`);
        continue;
      }
      const price = parseAmount(v.amount) ?? course.price;
      const [enr] = await tx
        .insert(enrollments)
        .values({ organizationId: orgId, studentId, sessionId: session.id, courseId: course.id, agreedPrice: price, currency: course.currency, status: "registered", createdBy: userId })
        .onConflictDoNothing()
        .returning({ id: enrollments.id });
      if (!enr) continue;
      result.enrollments++;
      const paid = parseAmount(v.amountPaid);
      if (paid && paid > 0) {
        await tx.insert(payments).values({
          organizationId: orgId,
          enrollmentId: enr.id,
          amount: Math.min(paid, price),
          method: "other",
          reference: "IMPORT",
          paidAt: new Date().toISOString().slice(0, 10),
          comment: "Reprise de données (import)",
          recordedBy: userId,
        });
        result.payments++;
      }
    }
  }
  return result;
}

export async function existingCourseNames(tx: Tx, orgId: string) {
  return (await tx.select({ name: courses.name }).from(courses).where(and(eq(courses.organizationId, orgId), inArray(courses.status, ["draft", "published"])))).map((c) => c.name);
}
