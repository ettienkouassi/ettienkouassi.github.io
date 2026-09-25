/**
 * TRAINING OS AI — schéma PostgreSQL (Drizzle ORM).
 *
 * Règle multi-tenant : toute table métier porte `organization_id`.
 * L'isolation est appliquée à deux niveaux :
 *   1. côté application : chaque requête filtre explicitement par organization_id ;
 *   2. côté base : Row Level Security (voir drizzle/*_rls.sql) basé sur le
 *      paramètre de transaction `app.org_id`.
 *
 * Les montants sont stockés en entiers dans l'unité de la devise
 * (le FCFA/XOF n'a pas de décimales).
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  customType,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

const money = (name: string) => bigint(name, { mode: "number" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const orgId = () =>
  uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "restrict" });

// ---------------------------------------------------------------- enums
export const userRole = pgEnum("user_role", ["super_admin", "org_admin", "manager", "instructor", "student"]);
export const orgStatus = pgEnum("org_status", ["onboarding", "active", "suspended", "archived"]);
export const subscriptionStatus = pgEnum("subscription_status", ["trialing", "active", "past_due", "expired", "cancelled"]);
export const courseStatus = pgEnum("course_status", ["draft", "published", "archived"]);
export const sessionStatus = pgEnum("session_status", ["draft", "open", "full", "in_progress", "completed", "cancelled"]);
export const enrollmentStatus = pgEnum("enrollment_status", [
  "prospect",
  "preregistered",
  "registered",
  "active",
  "completed",
  "dropped",
  "cancelled",
]);
export const paymentMethod = pgEnum("payment_method", ["cash", "bank_transfer", "card", "mobile_money", "other"]);
export const paymentRecordStatus = pgEnum("payment_record_status", ["recorded", "cancelled"]);
export const attendanceStatus = pgEnum("attendance_status", ["present", "absent", "late", "excused"]);
export const assessmentType = pgEnum("assessment_type", ["quiz", "exercise", "assignment", "exam", "final_project"]);
export const materialVisibility = pgEnum("material_visibility", ["students", "instructors", "admin"]);
export const materialKind = pgEnum("material_kind", ["file", "link"]);
export const certificateStatus = pgEnum("certificate_status", ["issued", "revoked"]);
export const prospectStatus = pgEnum("prospect_status", [
  "new",
  "contacted",
  "interested",
  "offer_sent",
  "preregistered",
  "enrolled",
  "client",
  "lost",
]);
export const notificationLevel = pgEnum("notification_level", ["info", "success", "warning", "urgent"]);
export const communicationStatus = pgEnum("communication_status", ["queued", "sent", "failed"]);
export const taskStatus = pgEnum("task_status", ["open", "done", "cancelled"]);
export const aiAssistant = pgEnum("ai_assistant", ["director", "student", "instructor", "import"]);
export const authTokenType = pgEnum("auth_token_type", ["password_reset", "email_verification", "invitation"]);

// ---------------------------------------------------------------- plateforme
export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  priceMonthly: money("price_monthly"),
  currency: text("currency").notNull().default("XOF"),
  maxStudents: integer("max_students"),
  maxInstructors: integer("max_instructors"),
  maxCourses: integer("max_courses"),
  maxAdmins: integer("max_admins"),
  storageMb: integer("storage_mb"),
  aiRequestsPerMonth: integer("ai_requests_per_month"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  logoKey: text("logo_key"),
  country: text("country").notNull().default("Côte d'Ivoire"),
  city: text("city"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  managerName: text("manager_name"),
  currency: text("currency").notNull().default("XOF"),
  locale: text("locale").notNull().default("fr"),
  timezone: text("timezone").notNull().default("Africa/Abidjan"),
  status: orgStatus("status").notNull().default("onboarding"),
  publicPageEnabled: boolean("public_page_enabled").notNull().default(false),
  certificatePrefix: text("certificate_prefix").notNull().default("CERT"),
  certificateSignatoryName: text("certificate_signatory_name"),
  certificateSignatoryTitle: text("certificate_signatory_title"),
  aiRecommendationsEnabled: boolean("ai_recommendations_enabled").notNull().default(true),
  settings: jsonb("settings").$type<OrgSettings>().notNull().default({}),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type OrgSettings = {
  reminderDaysBefore?: number;
  reminderDaysAfter?: number;
  absenceAlertThreshold?: number;
  paymentMethods?: string[];
};

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    status: subscriptionStatus("status").notNull().default("trialing"),
    currentPeriodStart: date("current_period_start").notNull(),
    currentPeriodEnd: date("current_period_end").notNull(),
    amount: money("amount").notNull().default(0),
    currency: text("currency").notNull().default("XOF"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("subscriptions_org_idx").on(t.organizationId)],
);

// ---------------------------------------------------------------- utilisateurs & authentification
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
    email: text("email").notNull(),
    passwordHash: text("password_hash"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    phone: text("phone"),
    role: userRole("role").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(sql`lower(${t.email})`),
    index("users_org_idx").on(t.organizationId),
  ],
);

/** Sessions : l'identifiant stocké est le SHA-256 du jeton du cookie (jamais le jeton brut). */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [index("auth_sessions_user_idx").on(t.userId)],
);

