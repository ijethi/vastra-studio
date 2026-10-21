export type JobPayload =
  | { type: "analyze"; tenantId: string; garmentId: string }
  | { type: "generate"; tenantId: string; jobId: string }
  /** Sketch the nine scene stills of a reel and gate them against the garment. */
  | { type: "reel-stills"; tenantId: string; reelId: string }
  /** Animate the confirmed stills and assemble the reel. */
  | { type: "reel-animate"; tenantId: string; reelId: string };

export type JobHandler = (payload: JobPayload) => Promise<void>;

export interface JobQueue {
  readonly name: string;
  enqueue(payload: JobPayload): Promise<void>;
  /** Start consuming. Safe to call once per process. */
  start(handler: JobHandler, concurrency: number): Promise<void>;
  stop(): Promise<void>;
}
