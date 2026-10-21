/**
 * Runs once per server start. In single-process mode (no REDIS_URL) the job
 * worker lives inside the web process; with Redis, run `pnpm worker` instead.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { env } = await import("@/env");
  if (env.REDIS_URL) return;
  const { startWorker } = await import("@/lib/jobs/pipeline");
  await startWorker(2);
}