export const authTokens = pgTable("auth_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: authTokenType("type").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(0),
});

export const orgCounters = pgTable(
  "org_counters",
  {
    organizationId: orgId(),
    key: text("key").notNull(),
    value: integer("value").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.key] })],
);

// ---------------------------------------------------------------- personnes
export const instructors = pgTable(
  "instructors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    specialty: text("specialty"),
    bio: text("bio"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("instructors_org_idx").on(t.organizationId), uniqueIndex("instructors_user_unique").on(t.userId)],
);

export const students = pgTable(
  "students",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    matricule: text("matricule").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    photoKey: text("photo_key"),
    birthDate: date("birth_date"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    country: text("country"),
    profession: text("profession"),
    company: text("company"),
    educationLevel: text("education_level"),
    leadSource: text("lead_source"),
    adminNotes: text("admin_notes"),
    isActive: boolean("is_active").notNull().default(true),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("students_org_matricule_unique").on(t.organizationId, t.matricule),
    uniqueIndex("students_user_unique").on(t.userId),
    index("students_org_name_idx").on(t.organizationId, t.lastName, t.firstName),
  ],
);

// ---------------------------------------------------------------- catalogue
export const courses = pgTable(
  "courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    category: text("category"),
    level: text("level"),
    durationHours: integer("duration_hours").notNull().default(0),
    price: money("price").notNull().default(0),
    currency: text("currency").notNull().default("XOF"),
    capacity: integer("capacity"),
    prerequisites: text("prerequisites"),
    objectives: text("objectives"),
    program: text("program"),
    instructorId: uuid("instructor_id").references(() => instructors.id, { onDelete: "set null" }),
    status: courseStatus("status").notNull().default("draft"),
    isPublic: boolean("is_public").notNull().default(false),
    // Conditions de certification (§52)
    certMinAttendance: integer("cert_min_attendance").notNull().default(75),
    certMinGrade: integer("cert_min_grade").notNull().default(50),
    certRequireAllModules: boolean("cert_require_all_modules").notNull().default(false),
    certRequireFinalExam: boolean("cert_require_final_exam").notNull().default(false),
    certRequireFullPayment: boolean("cert_require_full_payment").notNull().default(false),
    certAutoIssue: boolean("cert_auto_issue").notNull().default(false),
    // Pondération de la progression (§14) — total 100
    weightAttendance: integer("weight_attendance").notNull().default(30),
    weightModules: integer("weight_modules").notNull().default(30),
    weightAssessments: integer("weight_assessments").notNull().default(40),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("courses_org_slug_unique").on(t.organizationId, t.slug)],
);

