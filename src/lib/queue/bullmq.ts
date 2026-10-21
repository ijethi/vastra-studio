import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import type { JobHandler, JobPayload, JobQueue } from "./types";

const QUEUE_NAME = "vastra-jobs";

/**
 * Redis-backed queue for multi-instance deployments. Web instances only
 * enqueue; dedicated worker processes (pnpm worker) consume.
 */
export class BullQueue implements JobQueue {
  readonly name = "bullmq";
  private connection: IORedis;
  private queue: Queue<JobPayload>;
  private worker: Worker<JobPayload> | null = null;

  constructor(redisUrl: string) {
    this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false });
    this.queue = new Queue<JobPayload>(QUEUE_NAME, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
  }

  async enqueue(payload: JobPayload): Promise<void> {
    const jobId = payload.type === "generate" ? `generate:${payload.jobId}` : `analyze:${payload.garmentId}`;
    await this.queue.add(payload.type, payload, { jobId, priority: payload.type === "analyze" ? 1 : 5 });
  }

  async start(handler: JobHandler, concurrency: number): Promise<void> {
    if (this.worker) return;
    this.worker = new Worker<JobPayload>(QUEUE_NAME, async (job: Job<JobPayload>) => handler(job.data), {
      connection: this.connection,
      concurrency,
      // Provider rate limits: at most N jobs per second across this worker.
      limiter: { max: 10, duration: 1000 },
    });
    this.worker.on("failed", (job, err) => console.error(`[bullmq] job ${job?.id} failed:`, err.message));
  }

  async stop(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
    this.connection.disconnect();
  }
}
