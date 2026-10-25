/**
 * Production configuration guard. Pure: takes the parsed environment and
 * returns the list of problems, so it can be unit-tested and so env.ts can
 * print every missing item at once instead of failing on the first.
 *
 * In production the app must not run on the embedded database, local disk
 * storage, the in-process queue, console-printed sign-in codes or a mock AI
 * provider. `ALLOW_MOCK_PROVIDERS=1` lifts only the provider rule (staging).
 */
export type GuardInput = {
  NODE_ENV: string;
  DATABASE_URL?: string;
  REDIS_URL?: string;
  STORAGE_DRIVER: string;
  S3_BUCKET?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  RESEND_API_KEY?: string;
  AUTH_SECRET: string;
  ALLOW_MOCK_PROVIDERS?: string;
  VISION_PROVIDER: string;
  PERSON_PROVIDER: string;
  STORYBOARD_PROVIDER: string;
  TRYON_PROVIDERS: string;
  VIDEO_PROVIDERS: string;
  SEGMENTER: string;
};

const set = (v: string | undefined) => Boolean(v && v.trim());
const list = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);

export function productionIssues(env: GuardInput): string[] {
  if (env.NODE_ENV !== "production") return [];
  const issues: string[] = [];

  if (!set(env.DATABASE_URL)) issues.push("DATABASE_URL is empty: production needs managed Postgres, not the embedded database.");
  if (env.STORAGE_DRIVER !== "s3") issues.push("STORAGE_DRIVER must be 's3' in production (local disk does not survive deploys).");
  for (const key of ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
    if (!set(env[key])) issues.push(`${key} is empty: required for S3/R2 storage.`);
  }
  if (!set(env.REDIS_URL)) issues.push("REDIS_URL is empty: production needs Redis for the job queue and rate limits.");
  if (!set(env.RESEND_API_KEY)) issues.push("RESEND_API_KEY is empty: sign-in codes cannot be printed to the console in production.");
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) issues.push("AUTH_SECRET must be at least 32 characters.");

  if (env.ALLOW_MOCK_PROVIDERS !== "1") {
    const mocks: string[] = [];
    if (env.VISION_PROVIDER === "mock") mocks.push("VISION_PROVIDER=mock (set ANTHROPIC_API_KEY)");
    if (env.PERSON_PROVIDER === "mock") mocks.push("PERSON_PROVIDER=mock (set GEMINI_API_KEY)");
    if (env.STORYBOARD_PROVIDER === "mock") mocks.push("STORYBOARD_PROVIDER=mock (set GEMINI_API_KEY)");
    if (list(env.TRYON_PROVIDERS).includes("mock")) mocks.push("TRYON_PROVIDERS includes mock (set GEMINI_API_KEY or the Google credentials)");
    if (list(env.VIDEO_PROVIDERS).includes("mock")) mocks.push("VIDEO_PROVIDERS includes mock (set FAL_KEY or GEMINI_API_KEY)");
    if (env.SEGMENTER === "mock") mocks.push("SEGMENTER=mock (use auto)");
    for (const m of mocks) issues.push(`Mock provider in production: ${m}. Set ALLOW_MOCK_PROVIDERS=1 only on a staging deploy.`);
  }
  return issues;
}

export function formatProductionIssues(issues: string[]): string {
  return ["Production configuration is incomplete. Fix these before starting:", ...issues.map((i) => `  - ${i}`), "See README.md, section \"Launch checklist\"."].join("\n");
}