export const courseModules = pgTable(
  "course_modules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(1),
    title: text("title").notNull(),
    description: text("description"),
    durationHours: integer("duration_hours"),
    createdAt: createdAt(),
  },
  (t) => [index("course_modules_course_idx").on(t.courseId, t.position)],
);

export const courseRecommendations = pgTable(
  "course_recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    fromCourseId: uuid("from_course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    toCourseId: uuid("to_course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("course_reco_unique").on(t.fromCourseId, t.toCourseId)],
);

export const courseSessions = pgTable(
  "course_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    days: text("days"),
    startTime: time("start_time"),
    endTime: time("end_time"),
    room: text("room"),
    instructorId: uuid("instructor_id").references(() => instructors.id, { onDelete: "set null" }),
    capacity: integer("capacity").notNull().default(20),
    status: sessionStatus("status").notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("course_sessions_org_idx").on(t.organizationId, t.startDate), index("course_sessions_course_idx").on(t.courseId)],
);

/** Séances (rencontres datées) d'une session, sur lesquelles on pointe la présence. */
export const sessionMeetings = pgTable(
  "session_meetings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => courseSessions.id, { onDelete: "cascade" }),
    moduleId: uuid("module_id").references(() => courseModules.id, { onDelete: "set null" }),
    date: date("date").notNull(),
    startTime: time("start_time"),
    endTime: time("end_time"),
    topic: text("topic"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("session_meetings_unique").on(t.sessionId, t.date, t.startTime)],
);

// ---------------------------------------------------------------- inscriptions & paiements
export const enrollments = pgTable(
  "enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => courseSessions.id, { onDelete: "restrict" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "restrict" }),
    status: enrollmentStatus("status").notNull().default("registered"),
    agreedPrice: money("agreed_price").notNull(),
    discount: money("discount").notNull().default(0),
    currency: text("currency").notNull().default("XOF"),
    paymentTerms: text("payment_terms"),
    notes: text("notes"),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("enrollments_student_session_unique").on(t.studentId, t.sessionId),
    index("enrollments_org_status_idx").on(t.organizationId, t.status),
    index("enrollments_session_idx").on(t.sessionId),
  ],
);

export const paymentSchedules = pgTable(
  "payment_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    enrollmentId: uuid("enrollment_id")
      .notNull()
      .references(() => enrollments.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    label: text("label").notNull(),
    dueDate: date("due_date").notNull(),
    amount: money("amount").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("payment_schedules_enrollment_idx").on(t.enrollmentId, t.position), index("payment_schedules_due_idx").on(t.organizationId, t.dueDate)],
);

/** Journal des paiements : jamais supprimé ni modifié — une erreur se corrige par annulation tracée. */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    enrollmentId: uuid("enrollment_id")
      .notNull()
      .references(() => enrollments.id, { onDelete: "restrict" }),
    amount: money("amount").notNull(),
    method: paymentMethod("method").notNull(),
    reference: text("reference"),
    paidAt: date("paid_at").notNull(),
    comment: text("comment"),
    status: paymentRecordStatus("status").notNull().default("recorded"),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    cancelledBy: uuid("cancelled_by").references(() => users.id, { onDelete: "set null" }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    createdAt: createdAt(),
  },
  (t) => [index("payments_enrollment_idx").on(t.enrollmentId), index("payments_org_date_idx").on(t.organizationId, t.paidAt)],
);

// ---------------------------------------------------------------- pédagogie
export const attendance = pgTable(
  "attendance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => sessionMeetings.id, { onDelete: "cascade" }),
    enrollmentId: uuid("enrollment_id")
      .notNull()
      .references(() => enrollments.id, { onDelete: "cascade" }),
    status: attendanceStatus("status").notNull(),
    note: text("note"),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("attendance_unique").on(t.meetingId, t.enrollmentId), index("attendance_enrollment_idx").on(t.enrollmentId)],
);

export type QuizQuestion = { id: string; question: string; options: string[]; answer: number; points?: number };

