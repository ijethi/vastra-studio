import type { JobHandler, JobPayload, JobQueue } from "./types";

/**
 * Single-process queue for development and small single-box deployments.
 * Durable state lives in the database (job rows), so a restart re-queues
 * anything unfinished; this class only orders and throttles the work.
 */
export class InProcessQueue implements JobQueue {
  readonly name = "in-process";
  private pending: JobPayload[] = [];
  private active = 0;
  private handler: JobHandler | null = null;
  private concurrency = 2;
  private stopped = false;

  async enqueue(payload: JobPayload): Promise<void> {
    this.pending.push(payload);
    this.pump();
  }

  async start(handler: JobHandler, concurrency: number): Promise<void> {
    this.handler = handler;
    this.concurrency = concurrency;
    this.stopped = false;
    this.pump();
  }

  async stop(): Promise<void> {
    this.stopped = true;
  }

  async ping(): Promise<void> {
    // Nothing to reach: the queue is this process.
  }

  private pump() {
    if (!this.handler || this.stopped) return;
    while (this.active < this.concurrency && this.pending.length > 0) {
      const payload = this.pending.shift()!;
      this.active++;
      this.handler(payload)
        .catch((err) => console.error(`[queue] ${payload.type} failed:`, err))
        .finally(() => {
          this.active--;
          this.pump();
        });
    }
  }
}
