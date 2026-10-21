import { z } from "zod";

/**
 * Server-side environment. Validated once at boot so a misconfigured deploy
 * fails loudly instead of at the first request.
 */
const optional = z.string().optional().or(z.literal(""));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  PLATFORM_ADMIN_EMAILS: z.string().default(""),

  DATABASE_URL: optional,
  REDIS_URL: optional,

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  S3_ENDPOINT: optional,
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: optional,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,
  S3_PUBLIC_BASE_URL: optional,

  TRYON_PROVIDERS: z.string().default("mock"),
  FASHN_API_KEY: optional,
  GOOGLE_CLOUD_PROJECT: optional,
  GOOGLE_CLOUD_LOCATION: z.string().default("us-central1"),
  GOOGLE_APPLICATION_CREDENTIALS_JSON: optional,
  VISION_PROVIDER: z.enum(["mock", "claude"]).default("mock"),
  ANTHROPIC_API_KEY: optional,
  /** Garment cut-out: auto = bundled ONNX model when it loads, else the sharp heuristic. */
  SEGMENTER: z.enum(["auto", "imgly", "heuristic", "mock"]).default("auto"),
  /** Exact-garment mode generator for mannequin photos. */
  PERSON_PROVIDER: z.enum(["mock", "gemini"]).default("mock"),
  GEMINI_API_KEY: optional,
  GEMINI_IMAGE_MODEL: z.string().default("gemini-nano-banana-2.1"),

  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,

  RESEND_API_KEY: optional,
  EMAIL_FROM: z.string().default("Vastra Studio <no-reply@example.com>"),

  RAZORPAY_KEY_ID: optional,
  RAZORPAY_KEY_SECRET: optional,
  RAZORPAY_WEBHOOK_SECRET: optional,

  TRIAL_CREDITS: z.coerce.number().int().min(0).default(100),
  TENANT_JOBS_PER_HOUR: z.coerce.number().int().min(1).default(60),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

declare global {
   
  var __vastraEnv: Env | undefined;
}

export const env: Env = globalThis.__vastraEnv ?? (globalThis.__vastraEnv = load());

export const isProd = env.NODE_ENV === "production";

export const platformAdminEmails = new Set(
  env.PLATFORM_ADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

export type TryOnProviderName = "mock" | "fashn" | "google";

/** Try-on providers in priority order (primary first). */
export const tryOnProviderOrder = env.TRYON_PROVIDERS.split(",")
  .map((p) => p.trim())
  .filter((p): p is TryOnProviderName => p === "mock" || p === "fashn" || p === "google");