export const assessments = pgTable(
  "assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => courseSessions.id, { onDelete: "cascade" }),
    moduleId: uuid("module_id").references(() => courseModules.id, { onDelete: "set null" }),
    type: assessmentType("type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    durationMinutes: integer("duration_minutes"),
    maxScore: numeric("max_score", { precision: 7, scale: 2, mode: "number" }).notNull().default(20),
    passScore: numeric("pass_score", { precision: 7, scale: 2, mode: "number" }).notNull().default(10),
    date: date("date"),
    isFinalExam: boolean("is_final_exam").notNull().default(false),
    isPublished: boolean("is_published").notNull().default(true),
    questions: jsonb("questions").$type<QuizQuestion[]>(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("assessments_course_idx").on(t.courseId)],
);

export const assessmentResults = pgTable(
  "assessment_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    enrollmentId: uuid("enrollment_id")
      .notNull()
      .references(() => enrollments.id, { onDelete: "cascade" }),
    score: numeric("score", { precision: 7, scale: 2, mode: "number" }).notNull(),
    passed: boolean("passed").notNull(),
    feedback: text("feedback"),
    answers: jsonb("answers").$type<number[]>(),
    gradedBy: uuid("graded_by").references(() => users.id, { onDelete: "set null" }),
    gradedAt: timestamp("graded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("assessment_results_unique").on(t.assessmentId, t.enrollmentId), index("assessment_results_enrollment_idx").on(t.enrollmentId)],
);

/** Progression par module (table `progress` du cahier des charges). */
export const moduleProgress = pgTable(
  "progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    enrollmentId: uuid("enrollment_id")
      .notNull()
      .references(() => enrollments.id, { onDelete: "cascade" }),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => courseModules.id, { onDelete: "cascade" }),
    percent: integer("percent").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("progress_unique").on(t.enrollmentId, t.moduleId)],
);

export const materials = pgTable(
  "materials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    moduleId: uuid("module_id").references(() => courseModules.id, { onDelete: "set null" }),
    sessionId: uuid("session_id").references(() => courseSessions.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    kind: materialKind("kind").notNull(),
    storageKey: text("storage_key"),
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    url: text("url"),
    visibility: materialVisibility("visibility").notNull().default("students"),
    indexedChunks: integer("indexed_chunks").notNull().default(0),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("materials_course_idx").on(t.courseId)],
);

/** Morceaux de texte extraits des supports — recherche plein texte pour le RAG (§21). */
export const materialChunks = pgTable(
  "material_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    tsv: tsvector("tsv").generatedAlwaysAs(sql`to_tsvector('french', content)`),
  },
  (t) => [index("material_chunks_material_idx").on(t.materialId), index("material_chunks_tsv_idx").using("gin", t.tsv)],
);

// ---------------------------------------------------------------- certificats
export const certificates = pgTable(
  "certificates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    enrollmentId: uuid("enrollment_id")
      .notNull()
      .references(() => enrollments.id, { onDelete: "restrict" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "restrict" }),
    code: text("code").notNull().unique(),
    status: certificateStatus("status").notNull().default("issued"),
    // Instantané public (ce qui est affiché sur la page de vérification)
    studentName: text("student_name").notNull(),
    courseName: text("course_name").notNull(),
    organizationName: text("organization_name").notNull(),
    durationHours: integer("duration_hours"),
    completionDate: date("completion_date").notNull(),
    storageKey: text("storage_key"),
    issuedBy: uuid("issued_by").references(() => users.id, { onDelete: "set null" }),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokeReason: text("revoke_reason"),
  },
  (t) => [uniqueIndex("certificates_enrollment_unique").on(t.enrollmentId)],
);

export const certificateVerifications = pgTable("certificate_verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: orgId(),
  certificateId: uuid("certificate_id")
    .notNull()
    .references(() => certificates.id, { onDelete: "cascade" }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
  ipHash: text("ip_hash"),
});

