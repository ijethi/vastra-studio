/**
 * Standalone worker process for Redis-backed deployments.
 *   REDIS_URL=redis://... pnpm worker
 */
import { startWorker } from "../src/lib/jobs/pipeline";

const concurrency = Number(process.env.WORKER_CONCURRENCY ?? "4");
startWorker(concurrency)
  .then(() => console.log(`[worker] consuming jobs with concurrency ${concurrency}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    const { getQueue } = await import("../src/lib/queue");
    await getQueue().stop();
    process.exit(0);
  });
}
