export type JobPayload =
  | { type: "analyze"; tenantId: string; garmentId: string }
  | { type: "generate"; tenantId: string; jobId: string };

export type JobHandler = (payload: JobPayload) => Promise<void>;

export interface JobQueue {
  readonly name: string;
  enqueue(payload: JobPayload): Promise<void>;
  /** Start consuming. Safe to call once per process. */
  start(handler: JobHandler, concurrency: number): Promise<void>;
  stop(): Promise<void>;
}