// ---------------------------------------------------------------- CRM & communication
export const prospects = pgTable(
  "prospects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    phone: text("phone"),
    email: text("email"),
    desiredCourseId: uuid("desired_course_id").references(() => courses.id, { onDelete: "set null" }),
    desiredSessionId: uuid("desired_session_id").references(() => courseSessions.id, { onDelete: "set null" }),
    source: text("source"),
    status: prospectStatus("status").notNull().default("new"),
    lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
    nextAction: text("next_action"),
    nextActionAt: date("next_action_at"),
    notes: text("notes"),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    convertedStudentId: uuid("converted_student_id").references(() => students.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("prospects_org_status_idx").on(t.organizationId, t.status)],
);

export const messageTemplates = pgTable(
  "message_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("message_templates_unique").on(t.organizationId, t.key)],
);

export const communications = pgTable(
  "communications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    channel: text("channel").notNull().default("email"),
    templateKey: text("template_key"),
    studentId: uuid("student_id").references(() => students.id, { onDelete: "set null" }),
    toAddress: text("to_address").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: communicationStatus("status").notNull().default("queued"),
    error: text("error"),
    dedupeKey: text("dedupe_key"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("communications_dedupe_unique").on(t.organizationId, t.dedupeKey), index("communications_org_idx").on(t.organizationId, t.createdAt)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    /** null = visible par tous les administrateurs/gestionnaires du centre */
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    level: notificationLevel("level").notNull().default("info"),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    dedupeKey: text("dedupe_key"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("notifications_dedupe_unique").on(t.organizationId, t.dedupeKey), index("notifications_user_idx").on(t.organizationId, t.userId, t.readAt)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    title: text("title").notNull(),
    description: text("description"),
    studentId: uuid("student_id").references(() => students.id, { onDelete: "cascade" }),
    enrollmentId: uuid("enrollment_id").references(() => enrollments.id, { onDelete: "cascade" }),
    dueDate: date("due_date"),
    status: taskStatus("status").notNull().default("open"),
    source: text("source"),
    dedupeKey: text("dedupe_key"),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("tasks_dedupe_unique").on(t.organizationId, t.dedupeKey), index("tasks_org_status_idx").on(t.organizationId, t.status)],
);

// ---------------------------------------------------------------- IA
export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assistant: aiAssistant("assistant").notNull(),
    title: text("title").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ai_conversations_user_idx").on(t.userId, t.updatedAt)],
);

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant
    content: text("content").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("ai_messages_conv_idx").on(t.conversationId, t.createdAt)],
);

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    conversationId: uuid("conversation_id").references(() => aiConversations.id, { onDelete: "set null" }),
    assistant: aiAssistant("assistant").notNull(),
    requestType: text("request_type").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costMicroUsd: integer("cost_micro_usd").notNull().default(0),
    toolsUsed: text("tools_used").array(),
    status: text("status").notNull(), // ok | error | refused | quota_exceeded
    error: text("error"),
    latencyMs: integer("latency_ms"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_usage_org_date_idx").on(t.organizationId, t.createdAt)],
);

// ---------------------------------------------------------------- audit
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorLabel: text("actor_label"),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_org_date_idx").on(t.organizationId, t.createdAt)],
);

/** Tables soumises à l'isolation par centre (RLS). */
export const TENANT_TABLES = [
  "subscriptions",
  "org_counters",
  "instructors",
  "students",
  "courses",
  "course_modules",
  "course_recommendations",
  "course_sessions",
  "session_meetings",
  "enrollments",
  "payment_schedules",
  "payments",
  "attendance",
  "assessments",
  "assessment_results",
  "progress",
  "materials",
  "material_chunks",
  "certificates",
  "certificate_verifications",
  "prospects",
  "message_templates",
  "communications",
  "notifications",
  "tasks",
  "ai_conversations",
  "ai_messages",
  "ai_usage",
] as const;
