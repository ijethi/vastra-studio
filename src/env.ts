import { z } from "zod";
import { formatProductionIssues, productionIssues } from "@/lib/config/production-guard";

/**
 * Server-side environment. Validated once at boot so a misconfigured deploy
 * fails loudly instead of at the first request. In production a second pass
 * (src/lib/config/production-guard.ts) refuses to start on the embedded
 * database, local storage, the in-process queue, console mail or a mock
 * provider, and lists everything that is missing in one message.
 */
const optional = z.string().optional().or(z.literal(""));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  PLATFORM_ADMIN_EMAILS: z.string().default(""),

  DATABASE_URL: optional,
  /** Connections per web or worker process; keep (instances x this) under the Postgres limit. */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  REDIS_URL: optional,

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  S3_ENDPOINT: optional,
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: optional,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,
  S3_PUBLIC_BASE_URL: optional,

  TRYON_PROVIDERS: z.string().default("mock"),
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
  /** Reel scene stills: mock (offline re-framing of the hero image) | gemini (Gemini image model). */
  STORYBOARD_PROVIDER: z.enum(["mock", "gemini"]).default("mock"),
  /** Reel clips, comma-separated in priority order: mock | kling | gemini. */
  VIDEO_PROVIDERS: z.string().default("mock"),
  FAL_KEY: optional,
  FAL_KLING_MODEL: z.string().default("fal-ai/kling-video/v3/standard/image-to-video"),
  GEMINI_VIDEO_MODEL: z.string().default("gemini-omni-1.1-flash"),
  /** Staging only: lets a production build run with mock providers. */
  ALLOW_MOCK_PROVIDERS: optional,

  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,

  RESEND_API_KEY: optional,
  EMAIL_FROM: z.string().default("Vastra Studio <no-reply@example.com>"),

  RAZORPAY_KEY_ID: optional,
  RAZORPAY_KEY_SECRET: optional,
  RAZORPAY_WEBHOOK_SECRET: optional,

  TRIAL_CREDITS: z.coerce.number().int().min(0).default(100),
  TENANT_JOBS_PER_HOUR: z.coerce.number().int().min(1).default(60),
  /** json (one object per line, for log drains) | pretty (development). Defaults to json in production. */
  LOG_FORMAT: z.enum(["json", "pretty"]).optional(),
});

export type Env = z.infer<typeof schema>;

/**
 * Provider selection follows the keys. A key on its own switches the matching
 * provider on; leaving a provider unset (or "auto") picks the best available.
 * An explicit value ("mock", "gemini", ...) always wins, so tests stay hermetic.
 */
function resolveAuto(raw: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...raw };
  const unset = (k: string) => !out[k] || out[k]!.trim() === "" || out[k]!.trim() === "auto";
  const has = (k: string) => Boolean(out[k] && out[k]!.trim());
  if (unset("VISION_PROVIDER")) out.VISION_PROVIDER = has("ANTHROPIC_API_KEY") ? "claude" : "mock";
  if (unset("PERSON_PROVIDER")) out.PERSON_PROVIDER = has("GEMINI_API_KEY") ? "gemini" : "mock";
  if (unset("STORYBOARD_PROVIDER")) out.STORYBOARD_PROVIDER = has("GEMINI_API_KEY") ? "gemini" : "mock";
  if (unset("TRYON_PROVIDERS")) {
    const list = [has("GEMINI_API_KEY") ? "gemini" : "", has("GOOGLE_CLOUD_PROJECT") && has("GOOGLE_APPLICATION_CREDENTIALS_JSON") ? "google" : ""].filter(Boolean);
    out.TRYON_PROVIDERS = list.length ? list.join(",") : "mock";
  }
  if (unset("VIDEO_PROVIDERS")) {
    const list = [has("FAL_KEY") ? "kling" : "", has("GEMINI_API_KEY") ? "gemini" : ""].filter(Boolean);
    out.VIDEO_PROVIDERS = list.length ? list.join(",") : "mock";
  }
  return out;
}

/**
 * `next build` runs with NODE_ENV=production but has no database, storage or
 * Redis to reach; the guard applies to the running server, not the compiler.
 */
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

function load(): Env {
  const parsed = schema.safeParse(resolveAuto(process.env));
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  if (!isBuildPhase) {
    const issues = productionIssues(parsed.data);
    if (issues.length) {
      const message = formatProductionIssues(issues);
      console.error(message);
      throw new Error(message);
    }
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

export type TryOnProviderName = "mock" | "gemini" | "google";

/** Try-on providers in priority order (primary first). */
export const tryOnProviderOrder = env.TRYON_PROVIDERS.split(",")
  .map((p) => p.trim())
  .filter((p): p is TryOnProviderName => p === "mock" || p === "gemini" || p === "google");

export type VideoProviderName = "mock" | "kling" | "gemini";

/** Video providers in priority order (primary first). */
export const videoProviderOrder = env.VIDEO_PROVIDERS.split(",")
  .map((p) => p.trim())
  .filter((p): p is VideoProviderName => p === "mock" || p === "kling" || p === "gemini");
