import { z } from "zod";

const schema = z.object({
  APP_ENV: z.enum(["development", "staging", "production", "test"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  VERIFY_URL: z.string().url().optional(),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z.enum(["true", "false"]).default("false"),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(12),
  APP_SECRET: z.string().min(32, "APP_SECRET doit contenir au moins 32 caractères"),
  CRON_SECRET: z.string().min(16).optional(),
  AI_PROVIDER: z.enum(["anthropic", "mock"]).default("mock"),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("claude-opus-5"),
  AI_EFFORT: z.enum(["low", "medium", "high"]).default("medium"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default("TRAINING OS AI <no-reply@trainingos.ai>"),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuration invalide :\n${issues}`);
  }
  const e = parsed.data;
  if (e.APP_ENV === "production") {
    if (!e.APP_URL.startsWith("https://")) throw new Error("APP_URL doit être en HTTPS en production");
    // TLS obligatoire vers la base, sauf réseau privé Docker/local (hôte « db », localhost)
    const dbHost = (() => {
      try {
        return new URL(e.DATABASE_URL).hostname;
      } catch {
        return "";
      }
    })();
    if (e.DATABASE_SSL !== "true" && !["db", "localhost", "127.0.0.1"].includes(dbHost)) throw new Error("DATABASE_SSL doit être activé en production pour une base distante");
    if (e.APP_SECRET.startsWith("change-me")) throw new Error("APP_SECRET par défaut interdit en production");
  }
  cached = e;
  return e;
}

export const isProd = () => env().APP_ENV === "production";
